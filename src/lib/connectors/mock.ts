import type { ConnectorKind, Currency } from "@/db/schema";
import { daysBetweenISO } from "@/lib/format";
import type { BookInput, ProviderOffer, SearchQuery, TravelProvider } from "./types";

/** Inventario fijo. Los precios suben en enero, febrero y julio. No sale nada de este proceso. */
type Item = {
  id: string;
  kind: ConnectorKind;
  /** Ciudades donde aparece, sin acentos. */
  where: string[];
  title: string;
  detail: string;
  /** night: por habitación y por noche. pax: por persona. vehicle: por vehículo (cada 4 pasajeros). */
  per: "night" | "pax" | "vehicle";
  net: number;
  currency: Currency;
  cancellation: string;
};

const ITEMS: Item[] = [
  { id: "brc-llao", kind: "hotel", where: ["bariloche"], title: "Hotel Llao Llao", detail: "Habitación doble con vista al lago y desayuno", per: "night", net: 180, currency: "USD", cancellation: "Sin cargo hasta 7 días antes del check-in" },
  { id: "brc-panamericano", kind: "hotel", where: ["bariloche"], title: "Hotel Panamericano Bariloche", detail: "Habitación estándar con desayuno", per: "night", net: 95, currency: "USD", cancellation: "Sin cargo hasta 48 h antes" },
  { id: "mdz-park", kind: "hotel", where: ["mendoza"], title: "Park Hyatt Mendoza", detail: "Habitación deluxe", per: "night", net: 210, currency: "USD", cancellation: "Sin cargo hasta 3 días antes" },
  { id: "igu-melia", kind: "hotel", where: ["iguazu", "iguazú"], title: "Gran Meliá Iguazú", detail: "Habitación con vista a la selva", per: "night", net: 240, currency: "USD", cancellation: "Sin cargo hasta 7 días antes" },
  { id: "sla-cafayate", kind: "hotel", where: ["salta", "cafayate"], title: "Patios de Cafayate", detail: "Habitación entre viñedos con desayuno", per: "night", net: 160, currency: "USD", cancellation: "Sin cargo hasta 5 días antes" },
  { id: "bue-alvear", kind: "hotel", where: ["buenos aires"], title: "Alvear Palace Hotel", detail: "Habitación superior", per: "night", net: 220, currency: "USD", cancellation: "Sin cargo hasta 24 h antes" },
  { id: "fly-brc", kind: "aereo", where: ["bariloche"], title: "Aéreo Buenos Aires – Bariloche", detail: "Ida y vuelta en clase económica, con equipaje de cabina", per: "pax", net: 140, currency: "USD", cancellation: "Tarifa no reembolsable. Cambios con penalidad." },
  { id: "fly-igu", kind: "aereo", where: ["iguazu", "iguazú"], title: "Aéreo Buenos Aires – Iguazú", detail: "Ida y vuelta en clase económica", per: "pax", net: 110, currency: "USD", cancellation: "Tarifa no reembolsable. Cambios con penalidad." },
  { id: "fly-ush", kind: "aereo", where: ["ushuaia"], title: "Aéreo Buenos Aires – Ushuaia", detail: "Ida y vuelta en clase económica", per: "pax", net: 190, currency: "USD", cancellation: "Tarifa no reembolsable. Cambios con penalidad." },
  { id: "fly-mdz", kind: "aereo", where: ["mendoza"], title: "Aéreo Buenos Aires – Mendoza", detail: "Ida y vuelta en clase económica", per: "pax", net: 90, currency: "USD", cancellation: "Cambios sin cargo hasta 72 h antes" },
  { id: "act-brc", kind: "actividad", where: ["bariloche"], title: "Navegación por el lago Nahuel Huapi", detail: "Medio día, salida desde Puerto Pañuelo", per: "pax", net: 45000, currency: "ARS", cancellation: "Sin cargo hasta 24 h antes" },
  { id: "act-igu", kind: "actividad", where: ["iguazu", "iguazú"], title: "Lado brasileño de las Cataratas", detail: "Excursión de día completo con traslados", per: "pax", net: 85000, currency: "ARS", cancellation: "Sin cargo hasta 48 h antes" },
  { id: "act-sla", kind: "actividad", where: ["salta"], title: "Tren a las Nubes", detail: "Día completo con almuerzo", per: "pax", net: 120000, currency: "ARS", cancellation: "Sin cargo hasta 7 días antes" },
  { id: "tr-brc", kind: "traslado", where: ["bariloche"], title: "Traslado aeropuerto – hotel en Bariloche", detail: "Servicio privado, ida", per: "vehicle", net: 35000, currency: "ARS", cancellation: "Sin cargo hasta 24 h antes" },
  { id: "tr-bue", kind: "traslado", where: ["buenos aires"], title: "Traslado Ezeiza – hotel", detail: "Servicio privado, ida", per: "vehicle", net: 42000, currency: "ARS", cancellation: "Sin cargo hasta 24 h antes" },
  { id: "tr-igu", kind: "traslado", where: ["iguazu", "iguazú"], title: "Traslado aeropuerto – hotel en Iguazú", detail: "Servicio privado, ida", per: "vehicle", net: 28000, currency: "ARS", cancellation: "Sin cargo hasta 24 h antes" },
];

