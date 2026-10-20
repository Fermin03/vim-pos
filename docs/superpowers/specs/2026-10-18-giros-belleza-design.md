# Giros de belleza — diseño

**Fecha:** 18 oct 2026 · **Estado:** completo, para aprobación de Fermín · **Grupo:** 2 de 3 antes de producción
(retail ✔ → **belleza** → servicios). Fermín cambió el orden el 18 oct: belleza va antes que servicios.

Bocetos aprobados por Fermín («los dejaría como están»): `docs/superpowers/bocetos-belleza/`
(`1-calendario.png`, `2-cobrar.png`, `3-cita.png`). Referencia visual: Square Appointments, con el
design system de VIM POS (`packages/ui/tokens.css`, `docs/diseno/`).

## 1. Para qué

VIM POS deja de ser solo para restaurantes y tiendas: entra a salones, spas, peluquerías, barberías y
estudios de tatuajes. Lo que más le complica hoy a un dueño de estos negocios, en palabras de Fermín,
es **«la administración, atención y recepción de citas»**. El centro del producto es la **agenda**; el
cobro, las comisiones y el inventario van alrededor.

**Éxito:** un salón con 3–4 colaboradores recibe citas en línea y por teléfono, no empalma a nadie,
cobra en la caja con el anticipo descontado y al final de la semana sabe cuánto le toca a cada quien.

## 2. Giros

| Código (propuesta) | Nombre visible |
|---|---|
| `SALON` | Salón de belleza |
| `SPA` | Spa |
| `PELUQUERIA` | Peluquería |
| `BARBERIA` | Barbería |
| `TATUAJES` | Tatuajes y piercings |

Los cinco usan la misma caja de belleza. Se agregan al enum `vertical_tipo` con `ADD VALUE` (va en un
instalador antes de usarse, como 0188/0205) y se liberan al final con su propia migración (molde: 0203,
0215). Un `es_giro_belleza()` / `esGiroBelleza` a la par de `es_giro_tienda`.

## 3. Lo que decidió Fermín

**Citas y reservación**
- La clienta llega **con o sin cita**. Al reservar puede **elegir colaborador o «quien esté libre»**.
- Se reserva **de las dos formas**: la clienta sola en línea, o el salón la anota en la caja.
- **Tolerancia** que define el dueño; pasada, la cita se marca «No llegó» y el lugar se libera para
  alguien **en espera** (los que llegaron sin cita).
- **Espacios** (sillas, cabinas, salas, mesas de uñas): la agenda no deja empalmar ni al colaborador
  ni al espacio. Se dan de alta como las mesas, sin plano.
- La clienta **puede cancelar o cambiar su cita sola** desde el enlace del correo **dentro del límite
  que pone el dueño**; fuera de él, solo el salón.

**Avisos**
- Confirmación y recordatorio **por correo, automáticos**.
- WhatsApp **con botón** («Recordar por WhatsApp» abre WhatsApp con el mensaje escrito, como las
  cotizaciones). El WhatsApp automático (API de Meta, cobra por mensaje) queda **para después**.

**Cobro**
- Cuándo se cobra **lo define el dueño**: al final, anticipo al apartar, o todo por adelantado. El pago
  en línea usa el **Mercado Pago de la tienda en línea**.
- Si la clienta cancela a tiempo, o cancela el salón, **el anticipo se devuelve** (completo).
- **Productos** (shampoo, ceras…) se venden en la misma caja: dentro de la cuenta de una clienta o
  en una venta suelta. **Con inventario** (las existencias de las tiendas, ADR 0037).

**Servicios y precios**
- Precio y duración **los decide el dueño**: base por servicio y, si quiere, propios por colaborador.
  Al cobrar se puede ajustar.

**Colaboradores**
- Se les paga **mezcla: sueldo + comisión**, y **VIM POS lleva la cuenta**.
- Comisión **solo por servicios**, o también por productos **si el dueño lo activa**.
- Pueden trabajar **las dos formas**: todo desde la recepción, o cada uno con su vista en el celular.
- **Colaborador y dueño ven las comisiones** (cada colaborador solo las suyas).

