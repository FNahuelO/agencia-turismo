import { randomInt } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { CONNECTOR_KINDS, type ConnectorKind, type QuoteItemKind, type SupplierKind } from "@/db/schema";
import { todayISO } from "@/lib/format";
import { priceFromMarkup } from "@/lib/quote-calc";
import { mockProvider } from "./mock";
import type { Offer, SearchQuery, TravelProvider } from "./types";

export type { Offer, SearchQuery } from "./types";

/** Para sumar un conector real: implementar TravelProvider y agregarlo acá. */
const PROVIDERS: TravelProvider[] = [mockProvider];

const SUPPLIER_KIND: Record<ConnectorKind, SupplierKind> = {
  hotel: "hotel",
  aereo: "aereo",
  actividad: "excursiones",
  traslado: "transporte",
};

const QUOTE_KIND: Record<ConnectorKind, QuoteItemKind> = {
  hotel: "hotel",
  aereo: "aereo",
  actividad: "excursion",
  traslado: "traslado",
};

export type ProviderState = {
  code: string;
  name: string;
  description: string;
  kinds: ConnectorKind[];
  credentialKeys: { key: string; label: string }[];
  enabled: boolean;
  markup: number;
  credentials: Record<string, string>;
};

function providerByCode(code: string) {
  const provider = PROVIDERS.find((p) => p.code === code);
  if (!provider) throw new Error("Proveedor desconocido");
  return provider;
}

