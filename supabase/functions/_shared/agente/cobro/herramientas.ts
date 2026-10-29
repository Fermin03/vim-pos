// Herramientas de cobro del agente: verificar al dueño por correo, consultar el adeudo y crear la liga
// de Mercado Pago. El negocio y el monto los pone la base (0288); aquí solo se arma el texto para el
// modelo, que son instrucciones cortas, no mensajes al cliente. Puro salvo los deps; se prueba con node --test.
import { esc, soloAscii } from "../../correo.ts";
import type { Herramientas } from "../cerebro.ts";
import type { crearPreferencia } from "./mp-vim.ts";

export type DepsCobro = {
  // deno-lint-ignore no-explicit-any
  rpc(fn: string, args: Record<string, unknown>): Promise<any>;
  cupo(claves: { clave: string; ventanaSeg: number; max: number }[]): Promise<boolean>;
  correo(to: string, subject: string, html: string): Promise<{ enviado: boolean }>;
  preferencia: typeof crearPreferencia;
  token: string;
  notificacion: string;
  ahora(): Date;
};

type Periodo = { desde: string; hasta: string; plan: number; extras: number; importe: number };

const pesos = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n));
// Las fechas de la base ya son de México («2026-11-28»): se leen en UTC para no correr el día.
const fecha = (d: string) =>
  new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));
const fechaHora = (d: Date) =>
  new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Mexico_City" }).format(d);

const VERIFICA = "Primero verifica al cliente: pide el correo con el que entra a VIM POS y llama pedir_codigo.";
const ELEGIR = "Primero pregúntale con cuál de sus negocios sigue y llama elegir_negocio.";
const MOTIVOS: Record<string, string> = {
  CANCELADO: "la cuenta del negocio está cancelada",
  SUSPENDIDO_OTRO: "el negocio está suspendido por un motivo distinto a la falta de pago",
  SIN_SUSCRIPCION: "el negocio no tiene una suscripción activa",
  PRECIO_CERO: "su plan no tiene precio que cobrar",
  MAS_DE_12: "debe más de 12 periodos",
};
const AGENTE = "No insistas ni inventes una liga; pasa a un agente con pasar_a_fermin (URGENTE_SOPORTE).";

/** Qué hacer cuando la base dice que no se puede cobrar. */
function sinCobro(motivo: string): string {
  if (motivo === "SIN_VERIFICAR") return VERIFICA;
  if (motivo === "ELEGIR_NEGOCIO") return ELEGIR;
  return `No cobres; pasa a un agente con pasar_a_fermin (URGENTE_SOPORTE). Motivo: ${MOTIVOS[motivo] ?? motivo}.`;
}

const extras = (p: Periodo) => Number(p.extras) > 0 ? ` (plan ${pesos(p.plan)} + extras ${pesos(p.extras)} al mes)` : "";

