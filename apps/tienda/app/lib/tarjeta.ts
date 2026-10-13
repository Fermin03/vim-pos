// La tarjeta al pagar en línea. El número, el vencimiento y el código viven en iframes de Mercado
// Pago (Secure Fields de MercadoPago.js): esta página nunca los ve. De aquí solo sale el TOKEN de
// la tarjeta, que es de un solo uso, con su marca y si es de crédito o de débito.
//
// Lo puro (qué decirle al cliente, qué se acepta, qué forma tiene lo que devuelve la librería) está
// aquí y se prueba solo. Montar los campos es de `components/tarjeta.tsx`.
//
// TEXTOS PROVISIONALES: los revisa James.

export const SDK_DE_MERCADO_PAGO = "https://sdk.mercadopago.com/js/v2";

/** Lo que viaja en `pedir` de la tarjeta. Nunca el número. */
export type TarjetaDePedido = {
  token: string; payment_method_id: string; type: TipoDeTarjeta;
  /** La huella del dispositivo que deja MercadoPago.js, si la hay: ayuda a su antifraude. El servidor la reenvía en una cabecera. */
  dispositivo?: string;
};

/** Crédito o débito: lo que Mercado Pago (Orders API) pide con el cobro. Lista cerrada; el servidor la valida igual. */
export type TipoDeTarjeta = "credit_card" | "debit_card";

export type CampoDeTarjeta = "numero" | "vence" | "codigo" | "titular";
export const CAMPOS_DE_TARJETA: readonly CampoDeTarjeta[] = ["numero", "vence", "codigo", "titular"];

/** Lo que la tienda sabe de la tarjeta que se está escribiendo. Nunca sus dígitos. */
export type MarcaDeTarjeta = { payment_method_id: string; tipo: string; nombre: string | null };

const obj = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * De lo que contesta `mp.getPaymentMethods({ bin })`, la marca de la tarjeta. null = la librería no
 * reconoce esos primeros dígitos (o contestó otra cosa).
 */
export function marcaDe(respuesta: unknown): MarcaDeTarjeta | null {
  const r = obj(respuesta).results;
  const m = obj(Array.isArray(r) ? r[0] : null);
  const id = typeof m.id === "string" && /^[a-z0-9_]{2,30}$/.test(m.id) ? m.id : null;
  if (!id) return null;
  return {
    payment_method_id: id, tipo: typeof m.payment_type_id === "string" ? m.payment_type_id : "",
    nombre: typeof m.name === "string" && m.name.length <= 40 ? m.name : null,
  };
}

/** Solo crédito y débito. Prepago, vales y lo demás no se aceptan (así lo decidió el dueño). */
export const tipoAceptado = (tipo: string): tipo is TipoDeTarjeta => tipo === "credit_card" || tipo === "debit_card";

/** El token que devuelve `mp.fields.createCardToken`. null si no tiene la forma. */
/**
 * La huella del dispositivo que el script de seguridad de Mercado Pago deja en
 * `window.MP_DEVICE_SESSION_ID` (su antifraude la usa para puntuar el cobro). VISTO (12 oct 2026):
 * `armor.` y hexadecimales, 231 caracteres. Solo con la forma que el servidor acepta; si no está, no se inventa.
 */
export function dispositivoDe(ventana: unknown): string | undefined {
  const v = obj(ventana).MP_DEVICE_SESSION_ID;
  return typeof v === "string" && /^[A-Za-z0-9._:-]{8,300}$/.test(v) ? v : undefined;
}

export function tokenDe(respuesta: unknown): string | null {
  const id = obj(respuesta).id;
  return typeof id === "string" && /^[A-Za-z0-9]{16,64}$/.test(id) ? id : null;
}

/** Lo que se sabe de cada campo mientras el cliente escribe. `vacio`: todavía no lo toca. */
export type EstadoDeCampos = Record<Exclude<CampoDeTarjeta, "titular">, { listo: boolean; error: boolean; tocado: boolean }>;
export const CAMPOS_SIN_TOCAR: EstadoDeCampos = {
  numero: { listo: false, error: false, tocado: false },
  vence: { listo: false, error: false, tocado: false },
  codigo: { listo: false, error: false, tocado: false },
};

const FALTA: Record<CampoDeTarjeta, string> = {
  numero: "Escribe el número de tu tarjeta.",
  vence: "Escribe la fecha de vencimiento.",
  codigo: "Escribe el código de seguridad.",
  titular: "Escribe el nombre como aparece en la tarjeta.",
};
const MAL: Record<CampoDeTarjeta, string> = {
  numero: "Revisa el número de tu tarjeta.",
  vence: "Revisa la fecha de vencimiento.",
  codigo: "Revisa el código de seguridad.",
  titular: "Escribe el nombre como aparece en la tarjeta.",
};

