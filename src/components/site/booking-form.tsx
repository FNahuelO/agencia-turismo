"use client";

import { CreditCard, Landmark, Loader2, Lock, Minus, Plus } from "lucide-react";
import { startTransition, useActionState, useState } from "react";
import { createBooking, type BookingFormState } from "@/app/[locale]/reservar/actions";
import type { Currency } from "@/db/schema";
import { addDaysISO, daysBetweenISO, formatLongDate, formatPrice, nightDates } from "@/lib/format";
import { quoteBooking } from "@/lib/pricing";
import { interpolate } from "@/lib/i18n/config";
import { useI18n } from "./i18n";

type DepartureOption = { id: number; label: string; price: number; priceOverride: number | null; seatsLeft: number };

/** Productos que se reservan cualquier día habilitado. `calendar`: { fecha: [precio, libres] } solo con días abiertos. */
export type DailyBooking = {
  kind: "actividad" | "traslado" | "hotel";
  calendar: Record<string, [number, number]>;
  first: string;
  last: string;
  capacityPerUnit: number;
  minNights: number;
  maxNights: number;
};

export function BookingForm({
  pkg,
  departures,
  initialDepartureId,
  policy,
  mercadoPago,
  arsRate,
  depositHours,
  terms,
  daily,
}: {
  pkg: { id: number; title: string; price: number; currency: Currency };
  daily?: DailyBooking;
  /** Pesos por unidad de la moneda del paquete; null si el paquete está en ARS. */
  arsRate: number | null;
  departures: DepartureOption[];
  initialDepartureId?: number;
  policy: { depositPercent: number; singleSurcharge: number; infantsMonths: number } | null;
  mercadoPago: boolean;
  depositHours: number;
  terms: string[];
}) {
  const { locale, t } = useI18n();
  const b = t.booking;
  const [state, action, pending] = useActionState<BookingFormState, FormData>(createBooking, { status: "idle" });
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  const [departureId, setDepartureId] = useState(initialDepartureId ?? departures.find((d) => d.seatsLeft > 0)?.id);
  const [passengers, setPassengers] = useState(2);
  const [infants, setInfants] = useState(0);
  const [singleRoom, setSingleRoom] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"mercadopago" | "transferencia">(mercadoPago ? "mercadopago" : "transferencia");
  const [payKind, setPayKind] = useState<"seña" | "total">("seña");

  const p = t.products;
  const firstOpen = daily ? Object.keys(daily.calendar).find((d) => daily.calendar[d][1] > 0) : undefined;
  const [date, setDate] = useState(firstOpen ?? daily?.first ?? "");
  const [checkOut, setCheckOut] = useState(firstOpen && daily ? addDaysISO(firstOpen, daily.minNights) : "");
  const [rooms, setRooms] = useState(1);

  const departure = departures.find((d) => d.id === departureId);
  let maxPax = Math.min(20, departure?.seatsLeft ?? 20);
  let quote = departure ? quoteBooking({ pkg, departure, policy, passengers, singleRoom }) : null;
  let dailyError: string | null = null;
  let maxRooms = 20;
  let selectedLabel = departure?.label;

  if (daily) {
    const nights = daily.kind === "hotel" ? daysBetweenISO(date, checkOut) : 0;
    const dates = daily.kind === "hotel" ? (nights > 0 ? nightDates(date, nights) : []) : date ? [date] : [];
    const slots = dates.map((d) => daily.calendar[d]);
    const left = slots.length && slots.every(Boolean) ? Math.min(...slots.map((x) => x[1])) : 0;
    if (!date) dailyError = p.invalidDate;
    else if (daily.kind === "hotel" && nights < daily.minNights) dailyError = interpolate(p.minNightsError, { n: daily.minNights });
    else if (daily.kind === "hotel" && nights > daily.maxNights) dailyError = interpolate(p.maxNightsError, { n: daily.maxNights });
    else if (left <= 0) dailyError = daily.kind === "hotel" ? p.nightsClosed : p.closed;

    maxRooms = Math.max(1, Math.min(20, left));
    maxPax =
      daily.kind === "actividad"
        ? Math.min(20, Math.max(1, left))
        : Math.min(20, daily.capacityPerUnit * (daily.kind === "hotel" ? Math.min(rooms, maxRooms) : Math.max(1, left)));
    quote = dailyError
      ? null
      : quoteBooking({
          pkg: { price: pkg.price, kind: daily.kind, capacityPerUnit: daily.capacityPerUnit },
          departure: { priceOverride: slots[0][0] },
          policy,
          passengers: Math.min(passengers, maxPax),
          singleRoom: false,
          units: Math.min(rooms, maxRooms),
          nightPrices: daily.kind === "hotel" ? slots.map((x) => x[0]) : undefined,
        });
    selectedLabel = date ? formatLongDate(date, locale) + (daily.kind === "hotel" && checkOut > date ? ` → ${formatLongDate(checkOut, locale)}` : "") : undefined;
  }
  const canSingle = !daily && passengers === 1 && (policy?.singleSurcharge ?? 0) > 0;
  const fmt = (n: number) => formatPrice(n, pkg.currency);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
      className="grid gap-8 lg:grid-cols-[1fr_360px]"
      noValidate
    >
      <input type="hidden" name="packageId" value={pkg.id} />
      <input type="hidden" name="locale" value={locale} />
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

      <div className="min-w-0 space-y-6">
        {daily ? (
          <Step n={1} title={daily.kind === "hotel" ? p.stepStay : p.stepDate}>
            <div className="grid gap-4 sm:grid-cols-3">
              <label>
                <span className="label">{daily.kind === "hotel" ? p.checkIn : p.date}</span>
                <input
                  type="date"
                  name="date"
                  value={date}
                  min={daily.first}
                  max={daily.last}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDate(v);
                    if (daily.kind === "hotel" && (!checkOut || daysBetweenISO(v, checkOut) < daily.minNights)) setCheckOut(addDaysISO(v, daily.minNights));
                  }}
                  className="field"
                />
              </label>
              {daily.kind === "hotel" && (
                <>
                  <label>
                    <span className="label">{p.checkOut}</span>
                    <input type="date" name="checkOut" value={checkOut} min={date ? addDaysISO(date, daily.minNights) : daily.first} max={addDaysISO(daily.last, daily.maxNights)} onChange={(e) => setCheckOut(e.target.value)} className="field" />
                  </label>
                  <Counter label={p.rooms} hint={interpolate(p.roomsHint, { n: daily.capacityPerUnit })} name="units" value={Math.min(rooms, maxRooms)} min={1} max={maxRooms} onChange={setRooms} />
                </>
              )}
            </div>
            {dailyError ? (
              <p className="mt-3 text-sm text-red-600">{dailyError}</p>
            ) : (
              quote && (
                <p className="mt-3 text-sm text-ink-soft">
                  {interpolate(p.available, { price: fmt(quote.unitPrice), unit: p.unit[daily.kind] })}
                  {daily.kind === "hotel" && ` · ${quote.nights === 1 ? p.night : interpolate(p.nights, { n: quote.nights })}`}
                </p>
              )
            )}
            {errors.date && <p className="mt-2 text-xs text-red-600">{errors.date}</p>}
          </Step>
        ) : (
        <Step n={1} title={b.step1}>
          <div className="grid gap-2 sm:grid-cols-2">
            {departures.map((d) => {
              const soldOut = d.seatsLeft === 0;
              return (
                <label
                  key={d.id}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-4 text-sm transition-colors ${
                    departureId === d.id ? "border-lake bg-lake-soft" : "border-ink/10 bg-white hover:border-ink/25"
                  } ${soldOut ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="departureId"
                      value={d.id}
                      checked={departureId === d.id}
                      disabled={soldOut}
                      onChange={() => {
                        setDepartureId(d.id);
                        setPassengers((p) => Math.min(p, Math.max(1, d.seatsLeft)));
                      }}
                      className="accent-lake"
                    />
                    <span>
                      <span className="block font-semibold capitalize">{d.label}</span>
                      <span className="text-xs text-ink-soft">{soldOut ? t.common.soldOut : d.seatsLeft <= 8 ? interpolate(t.common.seatsLeft, { n: d.seatsLeft }) : t.common.available}</span>
                    </span>
                  </span>
                  <span className="font-semibold">{fmt(d.price)}</span>
                </label>
              );
            })}
          </div>
          {errors.departureId && <p className="mt-2 text-xs text-red-600">{errors.departureId}</p>}
        </Step>
        )}

        <Step n={2} title={b.step2}>
          <div className="flex flex-wrap gap-6">
            <Counter
              label={daily?.kind === "hotel" ? p.guests : b.adults}
              hint={daily?.kind === "traslado" ? interpolate(p.perVehicle, { n: daily.capacityPerUnit }) : b.adultsHint}
              name="passengers"
              value={Math.min(passengers, maxPax)}
              min={1}
              max={maxPax}
              onChange={setPassengers}
            />
            <Counter
              label={b.infants}
              hint={interpolate(b.infantsHint, { n: policy?.infantsMonths ?? 36 })}
              name="infants"
              value={infants}
              min={0}
              max={Math.min(passengers, 4)}
              onChange={setInfants}
            />
          </div>
          {canSingle && (
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input type="checkbox" name="singleRoom" checked={singleRoom} onChange={(e) => setSingleRoom(e.target.checked)} className="accent-lake" />
              {interpolate(b.single, { n: policy?.singleSurcharge ?? 0 })}
            </label>
          )}

          <div className="mt-6 space-y-3">
            {Array.from({ length: Math.min(passengers, maxPax) }, (_, i) => (
              <div key={i} className="rounded-lg bg-sand/70 p-4">
                <p className="mb-3 text-sm font-semibold">{interpolate(b.paxN, { n: i + 1 })}{i === 0 ? b.holder : ""}</p>
                <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr]">
                  <input name="paxName" placeholder={b.fullName} autoComplete={i === 0 ? "name" : "off"} className="field" aria-label={`${b.fullName} · ${interpolate(b.paxN, { n: i + 1 })}`} />
                  <input name="paxDocument" placeholder={b.document} inputMode="numeric" className="field" aria-label={`${b.document} · ${interpolate(b.paxN, { n: i + 1 })}`} />
                  <input name="paxBirth" type="date" className="field" aria-label={`${b.birth} · ${interpolate(b.paxN, { n: i + 1 })}`} />
                </div>
                {errors[`pax-${i}`] && <p className="mt-2 text-xs text-red-600">{errors[`pax-${i}`]}</p>}
              </div>
            ))}
            {Array.from({ length: infants }, (_, i) => (
              <div key={`inf-${i}`} className="rounded-lg bg-sand/70 p-4">
                <p className="mb-3 text-sm font-semibold">{interpolate(b.infantN, { n: i + 1 })}</p>
                <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
                  <input name="infantName" placeholder={b.fullName} className="field" aria-label={`${b.fullName} · ${interpolate(b.infantN, { n: i + 1 })}`} />
                  <input name="infantBirth" type="date" className="field" aria-label={`${b.birth} · ${interpolate(b.infantN, { n: i + 1 })}`} />
                </div>
                {errors[`infant-${i}`] && <p className="mt-2 text-xs text-red-600">{errors[`infant-${i}`]}</p>}
              </div>
            ))}
          </div>
        </Step>

        <Step n={3} title={b.step3}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="contactName" label={b.contactName} autoComplete="name" error={errors.contactName} />
            <TextField name="contactDocument" label={b.document} inputMode="numeric" error={errors.contactDocument} />
            <TextField name="contactEmail" label={b.email} type="email" autoComplete="email" error={errors.contactEmail} hint={b.emailHint} />
            <TextField name="contactPhone" label={b.phone} type="tel" autoComplete="tel" error={errors.contactPhone} />
            <label className="sm:col-span-2">
              <span className="label">{b.notes} <span className="font-normal text-ink-soft">{t.lead.optional}</span></span>
              <textarea name="customerNotes" rows={2} className="field resize-none" placeholder={b.notesPh} />
            </label>
          </div>
        </Step>

        <Step n={4} title={b.step4}>
          <input type="hidden" name="paymentMethod" value={paymentMethod} />
          <input type="hidden" name="payKind" value={payKind} />
          <div className="grid gap-3 sm:grid-cols-2">
            {mercadoPago && (
              <PayOption
                active={paymentMethod === "mercadopago"}
                onClick={() => setPaymentMethod("mercadopago")}
                icon={CreditCard}
                title={b.mpTitle}
                text={b.mpText}
              />
            )}
            <PayOption
              active={paymentMethod === "transferencia"}
              onClick={() => setPaymentMethod("transferencia")}
              icon={Landmark}
              title={b.transferTitle}
              text={b.transferText}
            />
          </div>
          {paymentMethod === "mercadopago" && quote && quote.depositAmount < quote.total && (
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              {(["seña", "total"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPayKind(k)}
                  className={`rounded-full px-4 py-2 font-medium ${payKind === k ? "bg-ink text-white" : "bg-white ring-1 ring-ink/10"}`}
                >
                  {k === "seña" ? interpolate(b.payDeposit, { amount: fmt(quote.depositAmount) }) : interpolate(b.payTotal, { amount: fmt(quote.total) })}
                </button>
              ))}
            </div>
          )}
          {paymentMethod === "mercadopago" && arsRate && quote && (
            <p className="mt-4 rounded-lg bg-lake-soft p-4 text-sm">
              {interpolate(b.mpArs, { rate: formatPrice(Math.round(arsRate), "ARS"), currency: pkg.currency })}{" "}
              <strong>{formatPrice(Math.round((payKind === "total" ? quote.total : quote.depositAmount) * arsRate), "ARS")}</strong>.
            </p>
          )}
          {paymentMethod === "transferencia" && (
            <p className="mt-4 rounded-lg bg-lake-soft p-4 text-sm">
              {interpolate(b.transferDeadline, { hours: depositHours })}
            </p>
          )}
        </Step>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-xl bg-white p-6 shadow-xl shadow-ink/5 ring-1 ring-ink/5">
          <p className="eyebrow">{b.summary}</p>
          <p className="mt-1 font-display text-xl font-bold">{pkg.title}</p>
          {selectedLabel && <p className="text-sm capitalize text-ink-soft">{selectedLabel}</p>}

          {quote && (
            <dl className="mt-5 space-y-2 text-sm">
              {quote.nights > 0 ? (
                <Row label={`${quote.units} × ${quote.nights === 1 ? p.night : interpolate(p.nights, { n: quote.nights })}`} value={fmt(quote.total)} />
              ) : quote.units !== null ? (
                <Row label={`${quote.units === 1 ? p.vehicle : interpolate(p.vehicles, { n: quote.units })} × ${fmt(quote.unitPrice)}`} value={fmt(quote.total)} />
              ) : (
                <Row label={`${Math.min(passengers, maxPax)} × ${fmt(quote.unitPrice)}`} value={fmt(quote.unitPrice * Math.min(passengers, maxPax))} />
              )}
              {quote.singleSurcharge > 0 && <Row label={b.singleSurcharge} value={fmt(quote.singleSurcharge)} />}
              {infants > 0 && <Row label={interpolate(b.infantsCount, { n: infants })} value={b.infantsFree} />}
              <div className="my-3 h-px bg-ink/10" />
              <Row label={<strong>{b.total}</strong>} value={<strong className="font-display text-2xl text-lake">{fmt(quote.total)}</strong>} />
              {quote.depositAmount < quote.total && <Row label={interpolate(b.depositToConfirm, { n: quote.depositPercent })} value={fmt(quote.depositAmount)} />}
            </dl>
          )}

          <details className="mt-5 rounded-lg bg-sand/70 p-4 text-xs text-ink-soft">
            <summary className="cursor-pointer font-semibold text-ink">{t.paquete.conditions}</summary>
            <ul className="mt-2 list-disc space-y-1 pl-4">{terms.map((line) => <li key={line}>{line}</li>)}</ul>
          </details>
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input type="checkbox" name="acceptTerms" className="mt-0.5 accent-lake" />
            <span>{b.terms}</span>
          </label>
          {errors.acceptTerms && <p className="mt-1 text-xs text-red-600">{errors.acceptTerms}</p>}

          {state.status === "error" && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{state.message}</p>}

          <button type="submit" disabled={pending || (daily ? Boolean(dailyError) : !departure)} className="btn-primary mt-5 w-full">
            {pending && <Loader2 className="size-4 animate-spin" />}
            {pending ? b.booking : paymentMethod === "mercadopago" ? b.bookAndPay : b.confirm}
          </button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-ink-soft"><Lock className="size-3" /> {b.secure}</p>
        </div>
      </aside>
    </form>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-white p-6 ring-1 ring-ink/5 sm:p-7">
      <h2 className="mb-5 flex items-center gap-3 font-display text-xl font-bold">
        <span className="flex size-8 items-center justify-center rounded-full bg-ink text-sm text-white">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Counter({ label, hint, name, value, min, max, onChange }: { label: string; hint: string; name: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div>
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-xs text-ink-soft">{hint}</p>
      <div className="mt-2 flex items-center gap-3">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} className="flex size-9 items-center justify-center rounded-full ring-1 ring-ink/15 disabled:opacity-40" aria-label={`− ${label}`}>
          <Minus className="size-4" />
        </button>
        <span className="w-6 text-center font-display text-lg font-bold tabular-nums">{value}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} className="flex size-9 items-center justify-center rounded-full ring-1 ring-ink/15 disabled:opacity-40" aria-label={`+ ${label}`}>
          <Plus className="size-4" />
        </button>
        <input type="hidden" name={name} value={value} />
      </div>
    </div>
  );
}

function TextField({ name, label, error, hint, ...props }: { name: string; label: string; error?: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label>
      <span className="label">{label}</span>
      <input name={name} className="field" {...props} />
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}

function PayOption({ active, onClick, icon: Icon, title, text }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; title: string; text: string }) {
  return (
    <button type="button" onClick={onClick} className={`flex gap-3 rounded-lg border p-4 text-left transition-colors ${active ? "border-lake bg-lake-soft" : "border-ink/10 hover:border-ink/25"}`}>
      <Icon className="mt-0.5 size-5 shrink-0 text-lake" />
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="text-xs text-ink-soft">{text}</span>
      </span>
    </button>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-soft">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
