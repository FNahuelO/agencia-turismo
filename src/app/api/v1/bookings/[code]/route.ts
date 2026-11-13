import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, apiJson, apiRoute } from "@/lib/api";
import { bookingWith, serializeBooking } from "@/lib/api-data";

export const dynamic = "force-dynamic";

/** Solo devuelve reservas creadas con la misma clave. */
export const GET = apiRoute("bookings:read", async (req, client, ctx: RouteContext<"/api/v1/bookings/[code]">) => {
  const { code } = await ctx.params;
  const booking = await db.query.bookings.findFirst({
    where: and(eq(schema.bookings.code, code.toUpperCase()), eq(schema.bookings.apiKeyId, client.id)),
    with: bookingWith,
  });
  if (!booking) throw new ApiError(404, "booking_not_found", "Reserva inexistente o creada con otra clave");
  return apiJson({ data: serializeBooking(req, booking) });
});
