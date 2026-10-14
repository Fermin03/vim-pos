import type { ReactNode, SVGProps } from "react";

/**
 * Los iconos de las categorías del menú, como `d` de un solo trazo. La categoría guarda el NOMBRE
 * (`star`, `burger`…) en la base de datos: los nombres no cambian aunque cambie el dibujo.
 */
export const ICONOS_CATEGORIA: Record<string, string> = {
  star: "M12 3L14.6 9L21.1 9.6L16.2 14L17.6 20.4L12 17L6.4 20.4L7.8 14L2.9 9.6L9.4 9z",
  burger: "M4 10.5a8 6.5 0 0 1 16 0zM3.5 14h17M5 17.5h14v1a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z",
  fries: "M5.5 10.5l1.6 8.9a2 2 0 0 0 2 1.6h5.8a2 2 0 0 0 2-1.6l1.6-8.9M5.5 10.5c2 1.5 4.2 2 6.5 2s4.5-.5 6.5-2M8.5 10.5V5M11 11.5V3M13.5 11.5V4.5M16 10.5V6",
  cup: "M6 4h12l-1.4 15.2a2 2 0 0 1-2 1.8H9.4a2 2 0 0 1-2-1.8L6 4zM6.6 10h10.8",
  cake: "M4 20.5h16M5.5 20.5V14a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v6.5M5.5 16c1.1 0 1.1 1 2.2 1s1.1-1 2.15-1 1.1 1 2.15 1 1.1-1 2.15-1 1.1 1 2.15 1 1.1-1 2.2-1M12 12V8.5M12 5.5h.01",
  tag: "M3.5 5.5a2 2 0 0 1 2-2h5.7a2 2 0 0 1 1.4.6l7.8 7.8a2 2 0 0 1 0 2.8l-5.7 5.7a2 2 0 0 1-2.8 0L4.1 12.6a2 2 0 0 1-.6-1.4zM8 8h.01",
};

/**
 * El juego de iconos de VIM POS (docs/diseno/iconos.md): lienzo de 24, solo trazo, grosor 1.75.
 * Las flechas y los chevrones se dibujan una vez y se giran.
 *
 * Es una función y no un objeto suelto para que el JSX no se evalúe al importar el paquete: las
 * pruebas de `lib/` que arrastran `@vim/ui` corren sin React a la vista y tronaban.
 */
