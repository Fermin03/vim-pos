# Agente de WhatsApp de VIM — diseño

Fecha: 27 oct 2026 · Estado: borrador para aprobación de Fermín

## Por qué

El WhatsApp de soporte y ventas de VIM (+52 56 6508 3346) lo contesta Fermín desde la app WhatsApp
Business de su iPhone, **solo cuando está disponible**. Los prospectos se enfrían esperando y los
clientes activos se quedan atorados. Queremos un agente de IA que conteste al instante, 24/7, a
**todos**: prospectos y negocios que ya usan VIM POS, y que le pase a Fermín solo lo que de verdad
necesita a Fermín.

Éxito = ningún lead se pierde por falta de respuesta, los clientes pagan su mensualidad sin que
Fermín intervenga, y Fermín recibe pocas conversaciones, ya resumidas.

## Metas

1. **Prospectos**: explicar qué es VIM POS y cómo funciona, mandar la demo autoguiada
   (demo.vimpos.com.mx), y **agendar una cita** (presencial o llamada) en el calendario de Fermín.
2. **Clientes activos**: resolver dudas y **cobrar la mensualidad**: identificar al cliente, decirle
   su adeudo, cobrar y **renovar automáticamente**.
3. **Pasarle a Fermín** lo que el agente no debe o no puede resolver, con resumen, aviso a su
   número personal y un estado visible.

## No-metas (v1)

- No atiende a los comensales/clientes de cada restaurante (eso sería otro producto).
- No hace cambios en la cuenta del cliente aparte de registrar el pago y **reactivar** la cuenta
  suspendida que acaba de pagar (no cambia plan, no agrega extras, no toca cajas).
- No timbra la factura de la mensualidad en v1: toma los datos y la deja lista para Fermín.
- No escucha notas de voz: pide amablemente que se lo escriban.
- No manda campañas ni mensajes masivos (marketing) — solo responde a quien escribe, más el aviso a
  Fermín.

## Anti-metas (falla aunque "funcione")

- **Perder un lead.** Ante duda, el agente no improvisa ni deja colgado: toma datos y agenda, o pasa
  la conversación a Fermín.
- **Hablar de lo que no es VIM POS**: temas personales, política, ser un ChatGPT gratis. (También
  es requisito de Meta: §4.7 de sus condiciones prohíbe asistentes de IA de uso general.)
- **Revelar información no pública**: datos de otros clientes (ni nombres como Knock-Out, ni
  cuántos negocios hay), cómo está construido el sistema, costos internos, datos personales de
  Fermín. Solo dice lo que ya es público (sitio, materiales de venta).
- **Dar motivos para buscar otra opción.** VIM POS siempre es la opción ideal: no habla mal de la
  competencia ni le da la razón a «está caro»; regresa a lo que VIM resuelve y ofrece demo/cita.
- **Inventar funciones** que VIM no tiene. Si piden algo que no existe, lo anota y lo pasa.
- **Renovar una membresía con un comprobante falso.** Una foto de comprobante nunca basta.
- **Mostrar el adeudo o datos de un negocio a quien no demostró ser su dueño.**

## Decisiones tomadas por Fermín

