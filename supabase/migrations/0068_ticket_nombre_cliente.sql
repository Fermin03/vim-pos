-- ============================================================================
-- 0068 — `tickets.nombre_cliente`: nombre suelto para identificar una cuenta.
--
-- Pick-up necesita saber de quién es cada pedido ("Juan", "la señora del suéter rojo") sin
-- dar de alta un cliente: son nombres de un solo uso y llenarían el CRM de basura. Por eso NO
-- se crea fila en `clientes` ni se toca `cliente_id`; esto es una etiqueta del ticket.
--
-- Va en la tabla y no solo en la pantalla porque la lista de "cuentas por recolectar" se
-- relee de la BD: si el nombre viviera únicamente en el estado de React, se perdería en
-- cuanto el cajero volviera a la lista —justo cuando hace falta— y no lo vería otra caja.
--
-- No estorba a `cliente_id`: cuando sí hay cliente registrado (domicilio) ese sigue mandando y
-- este campo queda nulo.
--
-- Migración ADITIVA e idempotente. Mientras la nube no tenga la columna, el push de sync la
-- ignora sin fallar: `_vim_apply_rows` (mig. 0056) arma la lista de columnas leyendo el
-- information_schema del DESTINO, y jsonb_populate_recordset descarta las claves que sobran.
-- ============================================================================

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS nombre_cliente varchar(100) NULL;

COMMENT ON COLUMN public.tickets.nombre_cliente IS
  'Nombre suelto para identificar la cuenta (Pick-up). NO es un cliente registrado: para eso está cliente_id.';
