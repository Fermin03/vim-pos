# Clip PinPad: plan de construcción (sin lector)

> **Para agentes:** SUB-SKILL REQUERIDA: superpowers:subagent-driven-development (recomendada) o
> superpowers:executing-plans, tarea por tarea. Los pasos usan casillas (`- [ ]`).

**Meta:** que una caja ligada a un lector Clip cobre con tarjeta igual que hoy cobra con Mercado
Pago Point, con todo listo para probar en cuanto llegue la app PinPad y la credencial de Knock-Out.

**Arquitectura:** lo común (estados, reglas de cambio, columnas) sale de `mercado-pago.ts` a
`comun.ts`. Cada proveedor es un adaptador con la misma forma, y `terminal-cobro` elige uno según la
`proveedor` de la conexión de la caja. Clip trae su propia función de conexión (el dueño pega la
clave) y su propio aviso (sin firma: siempre se confirma consultando a Clip). La caja no sabe qué
proveedor hay detrás, salvo por un texto y el «terminal no disponible».

**Tecnología:** Edge Functions en Deno (`_shared` probado con `node --test --experimental-strip-types`),
Postgres + Vault, Next.js (admin y POS), React.

**Diseño:** [`02-diseno-integracion-vimpos.md`](02-diseno-integracion-vimpos.md) (lo que cambia con
Clip) sobre [`../mercado-pago-point/02-diseno-integracion-vimpos.md`](../mercado-pago-point/02-diseno-integracion-vimpos.md).
API: [`01-resumen-api.md`](01-resumen-api.md) y `referencia-api/`.

## Restricciones globales

- **Todo en local:** rama `feat/terminal-clip` en el worktree `C:\vwtClip`. Sin push, sin PR, sin
  migraciones ni funciones en producción hasta probar con el lector y tener el OK de Fermín.
- **Mercado Pago no cambia de comportamiento.** Sus pruebas (`_shared/terminal/*.test.ts`) siguen en
  verde sin tocar sus aserciones; Knock-Out cobra con él a diario.
- Migración **0260** (los números 0188–0250 los ocupan ramas locales de retail, belleza, servicios y
  consultorio). ADR **0050**, por la misma razón. Para producción hará falta `--include-all`.
- Dinero como texto con dos decimales (`montoTexto`), nunca float. `numeric(12,2)` en la base.
- La clave secreta de Clip nunca vuelve al navegador, nunca se escribe en `registrarError` ni en
  `terminal_eventos`, y solo vive en Vault.
- Español en el dominio; sin `any` (`unknown` + validación).
- **Todo lo que la documentación de Clip no confirma se marca `SIN VERIFICAR`** en un comentario,
  como hace `mercado-pago.ts` con lo `VERIFICADO`. Un estado desconocido nunca es APROBADO.
- Cargar la skill `ponytail` antes de cada tarea de código (CLAUDE.md del workspace).
- Pruebas: `pnpm test:functions` desde la raíz de `vim-pos/`; smokes SQL con `npm run smokes` en
  `desktop/`; tipos con `pnpm -F <app> exec tsc --noEmit` (nunca `next build`: rompe el dev server).

## Fuera de esta entrega (decisiones mías, se revisan con el lector)

- **Propina elegida en el lector.** Hoy la caja pregunta la propina antes de elegir el método y la
  manda incluida en el total (igual que con Mercado Pago). Cambiarlo depende de cómo regresa
  `tip_amount` y si `amount_paid` la incluye, que solo se sabe con un cobro real. Esta entrega manda
  `is_tip_enabled: false` y deja guardados los porcentajes (columna y pantalla) para encenderla después.
- **Cobro de prueba de $1 automático** en la pantalla del admin: se hace a mano en la prueba con lector.
- Recorrido con `curl` y skill `clip-pinpad`: entrega siguiente, con el lector.

## Puntos a vigilar en la revisión

1. **Petición sin respuesta al crear** (timeout de 15 s): no hay llave de idempotencia. Lo esperado:
   se cancela por número de serie y el cobro queda `RECHAZADO` con detalle `SIN_RESPUESTA`, para que
   reintentar cree otro con otro id. Nunca se reintenta la misma llamada.
2. **Aviso falso o repetido** a `terminal-webhook-clip`: solo provoca una consulta a Clip, con tope
   por cobro. Un `?c=` que no es uuid o no existe responde 200 sin consultar nada.
