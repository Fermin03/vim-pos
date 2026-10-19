# Diseño — Caja de belleza (giros SALON, SPA, PELUQUERIA, BARBERIA, TATUAJES)

> Hereda de [`pos-retail.md`](pos-retail.md), que hereda de [`pos.md`](pos.md) y [`nucleo.md`](nucleo.md).
> Aquí va solo lo que cambia cuando la caja es de un negocio de belleza. Spec:
> `docs/superpowers/specs/2026-10-18-giros-belleza-design.md` §4. Bocetos en
> `docs/superpowers/bocetos-belleza/`. Describe las entregas 1 (agenda, 18 oct 2026) y 2 (cobro, colaborador por renglón y anticipos, 19 oct; ADR 0039); donde el código
> hizo algo distinto del boceto, manda el código.

## Quién y dónde

La recepción, en la misma caja táctil de 15" (1024×768 es el piso). Agenda, recibe a la clienta y,
desde la entrega 2, cobra. No hay cocina, mesas ni comandas.

## La barra inferior

Misma barra de la caja de tienda, con cinco destinos: **Calendario · Cobrar · Clientes · Transacciones ·
Más**. Abre en Calendario. **Cobrar** es la caja de tienda con tres pestañas a la izquierda (boceto 2):
**Citas de hoy · Servicios · Productos**. «Citas de hoy» agrupa **Termina pronto** (en curso y terminadas
sin cobrar; tocar una la carga a la venta con su clienta y pregunta antes si había otra venta), **En
espera** (con «Atender»; no se cobran, aún no tienen servicio) y **Cobradas hoy** (solo se ven). Cada
renglón del ticket lleva debajo quién lo hizo («Diego R.») y se cambia tocándolo; lo agregado a mano toma
el colaborador de la cita cargada, también con la venta ya guardada. Sin cita no se asigna a nadie en silencio: un servicio queda en «Elige quién lo hizo» y, con la venta ya guardada, se pregunta antes de guardarlo. Una cita ligada a otra venta abierta dice «En otra venta abierta» y tocarla retoma esa venta; la de otro día muestra el día («ayer», «lun 2»). En la caja de belleza el ticket vacío dice «Elige una cita, un servicio o escanea un producto» y no ofrece «Cambio de talla». Un servicio sin colaborador dice «Elige quién lo hizo» y no deja
cobrar; un producto puede ir sin colaborador. El ticket impreso repite el colaborador bajo el servicio.
Sin el módulo `agenda` encendido, la caja se comporta como tienda (sin Calendario ni Clientes).

## Calendario

- **Vista de un día**, con una tira de la semana (L–D) para cambiar de día, flechas de semana y «Hoy».
  No hay vista semanal completa.
- Una **columna por colaborador** (avatar con iniciales y su color; «No viene hoy» si tiene ausencia) y
  una columna gris «Sin colaborador» solo cuando hay tramos de alguien que ya no está en la agenda.
- Rango de horas: la unión de los horarios del día, las citas y 9:00–20:00. Línea roja con la hora actual.
- **Huecos de 30 min tocables** (60 px) que abren la cita nueva con esa hora y ese colaborador. Los
  huecos fuera de horario, en la comida o en una ausencia se apagan, pero se puede agendar ahí por otro
  camino (la recepción manda).
- Cada tarjeta es un tramo: color del colaborador, servicio, clienta y estado. Nunca baja de 44 px.
- Arriba: mes, chip ámbar **«N en espera»** y **«+ Nueva cita»**. En 800 px el grupo baja a un segundo renglón.

## Cita nueva y «Mover de horario»

Modal al 80 %. Clienta (buscar o nueva: nombre, teléfono, correo), uno o varios servicios, cada uno con
**«Quien esté libre»** o un colaborador, día, hora (pasos de 15 min) y nota. Un choque se avisa en el
mismo modal: «Diego R. ya tiene cita a esa hora». Una clienta nueva sin teléfono no se registra en
Clientes (el modal lo dice).

