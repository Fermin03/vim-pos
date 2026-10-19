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

## El menú

En orden: **Tipos de negocio**, **Producto**, Facturación, Precios y **Recursos** (decisión de
Fermín, 19 oct 2026). Tipos de negocio agrupa los giros en Alimentos y bebidas, Tienda, Belleza y
Servicios, y cada giro lleva a su página `/punto-de-venta-<giro>`.

**Nada se despliega.** Una sola letra en todo el menú, la de la barra (Inter Tight 500), sin
descripciones ni títulos en mono.

- **PC:** el panel sigue bajando de arriba hacia abajo bajo el encabezado. A la izquierda, la
  lista del panel un 30 % más grande que la barra; al pasar el cursor por un grupo (Belleza), sus
  giros aparecen a la derecha, del mismo tamaño que la barra. El cambio es instantáneo y espera
  100 ms para que bajar en diagonal no cambie la lista. Al abrir se ve el primer grupo. Las listas
  de más de cinco renglones siguen en otra columna.
- **Teléfono y tableta (menos de 900 px):** el cajón es de pantalla completa, sin líneas entre
  renglones, y todo mide igual (18 px). Tocar un grupo abre otra pantalla que entra deslizándose
  desde la derecha, con «‹ Belleza» arriba para volver.

**Acciones (19 oct 2026):** se quitaron «Pide una demo» y «Pruébalo 30 días gratis» del menú y
de la barra. En la PC la barra lleva «Iniciar sesión» (admin), «Contactar ventas» (/contacto, solo
desde 1120 px porque antes no cabe) y «Comenzar» (registro). En teléfono y tableta la barra solo
tiene el logo y la hamburguesa; el cajón termina con «Iniciar sesión» y un pie fijo con «Contactar
ventas» a la izquierda y «Comenzar» a la derecha.

El menú vive duplicado en cada HTML (no hay build). Para cambiarlo se cambia en `_patron.html` y
se replica en todas las páginas con un script de un solo uso, no a mano: dieciocho copias editadas
a mano son dieciocho oportunidades de que una quede distinta.

Una entrada nueva en el panel tiene que llevar a una página que exista: la prueba «ningún enlace
interno lleva a un 404» lo vigila. Hamburgueserías ya no está en el menú: se llega desde la página
de servicio rápido.

## Movimiento

En el producto casi nada se anima porque todo se usa cientos de veces al día. La web se ve una vez,
así que aquí sí cabe — con las mismas curvas y los mismos límites:

- **Solo `transform` y `opacity`, y por debajo de 300 ms.** Las duraciones y las curvas son las de
  `vim.css` (`--v-corta`, `--v-media`, `--sal`); no se inventan otras.
- **Lo que entra al bajar, entra una vez.** Sube 12 px y aparece. Las clases las pone el script
  y solo a lo que al cargar queda por debajo de la pantalla: sin script todo se ve.
- **Un solo momento de entrada en la primera pantalla**: la captura del hero.
- **Nada se mueve solo más de unos segundos.** El diagrama de «Cortar el internet» se enseña una
  vez al entrar en pantalla y no se repite. La marquesina de hechos se quitó por esto mismo.
- **Con movimiento reducido** se quita el desplazamiento y se queda el fundido.

Lo que no va: texto que se escribe solo, video de fondo, parallax, secciones atadas al scroll y
contadores de cifras.

## Los textos son cortos

Regla de Fermín (12 de octubre de 2026): **«solo mencionar lo esencial y ya»**. Una frase corta
por idea, dos como máximo, que diga el beneficio. Fuera los incisos, las justificaciones y las
comparaciones con otros sistemas; fuera también los nombres de otros puntos de venta.

Las tres guías (`como-elegir…`, `cuanto-cuesta…`, `factura-global…`) son la excepción: son
artículos y su largo es su contenido. Los textos legales tampoco se recortan.

Los datos sí se conservan exactos: precios, planes, folios, horarios y plazos.

## Las cuatro funciones de la portada son un acordeón

El mismo acordeón de las preguntas frecuentes, con una sola captura al lado: la de la fila
abierta. Filas y capturas se emparejan por posición, así que van en el mismo orden.

## La captura del hero va sobre un escenario

Un bloque de `accent-soft` detrás del marco. No es un tema oscuro ni un degradado: es el mismo azul
suave de los fondos de realce, y existe porque el marco blanco sobre fondo blanco se perdía.

## Riesgo propio: los tokens están copiados

Hoy hay 16 literales `#0078C9` en el HTML. Si el núcleo cambia de color, el sitio **no se entera**.
Mientras no haya un paso que los compare, cualquier cambio de marca incluye revisar el sitio a
mano. Está anotado como deuda en `nucleo.md`.

Ya pasó una vez: `--ink-3` cambió en el núcleo en septiembre de 2026 (de `#8E8E94` a `#6E6E74`,
por contraste) y el sitio se quedó un mes con el valor viejo. Se corrigió el 12 de octubre.
