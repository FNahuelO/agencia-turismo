import { apiJson } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Índice público de la API (sin autenticación). */
export function GET() {
  return apiJson({
    name: "TravelAr API",
    version: "v1",
    auth: "Authorization: Bearer <API key>",
    endpoints: [
      { method: "GET", path: "/api/v1/products", scope: "catalog:read", query: "type=package|activity|transfer|hotel, destination=<slug>, locale=es|en|pt" },
      { method: "GET", path: "/api/v1/products/{slug}", scope: "catalog:read", query: "locale" },
      { method: "GET", path: "/api/v1/products/{slug}/availability", scope: "catalog:read", query: "from, to (YYYY-MM-DD)" },
      { method: "GET", path: "/api/v1/destinations", scope: "catalog:read", query: "locale" },
      { method: "GET", path: "/api/v1/rates", scope: "catalog:read" },
      { method: "POST", path: "/api/v1/bookings", scope: "bookings:write" },
      { method: "GET", path: "/api/v1/bookings", scope: "bookings:read", query: "status, limit" },
      { method: "GET", path: "/api/v1/bookings/{code}", scope: "bookings:read" },
    ],
  });
}