3. **Clave equivocada al conectar:** Clip responde 401 y no se guarda nada; el mensaje lo dice claro.
4. **Lector apagado o con la app cerrada** (`ERR10_04`, `PINPAD_TERMINAL_TIMEOUT_EXCEPTION`, o
   `devices/status` distinto de `active`): la caja dice «Terminal no disponible» y deja el registro
   manual.
5. **Cancelar con el cobro ya tomado por el lector:** la cancelación falla y la caja sigue esperando
   con «Cancélalo en la terminal» (ya existe con `cancelacion: "FALLO"`).

---

### Tarea 1: Migración 0260 y lo común de los proveedores

**Archivos:**
- Crear: `supabase/migrations/0260_terminal_clip.sql`
- Crear: `supabase/functions/_shared/terminal/comun.ts`
- Modificar: `supabase/functions/_shared/terminal/mercado-pago.ts` (quitar lo que se mueve; reexportarlo)
- Modificar: `supabase/functions/_shared/terminal/cuerpo.ts` (importar `montoTexto` de `comun.ts`)
- Modificar: `supabase/tests/0039_terminal.test.sql`
- Modificar: `packages/` tipos de la base (`pnpm db:types`)

**Interfaces:**
- Produce `comun.ts`: `EstadoCobro`, `DatosCobro` (agrega `propina_mxn: string | null`), `montoTexto`,
  `aceptaCambio`, `cambiosDeCobro` (incluye `propina_mxn`), `txt`, `obj`. `mercado-pago.ts` los
  reexporta para no tocar a quien ya los importa.
- Produce en la base: `terminal_conexiones.proveedor IN ('MERCADO_PAGO','CLIP')`;
  `terminal_config_sucursal.latitud/longitud` sin NOT NULL (el CHECK de rango se queda);
  `terminal_config_sucursal.propina_opciones smallint[] NULL` con CHECK de 1 a 3 elementos entre 1 y
  100; `terminal_dispositivos.caja_id_externo` sin NOT NULL; `terminal_cobros.propina_mxn numeric(12,2) NULL`.

- [ ] **Paso 1:** en `0039_terminal.test.sql` agregar casos: se inserta una conexión `CLIP`; una
  config de sucursal sin coordenadas; `propina_opciones = '{10,15,20}'` pasa y `'{10,15,20,25}'` y
  `'{0}'` fallan; un proveedor `NETPAY` falla.
- [ ] **Paso 2:** correr `npm run smokes` en `desktop/`. Debe fallar en esos casos.
- [ ] **Paso 3:** escribir la 0260 (solo DDL: corre también en el Postgres de la caja). Comentario de
  cabecera: en Clip, `terminal_guardar_tokens` guarda la **API key como `access`** y la **clave
  secreta como `refresh`**, con `vence` NULL (no caducan; la renovación diaria filtra por
  `MERCADO_PAGO` y `vence_at` NULL nunca entra).
- [ ] **Paso 4:** smokes en verde.
- [ ] **Paso 5:** mover a `comun.ts` y reexportar desde `mercado-pago.ts`. `pnpm test:functions` en
  verde sin cambiar ninguna prueba existente.
- [ ] **Paso 6:** `pnpm db:types`; commit `feat(terminal): la base admite Clip (0260)`.

### Tarea 2: Adaptador de Clip

**Archivos:**
- Crear: `supabase/functions/_shared/terminal/clip.ts`
- Crear: `supabase/functions/_shared/terminal/clip.test.ts`

