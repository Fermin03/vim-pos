"use client";
import { PageBody, PageHeader } from "./page-header";
import { PedirModulo } from "./pedir-modulo";
import { LEALTAD_INCLUYE, mensajeQuieroLealtad } from "../lib/lealtad-plan";

/** Lo que ve en Lealtad un negocio que todavía no tiene el programa (ADR 0030). */
export function LealtadSinContratar() {
  return (
    <>
      <PageHeader titulo="Lealtad" subtitulo="Premia a los clientes que vuelven." />
      <PageBody>
        <PedirModulo
          titulo="Un programa de lealtad para tu negocio"
          texto="Tus clientes ganan algo cada vez que compran y lo usan en su siguiente visita. Tú decides cómo ganan y qué reciben."
          incluye={LEALTAD_INCLUYE}
          cierre="Si te interesa, escríbenos y lo activamos contigo."
          boton="Preguntar por el programa de lealtad"
          mensaje={mensajeQuieroLealtad}
        />
      </PageBody>
    </>
  );
}
