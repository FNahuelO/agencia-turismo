/**
 * Copia los datos de la base SQLite vieja a Postgres (el esquema ya tiene que estar aplicado con `npm run db:push`).
 * Uso: SQLITE_PATH=data/travelar.db npx tsx scripts/migrate-sqlite-to-pg.ts [--replace]
 * Con --replace vacía las tablas de destino antes de copiar.
 */
import { createClient } from "@libsql/client";
import { getTableColumns, getTableName, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

try {
  process.loadEnvFile(".env.local");
} catch {}

const { db, schema, pool } = await import("../src/db");

const s = schema;
/** Orden de carga respetando las claves foráneas. */
const TABLES: PgTable[] = [
  s.settings, s.users, s.policies, s.destinations, s.packages, s.departures, s.leads, s.apiKeys,
  s.bookings, s.bookingPassengers, s.payments, s.bookingEvents, s.exchangeRates, s.reviews,
  s.quotes, s.quoteItems, s.suppliers, s.supplierCosts, s.supplierPayments, s.cashMovements,
  s.emailLog, s.providerConfigs, s.connectorOrders,
];

const sqlitePath = process.env.SQLITE_PATH ?? "data/travelar.db";
const replace = process.argv.includes("--replace");
const sqlite = createClient({ url: `file:${sqlitePath}` });

function convert(columnType: string, value: unknown) {
  if (value === null || value === undefined) return null;
  switch (columnType) {
    case "PgTimestamp":
      return new Date(Number(value) * 1000);
    case "PgBoolean":
      return Boolean(Number(value));
    case "PgJsonb":
      return typeof value === "string" ? JSON.parse(value) : value;
    default:
      return typeof value === "bigint" ? Number(value) : value;
  }
}

if (replace) {
  const names = TABLES.map((t) => `"${getTableName(t)}"`).join(", ");
  await db.execute(sql.raw(`truncate ${names} restart identity cascade`));
}

for (const table of TABLES) {
  const name = getTableName(table);
  const columns = Object.entries(getTableColumns(table));
  const exists = await sqlite.execute({ sql: "select 1 from sqlite_master where type = 'table' and name = ?", args: [name] });
  if (!exists.rows.length) {
    console.log(`${name}: no existe en SQLite, se saltea`);
    continue;
  }
  const { rows } = await sqlite.execute(`select * from "${name}"`);
  const values = rows.map((row) =>
    Object.fromEntries(
      columns.filter(([, col]) => col.name in row).map(([key, col]) => [key, convert(col.columnType, row[col.name])]),
    ),
  );
  for (let i = 0; i < values.length; i += 200) {
    await db.insert(table).values(values.slice(i, i + 200));
  }
  if ("id" in getTableColumns(table)) {
    await db.execute(sql.raw(`select setval(pg_get_serial_sequence('"${name}"', 'id'), coalesce((select max(id) from "${name}"), 0) + 1, false)`));
  }
  console.log(`${name}: ${values.length} filas`);
}

sqlite.close();
await pool.end();
