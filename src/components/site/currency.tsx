"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import type { Currency } from "@/db/schema";
import { formatPrice } from "@/lib/format";
import { convert, CURRENCY_LABELS, type Rates } from "@/lib/fx";
import { Coins } from "lucide-react";
import { FlagSelect, type FlagOption } from "./flag-select";
import { Flag, type FlagCode } from "./flags";
import { useI18n } from "./i18n";

/** "orig" = cada precio en la moneda en que está cargado el paquete. */
type Preference = Currency | "orig";

const STORAGE_KEY = "moneda";
const listeners = new Set<() => void>();

function readPreference(): Preference {
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "ARS" || v === "USD" || v === "EUR" ? v : "orig";
}

function setPreference(value: Preference) {
  window.localStorage.setItem(STORAGE_KEY, value);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function usePreference() {
  return useSyncExternalStore(subscribe, readPreference, () => "orig" as Preference);
}

const RatesContext = createContext<Rates | null>(null);

export function CurrencyProvider({ rates, children }: { rates: Rates; children: React.ReactNode }) {
  return <RatesContext.Provider value={rates}>{children}</RatesContext.Provider>;
}

export function useDisplayPrice() {
  const rates = useContext(RatesContext);
  const pref = usePreference();
  return (amount: number, currency: Currency) => {
    if (!rates || pref === "orig" || pref === currency) return formatPrice(amount, currency);
    return formatPrice(convert(amount, currency, pref, rates), pref);
  };
}

/** Precio que respeta la moneda elegida por el visitante. Se renderiza en la moneda original en el servidor. */
export function Price({ amount, currency }: { amount: number; currency: Currency }) {
  const display = useDisplayPrice();
  return <>{display(amount, currency)}</>;
}

const CURRENCY_FLAG: Record<Currency, FlagCode> = { ARS: "ar", USD: "us", EUR: "eu" };

export function CurrencySwitcher({ className = "" }: { className?: string }) {
  const pref = usePreference();
  const { t } = useI18n();
  const options: FlagOption<Preference>[] = [
    {
      value: "orig",
      short: "$",
      label: t.currency.original,
      icon: (
        <span className="grid h-4 w-6 shrink-0 place-items-center rounded-[3px] bg-lake/10 text-lake">
          <Coins className="size-3.5" />
        </span>
      ),
    },
    ...(Object.keys(CURRENCY_LABELS) as Currency[]).map((c) => ({
      value: c,
      short: c,
      label: CURRENCY_LABELS[c],
      icon: <Flag code={CURRENCY_FLAG[c]} />,
    })),
  ];
  return <FlagSelect value={pref} options={options} onChange={setPreference} ariaLabel={t.currency.label} className={className} />;
}
