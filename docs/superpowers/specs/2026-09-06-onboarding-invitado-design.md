# Onboarding por invitación — diseño

**Fecha:** 6 de septiembre de 2026 · **Estado:** propuesto

Que un dueño invitado deje su negocio vendiendo sin que VIM esté presente: desde el correo hasta
su primera venta real, incluida la caja instalada y vinculada por él mismo.

---

## 1. Por qué, y qué NO es esto

El análisis de brechas señalaba "onboarding / wizard de alta" como lo más grande del Tier 1, con
un 11%. Al mirarlo de cerca, la cifra engaña: **casi todo está construido**.

| Pieza | Estado real |
|---|---|
| Invitar al dueño por correo | `provisionar-tenant` → `inviteUserByEmail` → `/establecer-acceso` |
| Crear el tenant con su andamiaje | RPC `crear_tenant_con_owner`, en TRIAL |
| Elegir plan | `/platform/clientes/nuevo`, leyendo el catálogo real (respeta el ADR 0002) |
| Checklist de configuración | `/bienvenida`, que **autodetecta** leyendo los datos, no contando clics |
| Cargar el menú | Importador CSV en `/catalogo/importar` |
| Credenciales de la caja | `provisionar-dispositivo`, ya invocable por el DUEÑO con su propio JWT |

Lo que falta no es el asistente. Es **el último tramo**: el dueño llega hasta "tengo el menú
cargado" y ahí se detiene, porque nadie le dice de dónde baja la caja ni cómo la conecta.

**Alcance elegido** (decisiones del dueño, 6 sep 2026):

- **Sigue siendo por invitación.** No se abre ninguna puerta pública. `signup-tenant` se queda
  como está, sin enlazar desde el sitio.
- **El listón es la primera venta real**, no "el panel configurado".
- **La caja se vincula con un código de 6 dígitos** que caduca.

**Fuera de alcance, a propósito:**

- Cobro con tarjeta / Stripe. El TRIAL lo sigue activando VIM a mano.
- La vista de "quién se atoró" en `/platform`. Se descartó al elegir el alcance; la fase ya se
  guarda en `tenant_onboarding_estado`, así que construirla después es barato.
- Modo demo o datos de ejemplo. Un menú falso que luego hay que borrar ensucia el negocio real,
  y el importador ya resuelve la carga de verdad.
- Abrir `signup-tenant` al público. **Pero ver el riesgo latente en §7.**

---

## 2. El recorrido

```
VIM                          El dueño                        La caja (su PC)
───                          ────────                        ───────────────
/platform → Invitar
  ├─ correo (best-effort)
  └─ ENLACE copiable  ──────► /establecer-acceso
     (WhatsApp)                   fija su contraseña
                                     │
                                     ▼
                             /bienvenida  ← aterriza aquí, no en el panel vacío
                               1 Datos del negocio
                               2 Tu menú           (importador CSV)
                               3 Tu equipo         (cajeros con PIN)
                               4 Descarga la caja  ──────────► instala
                               5 Vincúlala          código ──► [4 8 2 1 9 3]
                                    ▲                              │
                                    └──── late ────────────────────┘
                               6 Tu primera venta ◄──────────── cobra
                                     │
                                     ▼
                                  GO_LIVE
```

### 2.1 El enlace es el producto; el correo es un extra

`inviteUserByEmail` usa el SMTP **del proyecto Supabase**, que es una configuración distinta de
las variables `VIM_SMTP_*` que ya usa `solicitar-demo`. No pude verificar si está configurado (la
Management API pide un token que no está en el entorno), y si no lo está, Supabase cae a su
remitente interno, con límites duros y entrega poco fiable.

En vez de bloquear el diseño sobre ese dato, **se elimina la dependencia**: la pantalla de
invitación de `/platform` muestra **siempre** el enlace, copiable de un clic, junto a un aviso de
si el correo salió o no. El correo pasa a ser una comodidad.