export function herramientasCobro(conversacionId: string, waId: string, d: DepsCobro): Pick<Herramientas,
  "pedirCodigo" | "verificarCodigo" | "elegirNegocio" | "consultarAdeudo" | "guardarDatosFactura" | "crearLigaPago"> {
  const conv = { p_conversacion_id: conversacionId };
  return {
    async pedirCodigo(correo) {
      const c = correo.trim().toLowerCase();
      const cabe = await d.cupo([
        { clave: "wa:cod:h:" + waId, ventanaSeg: 3600, max: 3 },
        { clave: "wa:cod:d:" + c, ventanaSeg: 86400, max: 5 },
      ]);
      if (!cabe) return "Ya se pidieron varios códigos. Dile que espere un rato antes de pedir otro.";
      const r = await d.rpc("wa_pedir_codigo", { ...conv, p_correo: c });
      // El código y el correo nunca vuelven al modelo: la respuesta es igual exista o no el correo.
      if (r.enviar) {
        await d.correo(r.correo, soloAscii("Tu codigo de VIM POS"),
          `<p>Tu código para el WhatsApp de VIM POS es <b>${esc(r.codigo)}</b>.</p>` +
          `<p>Escríbelo en el chat. Vence en 15 minutos.</p>` +
          `<p>Si no lo pediste, ignora este correo.</p>`);
      }
      return "Si ese correo está registrado, le llegó un código de 6 dígitos que vence en 15 minutos. " +
        "Pídeselo y llama verificar_codigo. No le digas si el correo existe o no.";
    },

    async verificarCodigo(codigo) {
      const r = await d.rpc("wa_verificar_codigo", { ...conv, p_codigo: codigo.replace(/[\s-]/g, "") });
      if (!r.ok) {
        if (r.motivo === "INCORRECTO") return "El código no coincide. Pídele que lo revise y lo escriba otra vez.";
        if (r.motivo === "SIN_CODIGO") return "No hay un código pendiente. Pide su correo y llama pedir_codigo.";
        return "Ese código ya no sirve (venció o se agotaron los intentos). Pide su correo otra vez y llama pedir_codigo para uno nuevo.";
      }
      const nombres = (r.negocios as { nombre: string }[]).map((n) => n.nombre);
      return nombres.length === 1
        ? `Verificado. Su negocio: ${nombres[0]}. Llama consultar_adeudo.`
        : `Verificado. Tiene varios negocios: ${nombres.join(", ")}. Pregúntale con cuál sigue y llama elegir_negocio.`;
    },

    async elegirNegocio(nombre) {
      const r = await d.rpc("wa_elegir_negocio", { ...conv, p_nombre: nombre });
      if (r.ok) return `Listo, sigue con ${r.negocio}. Llama consultar_adeudo.`;
      if (!r.opciones?.length) return VERIFICA;
      return `Ese nombre no coincide. Sus negocios: ${r.opciones.join(", ")}. Pregúntale cuál y llama elegir_negocio con el nombre exacto.`;
    },

    async consultarAdeudo(adelanto) {
      const r = await d.rpc("wa_adeudo", { ...conv, p_adelanto: adelanto });
      if (!r.puede_cobrar) return sinCobro(r.motivo);
      const ciclo = r.ciclo === "ANUAL" ? "anual" : "mensual";
      const caja = r.estado_negocio === "SUSPENDIDO"
        ? "Su caja está bloqueada por falta de pago; al pagar se desbloquea."
        : "Su caja no está bloqueada.";
      const cab = `Negocio: ${r.negocio}. Plan ${r.plan}, ${ciclo}. ${caja}`;
      const periodos: Periodo[] = r.periodos;
      if (!periodos.length) {
        return `${cab} Está al corriente: su próximo cobro es el ${fecha(r.proxima_fecha_cobro)}. ` +
          "Ofrécele adelantar el siguiente periodo (consultar_adeudo con adelanto: true).";
      }
      const p0 = periodos[0];
      const iguales = periodos.every((p) => p.plan === p0.plan && p.extras === p0.extras && p.importe === p0.importe);
      const [uno, varios] = r.ciclo === "ANUAL" ? ["año", "años"] : ["mes", "meses"];
      const desglose = iguales
        ? ` ${periodos.length} ${periodos.length === 1 ? uno : varios} de ${pesos(p0.importe)}${extras(p0)}, ` +
          `del ${fecha(p0.desde)} al ${fecha(periodos[periodos.length - 1].hasta)}.`
        : periodos.map((p) => `\n- Del ${fecha(p.desde)} al ${fecha(p.hasta)}: ${pesos(p.importe)}${extras(p)}`).join("");
      const vencidos = Number(r.vencidos) > 0 ? ` Periodos vencidos: ${r.vencidos}.` : "";
      return `${cab}${vencidos}${adelanto ? " Incluye un periodo por adelantado." : ""}\nAdeudo:${desglose}\n` +
        `Subtotal ${pesos(r.subtotal)}, IVA ${pesos(r.iva)}, total ${pesos(r.total)}. ` +
        `Con este pago queda cubierto hasta el ${fecha(r.cubre_hasta)}.`;
    },

    async guardarDatosFactura(f) {
      await d.rpc("wa_guardar_factura", { ...conv, p_datos: { ...f, rfc: f.rfc.trim().toUpperCase() } });
      return "Guardados. La factura sale con estos datos cuando se confirme el pago.";
    },

    async crearLigaPago(adelanto) {
      if (!d.token) return `Hoy no se puede cobrar por aquí. ${AGENTE}`;
      const r = await d.rpc("wa_crear_intento", { ...conv, p_adelanto: adelanto });
      if (!r.ok) {
        return r.motivo === "AL_CORRIENTE"
          ? "Está al corriente; sin adelanto no hay nada que cobrar. Si quiere adelantar, llama crear_liga_pago con adelanto: true."
          : sinCobro(r.motivo);
      }
      const total = pesos(r.total);
      if (r.reusado && r.preferencia_url) {
        return `Liga de pago con tarjeta por ${total} (la misma de antes, sigue vigente): ${r.preferencia_url}`;
      }
      const venceEn = new Date(d.ahora().getTime() + 24 * 3600_000);
      const p = await d.preferencia({
        intentoId: r.intento_id, total: Number(r.total), titulo: "VIM POS — mensualidad", venceEn, notificacion: d.notificacion,
      }, d.token);
      if (!p.ok) return `No se pudo crear la liga (Mercado Pago no respondió). ${AGENTE}`;
      await d.rpc("wa_fijar_preferencia", { p_intento_id: r.intento_id, p_preferencia_id: p.id, p_url: p.url });
      return `Liga de pago con tarjeta por ${total}: ${p.url}\nVence el ${fechaHora(venceEn)}.`;
    },
  };
}
