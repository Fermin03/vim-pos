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
