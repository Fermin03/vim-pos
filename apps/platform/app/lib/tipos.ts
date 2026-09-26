// Tipos y utilidades que comparten la página y los paneles nuevos (Atención, Salud, Bitácora).
// Viven aquí y no en page.tsx para que los componentes se puedan importar sin arrastrar la
// pantalla entera.

export type Api = (path: string, init?: RequestInit) => Promise<Record<string, unknown>>;

export type Severidad = "critica" | "alta" | "media";

export type Alerta = {
  id: string;
  severidad: Severidad;
  tipo: string;
  tenantId: string | null;
  tenant: string;
  titulo: string;
  detalle: string;
};

/** Una caja en la franja "Ahora" de Atención (ver api/alertas). minutos: null = nunca latió. */
export type CajaAhora = { id: string; nombre: string; tenantId: string; tenant: string; minutos: number | null; version: string | null };

export type CajaSalud = {
  id: string;
  nombre: string;
  sucursal: string;
  estado: string;
  ultimaConexion: string | null;
  /** Qué prueba esa fecha: "latido" (la caja reportó estar viva), "conexion", "sync" o "venta". */
  origenSenal: "latido" | "conexion" | "sync" | "venta" | null;
  /** Versión del escritorio. NULL = anterior a 0.4.60, que no late. */
  versionApp: string | null;
  so: string | null;
  /** Pantalla que reportó en su último latido (0121). null = caja anterior a 0.4.87. */
  pantalla: Pantalla | null;
  ultimaIp: string | null;
  horasSinConexion: number | null;
  bloqueoMotivo: string | null;
};

export type SyncEvento = {
  id: string;
  fecha: string;
  total: number;
  exitosas: number;
  errores: number;
  conflictos: number;
  dispositivo: string | null;
  /** Qué filas rechazó la nube y por qué. Vacío cuando el envío entró completo. */
  detalles: { tabla: string; id: string; error: string }[];
};

export type Salud = {
  sucursales: number;
  sucursalesActivas: number;
  cajas: CajaSalud[];
  sync: SyncEvento[];
  ultimaSync: string | null;
  diasSinSync: number | null;
  erroresRecientes: number;
  conflictosRecientes: number;
};

export type Acceso = {
  id: string;
  accion: string;
  tenant: string;
  motivo: string | null;
  ip: string | null;
  fecha: string;
};

/** Antigüedad en palabras: "hace 3 días" se entiende de un vistazo; una fecha ISO no. */
/** Pantalla de una caja: píxeles físicos y escala de Windows (0121). */
export type Pantalla = { ancho: number; alto: number; escala: number };

/** De las tres columnas de `cajas` a una Pantalla, o null si la caja no la ha reportado. */
export function pantallaDeFila(f: { pantalla_ancho: number | null; pantalla_alto: number | null; pantalla_escala: number | string | null }): Pantalla | null {
  if (f.pantalla_ancho == null || f.pantalla_alto == null || f.pantalla_escala == null) return null;
  return { ancho: f.pantalla_ancho, alto: f.pantalla_alto, escala: Number(f.pantalla_escala) };
}

/**
 * "1280×1024 · 125 %". La escala va aparte porque cambia lo que ve la interfaz: 1280×1024 al 125 %
 * es un lienzo de 1024×819 — por eso `areaUtil` también se enseña (en el title de la celda).
 */
export function pantallaTexto(p: Pantalla | null): string {
  if (!p) return "—";
  return `${p.ancho}×${p.alto} · ${Math.round(p.escala * 100)} %`;
}

/** El lienzo que ve la interfaz: los píxeles físicos entre la escala. */
export function areaUtil(p: Pantalla | null): string {
  if (!p) return "";
  return `La interfaz ve ${Math.round(p.ancho / p.escala)}×${Math.round(p.alto / p.escala)}`;
}

