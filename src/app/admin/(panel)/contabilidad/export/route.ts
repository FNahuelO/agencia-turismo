import { ACCOUNT_LABELS, getLedger, monthRange } from "@/lib/accounting";
import { getSession } from "@/lib/auth";

function csvCell(value: unknown) {
  const s = value == null ? "" : String(value);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  if (!(await getSession())) return new Response("No autorizado", { status: 401 });
  const { month, from, to } = monthRange(new URL(request.url).searchParams.get("mes") ?? undefined);
  const entries = await getLedger(from, to);

  const header = ["Fecha", "Tipo", "Origen", "Cuenta", "Moneda", "Ingreso", "Egreso", "Descripción"];
  const lines = entries
    .slice()
    .reverse()
    .map((e) =>
      [e.date, e.direction, e.source, ACCOUNT_LABELS[e.account], e.currency, e.direction === "ingreso" ? e.amount : "", e.direction === "egreso" ? e.amount : "", e.description]
        .map(csvCell)
        .join(","),
    );
  const csv = "\uFEFF" + [header.map(csvCell).join(","), ...lines].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="caja-${month}.csv"`,
    },
  });
}
