// Correo de bienvenida al dueño (0146): la plantilla y el flujo, puros.
//
// Se manda UNA vez por negocio, cuando la cuenta del dueño ya está confirmada: al abrir el enlace
// del registro público (/cuenta-confirmada) o al fijar su contraseña tras la invitación de VIM
// (/establecer-acceso). Lo llama `correo-bienvenida/index.ts`, que pone el Deno, la base y el SMTP;
// aquí no hay nada de eso, así que se prueba con `node --test` (bienvenida.test.ts).
//
// POR QUÉ UN CORREO Y NO SOLO LA PANTALLA. La pantalla de "primeros pasos" existe, pero el dueño
// se registra desde el teléfono, en un rato libre, y la caja se instala otro día, en la
// computadora del negocio. El correo es lo que se queda en su bandeja para ese otro día: a dónde
// entrar, qué descargar, qué impresora comprar y a quién escribirle.
//
// EXACTAMENTE UNA VEZ. La marca vive en la base (`tenant_onboarding_estado.bienvenida_enviada_at`)
// y se RECLAMA antes de enviar, en una sola sentencia: dos pestañas, un doble clic o un reintento
// no pueden reclamar dos veces. Si CUALQUIER cosa falla después de reclamar y antes de que el
// correo quede en camino —la plantilla, la lectura del soporte, el envío mismo— la marca se
// libera para que el siguiente intento lo mande. El peor caso es que la instancia muera a medio
// envío: la marca queda puesta y el correo no sale — se prefiere eso a mandar dos.
//
// SOLO EL DUEÑO LA DISPARA. /establecer-acceso también recibe a un administrador que el dueño
// invitó: que ESA persona fije su contraseña no es motivo para mandarle "bienvenido" al dueño,
// que quizá ya lleva semanas operando. La marca ni se reclama.
import { esc, soloAscii } from "./correo.ts";

export type SoporteBienvenida = { whatsapp: string; horario: string | null };

/**
 * El soporte de VIM si la fila de `plataforma_soporte` no se puede leer. Mismo número que
 * `WHATSAPP_SOPORTE_VIM` de @vim/db/soporte (las funciones Deno no importan del monorepo) y el
 * horario de atención vigente.
 */
export const SOPORTE_RESPALDO: SoporteBienvenida = Object.freeze({
  whatsapp: "525665083346",
  horario: "lunes a viernes de 9:00 a 18:00; sábado y domingo de 9:00 a 14:00",
}) as SoporteBienvenida;

/** Lee `{ whatsapp, horario }` de lo que venga de la base; si no trae un número usable, el respaldo. */
export function soporteBienvenida(fila: unknown): SoporteBienvenida {
  const f = fila && typeof fila === "object" ? (fila as Record<string, unknown>) : {};
  const whatsapp = typeof f.whatsapp === "string" ? f.whatsapp.replace(/\D/g, "") : "";
  if (!/^[0-9]{10,15}$/.test(whatsapp)) return SOPORTE_RESPALDO;
  const horario = typeof f.horario === "string" && f.horario.trim() !== "" ? f.horario.trim() : null;
  return { whatsapp, horario };
}

/** "+52 56 6508 3346" para leerlo en el correo. */
function whatsappLegible(n: string): string {
  if (n.length === 12 && n.startsWith("52")) return `+52 ${n.slice(2, 4)} ${n.slice(4, 8)} ${n.slice(8)}`;
  return `+${n}`;
}

export type DatosBienvenida = {
  nombreDueno: string | null;
  negocio: string;
  /** Origen del panel del dueño: https://admin.vimpos.com.mx */
  adminUrl: string;
  soporte: SoporteBienvenida;
};

/**
 * El correo. HTML sencillo que también se lee como texto: párrafos y listas, sin imágenes ni
 * hojas de estilo, y cada enlace enseña su dirección (un cliente que no pinte HTML la deja a la
 * vista). Los pasos son los mismos, y en el mismo orden, que "primeros pasos" del panel
 * (apps/admin/app/lib/onboarding.ts): si cambian allá, cambian aquí.
 */
