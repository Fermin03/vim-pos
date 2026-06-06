-- F8 fix #24 — el trigger de cambio de estado CFDI (0009 §11, trg ...cfdi_estado...)
-- registra auditoría con categoria 'FISCAL', pero ese valor nunca se agregó al enum
-- evento_categoria (válidos: AUTENTICACION/TURNO/CAJA/VENTA/COBRO/DESCUENTO/COCINA/
-- CONFIGURACION/CATALOGO/USUARIOS/SISTEMA/OTRO). Mismo patrón que #22 ('CIERRES') y
-- #23 ('CANCELACION'), pero aquí 'FISCAL' es una categoría genuinamente distinta que el
-- autor del esquema pretendía → se AGREGA al enum en vez de mapear a otra.
-- Cazado por smoke_cfdi_timbrado.sql (cfdi_marcar_timbrado → cfdi_sat_movimientos → trigger).

ALTER TYPE evento_categoria ADD VALUE IF NOT EXISTS 'FISCAL';
