import Image from "next/image";
import { redirect } from "next/navigation";
import { login } from "@/app/admin/actions";
import { ActionForm, SubmitButton } from "@/components/admin/client";
import { getSession } from "@/lib/auth";

export const metadata = { title: "Ingresar" };

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  if (await getSession()) redirect("/admin");
  const { next } = await searchParams;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink px-5">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-2xl">
        <Image src="/logo.webp" alt="Logo" width={139} height={48} className="mx-auto h-12 w-auto" priority />
        <h1 className="mt-6 text-center font-display text-2xl font-bold">Backoffice</h1>
        <p className="mt-1 text-center text-sm text-ink-soft">Ingresá con tu cuenta del equipo</p>
        <ActionForm action={login} className="mt-8 space-y-4">
          <input type="hidden" name="next" value={typeof next === "string" ? next : ""} />
          <label className="block">
            <span className="label">Email</span>
            <input name="email" type="email" required autoComplete="username" className="field" />
          </label>
          <label className="block">
            <span className="label">Contraseña</span>
            <input name="password" type="password" required autoComplete="current-password" className="field" />
          </label>
          <SubmitButton className="btn-primary w-full" pendingText="Ingresando...">Ingresar</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
