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
