"""Genera los cuatro folletos de VIM POS: un tríptico carta por tipo de negocio.

Tríptico carta horizontal (27.94 x 21.59 cm), plegado en ventana enrollada, con 3 mm de
rebase. Dos caras:

  Exterior  [ solapa (91.4) | contraportada (94) | portada (94) ]
  Interior  [ funciones 1-2 (94) | funciones 3-4 (94) | funciones 5-6 (91.4) ]

La solapa es 2.6 mm más angosta porque se dobla hacia adentro; su reverso es el panel
derecho del interior.

Las capturas salen de `sitio-web/assets/img/capturas` (las mismas del sitio, de los
negocios de prueba) y van completas, en un marco de tableta o de teléfono. No se recortan:
un pedazo de pantalla se lee como un error, no como el producto.

Uso:  python3 generar.py && node render.mjs
"""

import importlib.util
import pathlib

from PIL import Image

AQUI = pathlib.Path(__file__).parent
RAIZ = AQUI.parent.parent
CAPTURAS = RAIZ / "sitio-web/assets/img/capturas"
CAPTURAS_FOLLETO = AQUI / "capturas"

# Los iconos, el logotipo, el QR y el zigzag son los mismos de los volantes.
_spec = importlib.util.spec_from_file_location("volantes", AQUI.parent / "volantes/generar.py")
V = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(V)
svg, logo, qr = V.svg, V.logo, V.qr

# ---------------------------------------------------------------- contenido
# Cada función: (captura, título, una línea). La captura va completa, en su marco de
# pantalla. «icono:<nombre>» dibuja el icono grande donde todavía no hay captura.
FOLLETOS = [
    {
        "archivo": "alimentos-y-bebidas",
        "titulo": "Alimentos y bebidas",
        "giros": "Cafés · Bares · Restaurantes · Food trucks",
        "rejilla": V.VOLANTES[0]["rejilla"],
        "funciones": [
            ("giros/servicio-completo-mesas", "Mesas a la vista", "Quién está libre, quién ocupado y cuánto lleva."),
            ("giros/servicio-rapido-kds", "Directo a cocina", "La comanda llega a la pantalla o a la impresora."),
            ("giros/cafeteria-modificadores", "Como lo pidieron", "Tamaño, leche y extras en un toque."),
            ("giros/servicio-rapido-combo", "Combos", "Arma el combo y el precio sale solo."),
            ("giros/bar-propina", "Propinas claras", "10, 15 o 20 % y queda registrada."),
            ("giros/cafeteria-pantalla-cliente", "Tu cliente lo ve", "Una segunda pantalla con su orden y el total."),
        ],
    },
    {
        "archivo": "tiendas",
        "titulo": "Tiendas",
        "giros": "Ropa · Abarrotes · Vinos y licores",
        "rejilla": V.VOLANTES[1]["rejilla"],
        "funciones": [
            ("giros/tienda-ropa-talla-color", "Talla y color", "Cada combinación con su existencia."),
            ("giros/abarrotes-venta-kg", "Por kilo o por pieza", "Captura el peso y cobra."),
            ("giros/tienda-ropa-etiquetas", "Etiquetas con código", "Imprímelas y cobra escaneando."),
            ("giros/vinos-existencias-minimo", "Existencias al día", "Y aviso cuando algo llega al mínimo."),
            ("giros/abarrotes-venta-a-credito", "Crédito sin cuaderno", "Quién te debe y cuánto, a la vista."),
            ("giros/abarrotes-cotizacion-publica-movil", "Cotizaciones", "Se mandan por WhatsApp con un enlace."),
        ],
    },
    {
        "archivo": "servicios",
        "titulo": "Servicios",
        "giros": "Talleres · Consultorios · Reparaciones",
        "rejilla": V.VOLANTES[2]["rejilla"],
        "funciones": [
            ("icono:lista", "Una orden por trabajo", "Lo que pidió el cliente y lo que se hizo."),
            ("icono:chat", "Cotiza por WhatsApp", "Empieza cuando el cliente diga que sí."),
            ("icono:caja", "Refacciones e insumos", "Lo que usas sale del inventario."),
            ("icono:billete", "Anticipos y crédito", "Pide un anticipo o da crédito."),
            ("icono:calendario", "Citas", "La agenda de todo tu equipo."),
            ("icono:pesos", "Comisión por técnico", "Cada trabajo con quien lo hizo."),
        ],
    },
    {
        "archivo": "belleza",
        "titulo": "Belleza",
        "giros": "Salón · Barbería · Spa · Tatuajes",
        "rejilla": V.VOLANTES[3]["rejilla"],
        "funciones": [
            ("giros/salon-calendario", "La agenda del equipo", "Cada quien con sus citas, en una vista."),
            ("giros/salon-ficha-cita", "Cobra la cita", "Llega, se atiende y se cobra en un toque."),
            ("giros/salon-cobro-anticipo", "Anticipos", "Lo que dejó pagado se descuenta solo."),
            ("giros/salon-comisiones", "Comisiones claras", "Lo de cada colaboradora, sin calculadora."),
            ("giros/barberia-lista-espera", "Sin cita, a la lista", "Quien llega sin cita no se pierde."),
            ("giros/salon-servicios", "Servicios", "Cada uno con su precio, duración y comisión."),
        ],
    },
]

