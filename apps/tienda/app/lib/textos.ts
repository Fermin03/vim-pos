// Todo lo que la tienda le DICE al cliente a partir de un código de la función: estados del pedido,
// motivos, tienda cerrada y errores. La función solo manda códigos; aquí se vuelven palabras de
// comensal, sin términos internos, y cada error dice qué pasó y qué puede hacer.
import type { Horario } from "@vim/fecha";
import type { EstadoDePedido, Pago, Seguimiento } from "./contrato";
import { formatoMxn } from "./dinero";
import { aLaHora, momentoMx, textoApertura, type Momento } from "./horario";
import { formatoTelefono } from "./telefono";

// ── Seguimiento (textos decididos por Fermín; sin tiempo estimado) ───────────────────────────────
const ESTADOS: Record<Exclude<EstadoDePedido, "CANCELADO">, { titulo: string; apoyo: string }> = {
  // El cobro se mandó y todavía no se sabe si pasó. Nunca «no se te cobró» ni «rechazado».
  POR_PAGAR: { titulo: "Confirmando tu pago", apoyo: "Esto puede tardar unos minutos." },
  EN_PROCESO: { titulo: "En proceso", apoyo: "Le avisamos al restaurante. En un momento confirma tu pedido." },
  EN_PREPARACION: { titulo: "En preparación", apoyo: "El restaurante ya está preparando tu pedido." },
  EN_CAMINO: { titulo: "En camino", apoyo: "Tu pedido va hacia ti." },
  LISTO_PARA_RECOGER: { titulo: "Listo para recoger", apoyo: "Ya puedes pasar por tu pedido." },
  ENTREGADO: { titulo: "Entregado", apoyo: "¡Buen provecho!" },
};
const MOTIVOS: Record<string, string> = {
  SIN_RESPUESTA: "El restaurante no confirmó tu pedido a tiempo. No se te cobró nada.",
  AGOTADO: "Se agotó algo de tu pedido.",
  CERRADO: "El restaurante ya cerró.",
  SATURADO: "El restaurante tiene demasiados pedidos en este momento.",
};

/** El título grande y su línea de apoyo. En un cancelado, el apoyo es el motivo (acompáñalo siempre del teléfono de la sucursal). */
export function textoDeEstado(estado: EstadoDePedido, motivo: string | null): { titulo: string; apoyo: string } {
  if (estado !== "CANCELADO") return ESTADOS[estado];
  return { titulo: "Cancelado", apoyo: MOTIVOS[motivo ?? ""] ?? "El restaurante no pudo tomar tu pedido." };
}

// ── Seguimiento de un pedido que se paga en línea ────────────────────────────────────────────────
// TEXTOS PROVISIONALES: los escribió quien programó; falta la hoja de redacción y el visto bueno.
/** La documentación de Mercado Pago no da un plazo para ver una devolución: no se promete ninguno. */
const PLAZO_DE_DEVOLUCION = "Cuándo lo ves reflejado depende de tu banco.";
/** «antes de las 3:45 p. m.», o nada si la hora no se puede leer. */
function antesDe(vence: string | null): string {
  const d = vence ? new Date(vence) : null;
  return d && !Number.isNaN(d.getTime()) ? ` ${aLaHora(momentoMx(d).hora).replace(/^a /, "antes de ")}` : "";
}

export type TextoDeSeguimiento = {
  titulo: string; apoyo: string;
  /** El restaurante canceló: el título va en rojo. Un pago que no se completó no es eso. */
  alerta: boolean;
};

/**
 * El título grande y su línea de apoyo de la página del pedido. En un pedido al recibir es
 * `textoDeEstado`. En uno que se paga en línea manda cómo va el pago: mientras se confirma, cuando
 * no se completó, y cuando se canceló un pedido ya pagado (que dice que el dinero se devuelve y
 * nunca «no se te cobró»). Venció sin que se haya podido confirmar con Mercado Pago: se dice que
 * se está confirmando, NUNCA que no hubo pago.
 */
