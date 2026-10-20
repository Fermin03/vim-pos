# Belleza · Entrega 4 (colaborador en el celular, reportes y liberar giros) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el grupo belleza:
- cada colaborador ve **su** agenda y **sus** comisiones en su celular y marca «Llegó» y «Terminé»;
- el dueño tiene los reportes de citas, faltas y ocupación, y una primera vez pensada para un salón;
- los cinco giros de belleza se pueden elegir en el registro, en /platform y en prospectos, con la migración de liberación lista.

**Architecture:**
- **Acceso del colaborador:** cada empleado ya tiene usuario en Auth con su correo (`crear-empleado`), pero no conoce su contraseña.
  - En el admin, Agenda › Colaboradores gana **«Dar acceso a su celular»**, que le manda el correo para poner contraseña (el mismo flujo de `establecer-acceso` / recuperación que ya existe).
  - El colaborador entra a **`/mi-agenda`** del POS web con correo y contraseña. No hace falta caja vinculada ni PIN.
- **Solo lo suyo:** la lectura y las acciones del colaborador pasan por RPC nuevas que filtran por `auth.uid()`. Las tablas siguen con RLS por negocio y la caja no cambia.
- **Reportes por RPC sobre `citas`**, con los mismos componentes de reporte del admin.
- **Liberar giros:** el molde es la entrega 4 de retail 2 (commit «Abrir los giros de abarrotes…», 0214/0215).

**Tech Stack:** PostgreSQL 15 (Supabase), smokes `.sql`, Next.js + Vitest (`apps/pos`, `apps/admin`, `apps/platform`), funciones Edge de Deno (sus pruebas corren con `pnpm test:functions`), `packages/db`.

**Spec:** `docs/superpowers/specs/2026-10-18-giros-belleza-design.md`:
- §3 «Colaboradores»: pueden trabajar desde la recepción o con su vista en el celular, y colaborador y dueño ven las comisiones;
- §4 «Vista del colaborador (celular)» y «Reportes»;
- §9 entrega 4;
- «Entrega 1/2/3, hecha», en especial el orden de lanzamiento: un solo instalador con 0216–0226 y la liberación después.

## Global Constraints

- **Todo en local.** Rama `feat/belleza-celular` encima de `feat/belleza-reservas` (HEAD da0c9cdd). 0188–0226 no se editan. Nuevas: 0227 (agenda del colaborador y reportes), 0228 (prospectos) y 0229 (liberar `cambiar_giro`), aplicadas al Docker local y registradas. Prohibido push, PR, merge, `db push`, desplegar o empaquetar.
- **Giros a liberar** (etiquetas de `packages/db/src/operacion.ts`):
  - `SALON` «Salón de belleza»;
  - `SPA` «Spa»;
  - `PELUQUERIA` «Peluquería»;
  - `BARBERIA` «Barbería»;
  - `TATUAJES` «Tatuajes y piercings».

  Siguen bloqueados BAR, CAFETERIA y TAQUERIA.
- **0229 va DESPUÉS del instalador con 0216–0226** (encabezado como el de 0215).
- **`/mi-agenda`** (apps/pos):
  - entra con correo y contraseña; si la cuenta no es colaborador activo de un negocio con `agenda`: «Esta cuenta no tiene agenda. Pídele acceso al negocio.»;
  - muestra hoy y los próximos 7 días (tira de días), solo sus citas: hora, clienta (nombre y una nota corta), servicios, espacio y estado;
  - acciones «Llegó · empezar» (AGENDADA → EN_CURSO) y «Terminé» (EN_CURSO → TERMINADA). **No cobra, no cancela, no mueve y no marca «No llegó»**;
  - pestaña **«Mis comisiones»**: hoy, el periodo actual y el anterior, con sueldo según `comisiones_periodo`;
  - «Cerrar sesión». Pensada para celular primero, con controles de 44 px como mínimo.
