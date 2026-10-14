// Los correos que avisan al cliente de la tienda que su pedido cambió de estado (0176), y el flujo
// que vacía la cola. Puro salvo por las dependencias que se le pasan: se prueba con Node, sin SMTP.
//
// Dicen LO MISMO que la página del pedido y con sus palabras: los textos de abajo son copia de
// apps/tienda/app/lib/textos.ts (ESTADOS, MOTIVOS y textoDeSeguimiento). Esta carpeta es Deno y no
// puede importarlos; la prueba (correo-estado.test.ts) lee aquel archivo y falla si una frase de
// aquí deja de existir allá. Mismo molde y estilo que el correo de confirmación (correo-pedido.ts).
// No prometen tiempos. No hay correo de «Entregado».
//
// TEXTOS PROVISIONALES (James): los asuntos, «Pedido», «Te devolvimos tu pago» como título, «Ver mi
// pedido» y la línea final. Lo demás ya está en la página.
import { esc, soloAscii } from "../correo.ts";

export const TIPOS = ["EN_PREPARACION", "LISTO", "CANCELADO", "DEVUELTO"] as const;
export type Tipo = typeof TIPOS[number];

/** Lo que se usa de tienda_seguimiento: lo que el cliente ve en su página en este momento. */
export type Seguimiento = {
  folio_corto: string;
  modo: "RECOGER" | "DOMICILIO";
  estado: string;
  motivo: string | null;
  /** Solo en el pedido que se paga en línea. */
  pago_estado: string | null;
};

export function leerSeguimiento(x: unknown): Seguimiento | null {
  if (typeof x !== "object" || x === null) return null;
  const s = x as Record<string, unknown>;
  if (typeof s.folio_corto !== "string" || typeof s.estado !== "string") return null;
  if (s.modo !== "RECOGER" && s.modo !== "DOMICILIO") return null;
  return {
    folio_corto: s.folio_corto, modo: s.modo, estado: s.estado,
    motivo: typeof s.motivo === "string" ? s.motivo : null,
    pago_estado: s.pago === "EN_LINEA" && typeof s.pago_estado === "string" ? s.pago_estado : null,
  };
}

// ── Las palabras de la página (textos.ts) ────────────────────────────────────────────────────────
const MOTIVOS: Record<string, string> = {
  SIN_RESPUESTA: "El restaurante no confirmó tu pedido a tiempo. No se te cobró nada.",
  AGOTADO: "Se agotó algo de tu pedido.",
  CERRADO: "El restaurante ya cerró.",
  SATURADO: "El restaurante tiene demasiados pedidos en este momento.",
};
const SIN_MOTIVO = "El restaurante no pudo tomar tu pedido.";
const PLAZO_DE_DEVOLUCION = "Cuándo lo ves reflejado depende de tu banco.";
const TARDIO = "Tu pago se confirmó cuando tu pedido ya se había cerrado, así que no se envió al restaurante.";
/** Todas las frases que salen de textos.ts, para la prueba que vigila que sigan allá. */
export const FRASES_DE_LA_PAGINA: readonly string[] = [
  ...Object.values(MOTIVOS), SIN_MOTIVO, PLAZO_DE_DEVOLUCION, TARDIO,
  "En preparación", "El restaurante ya está preparando tu pedido.",
  "Listo para recoger", "Ya puedes pasar por tu pedido.",
  "En camino", "Tu pedido va hacia ti.",
  "Cancelado", "Te devolvimos tu pago completo.", "Estamos devolviendo tu pago completo.",
];

type Texto = { asunto: string; titulo: string; apoyo: string };

/**
 * Qué decir, o null si ese correo ya no corresponde a lo que el cliente ve AHORA: el pedido siguió
 * de largo (un «en preparación» de un pedido que ya está listo no se manda), o es un pedido en
 * línea que nunca se pagó (ese no avisa de su cancelación: nunca hubo pedido confirmado).
 */
function textoDe(tipo: Tipo, s: Seguimiento): Texto | null {
  const f = s.folio_corto;
  if (tipo === "EN_PREPARACION") {
    return s.estado !== "EN_PREPARACION" ? null
      : { asunto: `Tu pedido ${f} está en preparación`, titulo: "En preparación", apoyo: "El restaurante ya está preparando tu pedido." };
  }
  if (tipo === "LISTO") {
    if (s.estado === "LISTO_PARA_RECOGER") return { asunto: `Tu pedido ${f} está listo para recoger`, titulo: "Listo para recoger", apoyo: "Ya puedes pasar por tu pedido." };
    if (s.estado === "EN_CAMINO") return { asunto: `Tu pedido ${f} va en camino`, titulo: "En camino", apoyo: "Tu pedido va hacia ti." };
    return null;
  }
  const tardio = s.motivo === "SIN_PAGO" || s.motivo === "SIN_VERIFICAR";
  if (tipo === "CANCELADO") {
    if (s.estado !== "CANCELADO" || tardio) return null;
    const motivo = MOTIVOS[s.motivo ?? ""] ?? SIN_MOTIVO;
    const asunto = `Tu pedido ${f} se canceló`;
    if (s.pago_estado === null) return { asunto, titulo: "Cancelado", apoyo: motivo };
    if (s.pago_estado === "SIN_PAGO" || s.pago_estado === "POR_CONFIRMAR") return null;
    const dinero = s.pago_estado === "DEVUELTO" ? "Te devolvimos tu pago completo." : "Estamos devolviendo tu pago completo.";
    return { asunto, titulo: "Cancelado", apoyo: `${motivo.replace(" No se te cobró nada.", "")} ${dinero} ${PLAZO_DE_DEVOLUCION}` };
  }
  // DEVUELTO
  if (s.pago_estado !== "DEVUELTO") return null;
  return {
    asunto: `Te devolvimos tu pago del pedido ${f}`, titulo: "Te devolvimos tu pago",
    apoyo: `${s.estado === "CANCELADO" && tardio ? `${TARDIO} ` : ""}Te devolvimos tu pago completo. ${PLAZO_DE_DEVOLUCION}`,
  };
}

