import { actualizacionPendiente, evaluarAcceso, type Directivas } from "./directivas";

/* Lo último que se supo de las directivas, vivo mientras dure la app. `useAcceso` arranca de
   aquí para que una pantalla que se vuelve a montar (la de inicio, cada vez que el cajero
   regresa) no muestre por un instante accesos que el negocio tiene apagados. La primera
   pintura tras abrir la app sigue arrancando sin módulos: no hay nada que recordar todavía. */
let ultimas: Directivas | null = null;

export function ultimasDirectivas(): Directivas | null {
  return ultimas;
}

/** Guarda una lectura buena; una fallida (`null`) no borra lo último que se supo. */
export function recordarDirectivas(d: Directivas | null): void {
  if (d) ultimas = d;
}

export function accesoDe(d: Directivas | null) {
  return { ...evaluarAcceso(d), modulos: d?.modulos ?? {}, actualizacion: actualizacionPendiente(d) };
}