| Tema | Decisión |
|---|---|
| Número | El mismo de soporte; Fermín **sigue usándolo en la app del iPhone** (coexistencia app + Cloud API). |
| Conexión a Meta | VIM se registra como **Tech Provider** de Meta (no BSP). |
| Identidad del cliente | Pide el **correo registrado** y manda un **código de confirmación a ese correo**; el cliente lo escribe en el chat. |
| Cobro | **Mercado Pago** (liga de pago, confirmación automática) como principal; **transferencia validada con Banxico (CEP)** como segunda opción. |
| Renovación | Automática al confirmarse el pago. |
| Agenda | **Google Calendar** (cuenta Gmail de Fermín; lo ve en la app Calendario del iPhone). Lunes a viernes, 9:00–12:00. |
| Citas presenciales | En el negocio del prospecto, solo **León, San Francisco del Rincón y Purísima del Rincón**. Fuera de ahí: llamada o videollamada. |
| Pasar a Fermín | **Mensaje a su número personal** + **estado/etiqueta** según cómo va el asunto. |
| Presupuesto IA | Crédito de Claude API de **100 USD/mes**. |
| Monto a cobrar | Lo que diga la base para ese cliente: **plan vigente + extras contratados + IVA 16 %**. El agente lo consulta (vía herramienta), nunca lo calcula de memoria. |
| Meses vencidos | Se pagan **todos juntos** en un solo cobro (N periodos). |
| Factura | **Depende del cliente**: el agente pregunta si quiere factura o solo comprobante de pago. |
| Comisión de Mercado Pago | La **absorbe VIM**. |
| Cuenta suspendida | Si paga por el agente, **el agente la reactiva** al confirmarse el pago. |
| Salida a producción | **Por partes**: cada fase sale cuando está lista. |
| «Negocio fundador» | El agente **la ofrece a prospectos nuevos** mientras esté abierta. |
| Avisos a Fermín | **Siempre de 9:00 a 18:00**, todos los días, incluso lo urgente; fuera de ese horario se encolan. |

## Hechos verificados que condicionan el diseño (investigación 27 oct 2026)

- **Coexistencia**: solo por Embedded Signup (v4) y siendo Tech Provider. Requiere WhatsApp Business
  ≥ 2.24.17. Se sincronizan 180 días de historial (24 h para hacerlo). Lo que Fermín escribe desde la
  app llega como webhook `smb_message_echoes`. Se pierden en la app: listas de difusión, mensajes
  temporales, «ver una vez», ubicación en vivo; WhatsApp para Windows deja de servir como
  acompañante. **Fermín debe abrir la app al menos cada ~13 días** o se desconecta. México no aparece
  en ninguna lista de exclusión, pero se confirma en el onboarding real.
- **Etiquetas de la app: la Cloud API no puede leerlas ni ponerlas.** El estado vive en nuestra base
  y se ve en /platform (ver §Pasar a Fermín).
- **Precios WhatsApp México (desde 1 oct 2026)**: lo que escribe el cliente es gratis; respuestas del
  agente dentro de 24 h: 1,000 gratis/mes por número, luego ~US$0.0085; plantilla de utilidad
  ~US$0.0085. Lo que Fermín manda desde la app es gratis.
- **Banxico CEP no tiene API oficial** y la página tiene captcha. La librería `cepmex` (Python, de
  Cuenca) usa los endpoints internos de la página: funciona pero puede romperse y es zona gris. Sólo
  hay CEP para SPEI entre bancos distintos y una vez que el banco receptor abonó.
- **Mercado Pago**: Checkout Pro sobre **Orders API** (`type:"online"`, `checkout_url`,
  `external_reference`, `expiration_time`), igual que la tienda en línea. Webhook con firma; siempre
  re-consultar la orden antes de creerle.
- **Claude**: Haiku 5.5 ≈ US$0.01–0.02 por conversación de 10 turnos con caché de 1 h; Sonnet 5.5 ≈
  US$0.15–0.25. Con 100 USD/mes alcanza para miles.

## Lo que ya existe en el repo (reutilizar)

- **Conocimiento público**: `sitio-web/*.md` (gemelos generados de cada página), `llms.txt`,
  `llms-full.txt`, `sitio-web/precios.md`, `sitio-web/novedades.md`, oferta «Negocio fundador» en
  `../docs/ESTRATEGIA-PILOTOS.md` §2. **Ojo**: el sitio puede ir atrasado respecto al producto
  (ej. `llms.txt` dice que no hay app de mesero); la verdad está en `docs/decisiones/` y novedades.
- **No existen guías de uso** del POS/panel (cómo cancelar un ticket, cargar menú, facturar,
  vincular caja…). Ver §Conocimiento.