- **Cómo se calcula la comisión lo decide el dueño:** porcentaje o monto fijo, y si se calcula sobre lo
  cobrado (con descuentos, sin IVA) o sobre el precio de lista. Se configura por servicio, con
  excepción por colaborador.

**Reserva en línea con varios servicios** (Fermín, 18 oct)
- Una reserva en línea **puede llevar varios servicios**, cada uno con su colaborador (o «quien esté
  libre»). *Mi propuesta de cómo:* los servicios van seguidos, en el orden que eligió la clienta, y el
  sitio solo ofrece las horas de inicio donde toda la cadena cabe (cada colaborador y espacio libre en
  su tramo).
- **«Quien esté libre» se asigna solo** al reservar: al colaborador libre con menos citas ese día; la
  recepción lo puede cambiar.

**Tatuajes**
- En línea se reserva una cita de **cotización/valoración**; **las sesiones las agenda el dueño a
  mano** (una o varias).

**Sitio de reservas**
- Un sitio que **el dueño personaliza**, como la tienda en línea de restaurantes (referencia: la página
  de Square con logo, dirección, mapa, servicios por categoría y «Reservar»).
- **Dirección `online.vimpos.com.mx/<negocio>`**, y **todo** se muda ahí: la tienda en línea de
  restaurantes también. `pedidos.vimpos.com.mx` redirige a la nueva para no romper enlaces.

**Planes**
- **Los mismos tres planes** (Esencial · Negocio · Cadena), sin plan por giro (ADR 0002).
- **Igual que la tienda en línea**: en Esencial el sitio de reservas **se cobra aparte**; en los demás
  va **incluido**. La agenda, las comisiones y la caja van en todos los planes.

## 4. Cómo se ve (bocetos)

**Barra de la caja:** Calendario · Cobrar · Clientes · Transacciones · Más.

1. **Calendario** (`1-calendario.png`): días de la semana arriba, una columna por colaborador, línea
   de la hora actual, citas con color del colaborador y su estado (Por llegar · Atendiendo · Cobrada ·
   No llegó). Arriba: «N en espera», «Colaboradores · Espacios» (filtro/vista) y «+ Nueva cita».
2. **Cobrar** (`2-cobrar.png`): a la izquierda, pestañas *Citas de hoy · Servicios · Productos*; la
   lista de citas va en grupos *Termina pronto · En espera (sin cita) · Cobradas hoy*. A la derecha, la
   venta: la clienta arriba (visitas, última visita, puntos), renglones con colaborador y espacio,
   anticipo descontado y «Cobrar $…». Es la caja de tienda (50/50, «⋯» con nota, descuentos, cliente).
3. **Ficha de cita** (`3-cita.png`, modal al 80 %): estado con tolerancia, clienta (teléfono, correo,
   faltas), fecha y horario, cómo reservó y anticipo, servicios con colaborador/espacio/duración, nota.
   Acciones: *Llegó · empezar*, *Recordar por WhatsApp*, *Mover de horario*, *No llegó · liberar
   lugar*, *Cancelar cita*.

**Clientes:** ficha con visitas, servicios anteriores y con quién, notas (alergias, preferencias),
faltas y puntos de lealtad; desde ahí se agenda.

**Vista del colaborador (celular):** entra con su usuario al POS en el navegador; ve **solo su agenda**
(hoy y próximos días), marca *Llegó/empecé* y *Terminé* (al terminar, la cita sube a «Termina pronto» en
Cobrar de la recepción) y ve sus comisiones del día y de la semana. **No cobra.**

**Admin del dueño:** servicios (precio/duración base y por colaborador), colaboradores (horario por
día, comida, días libres/vacaciones, sueldo y comisión), espacios, reglas (tolerancia, límite para
cancelar, cuándo se cobra/anticipo, comisión por productos sí/no, periodo de comisiones semanal o
quincenal), y el sitio de reservas.

**Reportes:** ventas por colaborador y por servicio, comisiones por periodo (sueldo + comisiones = lo
que le toca), citas atendidas / canceladas / faltas, ocupación de la agenda.

## 5. Lo que ya existe y cómo se usa

