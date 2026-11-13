"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { todayISO } from "@/lib/format";
import { asLocale, localePath } from "@/lib/i18n/config";
import { quoteDisplayStatus } from "@/lib/quote-calc";
import { getQuoteForCustomer } from "@/lib/quotes";

export async function respondQuote(fd: FormData) {
  const locale = asLocale(fd.get("locale"));
  const code = String(fd.get("code") ?? "");
  const token = String(fd.get("t") ?? "");
  const quote = await getQuoteForCustomer(code, token);
  if (!quote) redirect(localePath(locale, "/"));

  const response = fd.get("response") === "accept" ? "aceptada" : "rechazada";
  const status = quoteDisplayStatus(quote, todayISO());
  if (status === "borrador" || status === "enviada") {
    await db.update(schema.quotes).set({ status: response, respondedAt: new Date() }).where(eq(schema.quotes.id, quote.id));
    revalidatePath("/admin/cotizaciones");
    revalidatePath(`/admin/cotizaciones/${quote.id}`);
  }
  redirect(localePath(locale, `/cotizacion/${quote.code}?t=${token}`));
}
