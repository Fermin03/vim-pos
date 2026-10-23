"""Genera los cuatro volantes de VIM POS (uno por tipo de negocio).

Salida: un HTML por volante en este directorio. `render.mjs` los pasa a PDF y PNG.
Formato: media carta vertical (13.97 x 21.59 cm) con 3 mm de rebase por lado.

Los iconos son los de `packages/ui/src/components/icono.tsx` (24x24, solo trazo, 1.75,
puntas redondas). Los que el producto no tiene se dibujan aquí con las mismas reglas
y van marcados con `# nuevo`.

Uso:  python3 generar.py
"""

import pathlib
import re

import segno

AQUI = pathlib.Path(__file__).parent
RAIZ = AQUI.parent.parent

# ---------------------------------------------------------------- iconos
# Cada icono es el contenido interior de un <svg viewBox="0 0 24 24">.
I = {
    # del producto (icono.tsx)
    "hamburguesa": '<path d="M4 10.5a8 6.5 0 0 1 16 0zM3.5 14h17M5 17.5h14v1a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/>',
    "papas": '<path d="M6 10h12l-1.4 9.4a2 2 0 0 1-2 1.6H9.4a2 2 0 0 1-2-1.6zM7.5 10V5.5h3V10M10.5 5.5V3h3v7M13.5 4.5h3V10"/>',
    "vaso": '<path d="M6 4h12l-1.4 15.2a2 2 0 0 1-2 1.8H9.4a2 2 0 0 1-2-1.8L6 4zM6.6 10h10.8"/>',
    "pastel": '<path d="M4 20.5h16M5.5 20.5V14a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v6.5M5.5 16c1.1 0 1.1 1 2.2 1s1.1-1 2.15-1 1.1 1 2.15 1 1.1-1 2.15-1 1.1 1 2.15 1 1.1-1 2.2-1M12 12V8.5M12 5.5h.01"/>',
    "etiqueta": '<path d="M3.5 5.5a2 2 0 0 1 2-2h5.7a2 2 0 0 1 1.4.6l7.8 7.8a2 2 0 0 1 0 2.8l-5.7 5.7a2 2 0 0 1-2.8 0L4.1 12.6a2 2 0 0 1-.6-1.4zM8 8h.01"/>',
    "estrella": '<path d="M12 3L14.6 9L21.1 9.6L16.2 14L17.6 20.4L12 17L6.4 20.4L7.8 14L2.9 9.6L9.4 9z"/>',
    "mesa": '<ellipse cx="12" cy="7.5" rx="9" ry="3.5"/><path d="M12 11v9.5M8 20.5h8"/>',
    "para-llevar": '<rect x="5" y="6.5" width="14" height="3" rx="1.5"/><path d="M6.8 9.5l.9 9.7a2 2 0 0 0 2 1.8h4.6a2 2 0 0 0 2-1.8l.9-9.7M12 6.5V3l3-1"/>',
    "moto": '<circle cx="6" cy="17.75" r="2.5"/><circle cx="18.5" cy="17.75" r="2.5"/><rect x="3" y="5.5" width="5.5" height="4.5" rx="1.25"/><path d="M3 12.75h6c1.9 0 3.1.9 3.4 2.75h1.4l3.7-5.4M14.5 5h2.2l1.5 10.2"/>',
    "bolsa": '<path d="M6 8h12l1 10.8a2 2 0 0 1-2 2.2H7a2 2 0 0 1-2-2.2L6 8zM9 11V7a3 3 0 0 1 6 0v4"/>',
    "carrito": '<path d="M2.5 3.5h2.2l2.4 11.2a2 2 0 0 0 2 1.6h8.3a2 2 0 0 0 1.9-1.5l1.6-6.8H5.6"/><circle cx="9.5" cy="20" r="1.2"/><circle cx="17.5" cy="20" r="1.2"/>',
    "caja": '<path d="M12 3 4 7v10l8 4 8-4V7l-8-4zM4 7l8 4 8-4M12 11v10"/>',
    "tarjeta": '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15H10"/>',
    "calendario": '<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    "reloj": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    "persona": '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6"/>',
    "personas": '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5M15.5 4.7a3.5 3.5 0 0 1 0 6.6M18 14.9c2.1.8 3.5 2.6 3.5 5.1"/>',
    "billete": '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.75"/><path d="M6.5 12h.01M17.5 12h.01"/>',
    "pesos": '<path d="M12 2.5v19M16.5 6H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H7"/>',
    "recibo": '<path d="M6 5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v14.5l-2 2-2-2-2 2-2-2-2 2-2-2z"/><path d="M9.5 7.5h5M9.5 11.5h5"/>',
    "impresora": '<path d="M7 8V3.5h10V8M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M17 11.2h.01"/><rect x="7" y="13.5" width="10" height="7" rx="1"/>',
    "chat": '<path d="M20.5 11.5a8.5 8 0 0 1-12.3 7.1L3.5 20l1.5-4.3a8.5 8 0 1 1 15.5-4.2z"/>',
    "celular": '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18h3"/>',
    "llave-inglesa": '<path d="M20.3 6.6A4.5 4.5 0 1 1 17.4 3.7L14.9 6.3l2.8 2.8zM11.6 9.8 3.9 17.5a1.9 1.9 0 0 0 2.6 2.6l7.7-7.7"/>',
    "cajon": '<rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 12.5h19M8.8 5.5v7M15.2 5.5v7M10.5 15.5h3"/>',
    "sin-conexion": '<path d="M3.5 10.5A12 12 0 0 1 6 8.6M9.7 7.2a12 12 0 0 1 10.8 3.3M7.8 14.8a6 6 0 0 1 3.4-1.7M14.9 13.7a6 6 0 0 1 1.3 1.1M12 19h.01M4 4l16 16"/>',
    # nuevo
    "taza": '<path d="M4 9h12v5.5a5.5 5.5 0 0 1-5.5 5.5h-1A5.5 5.5 0 0 1 4 14.5zM16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2.5M12 3.5v2.5"/>',
    "tarro": '<path d="M5 8h10v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM15 10.5h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2M5 8a2.5 2.5 0 0 1 2.5-4 3 3 0 0 1 5 0A2.5 2.5 0 0 1 15 8M8.5 12v5M11.5 12v5"/>',
    "codigo": '<path d="M3.5 5v14M6.5 5v14M10 5v14M12.5 5v14M16 5v14M18.5 5v14M20.5 5v14"/>',
    "camiseta": '<path d="M8.5 3.5 3.5 6l-1 4.5 3 1V20.5h13v-9l3-1-1-4.5-5-2.5a3.5 3.5 0 0 1-7 0z"/>',
    "botella": '<path d="M10 2.5h4M10.5 2.5v5L8 11v9a1.5 1.5 0 0 0 1.5 1.5h5A1.5 1.5 0 0 0 16 20v-9l-2.5-3.5v-5M8 14h8"/>',
    "bascula": '<path d="M4 7.5a8 3.5 0 0 0 16 0zM12 11v2.5M5.5 13.5h13l1.5 7H4z"/>',
    "tijeras": '<circle cx="6.5" cy="17.5" r="3"/><circle cx="17.5" cy="17.5" r="3"/><path d="M8.6 15.4 17 3.5M15.4 15.4 7 3.5"/>',
    "peine": '<path d="M3.5 6.5h17v4h-17zM6 10.5v7M9 10.5v7M12 10.5v7M15 10.5v7M18 10.5v7"/>',
    "secadora": '<path d="M3.5 5.5H15a5 5 0 0 1 0 10H3.5zM8.5 15.5l1 5h3.5l-.5-5M15 10.5h.01M20 10.5h1.5"/>',
    "esmalte": '<path d="M10.5 2.5h3v7h-3zM7.5 9.5h9a1.5 1.5 0 0 1 1.5 1.5v8a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 6 19v-8a1.5 1.5 0 0 1 1.5-1.5zM6 14h12"/>',
    "flor": '<path d="M12 20.5c-4.5 0-8-2.5-8.5-6.5 2.6 0 4.6.8 6 2.2M12 20.5c4.5 0 8-2.5 8.5-6.5-2.6 0-4.6.8-6 2.2M12 20.5c-2.4-2-3.5-4.6-3.5-7.5 0-3 1.3-5.6 3.5-8 2.2 2.4 3.5 5 3.5 8 0 2.9-1.1 5.5-3.5 7.5z"/>',
    "coche": '<path d="M3.5 16.5v-4l2-5.2A2 2 0 0 1 7.4 6h9.2a2 2 0 0 1 1.9 1.3l2 5.2v4zM3.5 12.5h17M5.5 16.5v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-2M15.5 16.5v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-2M7 14.5h.01M17 14.5h.01"/>',
    "salud": '<path d="M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6z"/>',
    "lista": '<path d="M8 4.5H6.5a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V6.5a2 2 0 0 0-2-2H16M9 3h6v3H9zM8.5 12l2 2 4-4M8.5 17.5h7"/>',
}

