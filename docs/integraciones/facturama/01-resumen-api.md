# Facturama — la API en 10 minutos

Resumen de la documentación oficial capturada en esta carpeta (3 sep 2026). Cuando algo de aquí
contradiga lo que dice la skill `facturama-cfdi`, manda la skill: aquello está verificado contra
el sandbox; esto es lo que Facturama documenta.

## 1. Dos modalidades, una decisión ya tomada

| | API Web | **API Multiemisor** (la que usa VIM POS) |
|---|---|---|
| Emisores por cuenta | Uno (el dueño de la cuenta) | Ilimitados; el RFC va en cada petición (`Issuer`) |
| Dónde se ve lo timbrado | En la web de Facturama | Solo por API (`GET /cfdi?type=issuedLite`) |
| Catálogos de clientes, productos, sucursales, series | Sí (endpoints `/Client`, `/Product`, `/BranchOffice`, `/Serie`) | No existen: nosotros guardamos todo |
| Sellos (CSD) | El de la cuenta, desde la web | `POST/PUT/DELETE /api-lite/csds` por RFC |
| Prefijo de rutas | `/api/…` o raíz | `/api-lite/…` para timbrar, cancelar y CSD; raíz para consultar y descargar |
| Activación en producción | Con la cuenta | Hay que pedirla por separado (guía `multiemisor--proceso`); Fermín confirmó que **está incluida en el plan contratado** |

Guías: `guias/multiemisor--proceso.md`, `guias/api-web--proceso.md`, `otros/Docs-multi.md`.

## 2. Cuentas, entornos y autenticación

- **Sandbox** y **producción** son cuentas distintas. Sandbox se crea en
  `https://dev.facturama.mx/api/registro`, producción en `https://app.facturama.mx/api/registro`.
  Un RFC solo puede registrarse una vez por entorno (`guias/crear-cuenta.md`).
- Base URL: `https://apisandbox.facturama.mx` en pruebas; `https://api.facturama.mx` en producción.
- **HTTP Basic** con usuario y contraseña de la cuenta, en todas las peticiones
  (`guias/autenticacion.md`). En Multiemisor no hay tokens ni OAuth.
- Sandbox no timbra ante el SAT: usa certificados de prueba. El **sello de prueba** se descarga de
  `https://cdnfacturama.azureedge.net/content/csd-pruebas.zip`; contraseña de todas las llaves
  `12345678a`. La guía `guias/sellos-de-prueba.md` trae la tabla de RFC de prueba con su razón social
  y régimen (por ejemplo `EKU9003173C9` Escuela Kemper Urgate, régimen 601).
- **Folios**: cada timbrado consume uno; también lo consumen la validación de RFC en producción
  (`GET /customers/status?rfc=`) y la consulta de estatus ante el SAT (`GET /cfdi/status`).
  Precios publicados en `guias/recarga-folios.md`: $0.50 por folio de 1 a 10,000, $0.45 de 10,001 a
  50,000, y baja en escalones. La recarga se hace desde la web de Facturama, no por API
  (los endpoints `Subscription` no están documentados; dieron error al capturarlos).

## 3. Timbrar (Multiemisor)

`POST /api-lite/3/cfdis` — referencia completa en
`referencia-api-multi/POST-api-lite-3-cfdis.md` (todos los atributos del modelo `CfdiMulti`),
ejemplo comentado en `guias/multiemisor--factura.md`.

Esqueleto mínimo de una factura de ingreso:

```json
{
  "Folio": "1234",
  "CfdiType": "I",
  "ExpeditionPlace": "37000",
  "PaymentForm": "01",
  "PaymentMethod": "PUE",
  "Currency": "MXN",
  "Issuer": { "Rfc": "EKU9003173C9", "Name": "ESCUELA KEMPER URGATE", "FiscalRegime": "601" },
  "Receiver": { "Rfc": "…", "Name": "…", "CfdiUse": "G03", "FiscalRegime": "…", "TaxZipCode": "…" },
  "Items": [{
    "ProductCode": "50191500", "UnitCode": "H87", "Unit": "Pieza", "Description": "Hamburguesa",
    "Quantity": 1, "UnitPrice": 100.00, "Subtotal": 100.00, "TaxObject": "02",
    "Taxes": [{ "Name": "IVA", "Rate": 0.16, "Total": 16.00, "Base": 100.00, "IsRetention": false }],
    "Total": 116.00
  }]
}
```

Puntos que la documentación deja claros:

