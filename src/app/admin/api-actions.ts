"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { API_SCOPES } from "@/db/schema";
import { generateApiKey } from "@/lib/api";
import { requireSession } from "@/lib/auth";

export type ApiKeyFormState = { error?: string; key?: string; name?: string } | undefined;

const createSchema = z.object({
  name: z.string().trim().min(2, "Poné un nombre para identificar la clave").max(80),
  scopes: z.array(z.enum(API_SCOPES)).min(1, "Elegí al menos un permiso"),
});

/** Devuelve la clave completa una sola vez; en la base queda solo el hash. */
export async function createApiKey(_prev: ApiKeyFormState, fd: FormData): Promise<ApiKeyFormState> {
  const session = await requireSession("admin");
  const parsed = createSchema.safeParse({ name: fd.get("name"), scopes: fd.getAll("scopes") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { key, prefix, keyHash } = generateApiKey();
  await db.insert(schema.apiKeys).values({ ...parsed.data, prefix, keyHash, createdBy: session.name });
  revalidatePath("/admin/api");
  return { key, name: parsed.data.name };
}

export async function revokeApiKey(fd: FormData) {
  await requireSession("admin");
  await db.update(schema.apiKeys).set({ revokedAt: new Date() }).where(eq(schema.apiKeys.id, Number(fd.get("id"))));
  revalidatePath("/admin/api");
}