function norm(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

function season(date: string) {
  const month = Number(date.slice(5, 7));
  return month === 1 || month === 2 || month === 7 ? 1.3 : 1;
}

function totalFor(item: Item, query: SearchQuery) {
  const factor = season(query.dateFrom);
  if (item.per === "night") {
    const nights = Math.max(1, query.dateTo ? daysBetweenISO(query.dateFrom, query.dateTo) : 1);
    return Math.round(item.net * nights * query.rooms * factor);
  }
  if (item.per === "vehicle") return Math.round(item.net * Math.ceil(query.passengers / 4) * factor);
  const roundTrip = item.kind === "aereo" && query.dateTo ? 1 : item.kind === "aereo" ? 0.6 : 1;
  return Math.round(item.net * query.passengers * factor * roundTrip);
}

function toOffer(item: Item, query: SearchQuery): ProviderOffer {
  const nights = item.per === "night" && query.dateTo ? daysBetweenISO(query.dateFrom, query.dateTo) : 0;
  return {
    id: [item.kind, item.id, query.dateFrom, query.dateTo ?? "", query.passengers, query.rooms].join("~"),
    kind: item.kind,
    title: item.title,
    detail: nights > 0 ? `${item.detail}. ${nights} ${nights === 1 ? "noche" : "noches"}, ${query.rooms} ${query.rooms === 1 ? "habitación" : "habitaciones"}.` : item.detail,
    destination: query.destination,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    passengers: query.passengers,
    currency: item.currency,
    net: totalFor(item, query),
    cancellation: item.cancellation,
  };
}

function parseOfferId(offerId: string): { item: Item; query: SearchQuery } {
  const [kind, id, dateFrom, dateTo, passengers, rooms] = offerId.split("~");
  const item = ITEMS.find((i) => i.kind === kind && i.id === id);
  if (!item || !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom ?? "")) throw new Error("La tarifa ya no está disponible");
  return {
    item,
    query: {
      kind: item.kind,
      destination: item.where[0],
      dateFrom,
      dateTo: dateTo || null,
      passengers: Math.max(1, Number(passengers) || 1),
      rooms: Math.max(1, Number(rooms) || 1),
    },
  };
}

export const mockProvider: TravelProvider = {
  code: "mock",
  name: "Simulado",
  description: "Hoteles, aéreos, excursiones y traslados de prueba. No reserva en ningún proveedor real: sirve para probar el circuito.",
  kinds: ["hotel", "aereo", "actividad", "traslado"],
  credentialKeys: [],
  async search(query) {
    if (norm(query.destination) === "error") throw new Error("El proveedor simulado rechazó la búsqueda");
    const q = norm(query.destination);
    return ITEMS.filter((i) => i.kind === query.kind && i.where.some((w) => q.includes(w) || w.includes(q))).map((i) => toOffer(i, query));
  },
  async quote(offerId) {
    const { item, query } = parseOfferId(offerId);
    return toOffer(item, query);
  },
  async book(input: BookInput) {
    parseOfferId(input.offerId);
    if (norm(input.contact.name) === "falla") throw new Error("El proveedor rechazó la reserva");
    return { externalRef: `MOCK-${input.reference}` };
  },
  async cancel(externalRef) {
    if (!externalRef.startsWith("MOCK-")) throw new Error("Localizador desconocido para el proveedor simulado");
    if (externalRef.endsWith("-FALLA")) throw new Error("El proveedor no permitió cancelar");
  },
};
