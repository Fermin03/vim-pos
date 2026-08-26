// Edge Function: solicitar-demo — el formulario del sitio público (sitio-web/demo.html).
//
// Pública como signup-tenant: la llama cualquier visitante con la anon key, así que valida su
// propia entrada y no confía en nada de lo que recibe.
//
// EL ORDEN IMPORTA: PRIMERO LA FILA, DESPUÉS EL CORREO — Y SIN ESPERARLO
//
// La fila en `prospectos` es la fuente de verdad y el correo es solo el aviso. Si el correo falla
// —o si todavía no hay proveedor configurado— la función devuelve éxito igual, porque el prospecto
// YA está guardado y se puede atender desde /platform. Al revés sería tirar un lead por un fallo
// de un tercero, y un lead perdido cuesta más que todo el sitio.
//
// UN SOLO CORREO, NO DOS
//
// El plan del sitio pedía "aviso interno y acuse al prospecto". El acuse no se puede mandar: el
// formulario no pide correo —pide WhatsApp, que es por donde contesta un restaurantero— y añadir
// un campo de correo solo para poder acusar recibo cuesta conversión y no da nada. El acuse va en
// pantalla al enviar, que es donde la persona ya está mirando.
//
// EL CORREO SALE POR EL SMTP DE HOSTINGER
//
// No por un proveedor transaccional tipo Resend: el buzón de Hostinger ya existe y ya se usa para
// las invitaciones de Supabase Auth, así que no hace falta dar de alta un servicio más ni
// verificar un dominio otra vez.
//
// La contrapartida, para que conste: un SMTP compartido no da métricas de entrega ni reputación
// propia. Para avisos internos —que van a nuestro propio buzón— eso da igual. El día que haya que
// mandar correo AL PROSPECTO en volumen, esto se queda corto y toca un proveedor de verdad.
//
//   supabase secrets set VIM_SMTP_HOST="smtp.hostinger.com"
//   supabase secrets set VIM_SMTP_PORT="465"
//   supabase secrets set VIM_SMTP_USER="hola@vimpos.com.mx"
//   supabase secrets set VIM_SMTP_PASS="<la del buzón>"
//   supabase secrets set VIM_AVISOS_A="hola@vimpos.com.mx"
//
// El puerto 465 es TLS implícito (`tls: true`). Si se usa el 587, hay que poner `tls: false`,
// porque ahí la conexión empieza en claro y sube a TLS con STARTTLS.
//
// SIN ESAS VARIABLES LOS PROSPECTOS SOLO LLEGAN A LA TABLA. La función no falla —el lead ya está
// guardado— pero la promesa del sitio, «te contestamos el mismo día hábil», dependería entonces
// de que alguien mire /platform. Es un compromiso operativo, no copy.
//
// DEFENSAS CONTRA BOTS, Y LO QUE NO CUBREN
//
//   · Honeypot: un campo que ningún humano ve. Si viene lleno, se responde 200 y se tira.
//     Responder 200 y no 400 es deliberado — un bot que recibe error reintenta con otra forma.
//   · Tiempo mínimo de llenado: el formulario manda cuándo se abrió. Menos de 3 s es un guion.
//     El dato lo pone el cliente, así que un bot decente lo falsea; filtra a los que no se
//     molestan, que son la mayoría.
//   · Límite por IP en memoria. Cada instancia tiene su propio contador y las instancias van y
//     vienen, así que esto NO es un rate-limit fuerte: es un tope al accidente y al bot torpe.
//     El día que haya spam de verdad, la respuesta es un captcha o el WAF de delante, no esto.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const GIROS = ["FOODTRUCK", "QUICK_SERVICE", "FULL_SERVICE", "CAFE_BAR", "DARK_KITCHEN", "ENTERPRISE"];

const GIRO_ETIQUETA: Record<string, string> = {
  FOODTRUCK: "Food truck",
  QUICK_SERVICE: "Comida rápida / mostrador",
  FULL_SERVICE: "Restaurante con meseros",
  CAFE_BAR: "Cafetería o bar",
  DARK_KITCHEN: "Cocina fantasma / solo reparto",
  ENTERPRISE: "Cadena",
};

const MIN_SEGUNDOS_LLENADO = 3;
const MAX_POR_IP = 5;
const VENTANA_MS = 60 * 60 * 1000; // una hora

/** IP → marcas de tiempo de los envíos recientes. Ver la nota del encabezado sobre su alcance. */
const porIp = new Map<string, number[]>();

function demasiados(ip: string): boolean {
  const ahora = Date.now();
  const recientes = (porIp.get(ip) ?? []).filter((t) => ahora - t < VENTANA_MS);
  recientes.push(ahora);
  porIp.set(ip, recientes);

  // Sin esto el Map crece hasta que la instancia muere. Barato porque solo corre al recibir algo.
  if (porIp.size > 5000) {
    for (const [k, v] of porIp) {
      if (v.every((t) => ahora - t >= VENTANA_MS)) porIp.delete(k);
    }
  }
  return recientes.length > MAX_POR_IP;
}

