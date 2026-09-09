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

### Bloqueo por versión: la única pantalla de bloqueo con salida

Desde la entrega 4 del ADR 0014, la caja puede quedar bloqueada por estar **por debajo de la
versión mínima** que VIM exige. Es la misma pantalla completa, con dos diferencias que importan:
el título dice **"Actualiza para seguir vendiendo"** en vez de "Esta caja no puede vender", y
trae un botón que **instala la actualización** ahí mismo.

**Un bloqueo sin salida sería una trampa.** A diferencia de la suspensión, esta la decide la
caja comparando con su propia versión, así que puede morder sin internet; y a diferencia de la
suspensión, el cajero *sí* puede resolverla solo. Por eso el botón va en la pantalla y no en un
menú. El teléfono de soporte se queda igualmente: si la actualización no encuentra nada —caso
típico de una **segunda caja de la LAN**, que no puede instalar desde ahí— la pantalla lo dice
con esas palabras y le manda a actualizar la caja principal.

Cualquier motivo de bloqueo que la caja no reconozca se trata como suspensión, no como versión:
un valor raro no puede dejar la pantalla a medio pintar ni ofrecer un botón que no lleva a nada.

### El menú se actualiza solo

Un producto dado de alta en /admin aparece en la caja **en menos de un minuto**, sin reiniciar
nada. Antes el catálogo se cargaba una sola vez al abrir la caja y solo se volvía a bajar de la
nube una vez por hora: el dueño daba de alta un producto, se paraba frente a la caja y no estaba.

**El cambio entra sin interrumpir a nadie.** La pantalla relee el menú en el sitio; el carrito, la
cuenta de mesa abierta y el turno siguen donde estaban. Y lo que ya está en el ticket **no se
reescribe**: cada línea guarda el nombre y el precio con los que se pidió, así que un cambio de
precio a media cuenta no le mueve el total al cajero delante del cliente.

También llega la vuelta contraria: si el dueño marca un producto como agotado o lo quita del
menú, desaparece de la caja por el mismo camino.

**Y hay un botón, en Ajustes → "Actualizar menú".** El minuto automático cubre el día normal;
el botón es para el dueño que acaba de guardar un producto y lo quiere en pantalla ahora, con el
cliente delante. Dice "Menú actualizado" cuando llegó y explica el motivo cuando no —sin nube, la
caja sigue cobrando con el menú que tiene, que es lo único que no se puede interrumpir.

En la **segunda caja de la LAN y en la cocina** el menú se refresca igual: el aviso viaja por el
mismo canal que las comandas.

### Combos: un slot por paso, y el avance lo da el toque

Desde el ADR 0015 un combo se captura en un drawer de **un slot por pantalla** (Hamburguesa →
Acompañamiento → Bebida → Resumen). En un slot de una sola elección, **tocar la tarjeta selecciona
y avanza**: no hay botón "Siguiente" que buscar. Se probó en el prototipo del 8 sep 2026 y el dueño
lo aprobó tal cual. Los defaults vienen preseleccionados, así que el caso común son tres toques —
salvo que el default esté agotado: ese slot arranca sin elegir y hay que tocar.

Una opción agotada no desaparece de la tarjeta: se ve, deshabilitada, con la insignia "Agotado". El
combo entero no deja de venderse porque falte una papa chica; solo esa opción queda fuera hasta que
vuelva el inventario — mismo criterio en el editor de combos del admin.

Si el producto elegido tiene un modificador obligatorio (el término), su modal se abre **encima**
del paso y al confirmar se avanza; no se vuelve a la lista. "Personalizar" en una tarjeta ya elegida
abre los opcionales. Ese modal anidado tiene su propio Escape, que cierra solo los modificadores —
no todo el drawer del combo—, y si el grupo era obligatorio, cerrar deshace la selección: mejor un
slot sin elegir que uno elegido a medias.

El precio va en vivo en la cabecera y en el botón. Las tarjetas dicen "+$15" cuando cambian el
precio e "Incluido" cuando no: el cajero lo lee sin sumar.

**"¿Lo hacemos combo?"** aparece como hoja inferior al agregar suelto un producto que es principal
de algún combo, con el diferencial ("+$45 · papas y refresco"). Es la pregunta que el cajero le
hace al cliente de todos modos; el sistema solo la calcula. **Sí** abre el combo ya en el paso 2 y
conserva la nota de cocina que el cajero ya le había puesto al producto suelto: queda pegada a ese
componente, no al combo entero, y llega así a su propio renglón en cocina. **No, solo** agrega el
producto tal cual estaba — Escape hace lo mismo, el producto nunca se pierde. No aparece al agregar
a una cuenta de mesa ya enviada a cocina (reabriría la comanda).

> **Deuda:** el dueño debería poder apagar "¿Lo hacemos combo?" por negocio —
> `configuracion_tenant.combo_upsell_activo` existe para eso (migración 0110) y la caja ya lo
> respeta— pero el admin todavía no tiene una pantalla que lo cambie. Hoy solo se apaga a mano en
> la base de datos.

En el carrito el combo es **un renglón con precio** y sus hijos indentados bajo una línea vertical,
cada uno con su slot en versalitas. Un extra con costo dentro de un hijo muestra su importe; lo
incluido no muestra nada. **Editar reabre el drawer en el resumen — solo mientras el ticket no se
ha guardado.** En una cuenta de mesa ya persistida no hay botón Editar en un combo: se cancela el
renglón completo (motivo y autorización, como cualquier ítem) y se vuelve a capturar. Es el mismo
criterio que ya regía para los modificadores; un combo no es una excepción.

En la comanda y el KDS **el combo no existe**: salen sus hijos, cada uno en su estación, con
"↳ Combo #n" para que plancha y barra sepan que van juntos. En el ticket del cliente es al revés:
"1x Combo $170" cobra por todos a la vez y los hijos van sin el precio del combo — pero un extra con
costo dentro de un hijo (p. ej. "Extra queso") sí se imprime con su importe, porque eso lo pagó de
más, y la nota de cocina de ESE hijo también sale ahí, un nivel más adentro que la del renglón
normal, para que quien lo recibe sepa qué llevaba ese componente y no solo la cocina.

## Lo que NO se hereda de otras apps

- **La densidad del admin.** Aquí el scroll es tiempo frente a un cliente, pero apretar de más
  produce toques equivocados. Prefiere menos elementos antes que elementos más chicos.
- **El tema oscuro del KDS.** Está calibrado para una pantalla lejana en una cocina.
