import Link from "next/link";
import { and, asc, eq, gte } from "drizzle-orm";
import { Minus, Plus } from "lucide-react";
import { adjustSeats } from "@/app/admin/actions";
import { EmptyState, OccupancyBar, PageHeader } from "@/components/admin/ui";
import { db, schema } from "@/db";
import { formatMonthYear, formatPrice, formatShortDate, seatsLeft, todayISO } from "@/lib/format";

export const metadata = { title: "Salidas y cupos" };

export default async function SalidasAdminPage() {
  const { departures, packages } = schema;
  const rows = await db
    .select({
      id: departures.id,
      date: departures.date,
      seatsTotal: departures.seatsTotal,
      seatsTaken: departures.seatsTaken,
      cancelled: departures.cancelled,
      price: departures.priceOverride,
      basePrice: packages.price,
      currency: packages.currency,
      packageId: packages.id,
      title: packages.title,
      days: packages.days,
      transport: packages.transport,
    })
    .from(departures)
    .innerJoin(packages, eq(departures.packageId, packages.id))
    .where(and(gte(departures.date, todayISO()), eq(packages.kind, "paquete")))
    .orderBy(asc(departures.date), asc(packages.title));

  const byMonth = new Map<string, typeof rows>();
  for (const r of rows) byMonth.set(r.date.slice(0, 7), [...(byMonth.get(r.date.slice(0, 7)) ?? []), r]);

  return (
    <>
      <PageHeader title="Salidas y cupos" description="Sumá o restá lugares vendidos con un clic. La web muestra «últimos lugares» y «agotada» automáticamente." />
      {rows.length === 0 ? (
        <EmptyState>No hay salidas futuras cargadas.</EmptyState>
      ) : (
        <div className="space-y-8">
          {[...byMonth.entries()].map(([month, items]) => {
            const taken = items.reduce((a, b) => a + b.seatsTaken, 0);
            const total = items.reduce((a, b) => a + b.seatsTotal, 0);
            return (
              <section key={month}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-display text-xl font-bold">{formatMonthYear(`${month}-01`)}</h2>
                  <span className="text-sm text-ink-soft">{taken}/{total} lugares vendidos</span>
                </div>
                <ul className="divide-y divide-ink/5 overflow-hidden rounded-2xl bg-white ring-1 ring-ink/5">
                  {items.map((d) => (
                    <li key={d.id} className={`flex flex-wrap items-center gap-4 px-4 py-3 text-sm ${d.cancelled ? "opacity-50" : ""}`}>
                      <span className="w-24 shrink-0 font-medium capitalize">{formatShortDate(d.date)}</span>
                      <Link href={`/admin/paquetes/${d.packageId}#salidas`} className="min-w-0 flex-1 truncate hover:underline">
                        {d.title} · {d.days}d {d.transport === "aereo" ? "· aéreo" : ""}
                        {d.cancelled && <span className="ml-2 rounded-full bg-ink/10 px-2 py-0.5 text-xs">Cancelada</span>}
                      </Link>
                      <span className="hidden w-28 text-right text-ink-soft sm:block">{formatPrice(d.price ?? d.basePrice, d.currency)}</span>
                      <OccupancyBar taken={d.seatsTaken} total={d.seatsTotal} />
                      <span className="flex items-center gap-1">
                        <form action={adjustSeats}>
                          <input type="hidden" name="id" value={d.id} />
                          <input type="hidden" name="delta" value={-1} />
                          <button type="submit" disabled={d.seatsTaken === 0} className="rounded-lg border border-ink/10 p-1.5 hover:bg-sand disabled:opacity-30" aria-label="Liberar un lugar"><Minus className="size-3.5" /></button>
                        </form>
                        <form action={adjustSeats}>
                          <input type="hidden" name="id" value={d.id} />
                          <input type="hidden" name="delta" value={1} />
                          <button type="submit" disabled={seatsLeft(d) === 0} className="rounded-lg border border-ink/10 p-1.5 hover:bg-sand disabled:opacity-30" aria-label="Vender un lugar"><Plus className="size-3.5" /></button>
                        </form>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
