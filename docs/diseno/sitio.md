# Diseño — Sitio web (`sitio-web/`)

> Hereda de [`nucleo.md`](nucleo.md), **a mano**: el sitio es HTML estático sin build, así que no
> consume el preset de Tailwind ni `tokens.css`.

## Quién y dónde

Alguien que todavía no es cliente. Llega desde una búsqueda o un anuncio, en teléfono la mayoría
de las veces, y decide en segundos si esto es serio. También lo leen agentes y buscadores, que es
por lo que existe `_agentes/`, `llms.txt` y los `.md` espejo.

## Lo que se hereda sin discusión

La paleta completa, las tres familias tipográficas, los radios y la escala de espaciado. Es lo
que hace que la web y el producto se reconozcan como la misma cosa — y las capturas del producto
van a convivir con la web en la misma página.

## Lo que NO se hereda

- **Las alturas de control.** 44px es correcto para un dedo con prisa y excesivo para un mouse.
  En web, 36–40px.
- **La densidad.** El POS aprieta información porque cada scroll es tiempo frente a un cliente.
  Una landing necesita aire; copiar la densidad del POS la haría ver como un panel de
  administración.
- **El tema oscuro del KDS.** Calibrado para una cocina, no para una web.

## El azul significa otra cosa aquí

En el producto, el azul es "esta es la acción". En la web es el color de la marca a secas, y
aparece en más lugares. Está bien que difieran — pero que sea una decisión, no un descuido.

## Imágenes en todas las páginas

No solo el home. Cada página lleva imágenes reales del producto con el componente `.figura` y su
pie. Una página de texto plano en un sitio que vende software se lee como un folleto sin
terminar.

## Riesgo propio: los tokens están copiados

Hoy hay 16 literales `#0078C9` en el HTML. Si el núcleo cambia de color, el sitio **no se entera**.
Mientras no haya un paso que los compare, cualquier cambio de marca incluye revisar el sitio a
mano. Está anotado como deuda en `nucleo.md`.
