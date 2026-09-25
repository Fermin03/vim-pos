# Sitio web (`sitio-web/`) — revisión de diseño

**24 sep 2026** · Puntaje **23/36** (modo persuadir; la heurística 7 no aplica) · Medido en
vimpos.com.mx a 390 y 1440 px (el aviso de cookies se respondió con "No me midas"). Contexto y
método en [`README.md`](README.md).

## Veredicto

El texto sí está hecho para un restaurante mexicano: comanda por estación, corte Z, CSD frente a
e.firma, "¿me facturan lo del sábado?", y una sección "En qué casos VIM POS no es la respuesta".

Lo visual es plantilla de software: titular a la izquierda, captura a la derecha en un marco con
los tres puntos de las ventanas de Mac —en un producto que solo corre en Windows—, rótulos en
mayúsculas, rejilla de tarjetas grises, bloque oscuro de cierre, preguntas plegables. No aparece
comida, ni papel, ni un local, ni personas. Lo único visual hecho a la medida es el diagrama de
"Cortar el internet", y en el teléfono no se lee. **Texto 8/10, visual 4/10.**

## Heurísticas

| # | Heurística | Nota | Por qué |
|---|---|---|---|
| 1 | Estado | 2 | El menú nunca marca la página actual (`assets/js/vim.js:499-503` compara `"/funciones"` con `"funciones"`); solo precios y facturación lo traen a mano. El formulario avisa bien |
| 2 | Mundo real | 3 | Voz mexicana precisa; la captura dice "modo offline"; jerga para agentes en contacto y 404 |
| 3 | Control | 3 | El menú cierra con Esc o tocando fuera y devuelve el foco; el formulario ofrece el correo si falla |
| 4 | Consistencia | 2 | Lo que incluye cada plan se contradice entre páginas; dos pies; dos envoltorios de tabla |
| 5 | Prevención | 3 | Valida al salir del campo y muestra todos los errores juntos; zoom de iOS en los campos |
| 6 | Reconocer | 2 | Comparar planes en el teléfono obliga a recordar: planes en carrusel, tabla con 138 px de datos |
| 7 | Eficiencia | n/a | Sitio de una visita; aun así funciones (8 secciones) merece un índice de anclas |
| 8 | Estética | 2 | Sobrio, pero el inicio mide 11 secciones (9,873 px, ~11.7 pantallas en el teléfono); bandas indistinguibles; capturas con 60 % de vacío |
| 9 | Errores | 3 | Errores en español bajo cada campo, salida por correo, 404 con caminos útiles |
| 10 | Ayuda | 3 | Preguntas por página y dos guías honestas; falta un estimado del costo del equipo |

**Carga cognitiva — fallan 4 de 8:** bloques (11 secciones en inicio; "La caja" con 2 figuras y 6
tarjetas; 8 preguntas; 6 giros; 6 tarjetas de "incluido"), opciones en precios (3 planes × 2
periodos + 3 extras + 5 paquetes de folios + la celda "10, con el extra", `precios.html:291`),
memoria (carrusel y tabla estrecha en el teléfono), jerarquía (el precio aparece a 8.3 pantallas
en el teléfono —6,971 px— y a 8,032 px en escritorio).

## Fortalezas

1. **La honestidad está en la estructura:** "Lo que el precio no incluye", límites dentro de las preguntas (`index.html:471, 482`), pies que explican la captura.
2. **Disciplina de movimiento al estilo Emil:** curvas y duraciones como tokens (`assets/css/vim.css:65-81`), todo bajo 300 ms, hover solo con puntero fino, movimiento reducido en todo, menú lateral con `inert` y trampa de foco, el aviso de cookies sale más rápido de lo que entra (`vim.css:1261-1271`), sin animaciones gratuitas al hacer scroll.
3. **Componentes accesibles:** el formulario valida al salir y enseña todos los errores, trampa para robots, `[hidden]` siempre gana, tablas con color + símbolo (`vim.css:754-761`) y primera columna fija, enlace para saltar al contenido.

## Problemas prioritarios

