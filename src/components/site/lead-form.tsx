"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { createLead, type LeadFormState } from "@/app/[locale]/actions";
import { trackEvent } from "./analytics";
import { useI18n } from "./i18n";
import { WhatsAppIcon } from "./icons";

type DepartureOption = { id: number; label: string; disabled?: boolean };

export function LeadForm({
  packageId,
  packageTitle,
  departures = [],
  compact = false,
}: {
  packageId?: number;
  packageTitle?: string;
  departures?: DepartureOption[];
  compact?: boolean;
}) {
  const { locale, t } = useI18n();
  const [state, action, pending] = useActionState<LeadFormState, FormData>(createLead, { status: "idle" });
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  const departureRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    const salida = new URLSearchParams(window.location.search).get("salida");
    const select = departureRef.current;
    if (salida && select && [...select.options].some((o) => o.value === salida && !o.disabled)) select.value = salida;
  }, []);

  useEffect(() => {
    if (state.status === "ok") trackEvent("generate_lead", { item: packageTitle ?? "general" });
  }, [state.status, packageTitle]);

  if (state.status === "ok") {
    return (
      <div className="rounded-lg bg-lake-soft p-6 text-center">
        <CheckCircle2 className="mx-auto size-10 text-lake" />
        <p className="mt-3 font-display text-xl font-bold">{t.lead.doneTitle}</p>
        <p className="mt-1 text-sm text-ink-soft">{t.lead.doneText}</p>
        <a href={state.whatsappUrl} target="_blank" rel="noopener" className="btn-whatsapp mt-5 w-full" data-event="whatsapp_click" data-location="lead_success">
          <WhatsAppIcon className="size-4" />
          {t.lead.continueWa}
        </a>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {packageId && <input type="hidden" name="packageId" value={packageId} />}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

      <div className={compact ? "space-y-4" : "grid gap-4 sm:grid-cols-2"}>
        <div>
          <label htmlFor="lead-name" className="label">{t.lead.name}</label>
          <input id="lead-name" name="name" required autoComplete="name" className="field" placeholder={t.lead.namePh} />
          {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
        </div>
        <div>
          <label htmlFor="lead-phone" className="label">{t.lead.phone}</label>
          <input id="lead-phone" name="phone" required type="tel" autoComplete="tel" inputMode="tel" className="field" placeholder="11 2345-6789" />
          {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone}</p>}
        </div>
      </div>

      <div className={compact ? "grid grid-cols-[1fr_6rem] gap-3" : "grid gap-4 sm:grid-cols-[1fr_8rem]"}>
        {departures.length > 0 ? (
          <div>
            <label htmlFor="lead-departure" className="label">{t.lead.departure}</label>
            <select id="lead-departure" ref={departureRef} name="departureId" className="field">
              <option value="">{t.lead.toBeDefined}</option>
              {departures.map((d) => (
                <option key={d.id} value={d.id} disabled={d.disabled}>{d.label}</option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label htmlFor="lead-email" className="label">{t.lead.email} <span className="font-normal text-ink-soft">{t.lead.optional}</span></label>
            <input id="lead-email" name="email" type="email" autoComplete="email" className="field" placeholder="tu@email.com" />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
          </div>
        )}
        <div>
          <label htmlFor="lead-pax" className="label">{t.lead.pax}</label>
          <input id="lead-pax" name="passengers" type="number" min={1} max={60} defaultValue={2} className="field" />
        </div>
      </div>

      <div>
        <label htmlFor="lead-message" className="label">{t.lead.message} <span className="font-normal text-ink-soft">{t.lead.optional}</span></label>
        <textarea id="lead-message" name="message" rows={compact ? 2 : 3} className="field resize-none" placeholder={t.lead.messagePh} />
      </div>

      {state.status === "error" && <p className="text-sm text-red-600">{state.message}</p>}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending && <Loader2 className="size-4 animate-spin" />}
        {pending ? t.lead.sending : t.lead.submit}
      </button>
      <p className="text-center text-xs text-ink-soft">{t.lead.footnote}</p>
    </form>
  );
}
