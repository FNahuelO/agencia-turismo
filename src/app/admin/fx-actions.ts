"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { FX_SOURCES } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { fetchRemoteRate, refreshExchangeRates, saveExchangeRate } from "@/lib/exchange-rates";
import type { FormState } from "./actions";

const rateSchema = z.object({
  currency: z.enum(["USD", "EUR"]),
  source: z.enum(FX_SOURCES),
  rate: z.coerce.number().positive("La cotización debe ser mayor a 0").max(1_000_000),
  markup: z.coerce.number().min(-50).max(100),
});

export async function saveRate(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireSession("admin");
  const parsed = rateSchema.safeParse({
    currency: fd.get("currency"),
    source: fd.get("source"),
    rate: String(fd.get("rate") ?? "").replace(",", "."),
    markup: String(fd.get("markup") ?? "0").replace(",", "."),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;

  let rate = data.rate;
  let fetchedAt: Date | null = null;
  if (data.source !== "manual") {
    if (data.currency === "EUR" && data.source !== "oficial") return { error: "Para euro solo está disponible la cotización oficial" };
    try {
      rate = await fetchRemoteRate(data.currency, data.source);
      fetchedAt = new Date();
    } catch (e) {
      return { error: (e as Error).message };
    }
  }
  await saveExchangeRate({ ...data, rate, fetchedAt });
  revalidatePath("/", "layout");
  return { ok: `${data.currency} guardado: $ ${rate.toLocaleString("es-AR")}${data.markup ? ` + ${data.markup}%` : ""}` };
}

export async function refreshRatesAction(_prev: FormState, _fd: FormData): Promise<FormState> {
  await requireSession();
  const { updated, errors } = await refreshExchangeRates();
  revalidatePath("/", "layout");
  if (errors.length) return { error: errors.join(" · ") };
  return { ok: updated.length ? `Actualizado: ${updated.join(", ")}` : "No hay monedas con actualización automática" };
}
