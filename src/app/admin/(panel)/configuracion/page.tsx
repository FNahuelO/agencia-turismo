import { asc } from "drizzle-orm";
import { Trash2 } from "lucide-react";
import { changePassword, createUser, deleteUser, saveSettings } from "@/app/admin/actions";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/admin/client";
import { Card, Field, PageHeader } from "@/components/admin/ui";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { getSettings, SETTINGS_LABELS, type SettingKey } from "@/lib/settings";

export const metadata = { title: "Configuración" };

const GROUPS: { title: string; keys: SettingKey[] }[] = [
  { title: "Home", keys: ["brandName", "heroTitle", "heroSubtitle", "yearsActive"] },
  { title: "Contacto", keys: ["phone", "whatsapp", "email", "instagram", "facebook"] },
  { title: "Oficina", keys: ["address", "city", "postalCode", "hours", "legajo"] },
  { title: "Traducciones del sitio (si quedan vacías se muestra el español)", keys: ["heroTitleEn", "heroSubtitleEn", "heroTitlePt", "heroSubtitlePt", "hoursEn", "hoursPt"] },
  { title: "Reservas online y datos para transferencias", keys: ["onlineBooking", "bankName", "bankHolder", "bankCuit", "bankCbu", "bankAlias"] },
  { title: "Emails (se envían con Resend: ver /admin/emails)", keys: ["emailCustomers", "emailAdminAlerts", "notifyEmail"] },
];

const TOGGLES: Partial<Record<SettingKey, [string, string]>> = {
  onlineBooking: ["Sí: botón «Reservar online» en cada paquete", "No: solo consultas y WhatsApp"],
  emailCustomers: ["Sí: confirmación, pagos, recordatorios y vencimientos", "No"],
  emailAdminAlerts: ["Sí: reservas nuevas, comprobantes y pagos con Mercado Pago", "No"],
};

export default async function ConfiguracionPage() {
  const session = await requireSession();
  const isAdmin = session.role === "admin";
  const [settings, users] = await Promise.all([
    getSettings(),
    isAdmin ? db.select().from(schema.users).orderBy(asc(schema.users.name)) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader title="Configuración" description="Datos de contacto y textos que se muestran en todo el sitio." />
      <div className="space-y-6">
        {isAdmin && (
          <ActionForm action={saveSettings} className="space-y-6">
            {GROUPS.map((g) => (
              <Card key={g.title} title={g.title}>
                <div className="grid gap-4 md:grid-cols-2">
                  {g.keys.map((key) => (
                    <Field key={key} label={SETTINGS_LABELS[key]} className={key.startsWith("heroSubtitle") ? "md:col-span-2" : ""}>
                      {key.startsWith("heroSubtitle") ? (
                        <textarea name={key} defaultValue={settings[key]} rows={2} className="field" />
                      ) : TOGGLES[key] ? (
                        <select name={key} defaultValue={settings[key]} className="field">
                          <option value="1">{TOGGLES[key][0]}</option>
                          <option value="0">{TOGGLES[key][1]}</option>
                        </select>
                      ) : (
                        <input name={key} defaultValue={settings[key]} className="field" />
                      )}
                    </Field>
                  ))}
                </div>
              </Card>
            ))}
            <div className="flex justify-end"><SubmitButton className="btn-primary" pendingText="Guardando...">Guardar configuración</SubmitButton></div>
          </ActionForm>
        )}

        {isAdmin && (
          <Card title="Equipo">
            <ul className="mb-6 divide-y divide-ink/5">
              {users.map((u) => (
                <li key={u.id} className="flex items-center justify-between py-3 text-sm">
                  <span><span className="font-semibold">{u.name}</span> <span className="text-ink-soft">· {u.email} · {u.role}</span></span>
                  {String(u.id) !== session.sub && (
                    <form action={deleteUser}>
                      <input type="hidden" name="id" value={u.id} />
                      <ConfirmButton message={`¿Quitar el acceso a ${u.name}?`} className="rounded-lg p-2 text-ink-soft hover:bg-red-50 hover:text-red-600"><Trash2 className="size-4" /></ConfirmButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
            <ActionForm action={createUser} resetOnSuccess className="grid items-end gap-3 rounded-xl bg-sand/60 p-4 md:grid-cols-5">
              <Field label="Nombre"><input name="name" required className="field" /></Field>
              <Field label="Email"><input name="email" type="email" required className="field" /></Field>
              <Field label="Contraseña"><input name="password" type="password" required minLength={10} className="field" /></Field>
              <Field label="Rol">
                <select name="role" className="field">
                  <option value="editor">Editor (carga paquetes y consultas)</option>
                  <option value="admin">Administrador</option>
                </select>
              </Field>
              <SubmitButton>Agregar usuario</SubmitButton>
            </ActionForm>
          </Card>
        )}

        <Card title="Mi contraseña">
          <ActionForm action={changePassword} resetOnSuccess className="grid items-end gap-3 md:grid-cols-3">
            <Field label="Contraseña actual"><input name="current" type="password" required autoComplete="current-password" className="field" /></Field>
            <Field label="Nueva contraseña"><input name="next" type="password" required minLength={10} autoComplete="new-password" className="field" /></Field>
            <SubmitButton>Cambiar contraseña</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
