import type { ProductKind } from "@/db/schema";

export const DEFAULT_DEPOSIT_PERCENT = 30;
export const DEFAULT_DEPOSIT_HOURS = 48;

export type Quote = {
  unitPrice: number;
  total: number;
  depositAmount: number;
  depositPercent: number;
  singleSurcharge: number;
  /** Vehículos (traslado) o habitaciones (hotel); null cuando se cobra por persona. */
  units: number | null;
  nights: number;
};

/** Vehículos necesarios para un traslado. */
export function vehiclesFor(passengers: number, perVehicle: number) {
  return Math.max(1, Math.ceil(passengers / Math.max(1, perVehicle)));
}

/** Lugares que ocupa una reserva en cada fecha: vehículos, habitaciones o pasajeros. */
export function seatsPerDate(booking: { units: number | null; passengers: number }) {
  return booking.units ?? booking.passengers;
}

/**
 * Cotiza una reserva.
 * - Paquete y actividad: precio por persona (el recargo single solo aplica a paquetes con 1 pasajero).
 * - Traslado: precio por vehículo, con los vehículos que hagan falta según los pasajeros.
 * - Hotel: suma de las tarifas de cada noche por la cantidad de habitaciones; `unitPrice` es el promedio por noche.
 */
export function quoteBooking(opts: {
  pkg: { price: number; kind?: ProductKind; capacityPerUnit?: number };
  departure: { priceOverride: number | null };
  policy: { depositPercent: number; singleSurcharge: number } | null;
  passengers: number;
  singleRoom: boolean;
  /** Hotel: habitaciones. */
  units?: number;
  /** Hotel: tarifa de cada noche (la primera corresponde a `departure`). */
  nightPrices?: number[];
}): Quote {
  const kind = opts.pkg.kind ?? "paquete";
  const basePrice = opts.departure.priceOverride ?? opts.pkg.price;
  let unitPrice = basePrice;
  let total: number;
  let units: number | null = null;
  let nights = 0;
  let singleSurcharge = 0;

  if (kind === "hotel") {
    const prices = opts.nightPrices?.length ? opts.nightPrices : [basePrice];
    units = Math.max(1, opts.units ?? 1);
    nights = prices.length;
    const stay = prices.reduce((a, b) => a + b, 0);
    unitPrice = Math.round(stay / nights);
    total = stay * units;
  } else if (kind === "traslado") {
    units = vehiclesFor(opts.passengers, opts.pkg.capacityPerUnit ?? 4);
    total = basePrice * units;
  } else {
    const surchargePercent = kind === "paquete" && opts.singleRoom && opts.passengers === 1 ? (opts.policy?.singleSurcharge ?? 0) : 0;
    singleSurcharge = Math.round((basePrice * surchargePercent) / 100);
    total = basePrice * opts.passengers + singleSurcharge;
  }

  const depositPercent = opts.policy?.depositPercent ?? DEFAULT_DEPOSIT_PERCENT;
  const depositAmount = depositPercent >= 100 ? total : Math.round((total * depositPercent) / 100);
  return { unitPrice, total, depositAmount, depositPercent, singleSurcharge, units, nights };
}