async function configOf(code: string) {
  const row = await db.query.providerConfigs.findFirst({ where: eq(schema.providerConfigs.code, code) });
  if (row) return row;
  return { enabled: code === "mock", markup: 15, credentials: {} as Record<string, string> };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Null si todavía no hay búsqueda. */
export function parseSearch(sp: Record<string, string | string[] | undefined>): { error: string } | { query: SearchQuery } | null {
  const destination = typeof sp.destino === "string" ? sp.destino.trim() : "";
  if (!destination) return null;
  const kind = CONNECTOR_KINDS.includes(sp.tipo as ConnectorKind) ? (sp.tipo as ConnectorKind) : "hotel";
  const dateFrom = typeof sp.desde === "string" && ISO_DATE.test(sp.desde) ? sp.desde : "";
  const dateTo = typeof sp.hasta === "string" && ISO_DATE.test(sp.hasta) ? sp.hasta : "";
  const passengers = Math.min(40, Math.max(1, Number(sp.pax) || 2));
  const rooms = Math.min(10, Math.max(1, Number(sp.hab) || 1));
  if (destination.length < 3) return { error: "Escribí el destino" };
  if (!dateFrom || dateFrom < todayISO()) return { error: "La fecha tiene que ser hoy o posterior" };
  if (kind === "hotel" && (!dateTo || dateTo <= dateFrom)) return { error: "En hoteles, la salida tiene que ser posterior a la entrada" };
  const query: SearchQuery = { kind, destination, dateFrom, dateTo: dateTo || null, passengers, rooms };
  return { query };
}

export async function listProviders(): Promise<ProviderState[]> {
  return Promise.all(
    PROVIDERS.map(async (p) => {
      const cfg = await configOf(p.code);
      return {
        code: p.code,
        name: p.name,
        description: p.description,
        kinds: p.kinds,
        credentialKeys: p.credentialKeys,
        enabled: cfg.enabled,
        markup: cfg.markup,
        credentials: cfg.credentials,
      };
    }),
  );
}

export async function saveProviderConfig(input: { code: string; enabled: boolean; markup: number; credentials: Record<string, string> }) {
  providerByCode(input.code);
  await db
    .insert(schema.providerConfigs)
    .values(input)
    .onConflictDoUpdate({ target: schema.providerConfigs.code, set: { enabled: input.enabled, markup: input.markup, credentials: input.credentials } });
}

/** Busca en todos los conectores habilitados para ese rubro. El fallo de uno no corta a los demás. */
export async function searchOffers(query: SearchQuery) {
  const results: { code: string; name: string; offers: Offer[]; error?: string }[] = [];
  for (const provider of PROVIDERS) {
    if (!provider.kinds.includes(query.kind)) continue;
    const cfg = await configOf(provider.code);
    if (!cfg.enabled) continue;
    try {
      const offers = await provider.search(query, cfg.credentials);
      results.push({
        code: provider.code,
        name: provider.name,
        offers: offers.map((o) => ({ ...o, provider: provider.code, providerName: provider.name, price: priceFromMarkup(o.net, cfg.markup) })),
      });
    } catch (e) {
      results.push({ code: provider.code, name: provider.name, offers: [], error: (e as Error).message });
    }
  }
  return results;
}

async function pricedOffer(providerCode: string, offerId: string) {
  const provider = providerByCode(providerCode);
  const cfg = await configOf(provider.code);
  if (!cfg.enabled) throw new Error(`${provider.name} está desactivado`);
  const offer = await provider.quote(offerId, cfg.credentials);
  return { provider, cfg, offer, price: priceFromMarkup(offer.net, cfg.markup) };
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

async function orderCode() {
  for (let attempt = 0; attempt < 5; attempt++) {
    let code = "CN-";
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    const exists = await db.query.connectorOrders.findFirst({ where: eq(schema.connectorOrders.code, code), columns: { id: true } });
    if (!exists) return code;
  }
  throw new Error("No se pudo generar el código");
}

async function supplierFor(provider: TravelProvider, kind: ConnectorKind) {
  const key = provider.name.toLowerCase();
  const found = await db.query.suppliers.findFirst({ where: sql`lower(${schema.suppliers.name}) = ${key}`, columns: { id: true } });
  if (found) return found.id;
  const [row] = await db.insert(schema.suppliers).values({ name: provider.name, kind: SUPPLIER_KIND[kind], notes: "Creado desde el conector." }).returning({ id: schema.suppliers.id });
  return row.id;
}

export async function bookOffer(input: {
  provider: string;
  offerId: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  travelers: { fullName: string }[];
  createdBy: string;
}): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  let priced: Awaited<ReturnType<typeof pricedOffer>>;
  try {
    priced = await pricedOffer(input.provider, input.offerId);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const { provider, cfg, offer, price } = priced;
  const code = await orderCode();
  const base = {
    code,
    provider: provider.code,
    kind: offer.kind,
    offerId: offer.id,
    title: offer.title,
    detail: offer.detail,
    destination: offer.destination,
    dateFrom: offer.dateFrom,
    dateTo: offer.dateTo,
    passengers: offer.passengers,
    currency: offer.currency,
    net: offer.net,
    price,
    cancellation: offer.cancellation,
    contactName: input.contactName,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone,
    travelers: input.travelers,
    createdBy: input.createdBy,
  };

  let externalRef: string;
  try {
    ({ externalRef } = await provider.book(
      { offerId: offer.id, reference: code, contact: { name: input.contactName, email: input.contactEmail, phone: input.contactPhone }, travelers: input.travelers },
      cfg.credentials,
    ));
  } catch (e) {
    await db.insert(schema.connectorOrders).values({ ...base, status: "error", error: (e as Error).message });
    return { ok: false, error: (e as Error).message };
  }

  try {
    const supplierId = await supplierFor(provider, offer.kind);
    const [cost] = await db
      .insert(schema.supplierCosts)
      .values({
        supplierId,
        description: `${offer.title} (${code})`,
        amount: offer.net,
        currency: offer.currency,
        dueDate: offer.dateFrom,
        createdBy: input.createdBy,
      })
      .returning({ id: schema.supplierCosts.id });
    const [order] = await db
      .insert(schema.connectorOrders)
      .values({ ...base, status: "confirmada", externalRef, supplierCostId: cost.id })
      .returning({ id: schema.connectorOrders.id });
    return { ok: true, id: order.id };
  } catch (e) {
    await provider.cancel(externalRef, cfg.credentials).catch(() => {});
    return { ok: false, error: `La reserva no se pudo guardar y se canceló en el proveedor: ${(e as Error).message}` };
  }
}

/** Suma la tarifa como un servicio de la cotización, sin reservarla en el proveedor. */
export async function addOfferToQuote(quoteId: number, providerCode: string, offerId: string) {
  const quote = await db.query.quotes.findFirst({ where: eq(schema.quotes.id, quoteId), columns: { id: true, status: true, currency: true } });
  if (!quote) return { ok: false as const, error: "Cotización inexistente" };
  if (quote.status === "convertida") return { ok: false as const, error: "La cotización ya se convirtió en reserva" };
  let priced: Awaited<ReturnType<typeof pricedOffer>>;
  try {
    priced = await pricedOffer(providerCode, offerId);
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
  const { provider, offer, price } = priced;
  if (offer.currency !== quote.currency) return { ok: false as const, error: `La cotización está en ${quote.currency} y esta tarifa en ${offer.currency}` };
  const last = await db.query.quoteItems.findFirst({ where: eq(schema.quoteItems.quoteId, quoteId), orderBy: (i, { desc }) => desc(i.position) });
  await db.insert(schema.quoteItems).values({
    quoteId,
    position: (last?.position ?? 0) + 1,
    kind: QUOTE_KIND[offer.kind],
    description: offer.title,
    detail: `${offer.detail} ${offer.cancellation}`.trim(),
    supplier: provider.name,
    dateFrom: offer.dateFrom,
    dateTo: offer.dateTo,
    quantity: 1,
    unitCost: offer.net,
    unitPrice: price,
  });
  return { ok: true as const };
}

export async function cancelOrder(id: number) {
  const order = await db.query.connectorOrders.findFirst({ where: eq(schema.connectorOrders.id, id) });
  if (!order) return { ok: false as const, error: "La reserva no existe" };
  if (order.status !== "confirmada" || !order.externalRef) return { ok: false as const, error: "Esta reserva no se puede cancelar" };
  if (order.supplierCostId) {
    const [{ paid }] = await db
      .select({ paid: sql<number>`coalesce(sum(${schema.supplierPayments.amount}), 0)`.mapWith(Number) })
      .from(schema.supplierPayments)
      .where(eq(schema.supplierPayments.costId, order.supplierCostId));
    if (paid > 0) return { ok: false as const, error: "El costo de este servicio ya tiene pagos. Revertí los pagos antes de cancelar." };
  }
  const provider = providerByCode(order.provider);
  const cfg = await configOf(provider.code);
  try {
    await provider.cancel(order.externalRef, cfg.credentials);
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
  await db.update(schema.connectorOrders).set({ status: "cancelada" }).where(and(eq(schema.connectorOrders.id, id), eq(schema.connectorOrders.status, "confirmada")));
  if (order.supplierCostId) await db.update(schema.supplierCosts).set({ voided: true }).where(eq(schema.supplierCosts.id, order.supplierCostId));
  return { ok: true as const };
}
