# Contrato con Uber Eats — API Licensing Agreement

Carpeta con el contrato que VIM firmó con Uber para usar las Uber Eats APIs, y el desglose de lo
que nos obliga. **Este documento manda sobre cualquier decisión de producto de la integración con
Uber**: si algo del ADR 0011 o del código lo contradice, se corrige el código.

## Archivos

| Archivo | Qué es |
|---|---|
| `2026-09-02-uber-api-licensing-agreement-copia-en-proceso-sin-firmas.pdf` | El contrato completo (14 páginas) tal como lo descargó Fermín de DocuSign. **Ojo:** es la copia "In Process": tiene marca de agua, `Firmas: 0` y los campos del formulario (razón social, dirección, casillas de APIs, firma) salen como marcadores `/n1/`, `/ch1/`, `/sn1/`. El texto legal es el definitivo; lo que falta es la versión completada. |
| `2026-09-02-docusign-certificado-de-firma.pdf` | Certificado de DocuSign del sobre `BE49223E-42E1-8187-816B-696076163E3A`. Estado al descargarlo: *Entregado* (enviado y visto el 2 sep 2026 a las 17:18–17:19, hora del centro). |
| `uber-eats-api-terms-of-use-row.md` | Los *API Terms of Use* (versión ROW/EU, feb 2021) que el contrato incorpora por referencia. Texto íntegro. |

**Pendiente de Fermín:** cuando llegue el correo de DocuSign "Completed" (o desde el dashboard de
Uber → Legal Agreement), bajar el PDF firmado y guardarlo aquí como
`2026-09-02-uber-api-licensing-agreement-firmado.pdf`. Con esa copia hay que confirmar qué
casillas de APIs quedaron marcadas (ver "Alcance" abajo), porque cada casilla trae obligaciones.

## Qué documentos forman el contrato (para México)

1. **API Licensing Agreement** (portada + tabla de datos + firma). Uber = **Uber B.V.** (Países
   Bajos), porque México cae en "any other country".
2. **Exhibit A — ROW API Addendum** (cláusulas 1–10). Es el cuerpo del contrato.
3. **Appendix 1 — Data Processing Agreement (DPA)**. Prevalece sobre el resto en temas de datos.
4. **ROW API Terms of Use** (`uber-eats-api-terms-of-use-row.md`), incorporados por referencia.
   El contrato prevalece sobre los TOU si chocan, pero los TOU aplican en todo lo demás.
5. *Exhibit B (ANZ Addendum)* **no aplica**: es solo Australia y Nueva Zelanda.

Ley aplicable y tribunales: **Países Bajos** (cláusula 10.1.3). Idioma: inglés manda (10.2).

## Alcance de la licencia

- Licencia **no exclusiva, no transferible, no sublicenciable**, solo durante la vigencia, solo en
  el Territorio y **solo para las APIs marcadas** en la tabla (2.3). Propósito único: dar servicios
  de integración a Merchants (aceptar/rechazar pedidos, etc.).
- Las APIs son **gratis, "as is", sin garantía** (2.4). Uber puede cambiarlas cuando quiera (2.1).
- APIs de la tabla y lo que implica marcarlas:
  - **Integration Configuration API** — el merchant nos autoriza a leer su tienda y a activar la
    integración hasta que alguien la termine. *Necesaria* (es el OAuth `eats.pos_provisioning`).
  - **Store API** — actualizar estado/horarios de la tienda.
  - **Menu API** — subir el menú.
  - **Order API** — aceptar, rechazar, monitorear pedidos. **Al marcarla, VIM se declara
    totalmente responsable de retransmitir TODA la información del pedido entre Uber y el POS,
    incluyendo alergias e instrucciones especiales.**
  - **Reporting API** — datos financieros de los pay-details. Al marcarla, VIM garantiza que
    **cada merchant autorizó expresamente** ese acceso.
  - **Promotions API**, **Catalog API** — promociones y catálogo (retail).

## Vigencia