**Interfaces:**
- Consume: `comun.ts` (Tarea 1).
- Produce:
  - `estadoDeIntencion(status: unknown, aprobadas: number): EstadoCobro` — `COMPLETED` con al menos
    una transacción `approved` → `APROBADO`; `PENDING` y `PAYMENT_PENDING` → `EN_TERMINAL`;
    `FAILED` → `RECHAZADO`; cualquier otro (incluido `COMPLETED` sin aprobadas) → `REVISAR`.
    Todo menos `COMPLETED` va marcado `SIN VERIFICAR`.
  - `datosDeIntencion(intencion: unknown): DatosCobro` — suma de `detail.results[]` con
    `status === "approved"`: `paid_amount` → `pagado_mxn`, `tip_amount` → `propina_mxn`,
    `amount_refunded` → `reembolsado_mxn`. Del primer resultado aprobado: `transaction_id` →
    `pago_id_externo` y `referencia` (es lo que va a `terminal_aprobacion` en el ticket),
    `payment_method.type` → `tipo_tarjeta`, `payment_method.id` → `marca`,
    `payment_method.card.last_digits` → `tarjeta_ultimos4` (solo si son 4 dígitos), `installments`
    → `mensualidades`. `pinpad_request_id` → `orden_id_externo`; `reference` → `cobro_id`;
    `status` → `detalle`. Montos aceptados como número o texto (la documentación dice las dos cosas).
  - `codigoDeErrorClip(r: RespuestaClip): "CONEXION_INVALIDA" | "TERMINAL_NO_DISPONIBLE" | "NO_SE_PUDO_CREAR"`
    — 401 → conexión; `ERR10_04` o `PINPAD_TERMINAL_TIMEOUT_EXCEPTION` en el cuerpo → no disponible.
  - `type RespuestaClip = { status: number; cuerpo: unknown; codigo: string | null }` (`codigo` sale
    de `code` o `error_code` del cuerpo; `status: 0` si no hubo respuesta).
  - `clienteClip(apiKey: string, secreto: string, pedir: typeof fetch = fetch)` con:
    `crearIntencion({ cobroId, monto, serie, webhookUrl, imprime })`,
    `consultar(pinpadId)` (header `Pinpad-Include-Detail: true`), `cancelar(pinpadId)`,
    `cancelarPorSerie(serie)`, `estadoLectores()`, `configurarLectores(series: string[], timeoutSeg: number | null)`,
    `reembolsar(transactionId, monto)` (otro dominio: `https://api.payclip.com/refunds`, header
    `idempotency-key: reembolso-<transactionId>`). Base PinPad: `https://api.payclip.io/f2f/pinpad/v1`.
    `Authorization: Basic base64(apiKey:secreto)`. Timeout de 15 s; si no hay respuesta, `status: 0`
    (no lanza).
  - Preferencias fijas al crear: `is_tip_enabled: false`, `is_msi_enabled: false`,
    `is_mci_enabled: false`, `is_dcc_enabled: false`, `is_retry_enabled: true`,
    `is_split_payment_enabled: false`, `is_share_enabled: false`, `is_auto_return_enabled: true`,
    `is_auto_print_receipt_enabled: imprime`. `amount` como texto (`montoTexto`).

- [ ] **Paso 1:** pruebas en `clip.test.ts` con los ejemplos de `referencia-api/get_payment.md` y
  `post_payment-1.md`:
  - `datosDeIntencion` de un `COMPLETED` con una transacción aprobada de `348.00`, propina `34.80`,
    `last_digits: "1447"`, `id: "master"` → `APROBADO`, `pagado_mxn: "348.00"`, `propina_mxn: "34.80"`,
    `tarjeta_ultimos4: "1447"`, `marca: "master"`.
  - dos transacciones, una `approved` de 100 y una `declined` de 50 → `pagado_mxn: "100.00"`.
  - `status: "ALGO_NUEVO"` → `REVISAR`; `COMPLETED` sin aprobadas → `REVISAR`; `PENDING` → `EN_TERMINAL`.
  - `last_digits: "12"` → `tarjeta_ultimos4: null`.
  - `crearIntencion` arma `Authorization: Basic <base64("k:s")>`, `amount: "348.00"`, la serie y las
    preferencias de arriba (con un `pedir` falso que guarda la petición).
  - `crearIntencion` con un `pedir` que tarda más del timeout → `{ status: 0 }`.
  - `codigoDeErrorClip` con 400 y `ERR10_04` → `TERMINAL_NO_DISPONIBLE`; 401 → `CONEXION_INVALIDA`.
  - `reembolsar` pega a `api.payclip.com/refunds` con `reference: { type: "transaction", id }`.
- [ ] **Paso 2:** `pnpm test:functions` falla (no existe `clip.ts`).
- [ ] **Paso 3:** escribir `clip.ts`. Cabecera como la de `mercado-pago.ts`: fuente, y que nada está
  verificado todavía.
- [ ] **Paso 4:** pruebas en verde. Commit `feat(terminal): adaptador de Clip PinPad`.

### Tarea 3: `terminal-cobro` elige proveedor

**Archivos:**
- Crear: `supabase/functions/_shared/terminal/proveedor.ts` (+ `proveedor.test.ts`)
- Modificar: `supabase/functions/terminal-cobro/index.ts`