- **`reservaciones` (0010) NO se reutiliza** para citas: está atada a mesas y comensales, sin
  colaborador, servicio ni espacio, y sin candado contra empalmes. Las citas son tablas nuevas. *(Mi
  decisión; el constructor puede reconsiderarlo si encuentra una razón fuerte.)*
- **Caja de tienda** (feat/retail-*): la pantalla Cobrar de belleza parte de ella (50/50, «⋯», barra
  inferior, sección «Más»). Productos con existencias y escáner, igual.
- **Empleados:** `usuarios_perfil` + `usuarios_acceso` + roles (0004). Un colaborador es un empleado
  con agenda; el rol/subtipo exacto lo decide el plan.
- **Tienda en línea** (`apps/tienda`, ADR 0032): el sitio de reservas vive en esa app (mismo
  dominio, mismo patrón de slug, Mercado Pago, correos por estado, complemento de pago). Sus clientas
  no viven en Auth (como los comensales de la tienda); el sitio de reservas **no pide cuenta** —
  nombre, celular y correo, y el enlace del correo para cancelar o cambiar. *(Mi propuesta.)*
- **Devolución de Mercado Pago:** hoy solo existe la devolución **completa** (`pago-mp.ts`), que es
  justo lo que pide la regla del anticipo.
- **Lealtad** (0156): los servicios suman puntos como cualquier venta.
- **Clientes** (`clientes`): ya tiene teléfono, correo y `notas_internas`.

## 6. Reglas que el constructor no debe romper

- **Nada de empalmes:** ni el mismo colaborador ni el mismo espacio en dos citas que se cruzan. La
  regla vive en la base (candado), no solo en la pantalla, porque reservan dos canales a la vez.
- **La reserva en línea solo ofrece horarios libres** según horario del colaborador, días libres,
  citas existentes y espacio que el servicio necesita.
- **Restaurantes y tiendas no cambian.**
- **Todo en local** hasta que retail, belleza y servicios estén al 100 %: sin push, PR, merge,
  `db push`, despliegues ni instalador.
- La caja instalada (escritorio, sync por snapshot) también agenda y cobra citas: las tablas nuevas
  viajan por el sync como las demás.

## 7. Fuera de alcance (por ahora)

- WhatsApp automático (API de Meta).
- Pagar la nómina: VIM POS calcula lo que le toca a cada quien, no deposita.
- Devoluciones parciales del anticipo.
- Consentimientos firmados y proyectos de varias sesiones con precio global (tatuajes): las sesiones
  se agendan a mano; si piden precio por escrito, se usan las cotizaciones de retail. *(Propuesta mía.)*
- Báscula, terminal y cualquier hardware.
- Sitio de VIM y PDF de prospectos: al final de los tres grupos.

## 8. Mis decisiones (Fermín puede corregirlas)

- **Si la clienta cancela fuera de tiempo o no llega, el salón se queda con el anticipo.**
- **Sin tope de colaboradores por plan** (Fermín: «dejémoslo como te dije»).
- Códigos de giro de la tabla del §2.
- Sitio de reservas sin cuenta de clienta.
- Citas en tablas nuevas, no en `reservaciones`.
- Un mismo servicio pide **un tipo de espacio** (o ninguno); el sistema asigna uno libre de ese tipo.
- Colores del calendario: uno por colaborador, de una paleta fija que respete contraste.
- **«No llegó» es manual.** Pasada la tolerancia, la cita se pinta en rojo («Pasó la tolerancia») y la
  recepción toca «No llegó · liberar lugar». Nada se marca solo (no hay reloj que corra en la caja
  apagada, y no se queda un anticipo sin que alguien lo decida). Cuenta como falta de la clienta.
- **Empalmes entre la caja sin internet y el sitio en línea.** El sitio reserva contra la nube; la
  caja instalada reserva en su base y sube en el sync. Si al sincronizar dos citas chocan, **se quedan
  las dos** marcadas «Empalme» en el calendario y la recepción mueve una. No se borra ni se cancela nada
  solo. (Con la caja en línea, el candado de la nube evita el choque.)
