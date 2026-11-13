import Image from "next/image";
import Link from "next/link";
import { asc, count, eq } from "drizzle-orm";
import { Plus, Star } from "lucide-react";
import { PageHeader } from "@/components/admin/ui";
import { db, schema } from "@/db";
import { REGIONS } from "@/db/schema";

export const metadata = { title: "Destinos" };

export default async function DestinosAdminPage() {
  const rows = await db
    .select({
      id: schema.destinations.id,
      name: schema.destinations.name,
      region: schema.destinations.region,
      province: schema.destinations.province,
      image: schema.destinations.image,
      featured: schema.destinations.featured,
      packages: count(schema.packages.id),
    })
    .from(schema.destinations)
    .leftJoin(schema.packages, eq(schema.packages.destinationId, schema.destinations.id))
    .groupBy(schema.destinations.id)
    .orderBy(asc(schema.destinations.name));

  return (
    <>
      <PageHeader
        title="Destinos"
        description="Agrupan los paquetes y generan una página propia para posicionar en Google."
        actions={<Link href="/admin/destinos/nuevo" className="btn-primary"><Plus className="size-4" /> Nuevo destino</Link>}
      />
      <div className="space-y-8">
        {REGIONS.map((region) => {
          const items = rows.filter((r) => r.region === region);
          if (!items.length) return null;
          return (
            <section key={region}>
              <h2 className="mb-3 font-display text-xl font-bold">{region}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((d) => (
                  <Link key={d.id} href={`/admin/destinos/${d.id}`} className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-ink/5 hover:shadow-md">
                    {d.image ? <Image src={d.image} alt="" width={48} height={48} className="size-12 rounded-xl object-cover" /> : <span className="size-12 rounded-xl bg-sand" />}
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 font-semibold">{d.name}{d.featured && <Star className="size-3.5 fill-sun text-sun" />}</p>
                      <p className="text-xs text-ink-soft">{d.province} · {d.packages} paquetes</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