/**
 * Los errores de la tarjeta, por campo, en palabras del cliente. `alEnviar`: se intentó pagar, así
 * que un campo vacío ya es un error; mientras escribe, solo lo que la librería marca como mal.
 */
export function erroresDeTarjeta(d: { campos: EstadoDeCampos; titular: string; marca: MarcaDeTarjeta | null; alEnviar: boolean; titularTocado?: boolean }): Partial<Record<CampoDeTarjeta, string>> {
  const e: Partial<Record<CampoDeTarjeta, string>> = {};
  for (const c of ["numero", "vence", "codigo"] as const) {
    const s = d.campos[c];
    if (s.error && (s.tocado || d.alEnviar)) e[c] = MAL[c];
    else if (!s.listo && d.alEnviar) e[c] = FALTA[c];
  }
  if (!e.numero && d.marca && !tipoAceptado(d.marca.tipo)) e.numero = "Solo aceptamos tarjetas de crédito y de débito.";
  const titular = d.titular.trim();
  if ((d.alEnviar || d.titularTocado) && (titular.length < 2 || titular.length > 100 || /\d/.test(titular))) e.titular = FALTA.titular;
  return e;
}

/** El primer campo con error, en el orden en que se leen: a ese va el foco. */
export function primerError(e: Partial<Record<CampoDeTarjeta, string>>): CampoDeTarjeta | null {
  return CAMPOS_DE_TARJETA.find((c) => e[c]) ?? null;
}

// Los campos del error que devuelve `createCardToken` → el nuestro.
const CAMPO_DE_LA_LIBRERIA: Record<string, CampoDeTarjeta> = {
  cardNumber: "numero", expirationDate: "vence", expirationMonth: "vence", expirationYear: "vence", securityCode: "codigo", cardholderName: "titular",
};

/**
 * Lo que se le dice al cliente cuando la librería no pudo crear el token. Si el error señala un
 * campo, va a ese campo; si no (sin red, la cuenta del restaurante bloqueada, un código nuevo), un
 * mensaje general. Nunca se enseña el texto en crudo de la librería.
 */
export function errorDeToken(error: unknown): { campo: CampoDeTarjeta | null; texto: string } {
  const lista = Array.isArray(error) ? error : [error];
  for (const x of lista) {
    const nombre = String(obj(x).field ?? "");
    const campo = Object.hasOwn(CAMPO_DE_LA_LIBRERIA, nombre) ? CAMPO_DE_LA_LIBRERIA[nombre] : undefined;
    if (campo) return { campo, texto: MAL[campo] };
  }
  return { campo: null, texto: "No pudimos leer tu tarjeta. Revisa los datos y vuelve a intentar." };
}

const RECHAZOS: Record<string, { campo: CampoDeTarjeta | null; texto: string; corrige?: true }> = {
  FONDOS: { campo: null, texto: "Tu tarjeta no tiene fondos suficientes. Prueba con otra tarjeta." },
  // Mercado Pago no distingue si falló el código o la fecha (VERIFICADO): se dice una sola cosa, sin señalar un campo.
  DATOS: { campo: null, corrige: true, texto: "Revisa los datos de tu tarjeta: el número, la fecha de vencimiento y el código de seguridad." },
  LLAMAR_BANCO: { campo: null, texto: "Tu banco pide que autorices este pago. Llámale y vuelve a intentar, o usa otra tarjeta." },
  TARJETA_DESHABILITADA: { campo: null, texto: "Tu tarjeta no está activa para compras en línea. Llama a tu banco o usa otra tarjeta." },
  // No fue el banco: el antifraude de Mercado Pago (`high_risk`). TEXTO PROVISIONAL (James).
  RIESGO: { campo: null, texto: "Mercado Pago no pudo aprobar este pago. Prueba con otra tarjeta." },
  // La verificación del banco (3D Secure). TEXTOS PROVISIONALES (James). No prometen tiempos.
  // El cliente contestó el reto y su banco no lo confirmó (VERIFICADO: `3ds_challenge_failed`).
  VERIFICACION: { campo: null, texto: "Tu banco no confirmó el pago. Intenta de nuevo o usa otra tarjeta." },
  // El reto se dejó: pasó el tiempo sin contestarlo (o el pedido ya no estaba).
  SIN_VERIFICAR: { campo: null, texto: "No se completó la verificación con tu banco. Intenta de nuevo o usa otra tarjeta." },
  // El cliente tocó «Cancelar» en el reto. Este motivo lo pone la tienda, no el servidor.
  CANCELADO: { campo: null, texto: "Cancelaste la verificación con tu banco." },
  OTRO: { campo: null, texto: "Tu banco no aprobó el pago. Prueba con otra tarjeta." },
};