- `Issuer` es obligatorio y es lo que elige el sello: Facturama busca el CSD cargado para ese RFC.
  El nombre del emisor va **sin régimen societario** y como aparece en el SAT.
- `Folio` y `Serie` los pone quien timbra (no hay series en Multiemisor). `Folio` es obligatorio.
- `ExpeditionPlace` es el CP del lugar de expedición (la sucursal). En factura global,
  `Receiver.TaxZipCode` debe ser **igual** a `ExpeditionPlace`.
- `Receiver.FiscalRegime` y `TaxZipCode` son obligatorios en CFDI 4.0, y deben coincidir con la
  Constancia del receptor (`guias/cfdi-4-0.md`).
- Cada `Item` declara `TaxObject` (`01` no objeto, `02` objeto, `03` objeto no obligado a
  desglose) y sus `Taxes` con `Base`, `Rate`, `Total`.
- Campos opcionales útiles (`guias/multiemisor--campos-adicionales.md`): `Observations`,
  `PaymentBankName`, `PaymentAccountNumber`, `OrderNumber`, `PaymentConditions`, `LogoUrl` (jpg o
  png; **no SVG**).
- La respuesta trae `Id` (23 caracteres, la clave para descargar y cancelar), `Complement.TaxStamp`
  con `Uuid`, `Date`, `SatCertNumber`, `SatSign`, `CfdiSign`, además de `Issuer`, `Receiver`, `Items`
  y `Taxes` tal como quedaron en el XML.

## 4. Factura global (público en general)

Guía `guias/factura-global.md` y `guias/cfdi-4-0--publico-en-general.md`.

- Receptor fijo: `Rfc` `XAXX010101000`, `Name` `PUBLICO EN GENERAL`, `CfdiUse` `S01`,
  `FiscalRegime` `616`, `TaxZipCode` = `ExpeditionPlace`.
- Nodo `GlobalInformation` obligatorio: `Periodicity` (`01` diario, `02` semanal, `03` quincenal,
  `04` mensual, `05` bimestral), `Months` (`01`…`12`, o `13`…`18` para bimestres), `Year`.
- Cada concepto es un ticket: `ProductCode` `01010101`, `Description` = número del ticket,
  `UnitCode` `ACT`, `Quantity` 1. Un ticket con IVA y otro sin IVA van en conceptos separados.
- Usar el RFC genérico **sin** `GlobalInformation` da 400: usar ese RFC ya es hacer factura global.

## 5. Cancelación

Guías `guias/multiemisor--cancelacion.md` y `guias/cancelacion-cfdi.md`; referencia
`referencia-api-multi/DELETE-api-lite-cfdis-id_motive_uuidReplacement.md`.

`DELETE /api-lite/cfdis/{id}?motive=02` (la skill documenta también la forma
`/api-lite/cfdi/{id}?type=issuedLite&motive=…`; las dos aparecen en el portal).

| Motivo | Significado | Requiere `uuidReplacement` |
|---|---|---|
| `01` | Comprobante emitido con errores **con** relación (hay sustituto) | Sí |
| `02` | Comprobante emitido con errores sin relación | No |
| `03` | No se llevó a cabo la operación | No |
| `04` | Operación nominativa relacionada en una factura global | No |

La respuesta trae `Status`: `canceled` (cancelado), `active` (sigue vigente), `pending` (esperando
aceptación del receptor), `acepted` (así, con una c: aceptado), `rejected` (el receptor rechazó),
`expired` (venció el plazo de respuesta). Desde 2022 el SAT puede exigir aceptación del receptor;
un 200 no significa cancelado, hay que leer `Status` y después el acuse
(`GET /cfdi/acuse/issuedLite/{id}?format=xml`; `referencia-api-web/GET-cfdi-acuse_type_id_format.md`).

Consulta de estatus ante el SAT sin nuestra base:
`GET /cfdi/status?uuid=&issuerRfc=&receiverRfc=&total=` (`guias/cfdi-status.md`; consume folio).

Hay también una guía de **cancelación sin CSD cargado** (`guias/multiemisor--cancelacion-sin-csd.md`):
Facturama devuelve un XML a firmar y se le regresa firmado. No la usamos: nuestros emisores tienen
el sello cargado.

## 6. Consultar y descargar

- Listado (`guias/multiemisor--consultar.md`): `GET /cfdi?type=issuedLite&folioStart&folioEnd&dateStart&dateEnd&rfcIssuer&rfc&taxEntityName&status&page`,
  100 por página, `status` = `active` o `canceled`.