**[P1] En el teléfono las capturas y el diagrama no se leen**
- La captura del hero se muestra a 0.236 de su tamaño: el texto de la caja queda en ~3 px. El diagrama a 0.45: 5.6 px el texto y 4.5 px las etiquetas (`index.html:228-319`). `pos-home` tiene 60 % en blanco y productos con letras de relleno.
- **Arreglo:** `<picture>` con recortes para móvil que cuenten una historia cada uno (el ticket con "Cobrar $229", el arqueo con "−$40 faltante", dos comandas del KDS); `srcset` de 720, 1440 y 2880; diagrama vertical para móvil (~360×640) o en HTML.

**[P1] Capturas desfasadas que contradicen el texto**
- `pos-home` y `pos-catalogo` son del 4 sep; el catálogo sin scroll llegó el 13 y los modales al 80 % el 24.
- `pos-sin-conexion` dice "Sin conexión · modo offline" (`apps/pos/app/components/pantalla-inicio.tsx:288`) mientras el inicio titula "No es un «modo offline»" (`index.html:408`); su alt y su pie prometen "el ticket y el catálogo funcionando" y la imagen solo muestra un logo (`sin-internet.html:228`, `como-elegir-sistema-restaurante.html:181-184`).
- El alt del KDS dice "siete comandas" y hay 6. El panel muestra "Propinas $0.00" y "sin día previo", y en su menú aparecen Promociones y Reservaciones, que funciones dice que no se anuncian.
- **Arreglo:** recapturar con `_capturas/render.mjs` sobre 0.4.82, sembrando un día previo con propinas y una venta real sin internet; cambiar el texto del producto a algo como "Sin internet · sigues cobrando". Considerar recapturar como paso de cada versión que toque la caja.

**[P1] El precio no está donde se busca**
- "$699" está en el `<title>`, no en el H1 ni junto al botón principal. En precios el primer pantallazo se va en decir que el precio "está publicado" y $699 asoma en el borde (y=785 de 844). El plan recomendado, Negocio, queda fuera de pantalla en el carrusel.
- **Arreglo:** "Desde $699 al mes + IVA · sin contrato forzoso" bajo los botones del hero (`index.html:142`); planes dentro del hero de precios; en el teléfono, planes apilados (`vim.css:1151-1174`).

**[P1] Lo que incluye cada plan se contradice**
- `precios.html:341-370` dice "Va incluido en los tres planes" con "Tu menú, cargado" y "Capacitación… tres horas"; la tabla dice que en Esencial el menú lo cargas tú y la capacitación son videos (`precios.html:296-305`); `nosotros.html:171` repite el error.
- Soporte de Esencial: "chat y WhatsApp" en `precios.html:155`, solo "chat" en `index.html:577`, y el WhatsApp ya no se publica.
- Folios "incluida · 20 folios" y a la vez "se pagan aparte" (`index.html:658`).
- **Arreglo:** una sola verdad por plan; pastilla "desde Negocio" en las tarjetas (`.pastilla` ya existe).

**[P2] Sin prueba social ni persona visible** — sin testimonio, logo, cara ni nombre; "Nosotros" se presenta como "VIM POS, persona física"; `.prueba-social` se usa para una característica (`precios.html:117`). → Cita y foto de Knock-Out cuando llegue; mientras, "Operando en Knock-Out Burger, León" con foto real de su caja, y foto y nombre del fundador en Nosotros.

**[P2] Detalles de uso en el teléfono**
- Campos a 15 px (`vim.css:873`): iOS hace zoom (verificado en vivo).
- La franja de hechos se desplaza sola cada 26 s sin pausa (`vim.css:1032-1062`): incumple WCAG 2.2.2.
- Tabla comparativa con 138 px de datos junto a 202 px de etiqueta fija (`vim.css:745`).
- Botones del hero apilados con anchos distintos (183 y 240 px).
- En /demo lo que tranquiliza ("no te llama un vendedor") queda bajo el formulario (y=1466+), justo lo que el comentario de `demo.html` dice evitar.
- Las preguntas cerradas dejan sus enlaces en el orden de tabulación (`vim.css:640-643`).
- **Arreglo:** 16 px; franja estática 2×2; tabla por plan o apilada en móvil; botones a lo ancho; tranquilidad arriba del formulario; `inert` en paneles cerrados.

**[P2] Ritmo plano y un inicio largo** — la banda de fondo `--surface: #FBFBFA` (`vim.css:32`) es prácticamente blanco y distinta del token del producto; facturación encadena 7 secciones blancas; relleno de sección hasta 128 px; el inicio repite migración y funciones. → Banda visible (`#F4F4F1` o `accent-soft` para el diferenciador); inicio en ~7 secciones; 64 px de relleno en móvil.