**Interfaces:**
- Consume: `clienteMp`/`datosDeOrden` (MP) y `clienteClip`/`datosDeIntencion`/`codigoDeErrorClip` (Tarea 2).
- Produce `proveedor.ts`:
  ```ts
  type Credencial = { access_token: string | null; refresh_token: string | null };
  type ResultadoCrear = { ok: true; datos: DatosCobro } | { ok: false; codigo: string; sinRespuesta?: boolean };
  interface Proveedor {
    crear(c: { cobroId: string; monto: string; terminal: string; folio: string | null; esperaSeg: number; imprime: boolean }): Promise<ResultadoCrear>;
    consultar(ordenId: string): Promise<DatosCobro | null>;
    cancelar(ordenId: string, terminal: string): Promise<"HECHA" | "PEDIDA" | "FALLO">;
    reembolsar(c: { ordenId: string; pagoId: string | null; monto: string }): Promise<{ ok: true } | { ok: false; motivo: string }>;
    lectorListo(terminal: string): Promise<boolean>; // MP: siempre true
  }
  function proveedorDe(nombre: "MERCADO_PAGO" | "CLIP", cred: Credencial, pedir?: typeof fetch): Proveedor | null;
  ```
  El adaptador de MP envuelve exactamente las llamadas que hoy hace `terminal-cobro` (mismos códigos
  `TERMINAL_OCUPADA`, `TERMINAL_AJENA`, `CONEXION_INVALIDA`, `NO_SE_PUDO_CREAR`). El de Clip arma
  `webhookUrl` = `${SUPABASE_URL}/functions/v1/terminal-webhook-clip?c=<cobroId>`; si `crear`
  regresa `status: 0`, llama `cancelarPorSerie` y devuelve `{ ok: false, codigo: "SIN_RESPUESTA", sinRespuesta: true }`.
  `cancelar` de Clip: 200 → `HECHA`, cualquier otro → `FALLO`. `reembolsar` de Clip usa `pagoId`
  (el `transaction_id`).
- `disponible` responde además `lista: boolean` y `proveedor`. `lista` es `lectorListo` del lector
  de la caja (Clip consulta `devices/status`; si la consulta falla, `true`, para no tapar la
  terminal por un tropiezo: el error de crear lo dirá).
- Un cobro de Clip que regresa `TERMINAL_NO_DISPONIBLE` al crear queda `RECHAZADO` con ese detalle.
- Un 401 de cualquier proveedor pasa la conexión a `ERROR` con `ultimo_error` del proveedor que toque.

- [ ] **Paso 1:** pruebas en `proveedor.test.ts` con `pedir` falso: el de MP manda la misma petición
  que hoy (`X-Idempotency-Key` = cobroId, `expiration_time: "PT180S"`); el de Clip sin respuesta
  llama `DELETE …/payment/serial-number/<serie>` y devuelve `SIN_RESPUESTA`; `lectorListo` de Clip
  es false con `status: "inactive"` y true con `active`; `proveedorDe("CLIP", { access_token: null, … })` es null.
- [ ] **Paso 2:** fallan.
- [ ] **Paso 3:** escribir `proveedor.ts` y cambiar `terminal-cobro` para que lea `proveedor` de la
  conexión (`terminal_conexiones`) junto con la credencial y use solo la interfaz. Las ramas de
  `crear`, `cancelar`, respaldo de 15 s y `reembolsar` quedan con la misma lógica.
- [ ] **Paso 4:** `pnpm test:functions` en verde, incluidas todas las de MP sin cambios.
- [ ] **Paso 5:** prueba manual con la receta local de la memoria (`project_terminal_mercado_pago`):
  un cobro de Mercado Pago contra la terminal virtual sigue aprobando. Commit
  `refactor(terminal): terminal-cobro habla con el proveedor de la conexión`.

### Tarea 4: Conexión de Clip y su aviso

**Archivos:**
- Crear: `supabase/functions/terminal-clip-conexion/index.ts`
- Crear: `supabase/functions/terminal-webhook-clip/index.ts`
- Crear: `supabase/functions/_shared/terminal/clip-conexion.ts` (+ `.test.ts`): validación de cuerpos, puro
- Modificar: `supabase/config.toml` (`[functions.terminal-webhook-clip] verify_jwt = false`)

