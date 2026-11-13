import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { EmailKind, EmailStatus } from "@/db/schema";

const { emailLog } = schema;

export type OutgoingEmail = {
  kind: EmailKind;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  bookingId?: number | null;
  quoteId?: number | null;
  /** Si ya se mandó un email con esta clave, no se repite (salvo que el anterior haya fallado). */
  dedupeKey?: string;
};

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export function emailFrom() {
  return process.env.EMAIL_FROM || "TravelAr Turismo <onboarding@resend.dev>";
}

async function postToResend(email: { to: string; subject: string; html: string; text: string; replyTo?: string }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: emailFrom(),
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(email.replyTo && { reply_to: email.replyTo }),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) throw new Error(body.message ?? `Resend respondió ${res.status}`);
  return body.id ?? null;
}

async function attempt(id: number, email: { to: string; subject: string; html: string; text: string; replyTo?: string }): Promise<EmailStatus> {
  if (!emailConfigured()) {
    await db.update(emailLog).set({ status: "omitido", error: "Falta RESEND_API_KEY" }).where(eq(emailLog.id, id));
    return "omitido";
  }
  const [row] = await db.select({ attempts: emailLog.attempts }).from(emailLog).where(eq(emailLog.id, id));
  try {
    const providerId = await postToResend(email);
    await db.update(emailLog).set({ status: "enviado", providerId, error: null, attempts: (row?.attempts ?? 0) + 1 }).where(eq(emailLog.id, id));
    return "enviado";
  } catch (e) {
    await db
      .update(emailLog)
      .set({ status: "error", error: (e as Error).message.slice(0, 500), attempts: (row?.attempts ?? 0) + 1 })
      .where(eq(emailLog.id, id));
    return "error";
  }
}

/** Registra y manda un email. Nunca tira: devuelve el estado final. */
export async function deliver(email: OutgoingEmail): Promise<EmailStatus> {
  try {
    if (!email.to.includes("@")) return "omitido";
    if (email.dedupeKey) {
      const prev = await db.query.emailLog.findFirst({ where: eq(emailLog.dedupeKey, email.dedupeKey) });
      if (prev && prev.status !== "error") return "omitido";
      if (prev) {
        await db.update(emailLog).set({ to: email.to, subject: email.subject, html: email.html, text: email.text, status: "pendiente" }).where(eq(emailLog.id, prev.id));
        return attempt(prev.id, email);
      }
    }
    const [row] = await db
      .insert(emailLog)
      .values({
        kind: email.kind,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        bookingId: email.bookingId ?? null,
        quoteId: email.quoteId ?? null,
        dedupeKey: email.dedupeKey ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: emailLog.id });
    if (!row) return "omitido";
    return attempt(row.id, email);
  } catch (e) {
    console.error("[email]", email.kind, e);
    return "error";
  }
}

/** Reintenta un email registrado con el mismo contenido. */
export async function retryEmail(id: number) {
  const row = await db.query.emailLog.findFirst({ where: eq(emailLog.id, id) });
  if (!row) return "error" as const;
  await db.update(emailLog).set({ status: "pendiente" }).where(eq(emailLog.id, id));
  return attempt(id, row);
}
