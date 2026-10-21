# 0035 — El envío por distancia es una zona por tramo

**Fecha:** 14 de octubre de 2026 · **Estado:** vigente · **Amplía** [0017](0017-el-envio-es-un-renglon.md)
(el envío sigue siendo un renglón) para la tienda en línea.

## Qué había antes

La tienda cobraba el envío solo por zonas: el cliente elegía la suya de una lista y pagaba lo que
costaba. Funciona mientras el cliente diga la verdad y sepa en qué zona vive.

## Qué hacemos ahora

Cada sucursal elige, en «Tienda en línea → Envío a domicilio», cómo cobra la tienda: **«Por zonas»**
(como antes, y como nacen todas) o **«Por distancia»**: tramos «hasta X km → $Y» y el punto de la
sucursal. El cliente pone un pin; la **base** calcula la distancia (haversine × 1.3, que aproxima la
distancia en calles, a un decimal) y cobra el primer tramo cuyo límite la alcanza. Más allá del último,
no se entrega. Del teléfono solo viaja el punto; el teléfono repite la cuenta para enseñarla en vivo,
pero la que cobra es la de `tienda_cotizar` y `tienda_crear_pedido` (migración 0185).

**Cada tramo es una zona de envío** («Hasta 3 km», con el precio del tramo), que crea y mantiene
`tienda_guardar_envio`. Qué zona es de qué tramo lo dice `tienda_sucursales.tramos_envio`.

## Por qué

**La caja instalada no se puede cambiar sin instalador.** Crea el ticket de un pedido de la tienda con
su propia copia de `crear_ticket_desde_tienda` (0173), que exige una zona de la sucursal, activa, y
reprecia su renglón al envío cotizado. Con una zona por tramo, un pedido por distancia es, para la
caja, un pedido con zona como cualquier otro: el ticket, el CFDI (0017), los reportes por zona y el
POS («Hasta 5 km · $35» para un pedido por teléfono) funcionan sin tocar nada.

**La distancia llega por las referencias.** `direccion.referencias` del pedido empieza con «A 3.2 km»:
la caja ya la guarda en la dirección del cliente, la pinta en el aviso del pedido y la imprime en el
ticket. El punto va en `direccion` (lat, lng): se purga con ella a los 30 días sin tocar la purga.

**Qué tramo es de qué zona vive fuera de la zona** a propósito: `tienda_sucursales` no viaja a la caja,
y una caja vieja que repreció una zona la sube sin las columnas que no conoce. Si la marca viviera en
`zonas_envio`, ese repreciado la borraría en la nube.

## Alternativas descartadas

- **Una sola zona «comodín» para todo el envío por distancia.** El POS la enseñaría con un precio que no
  significa nada, y los reportes no distinguirían cerca de lejos.
- **Pedir instalador nuevo.** Las cajas instaladas recibirían pedidos que no saben convertir en ticket
  hasta actualizarse; el pedido se quedaría en error.
- **Calcular en el teléfono.** El precio de lo que se cobra no lo decide quien lo paga.

## Consecuencias

- **Una zona de tramo no se renombra nunca.** La caja reconcilia zonas por nombre: renombrar «Hasta 3
  km» a «Hasta 5 km» mientras otra se llama así fundiría las dos. Cambiar el km de un tramo da de baja
  su zona y crea otra; cambiar solo el precio la conserva.
- **«Por zonas», las zonas de los tramos quedan inactivas** (ni tienda ni POS); se conservan para volver.
  En «Zonas de envío» del admin no se enseñan: se administran desde la tienda.
- **Un pedido en vuelo puede fallar al llegar a la caja** si en esos minutos el dueño quitó su tramo o
  cambió a «Por zonas» (su zona ya no está activa). Es el mismo riesgo que hoy tiene borrar una zona.
- **El pin lo pone el cliente.** Puede mentir (ponerlo cerca y pedir lejos). La dirección escrita se
  sigue pidiendo y el repartidor la ve junto a «A 3.2 km» y, en el POS web, «Ver en el mapa».
- **Una dirección que el cliente ya tenía** se reutiliza en la caja con sus referencias de entonces: el
  ticket de ese cliente puede no traer la distancia nueva. El aviso del pedido sí la trae.
- **El mapa:** MapLibre GL JS (BSD-3) servido desde `public/mapa/` de cada app y teselas de OpenFreeMap
  (gratis, sin cuenta ni llave, uso comercial permitido, sin garantía de servicio). La atribución la
  pone MapLibre desde el estilo. La CSP solo añade `https://tiles.openfreemap.org`; la tienda deja la
  ubicación a su propia página (`Permissions-Policy: geolocation=(self)`).
