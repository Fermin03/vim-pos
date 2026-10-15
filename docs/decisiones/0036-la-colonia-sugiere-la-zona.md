# 0036 — La colonia sugiere la zona; el domicilio la guarda

**Fecha:** 15 de octubre de 2026 · **Estado:** vigente · **Amplía** [0017](0017-el-envio-es-un-renglon.md)
y [0035](0035-el-envio-por-distancia-es-una-zona-por-tramo.md).

## Qué había antes

La colonia de un domicilio era texto libre y la zona de envío se elegía aparte, de memoria. El mismo
cliente podía quedar en zonas distintas según quién lo capturara, y el CP se guardaba como «00000»
cuando nadie lo sabía.

## Qué hacemos ahora

Cada sucursal tiene un **catálogo de colonias** (`colonias`, migración 0187), cada una con su zona.
Al escribir la colonia, la caja la sugiere y la zona y el CP salen solos. El catálogo se siembra desde
**SEPOMEX** (`sepomex_asentamientos`, nacional, solo en la nube, de solo lectura): `sembrar_colonias`
toma el municipio del CP de la sucursal, inserta sus asentamientos y hereda la zona más usada en el
historial de domicilios. El admin lo gestiona en Configuración → Envíos → Colonias.

**La colonia sugiere; el domicilio guarda.** `direcciones_cliente` no cambia de forma: sigue con su
colonia en texto, su CP y su propia zona.

**Quién cambia qué.** `asignar_zona_colonia` asigna sin PIN a una colonia sin zona viva; cambiar una
zona ya asignada exige el PIN `descuento.override_precio` (el admin no lo necesita). Las zonas de
tramo (0185) no se eligen a mano.

**En la tienda, la colonia con zona manda** en cualquier modo de envío: el pedido guarda el nombre y
el CP del catálogo. La cotización pública solo expone `por_colonia: boolean`, no la zona.

## Por qué

Es como lo resuelve Soft Restaurant y quita la memoria del cajero. SEPOMEX vive solo en la nube porque
son ~145 mil filas que la caja no necesita y no deben viajar en el instalador. Las colonias sí viajan
en los dos sentidos con huella libreta, igual que `zonas_envio`.

## Alternativas descartadas

- **Un `colonia_id` en el domicilio.** El domicilio ya guarda su zona; atarlo al catálogo haría que
  editar una colonia moviera domicilios viejos.
- **Dejar que el cliente de la tienda escriba en el catálogo.**
- **Recalcular la zona de domicilios guardados** al cambiar la de su colonia.

## Consecuencias

- Cambiar la zona de una colonia **no toca domicilios viejos**; vale para domicilios nuevos o al
  volver a elegir la colonia.
- Entre caja y panel **gana el último que escribe**, como en las zonas.
- Una **caja vieja** sigue con texto libre y sube sus colonias sin las columnas que no conoce.
- Llave normalizada `lower(f_unaccent(btrim(x)))` (no `f_unaccent(lower(...))`): el Postgres embebido
  corre con locale C y `lower` no baja acentos. El push a la nube **fusiona** colonias que chocan
  por llave.
- Si la actualización del catálogo falla en la caja, el modal se queda abierto con un botón
  «Continuar» (el domicilio se guarda aunque el catálogo no).
- Una colonia escrita exactamente igual a la del catálogo cuenta como elegida.
- El CP de respaldo es el de la sucursal y, si no hay, «00000».
- El modal «asignar cliente a la cuenta» del POS conserva la colonia en texto libre.
- `sembrar_colonias` devuelve `{insertadas, heredadas}`.
