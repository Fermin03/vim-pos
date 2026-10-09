// El contrato de la función `tienda` (docs/superpowers/plans/anexos/2026-10-09-tienda-5-…, §1) visto
// desde la app: los tipos de cada respuesta y un lector `unknown → tipo | null` por cada una.
//
// Un JSON que no cumple la forma EXACTA es `null`, entero: quien lo recibe lo trata como «servicio
// no disponible». Nunca se pinta un menú a medias ni un precio que no se pudo leer. Los lectores
// copian solo los campos que conocen: lo que la función añada mañana no llega a la pantalla solo.
import { leerHorario, type Horario } from "@vim/fecha";

export type Modo = "RECOGER" | "DOMICILIO";
export type Pago = "EFECTIVO" | "TARJETA";

export type Zona = { id: string; nombre: string; /** Sin el IVA que el ticket pueda sumarle: el envío exacto lo da `cotizar`. */ costo_mxn: string };
export type Sucursal = {
  id: string; nombre: string; telefono: string | null; direccion: string | null;
  recoger: boolean; domicilio: boolean; horario: Horario;
  /** null = recibe pedidos ahora en ese modo; si no, el motivo (FUERA_DE_HORARIO, EN_PAUSA, CAJA_NO_LISTA…). */
  estado: { recoger: string | null; domicilio: string | null };
  zonas: Zona[];
};
export type Negocio = {
  slug: string; nombre: string; logo_ruta: string | null; color: string; descripcion: string | null;
  pago_efectivo: boolean; pago_tarjeta: boolean; sucursales: Sucursal[];
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
};

/** Con 200 el pedido EXISTE aunque lo demás venga en null (caso degradado): se va al seguimiento. */
export type PedidoCreado = { codigo: string; folio_corto: string | null; total_mxn: string | null; vence_aceptacion: string | null };

export const ESTADOS_DE_PEDIDO = ["EN_PROCESO", "EN_PREPARACION", "EN_CAMINO", "LISTO_PARA_RECOGER", "ENTREGADO", "CANCELADO"] as const;
export type EstadoDePedido = (typeof ESTADOS_DE_PEDIDO)[number];
export type Seguimiento = {
  folio_corto: string; modo: Modo; estado: EstadoDePedido;
  /** Solo si está cancelado: SIN_RESPUESTA, AGOTADO, CERRADO, SATURADO u OTRO. */
  motivo: string | null;
  renglones: { nombre: string; cantidad: number; detalle: string | null }[];
  subtotal_mxn: string; envio_total_mxn: string; total_mxn: string; pago: Pago;
  recibido_at: string; sucursal: { nombre: string; telefono: string | null };
};

export type ErrorDeTienda = { error: string; detalle: string | null };

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
const MODOS = ["RECOGER", "DOMICILIO"] as const, PAGOS = ["EFECTIVO", "TARJETA"] as const;

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

export const negocioDe = lector((x): Negocio => {
  const n = obj(x);
  return {
    slug: con(FORMA_SLUG)(n.slug), nombre: txt(n.nombre), logo_ruta: txtONull(n.logo_ruta),
    color: con(/^#[0-9a-fA-F]{6}$/)(n.color), descripcion: txtONull(n.descripcion),
    pago_efectivo: bool(n.pago_efectivo), pago_tarjeta: bool(n.pago_tarjeta),
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
  };
});

/** Solo el código es obligatorio: sin él no hay cómo seguir el pedido. Lo demás, raro = ausente. */
export const pedidoDe = lector((x): PedidoCreado => {
  const p = obj(x);
  const oNull = (v: unknown, forma: RegExp) => (typeof v === "string" && forma.test(v) ? v : null);
  return {
    codigo: con(FORMA_CODIGO)(p.codigo), folio_corto: oNull(p.folio_corto, /^[A-Za-z0-9-]{1,20}$/),
    total_mxn: oNull(p.total_mxn, /^\d+\.\d{2}$/), vence_aceptacion: oNull(p.vence_aceptacion, /^[0-9T:.+Z -]{10,40}$/),
  };
});

export const seguimientoDe = lector((x): Seguimiento => {
  const s = obj(x), suc = obj(s.sucursal);
  return {
    folio_corto: txt(s.folio_corto), modo: uno(s.modo, MODOS), estado: uno(s.estado, ESTADOS_DE_PEDIDO), motivo: txtONull(s.motivo),
    renglones: lista(s.renglones, renglon),
    subtotal_mxn: importe(s.subtotal_mxn), envio_total_mxn: importe(s.envio_total_mxn), total_mxn: importe(s.total_mxn),
    pago: uno(s.pago, PAGOS), recibido_at: txt(s.recibido_at),
    sucursal: { nombre: txt(suc.nombre), telefono: txtONull(suc.telefono) },
  };
});

/**
 * El `{error, detalle?}` de un rechazo. Lo que no parezca un código de la función (una página de
 * error del hosting, un JSON cualquiera) es `porDefecto`: nunca se enseña ni se interpreta.
 */
export function errorDe(x: unknown, porDefecto = "SERVICIO_NO_DISPONIBLE"): ErrorDeTienda {
  const o = typeof x === "object" && x !== null ? (x as Obj) : {};
  if (typeof o.error !== "string" || !/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(o.error) || o.error.length > 64) return { error: porDefecto, detalle: null };
  return { error: o.error, detalle: typeof o.detalle === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(o.detalle) ? o.detalle : null };
}
