// ════════════════════════════════════════════════════════════════════════════
// De HTML a Markdown, para este sitio y no para cualquiera.
//
// No es una librería de propósito general y no pretende serlo: convierte el
// `<main>` de las páginas de vimpos.com.mx, que están escritas a mano y bien
// formadas. Por eso el analizador cabe en cien líneas y no hay una dependencia
// de npm — que es justo lo que este sitio no quiere tener (ver DESPLIEGUE.md:
// aquí no se instala ni se construye nada).
//
// Si algún día el marcado se genera con una herramienta y deja de estar bien
// formado, esto se rompe de forma ruidosa —la prueba lo detecta— y ése es el
// momento de cambiarlo por una librería de verdad. No antes.
// ════════════════════════════════════════════════════════════════════════════

const VACIOS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr', 'path',
  'circle', 'rect', 'line', 'polygon', 'polyline', 'stop', 'use',
]);

// Lo que no dice nada en texto plano: la navegación que se repite en cada
// página, los dibujos, los controles. El pie tampoco: sus enlaces se añaden al
// final del archivo con un formato que un agente lee de una sola pasada.
const IGNORADOS = new Set([
  'script', 'style', 'svg', 'button', 'form', 'nav', 'header', 'footer',
  'select', 'input', 'label', 'noscript', 'template',
]);

function tokenizar(html) {
  const tokens = [];
  const re = /<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<\/([a-zA-Z][^\s/>]*)\s*>|<([a-zA-Z][^\s/>]*)((?:"[^"]*"|'[^']*'|[^>])*?)\/?>|([^<]+)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[0].startsWith('<!')) continue;
    if (m[1]) tokens.push({ tipo: 'cierre', nombre: m[1].toLowerCase() });
    else if (m[2]) tokens.push({ tipo: 'apertura', nombre: m[2].toLowerCase(), atributos: atributos(m[3] || '') });
    else if (m[4] !== undefined) tokens.push({ tipo: 'texto', texto: m[4] });
  }
  return tokens;
}

function atributos(cadena) {
  const salida = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(cadena)) !== null) {
    salida[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return salida;
}

export function analizar(html) {
  const raiz = { nombre: '#raiz', atributos: {}, hijos: [] };
  const pila = [raiz];
  for (const t of tokenizar(html)) {
    const actual = pila[pila.length - 1];
    if (t.tipo === 'texto') {
      actual.hijos.push({ nombre: '#texto', texto: t.texto, atributos: {}, hijos: [] });
    } else if (t.tipo === 'apertura') {
      const nodo = { nombre: t.nombre, atributos: t.atributos, hijos: [] };
      actual.hijos.push(nodo);
      if (!VACIOS.has(t.nombre)) pila.push(nodo);
    } else {
      // Un cierre se busca hacia atrás en la pila. Si está huérfano se ignora,
      // en vez de desmontar el árbol entero.
      const i = pila.map((n) => n.nombre).lastIndexOf(t.nombre);
      if (i > 0) pila.length = i;
    }
  }
  return raiz;
}

const ENTIDADES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', laquo: '«', raquo: '»',
  times: '×', middot: '·', deg: '°', euro: '€', pound: '£',
};

function desescapar(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (todo, cuerpo) => {
    if (cuerpo[0] === '#') {
      const n = cuerpo[1] === 'x' || cuerpo[1] === 'X'
        ? parseInt(cuerpo.slice(2), 16)
        : parseInt(cuerpo.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : todo;
    }
    return ENTIDADES[cuerpo] ?? todo;
  });
}

// `solo-lectores` NO se salta: es contenido escrito para quien no ve la
// pantalla —títulos de sección, pies de tabla— y un agente está exactamente en
// esa situación. Saltarlo dejaba la tabla comparativa de precios sin encabezado.
const saltar = (nodo) =>
  IGNORADOS.has(nodo.nombre) ||
  nodo.atributos?.['aria-hidden'] === 'true' ||
  /\b(trampa|monitor-barra)\b/.test(nodo.atributos?.class || '');

