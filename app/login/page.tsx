import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await auth();

  if (session?.user) {
    redirect("/projects");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-4 py-10 text-slate-100">
      <section className="w-full max-w-sm rounded-lg border border-neutral-800 bg-neutral-900 p-6 shadow-2xl shadow-black/30">
        <div className="mb-6">
          <p className="text-sm font-medium uppercase tracking-wide text-red-300">Draft & Cut</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-50">Revision de animacion</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Accede para revisar escenas, subir versiones y comentar por frame.
          </p>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