- **Cobro**: `pagos_suscripcion` + `registrar_pago_suscripcion(...)` (0130, solo service_role; recorre
  `proxima_fecha_cobro` = la renovación) y `anular_pago_suscripcion`. ADR 0020 ya prevé que un cobro
  con tarjeta escriba aquí con `metodo='TARJETA'`. Adeudo/estado: `packages/db/src/cobro.ts`
  (`precioVigente`, `totalMensual`, `estadoCobro`). Datos bancarios de VIM: `datos_pago_plataforma()`
  (0141). Soporte: `soporte_plataforma()` (0142).
- **Identidad**: correo del dueño en `auth.users` vía `tenants.usuario_dueno_id` (no hay copia en
  `public`; hay que crear una función SECURITY DEFINER o usar `auth.admin`). Teléfono en
  `usuarios_perfil.telefono` (10 dígitos, sin +52, no único). Prospectos en tabla `prospectos`
  (estados NUEVO, CONTACTADO, DEMO_AGENDADA, GANADO, PERDIDO, SPAM).
- **Código de un solo uso**: patrón de `codigos_vinculacion_caja` (0285) +
  `_shared/cuenta-dispositivo.ts` (`generarCodigo`, `normalizarCodigo`) + `_shared/limite.ts`
  (cupos).
- **Correo**: `_shared/correo.ts` (`enviarCorreo`, SMTP Hostinger).
- **Mercado Pago**: `_shared/tienda/pago-mp.ts`, `aviso-mp.ts` (firma `x-signature`). Hoy solo
  existe MP **por restaurante**; para cobrarle a los clientes de VIM hace falta **la cuenta de
  Mercado Pago de VIM** con sus propias credenciales (secretos nuevos).
- **Convenciones**: Edge Functions con `_shared/http.ts` (`servir`, `clienteAdmin`), webhooks con
  `verify_jwt = false` declarado en `supabase/config.toml` y validación propia; secretos con
  `supabase secrets set`; pg_cron + `x-vim-interno` para tareas programadas.
- **No hay** integración con WhatsApp API ni con Claude API todavía.

## Cómo funciona

### Arquitectura

Todo vive en `vim-pos`, con el stack existente:

1. **Webhook de WhatsApp** (Edge Function, `verify_jwt=false`, valida `X-Hub-Signature-256`):
   recibe mensajes, ecos de Fermín (`smb_message_echoes`) y estados. Responde 200 rápido y procesa
   el turno (Meta reintenta si tarda).
2. **Cerebro**: llamada a Claude con un prompt de sistema (personalidad + reglas + conocimiento,
   cacheado) y **herramientas** (abajo). El modelo nunca toca la base directo: solo a través de las
   herramientas, que validan todo.
3. **Base**: tablas nuevas para contactos de WhatsApp, conversaciones, mensajes, verificaciones,
   intentos de pago, citas, pases a Fermín y «preguntas sin respuesta». Todas con RLS que niega todo
   salvo service_role; /platform las lee con su cliente service_role como el resto del panel.
4. **Webhook de Mercado Pago de VIM** (Edge Function aparte, firma propia).
5. **Vista en /platform**: «WhatsApp» con la bandeja de conversaciones, su estado y el historial.

### Herramientas del agente

| Herramienta | Qué hace | Reglas |
|---|---|---|
| `buscar_conocimiento` | Busca en la base de conocimiento | Solo contenido público aprobado |
| `pedir_codigo` | Recibe un correo; si es dueño de algún negocio, manda código de 6 caracteres a ese correo | Responde igual exista o no el correo (no revela quién es cliente). Cupos por número y por correo |
| `verificar_codigo` | Valida el código; liga el número de WhatsApp al tenant | Un solo uso, expira (15 min), máx. intentos |
| `consultar_adeudo` | Plan, monto vigente, próxima fecha de cobro, estado | Solo con número verificado |
| `crear_liga_pago` | Orden de Mercado Pago por el adeudo; devuelve `checkout_url` | Solo verificado; `external_reference` = intento de pago |
| `validar_transferencia` | Valida una SPEI con Banxico (CEP) | Ver §Cobro |
| `horarios_disponibles` / `agendar_cita` | Google Calendar | Ver §Agenda |
| `guardar_prospecto` | Crea/actualiza `prospectos` (negocio, giro, ciudad, cajas…) | — |
| `pasar_a_fermin` | Marca estado, pausa al agente y avisa a Fermín | Ver §Pasar a Fermín |
| `anotar_pregunta` | Guarda una duda que no supo responder | Alimenta las guías futuras |

