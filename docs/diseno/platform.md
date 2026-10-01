# Diseño — Panel de plataforma (`apps/platform`)

> Hereda todo de [`nucleo.md`](nucleo.md).

## Quién y dónde

Nosotros. VIM, por dentro. Se dan de alta tenants, se activan complementos, se cargan folios, se
revisa el CFDI de los clientes. Es la única app que usa `service_role` y la única desde la que se
puede romper el negocio de alguien más.

Poca superficie y mucho poder por pantalla. Desde la entrega 1 del ADR 0014 (04/09/2026) el
panel es una barra lateral con sus pantallas globales (Atención, Clientes, Prospectos, Avisos,
Versiones, Facturación, Pagos y soporte, Errores, Bitácora, Operadores) y una **ficha de
cliente** con cuatro secciones en este orden: Operación,
Contrato, Facturación y Zona peligrosa. El orden es el del trabajo diario: primero si está
operando, luego qué paga, luego lo que factura, y al final, aparte, lo que puede romperle el
negocio. Las pantallas se refrescan solas cada minuto mientras la pestaña está visible.

## Se ve distinto a propósito

No debe confundirse con el panel del cliente ni por un segundo. Cabecera propia y una marca
visible de que estás en el panel interno. El día que alguien tenga las dos abiertas —que va a
pasar— la diferencia tiene que notarse antes de leer.

## Fricción deliberada en lo destructivo

Al revés que en el POS, aquí **la lentitud es una función**. Lo que toca a un tenant ajeno:

- Confirmación que obliga a **escribir el nombre del tenant**, no a pulsar "sí".
- La pantalla dice a quién afecta y desde cuándo, con nombre comercial, no solo con UUID.
- Nada destructivo comparte fila con algo cotidiano.

**Avisos (entrega 3).** `/avisos` escribe mensajes a las cajas, a un cliente o a todos. Lo que
hace útil la pantalla es el conteo **"visto por N de M cajas"**: mandar un aviso sin saber si
llegó es gritar al vacío. Ese número cuenta solo acuses hechos desde una caja; los del POS web
van aparte, porque si se sumaran podría superar al denominador. Un aviso **importante a todos
los clientes** se confirma escribiendo `TODOS`, con la misma fricción que lo destructivo. Retirar
es borrado lógico: los acuses de quien ya lo leyó sobreviven. La ficha de cada cliente muestra
los avisos que le aplican y enlaza al formulario con el destinatario ya puesto.

Desde la entrega 2 (05/09/2026) la ficha muestra además la **versión del escritorio de cada
caja**. Una caja sin versión es anterior a 0.4.60 y no late: se muestra **en gris**, nunca en
rojo — no está caída, solo sin actualizar.

**Versiones (entrega 4).** `/versiones` abre con el **parque**, no con el historial: la pregunta
que se hace al entrar es "¿quién está atrás?", no "¿qué publiqué?". Tres cifras arriba —al día,
por debajo de la mínima, sin reportar versión— y la tabla de todas las cajas de todos los
clientes, con filtro de "solo desactualizadas". Publicar es **pegar el `latest.json`** que generó
`release-manifest` y confirmar escribiendo `TODOS`; el panel lo valida, lo sube al bucket y lo
guarda. Después avisa de que el CDN puede seguir sirviendo la versión anterior **hasta un
minuto**: sin ese texto, comprobar el enlace enseguida parece un fallo de la publicación.

Exigir una **versión mínima** es lo único del panel que puede dejar una caja sin vender aunque el
negocio esté al corriente, así que se separa en dos pasos. Marcarla como mínima solo la pinta
como desactualizada. **Exigirla** pide además la fecha, una casilla de "entiendo que una caja sin
internet no podrá salir del bloqueo sola" y escribir `BLOQUEAR` — no el nombre de un cliente,
porque afecta a todos. La fecha usa el mismo cálculo que la suspensión: 06:00 de México, cuando
el corte del día anterior ya está cerrado en cualquier restaurante. Una versión que es la mínima
**no se puede retirar**: dejaría a las cajas viejas sin una versión a la que subir.

Esto lo implementa `app/components/dialogo-confirmar.tsx`: motivo de al menos 10 caracteres,
nombre comercial escrito, días de gracia cuando aplica y una casilla "entiendo" en cancelar.
`prompt()` y `confirm()` del navegador no se usan en este panel. Suspender siempre programa un
bloqueo con gracia (`tenants.bloqueo_desde`, a las 06:00 de México); la caja lo obedece desde la
entrega 2.

**Eliminar un cliente (0144, ADR 0023).** Lo único del panel que no se puede deshacer, y por eso
lleva un escalón más de fricción que cancelar. Solo aparece con el cliente ya **CANCELADO** (dos
pasos: primero la baja), en un bloque propio debajo de los demás botones de la Zona peligrosa.
Antes de pedir nada enseña lo que se va a borrar —sucursales, cajas, usuarios, productos,
tickets, cuentas—, leído de la base al abrir el diálogo. Confirmar pide motivo, el nombre del
negocio **y además** la palabra `ELIMINAR` (`palabra` en `DialogoConfirmar`): el nombre dice a
quién, la palabra dice qué. Si la base no lo permite (facturas timbradas, el cliente sigue en
sus días de gracia —se dice hasta cuándo—, o hace menos de 15 minutos que dejó de poder
facturar), no hay botón: se dice por qué, en `ink`, no en
rojo — no es un error, es una regla; la espera trae los minutos que faltan y un "Volver a
comprobar". Con la **clave compartida** tampoco hay botón: se dice que hace falta la cuenta del
operador. Al terminar se vuelve a Clientes con un aviso que no se cierra solo, y lo que queda del
negocio se ve en **Clientes eliminados** (enlace al pie de la lista). Ahí lo único que se puede
hacer es **Reintentar** el borrado de archivos que hayan quedado pendientes, en `warning`.