**Interfaces:**
- Consume: `clienteClip` (Tarea 2), `terminal_guardar_tokens`/`terminal_leer_tokens`/`terminal_borrar_tokens`.
- Produce `terminal-clip-conexion` (mismo control de acceso que `terminal-mp-conexion`: jerarquía ≥ 4,
  negocio del JWT). Acciones:
  - `conectar { api_key, secreto }` → prueba `estadoLectores()`; 401 → `CLAVE_RECHAZADA` sin guardar
    nada; ok → upsert de la conexión (`cuenta_id_externo` = sha256 hex de la API key,
    `cuenta_nombre` = `Clip ····<últimos 4 de la API key>`), guarda en Vault y responde
    `{ conexion_id, lectores: [{ serie, estado }] }`.
  - `lectores { conexion_id }` → la misma lista.
  - `sucursal { conexion_id, sucursal_id }` → upsert de `terminal_config_sucursal` sin coordenadas.
  - `caja { caja_id, serie }` → upsert de `terminal_dispositivos` (`terminal_id_externo` = serie,
    `activa` = true, `modo` NULL). La serie tiene que estar en `estadoLectores()` de esa conexión.
  - `configurar { sucursal_id, imprime_terminal, espera_segundos, propina_opciones }` → guarda y
    manda `configurarLectores` con `timeout_seg = max(espera_segundos − 60, 0)` a los lectores de
    la sucursal (Clip suma un minuto fijo). Si Clip falla, se guarda igual y se avisa.
  - `desconectar { conexion_id }` → `DESCONECTADA`, dispositivos inactivos y `terminal_borrar_tokens`.
  El cuerpo de `conectar` nunca se pasa a `registrarError` ni a `console`.
- Produce `terminal-webhook-clip`: pública. Lee `?c=`; si no es uuid o el cobro no existe o no es
  de una conexión `CLIP`, 200 sin más. Tope con `consumirCupo` (`clip:aviso:<cobro>`, 20 por
  minuto). Con cupo: `consultar(orden_id_externo)` con la credencial de la conexión y, si
  `aceptaCambio`, guarda `cambiosDeCobro`. Registra en `terminal_eventos` solo `{ id, event_type }`
  del cuerpo. 500 si falla la base, para que Clip reintente (si reintenta: `SIN VERIFICAR`).

- [ ] **Paso 1:** pruebas de `clip-conexion.ts`: `api_key` o `secreto` vacíos, con espacios o de más
  de 200 caracteres → error; `propina_opciones` `[10,15,20]` pasa, `[]` y `[10,101]` no;
  `espera_segundos` fuera de 60–10800 no pasa.
- [ ] **Paso 2:** fallan. **Paso 3:** escribir el módulo y las dos funciones.
- [ ] **Paso 4:** `pnpm test:functions` en verde y `deno check` de las dos funciones.
- [ ] **Paso 5:** prueba local con `supabase functions serve`: `conectar` con una clave inventada
  regresa `CLAVE_RECHAZADA` (Clip responde 401) y no deja fila; el aviso con `?c=basura` regresa 200
  y no inserta nada. Commit `feat(terminal): conexión y aviso de Clip`.

### Tarea 5: Pantalla del admin

**Archivos:**
- Modificar: `apps/admin/app/lib/terminal.ts`
- Modificar: `apps/admin/app/(panel)/configuracion/terminal/page.tsx`
- Crear: `apps/admin/app/(panel)/configuracion/terminal/clip.tsx`

**Interfaces:**
- Consume: `terminal-clip-conexion` (Tarea 4).
- `ConexionTerminal` agrega `proveedor`. `accionTerminal` recibe la función a la que va
  (`"terminal-mp-conexion" | "terminal-clip-conexion"`). Mensajes nuevos: `CLAVE_RECHAZADA`
  («Clip no reconoció la API key o la clave secreta. Cópialas de nuevo de tu panel de Clip.»),
  `LECTOR_NO_ES_DE_LA_CUENTA`.
- La página ofrece **Conectar Mercado Pago** y **Conectar Clip**. Clip abre un formulario con los pasos
  del documento 02 §2.1 (crear una credencial dedicada a VIM en *Panel de Desarrollador >
  Credenciales*; la clave secreta solo se ve una vez), dos campos `type="password"` con
  `autoComplete="off"`, y al guardar limpia los campos pase lo que pase.
- En una sucursal con conexión Clip: no se piden coordenadas; cada caja elige su lector de la lista
  (serie y si está activo); si la lista viene vacía, el aviso «Falta que Clip instale la app PinPad
  en tu lector: escribe a sdk@payclip.com con el número de serie». Los porcentajes de propina se
  guardan (tres campos numéricos) con la nota «Pronto: el cliente elegirá la propina en la terminal».
