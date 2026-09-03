# Qué usa VIM POS de Facturama y qué no (todavía)

Mapa entre la documentación capturada y el código. Estado: 3 de septiembre de 2026. El módulo está
**construido y probado en sandbox, no activado en producción** (ADR `docs/decisiones/0009`).

## Dónde vive en el código

| Pieza | Ruta | Qué hace |
|---|---|---|
| Adaptador Facturama | `supabase/functions/_shared/pac/facturama.ts` | `timbrar`, `descargar`, `cancelar`, `enviarPorCorreo`, `descargarAcuse`, `cargarSello`, `borrarSello` |
| Contrato y selección de PAC | `_shared/pac/{tipos,seleccion,index}.ts` | Interfaz `PacAdapter`; `elegirPac()` toma Facturama cuando hay `FACTURAMA_API_USER/PASSWORD`; failover solo ante fallo de transporte |
| Conceptos | `_shared/pac/conceptos.ts` | Ticket → `Items` (impuestos por renglón, descuento absorbido en tasa 0) |
| Certificado | `_shared/pac/certificado.ts` | Lee número, vigencia y RFC del `.cer` sin llamar a `GET /api-lite/csds` |
| Edge Functions | `timbrar-cfdi`, `timbrar-global`, `cancelar-cfdi`, `cargar-csd`, `autofacturar` | Orquestación, cola `tickets_cfdi`, folios |
| Base de datos | migraciones `0013`, `0027`, `0080`–`0083` | `tickets_cfdi` (8 estados), `tenant_cfdi_emisor`, add-on `CFDI`, `tenant_folios_saldo` + `folios_movimientos`, factura global, cancelación |
| Admin | `apps/admin/app/(panel)/configuracion/cfdi` y `/facturacion` | Datos fiscales del emisor, carga de `.cer/.key`, lista de comprobantes |
| Portal público | `apps/factura` (`factura.vimpos.com.mx`) | Autofactura por ticket, valida régimen contra uso de CFDI |
| Skill | `.claude/skills/facturama-cfdi/` | Payloads verificados y errores reales |

## Endpoint por endpoint

| Documentado por Facturama | En VIM POS | Notas |
|---|---|---|
| `POST /api-lite/3/cfdis` | ✅ `timbrar()` | Ingreso individual y global (`GlobalInformation`) |
| `DELETE /api-lite/cfdis/{id}?motive=` | ✅ `cancelar()` | Ruta documentada (plural, sin `type`). Responde `Status` + `AcuseXmlBase64`; `canceled/acepted/expired` = cancelado, `pending` = en proceso, `rejected` = sigue vigente. Validamos que `01` lleve `uuidReplacement` |
| `GET /cfdi/{xml\|pdf\|html}/issuedLite/{id}` | ✅ `descargar()` | Decodifica el base64 del JSON. Desde 0098 los archivos se guardan en el bucket privado `cfdi` al timbrar y `descargar-cfdi` los sirve al admin (o los repone del PAC) |
| `GET /cfdi/acuse/issuedLite/{id}?format=xml` | ✅ `descargarAcuse()` | Distingue acuse real de «te devuelvo el CFDI» |
| `POST /Cfdi?cfdiType=issuedLite&cfdiId=&email=` | ✅ `enviarPorCorreo()` | Lee `success`, no el HTTP |
| `POST /api-lite/csds`, `PUT /api-lite/csds/{rfc}` | ✅ `cargarSello()` | POST y cae a PUT si «Ya existe un CSD» |
| `DELETE /api-lite/csds/{rfc}` | ✅ `borrarSello()` | Para baja de cliente |
| `GET /api-lite/csds` | ⛔ a propósito | Devuelve llaves privadas en claro; todo lo necesario sale del `.cer` |
| `GET /cfdi?type=issuedLite&…` (listado) | ➖ no hace falta | Nuestra tabla `tickets_cfdi` es la fuente; útil solo para reconciliar |
| `GET /api-lite/cfdis/{id}` (detalle) | ➖ | Ídem |
| `GET /cfdi/status?uuid=…` | ❌ pendiente | Consultar vigencia ante el SAT (consume folio). Serviría para confirmar cancelaciones `pending` sin esperar el acuse |
| `GET /catalogs/FiscalRegimens?rfc=`, `CfdiUses` | ❌ pendiente | Hoy la regla régimen↔uso está codificada en el portal; conviene sembrar los catálogos del SAT desde aquí y refrescarlos |
| `GET /catalogs/PostalCodes`, `ProductsOrServices`, `Units` | ❌ pendiente | Autocompletar CP en el portal; claves SAT por producto en el admin (hoy se captura a mano) |
| `GET /customers/status?rfc=` | ❌ pendiente | Validar RFC del receptor antes de timbrar. Consume folio en producción: usar solo tras fallar la validación local |
| Nota de crédito (`CfdiType E` + `Relations 01`) | ❌ pendiente | Devoluciones de tickets ya facturados. Hoy la única salida es cancelar |
| Cancelación sin CSD (XML firmado) | ➖ no aplica | Nuestros emisores tienen sello cargado |
| Complemento de pago (`P`), nómina, carta porte, etc. | ➖ no aplica | Restaurante cobra PUE |
| API Web: clientes, productos, sucursales, series | ➖ no aplica | Solo existen en modalidad Web |