## Ficha de cita

Modal al 80 %. Insignia de estado («Por llegar · tolerancia hasta HH:MM», «Pasó la tolerancia»,
Atendiendo, Terminada, No llegó), la clienta con teléfono y «N faltas antes», día y horario, cómo
reservó, servicios con colaborador, espacio, duración y precio. Acciones según el estado:

- Por llegar: **Llegó · empezar**, **Recordar por WhatsApp** (abre `wa.me` con el mensaje; apagado sin un
  teléfono de 10 dígitos), **Mover de horario**, **No llegó · liberar lugar** (solo después de la hora),
  **Cancelar cita**.
- Atendiendo: **Terminé**.
- Terminada, cancelada o No llegó: sin acciones.
- Con empalme marcado por el sync: aviso con **Ya lo moví**.

### Anticipos (entrega 2)

- Si el negocio no cobra «Al final», una cita por llegar o en espera tiene **Cobrar anticipo** (monto
  sugerido editable y método). Al agendar una cita nueva la ficha abre ofreciéndolo; «Ahora no» la cierra.
  Lo cobrado se ve como **«Anticipo pagado $X»**.
- **Cancelar** con anticipo pregunta quién cancela («Cancela el negocio» / «Cancela la clienta»). Primero se
  cancela o se marca **No llegó**; después: **«¿Qué hacemos con el anticipo de $X?»** — Devolver o
  Retener, con la sugerida marcada (negocio o a tiempo → Devolver; tarde o no llegó → Retener). Devolver con
  tarjeta o transferencia pide la referencia; en efectivo sin permiso, el PIN de un supervisor. Si se
  cierra sin elegir, la ficha dice **«Anticipo pendiente de devolver o retener»** con los dos botones. La
  cita sigue en el calendario (apagada, con la marca «Anticipo pendiente») y en Cobrar → «Citas de hoy»,
  grupo **Anticipos pendientes**, que abre la ficha. Resuelto, desaparece. En el calendario la cancelada
  va como franja angosta a la derecha, debajo de las citas vivas (no les tapa el toque). El aviso abre el
  diálogo con la sugerida de la regla (no llegó o tarde → Retener; a tiempo → Devolver).
- Un sobrante VIGENTE en una cita **Cobrada** sale igual en «Anticipos pendientes» y la ficha dice
  **«Anticipo sin usar $X»** con solo **Devolver** (la base no deja retenerlo).
- Si el cobro no puede leer el anticipo, no ofrece formas de pago: error con «Reintentar».
- El corte de belleza enseña las cuatro cifras de anticipos siempre, también en $0.
- Al cobrar la venta de la cita, el cobro muestra desde el principio **Total**, **Anticipo −$X** y
  **Por cobrar**, y las formas de pago cobran solo el resto. El anticipo se aplica al confirmar el primer
  pago; si cubre todo, un solo botón «Cobrar con anticipo $X». Salir del cobro no aplica nada.
- El corte enseña «Anticipos recibidos», «Pagado con anticipo», «Anticipos devueltos» y «Anticipos
  retenidos (no reembolsables)» como información; ANTICIPO nunca se declara.

## Lista de espera

Panel con quien llegó sin cita: nombre, «Llegó a las HH:MM · hace N min», servicios y preferencia.
**Atender** pide «Quien esté libre» o un colaborador que haga todos sus servicios y no falte hoy.
«Agregar a la espera» abre el mismo modal de cita, sin día ni hora.

## Clientes

Búsqueda por nombre o teléfono a la izquierda; ficha a la derecha: datos, **Agendar cita**, visitas
(servicio con colaborador), faltas, lealtad (solo con el módulo) y notas internas editables (alergias,
preferencias).

## Escape

Las tres capas (ficha, modal de cita, espera) ceden en la pila compartida: Escape cierra la de arriba.
Fuera del Calendario, Escape regresa al Calendario.
