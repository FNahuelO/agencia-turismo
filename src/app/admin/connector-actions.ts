"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { addOfferToQuote, bookOffer, cancelOrder, saveProviderConfig } from "@/lib/connectors";
import type { FormState } from "./actions";

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

function refresh() {
  revalidatePath("/admin/conectores");
  revalidatePath("/admin/proveedores");
  revalidatePath("/admin/cotizaciones");
}

export async function saveProvider(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSession("admin");
  const code = str(fd, "code");
  const markup = Number(str(fd, "markup").replace(",", "."));
  if (!Number.isInteger(markup) || markup < 0 || markup > 200) return { error: "El margen tiene que ser un entero entre 0 y 200" };
  const credentials: Record<string, string> = {};
  for (const [key, value] of fd.entries()) {
    if (typeof key === "string" && key.startsWith("cred.") && typeof value === "string" && value.trim()) credentials[key.slice(5)] = value.trim();
  }
  try {
    await saveProviderConfig({ code, enabled: fd.get("enabled") === "1", markup, credentials });
  } catch (e) {
    return { error: (e as Error).message };
  }
  refresh();
  return { ok: "Conector guardado" };
}

const bookSchema = z.object({
  provider: z.string().min(1),
  offerId: z.string().min(1),
  contactName: z.string().min(3, "Ingresá el nombre del titular"),
  contactEmail: z.union([z.literal(""), z.email("Email inválido")]),
  contactPhone: z.string().max(40),
});

export async function bookFromProvider(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requireSession();
  const parsed = bookSchema.safeParse({
    provider: str(fd, "provider"),
    offerId: str(fd, "offerId"),
    contactName: str(fd, "contactName"),
    contactEmail: str(fd, "contactEmail").toLowerCase(),
    contactPhone: str(fd, "contactPhone"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!parsed.data.contactEmail && !parsed.data.contactPhone) return { error: "Cargá un email o un teléfono" };
  const travelers = str(fd, "travelers")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((fullName) => ({ fullName }));

  const result = await bookOffer({ ...parsed.data, travelers: travelers.length ? travelers : [{ fullName: parsed.data.contactName }], createdBy: session.name });
  if (!result.ok) return { error: result.error };
  refresh();
  redirect(`/admin/conectores/${result.id}`);
}

export async function quoteFromProvider(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSession();
  const quoteId = Number(fd.get("quoteId"));
  if (!quoteId) return { error: "Elegí la cotización" };
  const result = await addOfferToQuote(quoteId, str(fd, "provider"), str(fd, "offerId"));
  if (!result.ok) return { error: result.error };
  refresh();
  redirect(`/admin/cotizaciones/${quoteId}`);
}

export async function cancelConnectorOrder(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSession();
  const id = Number(fd.get("id"));
  const result = await cancelOrder(id);
  if (!result.ok) return { error: result.error };
  refresh();
  revalidatePath(`/admin/conectores/${id}`);
  return { ok: "Reserva cancelada en el proveedor" };
}
