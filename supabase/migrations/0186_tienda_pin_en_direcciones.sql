-- 0186 · Tienda en línea: el pin del mapa se guarda con la dirección de la cuenta.
--
-- Hasta 0185 el pin del cliente («Por distancia») vivía solo en la memoria de la página y en el
-- pedido: en el segundo pedido a la misma dirección guardada el mapa salía vacío. Ahora cada
-- dirección de tienda_direcciones puede llevar su punto (lat, lng), y elegirla en la tienda lo pone.
--
-- Cuándo se guarda y cuándo se pierde:
--   · con p_punto (válido): se guarda ese punto, sea alta o edición;
--   · editar SIN p_punto («Mi cuenta», que no tiene mapa): si la dirección escrita no cambió (solo la
--     etiqueta, por ejemplo) el punto se queda; si cambió, el punto se borra — apuntaría a la casa
--     anterior. Lo mismo hace ya zona_envio_id. En el siguiente pedido el cliente lo vuelve a poner.
--
-- DATO PERSONAL. El punto es de la cuenta: se va al borrar la dirección o la cuenta (ON DELETE
-- CASCADE de siempre). No toca la purga de los 30 días, que es de los pedidos.
--
-- Cambian:
--   · tienda_direcciones: columnas lat, lng (las dos o ninguna).
--   · _tienda_direcciones (0166): cada dirección dice su `punto` ({lat, lng} o null).
--   · tienda_direccion_guardar (0166): parámetro nuevo p_punto, AL FINAL y con valor por omisión.
--     La firma cambia: la anterior se borra (con dos, PostgREST no sabría a cuál llamar).

ALTER TABLE tienda_direcciones ADD COLUMN IF NOT EXISTS lat numeric(9, 6) NULL;
ALTER TABLE tienda_direcciones ADD COLUMN IF NOT EXISTS lng numeric(9, 6) NULL;
ALTER TABLE tienda_direcciones DROP CONSTRAINT IF EXISTS tienda_direcciones_punto;
ALTER TABLE tienda_direcciones ADD CONSTRAINT tienda_direcciones_punto
  CHECK ((lat IS NULL) = (lng IS NULL) AND (lat IS NULL OR (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180)));
COMMENT ON COLUMN tienda_direcciones.lat IS
  'El pin del mapa de esta dirección (0186), con lng. Lo pone el cliente al pedir; se borra si edita la dirección escrita.';

-- _tienda_direcciones: cuerpo de 0166 con `punto`.
CREATE OR REPLACE FUNCTION _tienda_direcciones(p_tenant uuid, p_cuenta uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', d.id, 'etiqueta', d.etiqueta, 'calle', d.calle, 'numero_exterior', d.numero_exterior,
           'numero_interior', d.numero_interior, 'colonia', d.colonia, 'codigo_postal', d.codigo_postal,
           'ciudad', d.ciudad, 'estado', d.estado, 'referencias', d.referencias,
           'punto', CASE WHEN d.lat IS NOT NULL THEN jsonb_build_object('lat', d.lat, 'lng', d.lng) END)
           ORDER BY d.created_at, d.id), '[]'::jsonb)
    FROM tienda_direcciones d
   WHERE d.tenant_id = p_tenant AND d.cuenta_id = p_cuenta;
$$;

