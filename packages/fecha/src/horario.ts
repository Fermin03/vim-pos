// El horario semanal de una sucursal en la tienda en línea, tal como lo guarda la base (0161):
// {"1": ["13:00","22:00"], …}, 1 = lunes … 7 = domingo; día ausente = cerrado. Lo usan el admin
// (que lo edita) y la tienda pública (que lo pinta): por eso vive aquí y no en una app.

export type Dia = "1" | "2" | "3" | "4" | "5" | "6" | "7"; // 1 = lunes
export type Horario = Partial<Record<Dia, [string, string]>>;
export const DIAS: readonly { dia: Dia; nombre: string }[] = [
  { dia: "1", nombre: "Lunes" }, { dia: "2", nombre: "Martes" }, { dia: "3", nombre: "Miércoles" },
  { dia: "4", nombre: "Jueves" }, { dia: "5", nombre: "Viernes" }, { dia: "6", nombre: "Sábado" },
  { dia: "7", nombre: "Domingo" },
];

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function horaValida(h: string): boolean {
  return HORA.test(h);
}

/** Lee lo que venga de la base. Lo que no tenga la forma exacta se descarta (ese día queda cerrado). */
export function leerHorario(x: unknown): Horario {
  const h: Horario = {};
  if (typeof x !== "object" || x === null || Array.isArray(x)) return h;
  for (const { dia } of DIAS) {
    const r = (x as Record<string, unknown>)[dia];
    if (Array.isArray(r) && r.length === 2 && r.every((v) => typeof v === "string" && HORA.test(v))) {
      h[dia] = [r[0], r[1]];
    }
  }
  return h;
}

/** Cierra antes de abrir: el cierre cae al día siguiente. */
export function cruzaMedianoche(rango: [string, string]): boolean {
  return rango[1] < rango[0];
}
