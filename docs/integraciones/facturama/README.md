# Facturama — documentación capturada e integración de CFDI en VIM POS

Facturama es el PAC (Proveedor Autorizado de Certificación) con el que VIM POS timbra CFDI 4.0.
Esta carpeta guarda **su documentación pública completa** tal como estaba el 3 de septiembre de
2026, más los resúmenes que hacen falta para trabajar sin volver al portal. Misma idea que
`../delivery/`: primero aprender todo, luego construir sobre lo aprendido.

> Lo verificado contra el sandbox (payloads exactos, errores reales, trampas) vive en la skill
> `facturama-cfdi` (`.claude/skills/facturama-cfdi/`, con `references/multiemisor.md` y
> `references/errores.md`). Aquí está la documentación oficial íntegra y el mapa de qué usamos.

## Documentos de trabajo

| Archivo | Qué es |
|---|---|
| [`01-resumen-api.md`](01-resumen-api.md) | La API en 10 minutos: modalidades, autenticación, entornos, endpoints Multiemisor, factura global, cancelación, consultas, catálogos, folios |
| [`02-vimpos-y-facturama.md`](02-vimpos-y-facturama.md) | Qué parte de la API usa VIM POS hoy, dónde vive en el código, y lo que la documentación ofrece y aún no aprovechamos |
| [`03-activacion-produccion.md`](03-activacion-produccion.md) | Checklist para encender facturación real: contratar, secrets, datos fiscales y sello de cada cliente, primera prueba |

## Documentación capturada (íntegra)

Fuente: <https://apisandbox.facturama.mx>. Cada archivo lleva en la primera línea la URL de origen.

- `referencia-api-multi/` — la referencia de la **API Multiemisor** (9 páginas): timbrar
  (`POST /api-lite/3/cfdis`, con todos los atributos de petición y respuesta), cancelar, detalle
  de CFDI, descargar, y alta/consulta/actualización/baja de CSD.
- `referencia-api-web/` — la referencia de la **API Web** (62 páginas): sirve de referencia de
  esquemas y para los **catálogos** (usos de CFDI, regímenes por RFC, códigos postales,
  productos y servicios, unidades, formas y métodos de pago…), la validación de RFC, el envío
  por correo y el acuse. Los endpoints de clientes, productos, sucursales y series son de la
  modalidad Web y **no aplican** a Multiemisor.
- `guias/` — las 76 guías (Multiemisor, API Web, CFDI 4.0, factura global, nota de crédito,
  complementos, nóminas, retenciones, catálogos, sellos de prueba, historial de cambios).
- `otros/` — las páginas índice (`Docs`, `Docs-multi`, `guias`), los catálogos de control
  interno de Facturama (estados, países) y el índice de ejemplos.

No se pudieron capturar (el portal devuelve página de error): `docs-multi/api/POST-api-2-cfdis`
y `GET-cfdi_type_…` (versiones viejas del timbrado y del listado; las vigentes son
`POST-api-lite-3-cfdis` y la guía de consultas), `DELETE/POST-Subscription` y
`guias/api-web/cfdi/configuracion`.

## Cómo se capturó (para repetirlo cuando cambie)

El portal es HTML servido por el servidor (no SPA). El contenido de cada página está en
`<div class="col-md-10 doc-content">` (en `/docs/catalogs` y `/docs/examples`, en
`container body-content`). Los enlaces salen de `/Docs`, `/Docs-multi` y `/guias`. Desde esta
máquina `curl` necesita `--ssl-no-revoke` (el antivirus intercepta TLS). El script de la sesión
(`scratchpad/facturama/bajar.mjs`) baja todo y lo convierte a Markdown: cuenta profundidad de
`<div>` para recortar el contenedor, convierte tablas y `<pre>`, y repara una cadena del sitio que
viene doble‑codificada. El Swagger (`/swagger/docs/v1`) responde vacío desde fuera del navegador;
no hace falta: la referencia HTML trae los esquemas.
