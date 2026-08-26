import type { ReactNode } from "react";

/** Aviso de que una pantalla del panel todavía NO llega a la caja.
 *
 * POR QUÉ EXISTE
 *
 * Promociones y Reservaciones tienen su pantalla completa aquí —se crean, se
 * editan, se guardan— y el POS no las conoce: cero referencias en `apps/pos`
 * fuera de los tipos generados de la base.
 *
 * Es el peor tipo de hueco porque NO SE VE COMO UN HUECO. El menú está, la
 * pantalla se ve terminada, y el problema aparece cuando alguien ya confió en
 * ella. Ya pasó una vez: un "2x1" creado en junio que nunca descontó un peso.
 *
 * DOS DECISIONES, Y LAS DOS SE TOMARON MIRANDO QUÉ PIERDE EL USUARIO:
 *
 *   · Se avisa, NO se esconde el menú. Esconderlo evita el tropiezo pero borra
 *     la señal de que viene en camino; a un cliente que pregunta "¿tienen
 *     promociones?" se le puede decir «sí, y ya lo ves en el panel».
 *
 *   · NO se desactiva el alta. Fue lo primero que se pensó —una pantalla que
 *     dice "muy pronto" y deja guardar parece contradecirse— y es un error:
 *     una promoción registrada sirve de referencia para aplicar el descuento a
 *     mano, y una reserva anotada sirve de agenda aunque la caja no la vea.
 *     Guardar aquí NO es la trampa; la trampa es creer que se aplica solo. Por
 *     eso el aviso dice qué sí funciona y con qué se suple mientras tanto.
 *
 * Se retira el día que la caja las conozca.
 */
export function AvisoSinConectar({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      className="mb-4 rounded-lg border border-[#F0DCC0] bg-[#FCF3E6] px-4 py-3"
    >
      <p className="text-[13px] font-semibold text-warning">{titulo}</p>
      <p className="mt-1 text-[12.5px] leading-snug text-ink-2">{children}</p>
    </div>
  );
}
