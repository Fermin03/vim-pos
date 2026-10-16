import type { PrintJob } from "./tipos";
import type { IdEstacion } from "./config";

/**
 * Cola de comandas por impresora.
 *
 * Una comanda que no sale (impresora apagada, sin papel, cable suelto) no se pierde: se queda aquí
 * y se reintenta sola hasta que salga. Toda comanda pasa por la cola, aunque la impresora esté
 * bien —así una nueva nunca se adelanta a una vieja que sigue esperando— y cada estación conserva
 * el orden en que se pidieron. Las estaciones no se bloquean entre sí: que la barra se quede sin
 * papel no detiene a la cocina.
 *
 * Vive en localStorage (como la config de impresoras): si la caja se reinicia con comandas
 * esperando, siguen ahí al volver.
 */

export type ComandaPendiente<R = unknown> = {
  id: string;
  estacion: IdEstacion;
  /** Nombre para el aviso al cajero ("cocina", "Barra"). */
  area: string;
  job: PrintJob;
  creadaEn: number;
  intentos: number;
  /** Lo que el llamador necesita para la bitácora cuando por fin salga. */
  registro?: R;
};

const KEY = "vim_cola_comandas";

/**
 * Pasado este tiempo una comanda ya no se imprime: la que se quedó esperando con la impresora
 * apagada al cerrar no debe salir a la mañana siguiente como si fuera un pedido nuevo.
 */
export const VIGENCIA_MS = 6 * 60 * 60 * 1000;

export function leerCola<R = unknown>(): ComandaPendiente<R>[] {
  if (typeof window === "undefined") return [];
  try {
    const v: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? (v as ComandaPendiente<R>[]) : [];
  } catch {
    return [];
  }
}

function guardar(c: ComandaPendiente[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* sin almacenamiento: la cola vive solo en esta pasada */
  }
}

export function encolarComanda<R>(c: Omit<ComandaPendiente<R>, "id" | "creadaEn" | "intentos">): string {
  const id = crypto.randomUUID();
  guardar([...leerCola(), { ...c, id, creadaEn: Date.now(), intentos: 0 }]);
  return id;
}

export type Intento<R> = (c: ComandaPendiente<R>) => Promise<boolean>;
/** Se llama una vez por comanda con su primer resultado, y otra vez cuando por fin sale. */
export type AlResolver<R> = (c: ComandaPendiente<R>, salio: boolean) => void;

let cadena: Promise<void> = Promise.resolve();

/**
 * Intenta imprimir lo pendiente, en orden. En cada estación se detiene en la primera que falla:
 * imprimir la siguiente adelantaría a la que sigue esperando. Las pasadas nunca se enciman (una
 * espera a la anterior), así que dos comandas no pueden competir por la misma impresora.
 */
export function vaciarCola<R>(imprimir: Intento<R>, alResolver?: AlResolver<R>, ahora = Date.now): Promise<void> {
  cadena = cadena.then(() => pasada(imprimir, alResolver, ahora)).catch(() => {});
  return cadena;
}

async function pasada<R>(imprimir: Intento<R>, alResolver: AlResolver<R> | undefined, ahora: () => number): Promise<void> {
  const caidas = new Set<IdEstacion>();
  for (const c of leerCola<R>()) {
    if (ahora() - c.creadaEn > VIGENCIA_MS) { quitar(c.id); continue; }
    if (caidas.has(c.estacion)) continue;
    let salio = false;
    try { salio = await imprimir(c); } catch { salio = false; }
    if (salio) quitar(c.id);
    else { caidas.add(c.estacion); actualizarIntentos(c.id); }
    if (salio || c.intentos === 0) alResolver?.(c, salio);
  }
}

function quitar(id: string): void {
  guardar(leerCola().filter((c) => c.id !== id));
}

function actualizarIntentos(id: string): void {
  guardar(leerCola().map((c) => (c.id === id ? { ...c, intentos: c.intentos + 1 } : c)));
}