**[P3] Jerga para agentes en páginas para personas** — sección "Para agentes y herramientas automáticas" con text/markdown y la cabecera Accept (`contacto.html:208`); el 404 enlaza sitemap, llms.txt y agents.md (`404.html:151`). → Enlace discreto en el pie; los `<link rel=alternate>` ya bastan.

## Personas

- **Jordan (primera visita):** el H1 no dice "punto de venta"; la imagen del hero parece un esquema vacío; en escritorio "Cortar el internet" queda bajo el pliegue (diagrama de 697 px de alto).
- **Casey (teléfono):** 11.7 pantallas en inicio; capturas a 3 px; cada rejilla es un carrusel; zoom en el formulario.
- **Riley (con prisa):** el canal más rápido es un `mailto:`; sin teléfono ni WhatsApp; "el mismo día hábil" un viernes a las 11 pm es el lunes.
- **Doña Mary (anuncio de Google, teléfono, desconfía de lo caro):** "Todo lo que tu restaurante necesita" suena a sistema grande; antes de un precio atraviesa "dark kitchen", "conciliación", "14 reportes" y "Cadena $1,999"; necesita PC con Windows, impresora y cajón sin ningún estimado; Esencial le promete y le quita la carga del menú; lo único que se mueve solo es texto que tiene que leer.

## Movimiento (Emil Kowalski)

| Antes | Después | Por qué |
|---|---|---|
| `.hechos { animation: desfile 26s linear infinite }` sin pausa (`vim.css:1038`) | Rejilla 2×2 estática en móvil, o pausa con `:active`/`:focus-within` + botón | El texto que se lee no se mueve; WCAG 2.2.2 |
| Conmutador con `transition: background, color` y `:active{scale(.97)}` (`vim.css:829, 835`) | Añadir `transform var(--v-toque) var(--sal)` | Sin `transform` en la lista, la presión salta en seco |
| `.nav-cerrar:active{scale(.94)}` (`vim.css:446`) | `scale(.97)` | Un solo valor de presión en todo el sitio |
| `.punto::before` anima `width` 7→20 px (`vim.css:1214`) | Ancho fijo con `scaleX()` y `transform-origin: left` | Solo transform/opacity |
| Acordeón anima `height` y el panel cerrado sigue tabulable (`vim.css:640-643`) | `inert` (o `hidden="until-found"`) al cerrar + opacidad 150 ms | La altura se tolera; el foco en enlaces invisibles no |
| `.acordeon-boton` sin respuesta al tocar (`vim.css:621-631`) | `:active { background: var(--hover) }` | En táctil no hay hover |
| `.nav-hamburguesa` transiciona `background-color` sin regla de hover (`vim.css:325`) | Añadir el hover con `(hover:hover)` o quitar la propiedad | Animar algo que nunca cambia |
| Al cortar el internet solo baja la opacidad de la nube (`index.html:256`) | Tras el corte, una "venta" que entra a la caja una vez (~300 ms, transform/opacity) | El argumento es que el local sigue vivo; hoy solo se mueve lo que se apaga |
| El botón cambia texto y `aria-pressed` a la vez (`assets/js/vim.js:217-218`) | Etiqueta fija con `aria-pressed`, o texto cambiante sin él | El lector anuncia dos estados |
| `a.tarjeta` del 404 sin hover ni `:active` (`404.html:132-143`) | Borde `--line-strong` con hover restringido y `:active{scale(.99)}` 140 ms | Una tarjeta clicable que no reacciona no parece clicable |

## Detector

111 hallazgos; verdaderos: `layout-transition` ×22 (acordeones que animan `height`), `thin-border-wide-shadow` ×25 (marco `.monitor`, `vim.css:535-541`), `kicker-above-heading` ×5 (el patrón real son 62 rótulos sobre títulos), `marquee` ×1 (inicio). Falsos: `cramped-padding` ×30 (no lee `clamp()`), `repeating-stripes-gradient` ×14 (`.hueco` sin usar), `marquee` ×13 (páginas que solo comparten la hoja de estilos). Además: 154 estilos en línea (39 de tamaño de letra, 32 de color; `style="font-size:var(--t-13);color:var(--ink-2)"` 13 veces → clase `.nota`); texto de 13 px en el conmutador (`vim.css:824`), botones del aviso de cookies (`:1291`) y etiquetas de formulario (`:860`).

