// Los tres correos de las cuentas de la tienda (entrega 6). Puros, para probarlos sin SMTP; mismo
// molde que correo-pedido.ts. Salen del buzón de VIM con el nombre del restaurante en el asunto y en
// el cuerpo. No llevan NINGÚN dato de la cuenta, tampoco el nombre: quien se registra puede escribir el
// correo de otra persona, y el nombre que tecleó (100 caracteres libres) le llegaría a esa persona
// con nuestro remitente. Lo único de fuera que entra es el nombre del restaurante, que escribe su dueño.
// `esc` y `soloAscii` son los de _shared/correo.ts. El asunto va sin acentos a propósito («esta lista»,
// «contrasena»): denomailer rompe el correo entero si el asunto viaja codificado (ver solicitar-demo).
import { esc, soloAscii } from "../correo.ts";

type Base = {
  /** Nombre del restaurante: lo escribe su dueño, se escapa. */
  negocio: string;
  slug: string;
  /** `VIM_TIENDA_URL`, sin barra final. */
  base: string;
};

const asunto = (texto: string, negocio: string): string => soloAscii(`${texto} - ${negocio}`).replace(/[\s-]+$/, "");
const boton = (href: string, texto: string): string =>
  `<p style="margin:0 0 24px"><a href="${esc(href)}" style="background:#111;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block">${texto}</a></p>`;
const marco = (negocio: string, cuerpo: string): string =>
  `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;color:#111">
<h1 style="font-size:20px;margin:0 0 4px">${esc(negocio)}</h1>
${cuerpo}
</div>`;
const pie = (texto: string): string => `<p style="color:#666;font-size:13px;margin:0">${texto}</p>`;

export function correoDeBienvenida(d: Base): { subject: string; html: string } {
  return {
    subject: asunto("Tu cuenta esta lista", d.negocio),
    html: marco(d.negocio, `<p style="margin:0 0 16px">Hola. Ya tienes tu cuenta en ${esc(d.negocio)}: tus datos y tus direcciones quedan guardados para la próxima vez.</p>
${boton(`${d.base}/${d.slug}`, "Ver el menú")}
${pie(`Si no fuiste tú, <a href="${esc(`${d.base}/${d.slug}/recuperar`)}">crea una contraseña nueva</a> y elimina la cuenta desde «Mi cuenta».`)}`),
  };
}

/**
 * Alguien quiso registrarse con un correo que ya tiene cuenta. La pantalla no se lo dijo (decisión 4:
 * nadie averigua quién es cliente); se lo dice este correo, que solo lee el dueño de la dirección.
 * Sin nombre: el que se escribió en el formulario puede ser de otra persona.
 */
export function correoYaTienesCuenta(d: Base): { subject: string; html: string } {
  return {
    subject: asunto("Ya tienes una cuenta", d.negocio),
    html: marco(d.negocio, `<p style="margin:0 0 16px">Alguien intentó crear una cuenta en ${esc(d.negocio)} con este correo, y ya tienes una. No cambió nada.</p>
${boton(`${d.base}/${d.slug}/entrar`, "Entrar a mi cuenta")}
<p style="margin:0 0 24px">¿No recuerdas tu contraseña? <a href="${esc(`${d.base}/${d.slug}/recuperar`)}">Crea una nueva</a>.</p>
${pie("Si no fuiste tú, ignora este correo.")}`),
  };
}

/**
 * El enlace lleva el token en claro: es el único sitio donde existe además de la huella en la base.
 * Va en el FRAGMENTO (`#t=`): el navegador no manda el fragmento al servidor, así que el token no
 * queda en los registros de peticiones del hosting ni en el HTML de la página. Lo lee la pantalla.
 */
export function correoDeRecuperacion(d: Base & { token: string }): { subject: string; html: string } {
  return {
    subject: asunto("Restablece tu contrasena", d.negocio),
    html: marco(d.negocio, `<p style="margin:0 0 16px">Hola. Pediste cambiar la contraseña de tu cuenta en ${esc(d.negocio)}.</p>
${boton(`${d.base}/${d.slug}/recuperar#t=${d.token}`, "Crear una contraseña nueva")}
<p style="margin:0 0 24px">El enlace dura 30 minutos y sirve una sola vez.</p>
${pie("Si no lo pediste, ignora este correo: tu contraseña sigue siendo la misma.")}`),
  };
}
