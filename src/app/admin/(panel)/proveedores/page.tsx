import Link from "next/link";
import { asc } from "drizzle-orm";
import { Plus } from "lucide-react";
import { saveSupplier } from "@/app/admin/accounting-actions";
import { ActionForm, SubmitButton } from "@/components/admin/client";
import { MoneyByCurrency } from "@/components/admin/money";
import { EmptyState, Field, PageHeader, SUPPLIER_KIND_LABELS } from "@/components/admin/ui";
import { db, schema } from "@/db";
import { SUPPLIER_KINDS } from "@/db/schema";
import { getSupplierBalances } from "@/lib/accounting";

export const metadata = { title: "Proveedores" };

export default async function ProveedoresPage({ searchParams }: PageProps<"/admin/proveedores">) {
  const sp = await searchParams;
  const showInactive = sp.inactivos === "1";
  const [rows, balances] = await Promise.all([
    db.query.suppliers.findMany({ orderBy: asc(schema.suppliers.name) }),
    getSupplierBalances(),
  ]);
  const list = rows.filter((s) => showInactive || s.active);

  return (
    <>
      <PageHeader title="Proveedores" description="Hoteles, transportistas, operadores y demás. Cargá lo que les debés por cada reserva y registrá los pagos." />

      <details className="group mb-6 rounded-2xl bg-white ring-1 ring-ink/5">
        <summary className="flex cursor-pointer list-none items-center gap-2 p-5 font-semibold [&::-webkit-details-marker]:hidden">
          <Plus className="size-4 transition-transform group-open:rotate-45" /> Nuevo proveedor
        </summary>
        <ActionForm action={saveSupplier} className="grid gap-4 border-t border-ink/5 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Nombre" className="sm:col-span-2"><input name="name" required className="field" placeholder="Hotel Llao Llao" /></Field>
          <Field label="Rubro">
            <select name="kind" className="field">
              {SUPPLIER_KINDS.map((k) => <option key={k} value={k}>{SUPPLIER_KIND_LABELS[k]}</option>)}
            </select>
          </Field>
          <Field label="CUIT"><input name="taxId" className="field" /></Field>
          <Field label="Contacto"><input name="contactName" className="field" /></Field>
          <Field label="Email"><input name="email" type="email" className="field" /></Field>
          <Field label="Teléfono"><input name="phone" className="field" /></Field>
          <Field label="Datos bancarios"><input name="bankInfo" className="field" placeholder="CBU / alias" /></Field>
          <div className="sm:col-span-2 lg:col-span-4"><SubmitButton>Crear proveedor</SubmitButton></div>
        </ActionForm>
      </details>

      <div className="mb-4 flex justify-end">
        <Link href={showInactive ? "/admin/proveedores" : "/admin/proveedores?inactivos=1"} className="text-sm text-ink-soft hover:underline">
          {showInactive ? "Ocultar inactivos" : "Mostrar inactivos"}
        </Link>
      </div>

      {list.length === 0 ? (
        <EmptyState>Todavía no cargaste proveedores.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-ink/5">
          <table className="w-full text-sm">
            <thead className="border-b border-ink/5 text-left text-xs text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-medium">Proveedor</th>
                <th className="px-4 py-3 font-medium">Rubro</th>
                <th className="px-4 py-3 font-medium">Contacto</th>
                <th className="px-4 py-3 text-right font-medium">Saldo a pagar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {list.map((s) => (
                <tr key={s.id} className="hover:bg-sand/50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/proveedores/${s.id}`} className="font-semibold text-lake hover:underline">{s.name}</Link>
                    {!s.active && <span className="ml-2 text-xs text-ink-soft">(inactivo)</span>}
                    {s.taxId && <p className="text-xs text-ink-soft">CUIT {s.taxId}</p>}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{SUPPLIER_KIND_LABELS[s.kind]}</td>
                  <td className="px-4 py-3">
                    <p>{s.contactName}</p>
                    <p className="text-xs text-ink-soft">{s.phone || s.email}</p>
                  </td>
                  <td className="px-4 py-3 text-right"><MoneyByCurrency values={balances.get(s.id)} empty="$ 0" signed /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