- **Anticipo:** monto fijo o porcentaje, lo elige el dueño, por servicio. Pagado en línea se devuelve
  por Mercado Pago; pagado en la caja (efectivo/tarjeta) se devuelve como una devolución normal de la
  caja. Si el salón se lo queda, entra al corte como venta («Anticipo no reembolsable»). Se factura en
  el ticket final; **sin CFDI de anticipo** en esta versión.
- **Sueldo:** monto fijo por periodo (semanal o quincenal) que pone el dueño. VIM POS no descuenta
  faltas ni vacaciones; el dueño ajusta a mano si quiere.
- **Comisión de una cita «quien esté libre» o con cambio de colaborador:** es de quien la atendió
  (el colaborador del renglón al cobrar). Un anticipo perdido no genera comisión.
- **Un solo complemento «En línea»** para Esencial cubre la tienda y las reservas (un negocio usa una
  u otra según su giro).
- **La mudanza a `online.vimpos.com.mx`** se construye en local en la entrega 3 (constantes, secretos y
  redirección documentados); en producción es un paso del lanzamiento, con la redirección desde
  `pedidos` el mismo día. Los restaurantes no notan nada hasta entonces.
- **Rama base:** encima de `feat/retail2-barra` (retail completo en local); migraciones desde la 0216.

## 9. Entregas propuestas

1. **Agenda:** giros nuevos, servicios, colaboradores con horario, espacios, citas sin empalmes,
   calendario, lista de espera, tolerancia y «No llegó», ficha de cita, Clientes, recordatorio por
   WhatsApp con botón. Barra de belleza.
2. **Cobro y comisiones:** Cobrar desde la cita (servicios + productos), anticipo descontado, comisiones
   (servicios y opcional productos), periodo y cálculo sueldo + comisión; reportes de ventas por
   colaborador y servicio.
3. **Reservas en línea:** dominio `online.vimpos.com.mx` (y la mudanza de la tienda con redirección),
   sitio personalizable, reservar sin cuenta, anticipo con Mercado Pago y devolución, correos de
   confirmación y recordatorio, cancelar/cambiar dentro del límite; complemento en Esencial.
4. **Colaborador en el celular y cierre:** vista del colaborador, reportes restantes (citas, faltas,
   ocupación), registro de los giros en alta/registro/platform/prospectos y migración de liberación.

Cada entrega lleva su propio plan.

## Entrega 1 (agenda), hecha (18 oct)

Giros de belleza en la base, servicios, colaboradores, espacios, citas sin empalmes, calendario, espera,
ficha, Clientes y la barra de belleza. Todo en local. Diseño de la caja: `docs/diseno/pos-belleza.md`;
decisión: ADR 0038.

**Migraciones**

- **0216:** solo `ADD VALUE`: los 5 giros (SALON, SPA, PELUQUERIA, BARBERIA, TATUAJES). Va aparte porque
  Postgres no deja usar un valor de enum en la misma transacción que lo crea.
- **0217:** `btree_gist`, `es_giro_belleza`, el juego inicial de los giros (con el módulo `agenda`),
  los 5 giros bloqueados en `cambiar_giro`, y el backfill que pone `agenda: false` en
  `tenants.operacion` de todos los negocios existentes.
- **0218:** enums `cita_estado` y `cita_canal`, tolerancia en `configuracion_tenant`, las tablas
  (`tipos_espacio`, `espacios`, `servicios_agenda`, `colaboradores_agenda`, `servicio_colaborador`,
  `horarios_colaborador`, `ausencias_colaborador`, `citas`, `citas_servicios`), los candados `EXCLUDE`
  de empalme por colaborador y por espacio, las RPC (`guardar_cita`, `colaborador_libre`,
  `agregar_en_espera`, `atender_cita`, `terminar_cita`, `marcar_no_llego`, `cancelar_cita`,
  `resolver_empalme`, `faltas_cliente`) y `modulos_efectivos` publicando `agenda`.
- **0219:** sync. `sync_pull_snapshot` baja catálogo y citas (últimos 7 días y las en espera);
  `sync_push_snapshot` acepta citas y tramos de la caja (el catálogo desde la caja se ignora);
  `_agenda_choques` y las reglas de empalme: un choque al subir marca ambas citas, no borra ni cancela;
  `resolver_empalme` quita la marca.
