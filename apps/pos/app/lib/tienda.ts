"use client";
import { deviceClient, employeeClient } from "./supabase";
import { esGiroBelleza, esGiroComidaRapida, esGiroTienda } from "@vim/db/operacion";
import type { NombreIcono } from "@vim/ui/styles";
import type { Producto } from "./catalogo";
import type { ModoServicio } from "./carrito";
import type { DatosCaja } from "./turno";

/** La caja de tienda es para los giros de tienda; todo lo demás queda como estaba. */
export const esTienda = (caja: DatosCaja | null): boolean => esGiroTienda(caja?.giro);

/** La caja de belleza (agenda, 0218) es la de tienda con su propia barra y el calendario. */
export const esBelleza = (caja: DatosCaja | null): boolean => esGiroBelleza(caja?.giro);

/** La caja de belleza vende como la de tienda (Venta, devoluciones por renglón, cuentas). */
export const comoTienda = (caja: DatosCaja | null): boolean => esTienda(caja) || esBelleza(caja);

/** Comida rápida, food truck y cafetería: la barra de abajo de la tienda, pero ticket, comanda y cobro de restaurante (no son `comoTienda`). */
export const esComidaRapida = (caja: DatosCaja | null): boolean => esGiroComidaRapida(caja?.giro);

/**
 * Al cobrar en comida rápida: «PREGUNTA» abre «¿Es para llevar o para comer aquí?», «NOMBRE» solo pide
 * el nombre (food truck sin dónde comer, con `pedirNombre`) y `null` cobra directo. Pick-up, domicilio
 * y apps ya traen su modo: no se pregunta. Los demás giros nunca ven la ventana.
 */
export function preguntaServicio(
  giro: string | null | undefined,
  cfg: { pedirNombre: boolean; tieneDondeComer: boolean },
  modoActual: ModoServicio,
): "PREGUNTA" | "NOMBRE" | null {
  if (!esGiroComidaRapida(giro) || (modoActual !== "PARA_LLEVAR" && modoActual !== "COMER_AQUI")) return null;
  if (giro !== "FOODTRUCK" || cfg.tieneDondeComer) return "PREGUNTA";
  return cfg.pedirNombre ? "NOMBRE" : null;
}

/**
 * Comida rápida: ¿falta preguntar el tipo de servicio de esta venta? Sí si aún no se guardó, o si es
 * una cuenta de mostrador guardada sin contestar (retomada de «en espera», o guardada por un
 * descuento o un canje). Una cuenta abierta desde una lista (mesa, pick-up, domicilio) no.
 */
export function faltaPreguntarServicio(ticketId: string | null, contestado: string | null, desdeLista: boolean, retomadoId: string | null): boolean {
  if (!ticketId) return true;
  return contestado !== ticketId && (!desdeLista || retomadoId === ticketId);
}

/** Navegación: la barra de abajo en vez de la pantalla de inicio. El ticket y el cobro los decide `comoTienda`. */
export const conBarraAbajo = (caja: DatosCaja | null): boolean => comoTienda(caja) || esComidaRapida(caja);

/** Destinos de la barra inferior de la caja de tienda (pos-retail.md, «Versión 2»), la de belleza y la de comida rápida. */
export type SeccionTienda = "panel" | "inventario" | "transacciones" | "notificaciones" | "configuracion" | "calendario" | "clientes" | "pedidos";

export type Destino = { seccion: SeccionTienda; etiqueta: string; icono: NombreIcono };

const DESTINOS_TIENDA: Destino[] = [
  { seccion: "panel", etiqueta: "Cobrar", icono: "caja" },
  { seccion: "inventario", etiqueta: "Inventario", icono: "etiqueta" },
  { seccion: "transacciones", etiqueta: "Transacciones", icono: "recibo" },
  { seccion: "notificaciones", etiqueta: "Notificaciones", icono: "megafono" },
  { seccion: "configuracion", etiqueta: "Más", icono: "menu" },
];

const DESTINOS_BELLEZA: Destino[] = [
  { seccion: "calendario", etiqueta: "Calendario", icono: "calendario" },
  { seccion: "panel", etiqueta: "Cobrar", icono: "caja" },
  { seccion: "clientes", etiqueta: "Clientes", icono: "personas" },
  { seccion: "transacciones", etiqueta: "Transacciones", icono: "recibo" },
  { seccion: "configuracion", etiqueta: "Más", icono: "menu" },
];

