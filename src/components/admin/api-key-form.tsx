"use client";

import { KeyRound } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { createApiKey, type ApiKeyFormState } from "@/app/admin/api-actions";
import { CopyField, FormAlert, SubmitButton } from "./client";

const SCOPES = [
  { value: "catalog:read", label: "Catálogo y disponibilidad", hint: "Leer productos, destinos, fechas y cotizaciones" },
  { value: "bookings:write", label: "Crear reservas", hint: "Reserva con cupo y seña, igual que la web" },
  { value: "bookings:read", label: "Consultar reservas", hint: "Solo las creadas con esta clave" },
];

export function ApiKeyForm() {
  const [state, action] = useActionState<ApiKeyFormState, FormData>(createApiKey, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.key) ref.current?.reset();
  }, [state]);

  return (
    <div className="space-y-4">
      {state?.key && (
        <div className="rounded-2xl bg-emerald-50 p-4 text-sm">
          <p className="mb-2 font-semibold text-emerald-800">Clave &quot;{state.name}&quot; creada. Copiala ahora: no se vuelve a mostrar.</p>
          <CopyField value={state.key} label="API key" />
        </div>
      )}
      <form ref={ref} action={action} className="grid gap-4 md:grid-cols-[1fr_2fr_auto] md:items-end">
        <label>
          <span className="label">Nombre</span>
          <input name="name" required placeholder="Ej: Sitio de Agencia Sur" className="field" />
        </label>
        <fieldset className="flex flex-wrap gap-x-5 gap-y-2">
          <legend className="label">Permisos</legend>
          {SCOPES.map((s) => (
            <label key={s.value} className="flex items-start gap-2 text-sm" title={s.hint}>
              <input type="checkbox" name="scopes" value={s.value} defaultChecked={s.value !== "bookings:write"} className="mt-0.5 size-4 accent-lake" />
              <span>{s.label}</span>
            </label>
          ))}
        </fieldset>
        <SubmitButton className="btn-dark"><KeyRound className="size-4" /> Crear clave</SubmitButton>
      </form>
      {state?.error && <FormAlert key={state.error} tone="error" title="No se pudo crear la clave" message={state.error} />}
    </div>
  );
}