- Inicia el **2 de septiembre de 2026** (Effective Date) y dura **1 año**; se **renueva sola** por
  periodos de un año (6.1).
- **VIM** puede terminar sin causa con **1 año** de aviso por escrito. **Uber** puede terminar sin
  causa con **30 días** de aviso.
- Termina automáticamente si terminan los TOU o si alguna parte quiebra/cesa operaciones.
- Al terminar: dejar de usar las APIs de inmediato (6.2) y **destruir o devolver** todos los datos
  personales de Uber (DPA 1.5); borrar todo lo cacheado (TOU VIII.A).

## Obligaciones de VIM, una por una

Marcadas con ✅ las que el producto ya cumple (F1 en `main`), ⚠️ las que están a medias y ⬜ las
pendientes. La columna "dónde" dice qué parte del sistema o del negocio la cubre.

### A. Cómo se construye la integración

| # | Obligación | Cláusula | Estado | Dónde |
|---|---|---|---|---|
| A1 | Integrar y **mantener** la conexión conforme a la guía *Order Integration* de Uber | 4.1 | ✅ | `supabase/functions/delivery-webhook-uber`, `_shared/delivery/uber.ts`; guía en `../guias/order-integration.md` |
| A2 | Cumplir los **Quality & Performance Standards** (Uber los puede cambiar) | 4.2 | ⚠️ | Ver sección "Estándares de calidad" abajo |
| A3 | Aceptar/rechazar/cancelar con **POST explícitos y motivos de los tipos soportados** | 4.1 + estándares | ✅ | `motivoRechazoUber` mapea AGOTADO/CERRADO/SATURADO/POS_OFFLINE/OTRO a los `deny_reason` de Uber |
| A4 | Soportar webhooks `orders.notification` **y** `orders.failure` | estándares | ✅ | El webhook procesa notification, scheduled.notification, failure y cancel |
| A5 | Soportar *Activate / Retrieve config / Remove integration* | estándares | ✅ | Edge Function `delivery-uber-conexion`: activar (POST pos_data), verificar (GET pos_data), pausar/reanudar (PATCH) y desconectar (DELETE); pantalla Apps de delivery en el admin (F1b) |
| A6 | Soportar *Get/Set Store Status* y *Update Prep Time* | estándares | ⬜ | F1b/F4: pausar tienda desde el POS, tiempo de preparación |
| A7 | **Retransmitir alergias e instrucciones especiales**; si no se pueden retransmitir, **rechazar el pedido** | tabla Order API; estándares | ⚠️ | Instrucciones de carrito → `tickets.nota_general`; de ítem → nota del `ticket_item`. Falta verificar el campo de alérgenos del `GetOrder` y mostrarlo en caja/KDS |
| A8 | Uber puede compartir nuestras métricas de rendimiento con merchants | 4.2 | — | Informativo: nuestra tasa de aceptación es pública para clientes potenciales |
| A9 | No saltarse límites de llamadas ni usar bots/scraping contra las APIs | TOU III.C, III.G | ✅ | Token client_credentials cacheado en `delivery_credenciales_app` (máx. 100/h); sin polling a Uber, todo por webhook |
| A10 | Versiones: tolerar campos nuevos y cambios de orden en las respuestas | estándares | ✅ | Los normalizadores ignoran campos desconocidos |

### B. La tablet de Uber y la relación con el merchant