/** Comida rápida y food truck: «Pedidos» junta lo que espera atención; Inventario solo con el módulo `existencias`. */
const DESTINOS_COMIDA: Destino[] = [
  { seccion: "panel", etiqueta: "Cobrar", icono: "caja" },
  { seccion: "pedidos", etiqueta: "Pedidos", icono: "para-llevar" },
  { seccion: "inventario", etiqueta: "Inventario", icono: "etiqueta" },
  { seccion: "transacciones", etiqueta: "Transacciones", icono: "recibo" },
  { seccion: "notificaciones", etiqueta: "Notificaciones", icono: "megafono" },
  { seccion: "configuracion", etiqueta: "Más", icono: "menu" },
];
const DESTINOS_COMIDA_SIN_INVENTARIO = DESTINOS_COMIDA.filter((d) => d.seccion !== "inventario");

/** La cafetería no lleva «Pedidos»: lo de esa sección vive en «Más». Su barra es la de la tienda (Inventario siempre). */
const esCafeteria = (caja: DatosCaja | null): boolean => caja?.giro === "CAFETERIA";

/**
 * La barra de belleza solo con el módulo `agenda` encendido (`moduloActivo(modulos, "agenda")`): sin
 * él, la caja de belleza es una caja de tienda y no enseña Calendario ni Clientes. `existencias` (el
 * módulo) solo cuenta en comida rápida y food truck: la tienda y la cafetería siempre llevan Inventario.
 */
export const destinosDe = (caja: DatosCaja | null, agenda: boolean, existencias: boolean): Destino[] =>
  esCafeteria(caja) ? DESTINOS_TIENDA
    : esComidaRapida(caja) ? (existencias ? DESTINOS_COMIDA : DESTINOS_COMIDA_SIN_INVENTARIO)
      : esBelleza(caja) && agenda ? DESTINOS_BELLEZA : DESTINOS_TIENDA;

/** Donde abre la caja y a donde regresa Escape: el calendario en belleza con agenda, el Panel (Cobrar) en tienda y en comida rápida. */
export const seccionInicial = (caja: DatosCaja | null, agenda: boolean): SeccionTienda => (esBelleza(caja) && agenda ? "calendario" : "panel");

/** Globo de «Pedidos» (comida rápida): lo que espera atención. Apps por aceptar, pedidos de la tienda
 *  por aceptar (pick-up y domicilio; `porAceptarTienda.apps` ya va en `nApps`) y cuentas en espera. */
export const globoPedidos = (nApps: number, porAceptarTienda: { pickup: number; domicilio: number }, nEnEspera: number): number =>
  nApps + porAceptarTienda.pickup + porAceptarTienda.domicilio + nEnEspera;

/** Dónde viven las listas de pedidos (en espera, para llevar, pick-up, domicilio, en línea, mesas):
 *  «Pedidos» en comida rápida y food truck, «Más» en la cafetería; `null` en los demás giros. */
export const seccionDePedidos = (caja: DatosCaja | null): SeccionTienda | null =>
  esCafeteria(caja) ? "configuracion" : esComidaRapida(caja) ? "pedidos" : null;

/** Al salir de una lista de pantalla completa (pick-up, domicilio, en línea, mesas): comida rápida
 *  vuelve a «Pedidos» (la cafetería a «Más»), de donde se entró; los demás se quedan en su sección. */
export const seccionTrasLista = (caja: DatosCaja | null, actual: SeccionTienda): SeccionTienda =>
  seccionDePedidos(caja) ?? actual;

/** Con un cobro o un diálogo encima la barra no navega: sería trabajo que se pierde de vista. */
export const puedeCambiarSeccion = (capasAbiertas: boolean, cobroAbierto: boolean): boolean => !capasAbiertas && !cobroAbierto;

/**
 * Un paso de la fila de agregados con tope de tiempo. Resuelve `true` si `paso` terminó (o falló:
 * el error sube) y `false` si pasaron `ms`: la fila sigue. `vigente()` es false desde el vencimiento:
 * el paso lo consulta antes de escribir, así una respuesta tardía no agrega la pieza después.
 */
