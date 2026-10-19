// Los correos de una cita reservada en línea (0226): confirmación, recordatorio, cambio de horario
// y cancelación, y el flujo que vacía su cola (agenda_correos). Puro salvo por las dependencias que
// se le pasan: se prueba con Node, sin SMTP. Mismo molde y estilo que correo-estado.ts.
//
// Cada correo lleva día y hora en México («jueves 6 de noviembre, 10:30»), servicios, colaborador
// (nombre corto), sucursal con dirección y el botón «Ver mi cita». Si cancela el negocio NUNCA se
// promete un reembolso automático: el anticipo lo resuelve el negocio.
//
// TEXTOS PROVISIONALES (James): títulos, líneas de apoyo y la línea final.
import { esc, soloAscii } from "../correo.ts";

export const TIPOS_CITA = ["CONFIRMACION", "RECORDATORIO", "CANCELACION", "CAMBIO"] as const;
export type TipoCita = typeof TIPOS_CITA[number];

/** Lo que agenda_correos_tomar trae de la cita (resumen público + estado y anticipos). */
export type Cita = {
  inicia: string;
  estado: string;
  cancelada_por: string | null;
  version: number;
  sucursal: { nombre: string; direccion: string | null };
  servicios: string[];
  colaborador: string | null;
  anticipo_en_linea_mxn: number;
  anticipo_mxn: number;
};

const num = (x: unknown): number => (typeof x === "number" ? x : typeof x === "string" ? Number(x) : NaN);

export function leerCita(x: unknown): Cita | null {
  if (typeof x !== "object" || x === null) return null;
  const c = x as Record<string, unknown>;
  const s = c.sucursal as Record<string, unknown> | null | undefined;
  if (typeof c.inicia !== "string" || Number.isNaN(Date.parse(c.inicia)) || typeof c.estado !== "string") return null;
  if (!s || typeof s.nombre !== "string" || !Array.isArray(c.servicios) || !Number.isInteger(num(c.version))) return null;
  return {
    inicia: c.inicia, estado: c.estado,
    cancelada_por: typeof c.cancelada_por === "string" ? c.cancelada_por : null,
    version: num(c.version),
    sucursal: { nombre: s.nombre, direccion: typeof s.direccion === "string" ? s.direccion : null },
    servicios: c.servicios.flatMap((v) => {
      const n = (v as Record<string, unknown> | null)?.nombre;
      return typeof n === "string" ? [n] : [];
    }),
    colaborador: typeof c.colaborador === "string" ? c.colaborador : null,
    anticipo_en_linea_mxn: num(c.anticipo_en_linea_mxn) || 0,
    anticipo_mxn: num(c.anticipo_mxn) || 0,
  };
}

/** «jueves 6 de noviembre, 10:30», en la hora de México. */
export function fechaDeCita(iso: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City", weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.day} de ${p.month}, ${p.hour}:${p.minute}`;
}

type Texto = { asunto: string; titulo: string; apoyo: string };

/** Qué decir, o null si el correo ya no corresponde a la cita como está AHORA. */
function textoDe(tipo: TipoCita, negocio: string, c: Cita, version: number, ahora: Date): Texto | null {
  const cancelada = c.estado === "CANCELADA";
  if (tipo === "CANCELACION") {
    if (!cancelada) return null;
    const asunto = `Tu cita en ${negocio} se canceló`;
    if (c.cancelada_por === "PAGO_VENCIDO") return { asunto, titulo: "Cita cancelada", apoyo: "No se completó el pago y tu cita se liberó." };
    if (c.cancelada_por === "CLIENTA_EN_LINEA") {
      return {
        asunto, titulo: "Cita cancelada",
        apoyo: `Cancelaste tu cita.${c.anticipo_en_linea_mxn > 0 ? " Te devolvemos tu anticipo por Mercado Pago. Cuándo lo ves reflejado depende de tu banco." : ""}`,
      };
    }
    // El negocio o la caja (o una cancelación sin quién): nunca un reembolso automático.
    return {
      asunto, titulo: "Cita cancelada",
      apoyo: `${negocio} canceló tu cita.${c.anticipo_mxn > 0 ? " El negocio se comunicará contigo sobre tu anticipo." : ""}`,
    };
  }
  if (cancelada) return null;
  if (tipo === "CONFIRMACION") {
    return {
      asunto: `Tu cita en ${negocio} quedó apartada`, titulo: "Tu cita quedó apartada",
      apoyo: c.anticipo_en_linea_mxn > 0 ? `Recibimos tu anticipo de $${c.anticipo_en_linea_mxn.toFixed(2)}.` : "Te esperamos.",
    };
  }
  if (version !== c.version) return null;   // hubo otro cambio de horario después de este correo
  if (tipo === "CAMBIO") return { asunto: `Tu cita en ${negocio} cambió de horario`, titulo: "Tu cita cambió de horario", apoyo: "Este es tu nuevo horario." };
  // RECORDATORIO
  if (c.estado !== "AGENDADA" || Date.parse(c.inicia) <= ahora.getTime()) return null;
  return { asunto: `Mañana es tu cita en ${negocio}`, titulo: "Mañana es tu cita", apoyo: "Te esperamos." };
}