| # | Obligación | Cláusula | Estado | Dónde |
|---|---|---|---|---|
| B1 | **Soportar que el merchant siga aceptando pedidos en la tablet de Uber** (Device), que debe quedarse en el local, accesible al personal de mostrador. **No promover reemplazar la tablet** ni desplegar una alternativa sin aprobación escrita de Uber | 4.3.2 | ⚠️ | Producto: el POS es *complemento*, no sustituto. **Marketing/sitio web: prohibido decir "olvídate de la tablet de Uber"** o similar. Revisar copy de `sitio-web/` antes de anunciar la integración |
| B2 | Confirmar, de forma continua, que **cada merchant tiene un Uber Eats Agreement vigente** con Uber | 3.2.1 | ⬜ | La conexión OAuth solo funciona con cuenta de merchant activa; documentarlo como control y guardar `conectada_at`/`tienda_id_externo` como evidencia |
| B3 | Que **cada merchant autorice expresamente** a VIM a acceder a sus datos de Uber y **acepte términos al menos tan restrictivos** que este contrato sobre el uso de esos datos | 3.2.1, 4.3.1(a) | ⚠️ | Registro: casilla obligatoria en el asistente de conexión, con fecha y usuario en `delivery_conexiones.config.terminos_aceptados_*` (F1b). Falta la cláusula en los **términos de servicio de VIM POS** |
| B4 | No firmar contratos que impidan cumplir este acuerdo o limiten derechos de Uber | 4.3.1(b)(c) | ✅ | Revisar al firmar exclusividades con otras apps (DiDi/Rappi) |
| B5 | Ofrecer de buena fe la integración a **todos** los clientes de VIM que usen Uber Eats y ayudar a Uber a identificarlos | 4.3.3 | ✅ | La integración va incluida en el producto, no es un add-on por cliente |
| B6 | **VIM da todo el soporte** de la integración al merchant (implementación y técnico, continuo). Uber solo ayuda por correo, a su criterio | 5.2 | ⬜ | Runbook de soporte + FAQ para clientes; registrar `ultimo_error` visible en admin |
| B7 | VIM **nunca cobra ni paga** nada entre Uber y el merchant | 5.1 | ✅ | La conciliación (`apps_liquidaciones`) es solo lectura/informativa |
| B8 | Uber puede usar las **marcas de VIM** para marketing (en el formato que VIM apruebe) | 4.4 | — | Informativo |
| B9 | No usar marcas/logos de Uber sin permiso escrito; solo referirse a Uber como fuente y seguir sus *design guidelines* | TOU IV.A, IV.B, VI.B | ⚠️ | En el POS usamos el texto "Uber Eats" (permitido). **No** dibujar logos propios de Uber; si se usa un ícono, tomarlo de sus guidelines sin modificar |
| B10 | No declarar "alianza", "socio oficial" ni patrocinio de Uber sin aprobación escrita | TOU IX | ⬜ | Marketing: decir "integración con Uber Eats", no "partner de Uber" |

### C. Datos (Uber Data / datos personales) — esto es lo delicado

Uber Data = nombre e inicial del apellido del cliente, su teléfono, e información del pedido
(ítems, instrucciones, alergias) (3.2.1). Uber es **Responsable (Controller)** y VIM es
**Encargado (Processor)** (DPA 1.1).