# ---------------------------------------------------------------- contenido
# Textos cortos, regla del sitio: «solo mencionar lo esencial y ya».
# `rejilla`: 9 iconos, el del centro (índice 4) va en la ficha blanca.
VOLANTES = [
    {
        "archivo": "alimentos-y-bebidas",
        "titulo": "Alimentos y bebidas",
        "giros": "Cafés · Bares · Restaurantes · Food trucks",
        "rejilla": ["taza", "papas", "tarro", "mesa", "hamburguesa", "para-llevar", "pastel", "vaso", "moto"],
        "rasgos": [("mesa", "Mesas y cuentas"), ("impresora", "Comanda a cocina"), ("billete", "Propinas claras")],
    },
    {
        "archivo": "tiendas",
        "titulo": "Tiendas",
        "giros": "Ropa · Abarrotes · Vinos y licores",
        "rejilla": ["camiseta", "codigo", "botella", "bolsa", "etiqueta", "bascula", "carrito", "caja", "tarjeta"],
        "rasgos": [("codigo", "Escanea y cobra"), ("bascula", "Por kilo o pieza"), ("caja", "Existencias al día")],
    },
    {
        "archivo": "servicios",
        "titulo": "Servicios",
        "giros": "Talleres · Consultorios · Reparaciones",
        "rejilla": ["coche", "calendario", "salud", "reloj", "llave-inglesa", "recibo", "persona", "lista", "celular"],
        "rasgos": [("calendario", "Citas"), ("recibo", "Cotizaciones"), ("persona", "Historial del cliente")],
    },
    {
        "archivo": "belleza",
        "titulo": "Belleza",
        "giros": "Salón · Barbería · Spa · Tatuajes",
        "rejilla": ["peine", "esmalte", "flor", "calendario", "tijeras", "secadora", "estrella", "reloj", "personas"],
        "rasgos": [("calendario", "Agenda del equipo"), ("billete", "Anticipos"), ("pesos", "Comisiones claras")],
    },
]