Esto no es un parche: los ocho CTA del sitio público van a WhatsApp o teléfono. Los clientes de
VIM no escriben correos, y un alta que depende de que el dueño encuentre un correo en Promociones
se atora justo donde no se ve. Que el enlace se pueda pegar en WhatsApp es la forma **correcta**
de entregarlo, con o sin SMTP.

El enlace de invitación es el que ya genera Supabase Auth y **caduca**: si expira, `/platform`
ofrece regenerarlo desde la ficha del cliente.

---

## 3. El checklist manda

`/bienvenida` deja de ser un banner del dashboard y pasa a ser **la pantalla de aterrizaje**
mientras `tenant_onboarding_estado.fase` no sea `GO_LIVE`. Un tenant recién creado que aterriza
en un dashboard vacío es la peor primera impresión posible, y era justo la queja que el análisis
de brechas hacía del dashboard antiguo.

No es una jaula: el panel sigue accesible desde el menú. Lo que cambia es a dónde llegas por
defecto, y que se vuelve a `/bienvenida` hasta que el negocio vende.

### 3.1 Los pasos, y qué los marca completos

La virtud de `leerEstadoOnboarding()` es que no se cree nada: consulta los datos reales, así que
el dueño puede irse, volver, o configurar por su cuenta fuera del checklist, y el estado sigue
siendo cierto. Se conserva ese principio en los pasos nuevos.