- **Privacidad:** el colaborador no ve el teléfono ni el correo de la clienta, ni citas de otros, ni ventas o comisiones ajenas.
- **Reportes** (admin, solo con el módulo `agenda`):
  - **«Citas y faltas»:** por colaborador y por servicio, con atendidas (TERMINADA/COBRADA), canceladas (por quién), no llegó y tasa de falta; filtros de rango y canal (caja o en línea);
  - **«Ocupación»:** por colaborador y día, minutos agendados contra minutos de horario (sin comida ni ausencias) y su porcentaje.
- **Primera vez de un salón** (`apps/admin/app/lib/onboarding.ts`), con `esGiroBelleza`. Pasos:
  1. «Tus servicios» (`servicios_agenda`);
  2. «Tu equipo» (empleados);
  3. «Colaboradores y horarios» (`colaboradores_agenda` con al menos un `horarios_colaborador`);
  4. «Tu caja»;
  5. «Vincula tu caja»;
  6. «Facturación» (opcional).

  Sin textos de menú ni de cocina.
- **Los restaurantes y las tiendas no cambian.**
- Ponytail; español; sin `any`. Si el disco C: no tiene espacio, `TEMP` y `TMP` van en D: para smokes y pruebas del escritorio. Suites: smokes, pruebas y typecheck de pos, admin, platform y tienda, `pnpm test:functions`, tipografía y 0040.

## Review Focus

1. **Un colaborador ve solo lo suyo:** otra cuenta del mismo negocio no ve citas ajenas por RPC. Tampoco las ve por las tablas: la RLS de `citas` es por negocio y la vista no puede consultarlas directo. Otro negocio no ve nada. → Task 1 y Task 3.
2. **Acciones solo sobre sus citas:** «Empecé» o «Terminé» sobre una cita ajena, cancelada o cobrada se rechazan. El cambio llega a la caja por el sync de citas, como cualquier cambio de la nube. → Task 1.
3. **Acceso:** el correo de «Dar acceso» lleva al flujo para poner contraseña. Un empleado sin colaborador activo, o de un negocio sin agenda, no entra a `/mi-agenda`. Un dueño que entra ve el aviso, porque no es colaborador. → Task 2.
4. **Ocupación honesta:** un día con comida y una ausencia descuenta esos minutos, y una cita fuera de horario cuenta como agendada sin pasar del 100 % del día. → Task 1.
5. **Restaurante intacto:** la primera vez de un restaurante o de una tienda no cambia, y su registro sigue igual salvo por las opciones nuevas. → Task 4 y Task 5.

---

### Task 1: Agenda del colaborador y reportes en la base (0227)

**Interfaces producidas** (SECURITY DEFINER con `search_path` fijo, para `authenticated` y nunca para `anon`; el tenant sale del JWT):
- `mi_agenda(p_desde date, p_hasta date) RETURNS jsonb`:
  - devuelve los tramos de `citas_servicios` del `auth.uid()` en el rango, en día MX, con hora, cita (id, estado, cliente_nombre y nota recortada a 80) y servicio, espacio y estado;
  - si el usuario no es colaborador activo del negocio, `SIN_AGENDA: Esta cuenta no tiene agenda.`;
  - máximo 14 días.
- `mi_cita_empezar(p_cita uuid)` y `mi_cita_terminar(p_cita uuid)`:
  - la cita tiene que tener al menos un tramo del `auth.uid()`; reutilizan las reglas de `atender_cita` y `terminar_cita` (cuerpos vigentes, con grep);
  - con varios colaboradores, «Terminé» de uno pasa la cita a TERMINADA solo cuando el último tramo es suyo; si no, solo deja constancia. *Ruling: se termina la cita cuando la termina el colaborador del último tramo.*