PRECIO = "Desde $699 al mes + IVA"
WEB = "vimpos.com.mx"
WHATSAPP = "56 6508 3346"

# ---------------------------------------------------------------- piezas


def svg(nombre: str, clase: str) -> str:
    return (
        f'<svg class="{clase}" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
        f'stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        f"{I[nombre]}</svg>"
    )


def logo() -> str:
    """El logotipo horizontal del sitio, tal cual (sus colores van literales)."""
    crudo = (RAIZ / "sitio-web/assets/img/logo-horizontal.svg").read_text()
    crudo = re.sub(r"<\?xml[^>]*>\s*", "", crudo)
    # El archivo trae un lienzo de 1920x1080 con mucho aire; se recorta al dibujo.
    crudo = crudo.replace('viewBox="0 0 1920 1080"', 'viewBox="159.6 149.9 1600.8 780.3"')
    return crudo.replace("<svg ", '<svg class="logo" ', 1)


def qr(url: str) -> str:
    q = segno.make(url, error="m")
    s = q.svg_inline(scale=1, border=0, dark="#16161A", light=None, omitsize=True)
    return s.replace("<svg ", '<svg class="qr-img" preserveAspectRatio="xMidYMid meet" ', 1)


def zigzag(dientes: int) -> str:
    """El corte del ticket del logotipo, como clip-path del bloque azul (proporción del logo)."""
    # En el logo: diente de 360 de ancho y 172 de alto -> alto = 0.477 x ancho.
    ancho = 100 / dientes
    puntos = ["0% 0%", "100% 0%"]
    for i in range(dientes, 0, -1):
        x_fin = i * ancho
        x_med = x_fin - ancho / 2
        puntos.append(f"{x_fin:.3f}% calc(100% - var(--diente))")
        puntos.append(f"{x_med:.3f}% 100%")
    puntos.append("0% calc(100% - var(--diente))")
    return "polygon(" + ", ".join(puntos) + ")"


