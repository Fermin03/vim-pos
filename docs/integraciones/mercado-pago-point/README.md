# Mercado Pago Point — documentación capturada y diseño del cobro con terminal en VIM POS

**Fecha de captura:** 8 de octubre de 2026 · **Estado:** sesión de aprendizaje; no hay código ni
cuenta de desarrollador. La terminal (Point Smart 2) llega el 9 oct 2026.

Mercado Pago Point es la terminal de tarjetas de Mercado Pago. Integrada, la caja le manda el monto
y la terminal lo cobra sola; el resultado regresa al ticket sin que nadie teclee nada. Esta carpeta
guarda **su documentación pública** tal como estaba el 8 de octubre de 2026, más los resúmenes y el
diseño que hacen falta para construir sin volver al portal. Misma idea que `../delivery/` y
`../facturama/`: primero aprender todo, luego construir sobre lo aprendido.

> La terminal integrada estaba pospuesta desde el 3 sep 2026 (primero el software). Esta carpeta es
> el estudio previo; **arrancar la construcción sigue siendo decisión del dueño** (ver documento 03).

## Empieza por aquí

| Documento | Qué es |
|---|---|
| [`01-resumen-api.md`](01-resumen-api.md) | La API en 10 minutos: cuentas y credenciales, OAuth, sucursales/cajas/terminales, crear-cancelar-devolver un cobro, estados, avisos (webhooks), impresión, pruebas, salida a producción |
| [`02-diseno-integracion-vimpos.md`](02-diseno-integracion-vimpos.md) | **Cómo va a funcionar dentro de VIM POS**: qué se reutiliza, arquitectura, tablas, conexión del restaurante, flujo de cobro en la caja, devoluciones, sin internet, seguridad |
| [`03-preguntas-abiertas-y-siguientes-pasos.md`](03-preguntas-abiertas-y-siguientes-pasos.md) | Lo que el dueño tiene que tramitar o decidir, las dudas que solo se resuelven probando, y el orden propuesto |

## Documentación capturada (fuente de verdad)

Fuente: <https://www.mercadopago.com.mx/developers/es/docs/mp-point/overview> (sitio de México).
Cada archivo lleva en la primera línea la URL de origen y la fecha. Cuando el resumen y la fuente
capturada no coincidan, manda la fuente capturada.

- `guias/` — 38 páginas **en español**:
  - Las 10 etapas de integración de Point: `overview`, `create-application`, `configure-terminal`,
    `payment-processing`, `notifications`, `optional-notifications`, `configure-printings`,
    `integration-test`, `integration-quality`, `go-to-production`.
  - Recursos (`resources--*`): estados de order y transacción, migración desde la API vieja
    (Payment Intents), credenciales, detalles de la aplicación, seguridad, troubleshooting, cuentas
    de prueba y las 13 páginas de reportes (liberaciones, todas las transacciones, otras operaciones).
  - OAuth (`security--oauth--*`): introducción, obtener, renovar y gestionar el Access Token,
    buenas prácticas y mapa de APIs. Más `security--pci` y `your-integrations--test--cards`.
- `referencia-api/` — 27 páginas de referencia de endpoints, **en inglés** (ver abajo por qué):
  sucursales (`stores`, 5), cajas (`pos`, 5), terminales (2), orders (crear, consultar, cancelar,
  reembolsar, simular), impresiones (3), contracargos (4), OAuth (2) y el `overview` de Point.
  Cada una trae parámetros, respuesta, **tabla de errores** y ejemplos.

### Lo que la captura no trae

- **Pestañas no activas de las guías.** El portal solo manda en el HTML la pestaña abierta. Faltan,
  por ejemplo, la validación de firma del webhook «sin SDK» (`guias/notifications.md` solo trae la
  variante con SDK), la respuesta de cancelar una order en `created`, y el cuerpo del reembolso
  parcial. Lo de cancelar y reembolsar **sí está completo** en `referencia-api/`.
- **Imágenes.** Quedan como enlace al CDN de Mercado Pago (`http2.mlstatic.com`), no se copiaron.
- **Referencia de reportes y de la API vieja** (Payment Intents, `integrations_api/…`): no se bajó.
  Los reportes están explicados en `guias/resources--reports--*`; la API vieja no se va a usar.
- **Comisiones.** No están en la documentación de desarrolladores (enlazan a
  <https://www.mercadopago.com.mx/developers/es/support/37740>).

## Qué NO está aquí

- Credenciales. No existen todavía: hay que crear la aplicación (documento 03).
- Código. Esta sesión fue solo de aprendizaje.
- Nada verificado contra la API. Todo lo de esta carpeta es **lo que Mercado Pago documenta**; lo
  que salga al probar contra el simulador y contra una terminal real irá a una skill
  (`.claude/skills/`), como se hizo con `facturama-cfdi`.

## Cómo se capturó (para repetirlo cuando cambie)

- **Guías:** el HTML en español viene completo desde el servidor (no es SPA). El contenido está en
  `<div class="docs-content">`. Se bajó con `curl` y se convirtió a Markdown con `turndown` +
  `linkedom`. Tres arreglos antes de convertir: los títulos de las secciones plegables viven en un
  `<button class="andes-accordion-header">` (se pasan a `##`); cada bloque de código es un `<pre>`
  exterior con la barra de botones y un `<pre class="language-x">` por pestaña (se deja solo el
  interior); y los globos de ayuda (`.dx-tooltip-content`) se quitan porque repiten el mismo párrafo
  en cada mención.
- **Referencia:** las páginas HTML de referencia recortan las descripciones («…Ver más») y pliegan
  los campos anidados, así que no sirven. El portal sirve cada endpoint como Markdown limpio
  agregando `.md` a la URL, pero **solo en inglés** (la ruta `/es/…​.md` devuelve lo mismo). Las
  guías también tienen `.md`, pero en inglés y con los saltos de línea aplastados: por eso las guías
  salieron del HTML.
- **Índices:** `https://www.mercadopago.com.mx/developers/es/docs/llms.txt` (todas las guías) y
  `…/es/reference/llms.txt` (todos los endpoints) listan lo que existe; de ahí salió la lista.
- **Trampas:** desde esta máquina `curl` necesita `--ssl-no-revoke` (el antivirus intercepta TLS).
  El portal contesta **200 con cuerpo vacío** si se le piden páginas muy seguido: hay que pausar
  ~1 s entre peticiones y reintentar cuando el cuerpo llega corto.
