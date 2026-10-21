import type { Metadata } from "next";

export const metadata: Metadata = { title: "No encontramos esta página", robots: { index: false, follow: false } };

export default function NoEncontrada() {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <h1 className="font-display text-24 font-semibold">No encontramos esta página</h1>
      <p className="text-16 leading-relaxed text-ink-2">
        Revisa que la dirección esté bien escrita, o pídele al restaurante que te comparta su enlace otra vez.
      </p>
    </main>
  );
}