QUE_ES = [
    ("cajon", "Caja", "Cobra en segundos."),
    ("caja", "Inventario", "Sabes qué tienes y qué falta."),
    ("recibo", "Factura CFDI", "Desde la misma caja."),
    ("celular", "En tu celular", "La venta del día, donde estés."),
]

PLANES = [
    ("Esencial", "$699", "1 sucursal · 1 caja"),
    ("Negocio", "$999", "1 sucursal · 3 cajas · factura incluida"),
    ("Cadena", "$1,999", "3 sucursales · cajas sin límite"),
]

# ---------------------------------------------------------------- capturas


def captura(ruta: str) -> tuple[str, bool]:
    """Copia la captura completa (reducida para imprenta) y dice si es de teléfono."""
    CAPTURAS_FOLLETO.mkdir(exist_ok=True)
    destino = CAPTURAS_FOLLETO / f"{pathlib.Path(ruta).name}.png"
    im = Image.open(CAPTURAS / f"{ruta}.png").convert("RGB")
    if im.width > 1800:
        im = im.resize((1800, round(im.height * 1800 / im.width)), Image.LANCZOS)
    im.save(destino, optimize=True)
    return f"capturas/{destino.name}", im.height > im.width


# ---------------------------------------------------------------- piezas

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
  --line-strong: #DDDDD9;

  --rebase: 3mm;
  --seguro: 9mm;
  --diente: 9mm;
}