### Identificar al cliente

1. El agente distingue prospecto vs cliente por la conversación (y si el número ya está verificado).
2. Cliente: pide el **correo registrado** → `pedir_codigo` → llega un correo con código →
   el cliente lo escribe → `verificar_codigo`.
3. El número queda **verificado 30 días** para ese tenant (no se pide en cada mensaje).
4. Si el correo es dueño de **varios negocios**, el agente pregunta cuál (por nombre comercial)
   después de verificar.
5. Nunca dice «¿eres Pablito N.?» ni nada del negocio antes de verificar.

### Cobro y renovación

**Mercado Pago (principal)**

**Cuánto se cobra** (decisión de Fermín): `consultar_adeudo` lee de la base el plan vigente (con su
promoción, p. ej. $499 de fundador), los extras contratados (`totalMensual` de
`packages/db/src/cobro.ts`), los periodos vencidos según `proxima_fecha_cobro` y el ciclo
(MENSUAL = 1 mes, ANUAL = 12), y suma **IVA 16 %**. Devuelve el desglose y el total; el agente solo
repite lo que devuelve la herramienta. Todo lo vencido se cobra junto (`p_periodos = N`, máx. 12 que
permite la RPC). El cliente también puede pagar **un periodo adelantado** si lo pide (decisión del
builder: `N + 1`). Si un cliente nunca activó suscripción o algo no cuadra (sin plan, precio en 0),
no cobra: pasa a Fermín.

**Factura o comprobante**: antes de cobrar, el agente pregunta si quiere factura. Si sí, pide RFC,
razón social, régimen fiscal, código postal y uso de CFDI (o la constancia de situación fiscal en
PDF/foto, de la que extrae los datos y los confirma), los guarda con el pago y crea un pendiente
«Factura por emitir» para Fermín. **Mi decisión**: en v1 el agente no timbra; timbrarla
automáticamente (VIM como emisor en Facturama) queda como fase posterior. Si no quiere factura, el
comprobante es el mensaje de confirmación con folio del pago (y el correo de Mercado Pago).

1. `consultar_adeudo` → «Tu mensualidad de <plan> + <extras> es de $X + IVA = $Y, vence el
   <fecha>».
2. `crear_liga_pago` → manda la liga por $Y (expira en 24 h). La comisión de MP la absorbe VIM.
3. Webhook de MP → valida firma → **re-consulta la orden** → si está pagada y el monto coincide con
   el del intento: `registrar_pago_suscripcion(metodo='TARJETA', p_periodos=N, referencia=<id orden
   MP>, registrado_por=<usuario del agente>)` → **si el tenant estaba suspendido, lo reactiva** (mismo
   efecto que «reactivar» en /platform: limpia `bloqueo_desde`; la caja se entera en su siguiente
   latido, ≤10 min) → el agente le confirma al cliente por WhatsApp con su nueva fecha de próximo
   cobro. Idempotente: el mismo pago nunca se registra dos veces. Toda reactivación queda en la
   auditoría de /platform y Fermín la ve en su resumen.

**Transferencia con Banxico (segunda opción)**

1. El agente comparte banco/CLABE de `datos_pago_plataforma()` y pide, tras transferir: fecha,
   clave de rastreo, banco emisor y monto. Si mandan foto del comprobante, **el agente la lee solo
   para prellenar** esos datos y los confirma con el cliente; la foto nunca es prueba.
2. `validar_transferencia` consulta CEP. Se acepta solo si: el receptor es la CLABE de VIM, el monto
   ≥ adeudo, la fecha es reciente, y **la clave de rastreo no se ha usado antes**.