export function textoDeSeguimiento(p: Pick<Seguimiento, "estado" | "motivo" | "enLinea">): TextoDeSeguimiento {
  const pago = p.enLinea;
  if (!pago) return { ...textoDeEstado(p.estado, p.motivo), alerta: p.estado === "CANCELADO" };
  if (p.estado !== "CANCELADO") return { ...ESTADOS[p.estado], alerta: false };
  if (pago.estado === "POR_CONFIRMAR") {
    return { titulo: "Confirmando tu pago", apoyo: "Esto puede tardar unos minutos.", alerta: false };
  }
  if (pago.estado === "SIN_PAGO") {
    return { titulo: "No se completó el pago", apoyo: "Tu pedido no se envió al restaurante y no se te cobró nada.", alerta: false };
  }
  // Cancelado con el pago hecho: el motivo de siempre, sin «no se te cobró», y qué pasa con el dinero.
  const motivo = (MOTIVOS[p.motivo ?? ""] ?? "El restaurante no pudo tomar tu pedido.").replace(" No se te cobró nada.", "");
  const dinero = pago.estado === "DEVUELTO" ? "Te devolvimos tu pago completo." : "Estamos devolviendo tu pago completo.";
  return { titulo: "Cancelado", apoyo: `${motivo} ${dinero} ${PLAZO_DE_DEVOLUCION}`, alerta: true };
}

// ── Formas de pago («¿Cómo pagas?») ──────────────────────────────────────────────────────────────
/**
 * El nombre de una forma de pago. Cuando también se ofrece pagar en línea, las otras dos dicen que
 * son al recibir: «Con tarjeta» a secas ya no distinguiría la terminal del repartidor del pago en línea.
 */
export function nombreDePago(pago: Pago, conEnLinea: boolean): string {
  if (pago === "EN_LINEA") return "Pagar en línea";
  const nombre = pago === "EFECTIVO" ? "En efectivo" : "Con tarjeta";
  return conEnLinea ? `${nombre}, al recibir` : nombre;
}
/** La línea bajo «¿Cómo pagas?»: cuándo y dónde se paga con la forma elegida. Sin prometer medios que Mercado Pago no documenta. */
export const apoyoDePago = (pago: Pago | null): string =>
  pago === "EN_LINEA" ? "Pagas ahora, aquí mismo, con tarjeta de crédito o débito." : "Pagas al recibir tu pedido.";

// ── Tienda cerrada: el motivo de `sucursal.estado.<modo>` (o el detalle de TIENDA_CERRADA) ────────
const CERRADA: Record<string, { texto: string; hacer: string }> = {
  EN_PAUSA: { texto: "No estamos tomando pedidos en este momento.", hacer: "Vuelve a intentar en unos minutos." },
  CAJA_NO_LISTA: { texto: "Aún no abrimos.", hacer: "Vuelve a intentar en unos minutos." },
  MODO_NO_DISPONIBLE: { texto: "Esta opción no está disponible por ahora.", hacer: "Elige otra forma de recibir tu pedido." },
};
const NO_DISPONIBLE = "Esta tienda no está disponible por ahora.";

/** El aviso que reemplaza al botón de pedir. El menú se sigue viendo completo. */
export function textoCerrada(motivo: string, horario: Horario, ahora: Momento = momentoMx()): string {
  if (motivo === "FUERA_DE_HORARIO") {
    const abre = textoApertura(horario, ahora);
    return abre ? `Cerrado ahora. ${abre}` : "Cerrado ahora.";   // la hora ya cierra con punto: «p. m.»
  }
  if (motivo === "MODO_NO_DISPONIBLE") return CERRADA.MODO_NO_DISPONIBLE!.texto;
  const c = CERRADA[motivo];
  return c ? `${c.texto} ${c.hacer}` : NO_DISPONIBLE;
}

// ── Errores ──────────────────────────────────────────────────────────────────────────────────────
export type TextoDeError = { /** Qué pasó. */ texto: string; /** Qué puede hacer el cliente. */ hacer: string };