export function pasoConLimite(paso: (vigente: () => boolean) => Promise<void>, ms = 8000): Promise<boolean> {
  let vencido = false;
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<boolean>((ok) => { reloj = setTimeout(() => { vencido = true; ok(false); }, ms); });
  const hecho = paso(() => !vencido).then(() => true);
  hecho.catch(() => { /* tras vencer, nadie espera este error */ });
  return Promise.race([hecho, limite]).finally(() => clearTimeout(reloj));
}

/**
 * Recibir mercancía pide el permiso `config.productos`. El POS no trae los permisos del usuario, solo
 * su rol (como los demás ROLES_* de los modales): dueño o administrador. La base decide al final.
 */
export const puedeRecibirMercancia = (rol: string): boolean => rol === "DUENO" || rol === "ADMIN";

export type Existencia = { producto_id: string; sucursal_id: string; cantidad: number; minimo: number | null };
export type EstadoExistencia = "normal" | "pocas" | "agotada";

/**
 * Existencias de todas las sucursales del negocio. En la caja instalada el gateway lee la copia
 * local; en el POS web, la nube bajo RLS. Con `token` va como empleado; sin él, como el dispositivo.
 */
export async function leerExistencias(token?: string): Promise<Existencia[]> {
  const sb = token ? employeeClient(token) : deviceClient;
  const filas: Existencia[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb
      .from("producto_existencias")
      .select("producto_id, sucursal_id, cantidad, minimo")
      .order("sucursal_id").order("producto_id")
      .range(desde, desde + 999);
    if (error) throw new Error(error.message);
    for (const f of data ?? []) {
      filas.push({ producto_id: f.producto_id, sucursal_id: f.sucursal_id, cantidad: Number(f.cantidad), minimo: f.minimo == null ? null : Number(f.minimo) });
    }
    if ((data ?? []).length < 1000) return filas;
  }
}

/** «Pocas» = en el mínimo de la sucursal o debajo; sin mínimo, 2 o menos (plan, decisión 4). */
export function estadoExistencia(cantidad: number, minimo: number | null): EstadoExistencia {
  if (cantidad <= 0) return "agotada";
  return cantidad <= (minimo ?? 2) ? "pocas" : "normal";
}

/** La etiqueta de la tarjeta: solo «pocas» o «agotada». `null` (sin existencias cargadas) tampoco enseña nada. */
export function etiquetaExistencia(estado: EstadoExistencia | null): "pocas" | "agotada" | null {
  return estado === "pocas" || estado === "agotada" ? estado : null;
}

export type PadreTienda = { padre: Producto; hijas: Producto[]; ejes: string[] };

/** Vitrina = padres y productos sin variantes. Las hijas viven dentro de su padre, en el orden recibido. */
export function agruparTienda(productos: Producto[]): { vitrina: Producto[]; padres: Map<string, PadreTienda> } {
  const padres = new Map<string, PadreTienda>();
  for (const p of productos) {
    if (p.variante_ejes?.length) padres.set(p.id, { padre: p, hijas: [], ejes: p.variante_ejes });
  }
  for (const p of productos) {
    if (p.producto_padre_id) padres.get(p.producto_padre_id)?.hijas.push(p);
  }
  return { vitrina: productos.filter((p) => !p.producto_padre_id), padres };
}

/** Sin mayúsculas ni acentos: «camiseta» encuentra «Camíseta». */
export const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** La búsqueda por nombre o SKU de la vitrina: un padre sale si él o alguna de sus hijas coincide. */
export function buscarVitrina(vitrina: Producto[], padres: Map<string, PadreTienda>, texto: string): Producto[] {
  const q = plano(texto.trim());
  const coincide = (p: Producto) =>
    plano(p.nombre).includes(q) || [p.codigo_barras, p.codigo_interno].some((k) => k && plano(k).includes(q));
  return vitrina.filter((p) => coincide(p) || (padres.get(p.id)?.hijas.some(coincide) ?? false));
}

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** Coincidencia exacta: primero código de barras, luego SKU. Nunca un padre (no se vende). */
export function buscarPorCodigo(productos: Producto[], codigo: string): Producto | null {
  const c = norm(codigo);
  if (!c) return null;
  const vendibles = productos.filter((p) => !p.variante_ejes?.length);
  return (
    vendibles.find((p) => p.codigo_barras && norm(p.codigo_barras) === c) ??
    vendibles.find((p) => p.codigo_interno && norm(p.codigo_interno) === c) ??
    null
  );
}