- **Admin:** `/agenda/servicios`, `/agenda/colaboradores`, `/agenda/espacios` y `/configuracion/agenda`.
- **Caja y escritorio:** barra de belleza, calendario, cita, ficha, espera y Clientes; el sync de
  escritorio sube citas por huella y baja el catálogo.

**Para el lanzamiento**

- **Orden:** 0216 → 0219 en la nube, a mano y **antes del merge** (la regla de siempre), sin esperar
  a las cajas. Después, el instalador con 0216–0219. Una caja vieja no se rompe: el pull escribe en
  réplica (el disparador de `tenants.operacion` no corre en la caja, así que la llave `agenda` no da
  error), ignora las tablas y llaves que no conoce, y su push no manda citas.
- **La compuerta real es el enum de la 0216.** Un `vertical_principal` de belleza sí tumba el pull de
  una caja sin la 0216; por eso `cambiar_giro` bloquea los cinco giros (`GIRO_NO_DISPONIBLE`). La
  migración de liberación (entrega 4) se aplica solo cuando todas las cajas en uso ya tengan el
  instalador con la 0216.
- `btree_gist` existe en el Postgres embebido de la caja instalada (verificado en
  `@embedded-postgres/windows-x64`).
- Los giros nuevos no se ofrecen en el registro y siguen bloqueados en `cambiar_giro` hasta la entrega 4.
  Para probar en local, el negocio se pone en SALON por SQL.

**Rulings de este plan (Fermín puede corregirlos)**

- En la caja, con colaborador elegido, se puede agendar **fuera de su horario o en su ausencia** (la
  recepción manda). «Quien esté libre» y la reserva en línea (entrega 3) sí los respetan.
- Con colaborador elegido solo se exige que esté activo en la sucursal y siga siendo empleado (acceso
  activo, perfil sin borrar); no que ofrezca ese servicio. A un empleado dado de baja no se le agenda
  por ningún camino; sus citas siguen a la vista (columna «Sin colaborador»).
- «Quien esté libre» mide a cada candidato con su propia duración del servicio.
- Mover, cancelar o marcar «No llegó» una cita, por la nube o por la caja, le quita la marca de empalme
  a la que chocaba con ella si ya no choca con nada.
- Un servicio sin tipo de espacio no ocupa espacio.
- El calendario muestra el día; la semana es la tira para cambiar de día (sin vista semanal completa).
- «Cobrar» en la barra de belleza es la caja de tienda de hoy hasta la entrega 2.
- Sin el módulo `agenda`, la caja de belleza se comporta como tienda.

**Quedó para después / avisos para Fermín**

- **Clave SAT de los servicios de belleza:** hoy es NULL y cae en 90101500 (la de restaurantes). Decidir
  en la entrega 2 (cobro y factura).
- **Clienta nueva sin teléfono:** la cita lleva solo el nombre y no se registra en Clientes (el modal lo dice).
- **Último push gana:** si la caja y la nube editan la misma cita, queda lo que subió al final.
- **`ticket_id` no lo actualiza el sync** al subir una cita; entrega 2.
- **Carrera en «quien esté libre»:** si dos recepciones piden al mismo tiempo, la segunda recibe el
  mensaje del colaborador ocupado. El candado decide bien; solo el texto es el del colaborador.
- Sin carriles para citas que se cruzan en el calendario, sin vista por espacio y sin
  «Colaboradores · Espacios» del boceto.
- Menores de la revisión: nombres de color sin `aria-label` en el admin, fechas del admin por regex,
  guardar y borrar horarios no es atómico, los inactivos no se ven en el admin.

## Entrega 2 (cobro y comisiones), hecha (19 oct)

Cobrar la cita en la caja, colaborador por renglón, comisiones y sueldo, anticipos y sus reportes. Todo
en local. Diseño de la caja: `docs/diseno/pos-belleza.md`; del panel: `docs/diseno/admin.md`; decisión:
ADR 0039.

**Migraciones**

- **0220:** solo `ADD VALUE`: `cita_estado` COBRADA y `metodo_pago` ANTICIPO. Va aparte por la misma
  razón que la 0216.