export function hace(iso: string | null): string {
  if (!iso) return "nunca";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} ${d === 1 ? "día" : "días"}`;
}

// ── Clientes (lista y ficha) ─────────────────────────────────────────────────────────────────

export type Tenant = {
  id: string; codigo: string; nombre_comercial: string; estado: string; vertical_principal: string;
  fecha_alta: string | null;
  bloqueo_desde?: string | null;
  plan?: { codigo: string; nombre: string; precio_mensual_mxn: number } | null;
  onboarding?: { fase: string; fecha_go_live: string | null } | null;
  /** Resumen de sus cajas por latido (ver api/tenants). */
  cajas?: { total: number; enLinea: number; calladaMin: number | null; sinReportar: number; version: string | null } | null;
};

export type Metricas = {
  totalTenants: number; activos: number; trial: number; suspendidos: number; cancelados: number;
  porVertical: Record<string, number>; mrr: number; foliosVendidos30d: number;
};

export type AddonCatalogo = { id: string; codigo: string; nombre: string; descripcion: string | null; precio_mensual_mxn: number };
export type AddonContratado = {
  id: string; activo: boolean; fecha_inicio: string; fecha_fin: string | null; precio_mensual_mxn: number;
  addon: { id: string; codigo: string; nombre: string; precio_mensual_mxn: number } | null;
};
export type Paquete = { id: string; codigo: string; nombre: string; cantidad_folios: number; precio_mxn: number };
/** `vertical` es null en los planes por tamaño (0086) y solo trae valor en los heredados. */
export type Plan = { id: string; codigo: string; nombre: string; vertical: string | null; precio_mensual_mxn: number };

export type Modulos = {
  permitidos: Record<string, boolean>;
  efectivos: Record<string, boolean>;
  excepciones: { codigo: string; activado: boolean; motivo: string | null; fecha_fin: string | null }[];
};
export type LimitesTrio = { max_sucursales: number | null; max_cajas_por_sucursal: number | null; max_usuarios: number | null };
export type Limites = LimitesTrio & { del_plan: LimitesTrio; excepcion: LimitesTrio & { motivo: string | null } };

export type Detalle = {
  tenant: Record<string, unknown>;
  foliosSaldo: number;
  foliosBase: { mensuales: number; consumidos: number; periodo: string } | null;
  addons: AddonContratado[];
  catalogoAddons: AddonCatalogo[];
  paquetes: Paquete[];
  nSucursales: number;
  modulos: Modulos;
  limites: Limites | null;
};

/** Un aviso tal como lo devuelve `/api/avisos`, con su alcance y sus lecturas (ADR 0014). */
export type AvisoPanel = {
  id: string;
  tenantId: string | null;
  /** null = va a todos los clientes. */
  tenantNombre: string | null;
  nivel: string;
  titulo: string;
  cuerpo: string;
  requiereConfirmacion: boolean;
  vigenteDesde: string;
  vigenteHasta: string | null;
  createdAt: string;
  borrado: boolean;
  /** Acuses hechos DESDE UNA CAJA. Es el número que cuenta para "N de M cajas". */
  vistos: number;
  /** Acuses desde el POS web, que no tiene caja. Van aparte para no inflar el anterior. */
  vistosWeb: number;
  cajasAlcance: number;
};

/** Una versión del escritorio en el catálogo (`/api/versiones`, ADR 0014). */
export type VersionCaja = {
  version: string;
  url: string;
  sha512: string;
  notas: string | null;
  fecha: string | null;
  publicada: boolean;
  es_minima: boolean;
  bloquea_bajo_minima: boolean;
  bloquea_desde: string | null;
  created_at: string;
};

/** Una caja del parque, con la versión que reportó en su último latido. */
export type CajaParque = {
  id: string;
  nombre: string;
  cliente: string;
  tenantId: string;
  sucursal: string;
  versionApp: string | null;
  so: string | null;
  pantalla: Pantalla | null;
  ultimoLatido: string | null;
  /** No ha latido nunca: es anterior a 0.4.60. No es lo mismo que estar desactualizada. */
  sinLatido: boolean;
  desactualizada: boolean;
};
