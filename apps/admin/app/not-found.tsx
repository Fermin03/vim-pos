import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 text-center">
      <div className="font-display text-[88px] font-bold leading-none tracking-tighter text-[#ECECE9] select-none">404</div>
      <h1 className="mt-2 max-w-md font-display text-[26px] font-semibold tracking-tight">No encontramos esta página</h1>
      <p className="mt-2 max-w-md text-[14.5px] leading-relaxed text-ink-3">
        La página que buscas no existe o fue movida. Revisa la dirección o vuelve al panel para continuar.
      </p>
      <Link href="/dashboard" className="mt-7 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-[14px] font-semibold text-white transition hover:brightness-95">
        Ir al panel
      </Link>
    </main>
  );
}
