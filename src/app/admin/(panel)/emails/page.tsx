import Link from "next/link";
import { and, count, desc, eq, type SQL } from "drizzle-orm";
import { retry, sendTest } from "@/app/admin/email-actions";
import { ActionForm, SubmitButton } from "@/components/admin/client";
import { Badge, Card, EMAIL_KIND_LABELS, EMAIL_STATUS_META, EmptyState, PageHeader } from "@/components/admin/ui";
import { db, schema } from "@/db";
import { EMAIL_STATUSES, type EmailStatus } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { emailConfigured, emailFrom } from "@/lib/email/send";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Emails" };

const { emailLog } = schema;
const dateTime = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function EmailsPage({ searchParams }: PageProps<"/admin/emails">) {
  const sp = await searchParams;
  const estado = EMAIL_STATUSES.includes(sp.estado as EmailStatus) ? (sp.estado as EmailStatus) : undefined;
  const conditions: SQL[] = [];
  if (estado) conditions.push(eq(emailLog.status, estado));

  const [rows, counts, settings, session] = await Promise.all([
    db.query.emailLog.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      orderBy: desc(emailLog.createdAt),
      limit: 200,
      columns: { html: false, text: false },
      with: { booking: { columns: { id: true, code: true } }, quote: { columns: { id: true, code: true } } },
    }),
    db.select({ status: emailLog.status, n: count() }).from(emailLog).groupBy(emailLog.status),
    getSettings(),
    getSession(),
  ]);
  const byStatus = new Map(counts.map((c) => [c.status, c.n]));
  const configured = emailConfigured();

  return (
    <>
      <PageHeader title="Emails" description="Confirmaciones, pagos, recordatorios y avisos internos que manda el sistema." />

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Configuración">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-ink-soft">Resend</dt><dd className={configured ? "font-semibold text-emerald-700" : "font-semibold text-red-600"}>{configured ? "Configurado" : "Falta RESEND_API_KEY"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-soft">Remitente</dt><dd className="text-right">{emailFrom()}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-soft">Emails a pasajeros</dt><dd>{settings.emailCustomers === "1" ? "Activados" : "Desactivados"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-soft">Avisos internos</dt><dd className="text-right">{settings.emailAdminAlerts === "1" ? settings.notifyEmail || settings.email : "Desactivados"}</dd></div>
          </dl>
          <p className="mt-4 text-xs text-ink-soft">
            Variables de entorno: <code>RESEND_API_KEY</code> y <code>EMAIL_FROM</code> (por ejemplo <code>TravelAr Turismo &lt;reservas@tudominio.com&gt;</code>, con el dominio verificado en Resend). Sin dominio verificado, Resend solo entrega a la casilla de tu cuenta. Los interruptores están en <Link href="/admin/configuracion" className="text-lake hover:underline">Configuración</Link>.
          </p>
        </Card>
        <Card title="Qué se manda">
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
            <li>Al pasajero, en su idioma: reserva recibida (con datos para transferir), pago acreditado, recordatorio de seña 12 h antes del vencimiento, recordatorio de saldo 3 días antes, reserva vencida o cancelada, y cotizaciones.</li>
            <li>A la agencia: reserva nueva, comprobante para revisar y pago aprobado por Mercado Pago.</li>
          </ul>
          {session?.role === "admin" && (
            <ActionForm action={sendTest} className="mt-4 flex gap-2">
              <input name="to" type="email" required defaultValue={settings.notifyEmail || settings.email} className="field" />
              <SubmitButton pendingText="Enviando...">Probar</SubmitButton>
            </ActionForm>
          )}
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Chip href="/admin/emails" active={!estado} label="Todos" />
        {EMAIL_STATUSES.map((s) => (
          <Chip key={s} href={`/admin/emails?estado=${s}`} active={estado === s} label={`${EMAIL_STATUS_META[s].label} (${byStatus.get(s) ?? 0})`} />
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState>Todavía no se mandaron emails.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-ink/5">
          <table className="w-full text-sm">
            <thead className="border-b border-ink/5 text-left text-xs text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Destinatario y asunto</th>
                <th className="px-4 py-3 font-medium">Ref.</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {rows.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-soft">{dateTime.format(m.createdAt)}</td>
                  <td className="px-4 py-3">{EMAIL_KIND_LABELS[m.kind]}</td>
                  <td className="px-4 py-3">
                    <p className="max-w-80 truncate font-medium">{m.subject}</p>
                    <p className="text-xs text-ink-soft">{m.to}</p>
                    {m.error && <p className="text-xs text-red-600">{m.error}</p>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {m.booking && <Link href={`/admin/reservas/${m.booking.id}`} className="text-lake hover:underline">{m.booking.code}</Link>}
                    {m.quote && <Link href={`/admin/cotizaciones/${m.quote.id}`} className="text-lake hover:underline">{m.quote.code}</Link>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Badge meta={EMAIL_STATUS_META[m.status]} />
                      {(m.status === "error" || m.status === "omitido") && configured && (
                        <form action={retry}>
                          <input type="hidden" name="id" value={m.id} />
                          <SubmitButton className="text-xs text-lake hover:underline">Reintentar</SubmitButton>
                        </form>
                      )}
                    </div>
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

function Chip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link href={href} className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${active ? "bg-ink text-white" : "bg-white ring-1 ring-ink/10 hover:bg-sand"}`}>
      {label}
    </Link>
  );
}
