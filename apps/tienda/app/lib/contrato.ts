// El contrato de la función `tienda` (docs/superpowers/plans/anexos/2026-10-09-tienda-5-…, §1) visto
// desde la app: los tipos de cada respuesta y un lector `unknown → tipo | null` por cada una.
//
// Un JSON que no cumple la forma EXACTA es `null`, entero: quien lo recibe lo trata como «servicio
// no disponible». Nunca se pinta un menú a medias ni un precio que no se pudo leer. Los lectores
// copian solo los campos que conocen: lo que la función añada mañana no llega a la pantalla solo.
import { leerHorario, type Horario } from "@vim/fecha";
import type { ItemDeCuerpo } from "./carrito";
import { urlDeReto } from "./verificacion";

export type Modo = "RECOGER" | "DOMICILIO";
/** EFECTIVO y TARJETA se pagan al recibir; EN_LINEA, al pedir, con tarjeta, dentro de la tienda. */
export type Pago = "EFECTIVO" | "TARJETA" | "EN_LINEA";

export type Zona = { id: string; nombre: string; /** Sin el IVA que el ticket pueda sumarle: el envío exacto lo da `cotizar`. */ costo_mxn: string };
/** Un tramo del envío por distancia: hasta `hasta_km` (texto con un decimal, «3.0») cuesta `costo_mxn`. */
export type Tramo = { hasta_km: string; costo_mxn: string };
/**
 * Cómo cobra el envío la tienda en esa sucursal (0185). «Por distancia»: los tramos en orden y el
 * punto de la sucursal, para enseñar el precio mientras se mueve el pin (el que cobra lo da `cotizar`).
 */
export type EnvioDeSucursal =
  | { cobro: "ZONAS" }
  | { cobro: "DISTANCIA"; tramos: Tramo[]; punto: { lat: number; lng: number } };
export type Sucursal = {
  id: string; nombre: string; telefono: string | null; direccion: string | null;
  recoger: boolean; domicilio: boolean; horario: Horario;
  /** null = recibe pedidos ahora en ese modo; si no, el motivo (FUERA_DE_HORARIO, EN_PAUSA, CAJA_NO_LISTA…). */
  estado: { recoger: string | null; domicilio: string | null };
  zonas: Zona[];
  envio: EnvioDeSucursal;
  /** En ESTA sucursal se puede pagar en línea ahora. Falso si la función aún no lo dice. */
  pago_en_linea: boolean;
  /** La public key de la cuenta de Mercado Pago que cobra ahí (pública): con ella se lee la tarjeta. */
  public_key: string | null;
};
export type Negocio = {
  slug: string; nombre: string; logo_ruta: string | null; color: string; descripcion: string | null;
  pago_efectivo: boolean; pago_tarjeta: boolean;
  /** El negocio ofrece pagar en línea. Se ofrece solo en las sucursales que también lo digan. */
  pago_en_linea: boolean;
  /** Modo de prueba: los pagos en línea de esta tienda no son reales (van al ambiente de prueba de Mercado Pago). */
  pago_de_prueba: boolean;
  sucursales: Sucursal[];
};

/** Ojo: las opciones de modificador dicen `agotada`; los productos y las opciones de slot, `agotado`. */
export type Opcion = {
  id: string; nombre: string; precio_extra_mxn: string;
  /** El extra tal como entra al total (0165). Es el que se enseña. */
  precio_extra_final_mxn: string;
  agotada: boolean; es_default: boolean;
};
/** `maximo: null` = sin tope. Mínimo y máximo cuentan CANTIDADES, no opciones distintas. */
export type Grupo = { id: string; nombre: string; minimo: number; maximo: number | null; opciones: Opcion[] };
export type OpcionDeSlot = {
  producto_id: string; nombre: string; precio_extra_mxn: string;
  /** Puede ser negativo en teoría (un descuento por elegirla). */
  precio_extra_final_mxn: string;
  agotado: boolean; es_default: boolean; grupos: Grupo[];
};
export type Slot = { id: string; nombre: string; minimo: number; maximo: number; opciones: OpcionDeSlot[] };
export type Producto = {
  id: string; nombre: string; descripcion: string | null;
  /** Texto libre de la base: úsala SOLO a través de `urlDeFoto` (imagen.ts). */
  imagen_url: string | null;
  precio_mxn: string;
  /** Lo que se cobra por una unidad sin extras (0165). Es el que se enseña. */
  precio_final_mxn: string;
  agotado: boolean; es_combo: boolean;
  /** Vacío en un combo: sus modificadores van en cada opción de slot. */
  grupos: Grupo[];
  slots: Slot[];
};
export type Categoria = { id: string; nombre: string; productos: Producto[] };
export type Menu = { categorias: Categoria[] };

