-- Fase 2 · Hub del local — tiempo real del KDS por LISTEN/NOTIFY (reemplaza el polling de 5s).
-- Local-only (lo aplica el runtime del desktop tras las migraciones; NO va a la nube, donde el
-- KDS usa Supabase Realtime). Notifica cuando un ticket cambia de estado de cocina, para que la
-- pantalla de cocina (y una 2ª caja) en la LAN reciban la orden al instante.
-- Corre en modo réplica-OFF (operación normal); durante el sync (replica=on) NO dispara → el KDS
-- no ve tickets históricos sincronizados, solo la operación viva. Idempotente.
CREATE OR REPLACE FUNCTION _vim_kds_notify() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Dispara al enviar a cocina (INSERT ya EN_COCINA) o al cambiar el estado de cocina.
  IF (TG_OP = 'INSERT' AND NEW.estado_cocina <> 'SIN_ENVIAR')
     OR (TG_OP = 'UPDATE' AND NEW.estado_cocina IS DISTINCT FROM OLD.estado_cocina) THEN
    PERFORM pg_notify('vim_kds', json_build_object(
      'ticket_id',     NEW.id,
      'sucursal_id',   NEW.sucursal_id,
      'estado_cocina', NEW.estado_cocina,
      'folio',         NEW.folio_completo,
      'modo_servicio', NEW.modo_servicio,
      'op',            TG_OP,
      'at',            extract(epoch from clock_timestamp())
    )::text);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vim_kds_notify ON tickets;
CREATE TRIGGER trg_vim_kds_notify
  AFTER INSERT OR UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION _vim_kds_notify();

-- LISTO por estación (0120, ADR 0018): cuando una estación marca sus renglones, la orden NO cambia
-- de estado_cocina hasta que termina la última, así que el trigger de arriba no avisa. Sin esto,
-- las demás pantallas de la LAN veían el cambio hasta el siguiente sondeo de 5 s. Un aviso por
-- sentencia y no por fila: marcar LISTO toca varios renglones del mismo ticket a la vez.
CREATE OR REPLACE FUNCTION _vim_kds_notify_items() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT t.id, t.sucursal_id, t.estado_cocina, t.folio_completo, t.modo_servicio
      FROM nuevas n
      JOIN viejas v ON v.id = n.id
      JOIN tickets t ON t.id = n.ticket_id
     WHERE n.listo_at IS DISTINCT FROM v.listo_at
  LOOP
    PERFORM pg_notify('vim_kds', json_build_object(
      'ticket_id',     r.id,
      'sucursal_id',   r.sucursal_id,
      'estado_cocina', r.estado_cocina,
      'folio',         r.folio_completo,
      'modo_servicio', r.modo_servicio,
      'op',            'LISTO_ESTACION',
      'at',            extract(epoch from clock_timestamp())
    )::text);
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_vim_kds_notify_items ON ticket_items;
CREATE TRIGGER trg_vim_kds_notify_items
  AFTER UPDATE ON ticket_items
  REFERENCING NEW TABLE AS nuevas OLD TABLE AS viejas
  FOR EACH STATEMENT EXECUTE FUNCTION _vim_kds_notify_items();