const cantidadDe = (id: string, existencias: Existencia[], sucursalId: string) =>
  existencias.find((e) => e.producto_id === id && e.sucursal_id === sucursalId);

export type CeldaVariante = { hija: Producto; cantidad: number; estado: EstadoExistencia };

/** Columnas = primer eje, renglones = segundo (o `[""]`), en orden de primera aparición entre las hijas. */
export function matrizVariantes(p: PadreTienda, existencias: Existencia[], sucursalId: string) {
  const [ejeCol, ejeRen] = p.ejes;
  const valor = (h: Producto, eje: string | undefined) => (eje ? h.variante_valores?.[eje] ?? "" : "");
  const unicos = (eje: string | undefined) => [...new Set(p.hijas.map((h) => valor(h, eje)))];
  return {
    columnas: unicos(ejeCol),
    renglones: unicos(ejeRen),
    celda(col: string, ren: string): CeldaVariante | null {
      const hija = p.hijas.find((h) => valor(h, ejeCol) === col && valor(h, ejeRen) === ren);
      if (!hija) return null;
      const e = cantidadDe(hija.id, existencias, sucursalId);
      const cantidad = e?.cantidad ?? 0;
      return { hija, cantidad, estado: estadoExistencia(cantidad, e?.minimo ?? null) };
    },
  };
}

/** Lo que dice la tarjeta de la vitrina: piezas, estado y «desde $X» si las variantes difieren de precio. */
export function resumenVitrina(p: Producto, padres: Map<string, PadreTienda>, existencias: Existencia[], sucursalId: string) {
  const hijas = padres.get(p.id)?.hijas;
  if (!hijas) {
    const e = cantidadDe(p.id, existencias, sucursalId);
    const piezas = e?.cantidad ?? 0;
    return { piezas, estado: estadoExistencia(piezas, e?.minimo ?? null), precioDesde: null as number | null };
  }
  const piezas = hijas.reduce((s, h) => s + (cantidadDe(h.id, existencias, sucursalId)?.cantidad ?? 0), 0);
  const precios = hijas.map((h) => h.precio_base_mxn);
  const min = Math.min(...precios);
  return { piezas, estado: estadoExistencia(piezas, null), precioDesde: precios.length && min !== Math.max(...precios) ? min : null };
}

