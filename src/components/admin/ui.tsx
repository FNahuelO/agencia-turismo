import type { BookingStatus, CashCategory, ConnectorKind, ConnectorStatus, EmailKind, EmailStatus, LeadStatus, PaymentStatus, ProductKind, QuoteItemKind, SupplierKind } from "@/db/schema";
import { PageHelp } from "./page-help";
import type { QuoteDisplayStatus } from "@/lib/quote-calc";

export const BOOKING_STATUS_META: Record<BookingStatus, { label: string; className: string }> = {
  pendiente: { label: "Pendiente", className: "bg-sun/20 text-ink" },
  confirmada: { label: "Confirmada", className: "bg-sky-100 text-sky-800" },
  pagada: { label: "Pagada", className: "bg-emerald-100 text-emerald-800" },
  cancelada: { label: "Cancelada", className: "bg-ink/5 text-ink-soft" },
  vencida: { label: "Vencida", className: "bg-red-50 text-red-700" },
};

export const PAYMENT_STATUS_META: Record<PaymentStatus, { label: string; className: string }> = {
  pendiente: { label: "Pendiente", className: "bg-sun/20 text-ink" },
  en_revision: { label: "A revisar", className: "bg-violet-100 text-violet-800" },
  aprobado: { label: "Aprobado", className: "bg-emerald-100 text-emerald-800" },
  rechazado: { label: "Rechazado", className: "bg-red-50 text-red-700" },
  reintegrado: { label: "Reintegrado", className: "bg-ink/5 text-ink-soft" },
};

export const QUOTE_STATUS_META: Record<QuoteDisplayStatus, { label: string; className: string }> = {
  borrador: { label: "Borrador", className: "bg-ink/5 text-ink-soft" },
  enviada: { label: "Enviada", className: "bg-sky-100 text-sky-800" },
  aceptada: { label: "Aceptada", className: "bg-emerald-100 text-emerald-800" },
  rechazada: { label: "Rechazada", className: "bg-red-50 text-red-700" },
  vencida: { label: "Vencida", className: "bg-sun/20 text-ink" },
  convertida: { label: "Reservada", className: "bg-violet-100 text-violet-800" },
};

export const QUOTE_ITEM_KIND_LABELS: Record<QuoteItemKind, string> = {
  paquete: "Paquete",
  aereo: "Aéreo",
  hotel: "Alojamiento",
  traslado: "Traslado",
  excursion: "Excursión",
  seguro: "Asistencia al viajero",
  otro: "Otro",
};

export const PRODUCT_KIND_META: Record<ProductKind, { label: string; plural: string; unit: string; capacity: string; perUnit: string }> = {
  paquete: { label: "Paquete", plural: "Paquetes", unit: "por persona", capacity: "", perUnit: "" },
  actividad: { label: "Excursión", plural: "Excursiones", unit: "por persona", capacity: "Cupo diario (personas)", perUnit: "" },
  traslado: { label: "Traslado", plural: "Traslados", unit: "por vehículo", capacity: "Vehículos por día", perUnit: "Pasajeros por vehículo" },
  hotel: { label: "Hotel", plural: "Hoteles", unit: "por noche y habitación", capacity: "Habitaciones por noche", perUnit: "Huéspedes por habitación" },
};

export const EMAIL_STATUS_META: Record<EmailStatus, { label: string; className: string }> = {
  pendiente: { label: "Pendiente", className: "bg-amber-100 text-amber-800" },
  enviado: { label: "Enviado", className: "bg-emerald-100 text-emerald-800" },
  error: { label: "Error", className: "bg-red-100 text-red-700" },
  omitido: { label: "No enviado", className: "bg-ink/5 text-ink-soft" },
};

export const EMAIL_KIND_LABELS: Record<EmailKind, string> = {
  reserva_creada: "Reserva recibida",
  pago_recibido: "Pago acreditado",
  recordatorio_sena: "Recordatorio de seña",
  recordatorio_saldo: "Recordatorio de saldo",
  reserva_vencida: "Reserva vencida",
  reserva_cancelada: "Reserva cancelada",
  cotizacion: "Cotización",
  aviso_reserva: "Aviso: reserva nueva",
  aviso_comprobante: "Aviso: comprobante",
  aviso_pago: "Aviso: pago Mercado Pago",
  prueba: "Prueba",
};

export const CONNECTOR_KIND_LABELS: Record<ConnectorKind, string> = {
  hotel: "Hotel",
  aereo: "Aéreo",
  actividad: "Excursión",
  traslado: "Traslado",
};

export const CONNECTOR_STATUS_META: Record<ConnectorStatus, { label: string; className: string }> = {
  confirmada: { label: "Confirmada", className: "bg-emerald-100 text-emerald-800" },
  cancelada: { label: "Cancelada", className: "bg-ink/5 text-ink-soft" },
  error: { label: "Error", className: "bg-red-100 text-red-700" },
};

export const SUPPLIER_KIND_LABELS: Record<SupplierKind, string> = {
  hotel: "Hotel",
  transporte: "Transporte",
  aereo: "Aerolínea / consolidador",
  operador: "Operador mayorista",
  excursiones: "Excursiones",
  asistencia: "Asistencia al viajero",
  guia: "Guía / coordinador",
  otro: "Otro",
};

export const CASH_CATEGORY_LABELS: Record<CashCategory, string> = {
  gasto: "Gasto general",
  sueldo: "Sueldos",
  alquiler: "Alquiler",
  impuesto: "Impuestos",
  comision: "Comisiones",
  publicidad: "Publicidad",
  aporte: "Aporte de socios",
  retiro: "Retiro de socios",
  otro: "Otro",
};

export function Badge({ meta }: { meta: { label: string; className: string } }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${meta.className}`}>{meta.label}</span>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-2xl font-bold break-words sm:text-3xl">{title}</h1>
          <PageHelp />
        </div>
        {description && <p className="mt-1 text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = "", title, actions }: { children: React.ReactNode; className?: string; title?: string; actions?: React.ReactNode }) {
  return (
    <section className={`min-w-0 rounded-2xl bg-white p-4 ring-1 ring-ink/5 sm:p-6 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="font-display text-lg font-bold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}

export const LEAD_STATUS_META: Record<LeadStatus, { label: string; className: string }> = {
  nuevo: { label: "Nuevo", className: "bg-sun/20 text-ink" },
  contactado: { label: "Contactado", className: "bg-sky-100 text-sky-800" },
  cotizado: { label: "Cotizado", className: "bg-violet-100 text-violet-800" },
  reservado: { label: "Reservado", className: "bg-emerald-100 text-emerald-800" },
  perdido: { label: "Perdido", className: "bg-ink/5 text-ink-soft" },
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  const meta = LEAD_STATUS_META[status];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.className}`}>{meta.label}</span>;
}

export function OccupancyBar({ taken, total }: { taken: number; total: number }) {
  const pct = total ? Math.round((taken / total) * 100) : 0;
  const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-sun" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-ink/10">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-ink-soft tabular-nums">{taken}/{total}</span>
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-ink/15 p-10 text-center text-ink-soft">{children}</div>;
}
