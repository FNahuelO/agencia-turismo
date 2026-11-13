"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { retryEmail } from "@/lib/email/send";
import { sendTestEmail } from "@/lib/notifications";
import type { FormState } from "./actions";

export async function sendTest(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSession("admin");
  const to = z.email().safeParse(String(fd.get("to") ?? "").trim());
  if (!to.success) return { error: "Email inválido" };
  const status = await sendTestEmail(to.data);
  revalidatePath("/admin/emails");
  if (status === "enviado") return { ok: `Enviado a ${to.data}` };
  if (status === "omitido") return { error: "No se envió: falta RESEND_API_KEY en las variables de entorno" };
  return { error: "Resend rechazó el envío: el detalle quedó en la tabla" };
}

export async function retry(fd: FormData) {
  await requireSession();
  await retryEmail(Number(fd.get("id")));
  revalidatePath("/admin/emails");
}