## Páginas

| Página | Nota | Problema principal |
|---|---|---|
| `index` | regular | Hero genérico con captura vacía; el precio a 8 pantallas |
| `funciones` | regular | 9 capturas ilegibles en el teléfono; catálogo desfasado; sin índice |
| `precios` | regular | "Incluido en los tres" contradice la tabla; el carrusel esconde Negocio |
| `demo` | bien | Zoom en iOS; la tranquilidad bajo el formulario |
| `contacto` | regular | El botón principal es un `mailto:`; sección para agentes |
| `facturacion-cfdi` | regular | Falta la imagen que vende (el portal en un teléfono); 7 secciones blancas seguidas |
| `sin-internet` | regular | La captura dice "modo offline" y no muestra lo que promete el pie |
| `nosotros` | **mal** | Sin cara ni nombre; repite la contradicción de los planes |
| `como-elegir-sistema-restaurante` | bien | Un pie describe algo que no está en la imagen |
| `cuanto-cuesta-un-sistema-para-restaurante` | bien | "Haz la cuenta con tus números" es una tabla fija, no una calculadora |
| `aviso-privacidad` | bien | Sin imagen; aceptable en una página legal |
| `terminos` | bien | Sin imagen; aceptable en una página legal |
| `404` | regular | Útil, con jerga para agentes |

## Observaciones menores

1. `.plan-precio` sin `tabular-nums` (`vim.css:664`); precios del inicio sin "/mes" (`index.html:572, 585, 597`).
2. "El que recomendamos" baja el precio de Negocio respecto a los otros (`index.html:583`): reservar el hueco en las tres tarjetas.
3. Colores copiados que ya derivaron: `#FDF1EF`, `#F1F8F4`, `#FDF6E7` frente a los `*-soft` de `tokens.css`.
4. Tablas de folios con `<div style="overflow-x:auto">` en vez de `.tabla-envoltura` (`facturacion-cfdi.html:254`, `cuanto-cuesta-un-sistema-para-restaurante.html:220`).
5. `fetchpriority="high"` en imágenes bajo el pliegue (`precios.html:323`, `sin-internet.html:229`, `demo.html:255`).
6. Sin `srcset`: cada captura es de 2880×1800 (5.2 MP al decodificar) también en un teléfono de 390 px.
7. Bugs del producto visibles en el marketing: "Extras Opcional … Opcional" duplicado en `pos-catalogo`, `APP_RAPPI` crudo en el KDS, "1205" seleccionado en azul en el arqueo.
8. `admin-resultados` y `pos-monitor` no se usan en ninguna página; `admin-dashboard` aparece 4 veces y `pos-home` 3.
9. El aviso de cookies dice que "los dos botones pesan lo mismo" (`vim.css:1284`) pero "Entendido" es azul y "No me midas" fantasma (`assets/js/consentimiento.js:142-143`); en el teléfono tapa ~40 % del primer pantallazo.
10. El comentario de `vim.css:605` dice que en móvil va primero la imagen; en el HTML va primero el texto (`index.html:341`).
11. La página actual solo se distinguiría pasando de gris a negro (`vim.css:311`), casi invisible aunque funcionara.
12. El H1 del inicio sale en 4 líneas a 60 px en escritorio; a 52 px o con columna más ancha quedaría en 3.
13. `font-display: swap` sin métricas de respaldo: Sora es ancha y el H1 se recompone al cargar.
14. Al abrir una pregunta se cierra la de arriba y la tocada salta bajo el dedo (`assets/js/vim.js:188-197`).

## Preguntas

1. La oferta del piloto (mes 1 gratis y $499 durante 6 meses) no aparece en ninguna página. ¿Cada campaña debería aterrizar en una página con ese precio en el H1?
2. "Sin letra chica" se cae con un pie que describe algo que no está en la imagen. ¿Recapturar debería ser un paso de cada versión que toque la caja?
3. Para un público que vive en WhatsApp, cada página ofrece un `mailto:` como segunda opción. ¿Un WhatsApp Business movería la conversión más que cualquier ajuste visual?