| # | Obligación | Cláusula | Estado | Dónde |
|---|---|---|---|---|
| C1 | Usar Uber Data **solo** para (a) tramitar el pedido y (b) mostrárselo al merchant en su panel, solo o **agregado con sus demás ventas**. Para nada más | 3.2.2, DPA 1.2 | ✅ | El dato vive en `delivery_pedidos` bajo RLS del tenant; el panel del admin puede sumar Uber+DiDi+Rappi+mostrador (permitido explícitamente) |
| C2 | No combinar datos personales de Uber con otras fuentes salvo que sea necesario para el servicio | DPA 1.2 | ⚠️ | **No** cruzar `cliente_telefono` de Uber con la tabla de clientes/lealtad del merchant. Hoy no se hace; dejarlo escrito como regla en el ADR |
| C3 | No exponer datos personales a otros usuarios ni a terceros | TOU VII.A | ✅ | RLS por tenant; el KDS muestra solo nombre corto; el teléfono solo en caja |
| C4 | **Retención mínima**: conservar los datos solo lo necesario; destruir/devolver al terminar o cuando Uber lo pida | DPA 1.5 | ⬜ | Definir política: anonimizar `cliente_nombre`, `cliente_telefono`, `direccion_texto` y `payload_raw` a los N días (propuesta: 30) con un job; conservar montos e ítems para conciliación |
| C5 | **Subencargados** (Supabase/AWS, Vercel, etc.) solo con contrato igual de restrictivo; VIM sigue siendo responsable | DPA 1.4 | ⬜ | Lista de subencargados en el aviso de privacidad de VIM; conservar los DPA de Supabase y Vercel (ambos los publican) |
| C6 | Solicitudes de titulares (ARCO/GDPR) → **reenviar de inmediato a Uber** y cooperar | DPA 1.6 | ⬜ | Procedimiento en el runbook: no responder al cliente final, reenviar a Uber |
| C7 | Requerimientos de autoridad sobre datos de Uber → informar a Uber cuanto antes | DPA 1.7 | ⬜ | Mismo procedimiento |
| C8 | Transferencias internacionales: cláusulas contractuales tipo si la ley lo exige | DPA 1.9 | — | Datos en Supabase (región definida en el proyecto); anotar la región en el aviso |
| C9 | **Programa de seguridad escrito** + políticas para detectar y prevenir brechas | DPA 2.1 | ⚠️ | Existe la auditoría cyber-neo (ago 2026) y `docs/seguridad/`; falta redactarlo como "programa" con dueño y revisión periódica |
| C10 | Acceso a los datos solo a quien lo necesite; revisar accesos periódicamente | DPA 2.2 | ⚠️ | RLS + roles del POS lo aplican para merchants; falta la lista de quién en VIM tiene acceso a producción (Supabase dashboard, service_role) y revisarla cada trimestre |
| C11 | Escaneo de vulnerabilidades, parches al día, antimalware en todos los sistemas que procesen datos de Uber | DPA 2.3 | ⚠️ | Dependabot/`pnpm audit` en CI; equipos de VIM con Windows Update + antivirus. Documentarlo |
| C12 | **Notificar a Uber en 24 horas** cualquier acceso no autorizado real o sospechado a datos de Uber | DPA 2.4 | ⬜ | Plan de respuesta a incidentes con el contacto de Uber (formulario de soporte de integraciones) y plantilla de aviso |
| C13 | Certificado anual de cumplimiento a petición de Uber (firmado por un directivo); negarlo es incumplimiento material | 3.2.2, TOU III.B | ⬜ | Tener listos los documentos C4–C12 para poder firmarlo |
| C14 | Auditoría de Uber máximo una vez al año, con aviso; si revela incumplimiento material, VIM paga la auditoría y corrige | 3.2.3, TOU III.E | — | Informativo; depende de C9–C12 |
| C15 | Indemnizar a Uber por pérdida, alteración o mal uso de datos personales de Uber | DPA 1.8 | — | Riesgo real. Es la única obligación **sin tope** de responsabilidad junto con las de 3.2.1 |

### D. Credenciales y confidencialidad

| # | Obligación | Cláusula | Estado | Dónde |
|---|---|---|---|---|
| D1 | Mantener íntegros passwords, logins, **tokens** y llaves; **no compartirlos con terceros, incluidos los merchants**, sin permiso escrito de Uber | 10.8, TOU II.C | ✅ | `client_secret` solo en Supabase Secrets; token de app en `delivery_credenciales_app` (deny-all para authenticated); tokens de merchant nunca salen al navegador |
| D2 | No incrustar credenciales en código abierto; no enmascarar identidad al llamar a la API | TOU II.C | ✅ | Repo privado; `.env.*` ignorados; el `client_id` es público por diseño |
| D3 | Tratar como confidencial la documentación, credenciales y comunicaciones de Uber | TOU VII.C | ⚠️ | El contrato y las capturas viven en este repo privado. **No publicar** el contrato ni los PDFs fuera del equipo |
| D4 | Tener **términos de uso y aviso de privacidad** visibles para los usuarios del producto | TOU III.A | ✅ | Sitio web de VIM POS tiene aviso de privacidad; los términos de servicio deben incluir B3 |
| D5 | Avisar a Uber por escrito si una brecha de nuestros términos/privacidad afecta a usuarios de Uber | TOU III.A | ⬜ | Mismo plan de incidentes que C12 |

