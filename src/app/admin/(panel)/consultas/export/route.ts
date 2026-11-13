import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { LEAD_STATUSES, type LeadStatus } from "@/db/schema";
import { getSession } from "@/lib/auth";

function csvCell(value: unknown) {
  const s = value == null ? "" : String(value);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  if (!(await getSession())) return new Response("No autorizado", { status: 401 });
  const estado = new URL(request.url).searchParams.get("estado") as LeadStatus | null;

  const rows = await db.query.leads.findMany({
    where: estado && LEAD_STATUSES.includes(estado) ? eq(schema.leads.status, estado) : undefined,
    orderBy: desc(schema.leads.createdAt),
    with: { package: true, departure: true },
  });

  const header = ["Fecha", "Nombre", "Teléfono", "Email", "Pasajeros", "Paquete", "Salida", "Estado", "Origen", "Mensaje", "Notas"];
  const lines = rows.map((l) =>
    [
      l.createdAt.toISOString(),
      l.name,
      l.phone,
      l.email,
      l.passengers,
      l.package ? `${l.package.title} (${l.package.days}d)` : "",
      l.departure?.date,
      l.status,
      l.source,
      l.message,
      l.notes,
    ]
      .map(csvCell)
      .join(","),
  );
  const csv = "\uFEFF" + [header.map(csvCell).join(","), ...lines].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="consultas-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
