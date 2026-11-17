import { cache } from "react";
import { db, schema } from "@/db";

export const SETTINGS_DEFAULTS = {
  brandName: "Agencia de Turismo",
  heroTitle: "Tu próximo viaje empieza acá",
  heroSubtitle: "Paquetes en bus y aéreos con coordinación y precios claros. Armamos salidas grupales por todo el país.",
  phone: "",
  whatsapp: "",
  email: "info@ejemplo.com",
  instagram: "",
  facebook: "",
  address: "",
  city: "",
  postalCode: "",
  hours: "Lunes a viernes de 10 a 18 hs · Sábados de 10 a 13 hs",
  legajo: "",
  googleRating: "",
  googleReviews: "",
  googleReviewsUrl: "",
  googlePlaceId: "",
  reviewsSource: "todas",
  reviewsMinRating: "4",
  reviewsCount: "3",
  reviewsAutoPublish: "1",
  reviewsLastSync: "",
  yearsActive: "10",
  onlineBooking: "1",
  bankName: "",
  bankHolder: "",
  bankCuit: "",
  bankCbu: "",
  bankAlias: "",
  heroTitleEn: "Your next trip starts here",
  heroSubtitleEn: "Bus and flight packages with on-trip coordination and clear prices. Group departures across the country.",
  heroTitlePt: "Sua próxima viagem começa aqui",
  heroSubtitlePt: "Pacotes de ônibus e avião com acompanhamento e preços claros. Saídas em grupo por todo o país.",
  hoursEn: "Monday to Friday 10 am to 6 pm · Saturdays 10 am to 1 pm",
  hoursPt: "Segunda a sexta das 10h às 18h · Sábados das 10h às 13h",
  emailCustomers: "1",
  emailAdminAlerts: "1",
  notifyEmail: "",
};

export type SiteSettings = typeof SETTINGS_DEFAULTS;
export type SettingKey = keyof SiteSettings;

export const SETTINGS_LABELS: Record<SettingKey, string> = {
  brandName: "Nombre de la marca",
  heroTitle: "Título principal (home)",
  heroSubtitle: "Bajada de la home",
  phone: "Teléfono visible",
  whatsapp: "WhatsApp (solo números, con 549)",
  email: "Email",
  instagram: "Instagram (sin @)",
  facebook: "Facebook",
  address: "Dirección",
  city: "Localidad",
  postalCode: "Código postal",
  hours: "Horarios de atención",
  legajo: "Legajo EVT",
  googleRating: "Puntaje en Google",
  googleReviews: "Cantidad de reseñas en Google",
  googleReviewsUrl: "Link a las reseñas de Google",
  googlePlaceId: "Place ID de Google",
  reviewsSource: "Reseñas a mostrar",
  reviewsMinRating: "Puntaje mínimo",
  reviewsCount: "Cantidad en la home",
  reviewsAutoPublish: "Publicar automáticamente las nuevas de Google",
  reviewsLastSync: "Última sincronización",
  yearsActive: "Años de trayectoria",
  onlineBooking: "Reservas online habilitadas",
  bankName: "Banco",
  bankHolder: "Titular de la cuenta",
  bankCuit: "CUIT",
  bankCbu: "CBU / CVU",
  bankAlias: "Alias",
  heroTitleEn: "Título principal (inglés)",
  heroSubtitleEn: "Bajada de la home (inglés)",
  heroTitlePt: "Título principal (portugués)",
  heroSubtitlePt: "Bajada de la home (portugués)",
  hoursEn: "Horarios (inglés)",
  hoursPt: "Horarios (portugués)",
  emailCustomers: "Emails automáticos a los pasajeros",
  emailAdminAlerts: "Avisos internos por email",
  notifyEmail: "Email que recibe los avisos internos (si queda vacío, el de contacto)",
};

type Translatable = "heroTitle" | "heroSubtitle" | "hours";

/** Valor de un setting traducible en el idioma pedido; si está vacío cae al español. */
export function localizedSetting(settings: SiteSettings, key: Translatable, locale: string) {
  if (locale === "en") return settings[`${key}En`] || settings[key];
  if (locale === "pt") return settings[`${key}Pt`] || settings[key];
  return settings[key];
}

export async function setSettings(values: Partial<SiteSettings>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    await db.insert(schema.settings).values({ key, value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } });
  }
}

export const getSettings = cache(async (): Promise<SiteSettings> => {
  const rows = await db.select().from(schema.settings);
  const merged = { ...SETTINGS_DEFAULTS };
  for (const row of rows) {
    if (row.key in merged) merged[row.key as SettingKey] = row.value;
  }
  return merged;
});
