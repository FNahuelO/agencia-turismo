import type { DestinationI18n, PackageI18n } from "@/db/schema";
import { Field } from "./ui";

const LANGS = [
  { code: "en", label: "Inglés" },
  { code: "pt", label: "Portugués" },
] as const;

function LangBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-2xl ring-1 ring-ink/10">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">{label}</summary>
      <div className="grid gap-4 border-t border-ink/10 p-4 md:grid-cols-2">{children}</div>
    </details>
  );
}

const HINT = "Lo que dejes vacío se muestra en español.";

export function PackageTranslations({ i18n }: { i18n?: PackageI18n }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-soft">{HINT} El itinerario va con el mismo formato <code className="rounded bg-sand px-1">Título | Descripción</code>.</p>
      {LANGS.map(({ code, label }) => {
        const tr = i18n?.[code];
        return (
          <LangBlock key={code} label={label}>
            <Field label="Título"><input name={`i18n.${code}.title`} defaultValue={tr?.title} className="field" /></Field>
            <Field label="Pensión"><input name={`i18n.${code}.board`} defaultValue={tr?.board} className="field" /></Field>
            <Field label="Resumen" className="md:col-span-2"><input name={`i18n.${code}.summary`} defaultValue={tr?.summary} maxLength={400} className="field" /></Field>
            <Field label="Horario / punto de encuentro" className="md:col-span-2"><input name={`i18n.${code}.schedule`} defaultValue={tr?.schedule} className="field" /></Field>
            <Field label="Incluye"><textarea name={`i18n.${code}.includes`} rows={5} defaultValue={tr?.includes?.join("\n")} className="field font-mono text-xs" /></Field>
            <Field label="No incluye"><textarea name={`i18n.${code}.excludes`} rows={5} defaultValue={tr?.excludes?.join("\n")} className="field font-mono text-xs" /></Field>
            <Field label="Itinerario" className="md:col-span-2">
              <textarea name={`i18n.${code}.itinerary`} rows={5} defaultValue={tr?.itinerary?.map((d) => `${d.title} | ${d.text}`).join("\n")} className="field font-mono text-xs" />
            </Field>
          </LangBlock>
        );
      })}
    </div>
  );
}

export function DestinationTranslations({ i18n }: { i18n?: DestinationI18n }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-soft">{HINT}</p>
      {LANGS.map(({ code, label }) => {
        const tr = i18n?.[code];
        return (
          <LangBlock key={code} label={label}>
            <Field label="Nombre"><input name={`i18n.${code}.name`} defaultValue={tr?.name} className="field" /></Field>
            <Field label="Resumen"><input name={`i18n.${code}.summary`} defaultValue={tr?.summary} maxLength={300} className="field" /></Field>
            <Field label="Descripción" className="md:col-span-2"><textarea name={`i18n.${code}.description`} rows={4} defaultValue={tr?.description} className="field" /></Field>
          </LangBlock>
        );
      })}
    </div>
  );
}
