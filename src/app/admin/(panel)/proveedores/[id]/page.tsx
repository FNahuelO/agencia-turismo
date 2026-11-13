import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import {
  addSupplierCost,
  addSupplierPayment,
  deleteSupplier,
  deleteSupplierCost,
  deleteSupplierPayment,
  saveSupplier,
  toggleVoidCost,
} from "@/app/admin/accounting-actions";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/admin/client";
import { MoneyByCurrency } from "@/components/admin/money";
import { Card, EmptyState, Field, PageHeader, SUPPLIER_KIND_LABELS } from "@/components/admin/ui";
import { db, schema } from "@/db";
import { CASH_ACCOUNTS, CURRENCIES, SUPPLIER_KINDS } from "@/db/schema";
import { ACCOUNT_LABELS, getCosts, getSupplierBalances } from "@/lib/accounting";
import { getSession } from "@/lib/auth";
import { formatPrice, formatShortDate, todayISO } from "@/lib/format";

export default async function ProveedorPage({ params }: PageProps<"/admin/proveedores/[id]">) {
  const id = Number((await params).id);
  const supplier = id ? await db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, id) }) : undefined;
  if (!supplier) notFound();

  const [costs, payments, balances, session] = await Promise.all([
    getCosts({ supplierId: id }),
    db.query.supplierPayments.findMany({ where: eq(schema.supplierPayments.supplierId, id), orderBy: desc(schema.supplierPayments.date) }),
    getSupplierBalances(id),
    getSession(),
  ]);
  const isAdmin = session?.role === "admin";
  const today = todayISO();
  const openCosts = costs.filter((c) => c.pending > 0);
  const costLabel = new Map(costs.map((c) => [c.id, c.description]));

  return (
    <>
      <Link href="/admin/proveedores" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-soft hover:underline">
        <ArrowLeft className="size-4" /> Proveedores
      </Link>
      <PageHeader
        title={supplier.name}
        description={`${SUPPLIER_KIND_LABELS[supplier.kind]}${supplier.active ? "" : " · inactivo"}`}
        actions={
          <div className="text-right">
            <p className="text-xs text-ink-soft">Saldo a pagar</p>
            <p className="text-xl font-bold"><MoneyByCurrency values={balances.get(id)} empty="$ 0" signed /></p>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Costos (cuentas a pagar)">
            {costs.length === 0 ? (
              <EmptyState>No hay costos cargados.</EmptyState>
            ) : (
              <div className="-mx-4 sm:-mx-6 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-ink/5 text-left text-xs text-ink-soft">
                    <tr>
                      <th className="px-6 py-2 font-medium">Servicio</th>
                      <th className="px-3 py-2 font-medium">Vence</th>
                      <th className="px-3 py-2 text-right font-medium">Monto</th>
                      <th className="px-3 py-2 text-right font-medium">Pendiente</th>
                      <th className="px-6 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {costs.map((c) => (
                      <tr key={c.id} className={c.voided ? "text-ink-soft line-through" : undefined}>
                        <td className="px-6 py-2">
                          <p>{c.description}</p>
                          {c.bookingCode && (
                            <Link href={`/admin/reservas/${c.bookingId}`} className="font-mono text-xs text-lake hover:underline">{c.bookingCode}</Link>
                          )}
                        </td>
                        <td className={`px-3 py-2 capitalize ${c.pending > 0 && c.dueDate && c.dueDate < today ? "font-semibold text-red-600" : ""}`}>
                          {c.dueDate ? formatShortDate(c.dueDate) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatPrice(c.amount, c.currency)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{c.voided ? "Anulado" : c.pending ? formatPrice(c.pending, c.currency) : "Pagado"}</td>
                        <td className="whitespace-nowrap px-6 py-2 text-right text-xs">
                          <form action={toggleVoidCost} className="inline">
                            <input type="hidden" name="id" value={c.id} />
                            <button className="text-ink-soft hover:underline">{c.voided ? "Reactivar" : "Anular"}</button>
                          </form>
                          {isAdmin && c.paid === 0 && (
                            <form action={deleteSupplierCost} className="ml-3 inline">
                              <input type="hidden" name="id" value={c.id} />
                              <ConfirmButton message="¿Borrar este costo?" className="text-red-600 hover:underline">Borrar</ConfirmButton>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <details className="mt-4 border-t border-ink/5 pt-4">
              <summary className="cursor-pointer text-sm font-semibold text-lake">Cargar costo</summary>
              <ActionForm action={addSupplierCost} className="mt-4 grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="supplierId" value={id} />
                <Field label="Descripción" className="sm:col-span-2"><input name="description" required className="field" placeholder="3 noches hab. doble" /></Field>
                <Field label="Monto"><input name="amount" inputMode="numeric" required className="field" /></Field>
                <Field label="Moneda">
                  <select name="currency" className="field">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
                </Field>
                <Field label="Vencimiento"><input type="date" name="dueDate" className="field" /></Field>
                <Field label="Reserva (código)" hint="Opcional, para calcular el margen del viaje"><input name="bookingCode" className="field uppercase" placeholder="TA-XXXXXX" /></Field>
                <div className="sm:col-span-2"><SubmitButton>Cargar costo</SubmitButton></div>
              </ActionForm>
            </details>
          </Card>

          <Card title="Pagos realizados">
            {payments.length === 0 ? (
              <EmptyState>Todavía no hay pagos.</EmptyState>
            ) : (
              <ul className="divide-y divide-ink/5 text-sm">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div>
                      <p className="font-medium capitalize">{formatShortDate(p.date)} · {ACCOUNT_LABELS[p.account]}</p>
                      <p className="text-xs text-ink-soft">
                        {p.costId ? `Imputado a: ${costLabel.get(p.costId) ?? "costo"}` : "A cuenta"}
                        {p.reference && ` · ${p.reference}`}
                        {p.createdBy && ` · ${p.createdBy}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">{formatPrice(p.amount, p.currency)}</p>
                      {isAdmin && (
                        <form action={deleteSupplierPayment}>
                          <input type="hidden" name="id" value={p.id} />
                          <ConfirmButton message="¿Borrar este pago?" className="text-xs text-red-600 hover:underline">Borrar</ConfirmButton>
                        </form>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <details className="mt-4 border-t border-ink/5 pt-4" open={openCosts.length > 0 && payments.length === 0}>
              <summary className="cursor-pointer text-sm font-semibold text-lake">Registrar pago</summary>
              <ActionForm action={addSupplierPayment} className="mt-4 grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="supplierId" value={id} />
                <Field label="Imputar a" className="sm:col-span-2" hint="El pago tiene que estar en la moneda del costo">
                  <select name="costId" className="field">
                    <option value="">Pago a cuenta (sin imputar)</option>
                    {openCosts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.description}{c.bookingCode ? ` · ${c.bookingCode}` : ""} · pendiente {formatPrice(c.pending, c.currency)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Monto"><input name="amount" inputMode="numeric" required className="field" /></Field>
                <Field label="Moneda">
                  <select name="currency" className="field">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
                </Field>
                <Field label="Fecha"><input type="date" name="date" defaultValue={today} className="field" /></Field>
                <Field label="Desde la cuenta">
                  <select name="account" defaultValue="banco" className="field">
                    {CASH_ACCOUNTS.map((a) => <option key={a} value={a}>{ACCOUNT_LABELS[a]}</option>)}
                  </select>
                </Field>
                <Field label="Referencia" className="sm:col-span-2"><input name="reference" className="field" placeholder="Transferencia #1234, factura B 0001-..." /></Field>
                <div className="sm:col-span-2"><SubmitButton>Registrar pago</SubmitButton></div>
              </ActionForm>
            </details>
          </Card>
        </div>

        <Card title="Datos">
          <ActionForm action={saveSupplier} className="space-y-4">
            <input type="hidden" name="id" value={id} />
            <Field label="Nombre"><input name="name" required defaultValue={supplier.name} className="field" /></Field>
            <Field label="Rubro">
              <select name="kind" defaultValue={supplier.kind} className="field">
                {SUPPLIER_KINDS.map((k) => <option key={k} value={k}>{SUPPLIER_KIND_LABELS[k]}</option>)}
              </select>
            </Field>
            <Field label="CUIT"><input name="taxId" defaultValue={supplier.taxId} className="field" /></Field>
            <Field label="Contacto"><input name="contactName" defaultValue={supplier.contactName} className="field" /></Field>
            <Field label="Email"><input name="email" type="email" defaultValue={supplier.email} className="field" /></Field>
            <Field label="Teléfono"><input name="phone" defaultValue={supplier.phone} className="field" /></Field>
            <Field label="Datos bancarios"><textarea name="bankInfo" rows={2} defaultValue={supplier.bankInfo} className="field" /></Field>
            <Field label="Notas"><textarea name="notes" rows={3} defaultValue={supplier.notes} className="field" /></Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={supplier.active} /> Activo
            </label>
            <SubmitButton>Guardar</SubmitButton>
          </ActionForm>
          {isAdmin && (
            <form action={deleteSupplier} className="mt-4 border-t border-ink/5 pt-4">
              <input type="hidden" name="id" value={id} />
              <ConfirmButton message="Si tiene movimientos se marca como inactivo; si no, se borra. ¿Seguir?" className="text-sm text-red-600 hover:underline">
                Eliminar proveedor
              </ConfirmButton>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
