/**
 * Qué avisos del panel cerró esta persona con la "×". Se guarda en el navegador (localStorage):
 * es una comodidad de quien mira, no un dato del negocio — otro usuario u otro equipo los ve.
 *
 * La CLAVE de cada aviso lleva lo que lo hace distinto ("sello:URGENTE:2026-12-01"): cerrar "tu
 * sello vence en 30 días" no esconde "vence en 7" ni "ya venció", que son otra clave.
 */
const LLAVE = "vim.admin.avisos-cerrados";
const MAXIMO = 60;

type Almacen = Pick<Storage, "getItem" | "setItem">;

export function leerCerrados(almacen: Almacen | null | undefined): string[] {
  try {
    const crudo = almacen?.getItem(LLAVE);
    const lista: unknown = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return []; // modo privado, almacenamiento bloqueado o JSON roto: como si no hubiera cerrado nada
  }
}

/** Devuelve la lista nueva (las más recientes al final, con tope para que no crezca sin fin). */
export function cerrarAviso(almacen: Almacen | null | undefined, clave: string): string[] {
  const lista = [...leerCerrados(almacen).filter((c) => c !== clave), clave].slice(-MAXIMO);
  try {
    almacen?.setItem(LLAVE, JSON.stringify(lista));
  } catch {
    /* sin almacenamiento: se cierra solo por esta visita */
  }
  return lista;
}
