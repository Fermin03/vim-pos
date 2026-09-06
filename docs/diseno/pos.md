# Diseño — POS (`apps/pos`)

> Hereda todo de [`nucleo.md`](nucleo.md). Aquí va solo lo que es cierto **en una caja**.

## Quién y dónde

Un cajero, de pie, frente a una pantalla táctil de 15" (1024×768 típico), con gente esperando.
A veces con las manos grasosas, casi siempre con prisa, a ratos sin internet. No lee la pantalla:
la reconoce. Cada segundo de orientación que le cobras se paga con un cliente esperando.

En el escritorio corre además contra su propio Postgres local, así que la app tiene que verse
igual con y sin nube.

## Reglas propias de una caja

Estas no son preferencias estéticas: salen de errores que ya costaron dinero en el piloto.

**Una acción dominante por pantalla.** Si hay dos azules, hay cero.

**El botón "Volver" siempre en el mismo sitio** — extremo izquierdo de la cabecera, mismo tamaño
en todas las pantallas. El cajero va al lugar donde *sabe* que está el botón. Si cambia de sitio,
cada regreso cuesta una búsqueda.

**Escape cierra lo que esté encima; si no hay nada, vuelve.** Con una excepción deliberada: no
interrumpe un cobro en curso.

**Lo destructivo pregunta, y dice qué va a pasar.** No "¿Estás seguro?", sino qué se pierde y qué
se puede deshacer.

**Los avisos a cocina son inequívocos.** Una comanda de cancelación abre con `CANCELADO` /
`NO PREPARAR` invertido y a tamaño máximo, y **cada renglón** repite la marca — por si el papel se
corta o se lee a medias. Que la cocina confunda una cancelación con un pedido nuevo es el peor
desenlace posible.

**Un cero honesto vale más que un número creíble.** Si no hay datos de hoy, se dice; no se
muestran los de anteayer con la etiqueta "hoy".

## Tacto

- Objetivo mínimo **44px**; los de uso frecuente (productos del catálogo, teclado de PIN,
  cobrar) van a **56px** o más.
- Separación mínima de 8px entre objetivos destructivos y no destructivos. "Quitar" nunca pegado
  a "Cobrar".
- Nada depende de `hover`: hay dedo, no mouse. El hover puede añadir, nunca revelar.

## Dinero

Siempre en `font-display`, **bold**, `tabular-nums`. El total de la pantalla es el número más
grande que hay en ella; subtotal e IVA son informativos y van en tipografía menor.

Un número que cambia de significado sin cambiar de aspecto es un bug de diseño: si un total es
de la tanda y no de la cuenta, tiene que decirlo.

## Estado de la caja, siempre visible

Sin conexión, sincronizando, turno abierto, folios restantes. El cajero no debe descubrir que
lleva media hora offline al intentar cobrar.

## Servicio suspendido: avisar sin estorbar, bloquear sin dejar tirado

Desde la entrega 2 del ADR 0014 la caja obedece las **directivas** que le manda la nube en cada
latido. Dos estados nuevos, y ninguno improvisa: la caja no calcula nada, solo aplica lo que
recibió.

- **Gracia** — banda amarilla arriba con el mensaje que escribió VIM y la fecha en que la caja
  dejará de vender. El cajero **sigue cobrando**. El aviso es para que el dueño lo resuelva, no
  para frenar el mostrador.
- **Bloqueado** — pantalla completa antes del PIN, con el teléfono de soporte. Dice que las
  ventas anteriores están a salvo y se siguen respaldando, porque esa es la primera pregunta de
  un dueño bloqueado. La sincronización **no se detiene**: quien se ponga al corriente no perdió
  nada.

**La falta de datos nunca bloquea.** Sin archivo de directivas, con el archivo corrupto o con la
nube caída, la caja vende. Perder ventas por un corte de red nuestro sería peor que el impago que
esto persigue. Por eso el bloqueo es un control **comercial**, no una barrera de seguridad: lo que
de verdad cuesta dinero —timbrar un CFDI— se cierra además en el servidor.

### Avisos de VIM

Desde la entrega 3 del ADR 0014, VIM puede mandarle un mensaje al cajero: llega por el mismo
latido y se muestra **al abrir turno**, en un diálogo.

**De uno en uno, nunca en lista.** Un cajero con prisa cierra una lista sin leer nada, y el
acuse diría que la leyó. Así cada aviso cuesta un toque y el acuse significa algo. El botón dice
**Entendido** cuando VIM pidió confirmación y **Cerrar** cuando no.

**Un aviso nunca impide vender.** El diálogo se cierra siempre, incluso si el acuse no se pudo
registrar; lo peor que pasa entonces es que vuelva a salir en el siguiente turno. El cuerpo se
renderiza como texto plano, nunca como HTML.

## Lo que NO se hereda de otras apps

- **La densidad del admin.** Aquí el scroll es tiempo frente a un cliente, pero apretar de más
  produce toques equivocados. Prefiere menos elementos antes que elementos más chicos.
- **El tema oscuro del KDS.** Está calibrado para una pantalla lejana en una cocina.