- `agenda_reporte_citas(p_desde date, p_hasta date, p_canal text DEFAULT NULL) RETURNS TABLE(usuario_id, colaborador, producto_id, servicio, atendidas int, canceladas_clienta int, canceladas_negocio int, no_llego int, total int)`. Solo administradores (mismo criterio que `comisiones_periodo` para dueño o admin).
- `agenda_ocupacion(p_desde date, p_hasta date) RETURNS TABLE(usuario_id, colaborador, dia date, minutos_horario int, minutos_agendados int)`. Solo administradores.
- Smoke `smoke_belleza_celular.sql`:
  - un colaborador solo ve lo suyo, y otro colaborador y otro negocio no;
  - empezar y terminar propias sí; ajenas, canceladas y cobradas no;
  - el caso de dos colaboradores en una cita;
  - el reporte de citas por canal y por quién cancela;
  - la ocupación con comida, ausencia y una cita fuera de horario (tope de 100 % por día);
  - un cajero sin ser administrador no ve los reportes;
  - `anon` no ejecuta nada.

- [ ] Smoke que falla → 0227 → aplicar/registrar → smokes completos y 0040 → commit `"BD: agenda del colaborador y reportes (0227)"`.

### Task 2: Acceso del colaborador desde su celular

- **Admin, `agenda/colaboradores/page.tsx`:** botón **«Dar acceso a su celular»** por colaborador.
  - Usa el flujo que ya existe para que un usuario ponga su contraseña. Hay que revisar `apps/admin/app/(.../)establecer-acceso`, `recuperar` y lo que use el admin para invitar. Si ese flujo está limitado a dueño o admin, se amplía solo para empleados con colaborador activo.
  - El enlace del correo lleva a una página que pone la contraseña y luego dice «Listo. Entra a tu agenda en {url del POS}/mi-agenda».
  - Muestra «Último acceso» si lo hay.
- **Auth:** hay que comprobar que el token de un empleado que entra con correo y contraseña trae el `tenant_id` del negocio (el hook que lo pone para el dueño). Si un empleado tiene varios negocios, se usa el mismo criterio del admin.
- **POS, `apps/pos/app/mi-agenda/page.tsx`** (ruta nueva, fuera del cascarón de la caja):
  - entrada con correo y contraseña, «Olvidé mi contraseña» (el mismo flujo de recuperación) y sesión guardada como la del admin;
  - no usa las credenciales del dispositivo ni el PIN.
- **Pruebas:**
  - el armado del enlace;
  - el estado del botón por colaborador;
  - la página de entrada (validaciones y errores: «Correo o contraseña incorrectos», `SIN_AGENDA`);
  - la caja (`/`) no se ve afectada.

- [ ] Pruebas → implementar → admin y pos test y typecheck → navegador (controlador) → commit `"Acceso del colaborador desde su celular"`.

### Task 3: «Mi agenda» en el celular

- `apps/pos/app/mi-agenda/*` y `apps/pos/app/lib/mi-agenda.ts`:
  - **Hoy:** encabezado con su nombre y el día, y lista por hora; cada tarjeta con hora, clienta, servicios, espacio, estado y botón según el estado.
  - **Tira de 7 días** y pull para actualizar (o el botón «Actualizar»).
  - **«Mis comisiones»:** hoy, el periodo actual y el anterior, con servicios, ventas sin IVA, comisión, sueldo y total. Viene de `comisiones_periodo`, que ya filtra al propio colaborador.
  - Errores visibles y la sesión vencida regresa a la entrada.
- Pruebas: armado de la lista por día en MX, botones por estado y mapeo de comisiones.

- [ ] Pruebas → implementar → pos test, typecheck y tipografía → navegador (controlador, en tamaño celular): entrar como Diego, marcar «Llegó» y «Terminé» en una cita suya y ver que la caja la ve TERMINADA → commit `"Mi agenda en el celular"`.

### Task 4: Reportes y primera vez de un salón (admin)