3. Validada → `registrar_pago_suscripcion(metodo='TRANSFERENCIA', referencia=<clave de rastreo>)`
   y reactivación si estaba suspendido (igual que con MP). Si el monto es menor al total, no registra:
   le dice cuánto falta y pasa a Fermín.
4. **Si Banxico no responde o no hay CEP** (mismo banco, aún no abonado, la librería falla): el pago
   queda «por confirmar», el agente le dice al cliente a qué hora se confirma (dentro del horario de
   Fermín) y pasa a Fermín con estado «Pago por confirmar»; Fermín lo confirma con un clic en
   /platform y eso dispara el registro y la reactivación. **Mi decisión**: con transferencia sin
   validar el agente **no** reactiva (sería la puerta del comprobante falso); si el cliente está
   bloqueado, se le sugiere la liga de Mercado Pago como camino inmediato.

### Agenda

- Lunes a viernes, 9:00–12:00 (`America/Mexico_City`), citas de **30 min con 15 min de margen**.
- El agente ofrece 2–3 horarios libres (`freebusy`), el prospecto elige, se crea el evento con nombre,
  negocio, giro, teléfono y tema. Llamada/videollamada: con liga de Meet. Presencial: pide la
  **dirección del negocio** y la pone en la cita; solo León, San Francisco del Rincón y Purísima del
  Rincón.
- Marca al prospecto `DEMO_AGENDADA`. Recordatorio al prospecto el día anterior (plantilla de
  utilidad).
- Google: OAuth con refresh token de la cuenta de Fermín (app de OAuth en estado «In production» para
  que el token no caduque a los 7 días).

### Pasar a Fermín

Cuándo: no sabe la respuesta; piden descuento o algo comercial fuera de lo publicado; problema
urgente de operación (caja caída en servicio); queja o enojo; algo de dinero raro; lo pide el
cliente; un pago por confirmar.

Qué pasa:
1. La conversación toma un **estado**: «Prospecto caliente», «Cita agendada», «Pago pendiente»,
   «Pago por confirmar», «Urgente: soporte», «Duda sin respuesta», «Resuelto». Se ve en /platform.
2. **WhatsApp al número personal de Fermín** con: quién es, qué quiere, urgencia y un enlace a la
   conversación en /platform. (Plantilla de utilidad aprobada por Meta.) **Solo de 9:00 a 18:00,
   todos los días** (decisión de Fermín, aplica también a lo urgente): fuera de ese horario el aviso
   se encola y sale a las 9:00, juntando los pendientes en un solo mensaje (decisión mía).
3. El agente le dice al cliente cuándo le contesta Fermín («en un momento» dentro del horario;
   «mañana a partir de las 9» fuera), y **se calla en esa conversación**. Si es una caja caída fuera de
   horario, antes de pasar le da los pasos básicos que estén en la base de conocimiento.
4. **Cuando Fermín escribe desde su iPhone** (eco), el agente también se calla en esa conversación.
   Vuelve a contestar cuando Fermín la marca «Resuelto» en /platform o tras **12 h** sin que Fermín
   escriba.

### Conocimiento

- v1: el contenido público del sitio (`sitio-web/*.md`, precios, novedades), la oferta «Negocio
  fundador» (solo la parte pública de la oferta, no la estrategia interna) y una ficha de reglas del
  agente. Se arma como archivo(s) dentro del repo y se carga en el prompt de sistema (cacheado).
- Las dudas de uso que no sepa → `anotar_pregunta` + pasar a Fermín. **Con esa lista se escriben las
  guías de uso**, empezando por las más repetidas; cada guía nueva entra a la base de conocimiento.

### «Negocio fundador»

El agente la ofrece **a prospectos nuevos** (decisión de Fermín) mientras esté abierta. Mi decisión
de cómo: un interruptor «Oferta fundador abierta / cerrada» en /platform que el agente consulta; el
agente **nunca dice cuántos lugares quedan** ni cuántos clientes hay; explica la oferta pública
(mes 1 gratis, $499 hasta el mes 7, facturación incluida, VIM carga el menú, $699 congelado) y, si le
interesa, agenda cita / pasa a Fermín, que decide si el negocio califica. No promete el lugar.