### E. Límites de responsabilidad (para saber a qué nos exponemos)

- Ninguna parte responde por daños indirectos, y el **tope total es US$1,000** por parte (9)…
- …**excepto** por negligencia grave, dolo, indemnizaciones, confidencialidad y **cualquier
  incumplimiento de 3.2.1 (datos de Uber / autorización del merchant)**. Ahí no hay tope.
- Uber no garantiza nada: API "as is", puede caerse o cambiar (8, TOU X.C). Bajo los TOU, la
  responsabilidad de Uber es de **US$100**.
- Uber puede **revocar el acceso sin aviso** si considera que violamos los términos (TOU II.D,
  III.F) y puede **contactar a nuestros clientes** para avisarles (TOU VIII.A).
- Uber puede cambiar los TOU y el contrato unilateralmente (10.9, TOU XII); seguir usando la API
  implica aceptarlo. Conviene revisar la página de TOU cada trimestre.

## Estándares de calidad y rendimiento (cláusula 4.2)

Fuente: `../guias/quality-and-performance.md` (captura del 2 sep 2026). Lo que exige hoy:

**Obligatorio para integraciones de pedidos/tienda**
- Endpoints de gestión de integración: Activate, Retrieve Config, Remove. → A5
- Webhooks de notificación y de fallo de pedidos. → A4 ✅
- Flujo de pedido con POST explícitos Accept/Deny/Cancel y motivos soportados. → A3 ✅
- Endpoints de tienda: Get Store Status, Set Store Status, Update Prep Time. → A6
- **Rechazar el pedido si trae alérgenos o instrucciones especiales que no se puedan retransmitir
  al POS.** → A7

**Recomendado**: disposable items, alérgenos, instrucciones por ítem y por carrito, todos los
endpoints de Store y Order.

**Menu API (si la usamos, F4)**: soporte completo de la v2, con flags de instrucciones
especiales por ítem/pedido y categorías de impuesto donde aplique.

**Rendimiento**: **tasa de inyección ≥ 99.9 %** (pedidos aceptados / pedidos enviados), medida a
diario. Por debajo de 99 % Uber puede revocar el acceso o apagar tiendas. Implicaciones de
diseño ya tomadas: auto-aceptar por defecto, crear el ticket aunque la caja esté en otra pantalla,
y tener un producto genérico para ítems sin mapear para que **nunca** se pierda un pedido por un
mapeo. Pendiente: alerta cuando una sucursal rechaza o deja expirar pedidos (F1b, salud de tienda).

## Lo que hay que hacer a partir de este contrato (orden sugerido)

1. Guardar la copia **firmada** del contrato aquí y confirmar las casillas de APIs (Fermín).
2. Añadir a los **términos de servicio de VIM POS** la cláusula de apps de delivery (B3): el
   merchant autoriza a VIM a acceder a sus datos de Uber y acepta usarlos solo para operar sus
   pedidos. (La aceptación al conectar la tienda ya se registra desde F1b.)
3. Revisar el **copy del sitio y de ventas** para no prometer reemplazar la tablet de Uber (B1) ni
   presentarse como "socio" de Uber (B10).
4. Escribir el **plan de respuesta a incidentes** con el aviso a Uber en 24 h (C12, D5) y el
   procedimiento para solicitudes de titulares (C6, C7). Va en `docs/operacion/`.
5. Definir la **retención** de datos personales de pedidos de apps (C4) y programar el job.
6. ~~A5 (hecho en F1b)~~. Completar los endpoints de estado de tienda y tiempo de preparación (A6) y verificar alérgenos (A7).
7. Documentar subencargados, accesos a producción y el programa de seguridad (C5, C9–C11) para
   poder firmar el certificado anual (C13) sin sustos.
