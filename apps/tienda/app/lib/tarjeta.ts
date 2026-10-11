// La tarjeta al pagar en línea. El número, el vencimiento y el código viven en iframes de Mercado
// Pago (Secure Fields de MercadoPago.js): esta página nunca los ve. De aquí solo sale el TOKEN de
// la tarjeta, que es de un solo uso, con su marca y su banco.
//
// Lo puro (qué decirle al cliente, qué se acepta, qué forma tiene lo que devuelve la librería) está
// aquí y se prueba solo. Montar los campos es de `components/tarjeta.tsx`.
//
// TEXTOS PROVISIONALES: los revisa James.

export const SDK_DE_MERCADO_PAGO = "https://sdk.mercadopago.com/js/v2";

/** Lo que viaja en `pedir` de la tarjeta. Nunca el número. */
export type TarjetaDePedido = { token: string; payment_method_id: string; issuer_id: string | null; dispositivo: string | null };

export type CampoDeTarjeta = "numero" | "vence" | "codigo" | "titular";
export const CAMPOS_DE_TARJETA: readonly CampoDeTarjeta[] = ["numero", "vence", "codigo", "titular"];

/** Lo que la tienda sabe de la tarjeta que se está escribiendo. Nunca sus dígitos. */
export type MarcaDeTarjeta = { payment_method_id: string; issuer_id: string | null; tipo: string; nombre: string | null; pideBanco: boolean };

const obj = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const idDe = (v: unknown): string | null => {
  const s = typeof v === "number" && Number.isSafeInteger(v) ? String(v) : typeof v === "string" ? v : "";
  return /^[0-9]{1,20}$/.test(s) ? s : null;
};

/**
 * De lo que contesta `mp.getPaymentMethods({ bin })`, la marca de la tarjeta. null = la librería no
 * reconoce esos primeros dígitos (o contestó otra cosa).
 */
export function marcaDe(respuesta: unknown): MarcaDeTarjeta | null {
  const r = obj(respuesta).results;
  const m = obj(Array.isArray(r) ? r[0] : null);
  const id = typeof m.id === "string" && /^[a-z0-9_]{2,30}$/.test(m.id) ? m.id : null;
  if (!id) return null;
  const pide = Array.isArray(m.additional_info_needed) && m.additional_info_needed.includes("issuer_id");
  return {
    payment_method_id: id, issuer_id: idDe(obj(m.issuer).id), tipo: typeof m.payment_type_id === "string" ? m.payment_type_id : "",
    nombre: typeof m.name === "string" && m.name.length <= 40 ? m.name : null, pideBanco: pide,
  };
}

/** De `mp.getIssuers(...)`, el banco: solo si hay uno. Con varios no se adivina. */
export function bancoDe(respuesta: unknown): string | null {
  return Array.isArray(respuesta) && respuesta.length === 1 ? idDe(obj(respuesta[0]).id) : null;
}

/** Solo crédito y débito. Prepago, vales y lo demás no se aceptan (así lo decidió el dueño). */
export const tipoAceptado = (tipo: string): boolean => tipo === "credit_card" || tipo === "debit_card";

/** El token que devuelve `mp.fields.createCardToken`. null si no tiene la forma. */
export function tokenDe(respuesta: unknown): string | null {
  const id = obj(respuesta).id;
  return typeof id === "string" && /^[A-Za-z0-9]{16,64}$/.test(id) ? id : null;
}

/** El Device ID que deja MercadoPago.js en la página (ayuda a que el banco apruebe). null si no tiene la forma. */
export function dispositivoDe(v: unknown): string | null {
  return typeof v === "string" && /^[A-Za-z0-9_.:-]{8,120}$/.test(v) ? v : null;
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

const RECHAZOS: Record<string, { campo: CampoDeTarjeta | null; texto: string }> = {
  FONDOS: { campo: null, texto: "Tu tarjeta no tiene fondos suficientes. Prueba con otra tarjeta." },
  CODIGO: { campo: "codigo", texto: "El código de seguridad no coincide. Revísalo y vuelve a intentar." },
  FECHA: { campo: "vence", texto: "La fecha de vencimiento no coincide. Revísala y vuelve a intentar." },
  NUMERO: { campo: "numero", texto: "El número de tarjeta no es correcto. Revísalo y vuelve a intentar." },
  LLAMAR_BANCO: { campo: null, texto: "Tu banco pide que autorices este pago. Llámale y vuelve a intentar, o usa otra tarjeta." },
  TARJETA_DESHABILITADA: { campo: null, texto: "Tu tarjeta no está activa para compras en línea. Llama a tu banco o usa otra tarjeta." },
  VERIFICACION: { campo: null, texto: "Tu banco pide una verificación que aquí no se puede hacer. Usa otra tarjeta." },
  OTRO: { campo: null, texto: "Tu banco no aprobó el pago. Prueba con otra tarjeta." },
};

/**
 * Lo que se le dice al cliente cuando el banco rechazó el cobro (`PAGO_RECHAZADO` y su familia).
 * Siempre termina diciendo que no se cobró: es lo primero que quiere saber. Con otra forma de pago
 * disponible, se ofrece.
 */
export function textoDeRechazo(motivo: string | null, otrasFormas: boolean): { campo: CampoDeTarjeta | null; texto: string } {
  const r = (motivo && Object.hasOwn(RECHAZOS, motivo) ? RECHAZOS[motivo] : undefined) ?? RECHAZOS.OTRO!;
  return { campo: r.campo, texto: `${r.texto} No se te cobró nada${otrasFormas && !r.campo ? "; también puedes elegir otra forma de pago" : ""}.` };
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
  getIssuers(d: { paymentMethodId: string; bin: string }): Promise<unknown>;
};
type Ventana = { MercadoPago?: new (clave: string, o?: { locale?: string }) => MercadoPagoJs; MP_DEVICE_SESSION_ID?: unknown };

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

export const dispositivoDeLaPagina = (): string | null => dispositivoDe((globalThis as unknown as Ventana).MP_DEVICE_SESSION_ID);
