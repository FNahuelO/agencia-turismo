import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ApiScope } from "@/db/schema";

const KEY_PREFIX = "ta_";
/** Pedidos por minuto y por clave. El contador es en memoria (por instancia). */
const RATE_LIMIT = 120;

export function generateApiKey() {
  const key = `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  return { key, prefix: key.slice(0, 10), keyHash: hashApiKey(key) };
}

/** Las claves tienen 192 bits aleatorios: alcanza con SHA-256, sin sal. */
export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export type ApiClient = { id: number; name: string; scopes: ApiScope[] };

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function apiJson(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...init.headers } });
}

function errorResponse(err: ApiError) {
  return apiJson({ error: { code: err.code, message: err.message, ...(err.details !== undefined && { details: err.details }) } }, { status: err.status });
}

const hits = new Map<number, { count: number; reset: number }>();

function checkRate(id: number) {
  const now = Date.now();
  const entry = hits.get(id);
  if (!entry || entry.reset < now) {
    hits.set(id, { count: 1, reset: now + 60_000 });
    return;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT) throw new ApiError(429, "rate_limited", `Límite de ${RATE_LIMIT} pedidos por minuto superado`);
}

/** Valida `Authorization: Bearer <clave>` (o `X-API-Key`) y el permiso pedido. */
export async function authenticate(req: Request, scope: ApiScope): Promise<ApiClient> {
  const header = req.headers.get("authorization");
  const key = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : req.headers.get("x-api-key")?.trim();
  if (!key || !key.startsWith(KEY_PREFIX)) throw new ApiError(401, "unauthorized", "Falta la API key (Authorization: Bearer ta_...)");

  const row = await db.query.apiKeys.findFirst({ where: and(eq(schema.apiKeys.keyHash, hashApiKey(key)), isNull(schema.apiKeys.revokedAt)) });
  if (!row) throw new ApiError(401, "unauthorized", "API key inválida o revocada");
  if (!row.scopes.includes(scope)) throw new ApiError(403, "forbidden", `La clave no tiene el permiso ${scope}`);
  checkRate(row.id);

  await db
    .update(schema.apiKeys)
    .set({ lastUsedAt: new Date(), requestCount: sql`${schema.apiKeys.requestCount} + 1` })
    .where(eq(schema.apiKeys.id, row.id));
  return { id: row.id, name: row.name, scopes: row.scopes };
}

type Handler<C> = (req: Request, client: ApiClient, ctx: C) => Promise<Response>;

/** Envuelve un endpoint: autentica, convierte `ApiError` en JSON y oculta los errores inesperados. */
export function apiRoute<C>(scope: ApiScope, handler: Handler<C>) {
  return async (req: Request, ctx: C) => {
    try {
      const client = await authenticate(req, scope);
      return await handler(req, client, ctx);
    } catch (err) {
      if (err instanceof ApiError) return errorResponse(err);
      console.error("[api]", err);
      return errorResponse(new ApiError(500, "internal_error", "Error interno"));
    }
  };
}

export function siteOrigin(req: Request) {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin).replace(/\/$/, "");
}

export function absoluteUrl(req: Request, path: string | null | undefined) {
  if (!path) return null;
  return /^https?:\/\//.test(path) ? path : `${siteOrigin(req)}${path.startsWith("/") ? "" : "/"}${path}`;
}
