# Salida de la lealtad — caja 0.5.0

Lista para quien publique. Nada de esto lo hace un agente: toca producción.
El orden importa: **base y funciones primero, mezclar después, instalador al final.**

## 0. Antes de empezar

- [ ] Fermín revisó y dio el OK a la lista de lo que incluye la versión (abajo, «Nota de versión»).
- [ ] El contador confirmó el criterio de facturas: cuenta con premio de regalo → sin factura
      individual, sí en la global; canje de puntos por dinero → factura normal.
- [ ] Es un día y hora sin servicio en los negocios en producción (las migraciones redefinen
      `recalcular_totales_ticket` y `reporte_x`).
- [ ] CI de los tres PR en verde. El de pruebas (pgTAP) solo corre contra `main`: cambia la base
      del PR #110 a `main` (o ábrelo ya contra `main`) y espera a que pase antes de seguir.

## 1. Base de datos (producción)

- [ ] Respaldo de la base desde el panel de Supabase.
- [ ] Aplicar, en orden y de una en una: `0156_lealtad.sql`, `0157_lealtad_corte.sql`,
      `0158_lealtad_premio_sin_factura.sql`, `0159_lealtad_admin.sql`.
- [ ] **La 0159 va ANTES de mezclar.** Los reportes del admin piden `lealtad_mxn`: sin ella, el
      panel del día y el consolidado fallan en cuanto se despliega el admin.
- [ ] Comprobar: `select lealtad_mxn from tickets limit 1;` responde sin error.
- [ ] Comprobar: `select codigo, activo, precio_mensual_mxn from addons where codigo = 'LEALTAD';` → activo, 100.
- [ ] Comprobar a quién se le concedió:
      `select t.nombre_comercial, ta.precio_mensual_mxn, ta.incluido_en_plan from tenant_addons ta join tenants t on t.id = ta.tenant_id join addons a on a.id = ta.addon_id where a.codigo = 'LEALTAD' and ta.activo;`
      Deben ser solo negocios cuyo plan la incluye: Negocio, Cadena y los planes por giro (`FT`,
      `QS`, `CB`, `FS`, `DK`, `ENT`). Es la misma lista en la base (`lealtad_incluido`, 0156) y en el
      panel (`PLANES_QUE_LO_INCLUYEN`); Esencial y cualquier plan fuera de ella (uno personalizado)
      la pagan aparte. Ninguno queda encendido: el interruptor es del dueño.
- [ ] **El relleno se guía por suscripciones ACTIVAS.** Un negocio con la suscripción pausada o sin
      fila de suscripción no la recibe aunque su plan la incluya. Contrastar contra el plan del negocio:
      `select t.nombre_comercial, p.codigo from tenants t join planes p on p.id = t.plan_actual_id where coalesce((p.features_incluidos->>'lealtad_incluido')::boolean, false) and not exists (select 1 from tenant_addons ta join addons a on a.id = ta.addon_id where ta.tenant_id = t.id and a.codigo = 'LEALTAD' and ta.activo);`
      A los que salgan y sigan siendo clientes se les concede a mano desde el panel (ficha del
      cliente → Extras → Programa de lealtad; el precio se pre-llena en $0).
- [ ] Comprobar que el proceso diario quedó programado: `select jobname, schedule from cron.job where jobname ilike '%lealtad%';`

## 2. Funciones (producción)

- [ ] Desplegar `lealtad-canje` (nueva).
- [ ] Redesplegar `autofacturar` (pública: con `verify_jwt = false`, ver
      `reference_deploy_funciones_publicas`) y `timbrar-cfdi`.
- [ ] Probar el portal de autofactura con un ticket normal de producción: debe seguir facturando.
- [ ] Probar también una factura de un ticket normal **desde el admin** (no solo el portal):
      `timbrar-cfdi` ahora falla cerrado —si no puede comprobar que la cuenta no lleva un premio, no
      timbra—, así que un error ahí detendría toda la facturación del admin, no solo la de premios.

## 3. Mezclar

- [ ] PR #110 (1A) → `main`. Luego #112 (1B), luego el de 1C, cada uno ya con base `main`.
- [ ] Esperar el despliegue de Vercel de admin, panel y sitio. Abrir `/lealtad` en el admin de
      VIM Pruebas: debe verse la sección (Pruebas está en un plan que la incluye) o la tarjeta de «pídelo».