@page { size: 285.4mm 221.9mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; }
body {
  font-family: 'Inter Tight', system-ui, sans-serif; color: var(--ink);
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.hoja {
  width: 285.4mm; height: 221.9mm; overflow: hidden; position: relative;
  display: grid; break-after: page; background: #fff;
}
.hoja.exterior { grid-template-columns: 94.4mm 94mm 97mm; }
.hoja.interior { grid-template-columns: 97mm 94mm 94.4mm; }
.panel {
  position: relative; display: flex; flex-direction: column;
  padding: calc(var(--rebase) + 11mm) var(--seguro) calc(var(--rebase) + 10mm);
}
.hoja.exterior .panel:first-child,
.hoja.interior .panel:first-child { padding-left: calc(var(--rebase) + var(--seguro)); }
.hoja.exterior .panel:last-child,
.hoja.interior .panel:last-child { padding-right: calc(var(--rebase) + var(--seguro)); }

.eyebrow {
  font-family: 'JetBrains Mono', monospace; font-size: 7pt; font-weight: 500;
  letter-spacing: .08em; text-transform: uppercase; color: var(--accent);
}
h1, h2, h3, .cifra { font-family: 'Sora', sans-serif; letter-spacing: -.02em; }
h2 { font-size: 17pt; font-weight: 600; line-height: 1.1; margin-top: 2mm; }

/* ---- Portada: el ticket ---- */
.portada { padding: 0; }
.portada .ticket {
  height: 128mm; flex: none; background: var(--accent); clip-path: ZIGZAG;
  padding: calc(var(--rebase) + 6mm) calc(var(--rebase) + var(--seguro)) calc(var(--diente) + 4mm) var(--seguro);
  display: grid; place-items: center;
}
.rejilla { display: grid; grid-template-columns: repeat(3, 18mm); grid-auto-rows: 18mm; gap: 6mm; color: #fff; }
.celda { display: grid; place-items: center; }
.celda .ic { width: 12mm; height: 12mm; }
.celda.ficha { background: #fff; color: var(--accent); border-radius: 2.5mm; }
.celda.ficha .ic { width: 10.5mm; height: 10.5mm; }
.portada .texto {
  flex: 1; display: flex; flex-direction: column;
  padding: 9mm calc(var(--rebase) + var(--seguro)) calc(var(--rebase) + 10mm) var(--seguro);
}
.portada h1 { font-size: 23pt; font-weight: 600; line-height: 1.05; margin-top: 2mm; }
.portada .giros { font-size: 9pt; color: var(--ink-2); margin-top: 2.5mm; }
.portada .logo { height: 9mm; width: auto; display: block; margin-top: auto; }

/* ---- Solapa: qué es ---- */
.escenario.solapa-cel { height: auto; padding: 5mm; margin-bottom: 7mm; }
.escenario.solapa-cel .pantalla.cel img { height: 54mm; }
.solapa p.lema { font-size: 9.5pt; color: var(--ink-2); line-height: 1.35; margin-top: 2.5mm; }
.pilares { display: grid; gap: 4.5mm; margin-top: 7mm; }
.pilar { display: grid; grid-template-columns: 9mm 1fr; gap: 3.5mm; align-items: center; }
.burbuja {
  width: 9mm; height: 9mm; border-radius: 2mm; background: var(--accent-soft);
  color: var(--accent); display: grid; place-items: center;
}
.burbuja .ic { width: 5mm; height: 5mm; }
.pilar b { display: block; font-family: 'Sora', sans-serif; font-weight: 600; font-size: 9pt; }
.pilar span { font-size: 8pt; color: var(--ink-2); }
.sello {
  margin-top: auto; display: flex; align-items: center; gap: 2mm;
  background: var(--ink); color: #fff; border-radius: 2mm; padding: 3mm 3.5mm;
  font-size: 8.5pt; font-weight: 500;
}
.sello .ic { width: 4.5mm; height: 4.5mm; flex: none; }

/* ---- Contraportada: precios y contacto ---- */
.planes { margin-top: 6mm; display: grid; gap: 3mm; }
.plan {
  border: .3mm solid var(--line-strong); border-radius: 2mm; padding: 3.5mm 4mm;
  display: grid; grid-template-columns: 1fr auto; align-items: baseline; row-gap: .8mm;
}
.plan.destacado { border-color: var(--accent); background: var(--accent-soft); }
.plan b { font-family: 'Sora', sans-serif; font-weight: 600; font-size: 10pt; }
.plan .cifra { font-weight: 600; font-size: 14pt; font-variant-numeric: tabular-nums; }
.plan .cifra small { font-family: 'Inter Tight', sans-serif; font-size: 7pt; font-weight: 500; color: var(--ink-3); letter-spacing: 0; }
.plan .linea { grid-column: 1 / -1; font-size: 7.5pt; color: var(--ink-2); }
.notas { margin-top: 3.5mm; font-size: 7.5pt; color: var(--ink-3); line-height: 1.5; }
.contacto { margin-top: auto; display: flex; flex-direction: column; align-items: center; text-align: center; }
.qr-img { width: 30mm; height: 30mm; display: block; }
.contacto .web { font-family: 'Sora', sans-serif; font-weight: 600; font-size: 11pt; margin-top: 3.5mm; }
.contacto .wa { font-size: 8.5pt; color: var(--ink-2); margin-top: 1mm; }
.contacto .logo { height: 8mm; width: auto; margin-top: 7mm; }

/* ---- Interior: funciones ---- */
.funcion + .funcion { margin-top: 15mm; }
.escenario {
  height: 60mm; background: var(--accent-soft); border-radius: 2.5mm;
  display: grid; place-items: center; padding: 4mm;
}
/* Marco de pantalla. Sin sombra: en el PDF se vuelve un bloque gris. */
.pantalla { background: var(--ink); border: 1.2mm solid var(--ink); border-radius: 2.5mm; overflow: hidden; }
.pantalla img { display: block; }
.pantalla.tableta img { width: 66mm; height: auto; }
.pantalla.cel { border-width: 1.2mm; border-radius: 4mm; }
.pantalla.cel img { height: 45mm; width: auto; }
.escenario.icono { color: var(--accent); }
.escenario.icono .ic { width: 24mm; height: 24mm; }
.funcion .num { font-family: 'JetBrains Mono', monospace; font-size: 7pt; color: var(--accent); margin-top: 4.5mm; display: block; }
.funcion h3 { font-size: 12pt; font-weight: 600; margin-top: 1.2mm; }
.funcion p { font-size: 8.5pt; color: var(--ink-2); margin-top: 1.2mm; line-height: 1.35; }
"""


def marco(ruta: str) -> str:
    src, es_cel = captura(ruta)
    return f'<div class="pantalla {"cel" if es_cel else "tableta"}"><img src="{src}" alt=""></div>'


def funcion(i: int, f) -> str:
    imagen, titulo, linea = f
    if imagen.startswith("icono:"):
        escena = f'<div class="escenario icono">{svg(imagen[6:], "ic")}</div>'
    else:
        escena = f'<div class="escenario">{marco(imagen)}</div>'
    return (
        f'<article class="funcion">{escena}<span class="num">{i:02d}</span>'
        f"<h3>{titulo}</h3><p>{linea}</p></article>"
    )


def folleto(d: dict) -> str:
    celdas = "".join(
        f'<div class="celda{" ficha" if i == 4 else ""}">{svg(n, "ic")}</div>'
        for i, n in enumerate(d["rejilla"])
    )
    pilares = "".join(
        f'<div class="pilar"><div class="burbuja">{svg(n, "ic")}</div><div><b>{t}</b><span>{l}</span></div></div>'
        for n, t, l in QUE_ES
    )
    planes = "".join(
        f'<div class="plan{" destacado" if n == "Negocio" else ""}"><b>{n}</b>'
        f'<span class="cifra">{p}<small> /mes</small></span><p class="linea">{l}</p></div>'
        for n, p, l in PLANES
    )
    fs = [funcion(i + 1, f) for i, f in enumerate(d["funciones"])]
    url = f"https://{V.WEB}/?utm_source=folleto&utm_campaign={d['archivo']}"
    return f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Folleto · {d['titulo']}</title>
<style>{CSS.replace('ZIGZAG', V.zigzag(5))}</style></head>
<body>
<section class="hoja exterior">
  <div class="panel solapa">
    <div class="escenario solapa-cel">{marco("admin-dashboard-movil")}</div>
    <p class="eyebrow">Qué es</p>
    <h2>VIM POS</h2>
    <p class="lema">El punto de venta para cobrar, controlar y facturar tu negocio.</p>
    <div class="pilares">{pilares}</div>
    <div class="sello">{svg('sin-conexion', 'ic')}Sin internet, sigues cobrando</div>
  </div>
  <div class="panel contraportada">
    <p class="eyebrow">Precios</p>
    <h2>Desde $699 al mes</h2>
    <div class="planes">{planes}</div>
    <p class="notas">Más IVA · Sin pago inicial · Sin contrato forzoso</p>
    <div class="contacto">
      {qr(url)}
      <p class="web">{V.WEB}</p>
      <p class="wa">WhatsApp {V.WHATSAPP}</p>
      {logo()}
    </div>
  </div>
  <div class="panel portada">
    <div class="ticket"><div class="rejilla">{celdas}</div></div>
    <div class="texto">
      <p class="eyebrow">Punto de venta para</p>
      <h1>{d['titulo']}</h1>
      <p class="giros">{d['giros']}</p>
      {logo()}
    </div>
  </div>
</section>
<section class="hoja interior">
  <div class="panel">{fs[0]}{fs[1]}</div>
  <div class="panel">{fs[2]}{fs[3]}</div>
  <div class="panel">{fs[4]}{fs[5]}</div>
</section>
</body></html>
"""


if __name__ == "__main__":
    for d in FOLLETOS:
        (AQUI / f"{d['archivo']}.html").write_text(folleto(d))
        print("escrito", d["archivo"])
