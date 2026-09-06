# Diseño — Panel de plataforma (`apps/platform`)

> Hereda todo de [`nucleo.md`](nucleo.md).

## Quién y dónde

Nosotros. VIM, por dentro. Se dan de alta tenants, se activan complementos, se cargan folios, se
revisa el CFDI de los clientes. Es la única app que usa `service_role` y la única desde la que se
puede romper el negocio de alguien más.

Poca superficie y mucho poder por pantalla. Desde la entrega 1 del ADR 0014 (04/09/2026) el
panel es una barra lateral con cinco pantallas globales (Atención, Clientes, Facturación,
Errores, Bitácora) y una **ficha de cliente** con cuatro secciones en este orden: Operación,
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

Desde la entrega 2 (05/09/2026) la ficha muestra además la **versión del escritorio de cada
caja**. Una caja sin versión es anterior a 0.4.60 y no late: se muestra **en gris**, nunca en
rojo — no está caída, solo sin actualizar.

Esto lo implementa `app/components/dialogo-confirmar.tsx`: motivo de al menos 10 caracteres,
nombre comercial escrito, días de gracia cuando aplica y una casilla "entiendo" en cancelar.
`prompt()` y `confirm()` del navegador no se usan en este panel. Suspender siempre programa un
bloqueo con gracia (`tenants.bloqueo_desde`, a las 06:00 de México); la caja lo obedece desde la
entrega 2.

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
