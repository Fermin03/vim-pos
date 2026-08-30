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

export const PAGINAS = [
  {
    ruta: '/',
    archivo: 'index.html',
    markdown: 'index.md',
    nombre: 'Inicio',
    resumen: 'Qué es VIM POS, para quién es y qué lo distingue: el sistema completo vive en la caja del local, no en internet.',
    enSitemap: true,
  },
  {
    ruta: '/funciones',
    archivo: 'funciones.html',
    markdown: 'funciones.md',
    nombre: 'Funciones',
    resumen: 'Qué hace el sistema, módulo por módulo: caja, cocina, mesas, inventario, reportes y conciliación de apps de reparto. Con los límites conocidos escritos.',
    enSitemap: true,
  },
  {
    ruta: '/sin-internet',
    archivo: 'sin-internet.html',
    markdown: 'sin-internet.md',
    nombre: 'Sin internet',
    resumen: 'Qué pasa en la caja cuando se cae la señal y qué pasa cuando vuelve. La respuesta técnica a «¿de verdad funciona sin conexión?».',
    enSitemap: true,
  },
  {
    ruta: '/precios',
    archivo: 'precios.html',
    markdown: 'precios.md',
    nombre: 'Precios',
    resumen: 'Los tres planes con su precio publicado en pesos, la tabla comparativa, los extras y los paquetes de folios de factura.',
    enSitemap: true,
  },
  {
    ruta: '/demo',
    archivo: 'demo.html',
    markdown: 'demo.md',
    nombre: 'Pide una demo',
    resumen: 'Cómo se agenda una demostración y qué pasa después de enviar el formulario.',
    enSitemap: true,
  },
  {
    ruta: '/nosotros',
    archivo: 'nosotros.html',
    markdown: 'nosotros.md',
    nombre: 'Nosotros',
    resumen: 'Quién construye VIM POS, desde dónde, por qué existe y en qué punto está el producto hoy.',
    alias: ['/about'],
    enSitemap: true,
  },
  {
    ruta: '/contacto',
    archivo: 'contacto.html',
    markdown: 'contacto.md',
    nombre: 'Contacto',
    resumen: 'Cómo contactar a VIM POS: WhatsApp, correo, domicilio fiscal, horario y en cuánto contestamos.',
    alias: ['/contact'],
    enSitemap: true,
  },
  {
    ruta: '/aviso-privacidad',
    archivo: 'aviso-privacidad.html',
    markdown: 'aviso-privacidad.md',
    nombre: 'Aviso de privacidad',
    resumen: 'Qué datos se recaban, para qué, cuánto se guardan y cómo ejercer los derechos ARCO.',
    alias: ['/privacy'],
    opcional: true,
    enSitemap: true,
  },
  {
    ruta: '/terminos',
    archivo: 'terminos.html',
    markdown: 'terminos.md',
    nombre: 'Términos del servicio',
    resumen: 'Qué se contrata, qué no incluye, cómo se cobra y cómo se cancela.',
    alias: ['/terms'],
    opcional: true,
    enSitemap: true,
  },
];

// El 404 no es una ruta del sitio: es la respuesta a las rutas que no existen.
// Tiene gemelo en Markdown porque un agente que se pierde merece un mapa, no
// una página de error pensada para un navegador.
export const PAGINA_404 = {
  ruta: '/404',
  archivo: '404.html',
  markdown: '404.md',
  nombre: 'Página no encontrada',
  resumen: 'La ruta pedida no existe. Aquí está el mapa del sitio.',
  enSitemap: false,
};

export const TODAS = [...PAGINAS, PAGINA_404];

export const porRuta = (ruta) => TODAS.find((p) => p.ruta === ruta);

// Los datos de contacto viven aquí y no repartidos por nueve archivos, porque
// la coherencia del NAP (nombre, dirección, teléfono) es literalmente uno de
// los puntos que se auditan.
export const NEGOCIO = {
  nombre: 'VIM POS',
  razonSocial: 'Fermín Villalobos Martínez',
  rfc: 'VIMF0308282D7',
  correo: 'hola@vimpos.com.mx',
  whatsapp: '+52 476 127 3020',
  whatsappUrl: 'https://wa.me/524761273020',
  telefonoE164: '+524761273020',
  calle: 'Melchor Ocampo 341',
  ciudad: 'San Francisco del Rincón',
  estado: 'Guanajuato',
  pais: 'MX',
  instagram: 'https://www.instagram.com/vimpos_mx/',
};
