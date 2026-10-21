import { RelayAdapter } from "./raw-socket-adapter";

export type ImpresoraWindows = { nombre: string; predeterminada: boolean };

/**
 * Impresora instalada en Windows (USB, serial, o de red con su driver). Para el negocio que ya
 * tiene sus impresoras dadas de alta en el sistema y no hay IP que capturar.
 *
 * Manda los mismos bytes ESC/POS que la genérica de red, pero el relay `/__imprimir` los entrega a
 * la cola de Windows en crudo (`impresoraWindows` en el cuerpo) en vez de abrir un socket.
 *
 * OJO: aquí `ok` significa que la COLA aceptó el trabajo. Con la impresora apagada Windows lo deja
 * encolado y no avisa — no hay forma de saber desde aquí si salió papel.
 */
export class ColaWindowsAdapter extends RelayAdapter {
  constructor(impresora: string, ancho: 58 | 80 = 80) {
    super("Impresora de Windows", { impresoraWindows: impresora }, ancho);
  }
}

/** Impresoras instaladas en esta computadora. `null` = no se pudo saber (fuera de la app de la
 *  caja no existe el relay), que no es lo mismo que una lista vacía. */
export async function listarImpresorasWindows(): Promise<ImpresoraWindows[] | null> {
  try {
    const res = await fetch("/__impresoras", { cache: "no-store" });
    const j: unknown = await res.json();
    if (typeof j !== "object" || j === null) return null;
    const o = j as Record<string, unknown>;
    if (o.ok !== true || !Array.isArray(o.impresoras)) return null;
    return o.impresoras.flatMap((p: unknown) => {
      if (typeof p !== "object" || p === null) return [];
      const r = p as Record<string, unknown>;
      return typeof r.nombre === "string" && r.nombre ? [{ nombre: r.nombre, predeterminada: r.predeterminada === true }] : [];
    });
  } catch {
    return null;
  }
}
