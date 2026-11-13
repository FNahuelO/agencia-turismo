import type { ConnectorKind, Currency } from "@/db/schema";

export type SearchQuery = {
  kind: ConnectorKind;
  destination: string;
  dateFrom: string;
  dateTo: string | null;
  passengers: number;
  /** Habitaciones, solo para hoteles. */
  rooms: number;
};

/** Tarifa de un proveedor, a costo neto (sin el margen de la agencia). */
export type ProviderOffer = {
  id: string;
  kind: ConnectorKind;
  title: string;
  detail: string;
  destination: string;
  dateFrom: string;
  dateTo: string | null;
  passengers: number;
  currency: Currency;
  net: number;
  cancellation: string;
};

export type Offer = ProviderOffer & { provider: string; providerName: string; price: number };

export type BookInput = {
  offerId: string;
  /** Código interno de la orden, para cruzar con el proveedor. */
  reference: string;
  contact: { name: string; email: string; phone: string };
  travelers: { fullName: string }[];
};

/**
 * Contrato de un conector. `search` y `quote` no reservan; `book` confirma y `cancel` anula.
 * `config` son las credenciales cargadas en el admin (vacío en el simulado).
 */
export interface TravelProvider {
  code: string;
  name: string;
  description: string;
  kinds: ConnectorKind[];
  credentialKeys: { key: string; label: string }[];
  search(query: SearchQuery, config: Record<string, string>): Promise<ProviderOffer[]>;
  quote(offerId: string, config: Record<string, string>): Promise<ProviderOffer>;
  book(input: BookInput, config: Record<string, string>): Promise<{ externalRef: string }>;
  cancel(externalRef: string, config: Record<string, string>): Promise<void>;
}
