# 0025 — El inventario se cierra por plan sin tocar la venta, y en la caja manda la nube

**Fecha:** 2026-10-01 · **Estado:** vigente

## Qué había

- El sitio dice que inventario, recetas y mermas vienen **"desde Negocio"**.
- **ADR 0014:** los módulos tienen dos capas — VIM permite (plan + excepción), el dueño enciende.
  El de inventario se llama `recetas` ("Recetas e inventario") y desde 0103 es `false` en Esencial.
- Nadie lo aplicaba: `modulos_efectivos` lo calculaba y solo lo leía la caja en sus directivas. Un
  negocio en Esencial daba de alta insumos, recetas y compras y encendía el descuento
  (`apps/admin/app/lib/inventario.ts`, un `upsert` sin más).
- **ADR 0013 / D32:** el inventario nunca bloquea una venta.

## Qué hacemos ahora (migración 0148)

1. **No hay módulo nuevo.** El candado usa `recetas`, con la excepción por cliente que el panel ya
   tenía ("Permitir" en la ficha → `tenant_feature_flags`). `inventario_permitido(tenant)` es esa
   regla en una función chica; `planes.features_incluidos.inventario` (0086) sigue siendo
   descriptivo y no lo lee nadie.

2. **Escribir sin el módulo se rechaza con un trigger**, en insumos, recetas y sus componentes,
   proveedores, compras y sus líneas, y en los movimientos **manuales**. El mensaje es el que ve el
   dueño: "El inventario viene desde el plan Negocio. Escríbenos y lo activamos." Solo actúa sobre
   roles sujetos a RLS; `service_role` y las funciones del sistema pasan.

3. **La venta no pasa por el candado.** Dos capas:
   - el interruptor del dueño (`modulo_inventario_activo`) **no puede estar encendido sin el
     módulo**: no se deja encender, y se apaga solo al perder el permiso (bajar de plan, quitar la
     excepción). Todas las funciones de venta ya leen ese interruptor: apagado, no descuentan.
     **No se tocó ninguna función de cobro, de descuento ni de reversa.**
   - los movimientos que genera una venta (`SALIDA_VENTA`, `SALIDA_MODIFICADOR_EXTRA`,
     `REVERSA_CANCELACION`) están fuera del candado aunque el negocio no tenga el módulo.

4. **Nadie pierde lo que ya usa.** La migración concede el módulo por excepción a todo negocio que
   ya tenga insumos o recetas y cuyo plan no lo incluya (`inventario_respetar_uso_previo()`, por
   los datos, no por nombre). Una excepción que VIM hubiera puesto a propósito para negarlo no se
   pisa.

5. **En la caja instalada el candado no actúa.** La caja aplica las mismas migraciones a su
   Postgres local, donde no hay planes fiables ni excepciones (no viajan en el pull). Ahí
   `inventario_permitido` contesta siempre que sí y la caja obedece el interruptor que le baja de
   la nube ya resuelto. Se detecta como en 0125 (`_vim_migraciones`).

6. **El panel del dueño no esconde la sección.** Inventario (y Recetas, en Catálogo) siguen en el
   menú, marcadas "Plan Negocio"; dentro, en lugar de las pantallas, una explicación tranquila de
   lo que incluye y un botón de WhatsApp con el mensaje ya escrito. Sin precios.

## Por qué

- **Trigger y no RLS ni cada RPC.** `guardar_receta`, `registrar_compra`, `anular_compra` y
  `aplicar_movimiento_inventario` son SECURITY INVOKER y el panel además escribe `insumos` y
  `proveedores` directo. Un trigger los cubre a todos con un mensaje que se entiende; una política
  restrictiva contestaría "violates row-level security" o cero filas en silencio; y tocar cuatro
  RPC es copiar cuatro cuerpos para añadir la misma línea.
- **El interruptor como invariante, y no un `IF` en las funciones de venta.** El descuento está en
  cinco funciones distintas (cobro, reabrir cuenta, cancelación, devolución, `descontar_…`), varias
  ya reescritas tres veces. Añadirles la regla del plan era tocar el camino del dinero para algo
  que se resuelve en la tabla de configuración — y en la caja esas mismas funciones no sabrían
  contestar la pregunta del plan.
- **Ante la duda, el panel deja pasar.** Si la lectura de módulos falla se enseñan las pantallas:
  decirle "viene desde el plan Negocio" a quien sí lo paga, por un fallo de red, es peor, y la
  base rechaza igual lo que no toca.

## Consecuencias

- **Un negocio que baja a Esencial conserva sus insumos y recetas** pero deja de verlos y de
  poder editarlos; su descuento se apaga. Al volver a subir, lo enciende él: recuperar el permiso
  no enciende nada.
- **Una excepción con fecha de fin** (`fecha_fin`) que venza sola no dispara el apagado del
  interruptor: no hay nada que corra a esa hora. El panel no escribe fechas de fin hoy; si un día
  lo hace, hace falta un barrido. Mientras tanto la venta seguiría descontando (no falla) y las
  pantallas ya estarían cerradas.
- **Una caja con el interruptor viejo** (bajó de plan y aún no hace pull, hasta una hora) sigue
  descontando y sube esos movimientos; la nube los acepta y ajusta existencias. No hay error ni
  reintento infinito; tras el pull, deja de descontar.
- **Leer no se cerró.** Reportes de costo y los datos viejos siguen legibles por RLS. El candado
  es de escritura; lo que se oculta es la pantalla.
- **La regla de "permitido" vive dos veces en SQL** (`modulos_efectivos` e
  `inventario_permitido`); pgTAP 0032 comprueba que digan lo mismo.
- **Los smokes corren también en el Postgres de la caja**, donde el candado no actúa:
  `smoke_inventario_plan.sql` tiene una rama para eso. Lo que depende del rol está en pgTAP 0032.
