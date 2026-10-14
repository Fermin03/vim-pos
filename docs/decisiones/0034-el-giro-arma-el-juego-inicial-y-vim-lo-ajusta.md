# 0034 — El giro arma el juego inicial de módulos, y después solo VIM lo ajusta

**Fecha:** 14 de octubre de 2026 · **Estado:** vigente (entregas 1, 2 y 3)

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
- **Los clientes que ya existían conservan lo que veían:** todo encendido salvo `eventos`, que
  solo veía food truck, y `cuentas_barra`, que es nueva y solo arranca encendida en BAR.

## Cómo se despliega (no es obvio)

- **Un giro nuevo no se asigna hasta que todas las cajas conozcan el valor.** La caja baja la fila
  completa de `tenants`; si en la nube un negocio queda `BAR` y su caja no tiene la 0179, el pull
  entero de esa caja falla y deja de recibir catálogo, precios y empleados. Por eso la 0180 no
  convierte `CAFE_BAR` a `BAR`, y `cambiar_giro` responde `GIRO_NO_DISPONIBLE` para `BAR`,
  `CAFETERIA` y `TAQUERIA`. Se liberan con una migración cuando la 0179 haya viajado en un
  instalador que ya tengan todas las cajas.
- **El alta aplica el juego del giro desde la 0181, que viaja con las pantallas.** Antes de eso, un
  negocio registrado en el hueco perdería pantallas de golpe.
- **La 0181 apaga `eventos` a los negocios existentes que no son food truck,** para que ninguno vea
  el bloque de evento de golpe.
- **La 0182 ensancha el CHECK de `prospectos.giro`** (0084) para que `solicitar-demo` acepte `BAR`,
  `CAFETERIA` y `TAQUERIA` además de los seis giros de antes.
- **La 0183 apaga `cuentas_barra` a los negocios existentes que no son BAR** y cambia el valor por
  defecto a "todo encendido salvo `eventos` y `cuentas_barra`". También crea el índice único de
  nombres de barra y las tres RPC de cuentas de barra. **Antes de aplicarla**, en producción esta
  consulta debe regresar cero filas (si regresa alguna, el índice no se puede crear):

  ```sql
  SELECT sucursal_id, lower(btrim(nombre_cliente)), count(*) FROM tickets
  WHERE modo_servicio = 'BARRA' AND estado_fiscal IN ('BORRADOR','ABIERTO') AND deleted_at IS NULL
  GROUP BY 1, 2 HAVING count(*) > 1;
  ```

  Y se aplica fuera del horario de servicio: crear el índice bloquea las escrituras a `tickets`
  unos segundos.
- **Antes del merge se aplican a mano la 0179, la 0180, la 0181, la 0182 y la 0183**, cada una en su propia
  transacción. La 0179 y la 0180 no pueden ir juntas: Postgres responde "unsafe use of new value".

**Orden de lanzamiento:**

1. Migraciones 0179 → 0180 → 0181 → 0182 → 0183, a mano, cada una en su propia transacción.
2. Publicar como la más reciente el instalador de la caja que ya las trae. Un negocio que nace
   `BAR`, `CAFETERIA` o `TAQUERIA` baja ese instalador; si no conoce la 0179, su primer pull falla.
3. Desplegar las funciones: `provisionar-tenant`, `signup-tenant` (usa `_shared/alta.ts`) y
   `solicitar-demo`. Son las que dan de alta con los giros nuevos, y deben hacerlo cuando ya hay
   una caja que los entiende.
4. Mezclar. Vercel despliega admin, platform y pos.

## Por qué

Precio por giro ya se probó y se retiró (0002). Un molde fijo por giro no sirve para los negocios
mixtos (una hamburguesería con cuatro mesas). Que el dueño moviera los interruptores se descartó
por decisión de Fermín: cada cambio pasa por VIM.

Spec: `docs/superpowers/specs/2026-10-14-giros-y-modulos-de-operacion-design.md`.