export function convertir(html, { base = 'https://vimpos.com.mx' } = {}) {
  const arbol = analizar(html);

  const absoluta = (href) => {
    if (!href) return '';
    if (/^(https?:|mailto:|tel:|#)/.test(href)) return href;
    if (href.startsWith('/')) return base + href;
    return base + '/' + href.replace(/^\.\//, '');
  };

  // ── Texto en línea ────────────────────────────────────────────────────────
  function enLinea(nodo) {
    if (nodo.nombre === '#texto') return desescapar(nodo.texto).replace(/\s+/g, ' ');
    if (saltar(nodo)) return '';
    const dentro = nodo.hijos.map(enLinea).join('');
    switch (nodo.nombre) {
      case 'strong': case 'b': {
        const t = dentro.trim();
        return t ? `**${t}** ` : '';
      }
      case 'em': case 'i': {
        const t = dentro.trim();
        return t ? `_${t}_ ` : '';
      }
      case 'code': case 'kbd': {
        const t = dentro.trim();
        return t ? '`' + t + '`' : '';
      }
      case 'a': {
        const t = dentro.trim();
        const href = absoluta(nodo.atributos.href);
        return t && href ? `[${t}](${href})` : t;
      }
      case 'br':
        return '\n';
      case 'img': {
        const alt = desescapar(nodo.atributos.alt || '').trim();
        return alt ? `![${alt}](${absoluta(nodo.atributos.src)})` : '';
      }
      default:
        return dentro;
    }
  }

  const limpiar = (s) => s.replace(/[ \t]+/g, ' ').replace(/ ([,.;:)])/g, '$1').trim();

  function buscar(nodo, nombre) {
    if (nodo.nombre === nombre) return nodo;
    for (const h of nodo.hijos || []) {
      const r = buscar(h, nombre);
      if (r) return r;
    }
    return null;
  }

  function tabla(nodo) {
    const filas = [];
    (function recorrer(x) {
      if (x.nombre === 'tr') {
        filas.push(
          (x.hijos || [])
            .filter((c) => c.nombre === 'th' || c.nombre === 'td')
            .map((c) => limpiar(enLinea(c)).replace(/\|/g, '\\|') || ' '),
        );
        return;
      }
      for (const h of x.hijos || []) recorrer(h);
    })(nodo);

    if (!filas.length) return '';
    const ancho = Math.max(...filas.map((f) => f.length));
    const nivelar = (f) => [...f, ...Array(ancho - f.length).fill(' ')];
    const [cabecera, ...cuerpo] = filas.map(nivelar);
    const lineas = [
      `| ${cabecera.join(' | ')} |`,
      `| ${Array(ancho).fill('---').join(' | ')} |`,
      ...cuerpo.map((f) => `| ${f.join(' | ')} |`),
    ];
    const pie = buscar(nodo, 'caption');
    const textoPie = pie ? limpiar(enLinea(pie)) : '';
    if (textoPie) lineas.unshift(`_${textoPie}_`, '');
    return lineas.join('\n');
  }

  // ── Bloques ───────────────────────────────────────────────────────────────
  function bloques(nodo) {
    if (nodo.nombre === '#texto') {
      const t = limpiar(desescapar(nodo.texto));
      return t ? [t] : [];
    }
    if (saltar(nodo)) return [];

    const n = nodo.nombre;

    if (/^h[1-6]$/.test(n)) {
      const t = limpiar(enLinea(nodo));
      return t ? ['#'.repeat(Number(n[1])) + ' ' + t] : [];
    }

    if (n === 'p' || n === 'figcaption' || n === 'caption' || n === 'dd' || n === 'dt') {
      const t = limpiar(enLinea(nodo));
      if (!t) return [];
      // El «eyebrow» es el rótulo pequeño que va sobre cada título. En Markdown
      // se marca en cursiva para que no compita con los encabezados de verdad.
      if (/\beyebrow\b/.test(nodo.atributos.class || '')) return [`_${t}_`];
      if (n === 'figcaption' || n === 'caption') return [`_${t}_`];
      return [t];
    }

    if (n === 'ul' || n === 'ol') {
      const marca = (i) => (n === 'ol' ? `${i + 1}. ` : '- ');
      const puntos = nodo.hijos
        .filter((h) => h.nombre === 'li' && !saltar(h))
        .map((h, i) => {
          const partes = bloques(h);
          if (!partes.length) return '';
          const sangria = ' '.repeat(marca(i).length);
          const [primera, ...resto] = partes;
          return [
            marca(i) + primera,
            ...resto.map((r) => r.split('\n').map((l) => sangria + l).join('\n')),
          ].join('\n\n');
        })
        .filter(Boolean);
      return puntos.length ? [puntos.join('\n')] : [];
    }

    if (n === 'li') {
      // Un `li` con estructura (título y párrafos) conserva sus bloques; uno
      // simple se aplana a una sola línea.
      const conEstructura = nodo.hijos.some((h) => /^(h[1-6]|p|ul|ol|div)$/.test(h.nombre));
      if (!conEstructura) {
        const t = limpiar(enLinea(nodo));
        return t ? [t] : [];
      }
      return nodo.hijos.flatMap(bloques);
    }

    if (n === 'table') return [tabla(nodo)].filter(Boolean);

    if (n === 'figure') {
      const salida = [];
      const img = buscar(nodo, 'img');
      if (img) {
        const alt = desescapar(img.atributos.alt || '').trim();
        if (alt) salida.push(`![${alt}](${absoluta(img.atributos.src)})`);
      }
      for (const h of nodo.hijos) if (h.nombre === 'figcaption') salida.push(...bloques(h));
      return salida;
    }

    if (n === 'img') {
      const alt = desescapar(nodo.atributos.alt || '').trim();
      return alt ? [`![${alt}](${absoluta(nodo.atributos.src)})`] : [];
    }

    if (['span', 'a', 'strong', 'em', 'b', 'i', 'code'].includes(n)) {
      const t = limpiar(enLinea(nodo));
      return t ? [t] : [];
    }

    return nodo.hijos.flatMap(bloques);
  }

  const principal = buscar(arbol, 'main') || arbol;
  return bloques(principal)
    .map((b) => b.trim())
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
