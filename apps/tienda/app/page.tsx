import type { Metadata } from "next";
import { LogoVim } from "@vim/ui/styles";

// La raíz no es la tienda de nadie: cada negocio vive en /<su dirección>. Fuera de buscadores.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Raiz() {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <LogoVim />
      <h1 className="text-20 font-semibold">Pedidos en línea</h1>
      <p className="text-16 text-ink-2">Para pedir, abre el enlace que te compartió el restaurante.</p>
    </main>
  );
}
