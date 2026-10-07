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
- [ ] **A confirmar con Fermín: planes personalizados.** En el panel de VIM, la lista de planes que
      traen la lealtad sin cargo al concederla a mano (`PLANES_QUE_LO_INCLUYEN` en
      `apps/platform/app/lib/addons.ts`) es explícita; la base, en cambio, la da a todo plan
      distinto de Esencial. Un plan fuera de esa lista (los personalizados) se cobraría a $100 en el
      alta manual: quien la conceda debe revisar el precio, o se añade el plan a la lista.

## 1. Base de datos (producción)

- [ ] Respaldo de la base desde el panel de Supabase.
- [ ] Aplicar, en orden y de una en una: `0156_lealtad.sql`, `0157_lealtad_corte.sql`,
      `0158_lealtad_premio_sin_factura.sql`, `0159_lealtad_admin.sql`.
- [ ] **La 0159 va ANTES de mezclar.** Los reportes del admin piden `lealtad_mxn`: sin ella, el
      panel del día y el consolidado fallan en cuanto se despliega el admin.
- [ ] Comprobar: `select lealtad_mxn from tickets limit 1;` responde sin error.
- [ ] Comprobar: `select codigo, activo, precio_mensual_mxn from addons where codigo = 'LEALTAD';` → activo, 100.
- [ ] Comprobar a quién se le concedió:
      `select t.nombre from tenant_addons ta join tenants t on t.id = ta.tenant_id join addons a on a.id = ta.addon_id where a.codigo = 'LEALTAD';`
      Deben ser solo los negocios en Negocio y Cadena. Ninguno queda encendido: el interruptor es del dueño.
- [ ] Comprobar que el proceso diario quedó programado: `select jobname, schedule from cron.job where jobname ilike '%lealtad%';`

## 2. Funciones (producción)

- [ ] Desplegar `lealtad-canje` (nueva).
- [ ] Redesplegar `autofacturar` (pública: con `verify_jwt = false`, ver
      `reference_deploy_funciones_publicas`) y `timbrar-cfdi`.
- [ ] Probar el portal de autofactura con un ticket normal de producción: debe seguir facturando.

## 3. Mezclar

- [ ] PR #110 (1A) → `main`. Luego #112 (1B), luego el de 1C, cada uno ya con base `main`.
- [ ] Esperar el despliegue de Vercel de admin, panel y sitio. Abrir `/lealtad` en el admin de
      VIM Pruebas: debe verse la sección (Pruebas está en un plan que la incluye) o la tarjeta de «pídelo».

## 4. Instalador

- [ ] Seguir `desktop/RUNBOOK.md`, «Antes de empaquetar», completo. Versión `0.5.0`.
- [ ] `npm run verify:lealtad-canje` y `npm run verify:lealtad-pull` en verde en la máquina que empaqueta.
- [ ] El `.exe` pesa ~155 MB o más (uno de ~134 MB salió sin dependencias: no se publica).
- [ ] Instalar en **VIM Pruebas** y recorrer, con internet:
  - [ ] Guardar un programa de sellos en el admin, un premio, y encenderlo. En un minuto la caja lo muestra.
  - [ ] Venta con cliente → el ticket dice lo que ganó. El saldo aparece en Clientes del admin.
  - [ ] Canjear el premio → sale en $0.00, llega a cocina. Cobrar. El corte separa «Lealtad».
  - [ ] Ese ticket en el portal de autofactura → dice que no se factura por separado.
  - [ ] Cancelar una cuenta con canje → el saldo vuelve.
  - [ ] Cambiar el programa a puntos = dinero (confirma el reinicio) → canjear $ en una cuenta → el total baja.
  - [ ] Sin internet: la venta suma puntos al volver la red; el botón de canjear avisa que necesita internet.
  - [ ] Lealtad → Movimientos muestra todo lo anterior con el nombre del cajero.
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
  (o que el dueño apague el interruptor). Las cajas dejan de mostrarla en un minuto; los saldos se conservan.
- Las migraciones no se revierten: solo añaden. Con el programa apagado, `recalcular_totales_ticket`
  y `reporte_x` se comportan como antes.
- El instalador se retira volviendo a publicar `latest.json` con la 0.4.110.
