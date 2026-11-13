"use client";

import { Check, CheckCircle2, Copy, Loader2, TriangleAlert, Upload } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { uploadReceipt, type ReceiptFormState } from "@/app/[locale]/reservar/actions";
import type { Currency } from "@/db/schema";
import { CURRENCY_LABELS } from "@/lib/fx";
import { interpolate } from "@/lib/i18n/config";
import { trackEvent } from "./analytics";
import { useI18n } from "./i18n";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded-lg p-1.5 text-ink-soft hover:bg-sand hover:text-ink"
      aria-label={interpolate(t.reserva.copy, { label })}
    >
      {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
    </button>
  );
}

export function ReceiptForm({ code, token, suggestedAmount, currency }: { code: string; token: string; suggestedAmount: number; currency: Currency }) {
  const { locale, t } = useI18n();
  const [state, action] = useActionState<ReceiptFormState, FormData>(uploadReceipt, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="t" value={token} />
      <input type="hidden" name="locale" value={locale} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid grid-cols-[1fr_5.5rem] gap-2">
          <label>
            <span className="label">{t.reserva.amount}</span>
            <input name="amount" inputMode="numeric" defaultValue={suggestedAmount || ""} required className="field" />
          </label>
          <label>
            <span className="label">{t.reserva.currency}</span>
            <select name="currency" defaultValue={currency} className="field px-2">
              {(Object.keys(CURRENCY_LABELS) as Currency[]).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <label>
          <span className="label">{t.reserva.reference} <span className="font-normal text-ink-soft">{t.lead.optional}</span></span>
          <input name="reference" className="field" />
        </label>
      </div>
      <label className="block">
        <span className="label">{t.reserva.receipt}</span>
        <input name="receipt" type="file" accept="image/*,application/pdf" required className="field file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-3 file:py-1 file:text-xs file:font-semibold file:text-white" />
      </label>
      <UploadButton />
      {state?.error && (
        <p className="flex items-center gap-2 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700"><TriangleAlert className="size-4 shrink-0" />{state.error}</p>
      )}
      {state?.ok && (
        <p className="flex items-center gap-2 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><CheckCircle2 className="size-4 shrink-0" />{state.ok}</p>
      )}
    </form>
  );
}

function UploadButton() {
  const { pending } = useFormStatus();
  const { t } = useI18n();
  return (
    <button type="submit" disabled={pending} className="btn-dark">
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
      {pending ? t.reserva.uploading : t.reserva.send}
    </button>
  );
}

export function TrackPurchase({ code, value, currency }: { code: string; value: number; currency: string }) {
  useEffect(() => {
    trackEvent("purchase", { transaction_id: code, value, currency });
  }, [code, value, currency]);
  return null;
}