Si la petición se corta sin respuesta, el diálogo no dice "error": dice que no se sabe si terminó
y manda a mirar Clientes eliminados antes de reintentar. Un mensaje ambiguo aquí acaba en un
operador que reintenta a ciegas o que da por borrado lo que no se borró.

**Cobro, plan y prueba (0141, ADR 0021).** Activar el cobro pide precio de lista, ciclo y una
promoción opcional; en Esencial hay un botón "Piloto 5 negocios" ($499 seis meses) y siempre
"Otra…". Donde se enseña un precio se dice entero: "$499 hasta 31 mar 2027, después $699".
Cambiar de plan enseña ANTES de confirmar lo que cambia —folios del mes, add-ons que gana o
pierde (lo que pierde, en `danger`) y el cobro antes → después—, porque la base mueve todo eso
en la misma transacción. La prueba gratis sale en Contrato con su fecha y "Extender prueba…"
(motivo, a la bitácora); vencida va en `warning`, no en rojo: no corta nada. **Extras por cantidad (0147, ADR 0024).** La sucursal y la caja adicional no van en la lista de
add-ons (activar / dar de baja) sino en su propio bloque, **Extras**, porque se contratan por
cantidad. Cada renglón dice el precio por unidad, lo que suma al mes y la cuenta del límite a la
vista: "Límite: 1 del plan + 2 extra = **3 cajas por sucursal**" (o "por excepción" si la base es
una excepción). El diálogo enseña antes → después del límite y del total al mes. **Subir** pide
solo motivo; **bajar o quitar** pide además el nombre del cliente y va en `danger`: le quita algo
que puede estar usando. Si lo está usando, la base lo rechaza y el diálogo dice cuántas tiene que
desactivar antes. Donde el plan no tiene límite no hay botón: se dice por qué. El bloque Cobro
enseña el **total al mes** (plan + add-ons y extras) cuando paga algo aparte, y "Registrar pago"
propone ese total. Al cambiar de plan, los extras que el plan nuevo deja sin sentido salen en
`danger` con lo que deja de pagar; los demás, en una línea que dice que se conservan.

**Datos de pago**
y **Soporte** (0142, en la misma pantalla "Pagos y soporte") son las únicas que escriben algo que ven TODOS los clientes, así que se confirman
escribiendo `TODOS`, como un aviso importante a todos.

**Prospectos (0145).** Quien pide una demo en el sitio aparece en `/prospectos`, lo más nuevo
primero; abre filtrada en **Nuevo** si hay alguno. Es la única pantalla del panel con un botón
azul por tarjeta —**WhatsApp**, con el saludo ya escrito— porque aquí sí hay un "lo que sigue":
contestarle. El seguimiento es un `<select>` (Nuevo → Contactado → Demo agendada → Ganado /
Perdido) y una nota de una línea que solo se guarda al pulsar; el refresco de cada minuto no pisa
lo que se está escribiendo. **Eliminar** es para entradas de prueba: enlace en `danger`, abajo y
aparte, con motivo; a un prospecto real que no cerró se le marca Perdido. La bitácora guarda el
negocio y el estado, **nunca** el nombre ni el WhatsApp de la persona. En la barra lateral, el
contador de Prospectos va en `warning`, no en rojo: nada está roto. En Atención, los que llevan
más de 24 h como nuevos son **una sola** alerta (alta; crítica a los tres días). "Convertir en
cliente…" abre Nuevo cliente con el negocio, la persona, el teléfono, el giro y el plan sugerido
por tamaño; en la URL solo viaja el id del prospecto.

**Acceso del dueño (roadmap A5).** El bloque "Alta" de la ficha dice el correo del dueño y si ya
lo confirmó ("Correo confirmado el …", con su último acceso). Sin confirmar va en `warning` —no
puede entrar, pero nada está roto— con un botón que reenvía **el correo de su camino de alta**: la
invitación si lo dio de alta VIM, la confirmación de registro si se registró solo. No pide motivo
(no cambia nada del contrato) pero sí queda en la bitácora, y el servidor limita a uno por minuto
y cinco por hora por negocio. El resultado se dice ahí mismo y no lo borra el refresco. Confirmado,
el botón no existe: a quien ya entra no se le reenvía nada desde el panel.

## Los datos son de otro

Cada pantalla deja claro **de qué tenant** estás viendo datos, siempre, incluso en las tablas.
Un número sin dueño en este panel es un error esperando a ocurrir.

Para capturas, demos y pruebas se usa el tenant inventado (Crazy Burgers), nunca el de un cliente
real.

## Lo que NO se hereda

- La regla de una acción dominante por pantalla: aquí conviven varias acciones administrativas
  legítimas y ninguna es "la siguiente".
- El azul de marca como llamada a la acción en lo peligroso: lo peligroso va en `danger`, aunque
  sea la acción principal de esa pantalla.
