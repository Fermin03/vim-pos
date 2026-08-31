# 0006 — Agregar productos a una cuenta usa la misma pantalla de venta

**Fecha:** 30 de agosto de 2026 (commit `9a11454`, versión 0.4.51) · **Estado:** vigente

## Qué había antes

Dos pantallas casi idénticas: la de capturar un ticket nuevo, y "Productos extra" para agregarle
cosas a una cuenta ya abierta. La segunda era una **copia de solo lectura**: no dejaba cambiar
cantidades, ni escribir notas, ni quitar renglones.

## Qué hacemos ahora

Las dos son el **mismo componente** (`SidebarTicket`). La tanda se captura en local y se guarda
completa al confirmar, igual que un ticket nuevo.

## Por qué

Un doble toque solo se deshacía saliendo de la pantalla y cancelando el producto desde el detalle
de la cuenta —con motivo, y con PIN de supervisor si ya iba en cocina—. Por un dedazo de tres
segundos.

Y lo más caro: el mismo gesto se comportaba distinto en dos pantallas que se ven iguales. El
cajero aprende una y la otra lo traiciona en la hora pico.

Ser el mismo componente, y no una copia parecida, es lo que impide que vuelvan a separarse.

## Consecuencias

- **Si la caja se cierra a media captura, esa tanda se pierde.** Antes se guardaba renglón por
  renglón. Fue una decisión consciente: es lo que permite corregir sin ir a la base de datos en
  cada toque.
- La pantalla sigue mostrando **solo la tanda**, no lo que la cuenta ya traía. Lo único que el
  cajero quiere saber ahí es qué acaba de capturar.