export type Cotizacion = {
  renglones: { nombre: string; cantidad: number; detalle: string | null; total_mxn: string }[];
  subtotal_mxn: string; envio_mxn: string;
  /** Lo que el envío le cuesta al cliente (con IVA si aplica). */
  envio_total_mxn: string;
  total_mxn: string;
  /** Por distancia y con ubicación: la distancia que calculó la base («3.2» km). Si no, null. */
  distancia_km: string | null;
};

/** Con 200 el pedido EXISTE aunque lo demás venga en null (caso degradado): se va al seguimiento. */
export type PedidoCreado = {
  codigo: string; folio_corto: string | null; total_mxn: string | null; vence_aceptacion: string | null;
  /**
   * Solo en un pedido que se paga en línea: PAGADO (el cobro pasó), POR_CONFIRMAR (no se supo: el
   * seguimiento lo dirá) o VERIFICACION (el banco quiere confirmar con el cliente antes de cobrar:
   * todavía no se cobró nada). Un cobro rechazado no llega aquí: es un error (`PAGO_RECHAZADO`).
   */
  pago: { estado: "PAGADO" | "POR_CONFIRMAR" } | PagoEnVerificacion | null;
};
/**
 * El banco pide confirmar el pago (3D Secure). `url`: la página del reto, ya comprobada (https y de
 * Mercado Pago: `urlDeReto`); null si no vino o no era de ahí, y entonces se le pregunta al servidor.
 */
export type PagoEnVerificacion = { estado: "VERIFICACION"; url: string | null };
/** Lo que contesta `verificacion`: cómo va el reto del banco de ese pedido. Un rechazo es un error (`PAGO_RECHAZADO`). */
export type Verificacion = { estado: "PAGADO" | "POR_CONFIRMAR" } | PagoEnVerificacion;

export const ESTADOS_DE_PEDIDO = ["POR_PAGAR", "EN_PROCESO", "EN_PREPARACION", "EN_CAMINO", "LISTO_PARA_RECOGER", "ENTREGADO", "CANCELADO"] as const;
export type EstadoDePedido = (typeof ESTADOS_DE_PEDIDO)[number];
/**
 * Cómo va el pago de un pedido en línea: pagado; devolviéndose; devuelto; no se cobró; o todavía no
 * se sabe si el cobro pasó (se está confirmando con Mercado Pago).
 */
export const ESTADOS_DE_PAGO = ["PAGADO", "DEVOLUCION_EN_PROCESO", "DEVUELTO", "SIN_PAGO", "POR_CONFIRMAR"] as const;
export type EstadoDePago = (typeof ESTADOS_DE_PAGO)[number];
export type Seguimiento = {
  folio_corto: string; modo: Modo; estado: EstadoDePedido;
  /** Solo si está cancelado: SIN_RESPUESTA, AGOTADO, CERRADO, SATURADO, OTRO, SIN_PAGO o POR_CONFIRMAR. */
  motivo: string | null;
  /** Lo del pago en línea; null en un pedido que se paga al recibir. */
  enLinea: {
    estado: EstadoDePago; propina_mxn: string; total_a_pagar_mxn: string;
    /** El pago de ESTE pedido se hizo en modo de prueba: no fue real. */
    dePrueba: boolean;
  } | null;
  renglones: { nombre: string; cantidad: number; detalle: string | null }[];
  subtotal_mxn: string; envio_total_mxn: string; total_mxn: string; pago: Pago;
  recibido_at: string; sucursal: { nombre: string; telefono: string | null };
};