-- tienda_direccion_guardar: cuerpo de 0166. Cambios: p_punto (validado con _tienda_punto de 0185;
-- uno que no cuadra es DIRECCION_INVALIDA) y, al editar, qué pasa con el punto (ver arriba).
DROP FUNCTION IF EXISTS tienda_direccion_guardar(uuid, uuid, uuid, text, jsonb);
CREATE OR REPLACE FUNCTION tienda_direccion_guardar(p_tenant uuid, p_cuenta uuid, p_id uuid, p_etiqueta text, p_direccion jsonb,
                                                    p_punto jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_etiqueta text := COALESCE(NULLIF(btrim(p_etiqueta), ''), 'Casa');
  v_ok    boolean;
  v_dir   jsonb;
  v_punto jsonb := _tienda_punto(p_punto);
  v_igual boolean;
BEGIN
  SELECT bool_and(char_length(x.valor) BETWEEN k.minimo AND k.maximo),
         jsonb_object_agg(k.clave, x.valor) FILTER (WHERE x.valor <> '')
    INTO v_ok, v_dir
    FROM (VALUES ('calle', 1, 255), ('numero_exterior', 1, 20), ('numero_interior', 0, 20), ('colonia', 1, 150),
                 ('codigo_postal', 5, 5), ('ciudad', 1, 100), ('estado', 1, 50), ('referencias', 0, 300)) AS k(clave, minimo, maximo)
   CROSS JOIN LATERAL (SELECT btrim(COALESCE(CASE WHEN jsonb_typeof(p_direccion) = 'object' THEN p_direccion ->> k.clave END, ''))) AS x(valor);
  IF (v_ok AND v_dir ->> 'codigo_postal' ~ '^[0-9]{5}$' AND char_length(v_etiqueta) <= 50) IS NOT TRUE
     OR (p_punto IS NOT NULL AND v_punto IS NULL) THEN
    RAISE EXCEPTION 'DIRECCION_INVALIDA: hacen falta calle, número, colonia, código postal de 5 dígitos, ciudad y estado; la etiqueta, de hasta 50 caracteres; y el punto, si viene, {lat, lng} en rango';
  END IF;

  -- La fila de la cuenta, con candado: dos altas a la vez no pasan las dos el tope.
  PERFORM 1 FROM tienda_cuentas WHERE id = p_cuenta AND tenant_id = p_tenant AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUENTA_INVALIDA: la cuenta no existe en este negocio'; END IF;

  IF p_id IS NULL THEN
    IF (SELECT count(*) FROM tienda_direcciones WHERE cuenta_id = p_cuenta AND tenant_id = p_tenant) >= 5 THEN
      RAISE EXCEPTION 'DIRECCIONES_LLENAS: una cuenta guarda hasta 5 direcciones';
    END IF;
    -- created_at con el reloj real y no el de la transacción: es el orden de la lista.
    INSERT INTO tienda_direcciones (cuenta_id, tenant_id, etiqueta, calle, numero_exterior, numero_interior,
                                    colonia, codigo_postal, ciudad, estado, referencias, lat, lng, created_at)
    VALUES (p_cuenta, p_tenant, v_etiqueta, v_dir ->> 'calle', v_dir ->> 'numero_exterior', v_dir ->> 'numero_interior',
            v_dir ->> 'colonia', v_dir ->> 'codigo_postal', v_dir ->> 'ciudad', v_dir ->> 'estado', v_dir ->> 'referencias',
            (v_punto ->> 'lat')::numeric, (v_punto ->> 'lng')::numeric, clock_timestamp());
  ELSE
    -- ¿La misma dirección escrita? (Las referencias no cuentan: no mueven la casa.)
    SELECT (calle, numero_exterior, numero_interior, colonia, codigo_postal, ciudad, estado) IS NOT DISTINCT FROM
           (v_dir ->> 'calle', v_dir ->> 'numero_exterior', v_dir ->> 'numero_interior', v_dir ->> 'colonia',
            v_dir ->> 'codigo_postal', v_dir ->> 'ciudad', v_dir ->> 'estado')
      INTO v_igual
      FROM tienda_direcciones WHERE id = p_id AND cuenta_id = p_cuenta AND tenant_id = p_tenant;
    UPDATE tienda_direcciones
       SET etiqueta = v_etiqueta, calle = v_dir ->> 'calle', numero_exterior = v_dir ->> 'numero_exterior',
           numero_interior = v_dir ->> 'numero_interior', colonia = v_dir ->> 'colonia',
           codigo_postal = v_dir ->> 'codigo_postal', ciudad = v_dir ->> 'ciudad', estado = v_dir ->> 'estado',
           referencias = v_dir ->> 'referencias', zona_envio_id = NULL,
           lat = CASE WHEN v_punto IS NOT NULL THEN (v_punto ->> 'lat')::numeric WHEN v_igual THEN lat END,
           lng = CASE WHEN v_punto IS NOT NULL THEN (v_punto ->> 'lng')::numeric WHEN v_igual THEN lng END
     WHERE id = p_id AND cuenta_id = p_cuenta AND tenant_id = p_tenant;
  END IF;
  RETURN _tienda_direcciones(p_tenant, p_cuenta);
END;
$$;

REVOKE ALL ON FUNCTION _tienda_direcciones(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION tienda_direccion_guardar(uuid, uuid, uuid, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_direccion_guardar(uuid, uuid, uuid, text, jsonb, jsonb) TO service_role;