- **0221:** colaborador por renglón, regla de comisión congelada en `ticket_items` (disparador),
  columnas de comisión y anticipo en servicios y en la configuración, sueldo, `periodo_comisiones`,
  `vw_comisiones_renglon`, `vincular_cita_ticket` y la cita COBRADA al pagar (vuelve a TERMINADA si el
  ticket se cancela).
- **0222:** `anticipos_cita`, `registrar_anticipo`, `anticipo_sugerido`, `pagar_con_anticipo`,
  `devolver_anticipo`, `retener_anticipo`, la guardia de pagos ANTICIPO y el corte (X, arqueo y
  efectivo esperado suman los anticipos recibidos).
- **0223:** sync del cobro: anticipos y citas COBRADA por la caja, venta pendiente de deshacer,
  conflictos registrados en `sync_eventos`.

**Para el lanzamiento**

- **0216–0223 a la nube a mano y antes del merge, en orden y cada archivo en su propia transacción
  (0220 confirmada antes de 0221).** Después, el instalador con 0216–0223.
- Una caja vieja no se rompe con la nube nueva (no baja pagos ni citas); solo no tiene la función.
  Ningún negocio debe usar anticipos ni el cobro de citas mientras sus cajas no tengan el instalador.

**Rulings de este plan (Fermín puede corregirlos)**

- La comisión se calcula al leer, con la regla congelada en el renglón; no hay tabla de comisiones.
- Base COBRADO: resta también el descuento a nivel ticket (y el canje de lealtad), prorrateado entre
  renglones. LISTA no incluye modificadores.
- El anticipo vuelve a VIGENTE al cancelar una venta sin pagar, y al cancelar o devolver una pagada
  regresando el dinero por EFECTIVO o MISMO_METODO_PAGO (primero la parte pagada con anticipo); con
  CORTESIA, VALE, NOTA_CREDITO o sin devolver dinero queda APLICADO.
- Devolver o retener un anticipo, con cualquier método, exige `venta.devolucion` o el PIN de un
  supervisor, en un turno abierto de la caja que lo hace.
- Editar un renglón conserva su colaborador (precio y regla de comisión).
- El anticipo se aplica al confirmar el primer pago, no al abrir el cobro.
- Una cita cancelada con anticipo VIGENTE sigue visible (calendario y Cobrar) hasta resolverlo.
- Los conflictos del sync se registran en `sync_eventos`; gana la nube, y la caja reintenta cuando
  deshace algo que la nube aún no ve.
- El sueldo solo se suma con un periodo exacto; los productos pueden ir sin colaborador (sin comisión).
- Un servicio sin cita no toma colaborador en silencio: se pregunta o queda en «Elige quién lo hizo».

**Quedó para después / avisos para Fermín**

- **Anticipo retenido:** ese dinero se recibió y no se factura (no es venta ni entra a la factura
  global). Verlo con el contador.
- **Clave SAT por defecto de belleza:** sin elegir clave el servicio sale como 90101500 (restaurante).
  Definir con el contador la clave por defecto.
- **Comisión LISTA sin modificadores:** lo dice el spec; el texto del admin no promete más.
- **Reportes de comisiones sin filtro por sucursal:** la vista no trae `sucursal_id`.
- **Sync, caso raro entre lotes:** si el lote del recobro de una cita llega antes que la cancelación
  de su primera venta, la nube rechaza la cita y su anticipo y la caja los reintenta; entran cuando
  sube la cancelación (smoke de sync, paso 12). Si la cita quedó cobrada y pagada en dos cajas, o
  cobrada en la caja y cancelada en la nube, es un conflicto final: la nube conserva la suya y lo
  anota en `sync_eventos` (sin aviso en el panel todavía).
- **Conflictos del sync en el panel:** un anticipo resuelto en dos cajas (o una cita cobrada dos
  veces) solo queda en `sync_eventos`; la venta de la otra caja queda pagada con un ANTICIPO que la
  nube no aplicó. Falta mostrarlo en el panel.
- La barra del ticket no muestra el anticipo (solo el modal de cobro).