const REINTENTA = "Vuelve a intentar en unos minutos.";
const RECARGA = "Recarga la página y vuelve a intentar.";
// Un fallo NUESTRO o un envío que la tienda bien hecha nunca manda: al cliente no le sirve el detalle.
const ALGO_FALLO: TextoDeError = { texto: "Algo salió mal de nuestro lado.", hacer: REINTENTA };
const NO_SE_PUDO_LEER: TextoDeError = { texto: "No pudimos leer tu pedido.", hacer: RECARGA };
const CAMBIO_EL_MENU: TextoDeError = { texto: "El menú cambió desde que armaste tu pedido.", hacer: "Revisa tu pedido: lo que ya no está disponible aparece marcado." };

const ERRORES: Record<string, TextoDeError> = {
  // Los que pone la propia tienda
  SIN_CONEXION: { texto: "No pudimos conectar.", hacer: "Revisa tu conexión a internet y vuelve a intentar." },
  SIN_CONFIRMAR: { texto: "No pudimos confirmar tu pedido.", hacer: "Vuelve a intentarlo: si ya había entrado, no se duplica." },
  ORIGEN_NO_PERMITIDO: { texto: "No pudimos procesar tu solicitud desde esta página.", hacer: RECARGA },
  // HTTP de la función (anexo §1.3)
  METODO_NO_PERMITIDO: ALGO_FALLO,
  NO_AUTORIZADO: ALGO_FALLO,
  ERROR_INTERNO: ALGO_FALLO,
  SERVICIO_NO_DISPONIBLE: { texto: "No pudimos conectar con el restaurante.", hacer: REINTENTA },
  CUERPO_DEMASIADO_GRANDE: { texto: "Tu pedido es demasiado grande para enviarlo de una vez.", hacer: "Quita algunos productos o acorta las notas y vuelve a intentar." },
  CUERPO_INVALIDO: NO_SE_PUDO_LEER,
  ACCION_INVALIDA: NO_SE_PUDO_LEER,
  NEGOCIO_INVALIDO: { texto: "No encontramos esta tienda.", hacer: "Revisa que la dirección esté bien escrita." },
  TIENDA_NO_DISPONIBLE: { texto: NO_DISPONIBLE, hacer: "Llama al restaurante para hacer tu pedido." },
  CODIGO_INVALIDO: { texto: "No encontramos este pedido.", hacer: "Revisa que el enlace esté completo; puede estar mal copiado." },
  PEDIDO_NO_ENCONTRADO: { texto: "No encontramos este pedido.", hacer: "El enlace puede estar vencido o mal copiado. Si tienes dudas, llama al restaurante." },
  SEGUIMIENTO_INVALIDO: ALGO_FALLO,
  CUENTA_INVALIDA: ALGO_FALLO,
  SUCURSAL_INVALIDA: { texto: "No pudimos identificar la sucursal.", hacer: RECARGA },
  SUCURSAL_DE_OTRO_NEGOCIO: { texto: "Esa sucursal ya no está disponible.", hacer: RECARGA },
  MODO_INVALIDO: { texto: "Esa forma de recibir tu pedido ya no está disponible.", hacer: "Elige otra y vuelve a intentar." },
  ZONA_INVALIDA: { texto: "Esa zona de entrega ya no está disponible.", hacer: "Elige tu zona de nuevo." },
  CARRITO_INVALIDO: { texto: "No pudimos leer tu pedido.", hacer: "Revisa las cantidades (hasta 50 por producto y 40 productos distintos) y vuelve a intentar." },
  PRODUCTO_NO_DISPONIBLE: { texto: "Un producto de tu pedido ya no está disponible.", hacer: "Quítalo para continuar." },
  MODIFICADORES_INVALIDOS: { texto: "Las opciones de un producto cambiaron.", hacer: "Quítalo y vuelve a agregarlo." },
  COMBO_INVALIDO: { texto: "Las opciones de un combo cambiaron.", hacer: "Quítalo y vuelve a agregarlo." },
  PRECIO_INVALIDO: CAMBIO_EL_MENU,
  TOTAL_CAMBIO: { texto: "El total de tu pedido cambió.", hacer: "Revisa el nuevo total y confirma si quieres continuar." },
  TIENDA_CERRADA: { texto: "El restaurante está cerrado en este momento.", hacer: "Tu pedido se queda guardado: envíalo cuando abra." },
  CLIENTE_INVALIDO: { texto: "Revisa tus datos.", hacer: "Escribe tu nombre, un teléfono de 10 dígitos y, si pones correo, que esté completo." },
  DIRECCION_INVALIDA: { texto: "Revisa tu dirección.", hacer: "Faltan datos o el código postal no tiene 5 dígitos." },
  PAGO_INVALIDO: { texto: "Esa forma de pago no está disponible.", hacer: "Elige otra forma de pago." },
  // Pago en línea (textos provisionales, como los de arriba).
  PAGO_NO_PROCESADO: { texto: "No pudimos procesar el pago.", hacer: "Vuelve a intentar." },
  PAGO_NO_DISPONIBLE: { texto: "El restaurante no puede recibir pagos en línea en este momento. Tu pedido no se envió y no se te cobró nada.", hacer: REINTENTA },
  CAPTCHA_INVALIDO: { texto: "No pudimos comprobar que eres una persona.", hacer: "Vuelve a intentar; si sigue pasando, recarga la página." },
  DEMASIADOS_INTENTOS: { texto: "Hiciste demasiados intentos seguidos.", hacer: "Espera unos minutos antes de volver a intentar, o llama al restaurante." },
  NO_SE_PUDO_CREAR: { texto: "No pudimos tomar tu pedido.", hacer: "Llama al restaurante para hacer tu pedido." },
  // Cuentas (entrega 6). «No coinciden» no dice cuál de los dos falló, ni si el correo tiene cuenta.
  CREDENCIALES_INVALIDAS: { texto: "El correo o la contraseña no coinciden.", hacer: "Revisa que estén bien escritos y vuelve a intentar." },
  SESION_INVALIDA: { texto: "Tu sesión terminó.", hacer: "Entra otra vez." },
  ENLACE_INVALIDO: { texto: "Este enlace ya no sirve.", hacer: "Pide uno nuevo." },
  DIRECCIONES_LLENAS: { texto: "Ya tienes 5 direcciones guardadas.", hacer: "Borra una para guardar otra." },
  CUENTA_INVALIDA_DATOS: { texto: "Revisa tus datos.", hacer: "Alguno no se pudo leer: corrígelo y vuelve a intentar." },
};