| # | Paso | Se marca completo cuando | Obligatorio |
|---|---|---|---|
| 1 | Datos del negocio | `tenants.nombre_comercial` tiene contenido | sí |
| 2 | Tu menú | `count(productos) > 0` | sí |
| 3 | Tu equipo | `count(usuarios_perfil) > 1` | sí |
| 4 | **Descarga la caja** | la caja late alguna vez (ver #5) — el paso se cierra solo | sí |
| 5 | **Vincula la caja** | **`cajas.ultimo_latido IS NOT NULL`** | sí |
| 6 | **Tu primera venta** | `count(tickets) > 0` | sí |
| — | Datos fiscales (CFDI) | `tenants.razon_social` tiene contenido | no |

**El cambio importante es el paso 5.** Hoy el checklist marca la caja como lista con
`count(cajas) > 0` — una **fila en una tabla**. Se puede llegar al 100% sin nada con qué cobrar.
Pasa a usar `cajas.ultimo_latido`, que la entrega 2 del ADR 0014 puso ahí precisamente para
significar "esta caja está viva y habla con nosotros". Una caja que late es una caja que existe.

Consecuencia aceptada: una caja instalada que se quede sin internet no marcará el paso. Es
correcto — sin internet no pudo bajar el catálogo, así que tampoco puede vender todavía.

### 3.2 De dónde sale el instalador

El paso 4 no puede llevar un enlace escrito a mano: quedaría desactualizado en la siguiente
versión y nadie se acordaría. Lo lee de **`versiones_caja`**, la tabla que la entrega 4 del ADR
0014 acaba de poner en producción, así que el dueño descarga siempre la versión recomendada
vigente sin que nadie mantenga nada.

`versiones_caja` tiene RLS habilitada **sin políticas** (solo `service_role`), y así debe seguir:
lleva la historia comercial de las publicaciones. Se añade una función mínima:

```sql
CREATE FUNCTION version_recomendada() RETURNS jsonb
-- SECURITY DEFINER, search_path fijo, GRANT a authenticated.
-- Devuelve solo { version, url, fecha } de la más alta publicada.
-- NO devuelve sha512, notas, es_minima ni bloquea_*: al navegador del dueño no le sirven,
-- y el estado del bloqueo por versión es información interna de VIM.
```

---

## 4. Vincular la caja con un código

### 4.1 Por qué un código y no las credenciales

Hoy vincular significa que el dueño teclee `caja-9f3f…@dispositivos.vimpos.mx` y
`vim-Kp3nQx7ftYbz` en la PC de la caja, leyéndolos de su laptop. Es exactamente el punto donde
alguien llama por teléfono. Un código de seis dígitos que caduca es lo que hace todo el mundo
porque funciona con dos pantallas y dos manos.

### 4.2 Cómo funciona

```
Admin (dueño)                    Nube                         Caja
─────────────                    ────                         ────
"Vincular esta caja"
   │  RPC emitir_codigo_vinculacion(caja)
   │  (JWT de DUEÑO/ADMIN, solo su tenant)
   ▼
 482193  ─────────────────────────────────────────────────►  teclea 482193
 caduca en 15:00                                                  │
                                 canjear-vinculacion  ◄───────────┘
                                 (pública, anon key)
                                   · valida y consume el código
                                   · provisiona/rota el dispositivo
                                   └─ credenciales ──────────►  guarda, hace el pull,
                                                                 y late  ✓
```

**Tabla nueva `codigos_vinculacion`**: `codigo` (6 dígitos, **hasheado**, nunca en claro),
`tenant_id`, `caja_id`, `expira_en`, `usado_en`, `intentos`, `created_at`. RLS habilitada **sin
políticas**: solo se toca desde funciones `SECURITY DEFINER`. Un código activo por caja: emitir
uno nuevo invalida el anterior.

El código se guarda hasheado por la misma razón que una contraseña: la tabla no tiene por qué
poder canjear cajas ajenas si alguien la lee.

### 4.3 Seis dígitos son pocos: qué lo hace aceptable

Un millón de combinaciones es poco para un endpoint público que **entrega credenciales**. Y el
atacante no necesita adivinar un código concreto: le sirve cualquiera que esté vivo. Los
controles no son adornos, son lo que hace viable la decisión:

- **Caducidad de 15 minutos.** Reduce la ventana y el número de códigos vivos a la vez.
- **Un solo uso**, consumido dentro de la misma transacción que lo valida.
- **Máximo 5 intentos por código**; al sexto se quema, aunque no haya caducado.
- **Límite por IP** en la Edge Function, con la misma forma que el de `apps/platform`.
- **Un código activo por caja**, para que el conjunto de códigos vivos sea pequeño de verdad.
- **Error idéntico** para código inexistente, caducado, quemado o equivocado: nunca se confirma
  que un código existe.

Con estos controles, un atacante que dispare a ciegas necesita del orden de cientos de miles de
peticiones para acertar a *alguna* caja en configuración, y el límite por IP lo hace inviable
mucho antes. Sin ellos, seis dígitos serían indefendibles.

Y el peor caso está acotado: quien canjea un código obtiene las credenciales de **una** caja de
**un** tenant. No obtiene el tenant, ni el panel, ni nada de otro cliente. El dueño ve la caja
vinculada en su pantalla y, si no fue él, la desvincula desde `/configuracion/cajas`.

### 4.4 Lo que cambia en el escritorio

`vincular-dispositivo.tsx` gana el campo de seis dígitos **como camino principal**, y conserva el
de correo y contraseña plegado bajo "Tengo credenciales de dispositivo" — es el que usa soporte
cuando algo va mal, y quitarlo dejaría a VIM sin escalera.

En `ui-server.mjs`, `/__vincular-nube` acepta además `{ codigo }`. Se mantienen intactas las dos
guardas que ya tiene: `LOCALES.has(remoteAddress)` y `mismaProcedencia`. Tras canjear, el flujo
es el de siempre: credenciales → pull del tenant → login local.

---

## 5. Errores: qué ve el dueño cuando algo falla

Un dueño solo, sin nadie a quien preguntar, necesita que cada fallo diga qué hacer:

| Situación | Qué ve |
|---|---|
| Código caducado o equivocado | "Ese código no sirve. Pide uno nuevo en tu panel, en Configuración → Cajas." |
| Código quemado por intentos | Igual que el anterior. No se distingue, a propósito. |
| Sin internet al vincular | "No hay conexión. La caja necesita internet **solo esta vez**, para bajar tu menú." |
| El pull falla a medias | La caja no queda vinculada a medias: o entra o no. Se reintenta con el mismo código si sigue vivo. |
| El enlace de invitación caducó | El dueño ve una pantalla que le dice que pida uno nuevo, con el WhatsApp de VIM. |
| Correo de invitación que no llegó | No es un caso: VIM manda el enlace por WhatsApp (§2.1). |

---

## 6. Pruebas

- **pgTAP** (`supabase/tests/00xx_vinculacion.test.sql`): un código caduca; se consume una sola
  vez; al sexto intento se quema; emitir uno nuevo invalida el anterior; un DUEÑO no puede emitir
  un código para una caja de otro tenant; `version_recomendada()` no devuelve `sha512` ni
  `bloquea_bajo_minima`.
- **vitest** (`apps/admin/app/lib/__tests__/onboarding.test.ts`): la evaluación de los pasos es
  pura y se prueba sin base — sobre todo que el paso de la caja exige latido y no fila, y que un
  tenant con todo hecho da `listoParaVender`.
- **node --test** (escritorio): el canje por código y el de credenciales llegan al mismo estado;
  un código mal tecleado no borra la vinculación existente.
- **Navegador**: el recorrido entero contra el entorno local, invitando a un tenant de prueba.

---

## 7. Riesgo heredado que este trabajo no toca (pero deja escrito)

**`signup-tenant` asigna planes retirados.** La función pública mapea vertical → plan
(`QUICK_SERVICE→QS`, `CAFE_BAR→CB`…), que son los seis planes que el **ADR 0002** retiró en favor
de Esencial · Negocio · Cadena. Hoy no hace daño porque el sitio no enlaza a `/registro` y nadie
llega ahí. Pero es una mina: el día que alguien enlace esa pantalla, los clientes nuevos caerán
en planes muertos y con precios que ya no existen.

No se arregla aquí porque abrir o cerrar esa puerta es una decisión comercial, no técnica. Queda
anotado para que sea una decisión y no un descuido.

---

## 8. Archivos

| Archivo | Qué le pasa |
|---|---|
| `supabase/migrations/01XX_vinculacion_por_codigo.sql` | `codigos_vinculacion`, `emitir_codigo_vinculacion()`, `canjear_codigo_vinculacion()`, `version_recomendada()` |
| `supabase/tests/00XX_vinculacion.test.sql` | pgTAP de lo anterior |
| `supabase/functions/canjear-vinculacion/index.ts` | canje público con límite por IP |
| `apps/admin/app/lib/onboarding.ts` | pasos nuevos; la caja se mide por latido |
| `apps/admin/app/(panel)/bienvenida/page.tsx` | pasos de descarga, vinculación y primera venta |
| `apps/admin/app/(panel)/layout.tsx` | aterrizar en `/bienvenida` mientras no haya `GO_LIVE` |
| `apps/admin/app/(panel)/configuracion/cajas/…` | botón "Vincular esta caja" que emite el código |
| `apps/platform/app/clientes/nuevo/page.tsx` | mostrar el enlace copiable y si el correo salió |
| `apps/pos/app/components/vincular-dispositivo.tsx` | campo de 6 dígitos; credenciales plegadas |
| `desktop/src/ui-server.mjs` | `/__vincular-nube` acepta `{ codigo }` |

**El número de migración se fija al empezar, no ahora.** Ha chocado tres veces con otra sesión, y
`supabase db push` salta en silencio una migración cuyo número ya está en el historial remoto. Se
comprueba con `supabase migration list --linked` antes de fijarlo y otra vez antes de publicar.

---

## 9. Cómo se sabrá que funcionó

Un dueño al que solo se le mandó un enlace por WhatsApp llega a cobrar su primera venta sin que
VIM toque nada, y `/platform` lo muestra en `GO_LIVE` con su caja latiendo.

La prueba de verdad es la siguiente alta real. Hasta entonces, esto es una hipótesis bien
construida.
