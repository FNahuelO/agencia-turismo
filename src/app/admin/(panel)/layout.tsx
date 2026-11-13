import { and, count, eq, sql } from "drizzle-orm";
import { Sidebar } from "@/components/admin/sidebar";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const [[{ n }], [{ alerts }]] = await Promise.all([
    db.select({ n: count() }).from(schema.leads).where(eq(schema.leads.status, "nuevo")),
    db
      .select({ alerts: sql<number>`count(distinct ${schema.bookingEvents.bookingId})`.mapWith(Number) })
      .from(schema.bookingEvents)
      .where(and(eq(schema.bookingEvents.level, "alerta"), eq(schema.bookingEvents.resolved, false))),
  ]);

  return (
    <div className="min-h-dvh bg-sand">
      <Sidebar user={{ name: session.name, role: session.role }} newLeads={n} bookingAlerts={alerts} />
      <div className="lg:pl-64">
        <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">{children}</div>
      </div>
    </div>
  );
}