/** Todos los códigos con texto propio: los de la función (HTTP y SQL) y los de la tienda. */
export const CODIGOS_DE_ERROR: readonly string[] = Object.keys(ERRORES);

/**
 * El texto de un error. `telefono` (el de la sucursal) y `detalle` (el de la respuesta) afinan los
 * que lo admiten. Un código que no se conoce sale como un fallo nuestro, nunca como el código.
 */
export function textoDeError(codigo: string, contexto: { telefono?: string | null; detalle?: string | null; otrasFormas?: boolean } = {}): TextoDeError {
  const base = ERRORES[codigo] ?? ALGO_FALLO;
  const tel = contexto.telefono ? formatoTelefono(contexto.telefono) : "";
  if (codigo === "NO_SE_PUDO_CREAR" && tel) return { ...base, hacer: `Llama al restaurante: ${tel}.` };
  if (codigo === "TOTAL_CAMBIO") {
    const total = formatoMxn(contexto.detalle ?? "");
    return total ? { ...base, texto: `El total de tu pedido cambió: ahora es ${total}.` } : base;
  }
  if (codigo === "TIENDA_CERRADA") return CERRADA[contexto.detalle ?? ""] ?? base;
  if (codigo === "PAGO_NO_DISPONIBLE" && contexto.otrasFormas) return { ...base, hacer: "Elige otra forma de pago o vuelve a intentar." };
  return base;
}

// ── Modificadores ────────────────────────────────────────────────────────────────────────────────
/** La regla de un grupo o de un slot, en palabras: «Elige 1», «Opcional · hasta 3», «Elige de 1 a 3». */
export function reglaDeGrupo(minimo: number, maximo: number | null): string {
  if (minimo === 0) return maximo !== null && maximo > 1 ? `Opcional · hasta ${maximo}` : "Opcional";
  if (maximo === null) return `Elige al menos ${minimo}`;
  return maximo === minimo ? `Elige ${minimo}` : `Elige de ${minimo} a ${maximo}`;
}