## Lo que enseñó el primer CFDI real (3 sep 2026)

- **Los archivos no se guardaban.** `tickets_cfdi` tenía rutas `cfdi/<id>.xml` pero no existía el
  bucket ni nadie subía nada; el admin no tenía botón de descarga. Corregido en 0098 + `descargar-cfdi`.
- **La hora del PAC viene sin zona** (`2026-09-03T16:34:41`, hora de México) y se guardaba como UTC:
  seis horas de error. Corregido en `_shared/pac/fechas.ts`; 0098 repara las filas ya guardadas.
- Emisor y receptor con el mismo RFC: Facturama lo timbró sin objeción.
- **La ruta de cancelación de la skill no cancelaba.** `DELETE /api-lite/cfdi/{id}?type=issuedLite&motive=02`
  respondió 200 con cuerpo vacío y el CFDI siguió vigente; el «acuse» que devolvió la API era el
  propio comprobante. Se cambió a la ruta documentada `/api-lite/cfdis/{id}?motive=`, que responde
  `Status` y el acuse en base64, y el estado se decide por ese `Status`.

## Lo que la documentación cambió de opinión respecto a lo que creíamos

- **Cancelación**: resuelto el 3 sep 2026 en producción: manda la ruta documentada
  `DELETE /api-lite/cfdis/{id}?motive=`. La otra respondía 200 vacío sin cancelar.
- **Estados de cancelación**: la guía enumera `canceled / active / pending / acepted / rejected /
  expired`. Nuestro `EN_PROCESO_CANCELACION` cubre `pending`; falta mapear `rejected` y `expired`
  (el receptor no aceptó o venció el plazo: el CFDI sigue vigente y hay que avisarlo al dueño).
- **Recarga de folios**: Facturama la hace desde su web, no por API. Nuestro modelo de folios
  (paquetes que vende VIM) es independiente del saldo de folios de la cuenta Facturama: hay que
  vigilar ese saldo aparte (ver `03-activacion-produccion.md`).
- **Historial de cambios** (`guias/historial-actualizaciones.md`): Facturama anuncia ahí los cambios de
  catálogos del SAT y de la API. Conviene revisarlo cada mes.

## Trabajo sugerido cuando se active producción (en orden de valor)

1. ~~Confirmar la ruta de cancelación real y mapear `rejected`/`expired`~~ hecho el 3 sep 2026.
2. Sembrar catálogos del SAT desde `/catalogs` en una tabla global y usarlos en el portal y en el
   admin (usos por régimen, unidades, claves de producto).
3. `GET /customers/status` como segunda opinión cuando el SAT rechaza RFC o CP del receptor.
4. Nota de crédito para devoluciones de tickets facturados.
