// ════════════════════════════════════════════════════════════════════════════
// El índice de páginas del sitio. Una sola lista, cuatro consumidores.
//
// De aquí salen: los gemelos en Markdown, `llms.txt`, `llms-full.txt`, las
// reglas de `vercel.json` que verifica la prueba, y el sitemap. Cuando se añada
// una página nueva, se añade aquí y todo lo demás se entera. Es a propósito:
// antes de esta lista, «añadir una página» eran seis archivos que se olvidaban
// de a uno.
// ════════════════════════════════════════════════════════════════════════════

export const BASE = 'https://vimpos.com.mx';

// `archivo` y `markdown` salen de la ruta: '/' es `index`, y el resto, la ruta sin la diagonal.
const conArchivos = (p) => {
  const base = p.ruta === '/' ? 'index' : p.ruta.slice(1);
  return { ...p, archivo: `${base}.html`, markdown: `${base}.md` };
};

export const PAGINAS = [
  {
    ruta: '/',
    nombre: 'Inicio',
    resumen: 'Qué es VIM POS, para quién es y qué lo distingue: el sistema completo vive en la caja del local, no en internet.',
    enSitemap: true,
  },
  {
    ruta: '/funciones',
    nombre: 'Funciones',
    resumen: 'Qué hace el sistema, módulo por módulo: caja, cocina, mesas, inventario, reportes y conciliación de apps de reparto. Con los límites conocidos escritos.',
    enSitemap: true,
  },
  {
    ruta: '/sin-internet',
    nombre: 'Sin internet',
    resumen: 'Qué pasa en la caja cuando se cae la señal y qué pasa cuando vuelve. La respuesta técnica a «¿de verdad funciona sin conexión?».',
    enSitemap: true,
  },
  {
    ruta: '/facturacion-cfdi',
    nombre: 'Facturación CFDI',
    resumen:
      'Cómo factura un restaurante con VIM POS: autofactura por QR desde el ticket, factura global del periodo (la emite el dueño con un botón desde el panel), y el plazo para facturar lo decide el negocio. Disponible a través de un proveedor autorizado por el SAT; el negocio carga su sello digital y cada plan trae folios al mes.',
    enSitemap: true,
  },
  {
    ruta: '/precios',
    nombre: 'Precios',
    resumen: 'Los tres planes con su precio en pesos, la tabla comparativa, los extras y los paquetes de folios de factura.',
    enSitemap: true,
  },
  {
    ruta: '/novedades',
    nombre: 'Novedades',
    resumen: 'Qué cambió en VIM POS y cuándo: funciones nuevas, mejoras y correcciones de la caja y del panel, por fecha y por versión.',
    // Lleva `noindex`: es para clientes, no para buscadores.
    enSitemap: false,
  },
  {
    ruta: '/demo',
    nombre: 'Pide una demo',
    resumen: 'Cómo se agenda una demostración y qué pasa después de enviar el formulario.',
    enSitemap: true,
  },
  {
    ruta: '/cuanto-cuesta-un-sistema-para-restaurante',
    nombre: 'Cuánto cuesta',
    resumen:
      'Los tres modelos con los que cobra un sistema para restaurante —licencia fija, gratuito con planes de pago, y porcentaje de cada venta—, la aritmética para comparar cada uno contra la venta real del negocio, y cuándo cada modelo deja de convenir. No nombra marcas: compara modelos.',
    enSitemap: true,
  },
  {
    ruta: '/como-elegir-sistema-restaurante',
    nombre: 'Cómo elegir sistema',
    resumen:
      'Guía de compra: nueve preguntas que hacerle a cualquier software para restaurantes antes de firmar —internet, precio de frente, comisiones, datos, facturación, implementación, permanencia, soporte y equipo— y en qué casos VIM POS no es la respuesta.',
    enSitemap: true,
  },
  {
    ruta: '/factura-global-restaurantes',
    nombre: 'Factura global',
    resumen:
      'Guía fiscal: qué es la factura global, cada cuándo se emite, qué datos lleva en CFDI 4.0 (RFC genérico, uso S01, periodo) y los errores más comunes en un restaurante. No es asesoría fiscal.',
    enSitemap: true,
  },
  {
    ruta: '/punto-de-venta-hamburgueserias',
    nombre: 'Hamburgueserías',
    resumen: 'VIM POS para una hamburguesería: término obligatorio, extras con precio, combos, para llevar y a domicilio, cocina por estación e inventario por receta.',
    enSitemap: true,
  },
  {
    ruta: '/punto-de-venta-restaurantes-leon',
    nombre: 'León, Guanajuato',
    resumen: 'VIM POS para restaurantes de León, Guanajuato, donde se hace el producto: en la zona, la demostración puede ser en el local.',
    enSitemap: true,
  },
  {
    ruta: '/nosotros',
    nombre: 'Nosotros',
    resumen: 'Quién construye VIM POS, desde dónde, por qué existe y en qué punto está el producto hoy.',
    alias: ['/about'],
    enSitemap: true,
  },
  {
    ruta: '/contacto',
    nombre: 'Contacto',
    resumen: 'Cómo contactar a VIM POS: WhatsApp, correo, domicilio fiscal, horario y en cuánto contestamos.',
    alias: ['/contact'],
    enSitemap: true,
  },
  {
    ruta: '/aviso-privacidad',
    nombre: 'Aviso de privacidad',
    resumen: 'Qué datos se recaban, para qué, cuánto se guardan y cómo ejercer los derechos ARCO.',
    alias: ['/privacy'],
    opcional: true,
    enSitemap: true,
  },
  {
    ruta: '/terminos',
    nombre: 'Términos del servicio',
    resumen: 'Qué se contrata, qué no incluye, cómo se cobra y cómo se cancela.',
    alias: ['/terms'],
    opcional: true,
    enSitemap: true,
  },
].map(conArchivos);

