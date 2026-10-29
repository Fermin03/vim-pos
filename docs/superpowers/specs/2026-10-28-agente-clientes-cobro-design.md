# Agente de WhatsApp — clientes: cobro, renovación y reactivación

Fecha: 28 oct 2026 · Autor: Claude con Fermín · Estado: APROBADO por Fermín (28 oct 2026)

Es la **fase 3** del diseño aprobado `2026-10-27-agente-whatsapp-design.md`; todo lo que este documento
no cambia sigue como dice ése (sobre todo §Herramientas, §Identificar al cliente, §Cobro y renovación
y §Seguridad). Las fases 1 (prospectos) y «el agente aprende» ya están en producción (PR #220, #221).

## Por qué

Hoy cada mensualidad pasa por Fermín: el cliente pregunta cuánto debe, transfiere, manda el
comprobante y Fermín lo registra en /platform y, si estaba bloqueado, lo reactiva a mano. Si Fermín
no está, el cliente se queda con la caja bloqueada. Éxito = un cliente puede escribir a cualquier
hora, pagar con tarjeta y tener su caja funcionando en minutos **sin que Fermín toque nada**.

## Alcance

**Entra (decisión de Fermín, 28 oct: «es lo necesario»):**
1. Identificar al cliente con un código enviado a su correo registrado.
2. Decirle cuánto debe y hasta cuándo.
3. Preguntar si quiere factura y, si sí, juntar sus datos fiscales para Fermín.
4. Cobrar con una liga de Mercado Pago de VIM.
5. Al confirmarse el pago: **registrarlo**, **renovar** la suscripción y **reactivar** la cuenta si
   estaba suspendida; confirmarle al cliente por WhatsApp.

**No entra (por ahora):**
- **Recordatorios de pago** antes de la fecha de cobro (el agente solo responde cuando el cliente
  escribe). Fermín lo pospuso; se diseña después.
- **Dudas de uso de la caja** («¿cómo canjeo un premio?»). Dependen del manual de uso que se escribe
  en otra sesión (`docs/manual/`). Cuando exista se conecta en una entrega aparte. Lo ya acordado
  para entonces: esas dudas no piden código; si algo falla, el agente prueba lo básico que diga el
  manual y luego pasa a Fermín como «Urgente: soporte».
- Registrar por WhatsApp pagos por transferencia: siguen en /platform como hoy.
- Cambiar de plan, agregar o quitar extras, cancelar: el agente pasa a Fermín.
- Timbrar la factura de VIM automáticamente (sigue siendo un pendiente para Fermín).
- Agenda con Google Calendar (fase 2 del diseño original; queda después de ésta).

## Lo que ya está decidido (diseño del 27 oct, decisiones de Fermín)

- Identidad: correo registrado + código de confirmación a ese correo. El número queda verificado
  **30 días** para ese negocio. Si el correo es dueño de varios negocios, el agente pregunta cuál.
  Nunca revela nada del negocio antes de verificar, y `pedir_codigo` responde igual exista o no el
  correo.
- Monto: **plan vigente (con su promoción) + extras contratados + IVA 16 %**, calculado por la
  herramienta desde la base; el agente nunca lo calcula. Lo vencido se cobra **todo junto**
  (`p_periodos = N`, máx. 12). Puede pagar **un periodo adelantado** si lo pide (`N + 1`). Sin plan,
  precio en 0 o sin suscripción activa → no cobra, pasa a Fermín.
- **Solo Mercado Pago** (liga de pago, 24 h). La comisión la absorbe VIM. No comparte la CLABE ni
  valida comprobantes: si el cliente dice que ya transfirió, pasa a Fermín con estado «Pago por
  confirmar» y, si está bloqueado, le ofrece la liga como camino inmediato.
- Factura: el agente pregunta antes de cobrar. Si sí, pide RFC, razón social, régimen fiscal, código
  postal y uso de CFDI (o la constancia de situación fiscal en PDF/foto; extrae los datos y se los
  confirma) y deja un pendiente «Factura por emitir». Si no, el comprobante es su mensaje de
  confirmación con folio (y el correo de Mercado Pago).
- Al pagar se reactiva sola; la caja se entera en su siguiente latido (≤10 min). Nunca se registra
  dos veces el mismo pago. Toda reactivación queda en la auditoría de /platform.
- El agente nunca nombra a Fermín ante el cliente: «un agente».

## Cómo funciona

### 1. Identificar

Herramientas `pedir_codigo(correo)` y `verificar_codigo(codigo)`.

- El correo se compara contra el **correo de acceso del dueño** de cada negocio
  (`tenants.usuario_dueno_id` → su usuario de Auth), sin importar mayúsculas. Negocios en
  estado `CANCELADO` no cuentan.
- Código de 6 dígitos, se guarda con hash, **expira en 15 min**, un solo uso, **5 intentos**. Cupos:
  3 códigos por número por hora y 5 por correo por día. El correo sale por `_shared/correo.ts`
  (el buzón de VIM que ya usa `correo-bienvenida`), con texto corto y sin datos del negocio.
- Al verificar, la conversación queda ligada al negocio por 30 días. Si el correo es dueño de varios,
  se guarda la lista verificada y el agente pregunta cuál por nombre comercial; desde ahí las
  herramientas solo aceptan negocios de esa lista.
- **Quién está verificado lo decide la base, no el modelo.** Las herramientas de cobro leen el
  negocio de la conversación en la base; el modelo nunca pasa un `tenant_id`.

### 2. Cuánto debe

`consultar_adeudo()` → plan, extras, subtotal, IVA, total, periodos vencidos, fecha que cubriría y
estado (al corriente / por vencer / vencido / suspendido). Reusa la lógica de
`packages/db/src/cobro.ts` (`precioVigente`, `totalMensual`, `estadoCobro`) para que el agente diga
exactamente lo mismo que «Plan y pagos» del dueño y que /platform. Si está al corriente, se lo dice
y le ofrece pagar el siguiente periodo por adelantado.

- **Cada periodo se cobra al precio de su propia fecha** (la fecha en que empieza ese periodo), no al
  de hoy. Así, un fundador con dos meses vencidos cuya promoción terminó ayer paga un mes a $499 y
  otro a $699, y uno que adelanta un mes que cae después de la promoción lo paga a precio de lista.
  El desglose lo muestra mes por mes cuando los precios difieren. *(Decisión del builder.)*
- Ciclo ANUAL: el precio guardado es el equivalente mensual; un periodo anual = 12 × el total al
  mes. El subtotal coincide con el «Total al mes» de «Plan y pagos» (sin IVA); el total suma el 16 %.

### 3. Factura

`guardar_datos_factura(...)`: guarda los datos fiscales en el intento de pago, después de
**confirmárselos al cliente**. Valida forma de RFC y código postal; el régimen y el uso de CFDI se
validan contra los catálogos que ya usa la facturación de VIM POS.

**En esta entrega los datos se piden por texto.** Hoy el agente no ve fotos ni PDF (le llegan como
«[imagen]» / «[document]»); leer la constancia de situación fiscal pide bajar el archivo y mandárselo
al modelo, y queda para una entrega posterior. Si el cliente manda la constancia, el agente le pide
los cinco datos por escrito; si prefiere no escribirlos, se guarda que mandó la constancia y Fermín
la toma de la conversación. *(Decisión del builder.)*

### 4. Liga de pago

`crear_liga_pago(periodos)`: crea un **intento de pago** (negocio, conversación, periodos, monto,
desglose, datos de factura, estado `PENDIENTE`, vence en 24 h, y la `proxima_fecha_cobro` que tenía
el negocio en ese momento) y una liga de **Mercado Pago de VIM** con `external_reference` = id del
intento. El monto lo calcula la herramienta en ese momento, nunca el modelo. Un intento pendiente y
vigente para el mismo negocio y periodos se reusa en vez de crear otro.

**Cómo se hace la liga** *(decisión del builder)*: **Checkout Pro con la API de preferencias**, que es
lo que recomendó el estudio del repo (`docs/integraciones/mercado-pago-checkout-pro/`). La tienda en
línea NO sirve de modelo: cobra con formulario propio (Secure Fields) sobre Orders API. La liga acepta **tarjeta sin meses, OXXO y transferencia SPEI** (decisión de Fermín, 28 oct: al
principio era solo tarjeta). OXXO y SPEI llegan pendientes y se aplican cuando Mercado Pago los aprueba,
aunque la liga ya haya vencido; la ficha de OXXO vence 2 días después de la liga. Depósito en banco (`atm`)
fuera. Necesita una **aplicación de Checkout Pro nueva** en la cuenta de Mercado
Pago de VIM. La primera tarea del plan es probarlo en el modo de prueba de Mercado Pago antes de
construir encima.

### 5. Pago confirmado

Función nueva con su propio webhook de Mercado Pago de VIM (firma `x-signature`, igual que
`_shared/tienda/aviso-mp.ts`):

1. Valida la firma → **vuelve a consultar la orden** a Mercado Pago (nunca confía en el aviso).
2. Si está pagada y el monto coincide con el del intento, en **una sola transacción**:
   - `registrar_pago_suscripcion(metodo='TARJETA', p_periodos=N, referencia=<id de la orden>,
     registrado_por=<usuario técnico del agente>)` → renueva (`proxima_fecha_cobro` avanza N
     periodos);
   - si el negocio estaba `SUSPENDIDO` **por falta de pago**, lo pasa a `ACTIVO` con el mismo efecto
     que «reactivar» en /platform (limpia `bloqueo_desde`, `bloqueo_mensaje`, `fecha_baja`,
     `motivo_baja`) y lo audita (ver «Solo se reactiva lo suspendido por falta de pago»);
   - marca el intento `PAGADO`.
3. Idempotente: hoy nada impide repetir una referencia en `pagos_suscripcion`, así que se agrega un
   índice único para los pagos con tarjeta (y el estado del intento también lo protege); un aviso
   repetido no hace nada.
   **Pago doble**: si la `proxima_fecha_cobro` del negocio ya no es la que tenía al crear el intento
   (por ejemplo, Fermín registró una transferencia a mano mientras el cliente pagaba la liga), no se
   registra en automático: pasa a Fermín como «Urgente: soporte» para que decida (aplicarlo como
   adelanto o devolverlo).
4. Avisa al cliente por WhatsApp: «Listo, quedó tu pago. Tu próxima fecha es el …» (+ «tu caja se
   desbloquea en unos minutos» si estaba suspendido; + «tu factura te llega por correo» si la pidió).
   Si ya pasaron 24 h desde su último mensaje, va con la plantilla `pago_confirmado`.
5. Si quiso factura → pendiente «Factura por emitir» para Fermín con los datos (aviso por el canal
   de avisos que ya existe y visible en /platform).
6. Si el monto **no** coincide o la orden trae algo raro → no registra nada, pasa a Fermín como
   «Urgente: soporte».

### Solo se reactiva lo suspendido por falta de pago

Decisión de Fermín (28 oct). Hoy el motivo de una suspensión es texto libre y no distingue «no
pagó» de «lo suspendí por otra razón» (abuso, un pleito, una pausa que pidió el cliente).

- Al **suspender** en /platform se elige el tipo: **Falta de pago** u **Otro motivo** (el texto
  libre se queda para el detalle). Se guarda en el negocio.
- Las suspensiones que ya existen antes de este cambio cuentan como **Otro motivo**: nada se
  reactiva solo hasta que Fermín lo marque. *(Decisión del builder.)*
- **Suspendido por otro motivo o `CANCELADO`:** `consultar_adeudo` lo dice y el agente **no cobra**,
  pasa a Fermín. Si aun así llega un pago (cambió entre la liga y el pago), se registra y renueva
  pero **no se reactiva**, y pasa a Fermín como «Urgente: soporte».

### Estados nuevos de la conversación

«Pago pendiente» (liga enviada), «Pago por confirmar» (dijo que transfirió), y lo que ya existe. Se
agregan a los estados permitidos de `wa_conversaciones`.

**No todo aviso pausa al agente.** Hoy `wa_pasar_a_fermin` siempre pausa. «Pago pendiente» y el
aviso de «Factura por emitir» son solo marcas/avisos: el agente sigue atendiendo. *(Decisión del
builder.)*

**«Ya transferí»** *(decisión del builder)*: si el negocio está bloqueado, el agente primero le
ofrece la liga como camino inmediato; si el cliente la quiere, se la manda y la conversación queda
en «Pago pendiente» sin pausa. Si no la quiere (o no está bloqueado), pasa a Fermín con «Pago por
confirmar», con la pausa de siempre. Si al final paga las dos cosas, lo detiene la regla de pago
doble.

## Seguridad

- Las tablas nuevas (códigos, verificaciones, intentos de pago) con RLS que niega todo salvo
  service_role, como el resto de `wa_*`.
- El modelo no puede: elegir el negocio, fijar el monto, registrar pagos ni reactivar. Solo pide
  códigos, consulta y crea ligas para el negocio verificado de su conversación.
- Nada del negocio sale antes de verificar; nada de otro negocio sale nunca.
- Credenciales de Mercado Pago de VIM como secretos nuevos; Fermín los carga con un script (nunca se
  pegan en el chat).

## Lo que hace Fermín

1. Cuenta de **Mercado Pago de VIM** con credenciales de producción y de prueba, y su secreto de
   webhook.
2. Plantilla de WhatsApp `pago_confirmado` (Utility, es_MX) para avisos fuera de las 24 h.
3. Probar de punta a punta con VIM Pruebas (con tarjetas de prueba de Mercado Pago y luego un pago
   real pequeño).

## Salida

Como las fases anteriores: migración aplicada a producción **antes** del merge, PR con CI en verde,
lista de lo que se publica y OK de Fermín antes de desplegar funciones y mezclar.

## Lo que se deja al builder

Nombres de tablas y funciones, esquema exacto, cómo reusar `cobro.ts` desde Deno, el usuario técnico
de `registrado_por`, el texto exacto de los mensajes (James revisa el tono) y cómo se ven en /platform
los intentos de pago y las facturas por emitir (mínimo: visibles en la conversación).