- Las cuentas de Mercado Pago se ven y funcionan igual que hoy.

- [ ] **Paso 1:** `pnpm -F admin exec tsc --noEmit` y lint en verde.
- [ ] **Paso 2:** levantar el admin local, entrar sin contraseña (memoria `project_rediseno_admin`),
  y con la Tarea 4 servida localmente: conectar con clave inventada muestra `CLAVE_RECHAZADA` y los
  campos quedan vacíos; la sección de Mercado Pago de VIM Pruebas se ve como antes. Captura.
- [ ] **Paso 3:** commit `feat(admin): conectar Clip en Terminal de tarjetas`.

### Tarea 6: La caja

**Archivos:**
- Modificar: `apps/pos/app/lib/terminal.ts`
- Modificar: `apps/pos/app/components/vista-terminal.tsx`
- Modificar: `apps/pos/app/components/modal-cobro.tsx` (solo donde usa `cajaTieneTerminal`, ~l. 1182)
- Revisar sin cambiar: `desktop/src/gateway.mjs` (el reenvío de `terminal-cobro` debe pasar los campos nuevos)

**Interfaces:**
- Consume: `disponible` → `{ terminal, lista, proveedor }` (Tarea 3).
- `cajaTieneTerminal` pasa a `terminalDeCaja(token, cajaId): Promise<{ hay: boolean; lista: boolean; proveedor: "MERCADO_PAGO" | "CLIP" | null }>`
  (cualquier fallo = `{ hay: false, … }`, como hoy).
- Con `hay && !lista`, el botón «Tarjeta» no manda a la terminal y dice **«Terminal no disponible:
  enciéndela y abre Clip PinPad»**; el registro manual sigue.
- `VistaTerminal` recibe `proveedor`. Instrucción mientras espera: Mercado Pago igual que hoy; Clip
  «Pide al cliente que acerque o inserte su tarjeta en la terminal.».
- Mensajes sin nombre de proveedor donde hoy dicen Mercado Pago (`CONEXION_INVALIDA`, reembolsos,
  `high_risk`) o con el de la conexión. Nuevos: `TERMINAL_NO_DISPONIBLE` («La terminal no está lista.
  Revisa que esté encendida, con internet y con Clip PinPad abierta.»), `SIN_RESPUESTA` («La terminal
  no contestó. Vuelve a intentar.»).

- [ ] **Paso 1:** `pnpm -F pos exec tsc --noEmit` y lint en verde.
- [ ] **Paso 2:** con la caja local de la receta de MP: el cobro con la terminal virtual de Mercado
  Pago sigue igual (texto incluido). Para Clip, sembrar en la base local una conexión `CLIP` con
  clave inventada ligada a «CAJA TEST»: Clip responde 401 a `devices/status`, `lista` queda true y
  al cobrar la caja muestra el mensaje de conexión inválida, y la conexión pasa a `ERROR`. El
  «Terminal no disponible» se comprueba en la prueba de `proveedor.ts` (Tarea 3) y con el lector
  apagado en la entrega siguiente. Capturas.
- [ ] **Paso 3:** `npm run test:escritorio` sin rojos nuevos (memoria `reference_pruebas_escritorio_windows`).
  Commit `feat(pos): la caja cobra con Clip`.

### Tarea 7: ADR y documentación

**Archivos:**
- Crear: `docs/decisiones/0050-clip-es-el-segundo-proveedor-de-terminal.md`
- Modificar: `docs/integraciones/clip-pinpad/02-diseno-integracion-vimpos.md` (estado: construido en
  local; lo que se dejó fuera y por qué) y `03-…` (lo que falta probar con lector).

- [ ] **Paso 1:** ADR: proveedor por conexión, clave en Vault como access/refresh, aviso sin firma
  confirmado por consulta, propina en el lector pospuesta hasta la prueba.
- [ ] **Paso 2:** commit `docs(terminal): ADR 0050 y estado de Clip`.

## Después, con el lector (entrega siguiente)

Recorrer con `curl` crear, consultar, cancelar, rechazar, dejar vencer y devolver; corregir el mapa
de estados y lo `SIN VERIFICAR`; cobro real de $1 devuelto en Knock-Out; decidir la propina en el
lector; skill `clip-pinpad`; y solo entonces migración, funciones y PR a producción con el OK de Fermín.
