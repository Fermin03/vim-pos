"use client";
import { Button } from "@vim/ui/styles";

/** «Guardar como PDF»: el diálogo de impresión del navegador ofrece guardar en PDF. */
export function BotonImprimir() {
  return (
    <Button type="button" size="lg" className="h-14 w-full text-18" onClick={() => window.print()}>
      Guardar como PDF
    </Button>
  );
}
