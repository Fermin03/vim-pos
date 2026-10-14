# 0034 — El giro arma el juego inicial de módulos, y después solo VIM lo ajusta

**Fecha:** 14 de octubre de 2026 · **Estado:** vigente (entrega 1 de 3)

## Qué había antes

El giro se pedía al registrarse y casi no servía: solo escondía el bloque de evento al abrir turno
si el negocio no era food truck. Todos veían mesas, meseros, domicilio, repartidores y marcas
virtuales. El ADR 0002 ya había dicho que el precio va por paquete y que el giro "sigue configurando
el producto", pero nadie lo había hecho.

## Qué hacemos ahora

- **El giro no cambia el precio.** Esencial, Negocio y Cadena siguen igual. Cadena es el plan, no un giro.
- **Siete giros:** comida rápida, restaurante con meseros, food truck, dark kitchen, bar, cafetería y
  taquería / cocina económica. `CAFE_BAR` y `ENTERPRISE` se quedan en el tipo, pero ya no se ofrecen.
- **Diez módulos de operación** en `tenants.operacion`. El giro solo decide con cuáles arranca un
  negocio (`juego_inicial_de_giro`); después **solo VIM** los cambia desde /platform, en cualquier
  giro. El dueño los ve, pero no los cambia: lo pide a soporte.
- **Viven en `tenants` y no en `configuracion_tenant`** porque esa la escribe el dueño; en `tenants`
  la 0132 ya le cerró el UPDATE salvo una lista de columnas.
- **El candado de cuentas abiertas vive en `operacion_cambiar`, no en un disparador:** la caja baja
  `tenants` en el pull y ahí nada puede fallar.
- **Los clientes que ya existían quedan con todo encendido.**

## Cómo se despliega (no es obvio)

- **Un giro nuevo no se asigna hasta que todas las cajas conozcan el valor.** La caja baja la fila
  completa de `tenants`; si en la nube un negocio queda `BAR` y su caja no tiene la 0179, el pull
  entero de esa caja falla y deja de recibir catálogo, precios y empleados. Por eso la 0180 no
  convierte `CAFE_BAR` a `BAR`, y `cambiar_giro` responde `GIRO_NO_DISPONIBLE` para `BAR`,
  `CAFETERIA` y `TAQUERIA`. Se liberan con una migración cuando la 0179 haya viajado en un
  instalador que ya tengan todas las cajas.
- **El alta todavía no aplica el juego del giro.** Mientras ninguna pantalla obedezca los módulos,
  un negocio registrado en el hueco perdería pantallas de golpe al salir la entrega 2. Lo aplica
  la entrega 2, junto con las pantallas.
- **0179 y 0180 se aplican en dos transacciones**, una por archivo. En una sola, Postgres responde
  "unsafe use of new value".

## Por qué

Precio por giro ya se probó y se retiró (0002). Un molde fijo por giro no sirve para los negocios
mixtos (una hamburguesería con cuatro mesas). Que el dueño moviera los interruptores se descartó
por decisión de Fermín: cada cambio pasa por VIM.

Spec: `docs/superpowers/specs/2026-10-14-giros-y-modulos-de-operacion-design.md`.
