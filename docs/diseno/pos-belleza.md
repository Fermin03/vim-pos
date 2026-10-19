# Diseño — Caja de belleza (giros SALON, SPA, PELUQUERIA, BARBERIA, TATUAJES)

> Hereda de [`pos-retail.md`](pos-retail.md), que hereda de [`pos.md`](pos.md) y [`nucleo.md`](nucleo.md).
> Aquí va solo lo que cambia cuando la caja es de un negocio de belleza. Spec:
> `docs/superpowers/specs/2026-10-18-giros-belleza-design.md` §4. Bocetos en
> `docs/superpowers/bocetos-belleza/`. Describe la entrega 1 (agenda, 18 oct 2026); donde el código
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
el colaborador de la cita cargada. Un servicio sin colaborador dice «Elige quién lo hizo» y no deja
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
