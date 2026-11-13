import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, Plus } from "lucide-react";
import { addCashMovement, deleteCashMovement } from "@/app/admin/accounting-actions";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/admin/client";
import { addTo, MoneyByCurrency } from "@/components/admin/money";
import { BOOKING_STATUS_META, Badge, CASH_CATEGORY_LABELS, Card, EmptyState, Field, PageHeader } from "@/components/admin/ui";
import { CASH_ACCOUNTS, CASH_CATEGORIES, CURRENCIES, type Currency } from "@/db/schema";
import { ACCOUNT_LABELS, getAccountBalances, getCosts, getLedger, getProfitability, getReceivables, ledgerTotals, monthRange } from "@/lib/accounting";
import { formatPrice, formatShortDate, todayISO } from "@/lib/format";

export const metadata = { title: "Contabilidad" };

const SOURCE_LABELS = { cobro: "Cobro", reintegro: "Reintegro", proveedor: "Proveedor", manual: "Manual" } as const;
const monthFormat = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export default async function ContabilidadPage({ searchParams }: PageProps<"/admin/contabilidad">) {
  const sp = await searchParams;
  const { month, from, to } = monthRange(typeof sp.mes === "string" ? sp.mes : undefined);
  const today = todayISO();

  const [ledger, balances, receivables, payables, profitability] = await Promise.all([
    getLedger(from, to),
    getAccountBalances(),
    getReceivables(),
    getCosts({ unpaidOnly: true }),
    getProfitability(from, to),
  ]);
  const totals = ledgerTotals(ledger);
  const net: Partial<Record<Currency, number>> = {};
  const income: Partial<Record<Currency, number>> = {};
  const expense: Partial<Record<Currency, number>> = {};
  for (const [c, t] of Object.entries(totals) as [Currency, { ingresos: number; egresos: number }][]) {
    income[c] = t.ingresos;
    expense[c] = t.egresos;
    net[c] = t.ingresos - t.egresos;
  }
  const receivableTotal = receivables.reduce((acc, r) => addTo(acc, r.currency, r.balance), {} as Partial<Record<Currency, number>>);
  const payableTotal = payables.reduce((acc, c) => addTo(acc, c.currency, c.pending), {} as Partial<Record<Currency, number>>);
  const salesTotal = profitability.reduce((acc, r) => addTo(acc, r.currency, r.total), {} as Partial<Record<Currency, number>>);
  const marginTotal = profitability.reduce((acc, r) => addTo(acc, r.currency, r.margin), {} as Partial<Record<Currency, number>>);
  const monthLabel = monthFormat.format(new Date(`${from}T00:00:00Z`));

  return (
    <>
      <PageHeader
        title="Contabilidad"
        description="Caja, cobros, pagos a proveedores y rentabilidad. Los cobros aprobados entran solos; acá cargás gastos y otros movimientos."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/admin/contabilidad?mes=${shiftMonth(month, -1)}`} className="btn-ghost px-2" aria-label="Mes anterior"><ChevronLeft className="size-4" /></Link>
            <form className="flex items-center gap-2">
              <input type="month" name="mes" defaultValue={month} className="field w-40 py-2" />
              <button className="btn-ghost">Ver</button>
            </form>
            <Link href={`/admin/contabilidad?mes=${shiftMonth(month, 1)}`} className="btn-ghost px-2" aria-label="Mes siguiente"><ChevronRight className="size-4" /></Link>
            <a href={`/admin/contabilidad/export?mes=${month}`} className="btn-ghost"><Download className="size-4" /> CSV</a>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`Ingresos de ${monthLabel}`}><MoneyByCurrency values={income} empty="$ 0" /></Stat>
        <Stat label="Egresos del mes"><MoneyByCurrency values={expense} empty="$ 0" /></Stat>
        <Stat label="Resultado de caja"><MoneyByCurrency values={net} empty="$ 0" signed /></Stat>
        <Stat label="Margen de viajes del mes"><MoneyByCurrency values={marginTotal} empty="—" signed /></Stat>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card title="Saldos por cuenta">
          <ul className="divide-y divide-ink/5 text-sm">
            {CASH_ACCOUNTS.map((a) => (
              <li key={a} className="flex items-start justify-between gap-3 py-2.5">
                <span className="font-medium">{ACCOUNT_LABELS[a]}</span>
                <span className="text-right"><MoneyByCurrency values={balances[a]} empty="$ 0" signed /></span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-soft">Histórico: todos los cobros, reintegros, pagos y movimientos registrados. Para ajustar el saldo inicial cargá un movimiento &quot;Aporte de socios&quot;.</p>
        </Card>
        <Card title="A cobrar">
          <p className="text-2xl font-bold"><MoneyByCurrency values={receivableTotal} empty="$ 0" /></p>
          <p className="mt-1 text-sm text-ink-soft">{receivables.length} reservas con saldo, {receivables.filter((r) => r.overdue).length} vencidas.</p>
          <Link href="#a-cobrar" className="mt-3 inline-block text-sm font-semibold text-lake hover:underline">Ver detalle</Link>
        </Card>
        <Card title="A pagar a proveedores">
          <p className="text-2xl font-bold"><MoneyByCurrency values={payableTotal} empty="$ 0" /></p>
          <p className="mt-1 text-sm text-ink-soft">{payables.length} costos pendientes, {payables.filter((c) => c.dueDate && c.dueDate < today).length} vencidos.</p>
          <Link href="/admin/proveedores" className="mt-3 inline-block text-sm font-semibold text-lake hover:underline">Ir a proveedores</Link>
        </Card>
      </div>

      <details className="group mb-4 rounded-2xl bg-white ring-1 ring-ink/5">
        <summary className="flex cursor-pointer list-none items-center gap-2 p-5 font-semibold [&::-webkit-details-marker]:hidden">
          <Plus className="size-4 transition-transform group-open:rotate-45" /> Registrar movimiento de caja
        </summary>
        <ActionForm action={addCashMovement} resetOnSuccess className="grid gap-4 border-t border-ink/5 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Tipo">
            <select name="direction" className="field">
              <option value="egreso">Egreso</option>
              <option value="ingreso">Ingreso</option>
            </select>
          </Field>
          <Field label="Categoría">
            <select name="category" className="field">
              {CASH_CATEGORIES.map((c) => <option key={c} value={c}>{CASH_CATEGORY_LABELS[c]}</option>)}
            </select>
          </Field>
          <Field label="Cuenta">
            <select name="account" className="field">
              {CASH_ACCOUNTS.map((a) => <option key={a} value={a}>{ACCOUNT_LABELS[a]}</option>)}
            </select>
          </Field>
          <Field label="Fecha"><input type="date" name="date" defaultValue={today} className="field" /></Field>
          <Field label="Monto"><input name="amount" inputMode="numeric" required className="field" placeholder="150000" /></Field>
          <Field label="Moneda">
            <select name="currency" className="field">
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Descripción" className="sm:col-span-2"><input name="description" required className="field" placeholder="Alquiler de oficina de mayo" /></Field>
          <div className="sm:col-span-2 lg:col-span-4"><SubmitButton>Registrar</SubmitButton></div>
        </ActionForm>
      </details>

      <Card title={`Libro de caja · ${monthLabel}`} className="mb-6">
        {ledger.length === 0 ? (
          <EmptyState>Sin movimientos en el período.</EmptyState>
        ) : (
          <div className="-mx-4 sm:-mx-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-ink/5 text-left text-xs text-ink-soft">
                <tr>
                  <th className="px-6 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">Origen</th>
                  <th className="px-3 py-2 font-medium">Descripción</th>
                  <th className="px-3 py-2 font-medium">Cuenta</th>
                  <th className="px-3 py-2 text-right font-medium">Ingreso</th>
                  <th className="px-3 py-2 text-right font-medium">Egreso</th>
                  <th className="px-6 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {ledger.map((e) => (
                  <tr key={e.key}>
                    <td className="whitespace-nowrap px-6 py-2 capitalize">{formatShortDate(e.date)}</td>
                    <td className="px-3 py-2 text-ink-soft">{SOURCE_LABELS[e.source]}</td>
                    <td className="px-3 py-2">{e.href ? <Link href={e.href} className="hover:text-lake hover:underline">{e.description}</Link> : e.description}</td>
                    <td className="px-3 py-2 text-ink-soft">{ACCOUNT_LABELS[e.account]}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{e.direction === "ingreso" ? formatPrice(e.amount, e.currency) : ""}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-600">{e.direction === "egreso" ? formatPrice(e.amount, e.currency) : ""}</td>
                    <td className="px-6 py-2 text-right">
                      {e.manualId && (
                        <form action={deleteCashMovement}>
                          <input type="hidden" name="id" value={e.manualId} />
                          <ConfirmButton message="¿Borrar este movimiento?" className="text-xs text-red-600 hover:underline">Borrar</ConfirmButton>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`Rentabilidad de viajes · ${monthLabel}`} className="mb-6">
        <p className="-mt-2 mb-3 text-xs text-ink-soft">Reservas activas que viajan en el mes. Los costos en otra moneda se convierten con la cotización actual.</p>
        {profitability.length === 0 ? (
          <EmptyState>No hay reservas que viajen en el período.</EmptyState>
        ) : (
          <div className="-mx-4 sm:-mx-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-ink/5 text-left text-xs text-ink-soft">
                <tr>
                  <th className="px-6 py-2 font-medium">Reserva</th>
                  <th className="px-3 py-2 font-medium">Viaje</th>
                  <th className="px-3 py-2 text-right font-medium">Venta</th>
                  <th className="px-3 py-2 text-right font-medium">Costos</th>
                  <th className="px-3 py-2 text-right font-medium">Margen</th>
                  <th className="px-6 py-2 text-right font-medium">Cobrado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {profitability.map((r) => (
                  <tr key={r.id}>
                    <td className="px-6 py-2">
                      <Link href={`/admin/reservas/${r.id}`} className="font-mono font-semibold text-lake hover:underline">{r.code}</Link>
                      <p className="text-xs text-ink-soft">{r.contactName}</p>
                    </td>
                    <td className="px-3 py-2">
                      <p className="max-w-64 truncate">{r.title}</p>
                      <p className="text-xs capitalize text-ink-soft">{formatShortDate(r.date)}</p>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatPrice(r.total, r.currency)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-soft">{r.cost ? formatPrice(r.cost, r.currency) : "Sin cargar"}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.margin < 0 ? "text-red-600" : ""}`}>
                      {r.cost ? `${formatPrice(r.margin, r.currency)} (${r.marginPercent}%)` : "—"}
                    </td>
                    <td className="px-6 py-2 text-right tabular-nums text-ink-soft">{formatPrice(r.paid, r.currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-ink/10 font-semibold">
                <tr>
                  <td className="px-6 py-2" colSpan={2}>Total</td>
                  <td className="px-3 py-2 text-right"><MoneyByCurrency values={salesTotal} /></td>
                  <td />
                  <td className="px-3 py-2 text-right"><MoneyByCurrency values={marginTotal} signed /></td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Saldos a cobrar">
          <div id="a-cobrar" />
          {receivables.length === 0 ? (
            <EmptyState>No hay saldos pendientes.</EmptyState>
          ) : (
            <ul className="divide-y divide-ink/5 text-sm">
              {receivables.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/admin/reservas/${r.id}`} className="font-mono font-semibold text-lake hover:underline">{r.code}</Link>{" "}
                    <Badge meta={BOOKING_STATUS_META[r.status]} />
                    <p className="truncate text-xs text-ink-soft">{r.contactName} · {r.title} · sale {formatShortDate(r.date)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular-nums">{formatPrice(r.balance, r.currency)}</p>
                    {r.balanceDueDate && (
                      <p className={`text-xs ${r.overdue ? "font-semibold text-red-600" : "text-ink-soft"}`}>vence {formatShortDate(r.balanceDueDate)}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Costos pendientes de pago">
          {payables.length === 0 ? (
            <EmptyState>No hay deudas con proveedores.</EmptyState>
          ) : (
            <ul className="divide-y divide-ink/5 text-sm">
              {payables.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/admin/proveedores/${c.supplierId}`} className="font-semibold hover:text-lake hover:underline">{c.supplierName}</Link>
                    <p className="truncate text-xs text-ink-soft">{c.description}{c.bookingCode && ` · ${c.bookingCode}`}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular-nums">{formatPrice(c.pending, c.currency)}</p>
                    {c.dueDate && (
                      <p className={`text-xs ${c.dueDate < today ? "font-semibold text-red-600" : "text-ink-soft"}`}>vence {formatShortDate(c.dueDate)}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-ink/5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">{label}</p>
      <p className="mt-2 text-xl font-bold">{children}</p>
    </div>
  );
}