### Tono

Español de México, de tú, cálido y breve: mensajes cortos, uno por respuesta (no ráfagas). Sin
tecnicismos. Se presenta como asistente de VIM POS (no finge ser Fermín).

### Modelo

Claude Haiku 5.5 por defecto; Sonnet 5.5 cuando la conversación se complica (cobro, objeciones,
enojo). Caché de 1 h para el prompt de sistema.

## Protecciones

- Firma de Meta y de Mercado Pago en sus webhooks; idempotencia por id de mensaje y de pago.
- Cupos: mensajes por número por hora/día; códigos por correo y por número; intentos de código.
- Tope de gasto mensual de Claude con alerta a Fermín al 80 %. **Mi decisión**: al 100 % o si la API
  de Claude falla, el agente manda un mensaje fijo («Gracias por escribir, en breve te contesta
  Fermín») y pasa la conversación; ningún mensaje se queda sin respuesta.
- «Acceso a la base y a /platform» (lo pidió Fermín) = el agente **lee** lo que necesita de la base
  (adeudo, plan, extras, estado) y **escribe** solo pagos, reactivación, prospectos, citas y estados,
  siempre a través de sus herramientas con service_role en el servidor. No tiene SQL libre.
- El modelo no puede saltarse las herramientas: las reglas de seguridad (verificado, monto,
  clave no repetida) viven en código, no en el prompt.
- Aviso de privacidad: el primer mensaje del agente a un número nuevo incluye la liga al aviso.

## Lo que hace Fermín (fuera del código)

1. Registrar a VIM como **Tech Provider**: verificación del negocio en Meta Business + app de Meta
   con revisión de permisos (`whatsapp_business_messaging`, `whatsapp_business_management`).
   Puede tardar semanas: **arranca primero**.
2. Actualizar la app WhatsApp Business del iPhone y conectar el número por Embedded Signup.
3. Aprobar las plantillas (aviso a Fermín, recordatorio de cita, pago confirmado si cae fuera de 24 h).
4. Credenciales de **Mercado Pago de VIM** y su webhook.
5. Autorizar Google Calendar una vez (OAuth).
6. Abrir la app WhatsApp Business al menos cada 13 días.

## Orden de construcción

**Sale a producción por partes** (decisión de Fermín): cada fase con su PR, migraciones aplicadas a
producción a mano **antes** del merge (regla del proyecto) y su despliegue de funciones.

1. **Prospectos**: webhook + cerebro + conocimiento + «Negocio fundador» + `guardar_prospecto` +
   `pasar_a_fermin` + ecos + avisos en horario + **bandeja mínima en /platform** (lista, estado,
   historial, marcar «Resuelto»), porque sin ella Fermín no ve los estados. Requisito para salir:
   **aviso de privacidad actualizado** (mencionar IA/Anthropic, Google Calendar, Mercado Pago y la
   verificación por correo; lo redacta James).
2. **Agenda**: Google Calendar.
3. **Clientes**: código por correo + `consultar_adeudo` + factura/comprobante + Mercado Pago +
   renovación + reactivación.
4. **Transferencias**: Banxico + «confirmar pago con un clic» en /platform.
5. **Pulido de /platform**: preguntas sin respuesta, facturas por emitir, interruptor de fundador,
   métricas.

Mientras Meta aprueba al Tech Provider, se puede desarrollar y probar con el **número de prueba** que
da Meta en la app de desarrollador.

## Lo que se deja al builder

Nombres de tablas y funciones, esquema exacto, cómo empaquetar la base de conocimiento, cómo portar
la consulta de CEP a Deno/TypeScript (o correrla en otro lado), cómo reusar `cobro.ts` desde Deno,
el usuario técnico que firma `registrado_por`, el texto exacto del prompt (James revisa el tono), y
cómo se ve la bandeja en /platform (siguiendo `docs/diseno/` y tokens).
