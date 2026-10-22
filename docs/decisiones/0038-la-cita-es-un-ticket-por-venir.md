# 0038 — La cita es un ticket por venir, y el candado de empalmes vive en la base

**Fecha:** 18 de octubre de 2026 · **Estado:** vigente (entrega 1 de 4 del giro de belleza)

## Qué había antes

Nada: VIM POS no tenía agenda. Un servicio de belleza (corte, manicure) no se distinguía de un
producto, y no había forma de decir quién lo hace, cuánto dura ni dónde.

## Qué hacemos ahora

- **Un servicio es un producto** con una fila en `servicios_agenda` (duración, espacio que ocupa).
  Así la entrega 2 cobra servicios por el mismo camino que cualquier venta. `servicio_colaborador`
  guarda precio y duración propios de cada colaborador.
- **Una cita es un ticket por venir.** `citas` guarda a la clienta, el estado y el canal; `citas_servicios`
  guarda los tramos (uno por servicio, encadenados, con colaborador y espacio). Al cobrar (entrega 2)
  la cita se vuelve ticket.
- **El candado de empalmes está en la base**, con `EXCLUDE USING gist` sobre `btree_gist`: un colaborador
  o un espacio no puede tener dos tramos activos que se crucen. Ninguna pantalla ni proceso se lo salta.
  Las RPC traducen el 23P01 a `CITA_EMPALMADA` con el nombre de quien está ocupado.
- **Los empalmes del sync se marcan, no se borran.** La caja instalada agenda sin ver lo que la nube
  agendó mientras no había internet. Si dos tramos chocan al subir, entran con `empalme = true`, se
  marcan ambas citas y la recepción lo arregla (`resolver_empalme`). Nunca se cancela una cita por chocar.
- **La recepción manda.** Con colaborador elegido a mano se puede agendar fuera de su horario o en su
  ausencia. «Quien esté libre» (y, en la entrega 3, la reserva en línea) sí respetan horario, comida y
  ausencias.
- **El módulo `agenda`** lo mueve VIM (`tenants.operacion`), como `existencias`. Lo trae el juego
  inicial de los cinco giros nuevos (SALON, SPA, PELUQUERIA, BARBERIA, TATUAJES).

## Cómo se despliega (no es obvio)

- La 0216 → 0219 van a la nube a mano y **antes del merge**, como siempre, sin esperar a las cajas; el
  instalador con ellas sale después. Una caja vieja aguanta: su pull escribe en réplica (no corre el
  disparador de `tenants.operacion`, así que la llave `agenda` no da error) e ignora tablas y llaves
  que no conoce.
- **La compuerta es el enum de la 0216:** un `vertical_principal` de belleza sí tumba el pull de una
  caja sin ella. Por eso `cambiar_giro` bloquea los cinco giros hasta la migración de liberación
  (entrega 4), que se aplica solo cuando todas las cajas en uso tengan el instalador con la 0216.
- `btree_gist` ya viene en el Postgres embebido de la caja (verificado en `@embedded-postgres/windows-x64`).
- Los giros nuevos no se ofrecen en el registro todavía y están bloqueados en `cambiar_giro`.

## Por qué

Un candado en la pantalla se rompe con dos cajas o con el sync; en la base no. Marcar en vez de borrar
protege a la clienta que ya fue avisada de su hora.

Spec: `docs/superpowers/specs/2026-10-18-giros-belleza-design.md`.
