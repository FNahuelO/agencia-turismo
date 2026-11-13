import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, ExternalLink, Trash2 } from "lucide-react";
import { deleteDestination, saveDestination } from "@/app/admin/actions";
import { ActionForm, ConfirmButton, FormAlert, SubmitButton } from "@/components/admin/client";
import { DestinationTranslations } from "@/components/admin/translations";
import { Card, Field, PageHeader } from "@/components/admin/ui";
import { db, schema } from "@/db";
import { REGIONS } from "@/db/schema";
import { getSession } from "@/lib/auth";

export const metadata = { title: "Editar destino" };

export default async function DestinoEditPage({ params, searchParams }: PageProps<"/admin/destinos/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === "nuevo";
  const dest = isNew ? null : await db.query.destinations.findFirst({ where: eq(schema.destinations.id, Number(id)) });
  if (!isNew && !dest) notFound();
  const session = await getSession();

  return (
    <>
      <Link href="/admin/destinos" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink"><ArrowLeft className="size-4" /> Destinos</Link>
      <PageHeader
        title={isNew ? "Nuevo destino" : dest!.name}
        actions={dest && <Link href={`/destinos/${dest.slug}`} target="_blank" className="btn-ghost"><ExternalLink className="size-4" /> Ver en la web</Link>}
      />
      {sp.error === "tiene-paquetes" && (
        <FormAlert tone="error" title="No se pudo eliminar" message="El destino tiene paquetes asociados. Mové o borrá esos paquetes primero." className="mb-4" />
      )}
      <ActionForm action={saveDestination}>
        {dest && <input type="hidden" name="id" value={dest.id} />}
        <Card>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Nombre"><input name="name" required defaultValue={dest?.name} className="field" /></Field>
            <Field label="Región">
              <select name="region" defaultValue={dest?.region ?? "Buenos Aires"} className="field">
                {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Provincia"><input name="province" defaultValue={dest?.province} className="field" /></Field>
            <Field label="Resumen" className="md:col-span-3" hint="Una línea. Se usa en tarjetas y en la descripción para Google."><input name="summary" maxLength={300} defaultValue={dest?.summary} className="field" /></Field>
            <Field label="Descripción" className="md:col-span-3" hint="Texto largo para la página del destino: qué ver, mejor época, qué llevar. Ayuda mucho al SEO.">
              <textarea name="description" rows={6} defaultValue={dest?.description} className="field" />
            </Field>
            <div className="relative aspect-square overflow-hidden rounded-xl bg-sand">
              {dest?.image && <Image src={dest.image} alt="" fill sizes="240px" className="object-cover" />}
            </div>
            <div className="space-y-4 md:col-span-2">
              <Field label="Subir imagen"><input name="imageFile" type="file" accept="image/*" className="field" /></Field>
              <Field label="o URL de imagen"><input name="image" defaultValue={dest?.image ?? ""} className="field" /></Field>
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="featured" defaultChecked={dest?.featured} className="size-4 accent-lake" /> Destacado en la home</label>
            </div>
          </div>
          <div className="mt-6">
            <p className="mb-3 text-sm font-semibold">Traducciones (inglés y portugués)</p>
            <DestinationTranslations i18n={dest?.i18n} />
          </div>
          <div className="mt-6 flex justify-end"><SubmitButton className="btn-primary" pendingText="Guardando...">Guardar</SubmitButton></div>
        </Card>
      </ActionForm>
      {dest && session?.role === "admin" && (
        <form action={deleteDestination} className="mt-6 flex justify-end">
          <input type="hidden" name="id" value={dest.id} />
          <ConfirmButton message="¿Eliminar este destino?" className="btn text-red-600 hover:bg-red-50"><Trash2 className="size-4" /> Eliminar destino</ConfirmButton>
        </form>
      )}
    </>
  );
}