/**
 * Lo que se le dice al cliente cuando el banco rechazó el cobro (`PAGO_RECHAZADO` y su familia).
 * Siempre termina diciendo que no se cobró: es lo primero que quiere saber. Con otra forma de pago
 * disponible, se ofrece; salvo cuando lo que toca es corregir los datos (se corrige y ya).
 */
export function textoDeRechazo(motivo: string | null, otrasFormas: boolean): { campo: CampoDeTarjeta | null; texto: string } {
  const r = (motivo && Object.hasOwn(RECHAZOS, motivo) ? RECHAZOS[motivo] : undefined) ?? RECHAZOS.OTRO!;
  return { campo: r.campo, texto: `${r.texto} No se te cobró nada${otrasFormas && !r.corrige ? "; también puedes elegir otra forma de pago" : ""}.` };
}

/** Lo que se dice cuando el formulario de la tarjeta no se pudo cargar. Nunca un formulario muerto. */
export function textoSinFormulario(otrasFormas: boolean): string {
  return `No pudimos cargar el pago con tarjeta. ${otrasFormas ? "Elige otra forma de pago o vuelve a intentar." : "Revisa tu conexión y vuelve a intentar."}`;
}

// ── Cargar MercadoPago.js ────────────────────────────────────────────────────────────────────────

/** Lo mínimo de MercadoPago.js que se usa aquí (Secure Fields con Core Methods). */
export type CampoSeguro = {
  mount(id: string): CampoSeguro; unmount(): void; focus?(): void;
  on(evento: string, cb: (dato: unknown) => void): CampoSeguro;
};
export type MercadoPagoJs = {
  fields: { create(tipo: string, opciones?: Record<string, unknown>): CampoSeguro; createCardToken(d: { cardholderName: string }): Promise<unknown> };
  getPaymentMethods(d: { bin: string }): Promise<unknown>;
};
type Ventana = { MercadoPago?: new (clave: string, o?: { locale?: string }) => MercadoPagoJs };

let carga: Promise<void> | null = null;

/**
 * Carga MercadoPago.js UNA vez, y solo cuando alguien elige pagar en línea (no en cada visita). Si
 * falla (sin red, un bloqueador), la siguiente llamada lo intenta de nuevo.
 */
export function cargarMercadoPago(clave: string, doc: Document = document, espera = 15_000): Promise<MercadoPagoJs> {
  const w = doc.defaultView as unknown as Ventana;
  carga ??= new Promise<void>((ok, no) => {
    if (w.MercadoPago) return ok();
    const s = doc.createElement("script");
    const reloj = setTimeout(() => no(new Error("tiempo")), espera);
    s.src = SDK_DE_MERCADO_PAGO;
    s.async = true;
    s.onload = () => { clearTimeout(reloj); ok(); };
    s.onerror = () => { clearTimeout(reloj); s.remove(); no(new Error("carga")); };
    doc.head.appendChild(s);
  });
  return carga.then(() => {
    if (!w.MercadoPago) throw new Error("sin MercadoPago");
    return new w.MercadoPago(clave, { locale: "es-MX" });
  }).catch((e) => { carga = null; throw e; });
}

/** El script de seguridad de Mercado Pago: calcula la huella del dispositivo y la deja en `window.MP_DEVICE_SESSION_ID`. */
export const SEGURIDAD_DE_MERCADO_PAGO = "https://www.mercadopago.com/v2/security.js";

/**
 * Pide la huella del dispositivo, UNA vez y solo en la pantalla de la tarjeta. VISTO (12 oct 2026):
 * MercadoPago.js por sí solo NO deja `MP_DEVICE_SESSION_ID` (aunque su documentación lo diga); con
 * este script, sí. No se espera ni se reintenta: si no carga (sin red, un bloqueador), el pago sigue
 * igual, solo sin esa señal para el antifraude.
 */
export function cargarHuellaDeDispositivo(doc: Document = document): void {
  if (doc.querySelector(`script[src="${SEGURIDAD_DE_MERCADO_PAGO}"]`)) return;
  const s = doc.createElement("script");
  s.src = SEGURIDAD_DE_MERCADO_PAGO;
  s.async = true;
  // Mercado Pago pide decir en qué página se está; «checkout» es la del pago.
  s.setAttribute("view", "checkout");
  // Si falla se quita: la siguiente vez que se abra la pantalla de la tarjeta se intenta otra vez.
  s.onerror = () => s.remove();
  doc.head.appendChild(s);
}