/** Deja solo dígitos y quita el 52 / +52 de lada para guardar los 10 de siempre. */
function normalizarWhatsapp(v: string): string {
  const d = v.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("52")) return d.slice(2);
  if (d.length === 13 && d.startsWith("521")) return d.slice(3);
  return d;
}

function texto(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function entero(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number.parseInt(String(v ?? ""), 10);
  return Number.isInteger(n) ? n : null;
}

/** Quita acentos y cualquier cosa fuera de ASCII, para el asunto del correo.
 *  Ver la nota en el `subject` sobre por qué esto no es opcional. */
function soloAscii(v: string): string {
  return v
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // "México" -> "Mexico"
    .replace(/[^ -~]/g, "")                       // lo que quede fuera, fuera
    .slice(0, 160);                                      // asuntos largos se pliegan y se rompen
}

/** Escapa lo que va dentro del correo HTML. El nombre y el negocio los escribe un desconocido. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

async function enviarCorreo(payload: { to: string; subject: string; html: string }) {
  const host = Deno.env.get("VIM_SMTP_HOST");
  const user = Deno.env.get("VIM_SMTP_USER");
  const pass = Deno.env.get("VIM_SMTP_PASS");
  if (!host || !user || !pass) return { enviado: false, motivo: "SIN_SMTP" };

  const port = Number(Deno.env.get("VIM_SMTP_PORT") ?? "465");

  /* TODO dentro del try, incluidos el import y el constructor.
  
     La primera versión los dejó fuera "porque no lanzan", y sí lanzan: en el
     primer intento contra producción el import reventó y la excepción subió
     hasta el handler, que devolvió un 500 crudo — con el prospecto YA guardado
     en la base. Es decir, el visitante veía un error por un fallo que no le
     afectaba y que él no podía arreglar reintentando.
  
     La regla de este archivo es que después del insert nada puede devolver un
     error al visitante. Escribirla en un comentario no la hace cumplirse; hay
     que envolver el bloque entero. */
  let cliente: { send: (m: unknown) => Promise<unknown>; close: () => Promise<void> } | null = null;

  try {
    const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");

    cliente = new SMTPClient({
      connection: {
        hostname: host,
        port,
        tls: port === 465,    // 465 = TLS desde el primer byte; 587 = STARTTLS
        auth: { username: user, password: pass },
      },
    }) as unknown as typeof cliente;

    await cliente!.send({
      from: user,             // Hostinger rechaza un `from` que no sea el buzón autenticado
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    });
    return { enviado: true, motivo: "" };
  } catch (e) {
    return { enviado: false, motivo: `SMTP: ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    /* Cerrar la conexión, PERO CON PRISA.

       En el primer intento contra producción el correo se envió y aun así la
       función devolvió 500: `close()` se quedó colgado, y como estaba en un
       `finally`, el valor de retorno nunca llegó a salir. El lead guardado, el
       correo enviado, y el visitante viendo un error.

       Dos segundos y seguimos. Dejar la conexión sin cerrar del todo es un mal
       menor —la instancia se recicla sola— comparado con tumbar la respuesta. */
    if (cliente) {
      await Promise.race([
        cliente.close().catch(() => {}),
        new Promise((r) => setTimeout(r, 2000)),
      ]);
    }
  }
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return json({ error: "BAD_JSON" }, 400);
  }

  // ── Honeypot ──────────────────────────────────────────────────────────────
  // 200 y silencio: que el bot crea que funcionó y no vuelva a probar de otra forma.
  if (texto(b.sitio_web, 200)) return json({ ok: true });

  // ── Tiempo de llenado ─────────────────────────────────────────────────────
  const abierto = entero(b.abierto_en);
  if (abierto !== null && (Date.now() - abierto) / 1000 < MIN_SEGUNDOS_LLENADO) {
    return json({ ok: true });
  }

  // ── Límite por IP ─────────────────────────────────────────────────────────
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || "desconocida";
  if (demasiados(ip)) {
    return json({ error: "DEMASIADOS_ENVIOS", detalle: "Inténtalo más tarde o escríbenos por WhatsApp." }, 429);
  }

  // ── Validación ────────────────────────────────────────────────────────────
  // A mano y no con Zod, como el resto de las funciones de este proyecto (ver signup-tenant).
  const nombre = texto(b.nombre, 120);
  const whatsapp = normalizarWhatsapp(texto(b.whatsapp, 40));
  const negocio = texto(b.negocio, 150);
  const giro = texto(b.giro, 30) || null;
  const usa_hoy = texto(b.usa_hoy, 300) || null;
  const mensaje = texto(b.mensaje, 1000) || null;
  const cajas = entero(b.cajas);
  const sucursales = entero(b.sucursales);

  const faltan: string[] = [];
  if (nombre.length < 2) faltan.push("nombre");
  if (whatsapp.length < 10 || whatsapp.length > 15) faltan.push("whatsapp");
  if (negocio.length < 2) faltan.push("negocio");
  if (cajas === null || cajas < 1 || cajas > 99) faltan.push("cajas");
  if (sucursales === null || sucursales < 1 || sucursales > 99) faltan.push("sucursales");
  if (giro !== null && !GIROS.includes(giro)) faltan.push("giro");
  if (faltan.length) return json({ error: "DATOS_INVALIDOS", campos: faltan }, 400);

  // ── La fila ───────────────────────────────────────────────────────────────
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: fila, error } = await admin
    .from("prospectos")
    .insert({
      nombre,
      whatsapp,
      negocio,
      cajas,
      sucursales,
      giro,
      usa_hoy,
      mensaje,
      origen: texto(b.origen, 60) || "sitio-web",
      utm_source: texto(b.utm_source, 100) || null,
      utm_campaign: texto(b.utm_campaign, 100) || null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[solicitar-demo] no se pudo guardar el prospecto:", error.message);
    return json({ error: "NO_GUARDADO", detalle: "Escríbenos por WhatsApp mientras lo arreglamos." }, 500);
  }

  // ── El aviso ──────────────────────────────────────────────────────────────
  // A partir de aquí nada puede devolver un error al visitante: su solicitud ya quedó registrada.
  const avisoA = Deno.env.get("VIM_AVISOS_A") ?? "hola@vimpos.com.mx";
  const escalon = sucursales! > 1 ? "Cadena" : cajas! > 1 ? "Negocio" : "Esencial";

  /* EL CORREO NO BLOQUEA LA RESPUESTA. Ya no se espera.

     Con `await`, dos intentos seguidos contra producción devolvieron 500 CON EL
     CORREO YA ENTREGADO: el `send()` de denomailer no resuelve su promesa
     —Hostinger mantiene la conexión abierta— así que la función agotaba su
     tiempo aunque su trabajo estuviera hecho. Acortar el cierre no arregló
     nada porque el cuelgue estaba antes.

     `EdgeRuntime.waitUntil` deja el envío corriendo después de responder, que
     es lo que corresponde: el lead ya está en la base y el visitante no tiene
     por qué esperar a un servidor de correo para ver su acuse. Si el correo
     falla, se entera el log, no él. */
  const envio = enviarCorreo({
    to: avisoA,
    /* ASCII puro, y no es purismo: la primera versión llevaba `·` y `→`, que
       viajan en la cabecera como palabra codificada MIME. denomailer la genera
       mal, el cliente no puede decodificarla y —esto es lo grave— al romperse
       el `Subject` se pierde la separación entre cabeceras y cuerpo: el correo
       llegó enseñando el MIME crudo y el HTML sin renderizar.

       Un asunto sin acentos ni símbolos no necesita codificarse en absoluto.
       Es la solución más aburrida y la única que no depende de que la librería
       lo haga bien. `negocio` lo escribe un desconocido, así que también se
       limpia. */
    subject: soloAscii(`Demo: ${negocio} - ${cajas} caja(s), ${sucursales} sucursal(es) - ${escalon}`),
    html: `
      <h2 style="font-family:sans-serif">${esc(negocio)}</h2>
      <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
        <tr><td><b>Nombre</b></td><td>${esc(nombre)}</td></tr>
        <tr><td><b>WhatsApp</b></td><td><a href="https://wa.me/52${esc(whatsapp)}">${esc(whatsapp)}</a></td></tr>
        <tr><td><b>Cajas</b></td><td>${cajas}</td></tr>
        <tr><td><b>Sucursales</b></td><td>${sucursales}</td></tr>
        <tr><td><b>Giro</b></td><td>${esc(giro ? (GIRO_ETIQUETA[giro] ?? giro) : "no dijo")}</td></tr>
        <tr><td><b>Usa hoy</b></td><td>${esc(usa_hoy ?? "no dijo")}</td></tr>
        <tr><td><b>Mensaje</b></td><td>${esc(mensaje ?? "")}</td></tr>
        <tr><td><b>Escalón sugerido</b></td><td>${escalon}</td></tr>
      </table>`,
  }).then((r) => {
    if (!r.enviado) console.warn(`[solicitar-demo] prospecto ${fila.id}: aviso NO enviado (${r.motivo}).`);
    else console.log(`[solicitar-demo] prospecto ${fila.id}: aviso enviado.`);
  }).catch((e) => {
    console.error(`[solicitar-demo] prospecto ${fila.id}: el envío reventó — ${e?.message ?? e}`);
  });

  /* `waitUntil` mantiene viva la instancia hasta que el envío termine, sin
     retrasar la respuesta. Si no existe —otro runtime, o una versión sin él—
     el envío queda en segundo plano de todos modos y en el peor caso se corta
     al reciclarse la instancia: peor para el aviso, pero nunca para el lead. */
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (typeof rt?.waitUntil === "function") rt.waitUntil(envio);

  /* Ya no se puede decir si el aviso salió: se está mandando mientras esto
     responde. El resultado va al log de la función, que es donde toca mirarlo.
     El visitante nunca necesitó ese dato. */
  return json({ ok: true, id: fila.id });
});