// ── Cuentas (entrega 6). Nunca sale el id de la cuenta ni el del negocio. ───────────────────────
export type Cuenta = { nombre: string; apellido: string | null; email: string; /** 10 dígitos. */ telefono: string; /** `YYYY-MM-DD`. */ fecha_nacimiento: string | null };
export type DireccionGuardada = {
  id: string; etiqueta: string; calle: string; numero_exterior: string; numero_interior: string | null; colonia: string;
  codigo_postal: string; ciudad: string; estado: string; referencias: string | null;
};
export type MiCuenta = { cuenta: Cuenta; direcciones: DireccionGuardada[] };
/** `cuenta: null` = el correo ya tenía cuenta: no hay sesión (decisión 4: no se dice que ya existía). */
export type Registro = { cuenta: Cuenta | null };
export type PedidoDeCuenta = {
  /** De qué sucursal fue: «pedir de nuevo» arma el carrito de esa. */
  sucursal_id: string;
  folio_corto: string; recibido_at: string; modo: Modo; estado: EstadoDePedido; total_mxn: string;
  renglones: { nombre: string; cantidad: number; detalle: string | null }[];
  /** Lo que se pidió, con la forma del carrito, para «pedir de nuevo». null = ya no se puede (pedido anonimizado, o no se pudo leer). */
  items: ItemDeCuerpo[] | null;
};

/**
 * `hasta`: solo con el pago en línea en pausa tras un rechazo por riesgo (`PAGO_EN_PAUSA`, o
 * `PAGO_RECHAZADO` con detalle `RIESGO`): hasta cuándo, en ISO. Ausente o null en todo lo demás.
 */
export type ErrorDeTienda = { error: string; detalle: string | null; hasta?: string | null };

export const FORMA_SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
export const FORMA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const FORMA_CODIGO = /^[A-Za-z0-9_-]{22}$/;

// ── Piezas: cada una devuelve el valor o lanza `Mal`; `lector` lo convierte en null ──────────────
class Mal extends Error {}
const mal = (): never => { throw new Mal(); };
type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj => (typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Obj) : mal());
const txt = (x: unknown): string => (typeof x === "string" ? x : mal());
const txtONull = (x: unknown): string | null => (x === null || x === undefined ? null : txt(x));
const bool = (x: unknown): boolean => (typeof x === "boolean" ? x : mal());
const entero = (x: unknown): number => (typeof x === "number" && Number.isInteger(x) && x >= 0 ? x : mal());
const con = (forma: RegExp) => (x: unknown): string => (typeof x === "string" && forma.test(x) ? x : mal());
const uuid = con(FORMA_UUID);
const importe = con(/^\d+\.\d{2}$/);
const importeConSigno = con(/^-?\d+\.\d{2}$/);
const uno = <T extends string>(x: unknown, valores: readonly T[]): T => (valores.includes(x as T) ? (x as T) : mal());
const lista = <T>(x: unknown, f: (y: unknown) => T): T[] => (Array.isArray(x) ? x.map(f) : mal());
const lector = <T>(f: (x: unknown) => T) => (x: unknown): T | null => {
  try {
    return f(x);
  } catch (e) {
    if (e instanceof Mal) return null;
    throw e;
  }
};
const MODOS = ["RECOGER", "DOMICILIO"] as const, PAGOS = ["EFECTIVO", "TARJETA", "EN_LINEA"] as const;

function grupo(x: unknown): Grupo {
  const g = obj(x);
  return {
    id: uuid(g.id), nombre: txt(g.nombre), minimo: entero(g.minimo), maximo: g.maximo === null ? null : entero(g.maximo),
    opciones: lista(g.opciones, (y) => {
      const o = obj(y);
      return { id: uuid(o.id), nombre: txt(o.nombre), precio_extra_mxn: importe(o.precio_extra_mxn),
               precio_extra_final_mxn: importe(o.precio_extra_final_mxn), agotada: bool(o.agotada), es_default: bool(o.es_default) };
    }),
  };
}

