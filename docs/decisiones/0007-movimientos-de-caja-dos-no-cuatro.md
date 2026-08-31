# 0007 — Movimientos de caja: dos, no cuatro

**Fecha:** 30 de agosto de 2026 (commit `db0c708`, versión 0.4.52) · **Estado:** vigente

## Qué había antes

Cuatro tipos en pantalla: sangría, depósito al banco, refuerzo de fondo y pago a proveedor. El
cajero tenía que clasificar antes de capturar.

## Qué hacemos ahora

Dos botones, por la **dirección del dinero**:

| Botón | Enum en BD | Efectivo |
|---|---|---|
| Retiro | `SANGRIA` | sale |
| Depósito | `INYECCION_FONDO` | entra |

Lo que antes eran tipos (depósito al banco, pago a proveedor) ahora son **motivos** del retiro,
en un select con los frecuentes a un toque.

## Por qué

Para la caja solo existen dos hechos: el efectivo sale o entra. Lo demás —a quién, para qué, con
qué folio— se escribe igual de bien en un campo que en un botón.

Cuatro botones además invitaban a elegir mal: "depósito" y "sangría" restaban lo mismo, así que
equivocarse no movía el efectivo pero sí ensuciaba el reporte por tipo.

## Cuidado con el nombre

El enum `DEPOSITO` es el depósito **al banco**, que resta efectivo. El botón "Depósito" de esta
pantalla es lo contrario: dinero que entra. Emparejarlos por el nombre se lleva el corte al doble
del monto en sentido contrario. Está avisado en `apps/pos/app/lib/movimientos.ts`.

## Consecuencias

- El enum de la BD **no cambia** y el histórico queda intacto. `DEPOSITO` y `PAGO_PROVEEDOR`
  simplemente dejan de generarse desde el POS.
- Los reportes que desglosan por tipo verán, de aquí en adelante, solo dos valores.