**Pendientes de sync que quedaron abiertos (casos raros, revisión final del 19 oct):**
- Si la nube rechaza en el mismo lote la venta de una cita cobrada, la cita se toma como copia vieja y el anticipo se rechaza en cada envío. Hay que tratarlo como reintento.
- `_cita_cobro_en_conflicto` decide «misma caja» por `caja_id`. Un cobro desde el POS web y otro de la caja sin internet de la misma cita pueden reintentar sin fin, o marcarse como conflicto final antes de tiempo.
- Los conflictos solo quedan en `sync_eventos`; falta mostrarlos en el panel.

## Entrega 3 (reservas en línea), hecha (19 oct)

Sitio de reservas en la tienda, anticipo con Mercado Pago, correos, y panel «En línea». Todo en local.
Diseño: `docs/diseno/tienda.md`; decisión: ADR 0040; textos de la clienta: `docs/legal/reservas-terminos-para-la-clienta.md`.

**Migraciones**

- **0224:** reglas de reserva en `configuracion_tenant`, `servicios_agenda.en_linea`, columnas de
  `citas` (enlace, `pago_hasta`, `reservo_email`, `cancelada_por`), módulo `reservas`, RPC de huecos,
  reservar, ver, mover y cancelar, y el barrido de reservas vencidas.
- **0225:** pago de cita en `tienda_pagos` (`cita_id`), anticipo `PAGO_EN_LINEA` sin turno, reembolso
  automático y devolución en efectivo del sobrante.
- **0226:** cola de correos de cita (confirmación, cambio, cancelación y recordatorio).

**Orden de lanzamiento**

1. **0188–0223 primero** (retail y belleza 1–2, que tampoco están en la nube), en orden. 0225 busca el
   CHECK de `anticipos_cita` que crea 0222.
2. **Después 0224–0226 a la nube a mano y antes del merge**, en orden y cada archivo en su propia transacción.
3. **Desplegar `tienda`, `tienda-correos` y `tienda-webhook-mp` antes del merge.**
4. **Mudanza de dirección, también antes del merge:** los pasos 1–6 de `docs/operacion/mudanza-online.md`
   (DNS de `online`, dominio `online` + `pedidos` en el proyecto `vim-tienda` de Vercel, hostname en el
   widget de Turnstile, `TURNSTILE_HOSTNAMES` con `online`, `admin` y `pedidos`, `VIM_TIENDA_URL` y
   `VIM_TIENDA_SECRET`). El merge despliega solo el redirect 308 de `pedidos` a `online` y los enlaces
   del admin: si va primero, la tienda pública se cae. Todo esto, cuando Fermín lo pida.
5. **Merge.**
6. **Textos legales de reservas:** Fermín revisa el borrador antes de enlazarlo.

**Un solo instalador de belleza.** Las migraciones de belleza 0216–0226 salen juntas en UN instalador de la
caja. Una caja con 0222/0223 pero sin 0225 no ve el anticipo pagado en línea (el pull lo aísla) y cobraría la
cita completa. Por eso la migración que libera los giros de belleza (entrega 4) corre en la nube solo
después de publicar ese instalador: no puede existir un salón con una caja sin 0225. Una caja de otro giro
no se rompe: no usa nada de esto. Nada sale a clientas hasta que estén los servicios (entrega 4) y Fermín
lo apruebe.

**Rulings de este plan (Fermín puede corregirlos)**

- Correo y celular obligatorios al reservar. El lugar se aparta 15 minutos mientras se paga el anticipo.
- No se reserva en línea con menos de 2 horas; cambiar o cancelar, 24 horas o más.
- Tope de 3 citas futuras por teléfono.
- Reembolso automático solo si cancela la clienta en línea a tiempo y Mercado Pago cubre todo el anticipo.
- La clienta queda en Clientes por su teléfono.

**Para Fermín**

- **Textos provisionales:** los de la reserva, los correos y el panel están marcados para que los pase James (lista pendiente).
- **Reembolsos fallidos** se resuelven a mano desde la cuenta de Mercado Pago; no hay botón.
- **Páginas de privacidad y términos de un salón sin tienda:** hoy no se enseñan enlaces (esas
  páginas leen la tienda). Decidir cuál se muestra.
