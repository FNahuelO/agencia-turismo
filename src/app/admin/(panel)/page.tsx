import Link from "next/link";
import { and, asc, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { AlertTriangle, ArrowRight, CalendarDays, Inbox, Percent, Users } from "lucide-react";
import { Card, OccupancyBar, PageHeader, StatusBadge } from "@/components/admin/ui";
import { db, schema } from "@/db";
import { formatShortDate, toISODate, todayISO } from "@/lib/format";

export const metadata = { title: "Resumen" };

const { leads, departures, packages } = schema;

export default async function DashboardPage() {
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * 86400000);
  const since14 = new Date(now.getTime() - 13 * 86400000);
  since14.setHours(0, 0, 0, 0);
  const today = todayISO();
  const in30 = toISODate(new Date(now.getTime() + 30 * 86400000));

  const [leadStats, perDay, upcoming, seatStats, topPackages, recent, stale] = await Promise.all([
    db
      .select({
        total: count(),
        nuevos: sql<number>`count(*) filter (where ${leads.status} = 'nuevo')`.mapWith(Number),
        reservados: sql<number>`count(*) filter (where ${leads.status} = 'reservado')`.mapWith(Number),
        pasajeros: sql<number>`coalesce(sum(case when ${leads.status} = 'reservado' then ${leads.passengers} end), 0)`.mapWith(Number),
      })
      .from(leads)
      .where(gte(leads.createdAt, since30)),
    db
      .select({ day: sql<string>`to_char(${leads.createdAt} at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD')`, n: count() })
      .from(leads)
      .where(gte(leads.createdAt, since14))
      .groupBy(sql`1`),
    db
      .select({
        id: departures.id,
        date: departures.date,
        seatsTotal: departures.seatsTotal,
        seatsTaken: departures.seatsTaken,
        title: packages.title,
        packageId: packages.id,
        days: packages.days,
      })
      .from(departures)
      .innerJoin(packages, eq(departures.packageId, packages.id))
      .where(and(gte(departures.date, today), lte(departures.date, in30), eq(departures.cancelled, false), eq(packages.kind, "paquete")))
      .orderBy(asc(departures.date))
      .limit(8),
    db
      .select({ total: sql<number>`coalesce(sum(${departures.seatsTotal}), 0)`.mapWith(Number), taken: sql<number>`coalesce(sum(${departures.seatsTaken}), 0)`.mapWith(Number), n: count() })
      .from(departures)
      .innerJoin(packages, eq(departures.packageId, packages.id))
      .where(and(gte(departures.date, today), lte(departures.date, in30), eq(departures.cancelled, false), eq(packages.kind, "paquete"))),
    db
      .select({ id: packages.id, title: packages.title, days: packages.days, n: count(leads.id) })
      .from(leads)
      .innerJoin(packages, eq(leads.packageId, packages.id))
      .where(gte(leads.createdAt, since30))
      .groupBy(packages.id)
      .orderBy(desc(count(leads.id)))
      .limit(5),
    db.query.leads.findMany({ orderBy: desc(leads.createdAt), limit: 6, with: { package: true } }),
    db
      .select({ id: packages.id, title: packages.title, days: packages.days })
      .from(packages)
      .where(
        and(
          eq(packages.published, true),
          eq(packages.kind, "paquete"),
          sql`not exists (select 1 from ${departures} d where d.package_id = ${packages.id} and d.date >= ${today} and d.cancelled = false)`,
        ),
      ),
  ]);

  const stats = leadStats[0];
  const conversion = stats.total ? Math.round(((stats.reservados ?? 0) / stats.total) * 100) : 0;
  const occupancy = seatStats[0].total ? Math.round((seatStats[0].taken / seatStats[0].total) * 100) : 0;

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(since14.getTime() + i * 86400000);
    const iso = toISODate(d);
    return { iso, n: perDay.find((p) => p.day === iso)?.n ?? 0 };
  });
  const maxDay = Math.max(1, ...days.map((d) => d.n));

  return (
    <>
      <PageHeader title="Resumen" description="Lo que pasó en los últimos 30 días y lo que viene." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Inbox} label="Consultas (30 días)" value={stats.total} hint={`${stats.nuevos ?? 0} sin responder`} href="/admin/consultas?estado=nuevo" />
        <Kpi icon={Percent} label="Conversión a reserva" value={`${conversion}%`} hint={`${stats.reservados ?? 0} reservas`} />
        <Kpi icon={Users} label="Pasajeros reservados" value={stats.pasajeros} hint="en consultas reservadas" />
        <Kpi icon={CalendarDays} label="Ocupación próx. 30 días" value={`${occupancy}%`} hint={`${seatStats[0].taken}/${seatStats[0].total} lugares · ${seatStats[0].n} salidas`} href="/admin/salidas" />
      </div>

      {stale.length > 0 && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl bg-sun/15 p-5">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-sun-dark" />
          <div className="text-sm">
            <p className="font-semibold">{stale.length} paquetes publicados no tienen salidas futuras</p>
            <p className="mt-1 text-ink-soft">
              Se muestran sin fecha en la web. Cargales nuevas salidas o despublicalos:{" "}
              {stale.slice(0, 6).map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ", "}
                  <Link href={`/admin/paquetes/${p.id}`} className="font-medium text-ink underline">{p.title} ({p.days}d)</Link>
                </span>
              ))}
              {stale.length > 6 && ` y ${stale.length - 6} más`}
            </p>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Consultas por día" actions={<span className="text-xs text-ink-soft">últimos 14 días</span>}>
          <div className="flex h-40 items-end gap-1.5">
            {days.map((d) => (
              <div key={d.iso} className="group flex h-full flex-1 flex-col items-center">
                <span className="text-[10px] text-ink-soft opacity-0 group-hover:opacity-100">{d.n}</span>
                <div className="flex w-full flex-1 items-end">
                  <div className="w-full rounded-t-md bg-lake" style={{ height: `${Math.max(4, (d.n / maxDay) * 100)}%`, opacity: d.n ? 1 : 0.15 }} />
                </div>
                <span className="mt-1.5 text-[10px] text-ink-soft">{d.iso.slice(8)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Más consultados" actions={<span className="text-xs text-ink-soft">30 días</span>}>
          {topPackages.length === 0 ? (
            <p className="text-sm text-ink-soft">Todavía no hay consultas asociadas a paquetes.</p>
          ) : (
            <ol className="space-y-3">
              {topPackages.map((p, i) => (
                <li key={p.id} className="flex items-center gap-3 text-sm">
                  <span className="flex size-6 items-center justify-center rounded-full bg-sand font-semibold">{i + 1}</span>
                  <Link href={`/admin/paquetes/${p.id}`} className="flex-1 truncate hover:underline">{p.title} · {p.days}d</Link>
                  <span className="font-semibold">{p.n}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Próximas salidas" actions={<Link href="/admin/salidas" className="text-sm font-medium text-lake">Ver todas</Link>}>
          {upcoming.length === 0 ? (
            <p className="text-sm text-ink-soft">No hay salidas en los próximos 30 días.</p>
          ) : (
            <ul className="divide-y divide-ink/5">
              {upcoming.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <Link href={`/admin/paquetes/${d.packageId}#salidas`} className="block truncate font-medium hover:underline">{d.title} · {d.days}d</Link>
                    <span className="text-xs text-ink-soft capitalize">{formatShortDate(d.date)}</span>
                  </div>
                  <OccupancyBar taken={d.seatsTaken} total={d.seatsTotal} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Últimas consultas" actions={<Link href="/admin/consultas" className="text-sm font-medium text-lake">Ver todas</Link>}>
          <ul className="divide-y divide-ink/5">
            {recent.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{l.name} · {l.passengers} pax</p>
                  <p className="truncate text-xs text-ink-soft">{l.package?.title ?? "Consulta general"}</p>
                </div>
                <StatusBadge status={l.status} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

function Kpi({ icon: Icon, label, value, hint, href }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; hint?: string; href?: string }) {
  const body = (
    <div className="h-full rounded-2xl bg-white p-5 ring-1 ring-ink/5 transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between text-ink-soft">
        <span className="text-sm">{label}</span>
        <Icon className="size-4" />
      </div>
      <p className="mt-2 font-display text-3xl font-bold">{value}</p>
      {hint && (
        <p className="mt-1 flex items-center gap-1 text-xs text-ink-soft">
          {hint}
          {href && <ArrowRight className="size-3" />}
        </p>
      )}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
