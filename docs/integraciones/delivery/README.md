# Integraciones con apps de delivery (Rappi · DiDi Food · Uber Eats)

**Fecha de captura:** 1 de septiembre de 2026 · **Estado:** sesión de aprendizaje; no hay código todavía.

Esta carpeta guarda **toda la documentación oficial** de las tres apps de delivery principales en
México, más los resúmenes de estudio y el diseño de cómo va a funcionar la integración dentro de
VIM POS. La idea es que en la siguiente sesión se pueda empezar a construir sin volver a abrir los
portales.

## Empieza por aquí

| Documento | Qué es |
|---|---|
| [`01-rappi-resumen.md`](01-rappi-resumen.md) | Cómo funciona la API de Rappi de punta a punta (onboarding, credenciales, tiendas, menú, órdenes, webhooks, financiero) |
| [`02-didi-food-resumen.md`](02-didi-food-resumen.md) | Lo mismo para DiDi Food |
| [`03-uber-eats-resumen.md`](03-uber-eats-resumen.md) | Lo mismo para Uber Eats |
| [`04-comparativa.md`](04-comparativa.md) | Las tres lado a lado: qué se parece, qué no, tiempos límite, dinero, firmas |
| [`05-diseno-integracion-vimpos.md`](05-diseno-integracion-vimpos.md) | **Cómo va a funcionar dentro de VIM POS**: arquitectura, tablas, flujo de conexión del cliente, pedidos, menú, offline, conciliación |
| [`06-preguntas-abiertas-y-siguientes-pasos.md`](06-preguntas-abiertas-y-siguientes-pasos.md) | Lo que Fermín tiene que decidir o gestionar (trámites con cada app) y el orden propuesto |
| [`07-solicitudes-didi-rappi.md`](07-solicitudes-didi-rappi.md) | Pasos y textos listos para pedir acceso a DiDi Food (Qualification + correo) y a Rappi (TAM vía ejecutivo del piloto y Portal de Aliados) |

## Documentación cruda (fuente de verdad)

Todo lo de abajo es texto **copiado tal cual** de los portales oficiales, convertido a Markdown.
Cuando el resumen y la fuente cruda no coincidan, manda la fuente cruda.

### Rappi — `rappi/`

- Fuente: <https://dev-portal.rappi.com/es/> (portal en español).
- `guias/` — las 18 páginas de guía (getting-started, autenticación, self-onboarding, menús,
  órdenes, disponibilidad, webhooks, estándares, utils, financial, FAQ, obsolescencias, rests-api…).
- `referencia-api/` — las 12 páginas de referencia de endpoints (authentication, orders, menus,
  availability, stores, webhooks, rests-api-orders, rests-api-menu, rests-api-availability,
  utils, financial, content).
- `adjuntos/estado-orden.png` — diagrama de estados de la orden.
- Cómo se capturó: los HTML son Next.js y el Markdown viene íntegro dentro de `__NEXT_DATA__`
  (`props.pageProps.doc.content`); se extrajo con un script Node.

### DiDi Food — `didi-food/`

- Fuente: <https://developer.didi-food.com/en-US/openapi> (solo existe en inglés; el árbol en
  `es-MX` devuelve lo mismo).
- `docs/` — los 77 temas del portal, numerados en el orden del menú lateral
  (`NN_Seccion__Tema.md`). Cada archivo empieza con un comentario con el `id` del nodo.
- `docs/_tree.json` — el árbol de navegación con los ids.
- `openapi/swagger.yaml` — la especificación OpenAPI oficial (zip del portal, abril 2022; los
  endpoints v3 posteriores solo están en los `.md`).
- `adjuntos/imagenes/` — los 36 diagramas y capturas del portal (flujos de integración, de
  órdenes, de cancelación, del portal de herramientas). Pesan 40 MB porque varios son GIF.
- `adjuntos/sample-…json` — ejemplo real de `failInfoUrl` de una carga de menú fallida.
- Cómo se capturó: el portal es una SPA que carga cada tema desde
  `openplatform-portal.didi-food.com/docs/v1/node/nodedataget?lang=en-US&id=N` (Markdown en
  base64). El script `didi_fetch.js` de la sesión lo baja completo; se puede repetir cuando cambie.

### Uber Eats — `uber-eats/`

- Fuente: <https://developer.uber.com/docs/eats>.
- `guias/` — las 16 guías (getting started, sandbox, authentication, webhooks, activación de la
  integración, store, menu, order, retail fulfillment, reporting, going live, errors, calidad y
  rendimiento, changelog, FAQ, introduction).
- `referencia-api/` — las 31 páginas de referencia "versión anterior" (v1 stores/status/holiday
  hours, v1 accept/deny/cancel, v2 menú completo con ejemplos de payload, webhooks
  orders.notification / orders.release / menu refresh).
- `openapi/` — las especificaciones OpenAPI **actuales** (las que el portal renderiza con Redoc y
  no se pueden descargar por URL): `order-fulfillment-api` (Order API suite v1/delivery, 11 rutas,
  137 esquemas, incluye todos los webhooks de órdenes), `store-api` y `integration-activation-api`.
  Las suites Promotions, Reporting, Delivery Partner y BYOC solo están resumidas en
  `03-uber-eats-resumen.md` (rutas y propósito); su JSON se puede extraer igual que estos si hace
  falta.
- `contrato/` — el **API Licensing Agreement firmado el 2 sep 2026** (PDF + certificado de
  DocuSign), los API Terms of Use que incorpora, y `contrato/README.md` con **todas las
  obligaciones desglosadas y su estado en el producto**. Manda sobre el ADR 0011.
- Cómo se capturó: las páginas se bajan con `curl` **solo** si se manda `Accept: text/html`
  (sin ese header el servidor responde 404). Las suites Redoc se sacaron del objeto `store.spec`
  del componente React en el navegador.

## Qué NO está aquí

- Credenciales de ninguna app. No existen todavía: hay que tramitarlas (ver documento 06).
- Código. Esta sesión fue solo de aprendizaje.
- La "Rests API de Menú" de Rappi está en `referencia-api/rests-api-menu.md` pero no se resumió en
  detalle porque la guía oficial sigue recomendando `POST menu` para restaurantes.

## Cómo mantener esto

- Rappi: volver a bajar `https://dev-portal.rappi.com/es/<pagina>/` y extraer `__NEXT_DATA__`.
- DiDi: repetir `nodetreeget` + `nodedataget` (no requieren firma ni sesión).
- Uber: `curl -H "Accept: text/html"`; el changelog (`guias/api-change-log.md`) dice qué cambió.