/** El correo, o null si ya no corresponde (ver `textoDe`). Sin `enlace` sale sin botón. */
export function correoDeEstado(d: { tipo: Tipo; negocio: string; enlace: string | null; seg: Seguimiento }): { subject: string; html: string } | null {
  const t = textoDe(d.tipo, d.seg);
  if (!t) return null;
  return {
    subject: soloAscii(`${t.asunto} - ${d.negocio}`).replace(/[\s-]+$/, ""),
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;color:#111">
<h1 style="font-size:20px;margin:0 0 4px">${esc(d.negocio)}</h1>
<p style="margin:0 0 16px;color:#444">Pedido <strong>${esc(d.seg.folio_corto)}</strong></p>
<p style="font-size:18px;margin:0 0 6px"><strong>${esc(t.titulo)}</strong></p>
<p style="margin:0 0 ${d.enlace ? "16px" : "24px"}">${esc(t.apoyo)}</p>
${d.enlace ? `<p style="margin:0 0 24px"><a href="${esc(d.enlace)}" style="background:#111;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block">Ver mi pedido</a></p>\n` : ""}<p style="color:#666;font-size:13px;margin:0">Si no hiciste este pedido, ignora este correo.</p>
</div>`,
  };
}

// ── El tope por hora ─────────────────────────────────────────────────────────────────────────────
/**
 * Cuántos correos de estado pueden intentarse por hora (secreto VIM_CORREOS_ESTADO_POR_HORA).
 * 30 por omisión: el buzón de Hostinger tiene un tope DIARIO que comparte con los correos de
 * confirmación, los de cuenta y los avisos a VIM; 30 por hora son a lo sumo 720 al día. 0 los apaga.
 */
export function topePorHora(valor: string | undefined): number {
  const n = Number((valor ?? "").trim() || NaN);
  return Number.isInteger(n) && n >= 0 && n <= 1000 ? n : 30;
}

// ── Vaciar la cola ───────────────────────────────────────────────────────────────────────────────
export type Pendiente = {
  id: number; tipo: string; tenant_id: string; slug: string | null; negocio: string;
  email: string | null; seguimiento_hash: string | null; cifrado: string | null;
};
export type Resultado = "ENVIADO" | "OBSOLETO" | "SIN_CORREO" | "FALLO";
export type Deps = {
  /** tienda_correos_tomar. */
  tomar(max: number, topeHora: number): Promise<Pendiente[]>;
  /** tienda_seguimiento: lo que el cliente ve ahora. null = ese pedido ya no existe para él. */
  seguimiento(tenant: string, huella: string): Promise<unknown>;
  descifrar(cifrado: string | null, huella: string): Promise<string | null>;
  enviar(c: { to: string; subject: string; html: string }): Promise<{ enviado: boolean }>;
  /** tienda_correo_resultado: devuelve el estado en que quedó el renglón. */
  resultado(id: number, r: Resultado): Promise<string | null>;
  /** Un correo se rindió (MUERTO): que quede a la vista. Solo el id; nunca la dirección. */
  alMorir(id: number): void;
  /** VIM_TIENDA_URL sin barra final; "" = los correos salen sin enlace. */
  base: string;
  topeHora: number;
};

async function uno(deps: Deps, p: Pendiente): Promise<Resultado> {
  if (!p.email) return "SIN_CORREO";
  if (!p.seguimiento_hash || !(TIPOS as readonly string[]).includes(p.tipo)) return "OBSOLETO";
  const seg = leerSeguimiento(await deps.seguimiento(p.tenant_id, p.seguimiento_hash));
  if (!seg) return "OBSOLETO";
  const codigo = deps.base && p.slug ? await deps.descifrar(p.cifrado, p.seguimiento_hash) : null;
  const correo = correoDeEstado({
    tipo: p.tipo as Tipo, negocio: p.negocio, seg,
    enlace: codigo ? `${deps.base}/${p.slug}/pedido/${codigo}` : null,
  });
  if (!correo) return "OBSOLETO";
  return (await deps.enviar({ to: p.email, ...correo })).enviado ? "ENVIADO" : "FALLO";
}

/**
 * Una pasada: toma lo que toca y lo manda, uno por uno. Lo que falla se reintenta en otra pasada
 * (la base lleva la cuenta y las esperas); nada de aquí lanza por un correo.
 */
export async function mandarCorreosDeEstado(deps: Deps, max = 10): Promise<Record<Resultado, number>> {
  const cuenta: Record<Resultado, number> = { ENVIADO: 0, OBSOLETO: 0, SIN_CORREO: 0, FALLO: 0 };
  for (const p of await deps.tomar(max, deps.topeHora)) {
    let r: Resultado;
    try { r = await uno(deps, p); } catch { r = "FALLO"; }
    cuenta[r]++;
    try {
      if ((await deps.resultado(p.id, r)) === "MUERTO") deps.alMorir(p.id);
    } catch { /* el renglón quedó apartado: vuelve a salir cuando pase su espera */ }
  }
  return cuenta;
}