- **Una cita apartada en pago abandonado** queda 15 minutos y cuenta para el tope de 3.
- **Pruebas en local:** las funciones se sirven desde el worktree (`supabase functions serve`) con
  `CAPTCHA_OPCIONAL=1` y sin `TURNSTILE_SECRET_KEY`; la app sin `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
  Deno no está instalado: las pruebas de las funciones no corren aquí.
- **Recordar:** nada sale hasta tener todos los servicios (entrega 4).

## Entrega 4 (celular, reportes y liberar), hecha (20 oct)

Mi agenda en el celular del colaborador, reportes de citas y ocupación, primera vez de un salón, y la
liberación de los giros. Todo en local. Diseño: `docs/diseno/pos-belleza.md` y `docs/diseno/admin.md`;
decisión: ADR 0041.

**Migraciones**

- **0227:** `mi_agenda`, `mi_cita_empezar`, `mi_cita_terminar` y los reportes de citas y ocupación.
- **0228:** sesión del colaborador: rol `colaborador_web` (solo cinco RPC), hook del token, capa RLS
  `es_sesion_web_limitada()`, `agenda_accesos_colaboradores()` y las envolturas `mis_comisiones` /
  `mi_periodo_comisiones`.
- **0229:** prospectos de belleza.
- **0230:** libera los giros de belleza. **Corre después de publicar el instalador**, nunca antes.

**Rulings de este plan (Fermín puede corregirlos)**

- El colaborador entra con correo y contraseña a `/mi-agenda`; el dueño le manda el acceso. Sin PIN ni caja.
- En el celular solo marca «Llegó» y «Terminé». Cancelar, mover, «No llegó» y cobrar siguen en recepción.
- No ve el teléfono ni el correo de la clienta.
- Con varios colaboradores en una cita, se termina cuando la termina el del último servicio.
- El rol del token queda fijo hasta renovarlo (aceptado, ADR 0041). La sesión en un navegador compartido
  persiste hasta «Cerrar sesión».
- El % de ocupación ignora los días sin horario.

## Lanzamiento del grupo belleza

**Nada sale a producción hasta que esté el grupo de servicios (talleres automotrices): regla de Fermín.**
Cuando llegue ese momento, en este orden:

1. **Pasos de dominio, antes del merge:** los de `docs/operacion/mudanza-online.md` (DNS de `online`,
   dominio `online` + `pedidos` en el proyecto `vim-tienda` de Vercel, hostname en Turnstile,
   `TURNSTILE_HOSTNAMES`, `VIM_TIENDA_URL` y `VIM_TIENDA_SECRET`). El merge despliega el redirect 308 de
   `pedidos` a `online`: si va primero, la tienda pública se cae.
2. **Migraciones 0188–0229 a la nube, a mano y en orden**, cada archivo en su propia transacción (0216 y
   0220 son solo `ADD VALUE`). 0230 no entra aquí.
3. **Comprobar en la nube** que `GRANT colaborador_web TO authenticator` se aplicó y que GoTrue acepta el
   rol personalizado que pone el hook. Agregar `https://admin.vimpos.com.mx/establecer-acceso` a las
   redirect URLs de Auth.
4. **Desplegar las funciones:** `tienda`, `tienda-correos`, `tienda-webhook-mp` y todas las demás, porque
   `servir()` de `_shared/http.ts` cambió (rechaza `colaborador_web`) y toca a todas.
5. **Merge.**
6. **UN instalador** con 0188–0229 (retail y belleza juntos).
7. **0230 después de publicar ese instalador** (y la liberación de retail, 0215, si aún no corrió). Así
   no existe un salón con una caja sin las migraciones de belleza.

**Para Fermín (pendientes)**

- Textos para James: reservas, correos, panel y «Mi agenda».
- Borrador legal de reservas: revisarlo antes de enlazarlo.
- Reembolsos fallidos: se resuelven a mano en Mercado Pago, sin botón.
- Clave SAT de belleza: definir cuál queda por defecto.
- Sitio y PDF de prospectos de belleza: al final.
- Local: para probar el enlace de acceso, `supabase stop && supabase start` carga `additional_redirect_urls`.