CSS = """
@font-face { font-family: 'Inter Tight'; src: url('../../sitio-web/assets/fonts/inter-tight-var-latin.woff2') format('woff2'); font-weight: 100 900; }
@font-face { font-family: 'Sora'; src: url('../../sitio-web/assets/fonts/sora-var-latin.woff2') format('woff2'); font-weight: 100 800; }
@font-face { font-family: 'JetBrains Mono'; src: url('../../sitio-web/assets/fonts/jetbrains-mono-var-latin.woff2') format('woff2'); font-weight: 100 800; }

/* Tokens copiados de packages/ui/tokens.css (vía sitio-web/assets/css/vim.css). */
:root {
  --accent: #0078C9;
  --accent-soft: #EAF3FB;
  --ink: #16161A;
  --ink-2: #5A5A60;
  --ink-3: #6E6E74;
  --line: #ECECE9;

  --rebase: 3mm;
  --margen: 11mm;          /* 3 de rebase + 8 de zona segura */
  --diente: 8.6mm;         /* 0.477 x 18 mm, la proporción del logo */
}

@page { size: 145.7mm 221.9mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; }
body {
  width: 145.7mm; height: 221.9mm; overflow: hidden;
  font-family: 'Inter Tight', system-ui, sans-serif; color: var(--ink);
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
  display: flex; flex-direction: column;
}

/* ---- El ticket: bloque azul a sangre con el borde inferior en zigzag ---- */
.ticket {
  height: 124mm; flex: none;
  background: var(--accent);
  clip-path: ZIGZAG;
  padding: calc(var(--rebase) + 12mm) var(--margen) calc(var(--diente) + 8mm);
  display: grid; place-items: center;
}
.rejilla {
  display: grid; grid-template-columns: repeat(3, 26mm); grid-auto-rows: 26mm;
  gap: 7mm; color: #fff;
}
.celda { display: grid; place-items: center; }
.celda .ic { width: 17mm; height: 17mm; }
.celda.ficha { background: #fff; color: var(--accent); border-radius: 3mm; }
.celda.ficha .ic { width: 15mm; height: 15mm; }

/* ---- Lo que se lee ---- */
.texto { flex: 1; padding: 9mm var(--margen) 0; display: flex; flex-direction: column; }
.eyebrow {
  font-family: 'JetBrains Mono', monospace; font-size: 7pt; font-weight: 500;
  letter-spacing: .08em; text-transform: uppercase; color: var(--accent);
}
h1 {
  font-family: 'Sora', sans-serif; font-weight: 600; font-size: 26pt;
  letter-spacing: -.02em; line-height: 1.05; margin-top: 2mm;
}
.giros { font-size: 10pt; color: var(--ink-2); margin-top: 2.5mm; }

.rasgos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; margin-top: 8mm; }
.rasgo { display: flex; flex-direction: column; gap: 2.5mm; }
.rasgo .burbuja {
  width: 10mm; height: 10mm; border-radius: 2mm; background: var(--accent-soft);
  color: var(--accent); display: grid; place-items: center;
}
.rasgo .ic { width: 5.6mm; height: 5.6mm; }
.rasgo span { font-size: 8.5pt; font-weight: 500; line-height: 1.25; }

.pie {
  margin-top: auto; margin-bottom: calc(var(--rebase) + 7mm);
  border-top: .25mm solid var(--line); padding-top: 6mm;
  display: grid; grid-template-columns: 1fr auto; align-items: end; gap: 6mm;
}
.logo { display: block; height: 9mm; width: auto; }
.datos { margin-top: 4mm; display: flex; flex-direction: column; gap: 1mm; }
.precio { font-family: 'Sora', sans-serif; font-weight: 600; font-size: 9pt; }
.precio b { font-weight: 600; color: var(--accent); }
.sin-internet { display: flex; align-items: center; gap: 1.5mm; font-size: 8pt; color: var(--ink-2); }
.sin-internet .ic { width: 3.6mm; height: 3.6mm; }
.qr { display: flex; flex-direction: column; align-items: flex-end; gap: 1mm; }
.qr-img { margin-bottom: 1.5mm; }
.qr-img { width: 21mm; height: 21mm; display: block; }
.qr small { font-family: 'JetBrains Mono', monospace; font-size: 6.5pt; color: var(--ink-2); }
.qr small b { font-weight: 500; color: var(--ink); }
"""


def volante(v: dict) -> str:
    celdas = "".join(
        f'<div class="celda{" ficha" if i == 4 else ""}">{svg(n, "ic")}</div>'
        for i, n in enumerate(v["rejilla"])
    )
    rasgos = "".join(
        f'<div class="rasgo"><div class="burbuja">{svg(n, "ic")}</div><span>{t}</span></div>'
        for n, t in v["rasgos"]
    )
    url = f"https://{WEB}/?utm_source=volante&utm_campaign={v['archivo']}"
    return f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Volante · {v['titulo']}</title>
<style>{CSS.replace('ZIGZAG', zigzag(8))}</style></head>
<body>
  <section class="ticket"><div class="rejilla">{celdas}</div></section>
  <section class="texto">
    <p class="eyebrow">Punto de venta para</p>
    <h1>{v['titulo']}</h1>
    <p class="giros">{v['giros']}</p>
    <div class="rasgos">{rasgos}</div>
    <footer class="pie">
      <div>
        {logo()}
        <div class="datos">
          <p class="precio"><b>{PRECIO.split(' al ')[0]}</b> al {PRECIO.split(' al ')[1]}</p>
          <p class="sin-internet">{svg('sin-conexion', 'ic')}Sin internet, sigues cobrando</p>
        </div>
      </div>
      <div class="qr">{qr(url)}<small><b>{WEB}</b></small><small>WhatsApp {WHATSAPP}</small></div>
    </footer>
  </section>
</body></html>
"""


if __name__ == "__main__":
    for v in VOLANTES:
        (AQUI / f"{v['archivo']}.html").write_text(volante(v))
        print("escrito", v["archivo"])