export function correoBienvenida(d: DatosBienvenida): { subject: string; html: string } {
  const base = d.adminUrl.replace(/\/+$/, "");
  const panel = `${base}/bienvenida`;
  const descargar = `${base}/configuracion/cajas/descargar`;
  const plan = `${base}/configuracion/plan`;
  const primer = (d.nombreDueno ?? "").trim().split(/\s+/)[0] ?? "";
  const negocio = d.negocio.trim();
  const wa = `https://wa.me/${d.soporte.whatsapp}`;
  const enlace = (url: string) => `<a href="${esc(url)}">${esc(url)}</a>`;
  const p = 'style="margin:0 0 14px"';

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#16161A;max-width:560px">
  <p ${p}>Hola${primer ? ` ${esc(primer)}` : ""}:</p>
  <p ${p}>Tu cuenta de VIM POS${negocio ? ` para <b>${esc(negocio)}</b>` : ""} ya está lista. Esto es lo que sigue para empezar a vender, en este orden:</p>
  <ol style="margin:0 0 14px;padding-left:22px">
    <li><b>Datos del negocio.</b> Nombre, zona horaria y hora de corte.</li>
    <li><b>Tu menú.</b> Importa o captura tus productos y categorías.</li>
    <li><b>Tu caja.</b> Da de alta tu punto de cobro; tu sucursal se crea con ella.</li>
    <li><b>Conecta la computadora de tu caja.</b> Descarga VIM POS en ella y captura una vez la clave que te da el panel.</li>
    <li><b>Tu equipo.</b> Crea a tus cajeros y a cocina, cada quien con su PIN.</li>
  </ol>
  <p ${p}>Facturación es opcional: solo si vas a facturar, ahí mismo capturas tus datos fiscales y tu sello digital.</p>
  <p ${p}>Todo se hace desde tu panel, y cada paso se marca solo cuando lo terminas:<br>${enlace(panel)}</p>

  <p style="margin:22px 0 6px"><b>Qué necesitas para la caja</b></p>
  <ul style="margin:0 0 14px;padding-left:22px">
    <li>Una computadora con Windows 10 u 11.</li>
    <li>Una impresora de tickets <b>de red</b> (con cable de red o Wi-Fi). Las impresoras USB no funcionan con VIM POS; si vas a comprar una, pide que diga «Ethernet» o «LAN».</li>
    <li>Internet para conectarla la primera vez. Después la caja sigue cobrando aunque se vaya el internet.</li>
  </ul>
  <p ${p}>El programa de la caja se descarga aquí, desde la computadora donde vas a cobrar:<br>${enlace(descargar)}</p>

  <p style="margin:22px 0 6px"><b>Cómo se paga</b></p>
  <p ${p}>El pago es por transferencia. Lo que pagas, tu fecha de pago y los datos de la cuenta están en tu panel, en Configuración, Plan y pagos:<br>${enlace(plan)}</p>

  <p style="margin:22px 0 6px"><b>Si te atoras</b></p>
  <p ${p}>Escríbenos por WhatsApp al <a href="${esc(wa)}">${esc(whatsappLegible(d.soporte.whatsapp))}</a>.${d.soporte.horario ? ` Horario de atención: ${esc(d.soporte.horario)}.` : ""}</p>

  <p style="margin:22px 0 0">El equipo de VIM POS</p>
</div>`.trim();

  return {
    // ASCII puro: un asunto con acentos viaja codificado y denomailer lo rompe (ver solicitar-demo).
    subject: soloAscii(negocio ? `Bienvenido a VIM POS - primeros pasos para ${negocio}` : "Bienvenido a VIM POS - tus primeros pasos"),
    html,
  };
}

// ── El flujo ────────────────────────────────────────────────────────────────────────────────────

export type ReclamoBienvenida = "RECLAMADA" | "YA_ENVIADA" | "NO_APLICA";

export type DepsBienvenida = {
  /** Quién llama, con el token YA verificado, y el negocio de su sesión. null = sin sesión válida. */
  quienLlama(): Promise<{ usuarioId: string; tenantId: string | null } | null>;
  /** Límite de tasa por usuario y global (`consumir_cupo`). */
  hayCupo(usuarioId: string): Promise<boolean>;
  leerNegocio(tenantId: string): Promise<{ nombre: string; duenoId: string | null } | null>;
  leerDueno(duenoId: string): Promise<{ email: string | null; nombre: string | null; confirmado: boolean } | null>;
  /** La fila de `plataforma_soporte` (o lo que haya). Puede fallar: se usa el respaldo. */
  leerSoporte(): Promise<unknown>;
  /** Reclama el envío en la base, de forma atómica (`reclamar_bienvenida`). */
  reclamar(tenantId: string): Promise<ReclamoBienvenida>;
  /** Suelta la marca porque el correo no salió (`liberar_bienvenida`). */
  liberar(tenantId: string): Promise<void>;
  enviar(correo: { to: string; subject: string; html: string }): Promise<{ enviado: boolean; motivo: string }>;
  adminUrl: string;
  /** Deja el envío corriendo tras responder (EdgeRuntime.waitUntil). Opcional. */
  enSegundoPlano?(p: Promise<unknown>): void;
  log?(nivel: "info" | "warn" | "error", mensaje: string): void;
};

export type RespuestaBienvenida = { status: number; body: { ok: boolean; enviado: boolean; motivo?: string } };

/**
 * Manda la bienvenida si toca. Nunca lanza y nunca devuelve el detalle de un error interno: quien
 * llama es la pantalla de confirmación del dueño, que no tiene nada que hacer con él.
 */
export async function procesarBienvenida(d: DepsBienvenida): Promise<RespuestaBienvenida> {
  const log = d.log ?? (() => {});
  const no = (motivo: string, status = 200): RespuestaBienvenida => ({ status, body: { ok: status === 200, enviado: false, motivo } });

  let tenantId = "";
  // true desde que la marca es nuestra y hasta que el correo queda en camino. Si se sale del
  // bloque con ella en true —por lo que sea—, el `finally` la suelta.
  let reclamada = false;
  const soltar = async (por: string) => {
    reclamada = false;
    log("warn", `bienvenida de ${tenantId} NO enviada (${por}); se libera para reintentar.`);
    await d.liberar(tenantId).catch((e) => log("error", `no se pudo liberar la bienvenida de ${tenantId}: ${e instanceof Error ? e.message : String(e)}`));
  };

  try {
    const quien = await d.quienLlama();
    if (!quien) return no("NO_AUTH", 401);
    if (!quien.tenantId) return no("SIN_PERMISO", 403);
    tenantId = quien.tenantId;

    if (!(await d.hayCupo(quien.usuarioId))) return no("DEMASIADOS_INTENTOS", 429);

    const negocio = await d.leerNegocio(tenantId);
    if (!negocio?.duenoId) return no("SIN_DUENO");
    // Solo el dueño, con SU sesión: el correo es para él y lo dispara su llegada, no la de un
    // administrador o un empleado que también pase por estas pantallas.
    if (negocio.duenoId !== quien.usuarioId) return no("NO_ES_DUENO");
    const dueno = await d.leerDueno(negocio.duenoId);
    if (!dueno?.email) return no("SIN_CORREO");
    // Un dueño sin confirmar todavía no llegó: su correo de ahora es el de confirmación.
    if (!dueno.confirmado) return no("SIN_CONFIRMAR");

    const reclamo = await d.reclamar(tenantId);
    if (reclamo !== "RECLAMADA") return no(reclamo);
    reclamada = true;

    const soporte = soporteBienvenida(await d.leerSoporte().catch(() => null));
    const correo = correoBienvenida({ nombreDueno: dueno.nombre, negocio: negocio.nombre, adminUrl: d.adminUrl, soporte });

    // No se espera: el SMTP puede tardar (o no contestar nunca aunque ya haya entregado), y el
    // dueño está en la pantalla de "confirmando tu correo".
    const envio = Promise.resolve()
      .then(() => d.enviar({ to: dueno.email!, subject: correo.subject, html: correo.html }))
      .then((r) => (r.enviado ? log("info", `bienvenida de ${tenantId} enviada.`) : soltar(r.motivo)))
      .catch((e) => soltar(e instanceof Error ? e.message : String(e)));
    // El correo ya va en camino: desde aquí la marca es asunto del propio envío (que la suelta si
    // falla), no del `finally`. Soltarla ahora, con el envío vivo, podría mandar dos.
    reclamada = false;
    try {
      d.enSegundoPlano?.(envio);
    } catch (e) {
      log("warn", `bienvenida de ${tenantId}: no se pudo dejar en segundo plano (${e instanceof Error ? e.message : String(e)}); el envío sigue.`);
    }

    return { status: 200, body: { ok: true, enviado: true } };
  } catch (e) {
    log("error", `bienvenida${tenantId ? ` de ${tenantId}` : ""}: ${e instanceof Error ? e.message : String(e)}`);
    return { status: 200, body: { ok: false, enviado: false, motivo: "ERROR" } };
  } finally {
    if (reclamada) await soltar("falló antes de enviar");
  }
}