function slot(x: unknown): Slot {
  const s = obj(x);
  return {
    id: uuid(s.id), nombre: txt(s.nombre), minimo: entero(s.minimo), maximo: entero(s.maximo),
    opciones: lista(s.opciones, (y) => {
      const o = obj(y);
      return { producto_id: uuid(o.producto_id), nombre: txt(o.nombre), precio_extra_mxn: importeConSigno(o.precio_extra_mxn),
               precio_extra_final_mxn: importeConSigno(o.precio_extra_final_mxn), agotado: bool(o.agotado),
               es_default: bool(o.es_default), grupos: lista(o.grupos, grupo) };
    }),
  };
}

/**
 * El envío de una sucursal. Sin la clave (una función anterior a la 0185) es «Por zonas», como antes.
 * «Por distancia» sin tramos o sin punto no se puede pedir a domicilio (la base ya lo dice en su
 * estado); aquí se lee como «Por zonas» para no enseñar un mapa sin nada que calcular.
 */
function envioDe(x: unknown): EnvioDeSucursal {
  if (x === undefined || x === null) return { cobro: "ZONAS" };
  const e = obj(x);
  if (e.cobro !== "DISTANCIA") return { cobro: "ZONAS" };
  const tramos = lista(e.tramos, (y) => { const t = obj(y); return { hasta_km: con(/^\d{1,2}\.\d$/)(t.hasta_km), costo_mxn: importe(t.costo_mxn) }; });
  const p = e.punto === null || e.punto === undefined ? null : obj(e.punto);
  if (!p || typeof p.lat !== "number" || typeof p.lng !== "number" || tramos.length === 0) return { cobro: "ZONAS" };
  return { cobro: "DISTANCIA", tramos, punto: { lat: p.lat, lng: p.lng } };
}