/** Sucursales vivas del negocio, para consultar su existencia desde el selector. */
export async function leerSucursales(token: string): Promise<{ id: string; nombre: string }[]> {
  const { data, error } = await employeeClient(token).from("sucursales").select("id, nombre").is("deleted_at", null).order("nombre");
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * El renglón del ticket de tienda: el nombre del padre y, debajo, «M · Negra · POL-M-NEG» (valores
 * en el orden de los ejes, luego el SKU). Sin el padre en el catálogo se queda el nombre del producto.
 */
export function renglonTienda(p: Producto, productos: Producto[]): { nombre: string; detalle: string | undefined } {
  const padre = p.producto_padre_id ? productos.find((x) => x.id === p.producto_padre_id) : undefined;
  if (p.producto_padre_id && !padre) return { nombre: p.nombre, detalle: undefined };
  const valores = padre?.variante_ejes?.map((e) => p.variante_valores?.[e]).filter(Boolean) ?? [];
  const detalle = [...valores, p.codigo_interno].filter(Boolean).join(" · ");
  return { nombre: padre?.nombre ?? p.nombre, detalle: detalle || undefined };
}

/** ¿Vender `enCarrito` piezas dejaría la existencia de esta sucursal en cero o menos? No impide nada. */
export function sinExistencia(p: Producto, enCarrito: number, existencias: Existencia[] | null, sucursalId: string): boolean {
  // null = todavía no se leyeron: sin datos no se avisa (un aviso falso en cada renglón es peor que ninguno).
  return !!existencias && !!p.controla_existencias && (cantidadDe(p.id, existencias, sucursalId)?.cantidad ?? 0) - enCarrito <= 0;
}

export type Escaneo =
  | { tipo: "ignorar" }
  | { tipo: "cobro" }
  | { tipo: "agregar"; producto: Producto }
  | { tipo: "selector"; padre: Producto }
  | { tipo: "no-encontrado" };

/**
 * Qué hace la caja con un código leído (pos-retail.md, «Escáner»). Bajo un PIN, el aviso de un
 * pedido u otro diálogo se ignora; con el cobro abierto no se agrega nada. El código de un padre
 * abre su selector: un padre nunca llega al ticket.
 */
export function decidirEscaneo(productos: Producto[], codigo: string, { cobroAbierto, ignorar }: { cobroAbierto: boolean; ignorar: boolean }): Escaneo {
  if (ignorar) return { tipo: "ignorar" };
  if (cobroAbierto) return { tipo: "cobro" };
  const producto = buscarPorCodigo(productos, codigo);
  if (producto) return { tipo: "agregar", producto };
  const c = norm(codigo);
  const padre = c ? productos.find((p) => p.variante_ejes?.length && [p.codigo_barras, p.codigo_interno].some((k) => k && norm(k) === c)) : undefined;
  return padre ? { tipo: "selector", padre } : { tipo: "no-encontrado" };
}

/** Un renglón de «Cuentas abiertas» en Transacciones: abiertas de Para llevar y, si quedaron, en espera. */
export type FilaCuenta = { ticketId: string; titulo: string; folio: string | null; monto: number; etiquetaEspera: string | null };

/**
 * Transacciones (pos-retail.md, «Versión 2»): primero las cuentas abiertas, con lo que falta por
 * cobrar (la de un cambio con diferencia solo debe la diferencia); luego las que quedaron en espera
 * de antes, que la tienda ya no crea pero se retoman como siempre.
 */
export function filasCuentas(
  abiertas: { ticketId: string; folio: string | null; cliente: string | null; total: number; pendiente: number }[],
  espera: { ticketId: string; folio: string | null; etiqueta: string; total: number }[],
): FilaCuenta[] {
  return [
    ...abiertas.map((c) => ({ ticketId: c.ticketId, titulo: c.cliente ?? c.folio ?? "Cuenta abierta", folio: c.cliente ? c.folio : null, monto: c.pendiente > 0 ? c.pendiente : c.total, etiquetaEspera: null })),
    ...espera.map((t) => ({ ticketId: t.ticketId, titulo: t.etiqueta, folio: t.folio, monto: t.total, etiquetaEspera: t.etiqueta })),
  ];
}

/** El renglón de una venta como el del ticket: padre y variante si la prenda sigue en el catálogo; si no, el nombre con que se cobró. */
export function renglonVenta(r: { producto_id: string | null; nombre: string }, productos: Producto[]): { nombre: string; detalle: string | undefined } {
  const p = r.producto_id ? productos.find((x) => x.id === r.producto_id) : undefined;
  return p ? renglonTienda(p, productos) : { nombre: r.nombre, detalle: undefined };
}

export type DestinoInventario = { padre: PadreTienda; marcada?: string } | { suelto: Producto };

/**
 * A dónde lleva un código en Inventario (consulta, nunca agrega): una hija abre a su padre con esa
 * celda marcada; el código de un padre abre su matriz; un producto sin variantes, su lista por sucursal.
 */
export function destinoInventario(productos: Producto[], padres: Map<string, PadreTienda>, codigo: string): DestinoInventario | null {
  const hit = buscarPorCodigo(productos, codigo);
  if (hit) {
    const padre = hit.producto_padre_id ? padres.get(hit.producto_padre_id) : undefined;
    if (padre) return { padre, marcada: hit.id };
    return hit.producto_padre_id ? null : { suelto: hit };
  }
  const d = decidirEscaneo(productos, codigo, { cobroAbierto: false, ignorar: false });
  const padre = d.tipo === "selector" ? padres.get(d.padre.id) : undefined;
  return padre ? { padre } : null;
}