// El 404 no es una ruta del sitio: es la respuesta a las rutas que no existen.
// Tiene gemelo en Markdown porque un agente que se pierde merece un mapa, no
// una página de error pensada para un navegador.
export const PAGINA_404 = conArchivos({
  ruta: '/404',
  nombre: 'Página no encontrada',
  resumen: 'La ruta pedida no existe. Aquí está el mapa del sitio.',
  enSitemap: false,
});

export const TODAS = [...PAGINAS, PAGINA_404];

export const porRuta = (ruta) => TODAS.find((p) => p.ruta === ruta);

// Los datos de contacto viven aquí y no repartidos por nueve archivos, porque
// la coherencia del NAP (nombre, dirección, teléfono) es literalmente uno de
// los puntos que se auditan.
//
// 6/09/2026 — de aquí salieron el nombre legal, el RFC, el domicilio y el
// número de WhatsApp. Eran datos personales de una persona física: el RFC de
// una lleva su fecha de nacimiento, el domicilio fiscal era su casa y el
// número era su móvil. Publicados en el sitio, quedaban además en el
// repositorio, que es público. El canal es ahora el correo, que sí es de la
// empresa.
//
// Los campos NO se dejaron vacíos: se borraron. Un campo vacío se cuela en un
// JSON-LD como `"streetAddress": ""` y en una frase como «domicilio en ,
// Guanajuato» —las dos cosas pasaron en este mismo cambio antes de repasarlo a
// mano—. Si algún día vuelve a hacer falta un domicilio publicable, que sea el
// fiscal de un despacho o un buzón, nunca el de casa.
export const NEGOCIO = {
  nombre: 'VIM POS',
  razonSocial: 'VIM POS',
  correo: 'hola@vimpos.com.mx',
  correoUrl: 'mailto:hola@vimpos.com.mx',
  ciudad: 'Guanajuato',
  estado: 'Guanajuato',
  pais: 'MX',
  instagram: 'https://www.instagram.com/vimpos_mx/',
};
