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

## Por qué

Precio por giro ya se probó y se retiró (0002). Un molde fijo por giro no sirve para los negocios
mixtos (una hamburguesería con cuatro mesas). Que el dueño moviera los interruptores se descartó
por decisión de Fermín: cada cambio pasa por VIM.

Spec: `docs/superpowers/specs/2026-10-14-giros-y-modulos-de-operacion-design.md`.
