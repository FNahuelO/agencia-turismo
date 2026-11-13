import { asc, count, eq } from "drizzle-orm";
import { Trash2 } from "lucide-react";
import { deletePolicy, savePolicy } from "@/app/admin/actions";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/admin/client";
import { Card, Field, PageHeader } from "@/components/admin/ui";
import { db, schema } from "@/db";
import type { Policy } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { policyLines } from "@/lib/policy";
import { getDictionary } from "@/lib/i18n/dictionaries";

export const metadata = { title: "Condiciones" };

export default async function PoliticasPage() {
  const session = await getSession();
  const policies = await db
    .select({ policy: schema.policies, uses: count(schema.packages.id) })
    .from(schema.policies)
    .leftJoin(schema.packages, eq(schema.packages.policyId, schema.policies.id))
    .groupBy(schema.policies.id)
    .orderBy(asc(schema.policies.name));

  return (
    <>
      <PageHeader
        title="Condiciones de reserva"
        description="Una sola fuente de verdad: cada paquete usa una de estas condiciones y la web las muestra una vez, sin contradicciones."
      />
      <div className="space-y-6">
        {policies.map(({ policy, uses }) => (
          <Card key={policy.id} title={policy.name} actions={<span className="text-xs text-ink-soft">{uses} paquetes</span>}>
            <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
              <PolicyForm policy={policy} />
              <div className="rounded-xl bg-sand/60 p-4 text-sm">
                <p className="mb-2 text-xs font-semibold text-ink-soft uppercase">Así se ve en la web</p>
                <ul className="list-disc space-y-1.5 pl-4 text-ink-soft">{policyLines(policy, getDictionary("es").policy).map((l) => <li key={l}>{l}</li>)}</ul>
                {session?.role === "admin" && uses === 0 && (
                  <form action={deletePolicy} className="mt-4">
                    <input type="hidden" name="id" value={policy.id} />
                    <ConfirmButton message="¿Eliminar estas condiciones?" className="flex items-center gap-1 text-xs text-red-600 hover:underline"><Trash2 className="size-3.5" /> Eliminar</ConfirmButton>
                  </form>
                )}
              </div>
            </div>
          </Card>
        ))}
        <Card title="Nuevas condiciones">
          <PolicyForm />
        </Card>
      </div>
    </>
  );
}

function PolicyForm({ policy }: { policy?: Policy }) {
  return (
    <ActionForm action={savePolicy} resetOnSuccess={!policy} className="grid gap-3 sm:grid-cols-3">
      {policy && <input type="hidden" name="id" value={policy.id} />}
      <Field label="Nombre" className="sm:col-span-3"><input name="name" required defaultValue={policy?.name} className="field" /></Field>
      <Field label="Seña (%)"><input name="depositPercent" type="number" defaultValue={policy?.depositPercent ?? 30} className="field" /></Field>
      <Field label="Plazo seña (hs)"><input name="depositHours" type="number" defaultValue={policy?.depositHours ?? 48} className="field" /></Field>
      <Field label="Saldo (días antes)"><input name="finalPaymentDays" type="number" defaultValue={policy?.finalPaymentDays ?? 10} className="field" /></Field>
      <Field label="Gastos administrativos"><input name="adminFee" defaultValue={policy?.adminFee} className="field" placeholder="$5.000 por pasajero" /></Field>
      <Field label="Menores sin cargo (meses)"><input name="infantsMonths" type="number" defaultValue={policy?.infantsMonths ?? 36} className="field" /></Field>
      <Field label="Recargo single (%)"><input name="singleSurcharge" type="number" defaultValue={policy?.singleSurcharge ?? 50} className="field" /></Field>
      <Field label="Notas extra (una por línea)" className="sm:col-span-3"><textarea name="extraNotes" rows={2} defaultValue={policy?.extraNotes.join("\n")} className="field" /></Field>
      <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2"><input type="checkbox" name="shareMode" defaultChecked={policy?.shareMode ?? true} className="size-4 accent-lake" /> Permite «Viajo a compartir»</label>
      <div className="text-right"><SubmitButton>{policy ? "Guardar" : "Crear"}</SubmitButton></div>
    </ActionForm>
  );
}
