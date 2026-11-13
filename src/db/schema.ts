import { relations, sql } from "drizzle-orm";
import { boolean, doublePrecision, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const REGIONS = [
  "Norte",
  "Patagonia",
  "Cuyo",
  "Centro",
  "Litoral",
  "Buenos Aires",
  "Costa Atlántica",
  "Internacional",
] as const;
export type Region = (typeof REGIONS)[number];

export const TRANSPORTS = ["bus", "aereo"] as const;
export type Transport = (typeof TRANSPORTS)[number];

export const LEAD_STATUSES = ["nuevo", "contactado", "cotizado", "reservado", "perdido"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Paquete: salidas con fecha fija. El resto se reserva cualquier día habilitado, con cupo diario (hotel: por noche). */
export const PRODUCT_KINDS = ["paquete", "actividad", "traslado", "hotel"] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

export const CURRENCIES = ["ARS", "USD", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const FX_SOURCES = ["manual", "oficial", "blue", "bolsa", "tarjeta"] as const;
export type FxSource = (typeof FX_SOURCES)[number];

export const BOOKING_STATUSES = ["pendiente", "confirmada", "pagada", "cancelada", "vencida"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const QUOTE_STATUSES = ["borrador", "enviada", "aceptada", "rechazada", "convertida"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_ITEM_KINDS = ["paquete", "aereo", "hotel", "traslado", "excursion", "seguro", "otro"] as const;
export type QuoteItemKind = (typeof QUOTE_ITEM_KINDS)[number];

export const PAYMENT_METHODS = ["mercadopago", "transferencia", "efectivo"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ["pendiente", "en_revision", "aprobado", "rechazado", "reintegrado"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const BOOKING_EVENT_LEVELS = ["info", "alerta"] as const;
export type BookingEventLevel = (typeof BOOKING_EVENT_LEVELS)[number];

export type ItineraryDay = { title: string; text: string };

/** Traducciones por idioma (en, pt). Lo que falte se muestra en español. */
export type DestinationI18n = Partial<Record<"en" | "pt", { name?: string; summary?: string; description?: string }>>;
export type PackageI18n = Partial<
  Record<"en" | "pt", { title?: string; summary?: string; board?: string; schedule?: string; includes?: string[]; excludes?: string[]; itinerary?: ItineraryDay[] }>
>;

export const destinations = pgTable("destinations", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  region: text("region").$type<Region>().notNull(),
  province: text("province").notNull().default(""),
  summary: text("summary").notNull().default(""),
  description: text("description").notNull().default(""),
  image: text("image"),
  featured: boolean("featured").notNull().default(false),
  i18n: jsonb("i18n").$type<DestinationI18n>().notNull().default({}),
  ...timestamps,
});

export const policies = pgTable("policies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  depositPercent: integer("deposit_percent").notNull().default(30),
  depositHours: integer("deposit_hours").notNull().default(48),
  finalPaymentDays: integer("final_payment_days").notNull().default(10),
  adminFee: text("admin_fee").notNull().default(""),
  infantsMonths: integer("infants_months").notNull().default(36),
  singleSurcharge: integer("single_surcharge").notNull().default(0),
  shareMode: boolean("share_mode").notNull().default(true),
  extraNotes: jsonb("extra_notes").$type<string[]>().notNull().default([]),
  ...timestamps,
});

export const packages = pgTable(
  "packages",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    kind: text("kind").$type<ProductKind>().notNull().default("paquete"),
    destinationId: integer("destination_id")
      .notNull()
      .references(() => destinations.id, { onDelete: "restrict" }),
    policyId: integer("policy_id").references(() => policies.id, { onDelete: "set null" }),
    transport: text("transport").$type<Transport>().notNull().default("bus"),
    transportDetail: text("transport_detail").notNull().default(""),
    days: integer("days").notNull().default(1),
    nights: integer("nights").notNull().default(0),
    hotel: text("hotel").notNull().default(""),
    board: text("board").notNull().default(""),
    price: integer("price").notNull(),
    currency: text("currency").$type<Currency>().notNull().default("ARS"),
    summary: text("summary").notNull().default(""),
    includes: jsonb("includes").$type<string[]>().notNull().default([]),
    excludes: jsonb("excludes").$type<string[]>().notNull().default([]),
    itinerary: jsonb("itinerary").$type<ItineraryDay[]>().notNull().default([]),
    image: text("image"),
    video: text("video"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    published: boolean("published").notNull().default(true),
    featured: boolean("featured").notNull().default(false),
    legacyIds: jsonb("legacy_ids").$type<number[]>().notNull().default([]),
    i18n: jsonb("i18n").$type<PackageI18n>().notNull().default({}),
    /** Productos diarios: cupo por día (actividad: personas; traslado: vehículos; hotel: habitaciones por noche). */
    dailyCapacity: integer("daily_capacity").notNull().default(20),
    /** Traslado: pasajeros por vehículo. Hotel: huéspedes por habitación. */
    capacityPerUnit: integer("capacity_per_unit").notNull().default(4),
    /** Días de la semana habilitados (0 = domingo). */
    weekdays: jsonb("weekdays").$type<number[]>().notNull().default([0, 1, 2, 3, 4, 5, 6]),
    minNights: integer("min_nights").notNull().default(1),
    /** Horario, punto de encuentro o check-in/check-out. */
    schedule: text("schedule").notNull().default(""),
    ...timestamps,
  },
  (t) => [index("packages_destination_idx").on(t.destinationId), index("packages_kind_idx").on(t.kind)],
);

export const departures = pgTable(
  "departures",
  {
    id: serial("id").primaryKey(),
    packageId: integer("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    seatsTotal: integer("seats_total").notNull().default(45),
    seatsTaken: integer("seats_taken").notNull().default(0),
    priceOverride: integer("price_override"),
    cancelled: boolean("cancelled").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("departures_package_date_idx").on(t.packageId, t.date), index("departures_date_idx").on(t.date)],
);

export const leads = pgTable(
  "leads",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    packageId: integer("package_id").references(() => packages.id, { onDelete: "set null" }),
    departureId: integer("departure_id").references(() => departures.id, { onDelete: "set null" }),
    passengers: integer("passengers").notNull().default(1),
    message: text("message"),
    source: text("source").notNull().default("web"),
    status: text("status").$type<LeadStatus>().notNull().default("nuevo"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("leads_status_idx").on(t.status)],
);

export const bookings = pgTable(
  "bookings",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(),
    accessToken: text("access_token").notNull(),
    packageId: integer("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "restrict" }),
    departureId: integer("departure_id")
      .notNull()
      .references(() => departures.id, { onDelete: "restrict" }),
    status: text("status").$type<BookingStatus>().notNull().default("pendiente"),
    passengers: integer("passengers").notNull().default(1),
    infants: integer("infants").notNull().default(0),
    singleRoom: boolean("single_room").notNull().default(false),
    /** Lugares que ocupa por fecha cuando no son personas: vehículos (traslado) o habitaciones (hotel). Null = pasajeros. */
    units: integer("units"),
    /** Hotel: noches desde la fecha de la salida (check-in). 0 = una sola fecha. */
    nights: integer("nights").notNull().default(0),
    contactName: text("contact_name").notNull(),
    contactEmail: text("contact_email").notNull(),
    contactPhone: text("contact_phone").notNull(),
    contactDocument: text("contact_document").notNull().default(""),
    unitPrice: integer("unit_price").notNull(),
    total: integer("total").notNull(),
    depositAmount: integer("deposit_amount").notNull(),
    paidAmount: integer("paid_amount").notNull().default(0),
    currency: text("currency").$type<Currency>().notNull().default("ARS"),
    fxRate: doublePrecision("fx_rate"),
    paymentMethod: text("payment_method").$type<PaymentMethod>().notNull().default("transferencia"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    balanceDueDate: text("balance_due_date"),
    source: text("source").notNull().default("web"),
    /** Clave de API que creó la reserva (solo esa clave puede consultarla por la API). */
    apiKeyId: integer("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
    customerNotes: text("customer_notes"),
    /** Idioma en que reservó el cliente (es, en, pt): links, retorno de pagos y emails. */
    locale: text("locale").notNull().default("es"),
    internalNotes: text("internal_notes"),
    cancelReason: text("cancel_reason"),
    ...timestamps,
  },
  (t) => [
    index("bookings_status_idx").on(t.status),
    index("bookings_departure_idx").on(t.departureId),
  ],
);

export const bookingPassengers = pgTable(
  "booking_passengers",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    document: text("document").notNull().default(""),
    birthDate: text("birth_date"),
    infant: boolean("infant").notNull().default(false),
  },
  (t) => [index("booking_passengers_booking_idx").on(t.bookingId)],
);

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    method: text("method").$type<PaymentMethod>().notNull(),
    status: text("status").$type<PaymentStatus>().notNull().default("pendiente"),
    amount: integer("amount").notNull(),
    currency: text("currency").$type<Currency>().notNull().default("ARS"),
    chargedAmount: integer("charged_amount"),
    chargedCurrency: text("charged_currency").$type<Currency>(),
    fxRate: doublePrecision("fx_rate"),
    externalId: text("external_id").unique(),
    statusDetail: text("status_detail"),
    receipt: text("receipt"),
    reference: text("reference"),
    /** Cuándo se acreditó (entra a caja) y cuándo se devolvió (sale de caja). */
    paidAt: timestamp("paid_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("payments_booking_idx").on(t.bookingId), index("payments_status_idx").on(t.status)],
);

export const bookingEvents = pgTable(
  "booking_events",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    level: text("level").$type<BookingEventLevel>().notNull().default("info"),
    message: text("message").notNull(),
    author: text("author"),
    resolved: boolean("resolved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  },
  (t) => [index("booking_events_booking_idx").on(t.bookingId)],
);

/** Pesos argentinos por unidad de moneda. `rate` es la cotización base y `markup` el % que suma la agencia. */
export const exchangeRates = pgTable("exchange_rates", {
  currency: text("currency").$type<Exclude<Currency, "ARS">>().primaryKey(),
  source: text("source").$type<FxSource>().notNull().default("manual"),
  rate: doublePrecision("rate").notNull(),
  markup: doublePrecision("markup").notNull().default(0),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }),
  ...timestamps,
});

export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  author: text("author").notNull(),
  rating: integer("rating").notNull().default(5),
  text: text("text").notNull(),
  trip: text("trip"),
  published: boolean("published").notNull().default(true),
  source: text("source", { enum: ["manual", "google"] }).notNull().default("manual"),
  externalId: text("external_id"),
  authorPhoto: text("author_photo"),
  authorUrl: text("author_url"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  ...timestamps,
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<"admin" | "editor">().notNull().default("editor"),
  ...timestamps,
});

/** Cotización armada por la agencia. Los montos son enteros en `currency`; el vencimiento se calcula al leer con `validUntil`. */
export const quotes = pgTable(
  "quotes",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(),
    accessToken: text("access_token").notNull(),
    status: text("status").$type<QuoteStatus>().notNull().default("borrador"),
    title: text("title").notNull(),
    clientName: text("client_name").notNull(),
    clientEmail: text("client_email").notNull().default(""),
    clientPhone: text("client_phone").notNull().default(""),
    leadId: integer("lead_id").references(() => leads.id, { onDelete: "set null" }),
    packageId: integer("package_id").references(() => packages.id, { onDelete: "set null" }),
    departureId: integer("departure_id").references(() => departures.id, { onDelete: "set null" }),
    bookingId: integer("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    passengers: integer("passengers").notNull().default(2),
    travelDate: text("travel_date"),
    currency: text("currency").$type<Currency>().notNull().default("ARS"),
    validUntil: text("valid_until").notNull(),
    notes: text("notes").notNull().default(""),
    internalNotes: text("internal_notes").notNull().default(""),
    locale: text("locale").notNull().default("es"),
    createdBy: text("created_by").notNull().default(""),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("quotes_status_idx").on(t.status)],
);

export const quoteItems = pgTable(
  "quote_items",
  {
    id: serial("id").primaryKey(),
    quoteId: integer("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    kind: text("kind").$type<QuoteItemKind>().notNull().default("otro"),
    description: text("description").notNull(),
    detail: text("detail").notNull().default(""),
    /** Vacío = servicio propio; si no, el operador o proveedor que lo presta. */
    supplier: text("supplier").notNull().default(""),
    dateFrom: text("date_from"),
    dateTo: text("date_to"),
    quantity: integer("quantity").notNull().default(1),
    unitCost: integer("unit_cost").notNull().default(0),
    unitPrice: integer("unit_price").notNull(),
  },
  (t) => [index("quote_items_quote_idx").on(t.quoteId)],
);

export const SUPPLIER_KINDS = ["hotel", "transporte", "aereo", "operador", "excursiones", "asistencia", "guia", "otro"] as const;
export type SupplierKind = (typeof SUPPLIER_KINDS)[number];

/** Dónde está la plata: efectivo en la oficina, cuenta bancaria o saldo de Mercado Pago. */
export const CASH_ACCOUNTS = ["caja", "banco", "mercadopago"] as const;
export type CashAccount = (typeof CASH_ACCOUNTS)[number];

export const CASH_CATEGORIES = ["gasto", "sueldo", "alquiler", "impuesto", "comision", "publicidad", "aporte", "retiro", "otro"] as const;
export type CashCategory = (typeof CASH_CATEGORIES)[number];

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").$type<SupplierKind>().notNull().default("otro"),
  taxId: text("tax_id").notNull().default(""),
  contactName: text("contact_name").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  bankInfo: text("bank_info").notNull().default(""),
  notes: text("notes").notNull().default(""),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

/** Lo que se le debe a un proveedor (cuenta a pagar), opcionalmente imputado a una reserva o a una salida. */
export const supplierCosts = pgTable(
  "supplier_costs",
  {
    id: serial("id").primaryKey(),
    supplierId: integer("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    bookingId: integer("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    departureId: integer("departure_id").references(() => departures.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    amount: integer("amount").notNull(),
    currency: text("currency").$type<Currency>().notNull().default("ARS"),
    dueDate: text("due_date"),
    voided: boolean("voided").notNull().default(false),
    createdBy: text("created_by").notNull().default(""),
    ...timestamps,
  },
  (t) => [index("supplier_costs_supplier_idx").on(t.supplierId), index("supplier_costs_booking_idx").on(t.bookingId)],
);

export const supplierPayments = pgTable(
  "supplier_payments",
  {
    id: serial("id").primaryKey(),
    supplierId: integer("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    costId: integer("cost_id").references(() => supplierCosts.id, { onDelete: "set null" }),
    amount: integer("amount").notNull(),
    currency: text("currency").$type<Currency>().notNull().default("ARS"),
    account: text("account").$type<CashAccount>().notNull().default("banco"),
    date: text("date").notNull(),
    reference: text("reference").notNull().default(""),
    createdBy: text("created_by").notNull().default(""),
    ...timestamps,
  },
  (t) => [index("supplier_payments_supplier_idx").on(t.supplierId), index("supplier_payments_date_idx").on(t.date)],
);

/** Movimientos de caja cargados a mano (gastos, aportes, retiros). Los cobros y los pagos a proveedores salen de sus tablas. */
export const cashMovements = pgTable(
  "cash_movements",
  {
    id: serial("id").primaryKey(),
    date: text("date").notNull(),
    direction: text("direction").$type<"ingreso" | "egreso">().notNull(),
    category: text("category").$type<CashCategory>().notNull().default("otro"),
    account: text("account").$type<CashAccount>().notNull().default("caja"),
    amount: integer("amount").notNull(),
    currency: text("currency").$type<Currency>().notNull().default("ARS"),
    description: text("description").notNull().default(""),
    createdBy: text("created_by").notNull().default(""),
    ...timestamps,
  },
  (t) => [index("cash_movements_date_idx").on(t.date)],
);

export const EMAIL_KINDS = [
  "reserva_creada",
  "pago_recibido",
  "recordatorio_sena",
  "recordatorio_saldo",
  "reserva_vencida",
  "reserva_cancelada",
  "cotizacion",
  "aviso_reserva",
  "aviso_comprobante",
  "aviso_pago",
  "prueba",
] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];
export const EMAIL_STATUSES = ["pendiente", "enviado", "error", "omitido"] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

/** Registro de cada email. `dedupeKey` evita mandar dos veces el mismo aviso (por ejemplo, un recordatorio). */
export const emailLog = pgTable(
  "email_log",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").$type<EmailKind>().notNull(),
    to: text("to").notNull(),
    subject: text("subject").notNull(),
    html: text("html").notNull(),
    text: text("text").notNull().default(""),
    status: text("status").$type<EmailStatus>().notNull().default("pendiente"),
    error: text("error"),
    providerId: text("provider_id"),
    dedupeKey: text("dedupe_key").unique(),
    bookingId: integer("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    quoteId: integer("quote_id").references(() => quotes.id, { onDelete: "set null" }),
    attempts: integer("attempts").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("email_log_booking_idx").on(t.bookingId), index("email_log_created_idx").on(t.createdAt)],
);

export const CONNECTOR_KINDS = ["hotel", "aereo", "actividad", "traslado"] as const;
export type ConnectorKind = (typeof CONNECTOR_KINDS)[number];
export const CONNECTOR_STATUSES = ["confirmada", "cancelada", "error"] as const;
export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[number];

/** Proveedores externos habilitados y su margen. Las credenciales se guardan para los conectores reales. */
export const providerConfigs = pgTable("provider_configs", {
  code: text("code").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  /** Porcentaje que se suma al neto del proveedor. */
  markup: integer("markup").notNull().default(15),
  credentials: jsonb("credentials").$type<Record<string, string>>().notNull().default({}),
  ...timestamps,
});

/** Reservas hechas contra un conector. No ocupan cupo del catálogo propio. */
export const connectorOrders = pgTable(
  "connector_orders",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(),
    provider: text("provider").notNull(),
    kind: text("kind").$type<ConnectorKind>().notNull(),
    status: text("status").$type<ConnectorStatus>().notNull().default("confirmada"),
    externalRef: text("external_ref"),
    offerId: text("offer_id").notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    destination: text("destination").notNull().default(""),
    dateFrom: text("date_from"),
    dateTo: text("date_to"),
    passengers: integer("passengers").notNull().default(1),
    currency: text("currency").$type<Currency>().notNull().default("ARS"),
    /** Costo neto del proveedor. */
    net: integer("net").notNull(),
    /** Precio de venta, con el margen del conector. */
    price: integer("price").notNull(),
    cancellation: text("cancellation").notNull().default(""),
    contactName: text("contact_name").notNull(),
    contactEmail: text("contact_email").notNull().default(""),
    contactPhone: text("contact_phone").notNull().default(""),
    travelers: jsonb("travelers").$type<{ fullName: string }[]>().notNull().default([]),
    supplierCostId: integer("supplier_cost_id").references(() => supplierCosts.id, { onDelete: "set null" }),
    error: text("error"),
    createdBy: text("created_by").notNull().default(""),
    ...timestamps,
  },
  (t) => [index("connector_orders_created_idx").on(t.createdAt)],
);

export const API_SCOPES = ["catalog:read", "bookings:read", "bookings:write"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

/** Claves de la API pública (/api/v1). Solo se guarda el hash SHA-256; la clave completa se muestra una vez al crearla. */
export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  scopes: jsonb("scopes").$type<ApiScope[]>().notNull().default([]),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  requestCount: integer("request_count").notNull().default(0),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdBy: text("created_by").notNull().default(""),
  ...timestamps,
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const destinationsRelations = relations(destinations, ({ many }) => ({
  packages: many(packages),
}));

export const packagesRelations = relations(packages, ({ one, many }) => ({
  destination: one(destinations, { fields: [packages.destinationId], references: [destinations.id] }),
  policy: one(policies, { fields: [packages.policyId], references: [policies.id] }),
  departures: many(departures),
}));

export const departuresRelations = relations(departures, ({ one, many }) => ({
  package: one(packages, { fields: [departures.packageId], references: [packages.id] }),
  bookings: many(bookings),
}));

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  package: one(packages, { fields: [bookings.packageId], references: [packages.id] }),
  departure: one(departures, { fields: [bookings.departureId], references: [departures.id] }),
  passengerList: many(bookingPassengers),
  payments: many(payments),
  events: many(bookingEvents),
  costs: many(supplierCosts),
}));

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  costs: many(supplierCosts),
  payments: many(supplierPayments),
}));

export const supplierCostsRelations = relations(supplierCosts, ({ one, many }) => ({
  supplier: one(suppliers, { fields: [supplierCosts.supplierId], references: [suppliers.id] }),
  booking: one(bookings, { fields: [supplierCosts.bookingId], references: [bookings.id] }),
  departure: one(departures, { fields: [supplierCosts.departureId], references: [departures.id] }),
  payments: many(supplierPayments),
}));

export const supplierPaymentsRelations = relations(supplierPayments, ({ one }) => ({
  supplier: one(suppliers, { fields: [supplierPayments.supplierId], references: [suppliers.id] }),
  cost: one(supplierCosts, { fields: [supplierPayments.costId], references: [supplierCosts.id] }),
}));

export const bookingPassengersRelations = relations(bookingPassengers, ({ one }) => ({
  booking: one(bookings, { fields: [bookingPassengers.bookingId], references: [bookings.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  booking: one(bookings, { fields: [payments.bookingId], references: [bookings.id] }),
}));

export const bookingEventsRelations = relations(bookingEvents, ({ one }) => ({
  booking: one(bookings, { fields: [bookingEvents.bookingId], references: [bookings.id] }),
}));

export const leadsRelations = relations(leads, ({ one }) => ({
  package: one(packages, { fields: [leads.packageId], references: [packages.id] }),
  departure: one(departures, { fields: [leads.departureId], references: [departures.id] }),
}));

export const quotesRelations = relations(quotes, ({ one, many }) => ({
  items: many(quoteItems),
  lead: one(leads, { fields: [quotes.leadId], references: [leads.id] }),
  package: one(packages, { fields: [quotes.packageId], references: [packages.id] }),
  departure: one(departures, { fields: [quotes.departureId], references: [departures.id] }),
  booking: one(bookings, { fields: [quotes.bookingId], references: [bookings.id] }),
}));

export const quoteItemsRelations = relations(quoteItems, ({ one }) => ({
  quote: one(quotes, { fields: [quoteItems.quoteId], references: [quotes.id] }),
}));

export type Destination = typeof destinations.$inferSelect;
export type Package = typeof packages.$inferSelect;
export type Departure = typeof departures.$inferSelect;
export type Policy = typeof policies.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type BookingPassenger = typeof bookingPassengers.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type SupplierCost = typeof supplierCosts.$inferSelect;
export type SupplierPayment = typeof supplierPayments.$inferSelect;
export const connectorOrdersRelations = relations(connectorOrders, ({ one }) => ({
  cost: one(supplierCosts, { fields: [connectorOrders.supplierCostId], references: [supplierCosts.id] }),
}));

export const emailLogRelations = relations(emailLog, ({ one }) => ({
  booking: one(bookings, { fields: [emailLog.bookingId], references: [bookings.id] }),
  quote: one(quotes, { fields: [emailLog.quoteId], references: [quotes.id] }),
}));

export type CashMovement = typeof cashMovements.$inferSelect;
export type EmailLog = typeof emailLog.$inferSelect;
export type ProviderConfig = typeof providerConfigs.$inferSelect;
export type ConnectorOrder = typeof connectorOrders.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type BookingEvent = typeof bookingEvents.$inferSelect;
export type ExchangeRate = typeof exchangeRates.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type QuoteItem = typeof quoteItems.$inferSelect;
