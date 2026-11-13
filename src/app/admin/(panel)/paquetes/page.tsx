import Image from "next/image";
import Link from "next/link";
import { and, asc, eq, ilike, sql, type SQL } from "drizzle-orm";
import { BedDouble, Bus, Car, Compass, Eye, EyeOff, Plane, Plus, Star } from "lucide-react";
import { togglePackagePublished } from "@/app/admin/actions";
import { EmptyState, PageHeader, PRODUCT_KIND_META } from "@/components/admin/ui";
import { db, schema } from "@/db";
import { PRODUCT_KINDS, type ProductKind } from "@/db/schema";
import { formatDuration, formatPrice, todayISO } from "@/lib/format";

export const metadata = { title: "Productos" };

const KIND_ICON = { actividad: Compass, traslado: Car, hotel: BedDouble } as const;

export default async function PaquetesPage({ searchParams }: PageProps<"/admin/paquetes">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const filter = typeof sp.filtro === "string" ? sp.filtro : "";
  const tipo = (PRODUCT_KINDS as readonly string[]).includes(String(sp.tipo)) ? (sp.tipo as ProductKind) : null;
  const today = todayISO();
  const { packages, destinations, departures } = schema;

  const upcomingCount = sql<number>`(select count(*)::int from ${departures} d where d.package_id = ${packages.id} and d.date >= ${today} and d.cancelled = false)`.mapWith(Number);
  const conditions: SQL[] = [];
  if (q) conditions.push(ilike(packages.title, `%${q}%`));
  if (filter === "borradores") conditions.push(eq(packages.published, false));
  if (filter === "sin-salidas") conditions.push(sql`${upcomingCount} = 0`, eq(packages.kind, "paquete"));
  if (tipo) conditions.push(eq(packages.kind, tipo));
  const qs = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const merged = { tipo, filtro: filter || null, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const str = params.toString();
    return str ? `/admin/paquetes?${str}` : "/admin/paquetes";
  };

  const rows = await db
    .select({
      id: packages.id,
      slug: packages.slug,
      title: packages.title,
      kind: packages.kind,
      dailyCapacity: packages.dailyCapacity,
      image: packages.image,
      transport: packages.transport,
      days: packages.days,
      nights: packages.nights,
      price: packages.price,
      currency: packages.currency,
      published: packages.published,
      featured: packages.featured,
      destination: destinations.name,
      upcoming: upcomingCount,
    })
    .from(packages)
    .innerJoin(destinations, eq(packages.destinationId, destinations.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(packages.kind), asc(packages.title), asc(packages.days));

  return (
    <>
      <PageHeader
        title="Productos"
        description={`${rows.length} productos. Los paquetes se venden por salidas; las excursiones, traslados y hoteles, cualquier día habilitado con cupo diario.`}
        actions={
          <>
            <Link href="/admin/paquetes/nuevo" className="btn-primary"><Plus className="size-4" /> Nuevo paquete</Link>
            {(["actividad", "traslado", "hotel"] as const).map((k) => (
              <Link key={k} href={`/admin/paquetes/nuevo?tipo=${k}`} className="btn-ghost"><Plus className="size-4" /> {PRODUCT_KIND_META[k].label}</Link>
            ))}
          </>
        }
      />

      <div className="mb-3 flex flex-wrap gap-2">
        {[null, ...PRODUCT_KINDS].map((k) => (
          <Link key={k ?? "todos"} href={qs({ tipo: k })} className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${tipo === k ? "bg-lake text-white" : "bg-white ring-1 ring-ink/10 hover:bg-sand"}`}>
            {k ? PRODUCT_KIND_META[k].plural : "Todos los tipos"}
          </Link>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[
          { key: "", label: "Todos" },
          { key: "sin-salidas", label: "Sin salidas futuras" },
          { key: "borradores", label: "Borradores" },
        ].map((f) => (
          <Link key={f.key} href={qs({ filtro: f.key || null })} className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${filter === f.key ? "bg-ink text-white" : "bg-white ring-1 ring-ink/10 hover:bg-sand"}`}>
            {f.label}
          </Link>
        ))}
        <form className="w-full sm:ml-auto sm:w-auto">
          {filter && <input type="hidden" name="filtro" value={filter} />}
          {tipo && <input type="hidden" name="tipo" value={tipo} />}
          <input name="q" defaultValue={q} placeholder="Buscar producto" className="field py-2 sm:w-56" />
        </form>
      </div>

      {rows.length === 0 ? (
        <EmptyState>No hay productos con este filtro.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-ink/5">
          <table className="w-full text-sm">
            <thead className="bg-sand/60 text-left text-xs text-ink-soft uppercase">
              <tr>
                <th className="px-4 py-3 font-semibold">Producto</th>
                <th className="hidden px-4 py-3 font-semibold md:table-cell">Duración</th>
                <th className="px-4 py-3 font-semibold">Precio</th>
                <th className="hidden px-4 py-3 font-semibold sm:table-cell">Salidas</th>
                <th className="px-4 py-3 text-right font-semibold">Web</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-sand/40">
                  <td className="px-4 py-3">
                    <Link href={`/admin/paquetes/${p.id}`} className="flex items-center gap-3">
                      {p.image ? <Image src={p.image} alt="" width={40} height={40} className="size-10 rounded-lg object-cover" /> : <span className="size-10 rounded-lg bg-sand" />}
                      <span>
                        <span className="flex items-center gap-1.5 font-semibold">
                          {p.title}
                          {p.featured && <Star className="size-3.5 fill-sun text-sun" />}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-ink-soft">
                          {p.kind === "paquete" ? (p.transport === "aereo" ? <Plane className="size-3" /> : <Bus className="size-3" />) : (() => {
                            const Icon = KIND_ICON[p.kind];
                            return <Icon className="size-3" />;
                          })()}
                          {p.kind !== "paquete" && `${PRODUCT_KIND_META[p.kind].label} · `}
                          {p.destination}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">{p.kind === "paquete" ? formatDuration(p.days, p.nights) : "—"}</td>
                  <td className="px-4 py-3 font-medium">
                    {formatPrice(p.price, p.currency)}
                    {p.kind !== "paquete" && <span className="block text-xs font-normal text-ink-soft">{PRODUCT_KIND_META[p.kind].unit}</span>}
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    {p.kind !== "paquete" ? (
                      <span className="text-ink-soft">Diario · cupo {p.dailyCapacity}</span>
                    ) : p.upcoming > 0 ? (
                      <span>{p.upcoming} próximas</span>
                    ) : (
                      <span className="rounded-full bg-sun/20 px-2 py-0.5 text-xs font-semibold">Sin fechas</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form action={togglePackagePublished} className="inline">
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit" title={p.published ? "Publicado (clic para ocultar)" : "Oculto (clic para publicar)"} className={`rounded-lg p-2 ${p.published ? "text-emerald-600 hover:bg-emerald-50" : "text-ink-soft hover:bg-sand"}`}>
                        {p.published ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
