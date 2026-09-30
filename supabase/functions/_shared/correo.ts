// Correo saliente de las Edge Functions por el SMTP de Hostinger (VIM_SMTP_*). Extraído de
// solicitar-demo (0142) para que signup-tenant avise a VIM de cada alta con el MISMO camino, que
// ya está probado contra producción. Las razones de cada detalle (asunto ASCII, no esperar el
// envío, cerrar con prisa) están en los comentarios de abajo y en solicitar-demo/index.ts.
//
// `esc` y `soloAscii` son puros y se prueban con node --test (correo.test.ts). `enviarCorreo` solo
// corre en Deno: importa denomailer al llamarse.

/** Quita acentos y cualquier cosa fuera de ASCII, para el asunto del correo.
 *  Ver la nota en el `subject` sobre por qué esto no es opcional. */
export function soloAscii(v: string): string {
  return v
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // "México" -> "Mexico"
    .replace(/[^ -~]/g, "")                       // lo que quede fuera, fuera
    .slice(0, 160);                                      // asuntos largos se pliegan y se rompen
}

/** Escapa lo que va dentro del correo HTML. El nombre y el negocio los escribe un desconocido. */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

export async function enviarCorreo(payload: { to: string; subject: string; html: string }): Promise<{ enviado: boolean; motivo: string }> {
  const env = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env;
  const host = env?.get("VIM_SMTP_HOST");
  const user = env?.get("VIM_SMTP_USER");
  const pass = env?.get("VIM_SMTP_PASS");
  if (!host || !user || !pass) return { enviado: false, motivo: "SIN_SMTP" };

  const port = Number(env?.get("VIM_SMTP_PORT") ?? "465");

  /* TODO dentro del try, incluidos el import y el constructor.
  
     La primera versión los dejó fuera "porque no lanzan", y sí lanzan: en el
     primer intento contra producción el import reventó y la excepción subió
     hasta el handler, que devolvió un 500 crudo — con el prospecto YA guardado
     en la base. Es decir, el visitante veía un error por un fallo que no le
     afectaba y que él no podía arreglar reintentando.
  
     La regla de este archivo es que después del insert nada puede devolver un
     error al visitante. Escribirla en un comentario no la hace cumplirse; hay
     que envolver el bloque entero. */
  // `null as …` y no `: … = null`: con la anotación, TS estrecha a `null` y dentro del `finally`
  // (tras la asignación en el `try`) daba `never`, así que `cliente.close()` no tipaba.
  let cliente = null as { send: (m: unknown) => Promise<unknown>; close: () => Promise<void> } | null;

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


/**
 * Deja un envío corriendo después de responder (`EdgeRuntime.waitUntil`), sin que su resultado
 * pueda tumbar la respuesta. Ver en solicitar-demo por qué el envío NO se espera.
 */
export function enSegundoPlano(p: Promise<unknown>): void {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (typeof rt?.waitUntil === "function") rt.waitUntil(p);
}
