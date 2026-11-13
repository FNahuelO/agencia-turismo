import { cache } from "react";
import { db, schema } from "@/db";

export const SETTINGS_DEFAULTS = {
  brandName: "TravelAr Turismo",
  heroTitle: "Argentina de punta a punta",
  heroSubtitle: "Viajes en bus y aéreos con coordinación permanente y tarifa accesible. Hace más de 15 años que salimos desde Ituzaingó.",
  phone: "+54 11 3947-8823",
  whatsapp: "5491139478823",
  email: "info@travelarturismo.com.ar",
  instagram: "travelar.turismo",
  facebook: "TravelAr Turismo",
  address: "Coronel Zufrategui 689, Oficina 3",
  city: "Ituzaingó, Buenos Aires",
  postalCode: "B1714",
  hours: "Lunes a viernes de 10 a 18 hs · Sábados de 10 a 13 hs",
  legajo: "18309",
  googleRating: "4.8",
  googleReviews: "833",
  googleReviewsUrl: "https://www.google.com/maps/search/TravelAr+Turismo+Ituzaing%C3%B3",
  googlePlaceId: "",
  reviewsSource: "todas",
  reviewsMinRating: "4",
  reviewsCount: "3",
  reviewsAutoPublish: "1",
  reviewsLastSync: "",
  yearsActive: "15",
  onlineBooking: "1",
  bankName: "",
  bankHolder: "",
  bankCuit: "",
  bankCbu: "",
  bankAlias: "",
  heroTitleEn: "Argentina from end to end",
  heroSubtitleEn: "Bus and flight trips with a tour leader on every departure and fair prices. Departing from Ituzaingó for over 15 years.",
  heroTitlePt: "A Argentina de ponta a ponta",
  heroSubtitlePt: "Viagens de ônibus e avião com guia acompanhante e preço acessível. Há mais de 15 anos saindo de Ituzaingó.",
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