- Detalle: `GET /api-lite/cfdis/{id}` (`referencia-api-multi/GET-api-lite-cfdis-id.md`).
- Descargas: `GET /cfdi/{xml|pdf|html}/issuedLite/{id}` → JSON con `Content` en base64,
  `ContentType`, `ContentLength`, `ContentEncoding`
  (`referencia-api-multi/GET-api-lite-cfdi_format_type_id.md`).
- Envío por correo: `POST /Cfdi?cfdiType=issuedLite&cfdiId=&email=&subject=&comments=&issuerEmail=&includePayBtn=`
  (`referencia-api-web/POST-cfdi_cfdiType_cfdiId_email_…md`). Responde
  `{ msj, success }` **siempre con HTTP 200**: el resultado está en `success`.
- Acuse de cancelación: `GET /cfdi/acuse/issuedLite/{id}?format=xml|pdf`.

## 7. Sellos (CSD)

`guias/multiemisor--csds.md` y `referencia-api-multi/{POST,GET,PUT,DELETE}-api-lite-csds*.md`.

- `POST /api-lite/csds` con `Rfc`, `Certificate` (.cer en base64), `PrivateKey` (.key en base64) y
  `PrivateKeyPassword`. Si el RFC ya tiene sello responde 400: renovar es `PUT /api-lite/csds/{rfc}`.
- `GET /api-lite/csds` lista todos y **devuelve la llave y su contraseña en claro**. No lo llamamos.
- `DELETE /api-lite/csds/{rfc}` da de baja el sello (al dar de baja un cliente).
- Los CSD caducan cada cuatro años: la renovación es operación normal, no excepción.

## 8. Catálogos del SAT (API Web, sirven con la misma credencial)

Todos en `referencia-api-web/GET-catalogs-*.md`. Los que importan al POS y al portal de autofactura:

| Endpoint | Para qué |
|---|---|
| `GET /catalogs/FiscalRegimens?rfc=` | Regímenes válidos según si el RFC es persona física o moral (por longitud) |
| `GET /catalogs/CfdiUses?keyword=` | Usos de CFDI; cada uso trae para qué régimen aplica (`Natural`, `Moral`) |
| `GET /catalogs/PostalCodes?keyword=` | Validar y autocompletar códigos postales |
| `GET /catalogs/ProductsOrServices?keyword=` | Claves de producto/servicio (la carta del restaurante) |
| `GET /catalogs/Units?keyword=` | Claves de unidad (`H87` pieza, `ACT` actividad, `E48` servicio) |
| `GET /catalogs/PaymentForms`, `PaymentMethods`, `Currencies`, `CfdiTypes`, `RelationTypes` | Listas cerradas |
| `GET /customers/status?rfc=` | Valida formato, existencia y estatus activo del RFC en el SAT. **En producción consume folio** |

Los catálogos cambian con el SAT (el historial `guias/historial-cambios.md` registra cuándo), así
que conviene tenerlos copiados en la base y refrescarlos, no consultarlos en cada venta.

## 9. Otros tipos de comprobante que Facturama documenta

- **Nota de crédito** (`guias/nota-de-credito.md`): `CfdiType` `E`, `NameId` `2`, relación tipo
  `01` (nota de crédito de los documentos relacionados) con el UUID de la factura, `CfdiUse` `G02`.
- **CFDI relacionados** (`guias/cfdi-relacionados.md`): nodo `Relations` con `Type` `01`…`07` y
  la lista de `Uuid`. El `04` (sustitución) acompaña a la cancelación con motivo `01`.
- **Complemento de pago** (`guias/complemento-pago.md`): `CfdiType` `P` para PPD. Un restaurante
  cobra al momento (PUE), así que casi no aplica.
- Complementos de nómina, carta porte, comercio exterior, retenciones, INE, IEDU, donativos,
  etc.: documentados en `guias/`, fuera del alcance de un POS de restaurante.

## 10. Lo que la documentación **no** dice y la skill sí

Trampas que solo salieron al probar (detalle y mensajes en `../../../.claude/skills/facturama-cfdi/`):
un concepto a tasa 0 no acepta `Discount`; la cancelación en sandbox responde 200 pero no
cancela; el motivo `01` sin `uuidReplacement` también responde 200; el acuse devuelve el propio
CFDI cuando no hay acuse; `cfdiType=issued` en el correo da 404 (debe ser `issuedLite`); el
`UsoCFDI` depende del régimen del receptor; los acentos del nombre se respetan tal cual.
