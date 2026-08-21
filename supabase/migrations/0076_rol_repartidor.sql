-- ============================================================================
-- 0076 — Rol REPARTIDOR.
--
-- El módulo de reparto a domicilio está construido desde hace meses —asignar, salida, entrega y
-- liquidación del efectivo que trae de vuelta— y nunca se pudo usar por una razón tonta: la
-- interfaz lista candidatos filtrando por el rol REPARTIDOR, y ese rol NO EXISTE. La lista salía
-- vacía siempre, así que no había a quién asignarle un pedido y todo el módulo quedó muerto.
--
-- La base nunca lo exigió: `asignar_delivery` solo valida que el ticket sea DELIVERY_PROPIO y
-- acepta cualquier usuario como repartidor. El muro estaba únicamente en la pantalla.
--
-- JERARQUÍA 2, la misma que CAJERO. Un repartidor maneja dinero del negocio —cobra en la puerta y
-- lo entrega al volver— así que necesita identidad propia para poder cuadrarle a él. Pero no
-- administra nada: con 2 queda por debajo del mínimo para entrar al panel, igual que el cajero.
--
-- Rol de SISTEMA (tenant_id NULL): sirve a todos los clientes, y así un negocio nuevo lo tiene sin
-- que nadie se acuerde de crearlo.
-- ============================================================================

INSERT INTO roles (tenant_id, codigo, nombre, descripcion, es_sistema, jerarquia, activo)
VALUES (
  NULL,
  'REPARTIDOR',
  'Repartidor',
  'Lleva pedidos a domicilio. Cobra en la puerta y entrega el dinero al regresar; se le liquida por pedido.',
  true,
  2,
  true
)
ON CONFLICT DO NOTHING;
