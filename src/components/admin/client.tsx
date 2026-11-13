"use client";

import { Check, CheckCircle2, Copy, Loader2, Search, Star, TriangleAlert, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { findGooglePlace, selectGooglePlace, type FormState } from "@/app/admin/actions";

export function SubmitButton({ children, className = "btn-dark", pendingText }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
}: {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  const [seen, setSeen] = useState(state);
  const [round, setRound] = useState(0);
  if (state !== seen) {
    setSeen(state);
    setRound(round + 1);
  }
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state?.error && <FormAlert key={`e${round}`} tone="error" message={state.error} />}
      {state?.ok && <FormAlert key={`o${round}`} tone="ok" message={state.ok} />}
    </form>
  );
}

const ALERT_TONES = {
  error: {
    title: "No se pudo guardar",
    Icon: TriangleAlert,
    box: "border-red-200 bg-red-50/80 text-red-800",
    icon: "bg-red-100 text-red-600",
    bar: "bg-red-500",
  },
  ok: {
    title: "Listo",
    Icon: CheckCircle2,
    box: "border-emerald-200 bg-emerald-50/80 text-emerald-800",
    icon: "bg-emerald-100 text-emerald-600",
    bar: "bg-emerald-500",
  },
} as const;

export function FormAlert({
  tone,
  message,
  title,
  className = "mt-4",
}: {
  tone: "error" | "ok";
  message: string;
  title?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const t = ALERT_TONES[tone];

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (tone !== "ok") return;
    const id = setTimeout(() => setOpen(false), 6000);
    return () => clearTimeout(id);
  }, [tone]);

  if (!open) return null;

  const sep = tone === "error" ? message.indexOf(": ") : -1;
  const field = sep > 0 && sep < 60 ? message.slice(0, sep) : null;
  const text = field ? message.slice(sep + 2) : message;

  return (
    <div
      ref={ref}
      role={tone === "error" ? "alert" : "status"}
      className={`form-alert relative flex items-start gap-3 overflow-hidden rounded-xl border py-3 pl-4 pr-10 text-sm shadow-sm ${t.box} ${className}`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${t.bar}`} />
      <span className={`grid size-8 shrink-0 place-items-center rounded-full ${t.icon}`}>
        <t.Icon className="size-4" />
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="font-semibold">{title ?? t.title}</p>
        <p className="mt-0.5 leading-relaxed opacity-90">
          {field && <span className="mr-1 rounded bg-white/70 px-1.5 py-0.5 text-xs font-semibold">{field}</span>}
          {text}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Cerrar aviso"
        className="absolute right-2 top-2 rounded-lg p-1.5 opacity-60 transition hover:bg-white/60 hover:opacity-100"
      >
        <X className="size-4" />
      </button>
      {tone === "ok" && <span className={`form-alert-timer absolute bottom-0 left-0 h-0.5 ${t.bar}`} />}
    </div>
  );
}

export function GooglePlaceFinder({ defaultQuery, currentPlaceId }: { defaultQuery: string; currentPlaceId: string }) {
  const [state, action] = useActionState(findGooglePlace, undefined);
  return (
    <div className="space-y-3">
      <form action={action} className="flex gap-2">
        <input name="query" defaultValue={defaultQuery} className="field" aria-label="Buscar negocio en Google" />
        <SubmitButton className="btn-dark shrink-0">
          <Search className="size-4" /> Buscar
        </SubmitButton>
      </form>
      {state?.error && <FormAlert tone="error" title="No se pudo buscar" message={state.error} />}
      {state?.results && (
        <ul className="divide-y divide-ink/5 rounded-xl ring-1 ring-ink/10">
          {state.results.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div className="min-w-0">
                <p className="font-semibold">{p.name}</p>
                <p className="truncate text-xs text-ink-soft">{p.address}</p>
                {p.rating && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-ink-soft">
                    <Star className="size-3 fill-sun text-sun" /> {p.rating.toFixed(1)} · {p.total} reseñas
                  </p>
                )}
              </div>
              {p.id === currentPlaceId ? (
                <span className="shrink-0 text-xs font-semibold text-emerald-700">En uso</span>
              ) : (
                <form action={selectGooglePlace}>
                  <input type="hidden" name="placeId" value={p.id} />
                  <SubmitButton className="btn-ghost shrink-0 !px-3 !py-1.5 text-xs" pendingText="Conectando...">Usar este</SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AutoSubmitSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}

export function ConfirmButton({ children, message, className }: { children: React.ReactNode; message: string; className?: string }) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

export function CopyField({ value, label = "Copiar" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="field min-w-0 flex-1 font-mono text-xs" />
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="btn-ghost shrink-0 px-3"
      >
        {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
        {label}
      </button>
    </div>
  );
}