const dibujar = () => ({
  mas: <path d="M12 5v14M5 12h14" />,
  menos: <path d="M5 12h14" />,
  cerrar: <path d="M6 6l12 12M18 6 6 18" />,
  palomita: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  editar: <path d="M4 20l1.2-4.8L16.4 4a2.1 2.1 0 0 1 3 0l.6.6a2.1 2.1 0 0 1 0 3L8.8 18.8 4 20zM14 6.4l3.6 3.6" />,
  eliminar: <path d="M4 7h16M9.5 7V5A1.5 1.5 0 0 1 11 3.5h2A1.5 1.5 0 0 1 14.5 5v2M6 7l.9 12.2a2 2 0 0 0 2 1.8h6.2a2 2 0 0 0 2-1.8L18 7M10 11v6M14 11v6" />,
  buscar: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8" /></>,
  menu: <path d="M4 6.5h16M4 12h16M4 17.5h16" />,
  retroceso: <path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-1.6-.8L3 12l4.4-6.2A2 2 0 0 1 9 5zM12 9.5l5 5M17 9.5l-5 5" />,
  "flecha-izquierda": <path d="M20 12H4M10 6l-6 6 6 6" />,
  "flecha-arriba": <g transform="rotate(90 12 12)"><path d="M20 12H4M10 6l-6 6 6 6" /></g>,
  "flecha-derecha": <g transform="rotate(180 12 12)"><path d="M20 12H4M10 6l-6 6 6 6" /></g>,
  "flecha-abajo": <g transform="rotate(270 12 12)"><path d="M20 12H4M10 6l-6 6 6 6" /></g>,
  "tendencia-alza": <g transform="rotate(135 12 12)"><path d="M20 12H4M10 6l-6 6 6 6" /></g>,
  "tendencia-baja": <g transform="rotate(225 12 12)"><path d="M20 12H4M10 6l-6 6 6 6" /></g>,
  "chevron-derecha": <path d="M9 5.5l6.5 6.5L9 18.5" />,
  "chevron-abajo": <g transform="rotate(90 12 12)"><path d="M9 5.5l6.5 6.5L9 18.5" /></g>,
  "chevron-izquierda": <g transform="rotate(180 12 12)"><path d="M9 5.5l6.5 6.5L9 18.5" /></g>,
  descargar: <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14" />,
  transferencia: <path d="M4 8h16M16.5 4.5 20 8l-3.5 3.5M20 16H4M7.5 12.5 4 16l3.5 3.5" />,
  devolver: <path d="M8.5 14.5 4 10l4.5-4.5M4 10h11a5 5 0 0 1 0 10h-3" />,
  actualizar: <path d="M20 12a8 8 0 1 1-8-8c2.2 0 4.3.9 5.8 2.4L20 8.5M20 4v4.5h-4.5" />,
  "buscar-actualizacion": <path d="M20 12a8 8 0 1 1-8-8c2.2 0 4.3.9 5.8 2.4L20 8.5M20 4v4.5h-4.5M12 9v5.5M10 12.5l2 2 2-2" />,
  "actualizar-menu": <path d="M4 6.5h12.5a2.75 2.75 0 0 1 0 5.5h-9a2.75 2.75 0 0 0 0 5.5H20M7 3.5l-3 3 3 3M17 14.5l3 3-3 3" />,
  alerta: <path d="M10.3 4.3 2.6 17.5a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0zM12 9.5v4M12 17h.01" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16.5h.01" /></>,
  prohibido: <><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>,
  "sin-conexion": <path d="M3.5 10.5A12 12 0 0 1 6 8.6M9.7 7.2a12 12 0 0 1 10.8 3.3M7.8 14.8a6 6 0 0 1 3.4-1.7M14.9 13.7a6 6 0 0 1 1.3 1.1M12 19h.01M4 4l16 16" />,
  cargando: <><circle cx="12" cy="12" r="9" strokeOpacity=".25" /><path d="M12 3a9 9 0 0 1 9 9" /></>,
  reloj: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  persona: <><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" /></>,
  personas: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5M15.5 4.7a3.5 3.5 0 0 1 0 6.6M18 14.9c2.1.8 3.5 2.6 3.5 5.1" /></>,
  "persona-mas": <><circle cx="9.5" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.9-5.5 6.5-5.5S16 16.7 16 20M19 7v6M16 10h6" /></>,
  "persona-ok": <><circle cx="9.5" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.9-5.5 6.5-5.5S16 16.7 16 20M16 10.5l2 2 4-4" /></>,
  candado: <><rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5" /><path d="M8 10.5v-3a4 4 0 0 1 8 0v3M12 14.5v2.5" /></>,
  llave: <><circle cx="8" cy="16" r="4.5" /><path d="M11.2 12.8 20 4M15.5 8.5l3 3M18.5 5.5l2 2" /></>,
  ojo: <><path d="M2.5 12S6 5.5 12 5.5s9.5 6.5 9.5 6.5S18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  "ojo-tachado": <><path d="M2.5 12S6 5.5 12 5.5s9.5 6.5 9.5 6.5S18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /><path d="M4 4l16 16" /></>,
  salir: <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15.5 7.5 20 12l-4.5 4.5M20 12H9.5" />,
  billete: <><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.75" /><path d="M6.5 12h.01M17.5 12h.01" /></>,
  tarjeta: <><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19M6.5 15H10" /></>,
  "pago-dividido": <path d="M9 6H5a2.5 2.5 0 0 0-2.5 2.5v7A2.5 2.5 0 0 0 5 18h4M15 6h4a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 19 18h-4M12 3.5v3M12 10.5v3M12 17.5v3" />,
  pesos: <path d="M12 2.5v19M16.5 6H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H7" />,
  moneda: <><circle cx="12" cy="12" r="9" /><path d="M12 6.5v11M14.5 8.5H11a1.75 1.75 0 0 0 0 3.5h2a1.75 1.75 0 0 1 0 3.5H9.5" /></>,
  recibo: <><path d="M6 5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v14.5l-2 2-2-2-2 2-2-2-2 2-2-2z" /><path d="M9.5 7.5h5M9.5 11.5h5" /></>,
  cajon: <><rect x="2.5" y="5.5" width="19" height="13" rx="2" /><path d="M2.5 12.5h19M8.8 5.5v7M15.2 5.5v7M10.5 15.5h3" /></>,
  casilla: <path d="M20 12.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9.5M8.5 11.5 12 15l9-9" />,
  mesa: <><ellipse cx="12" cy="7.5" rx="9" ry="3.5" /><path d="M12 11v9.5M8 20.5h8" /></>,
  "para-llevar": <><rect x="5" y="6.5" width="14" height="3" rx="1.5" /><path d="M6.8 9.5l.9 9.7a2 2 0 0 0 2 1.8h4.6a2 2 0 0 0 2-1.8l.9-9.7M12 6.5V3l3-1" /></>,
  bolsa: <path d="M6 8h12l1 10.8a2 2 0 0 1-2 2.2H7a2 2 0 0 1-2-2.2L6 8zM9 11V7a3 3 0 0 1 6 0v4" />,
  moto: <><circle cx="6" cy="17.75" r="2.5" /><circle cx="18.5" cy="17.75" r="2.5" /><rect x="3" y="5.5" width="5.5" height="4.5" rx="1.25" /><path d="M3 12.75h6c1.9 0 3.1.9 3.4 2.75h1.4l3.7-5.4M14.5 5h2.2l1.5 10.2" /></>,
  celular: <><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M10.5 18h3" /></>,
  pin: <><path d="M12 21.5S5 15.3 5 10a7 7 0 0 1 14 0c0 5.3-7 11.5-7 11.5z" /><circle cx="12" cy="10" r="2.5" /></>,
  enviar: <path d="M21 3 10.5 13.5M21 3l-6.5 18-4-7.5-7.5-4L21 3z" />,
  megafono: <path d="M3.5 10.5v3A1.5 1.5 0 0 0 5 15h2.5l9.5 4V5L7.5 9H5a1.5 1.5 0 0 0-1.5 1.5zM8 15.2v3.3a1.5 1.5 0 0 0 3 0v-1.8M20 9.5a4 4 0 0 1 0 5" />,
  calendario: <><rect x="3.5" y="5" width="17" height="16" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  plano: <><rect x="3" y="3" width="18" height="18" rx="2.5" /><path d="M3 9.5h18M9.5 9.5V21" /></>,
  impresora: <><path d="M7 8V3.5h10V8M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M17 11.2h.01" /><rect x="7" y="13.5" width="10" height="7" rx="1" /></>,
  panel: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.75" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.75" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.75" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.75" /></>,
  catalogo: <path d="M12 6.5c-1.8-1.3-4-2-6.5-2H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h1.5c2.5 0 4.7.7 6.5 2 1.8-1.3 4-2 6.5-2H20a1 1 0 0 0 1-1v-12a1 1 0 0 0-1-1h-1.5c-2.5 0-4.7.7-6.5 2zM12 6.5v14" />,
  caja: <path d="M12 3 4 7v10l8 4 8-4V7l-8-4zM4 7l8 4 8-4M12 11v10" />,
  engrane: <><circle cx="12" cy="12" r="3" /><path d="M19 10.1L21.4 10.6L21.4 13.4L19 13.9L18.2 15.6L19.6 17.7L17.7 19.6L15.6 18.2L13.9 19L13.4 21.4L10.6 21.4L10.1 19L8.4 18.2L6.3 19.6L4.4 17.7L5.8 15.6L5 13.9L2.6 13.4L2.6 10.6L5 10.1L5.8 8.4L4.4 6.3L6.3 4.4L8.4 5.8L10.1 5L10.6 2.6L13.4 2.6L13.9 5L15.6 5.8L17.7 4.4L19.6 6.3L18.2 8.4z" /></>,
  grafica: <path d="M4 4v14a2 2 0 0 0 2 2h14M7.5 15l3.5-4.5 3 3L19.5 7" />,
  edificio: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9.5 7.5h.01M14.5 7.5h.01M9.5 11.5h.01M14.5 11.5h.01M10 21v-4.5h4V21" /></>,
  casa: <path d="M4 10.5 12 4l8 6.5V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM9.5 21v-6h5v6" />,
  chat: <path d="M20.5 11.5a8.5 8 0 0 1-12.3 7.1L3.5 20l1.5-4.3a8.5 8 0 1 1 15.5-4.2z" />,
  sobre: <><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M3.5 8l8.5 5.5L20.5 8" /></>,
  "llave-inglesa": <path d="M20.3 6.6A4.5 4.5 0 1 1 17.4 3.7L14.9 6.3l2.8 2.8zM11.6 9.8 3.9 17.5a1.9 1.9 0 0 0 2.6 2.6l7.7-7.7" />,
  estrella: <path d={ICONOS_CATEGORIA.star} />,
  hamburguesa: <path d={ICONOS_CATEGORIA.burger} />,
  papas: <path d={ICONOS_CATEGORIA.fries} />,
  vaso: <path d={ICONOS_CATEGORIA.cup} />,
  pastel: <path d={ICONOS_CATEGORIA.cake} />,
  etiqueta: <path d={ICONOS_CATEGORIA.tag} />,
  bocina: <path d="M3 10.5a1 1 0 0 1 1-1h3l5-4v13l-5-4H4a1 1 0 0 1-1-1zM15.5 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />,
  "bocina-apagada": <path d="M3 10.5a1 1 0 0 1 1-1h3l5-4v13l-5-4H4a1 1 0 0 1-1-1zM4 4l16 16" />,
  tema: <><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" /></>,
  subir: <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 20h14" />,
}) satisfies Record<string, ReactNode>;

export type NombreIcono = keyof ReturnType<typeof dibujar>;
let iconos: ReturnType<typeof dibujar> | undefined;

function Lienzo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={props["aria-label"] ? undefined : true}
      {...props}
    />
  );
}

/** El tamaño y el color los pone quien lo usa (`className`); el icono hereda `currentColor`. */
export function Icono({ nombre, ...props }: { nombre: NombreIcono } & SVGProps<SVGSVGElement>) {
  return <Lienzo {...props}>{(iconos ??= dibujar())[nombre]}</Lienzo>;
}

/** El icono de una categoría por su nombre guardado; uno desconocido o vacío cae en la etiqueta. */
export function IconoCategoria({ icono, ...props }: { icono: string | null | undefined } & SVGProps<SVGSVGElement>) {
  return (
    <Lienzo {...props}>
      <path d={ICONOS_CATEGORIA[icono ?? "tag"] ?? ICONOS_CATEGORIA.tag} />
    </Lienzo>
  );
}