/** El correo, o null si ya no corresponde. Sin `enlace` sale sin botón. */
export function correoDeCita(d: { tipo: TipoCita; version: number; negocio: string; enlace: string | null; cita: Cita; ahora?: Date }): { subject: string; html: string } | null {
  const t = textoDe(d.tipo, d.negocio, d.cita, d.version, d.ahora ?? new Date());
  if (!t) return null;
  const c = d.cita;
  const sucursal = c.sucursal.direccion ? `${c.sucursal.nombre}: ${c.sucursal.direccion}` : c.sucursal.nombre;
  return {
    subject: soloAscii(t.asunto),
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;color:#111">
<h1 style="font-size:20px;margin:0 0 4px">${esc(d.negocio)}</h1>
<p style="margin:0 0 16px;color:#444">Cita del <strong>${esc(fechaDeCita(c.inicia))}</strong></p>
<p style="font-size:18px;margin:0 0 6px"><strong>${esc(t.titulo)}</strong></p>
<p style="margin:0 0 16px">${esc(t.apoyo)}</p>
<p style="margin:0 0 4px">${esc(c.servicios.join(", "))}${c.colaborador ? ` · con ${esc(c.colaborador)}` : ""}</p>
<p style="margin:0 0 ${d.enlace ? "16px" : "24px"};color:#444">${esc(sucursal)}</p>
${d.enlace ? `<p style="margin:0 0 24px"><a href="${esc(d.enlace)}" style="background:#111;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block">Ver mi cita</a></p>\n` : ""}<p style="color:#666;font-size:13px;margin:0">Si no hiciste esta reserva, ignora este correo.</p>
</div>`,
  };
}

// ── Vaciar la cola ───────────────────────────────────────────────────────────────────────────────
export type PendienteCita = {
  id: number; tipo: string; version: number; tenant_id: string; slug: string | null; negocio: string;
  email: string | null; enlace_hash: string | null; cifrado: string | null; cita: unknown;
};
export type Resultado = "ENVIADO" | "OBSOLETO" | "SIN_CORREO" | "FALLO";
export type DepsCita = {
  /** agenda_correos_tomar. */
  tomar(max: number, topeHora: number): Promise<PendienteCita[]>;
  descifrar(cifrado: string | null, huella: string): Promise<string | null>;
  enviar(c: { to: string; subject: string; html: string }): Promise<{ enviado: boolean }>;
  /** agenda_correo_resultado: devuelve el estado en que quedó el renglón. */
  resultado(id: number, r: Resultado): Promise<string | null>;
  alMorir(id: number): void;
  /** VIM_TIENDA_URL sin barra final; "" = sin enlace. */
  base: string;
  topeHora: number;
};

async function una(deps: DepsCita, p: PendienteCita): Promise<Resultado> {
  if (!p.email) return "SIN_CORREO";
  if (!(TIPOS_CITA as readonly string[]).includes(p.tipo)) return "OBSOLETO";
  const cita = leerCita(p.cita);
  if (!cita) return "OBSOLETO";
  const codigo = deps.base && p.slug && p.enlace_hash ? await deps.descifrar(p.cifrado, p.enlace_hash) : null;
  const correo = correoDeCita({
    tipo: p.tipo as TipoCita, version: p.version, negocio: p.negocio, cita,
    enlace: codigo ? `${deps.base}/${p.slug}/cita/${codigo}` : null,
  });
  if (!correo) return "OBSOLETO";
  return (await deps.enviar({ to: p.email, ...correo })).enviado ? "ENVIADO" : "FALLO";
}

/** Una pasada por la cola de las citas. Nada de aquí lanza por un correo. */
export async function mandarCorreosDeCita(deps: DepsCita, max = 10): Promise<Record<Resultado, number>> {
  const cuenta: Record<Resultado, number> = { ENVIADO: 0, OBSOLETO: 0, SIN_CORREO: 0, FALLO: 0 };
  for (const p of await deps.tomar(max, deps.topeHora)) {
    let r: Resultado;
    try { r = await una(deps, p); } catch { r = "FALLO"; }
    cuenta[r]++;
    try {
      if ((await deps.resultado(p.id, r)) === "MUERTO") deps.alMorir(p.id);
    } catch { /* el renglón quedó apartado: vuelve a salir cuando pase su espera */ }
  }
  return cuenta;
}