export const negocioDe = lector((x): Negocio => {
  const n = obj(x);
  return {
    slug: con(FORMA_SLUG)(n.slug), nombre: txt(n.nombre), logo_ruta: txtONull(n.logo_ruta),
    color: con(/^#[0-9a-fA-F]{6}$/)(n.color), descripcion: txtONull(n.descripcion),
    pago_efectivo: bool(n.pago_efectivo), pago_tarjeta: bool(n.pago_tarjeta),
    // Solo un `true` cuenta: una función anterior al pago en línea no manda la clave.
    pago_en_linea: n.pago_en_linea === true,
    pago_de_prueba: n.pago_de_prueba === true,
    sucursales: lista(n.sucursales, (y) => {
      const s = obj(y), e = obj(s.estado);
      return {
        id: uuid(s.id), nombre: txt(s.nombre), telefono: txtONull(s.telefono), direccion: txtONull(s.direccion),
        recoger: bool(s.recoger), domicilio: bool(s.domicilio),
        // Un horario mal formado cuenta como cerrado ese día, igual que en la base (0162).
        horario: leerHorario(s.horario),
        estado: { recoger: txtONull(e.recoger), domicilio: txtONull(e.domicilio) },
        zonas: lista(s.zonas, (z) => {
          const zona = obj(z);
          return { id: uuid(zona.id), nombre: txt(zona.nombre), costo_mxn: importe(zona.costo_mxn) };
        }),
        envio: envioDe(s.envio),
        pago_en_linea: s.pago_en_linea === true,
        // Solo con la forma de una public key de Mercado Pago: se le pasa tal cual a su librería.
        public_key: typeof s.public_key === "string" && /^[A-Za-z0-9_-]{20,100}$/.test(s.public_key) ? s.public_key : null,
      };
    }),
  };
});

export const menuDe = lector((x): Menu => ({
  categorias: lista(obj(x).categorias, (y) => {
    const c = obj(y);
    return {
      id: uuid(c.id), nombre: txt(c.nombre),
      productos: lista(c.productos, (z) => {
        const p = obj(z);
        return {
          id: uuid(p.id), nombre: txt(p.nombre), descripcion: txtONull(p.descripcion), imagen_url: txtONull(p.imagen_url),
          precio_mxn: importe(p.precio_mxn), precio_final_mxn: importe(p.precio_final_mxn),
          agotado: bool(p.agotado), es_combo: bool(p.es_combo), grupos: lista(p.grupos, grupo), slots: lista(p.slots, slot),
        };
      }),
    };
  }),
}));

const renglon = (x: unknown) => {
  const r = obj(x);
  return { nombre: txt(r.nombre), cantidad: entero(r.cantidad), detalle: txtONull(r.detalle) };
};

export const cotizacionDe = lector((x): Cotizacion => {
  const c = obj(x);
  return {
    renglones: lista(c.renglones, (y) => ({ ...renglon(y), total_mxn: importe(obj(y).total_mxn) })),
    subtotal_mxn: importe(c.subtotal_mxn), envio_mxn: importe(c.envio_mxn),
    envio_total_mxn: importe(c.envio_total_mxn), total_mxn: importe(c.total_mxn),
    distancia_km: typeof c.distancia_km === "string" && /^\d{1,5}\.\d$/.test(c.distancia_km) ? c.distancia_km : null,
  };
});

/** Solo el código es obligatorio: sin él no hay cómo seguir el pedido. Lo demás, raro = ausente. */
export const pedidoDe = lector((x): PedidoCreado => {
  const p = obj(x);
  const oNull = (v: unknown, forma: RegExp) => (typeof v === "string" && forma.test(v) ? v : null);
  return {
    codigo: con(FORMA_CODIGO)(p.codigo), folio_corto: oNull(p.folio_corto, /^[A-Za-z0-9-]{1,20}$/),
    total_mxn: oNull(p.total_mxn, /^\d+\.\d{2}$/), vence_aceptacion: oNull(p.vence_aceptacion, /^[0-9T:.+Z -]{10,40}$/),
    // Un `pago` raro no tumba la respuesta: el pedido existe. Lo que no sea «pagado» se confirma en su seguimiento.
    pago: typeof p.pago === "object" && p.pago !== null ? pagoDe(p.pago as Obj) : null,
  };
});
/**
 * El estado de un pago en línea, de una lista cerrada. Lo que no se reconoce es POR_CONFIRMAR (lo
 * dirá la página del pedido), nunca «pagado». De la dirección del reto solo pasa la que es de
 * Mercado Pago; cualquier otra clave (y cualquier otra dirección) se queda fuera.
 */
function pagoDe(p: Obj): Verificacion {
  if (p.estado === "VERIFICACION") return { estado: "VERIFICACION", url: urlDeReto(p.url) };
  return { estado: p.estado === "PAGADO" ? "PAGADO" : "POR_CONFIRMAR" };
}
/** `verificacion`: sin `pago` no hay respuesta válida. */
export const verificacionDe = lector((x): Verificacion => pagoDe(obj(obj(x).pago)));

export const seguimientoDe = lector((x): Seguimiento => {
  const s = obj(x), suc = obj(s.sucursal);
  return {
    folio_corto: txt(s.folio_corto), modo: uno(s.modo, MODOS), estado: uno(s.estado, ESTADOS_DE_PEDIDO), motivo: txtONull(s.motivo),
    renglones: lista(s.renglones, renglon),
    subtotal_mxn: importe(s.subtotal_mxn), envio_total_mxn: importe(s.envio_total_mxn), total_mxn: importe(s.total_mxn),
    pago: uno(s.pago, PAGOS), recibido_at: txt(s.recibido_at),
    sucursal: { nombre: txt(suc.nombre), telefono: txtONull(suc.telefono) },
    // Un pedido en línea SIN el estado de su pago no se pinta a medias: es una respuesta ilegible.
    enLinea: s.pago !== "EN_LINEA" ? null : {
      estado: uno(s.pago_estado, ESTADOS_DE_PAGO), propina_mxn: importe(s.propina_mxn), total_a_pagar_mxn: importe(s.total_a_pagar_mxn),
      dePrueba: s.pago_de_prueba === true,
    },
  };
});

/**
 * El `{error, detalle?}` de un rechazo. Lo que no parezca un código de la función (una página de
 * error del hosting, un JSON cualquiera) es `porDefecto`: nunca se enseña ni se interpreta.
 */
export function errorDe(x: unknown, porDefecto = "SERVICIO_NO_DISPONIBLE"): ErrorDeTienda {
  const o = typeof x === "object" && x !== null ? (x as Obj) : {};
  if (typeof o.error !== "string" || !/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(o.error) || o.error.length > 64) return { error: porDefecto, detalle: null };
  return {
    error: o.error, detalle: typeof o.detalle === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(o.detalle) ? o.detalle : null,
    // Solo una fecha con la forma que manda la función (ISO en UTC): cualquier otra cosa no es una hora.
    ...(typeof o.hasta === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/.test(o.hasta) && { hasta: o.hasta }),
  };
}

// ── Cuentas ──────────────────────────────────────────────────────────────────────────────────────
function cuenta(x: unknown): Cuenta {
  const c = obj(x);
  return {
    nombre: txt(c.nombre), apellido: txtONull(c.apellido), email: txt(c.email), telefono: txt(c.telefono),
    fecha_nacimiento: c.fecha_nacimiento === null || c.fecha_nacimiento === undefined ? null : con(/^\d{4}-\d{2}-\d{2}$/)(c.fecha_nacimiento),
  };
}
const direcciones = (x: unknown): DireccionGuardada[] => lista(obj(x).direcciones, (y) => {
  const d = obj(y);
  return {
    id: uuid(d.id), etiqueta: txt(d.etiqueta), calle: txt(d.calle), numero_exterior: txt(d.numero_exterior),
    numero_interior: txtONull(d.numero_interior), colonia: txt(d.colonia), codigo_postal: txt(d.codigo_postal),
    ciudad: txt(d.ciudad), estado: txt(d.estado), referencias: txtONull(d.referencias),
  };
});

const cantidad = (x: unknown): number => (entero(x) >= 1 ? (x as number) : mal());
const modificadores = (x: unknown) => lista(x, (y) => {
  const m = obj(y);
  return { opcion_id: uuid(m.opcion_id), cantidad: cantidad(m.cantidad) };
});
/** Los `items` de un pedido con la forma EXACTA del carrito (`ItemDeCuerpo`), o null. Solo las claves conocidas. */
const itemsDe = lector((x): ItemDeCuerpo[] => lista(x, (y) => {
  const i = obj(y);
  return {
    producto_id: uuid(i.producto_id), cantidad: cantidad(i.cantidad),
    ...(i.nota !== undefined && i.nota !== null && { nota: txt(i.nota) }),
    ...(i.modificadores !== undefined && { modificadores: modificadores(i.modificadores) }),
    ...(i.componentes !== undefined && { componentes: lista(i.componentes, (z) => {
      const c = obj(z);
      return { grupo_id: uuid(c.grupo_id), producto_id: uuid(c.producto_id), cantidad: cantidad(c.cantidad), modificadores: modificadores(c.modificadores ?? []) };
    }) }),
  };
}));

/** `{ ok: true }`: salir, pedir recuperación, cambiar contraseña, eliminar la cuenta. */
export const okDe = lector((x): true => (obj(x).ok === true ? true : mal()));
/** `registrar`: con la cuenta (alta, sesión abierta) o sin ella (el correo ya tenía cuenta). */
export const registroDe = lector((x): Registro => {
  const r = obj(x);
  if (r.ok !== true) mal();
  return { cuenta: r.cuenta === undefined || r.cuenta === null ? null : cuenta(r.cuenta) };
});
/** `entrar`, `recuperar_aplicar`, `cuenta_guardar`: sin cuenta no hay respuesta válida. */
export const cuentaDe = lector((x): Cuenta => cuenta(obj(x).cuenta));
export const miCuentaDe = lector((x): MiCuenta => ({ cuenta: cuenta(obj(x).cuenta), direcciones: direcciones(x) }));
export const direccionesDe = lector(direcciones);
/** Unos `items` ilegibles no tumban la lista: ese pedido se ve, pero no se puede «pedir de nuevo». */
export const pedidosDe = lector((x): PedidoDeCuenta[] => lista(obj(x).pedidos, (y) => {
  const p = obj(y);
  return {
    sucursal_id: uuid(p.sucursal_id), folio_corto: txt(p.folio_corto), recibido_at: txt(p.recibido_at), modo: uno(p.modo, MODOS), estado: uno(p.estado, ESTADOS_DE_PEDIDO),
    total_mxn: importe(p.total_mxn), renglones: lista(p.renglones, renglon), items: itemsDe(p.items),
  };
}));