## 4. Instalador

- [ ] Seguir `desktop/RUNBOOK.md`, «Antes de empaquetar», completo. Versión `0.5.0`.
- [ ] `npm run verify:lealtad-canje` y `npm run verify:lealtad-pull` en verde en la máquina que empaqueta.
- [ ] El `.exe` pesa ~155 MB o más (uno de ~134 MB salió sin dependencias: no se publica).
- [ ] Instalar en **VIM Pruebas** y recorrer, con internet:
  - [ ] Guardar un programa de sellos en el admin, un premio, y encenderlo. El programa y el premio llegan a la caja en un minuto; que la caja lo MUESTRE (saldo, «Canjear puntos», pie del ticket) puede tardar hasta 10 minutos, porque el encendido viaja con el reporte periódico de la caja.
  - [ ] Venta con cliente → el ticket dice lo que ganó. El saldo aparece en Clientes del admin.
  - [ ] Canjear el premio → sale en $0.00, llega a cocina. Cobrar. El corte separa «Lealtad».
  - [ ] Ese ticket en el portal de autofactura → dice que no se factura por separado.
  - [ ] Cancelar una cuenta con canje → el saldo vuelve.
  - [ ] Cambiar el programa a puntos = dinero (confirma el reinicio) → canjear $ en una cuenta → el total baja.
  - [ ] Sin internet: la venta suma puntos al volver la red; el botón de canjear avisa que necesita internet.
  - [ ] Lealtad → Movimientos muestra todo lo anterior con el nombre del cajero.
  - [ ] Subir de plan sin perder el programa: con el negocio en Esencial, la lealtad concedida de
        pago ($100) y el programa encendido, cambiarlo desde el panel a un plan que la incluye →
        el programa **sigue encendido**, el extra queda a $0 «incluido en el plan» y la fila de
        pago queda cerrada. (Al terminar, regresar el negocio a su plan.)
- [ ] Apagar el programa en VIM Pruebas al terminar, o dejarlo como demo: decisión de Fermín.

## 5. Publicar

- [ ] Martes antes de las 10:00 (`docs/operacion/actualizaciones.md`).
- [ ] Subir el instalador a `Fermin03/vim-pos-descargas`, firmar, y publicar `latest.json` desde
      `/versiones` escribiendo TODOS los campos (`reference_publicar_latest_json`).
- [ ] Tag `v0.5.0`.
- [ ] Corregir la fecha de `sitio-web/novedades.html` si no se publicó el 13 de octubre.
- [ ] Actualizar primero el hub de cada negocio y después sus cajas.

## Cosas que conviene saber (no bloquean la salida)

- Las cifras de Lealtad → Movimientos (repartido, canjeado, saldo vivo) cuentan solo la forma de
  ganar vigente; el libro de abajo muestra todos los movimientos, también los de una forma
  anterior. Tras cambiar de forma de ganar no cuadran entre sí, a propósito.
- El bloqueo «no cambiar al cliente con un canje a medias» vive en el almacenamiento local de esa
  caja: desde otra terminal no se ve.
- Pendiente del sitio: la sección de Lealtad en `funciones.html` no tiene captura (se hace con la
  semilla de demostración).
- Pendiente: regenerar los tipos (`pnpm db:types`), que no se puede correr en local.

## Nota de versión (sin jerga, sin nombres ni números de clientes)

> **Nuevo: programa de lealtad.** Tus clientes ganan puntos o sellos cada vez que compran y los
> canjean en su siguiente visita. Tú eliges cómo ganan y qué reciben. Lo encuentras en tu panel,
> en Lealtad. En la caja, asigna un cliente a la cuenta y usa «Canjear puntos».
> Canjear necesita internet. En el plan Esencial es un extra; pregúntanos por WhatsApp.

## Si algo sale mal

- La lealtad se apaga sin desinstalar nada: quitar el extra LEALTAD al negocio desde el panel
  (o que el dueño apague el interruptor). Las cajas dejan de mostrarla en un máximo de 10 minutos; los saldos se conservan.
- Las migraciones no se revierten: solo añaden. Con el programa apagado, `recalcular_totales_ticket`
  y `reporte_x` se comportan como antes.
- El instalador se retira volviendo a publicar `latest.json` con la 0.4.110.
