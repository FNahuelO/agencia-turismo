import { revalidatePath } from "next/cache";
import { expireBookings } from "@/lib/bookings";
import { sendBookingReminders } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  const expired = await expireBookings();
  if (expired) revalidatePath("/", "layout");
  const reminders = await sendBookingReminders();
  return Response.json({ expired, reminders });
}