- `apps/admin/app/(panel)/reportes/citas/page.tsx` («Citas y faltas») y `reportes/ocupacion/page.tsx` («Ocupación»), con los mismos `ReporteMarco`, `useConsulta`, `useRangoReporte` y Excel.
  - Se agregan al índice de reportes, a `RUTAS_AGENDA` (`lib/operacion.ts:20`) y a `acceso.ts`.
  - El reporte `no-shows` de restaurantes no cambia.
- `apps/admin/app/lib/onboarding.ts`: los pasos de belleza de Global Constraints, con sus enlaces y conteos. Los textos de restaurante y tienda no cambian.
- Pruebas:
  - armado de filas y totales (tasa de falta, porcentaje de ocupación);
  - rutas ocultas sin agenda;
  - los pasos de la primera vez por giro (restaurante, tienda y salón).

- [ ] Pruebas → implementar → admin test y typecheck → navegador (controlador) → commit `"Admin: reportes de citas y ocupación; primera vez de un salón"`.

### Task 5: Liberar los giros de belleza (0228, 0229 y listas)

Molde: commit `0a2d9596` («Abrir los giros de abarrotes…»).
- 0228: `prospectos_giro_check` con los 14 valores de la 0214 más los cinco de belleza.
- 0229: `cambiar_giro` con el **cuerpo vigente de la 0217** (`~:59`), quitando los cinco de belleza de la lista de bloqueados. Encabezado: va DESPUÉS del instalador con 0216–0226.
- Listas:
  - `supabase/functions/_shared/alta.ts` (`VERTICALES`, `GIRO_ETIQUETA`) y su prueba («los diecisiete giros que se ofrecen pasan»);
  - `provisionar-tenant/index.ts`, `solicitar-demo/index.ts` y `apps/admin/app/registro/page.tsx`;
  - `packages/db/src/operacion.ts`, con `ofrecido: true`, y su prueba de catálogo;
  - revisar con grep `_shared/bienvenida.ts`, `terminal-cobro` y las listas de /platform.
- Smokes:
  - `smoke_prospectos_giros.sql`;
  - `smoke_belleza_agenda.sql`: antes de 0229 da `GIRO_NO_DISPONIBLE` y después funciona y deja `juego_inicial_de_giro`;
  - un alta con `crear_tenant_con_owner` como SALON nace con mostrador, existencias y agenda.
- **Formulario de demo del sitio:** no se toca; el sitio y el PDF van al final de todos los grupos.

- [ ] Smokes y pruebas que fallan → 0228 y 0229 → aplicar/registrar → smokes, 0040, admin, platform y funciones → navegador (controlador): /registro del admin muestra los cinco → commit `"Abrir los giros de belleza (0228, 0229)"`.

### Task 6: Documentos y revisión final

- `docs/diseno/pos-belleza.md`: «Mi agenda». `docs/diseno/admin.md`: el acceso del colaborador, los reportes y la primera vez.
- El spec de belleza: «Entrega 4, hecha» y **«Lanzamiento del grupo belleza»**, con el orden completo:
  1. pasos de dominio (entrega 3);
  2. 0216–0228 a la nube, en orden y cada una en su transacción;
  3. funciones (`tienda`, `tienda-correos`, `tienda-webhook-mp` y las que toque esta entrega);
  4. merge;
  5. un instalador con 0216–0228;
  6. 0229 después de publicarlo.

  Y recordar que nada sale hasta tener servicios.
- Suites completas, revisión de toda la rama y commit.

## Rulings de este plan (Fermín puede corregirlos)

- **El colaborador entra con correo y contraseña** a `/mi-agenda`; el dueño le manda el acceso desde Colaboradores. Nada de PIN ni de caja vinculada en el celular.
- **En el celular solo marca «Llegó» y «Terminé».** Cancelar, mover, «No llegó» y cobrar siguen en la recepción.
- **El colaborador no ve el teléfono ni el correo de la clienta.**
- **Con varios colaboradores en una cita**, la cita se termina cuando la termina el del último servicio.
