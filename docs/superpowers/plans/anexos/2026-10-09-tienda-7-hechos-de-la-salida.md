# Hechos para el plan de la entrega 7 de la tienda en línea («la salida»)

Investigación de solo lectura sobre el worktree `vim-pos-tienda` (rama `feat/tienda-cuentas`, entregas 1–6),
9 oct 2026. No se editó código, no se corrió nada. Todo lo que dice «sin verificar» es estado de
producción o de servicios externos que desde aquí no se puede ver.

**Abreviaturas de ruta**

| Prefijo | Ruta |
|---|---|
| `M/` | `supabase/migrations/` |
| `F/` | `supabase/functions/` |
| `S/` | `supabase/scripts/` |
| `SPEC` | `docs/superpowers/specs/2026-10-08-tienda-en-linea-design.md` |
| `P1`…`P6` | `docs/superpowers/plans/2026-10-0*-tienda-en-linea-{1-base,2-funcion,3-admin,4-caja,5-publica,6-cuentas}.md` |
| `SALIDA` | `docs/operacion/tienda-publica-salida.md` |
| `INST` | `docs/operacion/instalador-0.8.0-pendiente.md` |
| `CAJA` | `docs/operacion/tienda-en-linea-caja.md` |
| `ADR32` | `docs/decisiones/0032-la-tienda-es-un-canal-y-sus-clientes-no-viven-en-auth.md` |
| `LEAL` | `docs/operacion/salida-lealtad-0.5.0.md` (la lista de salida del precedente) |

`docs/LO-QUE-SIGUE.md` **no existe** en este worktree (búsqueda por nombre sin resultados).

---

## 0. Lo que el diseño pide de la entrega 7

- Entrega 7 = «Aviso de privacidad de la tienda, sección nueva en los términos del servicio, revisión
  de seguridad, prueba con Knock-Out, instalador 0.8.0 en martes y ADR» (`SPEC:437-438`).
- Cobro: «Incluida en todos los planes menos Esencial; en Esencial, complemento de $100/mes» (`SPEC:60`).
- Complemento y plan: fila `TIENDA` $100; bandera `tienda_incluida` en los planes; **la concesión por
  plan y la activación van en la entrega 7**, «como hizo lealtad en 0159»: sumar
  `('TIENDA','tienda_incluida')` a `_sincronizar_addons_del_plan` y a `ADDONS_DEL_PLAN`, activar el
  complemento y otorgarlo a quien ya está en esos planes (`SPEC:226-235`).
- «La tienda queda apagada para todos hasta la última [entrega]» (`SPEC:426-427`).
- Revisión de seguridad completa de la función pública y las cuentas antes de la salida (`SPEC:422`).
- Legales: «el restaurante es el responsable de los datos de sus clientes y VIM los trata por encargo»
  (`SPEC:449-450`).
- El ADR que pedía el diseño **ya está escrito** (`ADR32:1-5`); lo que le falte a la salida sería otro
  ADR o una enmienda.

---

## 1. El precedente: cómo se concedió y activó la lealtad

### 1.1 Tablas

**`addons`** (`M/0002_nucleo_comercial.sql:105-121`): `id`, `codigo varchar(50) UNIQUE`, `nombre`,
`descripcion`, `precio_mensual_mxn numeric(10,2) >= 0`, `features_activadas jsonb`,
`visible_publico boolean DEFAULT true`, **`activo boolean DEFAULT true`**, `orden_visualizacion`,
`created_at`, `updated_at`. Lectura abierta: política `addons_select_publico … USING (true)`
(`M/0002_nucleo_comercial.sql:491`).

**`planes`** (`M/0002_nucleo_comercial.sql:69-94`): `codigo`, `nombre`, `descripcion`, `vertical`
(NULL-able desde `M/0086_planes_por_paquete.sql:47`), `precio_mensual_mxn`, `max_sucursales`,
`max_cajas_por_sucursal`, `max_usuarios`, `timbres_cfdi_mensuales`, **`features_incluidos jsonb`**,
`visible_publico`, `activo`, `orden_visualizacion`. Lectura abierta: `planes_select_publico`
(`M/0002_nucleo_comercial.sql:488`).

- **No hay columnas `lealtad_incluida` ni `tienda_incluida`.** Son **claves dentro de
  `features_incluidos`**: `cfdi_incluido` (`M/0086_planes_por_paquete.sql:76,84,92`),
  `delivery_incluido` (`M/0141_cobro_promocion_prueba_plan.sql:270-273`), `lealtad_incluido`
  (`M/0156_lealtad.sql:216-219`) y **`tienda_incluida`** (`M/0161_tienda_en_linea_base.sql:744-747`).
- **Trampa de género:** las tres anteriores terminan en `_incluido`; la de la tienda es
  `tienda_incluida`. Quien copie el renglón de lealtad y solo cambie el código escribe
  `tienda_incluido` y no concede nada, sin error.

**`tenant_addons`** (`M/0002_nucleo_comercial.sql:226-245`): `tenant_id`, `addon_id`, `fecha_inicio date`,
`fecha_fin date NULL`, `activo`, `precio_mensual_mxn`, `notas`, `created_by`, y
`CONSTRAINT addon_unico_activo UNIQUE (tenant_id, addon_id, fecha_inicio)` (una alta por día, no «uno
activo»; explicado en `apps/platform/app/lib/addons.ts:3-14`). Columnas añadidas:
`incluido_en_plan boolean DEFAULT false` (`M/0141_cobro_promocion_prueba_plan.sql:256-258`) y `cantidad`
(0147, citada en `packages/db/src/cobro.ts:107-116`). El negocio lee las suyas:
`tenant_addons_select_tenant` (`M/0002_nucleo_comercial.sql:504`).

**`tenant_addon_activo(p_tenant_id, p_codigo)`** (`M/0081_addon_cfdi_y_folios.sql:54-71`): TRUE si existe
fila con `ta.activo`, `fecha_inicio <= hoy México` y `fecha_fin` nula o `>= hoy México`. **No mira
`addons.activo`** (el propio 0156 lo dice: `M/0156_lealtad.sql:201-202`). Solo `service_role` la ejecuta
desde la 0132 (`M/0132_endurecer_roles_y_permisos.sql:620-621`).

### 1.2 Los planes reales (por migraciones)

| Código | Estado | Precio | `tienda_incluida` | Fuente |
|---|---|---|---|---|
| `ESENCIAL` | activo | $699 | false | `M/0086_planes_por_paquete.sql:71-78`; `M/0161…:745` |
| `NEGOCIO` | activo | $999 | true | `M/0086…:79-86`; `M/0161…:745` |
| `CADENA` | activo | $1,999 | true | `M/0086…:87-94`; `M/0161…:745` |
| `FT`,`QS`,`CB`,`FS`,`DK`,`ENT` | **retirados** (`activo=false`, `visible_publico=false`); quien los tiene los conserva | — | true | `M/0086…:120-122`; `M/0161…:747` |

- El `UPDATE` de la 0161 nombra los nueve códigos y pone `tienda_incluida = (codigo <> 'ESENCIAL')`
  (`M/0161_tienda_en_linea_base.sql:744-747`). El diseño decía solo «NEGOCIO y CADENA» (`SPEC:229`); la
  migración incluye también los seis heredados, igual que delivery y lealtad.
- **Un plan fuera de esa lista no tiene la clave** y, por tanto, no la concede (el `COALESCE(…, false)`
  de `M/0159_lealtad_admin.sql:77`). La memoria del proyecto menciona planes `PERSONALIZADO` y
  `REPARTIDOR` que difieren entre dev y nube; **en las migraciones no existe ningún plan con esos
  códigos** (solo roles: `M/0053_roles_delegados.sql:8`, `M/0076_rol_repartidor.sql:23`). Si en
  producción hay un plan creado a mano, hay que mirarlo antes de la salida (sin verificar aquí).
- El registro público da de alta en `ESENCIAL` salvo el giro `ENTERPRISE`, que entra en `CADENA`
  (`F/_shared/alta.ts:23-26`).
- Smoke que fija esto: `S/smoke_tienda_modulo.sql:59-65`.

### 1.3 Las migraciones 0156–0160

- **0156** (`M/0156_lealtad.sql:198-219`): inserta `LEALTAD` **inactivo** (`activo=false`, $100,
  `features_activadas {"lealtad": true}`, orden 25) y la bandera `lealtad_incluido` en los planes. Crea
  la guardia del interruptor (`configuracion_tenant_lealtad_guardia`, `:243-277`: exige complemento
  vigente y programa) y `tenant_addons_apaga_lealtad` (`:280-297`: dar de baja el complemento apaga el
  interruptor del dueño). Añade `lealtad` a `modulos_efectivos` (`:301` en adelante).
- **0157, 0158**: corte y candado de factura; no tocan la concesión.
- **0159 §2** (`M/0159_lealtad_admin.sql:40-151`), **el molde a copiar**. Tres pasos:
  1. `UPDATE addons SET activo = true … WHERE codigo = 'LEALTAD' AND NOT activo;` (`:43`).
  2. Redefinir `_sincronizar_addons_del_plan` con la pareja nueva (`:52-134`, abajo íntegra).
  3. Relleno único para quien ya está en un plan que la incluye (`:140-151`):
     `INSERT INTO tenant_addons … SELECT … FROM suscripciones s JOIN planes p … CROSS JOIN addons a
     WHERE a.codigo='LEALTAD' AND s.estado='ACTIVA' AND COALESCE((p.features_incluidos->>'lealtad_incluido')::boolean,false)
     AND NOT EXISTS (fila activa) ON CONFLICT ON CONSTRAINT addon_unico_activo DO NOTHING`.
     - **Se guía por `suscripciones.estado = 'ACTIVA'`**, no por `tenants.plan_actual_id`: un negocio
       en prueba sin suscripción, o con la suscripción pausada, **no la recibe** aunque su plan la
       incluya. La lista de salida de lealtad lo trae como paso de comprobación con su consulta
       (`LEAL:31-35`).
     - Corre también en cada caja; ahí `suscripciones` está vacía y no hace nada
       (`M/0159_lealtad_admin.sql:10-11,137-139`).
- **0160** (`M/0160_reabrir_cuenta_impresa.sql`): no tiene que ver con complementos.

### 1.4 `_sincronizar_addons_del_plan`: definición vigente, íntegra

Única definición vigente: **`supabase/migrations/0159_lealtad_admin.sql:52-134`** (la anterior es
`M/0141_cobro_promocion_prueba_plan.sql:277-352`; ninguna migración posterior a la 0159 la redefine:
las 0161–0166 solo la mencionan en un comentario, `M/0161_tienda_en_linea_base.sql:727-730`).

```sql
CREATE OR REPLACE FUNCTION public._sincronizar_addons_del_plan(p_tenant uuid, p_plan uuid, p_retirar boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hoy      date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_feat     jsonb;
  v_plan_nom text;
  v_nota     text;
  v_addon    uuid;
  v_fila     public.tenant_addons%ROWTYPE;
  v_n        int;
  r          record;
  v_conc     text[] := '{}';
  v_ret      text[] := '{}';
BEGIN
  SELECT COALESCE(features_incluidos, '{}'::jsonb), nombre INTO v_feat, v_plan_nom FROM public.planes WHERE id = p_plan;
  v_nota := 'Incluido en el plan ' || COALESCE(v_plan_nom, '');

  FOR r IN SELECT * FROM (VALUES ('CFDI', 'cfdi_incluido'), ('DELIVERY', 'delivery_incluido'), ('LEALTAD', 'lealtad_incluido')) AS x(codigo, bandera) LOOP
    SELECT id INTO v_addon FROM public.addons WHERE codigo = r.codigo;
    CONTINUE WHEN v_addon IS NULL;

    IF COALESCE((v_feat->>r.bandera)::boolean, false) THEN
      SELECT * INTO v_fila FROM public.tenant_addons
       WHERE tenant_id = p_tenant AND addon_id = v_addon AND activo
       ORDER BY fecha_inicio DESC LIMIT 1
       FOR UPDATE;

      IF FOUND AND v_fila.incluido_en_plan AND v_fila.precio_mensual_mxn = 0 THEN
        CONTINUE;                                            -- ya lo tiene incluido
      ELSIF FOUND AND v_fila.fecha_inicio = v_hoy THEN
        -- Se dio de alta hoy (pagado): se corrige en su lugar, no cabe otra fila con la misma fecha.
        UPDATE public.tenant_addons
           SET precio_mensual_mxn = 0, incluido_en_plan = true, notas = v_nota, updated_at = now()
         WHERE id = v_fila.id;
      ELSE
        -- ¿Una baja de HOY? Se reactiva esa fila: un INSERT chocaría con addon_unico_activo.
        UPDATE public.tenant_addons
           SET activo = true, fecha_fin = NULL, precio_mensual_mxn = 0, incluido_en_plan = true, notas = v_nota, updated_at = now()
         WHERE tenant_id = p_tenant AND addon_id = v_addon AND fecha_inicio = v_hoy AND NOT activo;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO public.tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn, notas, incluido_en_plan)
          VALUES (p_tenant, v_addon, v_hoy, true, 0, v_nota, true);
        END IF;
        IF v_fila.id IS NOT NULL THEN
          -- Lo pagaba aparte: esa fila se cierra hoy (la historia de lo que pagó se queda) y ya entró
          -- la nueva a $0. Cobrarle aparte lo que su plan ya incluye sería cobrarlo dos veces.
          -- DIFERENCIA CON 0141: allá la pagada se cerraba ANTES de dejar activa la incluida. Para CFDI
          -- y DELIVERY el orden da igual, pero al cerrar una fila de LEALTAD se dispara
          -- trg_tenant_addons_apaga_lealtad (0156), que si en ese instante no ve ninguna fila vigente
          -- apaga el interruptor del dueño: quien subía de plan perdía su programa encendido. Con la
          -- incluida ya activa el trigger la ve y no apaga nada. Las dos filas no chocan con
          -- addon_unico_activo: a esta rama solo llega una pagada con fecha_inicio distinta de hoy.
          -- (Se pregunta por v_fila.id y no por FOUND, que el UPDATE y el INSERT de arriba ya pisaron.)
          UPDATE public.tenant_addons
             SET activo = false, fecha_fin = v_hoy, updated_at = now(),
                 notas = concat_ws(' · ', notas, 'Pasa a incluido en el plan ' || COALESCE(v_plan_nom, ''))
           WHERE id = v_fila.id;
        END IF;
      END IF;
      v_conc := v_conc || r.codigo;

    ELSIF p_retirar THEN
      -- Solo lo que dio el plan. Lo que paga aparte o se le regaló por cortesía no se toca.
      UPDATE public.tenant_addons
         SET activo = false, fecha_fin = v_hoy, updated_at = now()
       WHERE tenant_id = p_tenant AND addon_id = v_addon AND activo AND incluido_en_plan;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN v_ret := v_ret || r.codigo; END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('concedidos', to_jsonb(v_conc), 'retirados', to_jsonb(v_ret));
END;
$$;
REVOKE ALL ON FUNCTION public._sincronizar_addons_del_plan(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._sincronizar_addons_del_plan(uuid, uuid, boolean) TO service_role;
COMMENT ON FUNCTION public._sincronizar_addons_del_plan(uuid, uuid, boolean) IS
  'Interna (0141, 0159): concede a $0 los add-ons que el plan incluye (CFDI, DELIVERY, LEALTAD) y, si p_retirar, quita los que se dieron por el plan anterior. Respeta addon_unico_activo reactivando la fila del día.';
```

### 1.5 Cuándo corre y qué hace con un complemento inactivo

- **No hay disparador.** La llaman dos funciones y nadie más (`M/0141_cobro_promocion_prueba_plan.sql:275-276`):
  - `cambiar_plan_tenant` → `_sincronizar_addons_del_plan(p_tenant_id, p_plan_id, true)`; definición
    vigente de `cambiar_plan_tenant` en 0147 (`M/0147_extras_por_cantidad.sql:462`; la original en
    `M/0141…:370-448`, llamada en `:418`). La invoca el panel: acción `cambiar_plan`
    (`apps/platform/app/api/tenants/[id]/route.ts:374-402`).
  - `crear_tenant_con_owner` → `…(v_tenant, v_plan, false)` (`M/0141…:459-494`, llamada en `:489`):
    **cada alta de negocio** (panel y registro público).
- **Con `addons.activo = false` concede igual.** Busca el complemento solo por código
  (`SELECT id INTO v_addon FROM public.addons WHERE codigo = r.codigo;`, `M/0159_lealtad_admin.sql:74`),
  sin filtrar `activo`; solo salta si la fila no existe (`:75`). Y `tenant_addon_activo` tampoco mira
  `addons.activo` (`M/0081…:61-70`). **`addons.activo` solo esconde el complemento del catálogo del
  panel** (§3). Por eso la entrega 1 retiró la pareja de la función: habría concedido desde el primer
  día (`P1:996`; `P1:30`).
- Retirar: solo filas `activo AND incluido_en_plan` (`M/0159…:120-122`); lo pagado aparte o de cortesía
  se queda. Para la tienda, cerrar la fila dispara `tenant_addons_apaga_tienda`
  (`M/0163_tienda_admin.sql:76-94`), que apaga `modulo_tienda_activo` si ya no queda ninguna vigente:
  **el orden «activar la incluida antes de cerrar la pagada» de la 0159 hay que conservarlo** (`P3:447`).
- Permisos fijados por prueba: `supabase/tests/0003_grants_secdef.test.sql:40`,
  `supabase/tests/0025_cobro_plan.test.sql:16`, `S/smoke_cobro_plan.sql:207`.

### 1.6 Qué dejó la 0161 para TIENDA y qué falta

Dejó (`M/0161_tienda_en_linea_base.sql:724-836`):

- Fila `addons`: `TIENDA`, «Tienda en línea», **$100.00**, `features_activadas {"tienda": true}`,
  **`activo = false`**, orden 30 (`:731-742`). La descripción ya dice «Incluida sin cargo desde el plan
  Negocio; en Esencial se contrata aparte» (`:735-736`).
- Bandera `tienda_incluida` en los nueve planes (`:744-747`).
- Módulo `tienda` en `modulos_efectivos`: permitido = `tenant_addon_activo(…,'TIENDA')`; efectivo =
  permitido AND `configuracion_tenant.modulo_tienda_activo` (`:823-828`).
- Después: guardia del interruptor (`configuracion_tenant_tienda_guardia`, exige complemento vigente y
  fila en `tienda_config`: `M/0163_tienda_admin.sql:40-71`) y `tenant_addons_apaga_tienda` (`:76-94`).
- Catálogo de módulos TS: `tienda` con `porAddon: true` e `interruptorDueno: "modulo_tienda_activo"`
  (`packages/db/src/modulos.ts:6,13,22`).

**Falta para (a): que los planes que la incluyen la concedan solos**

| # | Qué | Dónde |
|---|---|---|
| a1 | Pareja `('TIENDA', 'tienda_incluida')` en la lista del `FOR` | nueva migración que redefine la función copiando **íntegro** `M/0159_lealtad_admin.sql:52-134` (cambia `:73` y el `COMMENT` de `:133-134`) |
| a2 | `UPDATE addons SET activo = true … WHERE codigo = 'TIENDA' AND NOT activo` | misma migración (molde `M/0159…:43`) |
| a3 | Relleno a quien ya está en un plan que la incluye | misma migración (molde `M/0159…:140-151`, con `'TIENDA'` y `'tienda_incluida'`) |
| a4 | Espejo TS `{ codigo: "TIENDA", bandera: "tienda_incluida" }` | `apps/platform/app/lib/cambio-plan.ts:11-15` (y el comentario de `:3-7`) |
| a5 | `"TIENDA"` en `INCLUIDOS_DESDE_NEGOCIO` | `apps/platform/app/lib/addons.ts:17` (hoy `["DELIVERY","LEALTAD"]`); sin esto, **activar TIENDA a mano a un negocio de Negocio/Cadena pre-llena $100 y no lo marca incluido** (`apps/platform/app/api/tenants/[id]/route.ts:312-328`) |
| a6 | Textos del panel | `CONSECUENCIA_BAJA` no tiene `TIENDA` (`apps/platform/app/components/ficha-contrato.tsx:23-27`); el aviso «Pierde …: lo tenía por el plan» solo redacta DELIVERY y LEALTAD (`ficha-contrato.tsx:411`) |
| a7 | Smoke que hoy **afirma lo contrario** | `S/smoke_tienda_modulo.sql:67-79` (pasos 6 y 7: «no la concede todavía», «no debe nacer activo») se pondrá rojo con la migración; hay que invertirlo y sumar el caso «pagaba aparte y sube de plan sin que se apague la tienda» (molde `S/smoke_lealtad_admin.sql:53-90`) |
| a8 | Pruebas TS | `apps/platform/app/lib/__tests__/addons.test.ts:49-74`, `cobro-promocion.test.ts:153-170` |

**Falta para (b): que Esencial la contrate por $100**

- Con a2 el complemento aparece en la ficha del cliente con su botón «Activar…» (§3.1). En Esencial,
  `precioAltaAddon` devuelve el precio de lista ($100) con o sin a5 (`apps/platform/app/lib/addons.ts:36-39`).
- **No existe contratación desde el admin del negocio**: solo WhatsApp (§4). El «camino real» hoy es:
  el dueño escribe → un operador de VIM pulsa «Activar…» en el panel.
- El cobro del $100: §3.3.

---

## 2. `ADDONS_DEL_PLAN` y los espejos en TypeScript

| Espejo | Dónde | Qué lista hoy | ¿TIENDA? |
|---|---|---|---|
| `ADDONS_DEL_PLAN` | `apps/platform/app/lib/cambio-plan.ts:11-15` | CFDI/`cfdi_incluido`, DELIVERY/`delivery_incluido`, LEALTAD/`lealtad_incluido` | no |
| `vistaPreviaCambioPlan` (lo usa) | `apps/platform/app/lib/cambio-plan.ts:62-110` (bucle `:78-88`) | vista previa de qué concede, qué deja de pagar y qué retira | — |
| `INCLUIDOS_DESDE_NEGOCIO` | `apps/platform/app/lib/addons.ts:17` | DELIVERY, LEALTAD | no |
| `PLANES_QUE_LO_INCLUYEN` | `apps/platform/app/lib/addons.ts:48` | NEGOCIO, CADENA, FT, QS, CB, FS, DK, ENT (lista explícita «para que un plan nuevo no se regale solo», `:41-47`) | — |
| `MODULOS` | `packages/db/src/modulos.ts:18-27` | ya incluye `tienda` (`:22`) | sí |
| `addonVigente` / `importeAddon` / `totalMensual` | `packages/db/src/cobro.ts:127-166` | espejo de `tenant_addon_activo` y suma del cobro; genérico, no lista códigos | n/a |

- **Solo `apps/platform` tiene espejos por código.** En `apps/admin` no hay ninguno
  (`from("addons")`/`from("planes")` no aparece en `apps/admin`; lee `tenant_addons` con su join en
  `apps/admin/app/lib/plan.ts:119-123`). Las funciones Edge solo llaman `tenant_addon_activo` para
  `CFDI` (`F/cargar-csd/index.ts:149`, `F/autofacturar/index.ts:129`, `F/timbrar-cfdi/index.ts:86`,
  `F/timbrar-global/index.ts:82`); la tienda no pregunta por el complemento en TS: lo hace
  `tienda_negocio` vía `modulos_efectivos` (`M/0163_tienda_admin.sql:121-123`).
- **No hay prueba que compare `ADDONS_DEL_PLAN` con el SQL.** Ninguna prueba de `apps/platform` lee la
  migración (la única que abre un archivo del repo es `manifiesto.test.ts:119`, sobre el updater). El
  acoplamiento es por comentario: «si cambias uno, cambia el otro» (`M/0159_lealtad_admin.sql:51`;
  `apps/platform/app/lib/cambio-plan.ts:3-7`). Lo que sí existe, cada uno por su lado:
  - TS: `cobro-promocion.test.ts:105-171` (vista previa; lealtad en `:153-170`) y `addons.test.ts:49-74`
    (`precioAltaAddon`).
  - SQL: `S/smoke_lealtad_admin.sql:18-90`, `S/smoke_cobro_plan.sql:123-164`, `S/smoke_tienda_modulo.sql:59-79`.

---

## 3. Panel de VIM (`apps/platform`)

### 3.1 Cómo aparece y se activa un complemento

- La ficha pide el catálogo con **`.eq("activo", true)`** (`apps/platform/app/api/tenants/[id]/route.ts:58-62`)
  y lo pinta en «Add-ons»: nombre, precio y botón «Activar…» / «Dar de baja…»
  (`apps/platform/app/components/ficha-contrato.tsx:290-320`; los extras por cantidad se filtran aparte, `:296`).
  **Es el único sitio del panel que filtra por `addons.activo`** para complementos (la otra consulta a
  `addons` es la de CFDI, `apps/platform/app/api/cfdi/route.ts:58`). Hoy TIENDA no sale porque está
  inactivo (`M/0161…:739`).
- En «Módulos y límites» un módulo `porAddon` solo informa: «Por el add-on …» o «Sin add-on … · se
  activa arriba, en Add-ons» (`apps/platform/app/components/modulos-limites.tsx:78-79`). No se puede
  permitir por excepción: la ruta rechaza los `porAddon` (`route.ts:478-481`).
- Acción `addon_activar` (`route.ts:281-345`):
  - Busca el complemento **solo por código, sin mirar `activo`** (`:285-291`): con una llamada directa
    a la API ya se podría conceder TIENDA hoy; la interfaz no lo ofrece.
  - `decidirAltaAddon` (ya lo tiene / reactivar la baja de hoy / insertar) (`:299-305`;
    `apps/platform/app/lib/addons.ts:66-72`).
  - Precio: `precioAltaAddon(codigo, planCodigo, precioLista)` (`:312-317`); un precio explícito gana (`:320`).
  - `incluido_en_plan = (sin precio explícito AND precio 0 AND precioLista 0)` (`:328`); nota «incluido
    en el plan» si salió en $0 sin motivo (`:325`).
  - Inserta o reactiva en `tenant_addons` (`:331-338`) y audita (`:340-343`).
  - El diálogo dice: «Se le empieza a cobrar a … desde hoy, con el precio que corresponda a su plan
    (puede ser $0 si lo incluye)» (`ficha-contrato.tsx:457-465`).
- Acción `addon_desactivar` (`route.ts:347-372`): exige motivo, pone `activo=false, fecha_fin=hoy`; el
  único efecto extra programado es pausar Uber si es DELIVERY (`:365`). Para TIENDA el apagado del
  interruptor lo hace el disparador de la base (`M/0163…:76-94`).
- Cambio de plan: `cambiar_plan_tenant` (`route.ts:374-402`); devuelve `addons.concedidos/retirados`.
- **El panel no menciona la tienda en ningún sitio** (búsqueda de `tienda|TIENDA` en `apps/platform`:
  solo «tiendas de Uber»). No lee `delivery_pedidos`, `tienda_*` ni `limites_cupo` (sin resultados).

### 3.2 Cómo se concedió lealtad a mano en la salida anterior

«A los que salgan y sigan siendo clientes se les concede a mano desde el panel (ficha del cliente →
Extras → Programa de lealtad; el precio se pre-llena en $0)» (`LEAL:34-35`). Ese pre-llenado en $0
depende de `INCLUIDOS_DESDE_NEGOCIO` (falta a5).

### 3.3 Cómo se cobra

- **No hay cobro automático ni pasarela.** El operador registra pagos a mano («Registrar pago…»,
  `apps/platform/app/components/ficha-pagos.tsx:33-37,78-80`); la base recorre la fecha de cobro.
- **El complemento de $100 sí entra solo en el importe mensual**, sin código nuevo, por ser una fila de
  `tenant_addons` con precio > 0 y `incluido_en_plan = false`:
  - `importeAddon`: lo incluido en el plan vale 0; lo demás, precio × cantidad
    (`packages/db/src/cobro.ts:142-146`). `totalAddons` suma los vigentes (`:149-151`);
    `totalMensual` = suscripción vigente + complementos (`:157-166`).
  - Ficha: `totalMensual(suscripcion, d.addons, hoy)` (`ficha-contrato.tsx:123`).
  - Monto sugerido al registrar un pago: `addonsAlMes={totalAddons(d.addons, hoyMx())}`
    (`apps/platform/app/clientes/[id]/page.tsx:172`) → `montoPeriodos(…, addonsAlMes)`
    (`apps/platform/app/lib/promocion.ts:93-100`).
  - Alerta de cobro vencido: `precioVigente + totalAddons` (`apps/platform/app/api/alertas/route.ts:105-110,277`).
  - MRR: `totalMensual` (`apps/platform/app/api/metricas/route.ts:29-51`).
  - Lo que ve el dueño en «Plan y pagos»: `desgloseMensual` pinta un renglón por complemento vigente,
    con «incluido en tu plan» / «sin costo» / importe (`apps/admin/app/lib/plan.ts:69-92`;
    `apps/admin/app/(panel)/configuracion/plan/page.tsx:42,72-95`).
- **Sin suscripción activa el total es cero, complementos incluidos** («mientras no se cobra el plan no
  se cobra nada», `packages/db/src/cobro.ts:153-162`): un Esencial en prueba con TIENDA a $100 no paga
  nada hasta que se le active el cobro.
- Términos vigentes: «por mes adelantado … más IVA» y los extras «con el precio de esa misma página»
  (`sitio-web/terminos.html:154-156,186`).

---

## 4. Admin (`apps/admin`): la invitación

- La entrada «Tienda en línea» está en el menú para todos (`apps/admin/app/components/admin-shell.tsx:58`;
  decisión de Fermín, `P3:440`); ruta protegida a rol ≥ 4 (`apps/admin/app/lib/acceso.ts:25`).
- `apps/admin/app/(panel)/tienda/layout.tsx:13-15`: `estadoTienda(useModulos())`; si `sin_contratar`,
  pinta `TiendaSinContratar`.
- **De qué depende** (`apps/admin/app/lib/tienda-plan.ts:9-13`): **solo de `modulos.permitidos.tienda`**,
  es decir, de `tenant_addon_activo(tenant,'TIENDA')` (`M/0161…:826-827`). No mira el plan, ni
  `addons.activo`, ni el precio. Si la lectura de módulos falla, enseña la sección (`:11`).
- **Texto de hoy** (`apps/admin/app/components/tienda-sin-contratar.tsx:10-19` +
  `apps/admin/app/lib/tienda-plan.ts:25-48`):
  - Encabezado: «Tienda en línea» / «Recibe los pedidos de tus clientes en tu caja.»
  - Título: «Tu propia tienda en línea». Texto: «Tus clientes piden desde su teléfono, para recoger o a
    domicilio, y el pedido cae en tu caja. Sin comisión por pedido.»
  - Cuatro puntos (`TIENDA_INCLUYE`, `tienda-plan.ts:25-30`); el último: «Sin comisión. Una cuota fija,
    no un porcentaje de cada venta.»
  - Cierre: **«Estamos por lanzarla. Escríbenos y te avisamos en cuanto esté lista.»**; botón:
    **«Avísenme cuando esté lista»** (`tienda-plan.ts:40-43`).
  - Mensaje de WhatsApp: «…Quiero la tienda en línea. Avísenme cuando esté lista.» (`tienda-plan.ts:46-48`).
  - El comentario del archivo ya trae los textos de salida: cierre «Escríbenos y la activamos.», botón
    «Quiero mi tienda en línea», mensaje «Quiero activar la tienda en línea.» (`tienda-plan.ts:36-38`;
    también `P3:447`).
  - Prueba que fija el texto provisional y habrá que cambiar: `apps/admin/app/lib/__tests__/tienda-plan.test.ts:12-24`.
- **Cómo contrata hoy un negocio lealtad o delivery desde el admin: no contrata; pide.**
  `PedirModulo` es una tarjeta con **una sola acción, abrir WhatsApp con el mensaje hecho, y sin
  precios a propósito** («Sin precios: los dice quien contesta, que sabe en qué plan y con qué promoción
  está este cliente», `apps/admin/app/components/pedir-modulo.tsx:7-13`; enlace en `:27,46-55`).
  - Lealtad: cierre «Si te interesa, escríbenos y lo activamos contigo.», botón «Preguntar por el
    programa de lealtad» (`apps/admin/app/components/lealtad-sin-contratar.tsx:12-19`), mensaje «Quiero
    activar el programa de lealtad.» (`apps/admin/app/lib/lealtad-plan.ts:28-30`).
  - Inventario usa la misma tarjeta (`apps/admin/app/components/inventario-desde-negocio.tsx:22`).
  - Delivery **no tiene invitación**: sin el complemento, «Integraciones» ni aparece y la ruta
    redirige (`apps/admin/app/(panel)/configuracion/layout.tsx:21`;
    `apps/admin/app/(panel)/configuracion/integraciones/page.tsx:55,175`).
- **Qué habría que cambiar para decir «incluida en tu plan: actívala» o «contrátala por $100 al mes»:**
  1. Con a1–a3 aplicadas, quien está en un plan que la incluye **ya tiene el complemento** y no ve la
     invitación: ve la página de configuración con el interruptor (`apps/admin/app/(panel)/tienda/page.tsx`).
     El «actívala» para ellos es el interruptor que ya existe, no un texto nuevo. Excepción: los que el
     relleno se salta (sin suscripción ACTIVA, §1.3) y los planes fuera de la lista.
  2. La invitación la verán sobre todo los de **Esencial**. Para que distinga los dos casos y diga el
     precio hace falta leer dos datos que hoy no lee: `planes.features_incluidos.tienda_incluida` del
     plan del negocio y `addons.precio_mensual_mxn`/`addons.activo` de `TIENDA`. Las dos tablas son de
     lectura abierta (`M/0002_nucleo_comercial.sql:488,491`) y el admin ya las alcanza por join
     (`apps/admin/app/lib/plan.ts:100,121`). Leer `addons.activo` permitiría además que la invitación
     cambie sola el día que se aplique la migración, sin depender del momento de la mezcla.
  3. Poner precio rompe la regla escrita de `PedirModulo` («sin precios», `pedir-modulo.tsx:11-12`): es
     decisión de producto (§10).
  4. Textos y prueba: `tienda-plan.ts:40-48`, `tienda-plan.test.ts:12-24`.
  5. Otros textos del apartado que nombran el plan: «Tu plan ya no incluye la tienda en línea.»
     (`apps/admin/app/components/tienda-estado.tsx:31-32`; `tienda-compartir.tsx:35`) y «Tu plan no
     incluye la tienda en línea.» para `SIN_ADDON_TIENDA` (`apps/admin/app/lib/tienda-reglas.ts:149`).
     Para un Esencial que la pagaba y se le dio de baja, «tu plan ya no incluye» no describe su caso.

---

## 5. Sitio web y pantallas donde se listan planes, precios y funciones (solo localización)

**`sitio-web/precios.html`**
- Tabla «Qué cambia de un plan a otro»: filas de complementos en `:309-332` (Facturación `:309-314`,
  «Pedidos de Uber Eats en la caja» `:321-326`, «Programa de lealtad» `:327-332`). No hay fila de tienda.
- Tarjetas de extras: Sucursal `:480-483`, Caja `:484-488`, Facturación `:489-497`, Uber Eats
  `:498-509`, Lealtad `:510-519`. No hay tarjeta de tienda.

**`sitio-web/funciones.html`**
- Metadatos que enumeran funciones: `:8`, `:16`, `:756`.
- Sección «Apps de reparto» `:478-572` (tarjeta de Uber con el precio en `:562-569`); sección «Lealtad»
  `:574-592` (precio en `:587-589`). No hay sección de tienda. `INST:60-61` ya pide «entrada en
  `sitio-web/funciones.html` (es una función nueva)».

**`sitio-web/novedades.html`**: última nota de función, lealtad, en `:181-189`. `INST:60` pide la nota de la 0.8.0.

**`sitio-web/terminos.html`**: ver §6.

**Generados** (no se editan a mano): `sitio-web/precios.md`, `funciones.md`, `novedades.md`,
`llms-full.txt` (los cuatro repiten los textos de lealtad/$100). Se regeneran con `pnpm sitio:generar`
y se prueban con `pnpm test:sitio` (`INST:60-61`).

**Otras páginas del sitio con la palabra «tienda»** (sin revisar su contexto): `contacto.html` (1),
`como-elegir-sistema-restaurante.html` (2), `novedades.html` (1), `terminos.html` (2, las de Uber).

**Admin**
- «Plan y pagos»: `apps/admin/app/(panel)/configuracion/plan/page.tsx:42,72-95` (desglose por complemento,
  §3.3); entrada del menú en `apps/admin/app/components/config-sidenav.tsx:8`. No tiene textos por
  complemento: usa `addons.nombre` («Tienda en línea», `M/0161…:734`).
- Invitación: §4.

**Panel de VIM**: nombre y precio salen de `addons` (`ficha-contrato.tsx:302-307`); la descripción del
catálogo es la de `M/0161…:735-736`. Textos fijos a tocar: a6.

**Catálogo compartido**: `packages/db/src/modulos.ts:22` («Tus clientes piden desde su teléfono, para
recoger o a domicilio.»).

---

## 6. Legales

### 6.1 Lo que existe de VIM POS

- **Términos del servicio:** `sitio-web/terminos.html`, «Última actualización: 1 de octubre de 2026»
  (`:120`). Secciones: Quién presta el servicio `:129`, Qué contratas `:147`, Qué NO incluye `:161`,
  Cómo se cobra `:184`, Cancelar `:202`, Tus datos son tuyos `:217`, Cookies `:235`, **Apps de reparto
  (hoy, Uber Eats) `:253-288`**, Disponibilidad y soporte `:291`, Límite de responsabilidad `:308`,
  Cambios y ley aplicable `:320`. **No hay sección de tienda en línea.**
  - «Tus ventas, tu menú y tus clientes son tuyos … Nosotros solo los procesamos para prestarte el
    servicio» (`:217-222`).
  - El molde más cercano a lo que pide el diseño es la sección de apps: autorización, uso «solo» para
    preparar y cobrar, borrado a 30 días, «el dinero no pasa por nosotros» (`:261-281`).
- **Aviso de privacidad de VIM:** `sitio-web/aviso-privacidad.html`. Secciones: responsable `:137`
  (nombre y domicilio como imagen, `:147`), qué datos `:165`, para qué `:181`, con quién `:195`, cuánto
  tiempo `:221`, ARCO `:231`, cookies `:252`, seguridad `:307`, cambios `:316`. Es el aviso **de VIM
  hacia quien le escribe o le contrata**. De los comensales solo habla en el caso de las apps de reparto
  («los tratamos por cuenta tuya y de la app … a los 30 días se borran … lo canalizamos a la app»,
  `:208-217`). **No menciona a los comensales de la tienda propia.**
- **Aceptación al registrarse (dueño):** casilla con enlaces a `https://vimpos.com.mx/terminos` y
  `/aviso-privacidad` (`apps/admin/app/registro/page.tsx:11-12,216-218`); la versión aceptada se guarda
  en `tenant_onboarding_estado.terminos_version` (`M/0142_soporte_y_registro_publico.sql:182-189`) con
  la constante **`TERMINOS_VERSION = "2026-10-01"`**, que hay que **cambiar cuando cambie el texto**
  (`F/_shared/alta.ts:11-16`). Los negocios dados de alta por VIM desde el panel tienen `NULL`
  (`M/0142…:189`): no hay constancia de que aceptaran ninguna versión.
- **En el admin no hay páginas legales propias** ni una pantalla donde el dueño acepte condiciones al
  encender la tienda (el único precedente de aceptación dentro del admin es la casilla de Uber:
  `apps/admin/app/(panel)/configuracion/integraciones/uber/callback/page.tsx:30,172,186`).

### 6.2 El aviso provisional de la tienda

`apps/tienda/app/[negocio]/privacidad/page.tsx` (comentario de provisional en `:1-3`; franja visible
«Aviso provisional … el aviso de privacidad definitivo se publicará antes del lanzamiento», `:32-34`).
Enlazado desde el pie (`apps/tienda/app/[negocio]/layout.tsx:49-50`), desde «Tus datos»
(`apps/tienda/app/components/datos.tsx:386`) y desde el acceso (`apps/tienda/app/components/acceso.tsx:155`).
`noindex` (`privacidad/page.tsx:15`).

Qué dice hoy:
- Datos pedidos, con y sin cuenta (`:36-46`); la cuenta es por restaurante, contraseña irreversible (`:48-57`).
- Finalidad: preparar, entregar, llamar; «no se usan para publicidad ni se venden» (`:59-63`).
- **Quién responde:** «Los recibe y los guarda {nombre}: es el restaurante el que decide qué se hace
  con ellos. VIM POS es su proveedor de tecnología … almacena los datos por encargo del restaurante y no
  los usa para nada propio» (`:65-70`). Coincide con `SPEC:449-450`.
- Conservación: el nombre, teléfono y dirección quedan en la lista de clientes del restaurante «hasta
  que le pidas al restaurante que los quite» (`:74-77`) — cubre la nota de `P2:1354`—; «el detalle de tu
  pedido en línea (lo que pediste, tus notas y los datos con los que lo hiciste) se anonimiza a los 30
  días» (`:78-81`).
- Terceros: Cloudflare Turnstile y Google Fonts; «no tiene publicidad ni herramientas de analítica» (`:84-92`).
- Almacenamiento local y cookie de sesión (`:94-105`); eliminar cuenta (`:107-116`); quitar datos: «pídeselo
  al restaurante» con sus teléfonos (`:118-134`).

Lo que el texto **no** tiene (hechos, no redacción):
- Identidad legal y domicilio del responsable: solo usa el nombre comercial (`:26`); `tienda_negocio`
  no devuelve razón social ni domicilio fiscal (solo `nombre_comercial`, `M/0163_tienda_admin.sql:116`).
- Procedimiento de derechos ARCO, medio de contacto por escrito, fecha de última actualización.
- **Dos afirmaciones que el código no cumple del todo** (§7c): dice que a los 30 días se anonimizan
  «tus notas», pero la retención no toca `nota_cliente` ni las notas de renglón; y un pedido atascado
  en `ACEPTADO` no se anonimiza nunca.
- **La tienda no tiene página de términos** (`SALIDA:276`). `terminos` está reservada como dirección
  (`M/0163_tienda_admin.sql:32`; `apps/admin/app/lib/tienda-reglas.ts:8`), así que ningún negocio la
  puede ocupar. La decisión 10 del plan 5 hablaba de «aviso de privacidad y términos» (`P5:32`); solo
  se construyó el aviso.
- `ADR32:94-97` ya fija qué se borra al eliminar la cuenta y dice «El aviso de privacidad lo dice».

---

## 7. Pendientes técnicos conocidos (confirmados en el código)

### (a) `pedir` no es idempotente — CONFIRMADO

- La función genera un código nuevo en cada llamada (`F/tienda/index.ts:404-405`) y
  `tienda_crear_pedido` genera su propio `id_externo` al azar (`M/0162_tienda_funcion.sql:640`) e
  inserta (`:734-756`). No hay llave de idempotencia en el cuerpo ni en la tabla.
- Lo único que frena un duplicado es el tope de 3 pedidos vivos por teléfono (`M/0162…:719-730`) y el
  índice único de `seguimiento_hash` (`M/0161…:34-35`), que no ayuda porque la huella es nueva cada vez.
- Mitigación actual, solo del lado del cliente: candado de envío fuera del componente
  (`apps/tienda/app/lib/envio.ts:92-132`) y no reintentar solo (`P5:30`; `ADR32:109-110`).
- Anotado para la 7: `P5:219`; pista de diseño: «derivar el código de seguimiento de una llave por
  compra» (`P2:1346`) — con eso el índice único existente haría de candado.
- **Dónde tocar:** `apps/tienda` (generar y conservar la llave por intento de compra),
  `F/_shared/tienda/validar.ts` (aceptarla), `F/tienda/index.ts:403-417`, y `tienda_crear_pedido` en una
  migración nueva (devolver el pedido existente en vez de insertar otro).

### (b) Un pedido `ACEPTADO` de gestión `ESCRITORIO` sin ticket no caduca — CONFIRMADO

- Al aceptar en gestión `ESCRITORIO`, `delivery-accion` solo mueve el estado a `ACEPTADO`; el ticket lo
  crea después la caja (`F/delivery-accion/index.ts:234-245`).
- El cron de vencidos solo toca `RECIBIDO` (`M/0164_tienda_caja.sql:179-183`).
- La puesta al día automática solo cubre **gestión `NUBE`** (`M/0164…:142`) y exige ticket (`JOIN
  tickets`, `:141`).
- `tienda_reportar_estado` solo se mueve si alguien la llama (`M/0164…:25-65`); para `ESCRITORIO` quien
  la llama es la caja (`desktop/src/delivery-espejo.mjs:49`). Si esa caja se apaga, se desinstala o se
  cambia antes de crear la cuenta, nadie más lo hará: `delivery_reclamar_pedido` lo dejó a su nombre.
- Consecuencias en el código:
  - El cliente ve «En preparación» sin fin (el seguimiento lee el estado).
  - Mientras exista un pedido vivo de la tienda en gestión `ESCRITORIO`, **todas las cajas de la
    sucursal sondean cada 10 s** (`F/_shared/delivery/espejo.ts:40-44`); los vivos se mandan siempre,
    sin ventana de tiempo (`F/delivery-espejo/index.ts:26,104`).
  - La retención no lo alcanza (c).
  - El tope de 3 vivos sí decae solo a las 6 horas (`M/0162…:725`).
- Anotado: `INST:74-75`; `P2:1353` («cubrir filas atascadas en ACEPTADO»).
- **Dónde tocar:** una pasada más dentro de `delivery_marcar_expirados` (junto a
  `tienda_sincronizar_estados_nube`, `M/0164…:205-211`) que cancele con motivo de lista cerrada los
  `canal='TIENDA'`, `gestion='ESCRITORIO'`, `estado='ACEPTADO'`, `ticket_id IS NULL` con más de X
  tiempo desde `aceptado_at`. Hay que decidir X y qué ve el cajero (§10). Ojo: la caja crea el ticket
  local y lo sube con el push (hasta 10 min de retraso), así que `ticket_id IS NULL` en la nube no
  prueba por sí solo que no exista cuenta en la caja.
- Variante del mismo hueco en `NUBE`: la pasada solo mira los últimos 7 días (`M/0164…:121,144`): una
  cuenta abierta más de una semana deja su pedido en `ACEPTADO` para siempre.

### (c) Retención — CONFIRMADO con huecos

- Cron diario `delivery-retencion`, 04:10 UTC, `delivery_anonimizar_pedidos_viejos(30)`
  (`M/0095_delivery_retencion.sql:45-55`). Definición vigente: `M/0161_tienda_en_linea_base.sql:45-79`.
- **Qué blanquea** (`M/0161…:53-63`): `cliente_nombre` → `'Cliente de app'` (también en pedidos de la
  tienda), `cliente_telefono`, `cliente_telefono_pin`, `direccion_texto`, `payload_raw`,
  `repartidor_nombre`, `repartidor_telefono`, `cliente_email`, `direccion`, `seguimiento_hash`; y el
  `payload` de `delivery_eventos` (`:74-76`).
- **Solo en estos estados** (`:65`): `ENTREGADO`, `RECHAZADO`, `CANCELADO`, `EXPIRADO`, `LISTO`, `ERROR`.
  **Nunca** `RECIBIDO`, `ACEPTADO`, `EN_PREPARACION` → los atascados de (b) conservan todo para siempre.
- **Qué NO blanquea** de un pedido de la tienda:
  - `nota_cliente` (texto libre de hasta 300 caracteres, `M/0162…:750`).
  - Las notas por renglón dentro de `items` (hasta 200 caracteres cada una, `M/0162…:576-577`).
  - `tienda_cuenta_id` (liga el pedido a una cuenta; solo se anula al eliminar la cuenta, `M/0166_tienda_cuentas.sql:619`).
  - `paga_con_mxn`, `pago_al_recibir`, `zona_envio_id` (no son datos personales por sí solos).
  - Anotado: `P1:1691`, `P2:1353`.
- **Fuera de su alcance, por diseño:**
  - El ticket: `tickets.nota_general` = forma de pago + nota del cliente, y `tickets.nombre_cliente`
    (`M/0161…:522-527`); permanentes, como cualquier ticket.
  - El cliente y la dirección que crea `crear_ticket_desde_tienda` en `clientes` y `direcciones_cliente`
    (`SPEC:162-165`): permanentes; el aviso provisional lo dice (`privacidad/page.tsx:74-77`).
  - `tienda_cuentas` y `tienda_direcciones`: viven hasta que el comensal elimina su cuenta
    (`M/0166…:612-622`). No hay caducidad por inactividad.
  - Las copias en las cajas: el cron solo existe en la nube (`M/0095…:47`). Que la fila anonimizada baje
    a la caja depende del delta por `updated_at` del espejo (`F/delivery-espejo/index.ts:106`) y de que
    la caja siga sondeando con la tienda; **sin verificar** que ocurra. `ADR32:96-97` ya admite que la
    copia en una caja conserva el identificador de la cuenta borrada.
- **Dónde tocar:** redefinir `delivery_anonimizar_pedidos_viejos` (cuerpo íntegro de `M/0161…:45-79`) en
  la migración de salida: sumar `nota_cliente`, limpiar `nota` dentro de `items`, decidir
  `tienda_cuenta_id`, y resolver los `ACEPTADO` viejos (o que (b) los saque antes).

### (d) `entrar` sin antirobot ni tope global — CONFIRMADO

- `entrar` no llama a `antirobot` (`F/tienda/index.ts:206-214`; decisión `P6:35`).
- Su único cupo es por IP: 10 cada 10 minutos, falla cerrado (`F/_shared/tienda/respuesta.ts:77`). No
  hay cupo por negocio ni por correo (los de `registrar`/`recuperar_pedir` sí, `:78-82`).
- La verificación corre en la base: `tienda_cuenta_entrar` → `_tienda_password_ok`
  (`M/0166_tienda_cuentas.sql:306-329`, `:130`), bcrypt coste 10 (`ADR32:29-32`), en el mismo Postgres
  de las cajas (`ADR32:83-86`). Cinco fallos bloquean la cuenta 15 minutos (`ADR32:77-82`).
- Sin IP reconocible todos comparten un contador (`F/_shared/tienda/respuesta.ts:15-18`).
- **Dónde tocar si hiciera falta:** `cuposDe` (`respuesta.ts:77`) para un cupo por negocio después del
  de IP; o `antirobot(…)` en la rama `entrar` + acción nueva en `AccionCaptcha`
  (`F/_shared/turnstile.ts:18`) + widget en `apps/tienda/app/components/acceso.tsx`.

### (e) Cupos y tablas que crecen

- `limites_cupo`: **se limpia sola**; cada `consumir_cupo` borra hasta 200 ventanas vencidas de
  cualquier clave (`M/0136_limites_y_sync_pull.sql:147-149`; razonamiento en `:30-32`). No hay cron ni
  hace falta mientras haya tráfico.
- `tienda_sesiones`: se barren hasta 200 vencidas **solo cuando alguien entra** (`M/0166…:317-319`; «no
  hay cron para esto», `:305`).
- `tienda_recuperaciones`: se barren hasta 200 vencidas **solo cuando alguien pide recuperar**
  (`M/0166…:378-380`).
- `delivery_pedidos`: **nunca se borra**, solo se anonimiza. Dos recorridos sin índice propio anotados:
  la pasada de estados (`M/0164…:119-121`) y el conteo de vivos por teléfono (`M/0162…:717-718`).
- `tienda_cuentas`: cuentas creadas y nunca usadas (incluidas las que deja quien pregunta por correos
  ajenos, `ADR32:68-76`) no caducan.
- Almacén `productos`: las fotos de productos borrados quedan huérfanas (`P3:447`).
- `tienda_cotizar` arma el menú entero de la sucursal en cada cotización (`M/0162…:441`); pendiente
  medirlo con un menú real (`P2:1356`).
- Cupo de `pedir`: 5 por hora por IP, **compartido entre negocios** y contando los intentos fallidos
  (`F/_shared/tienda/respuesta.ts:76`); revisar antes de salir (`P2:1355`): varias personas en la misma
  red móvil comparten IPv4 (`P2:1344`).

### (f) `TODO` / `ponytail:` / «entrega 7» en el código de la tienda

No hay ningún `TODO` ni `FIXME` en `apps/tienda/app`, `F/tienda`, `F/_shared/tienda`, `F/delivery-*`,
`F/_shared/delivery`, `M/016*.sql` ni `desktop/src/delivery-espejo*` (las coincidencias de «TODO» son la
palabra en mayúsculas dentro de frases). Marcas encontradas:

| Dónde | Qué dice |
|---|---|
| `M/0161_tienda_en_linea_base.sql:727-730` | la pareja, la activación y la concesión «van en la migración de salida (entrega 7)» |
| `S/smoke_tienda_modulo.sql:2-3,67-79` | el cambio de plan «TODAVÍA NO lo concede … entrega 7»; pasos 6 y 7 lo afirman |
| `apps/admin/app/lib/tienda-plan.ts:33-39` | «ENTREGA 7 (salida a clientes): vuelven los textos de contratación» |
| `apps/tienda/app/[negocio]/privacidad/page.tsx:1-3` | aviso provisional; «el texto definitivo es de la entrega 7 y lo revisa una persona» |
| `M/0162_tienda_funcion.sql:441` | `ponytail:` arma el menú entero en cada cotización |
| `M/0162_tienda_funcion.sql:717-718` | `ponytail:` conteo de vivos sin índice; índice parcial por `(tenant_id, cliente_telefono)` si pesa |
| `M/0164_tienda_caja.sql:119-121` | `ponytail:` recorre la tabla entera; índice parcial `(canal, gestion, estado)`; solo últimos 7 días |
| `M/0165_tienda_publica.sql:27` | `ponytail:` `_tienda_con_iva` relee el producto por cada opción |
| `F/_shared/tienda/respuesta.ts:24-25` | `ponytail:` IPv4 mapeada en hexadecimal cae en un /64 compartido |
| `apps/tienda/app/components/acceso.tsx:65` | `ponytail:` espera del token mirando cada 200 ms hasta 20 s |
| `apps/tienda/app/lib/cuenta.ts:38` | `ponytail:` «hoy» en UTC |
| `apps/tienda/app/lib/envio.ts:102-103` | `ponytail:` un resultado guardado no sabe de qué negocio era |
| `apps/tienda/app/lib/horario.ts:6` | `ponytail:` zona horaria fija a México; `tienda_negocio` debería mandarla |

### (g) Lista completa de lo que los planes y documentos dejaron para «la entrega 7», «la salida» o «después»

| # | Pendiente | Origen |
|---|---|---|
| 1 | Pareja `('TIENDA','tienda_incluida')` en `_sincronizar_addons_del_plan` y `ADDONS_DEL_PLAN`; activar el complemento; concederlo a quien ya está en Negocio/Cadena | `SPEC:230-235`; `P1:30`; `P1:996`; `P1:1691`; `P3:49`; `P3:434`; `M/0161…:727-730`; `SALIDA:269-270` |
| 2 | Conservar el orden de la 0159 (activar la incluida antes de cerrar la pagada) y probarlo con su smoke | `P3:447` |
| 3 | Devolver a la invitación los textos de contratación | `P3:447`; `apps/admin/app/lib/tienda-plan.ts:36-38` |
| 4 | Aviso de privacidad definitivo de la tienda | `SPEC:437`; `P5:32`; `P5:218`; `P6:187`; `SALIDA:275-276`; `privacidad/page.tsx:1-3` |
| 5 | El aviso debe decir que un pedido anónimo crea un cliente y una dirección permanentes en el negocio (el provisional ya lo dice) | `P2:1354` |
| 6 | Sección nueva en los términos del servicio | `SPEC:437` |
| 7 | Revisión de seguridad completa de la función pública y las cuentas | `SPEC:422`; `P5:218`; `P6:187` |
| 8 | Prueba con Knock-Out | `SPEC:438` |
| 9 | Instalador 0.8.0 en martes, con su lista y su nota | `SPEC:438,446`; `P4:30`; `P4:274,279`; `INST:1-97` |
| 10 | Idempotencia de `pedir` | `P5:219`; `P2:1346`; `ADR32:109-110` |
| 11 | Pedido `ACEPTADO` cuya caja se apagó antes de crear la cuenta no caduca | `INST:74-75` |
| 12 | La retención debe blanquear `nota_cliente` y las notas de renglón, y cubrir filas atascadas en `ACEPTADO` | `P1:1691`; `P2:1353` |
| 13 | Confirmar `pedidos.vimpos.com.mx` en `TURNSTILE_HOSTNAMES` (los dos dominios) y en el widget de Cloudflare | `P2:1351`; `SALIDA:41-69` |
| 14 | Confirmar que `CAPTCHA_OPCIONAL` no existe en producción | `P2:1352`; `SALIDA:73-74` |
| 15 | Revisar el cupo de 5 pedidos por hora por IP | `P2:1355` |
| 16 | Medir `tienda_negocio` y `tienda_cotizar` con un menú real | `P2:1356` |
| 17 | Analítica o píxeles en la tienda: «se decide en la salida» (hoy no hay y el aviso lo afirma) | `P5:29`; `privacidad/page.tsx:90-92` |
| 18 | Caja 0.7.0 y POS web abiertos a la vez en la misma sucursal: «se anota para el lanzamiento» | `P4:281`; `INST:76-77`; `SALIDA:167` |
| 19 | Cambio visible para quien ya usa Uber: el timbre se repite | `INST:34-35,78-79` |
| 20 | Recorrido completo contra la nube real y con una caja instalada (no probado) | `INST:70-73` |
| 21 | Periodo de espera antes de que otro negocio tome una dirección liberada | `P3:447` |
| 22 | ¿Debe una tienda volver a encenderse sola al renovar un complemento vencido? (hoy vencer por fecha no apaga el interruptor, `M/0163…:73-75`) | `P3:447` |
| 23 | Limpiar las fotos de productos borrados | `P3:447` |
| 24 | Ejercitar en producción subir, cambiar y quitar foto y logo, desde escritorio y desde un celular (iPhone) | `P3:446-447` |
| 25 | Vigilar la CPU de la base por `entrar`; antirobot o tope global si hiciera falta | `ADR32:83-86,111`; `SALIDA:271-274` |
| 26 | Verificar el correo (cambia «entra de una vez»; pide visto bueno) | `ADR32:103-106` |
| 27 | Ligar la cuenta a la lealtad | `ADR32:107-108`; `P6:34`; `SPEC:38-39` (tercera entrega) |
| 28 | Nota en `novedades.html` y entrada en `funciones.html`; `pnpm sitio:generar`; `pnpm test:sitio` | `INST:60-61` |
| 29 | Aviso a clientes por WhatsApp o correo (es 0.x.0) | `INST:95-97` |
| 30 | Migraciones 0165 y 0166 en producción y función `tienda` redesplegada con las acciones de cuenta | `SALIDA:32-34` |
| 31 | `VIM_TIENDA_URL` y `VIM_SMTP_*` en Supabase (sin ellos no sale ningún correo y la pantalla no avisa) | `SALIDA:75-84`; `ADR32:98-99` |
| 32 | Con `vim-tienda` son seis apps contra el límite de 100 despliegues al día | `SALIDA:257-265` |
| 33 | Refactorizar Lealtad para usar `Interruptor` y `Tarjeta` (dejado fuera, no es de la salida) | `P3:436` |

---

## 8. Observabilidad

**Lo que se registra hoy**

- **Función `tienda`:** `registrarError(funcion, codigo, causa)` es un `console.error("[funcion] CODIGO:
  mensaje")` y nada más (`F/_shared/errores.ts:19-22`). Va a los registros de la función en Supabase.
  Códigos que emite:
  - el nombre de la RPC cuando falla con algo que no es rechazo de negocio (`F/tienda/index.ts:96-99`);
  - `RPC_FORMA_INESPERADA` (`:104`), `IP_CLIENTE_DESCONOCIDA` (`:333`), **`CUPO_NEGOCIO_AGOTADO`**
    (`:399`), `PEDIDO_FORMA_INESPERADA` (`:421`), `CORREO_PEDIDO` (`:433,442`), `ERROR_INTERNO` (`:455`).
  - Avisos (`console.warn`/`error`): captcha que no pasó, con motivo y códigos de Cloudflare
    (`:128-135`); `CAPTCHA_OPCIONAL` activo (`:136`); «sin correo de … (falta VIM_TIENDA_URL o
    VIM_SMTP_*)» (`:160`, `:444`); correo que no salió (`:165-166`, `:441`).
  - **No se registra el camino feliz**: ni pedido creado, ni registro, ni entrada. Nunca datos de
    cuentas ni el código de seguimiento (`:39-41`).
- **Servidor de `apps/tienda`** (registros de Vercel): falta el secreto o la URL
  (`apps/tienda/app/lib/servidor/funcion.ts:39`), la función no contestó (`:52`), respondió con error
  —con pista si es 401— (`:56`), sin JSON (`:62`); sesión sin forma de token
  (`apps/tienda/app/api/tienda/route.ts:158`). En el navegador: `envio.ts:126`.
- **Aviso al dueño:** push «Tienda en línea: pedido sin aceptar» cuando un pedido vence
  (`M/0164_tienda_caja.sql:198-203`; texto en `CAJA:65-67`). Es para el dueño, no para VIM.
- **Caja:** `%APPDATA%\vim-pos-desktop\vim-pos.log`, líneas `[espejo]` (`CAJA:125-126`;
  `desktop/RUNBOOK.md:526-529`); el pedido local guarda `ultimo_error` con el motivo para el cajero.
- **Correo interno a VIM:** existe el mecanismo `VIM_AVISOS_A` (por omisión `hola@vimpos.com.mx`), pero
  solo lo usan el registro de negocios (`F/signup-tenant/index.ts:145-147`) y la solicitud de demo
  (`F/solicitar-demo/index.ts:178`). **La tienda no manda ningún aviso interno.**
- **Sentry: no hay.** Se descartó a propósito («un proveedor más … para un operador de una sola
  persona», `M/0072_errores_app.sql:8-10`). En su lugar existe `errores_app`
  (`M/0072_errores_app.sql:22-44`) con su lista agrupada en el panel
  (`apps/platform/app/api/errores/route.ts:12-72`). La alimentan el POS
  (`apps/pos/app/lib/reportar-error.ts`, `apps/pos/app/error.tsx`, `global-error.tsx`) y la caja
  (`desktop/src/sync-errores.mjs`). **La tienda no escribe ahí**, y la tabla exige `tenant_id` y un `app`
  de la lista `pos|admin|caja|kds` (`M/0072…:24-27`).
- **Panel de VIM:** las alertas leen cajas, suscripciones, folios, onboarding, tickets, sync, sellos,
  prospectos y complementos (`apps/platform/app/api/alertas/route.ts:91-106`). **Nada de
  `delivery_pedidos` ni de la tienda.**

**Lo que ya existe y se puede reutilizar para saber que la tienda funciona tras salir** (todo consultable
sin código nuevo; ninguna de estas consultas está escrita hoy en el repo)

| Señal | De dónde sale |
|---|---|
| Pedidos por día, negocio y desenlace (`ENTREGADO`/`EXPIRADO`/`RECHAZADO`/`CANCELADO`) | `delivery_pedidos WHERE canal='TIENDA'` con `recibido_at`, `aceptado_at`, `listo_at`, `entregado_at`, `cancelado_at`, `motivo_cancelacion` (`M/0164…:52-62,181`) |
| Vencidos sin aceptar (la tienda abierta y nadie mirando) | `estado='EXPIRADO'`, `motivo_cancelacion='Venció la ventana de aceptación'` (`M/0164…:181`) |
| Atascados | `estado='ACEPTADO'` viejos, con o sin `ticket_id` (§7b) |
| Cancelados solos por la caja | `ultimo_error` del pedido (`P4:180`) |
| Tiendas encendidas y negocios con el complemento | `configuracion_tenant.modulo_tienda_activo`; `tenant_addons` de `TIENDA`; o `modulos_efectivos` (ya la llama la ficha, `apps/platform/app/api/tenants/[id]/route.ts:75`) |
| Sucursales que de verdad reciben | `cajas.espejo_turno_abierto_at` (`M/0161…:847-856`); `cajas.version_app` (ya la lee alertas, `route.ts:92`) para saber quién sigue en 0.7.0 |
| Abuso o topes alcanzados | `limites_cupo` con claves `tienda:pide:ip:*`, `tienda:pide:negocio:<slug>`, `tienda:entra:ip:*`, `tienda:registra:*`, `tienda:recupera:*` (`F/_shared/tienda/respuesta.ts:72-86`); y `CUPO_NEGOCIO_AGOTADO` en el registro |
| Cuentas | `tienda_cuentas` (altas, `bloqueada_hasta`, `intentos_fallidos`: `SPEC:199-201`), `tienda_sesiones` |
| Que el cron corre | `cron.job` / `cron.job_run_details` para `delivery-expirados` y `delivery-retencion` (`M/0093…:59`; `M/0095…:53`); precedente de comprobarlo en `LEAL:36` |
| Correos que no salen | líneas «sin correo de …» y «no salió» del registro de la función (`F/tienda/index.ts:160,165,441,444`) |
| Carga de bcrypt | panel de Supabase (CPU de la base); `ADR32:83-86` lo marca como lo primero a vigilar |

---

## 9. Qué mantiene hoy la tienda apagada para clientes reales

Cada fila es un interruptor independiente. «Estado hoy» de producción está **sin verificar** salvo que
lo diga un documento del repo.

| # | Interruptor | Estado hoy | Efecto mientras esté así | Quién lo mueve y cómo |
|---|---|---|---|---|
| 1 | `addons.activo` de `TIENDA` | `false` (`M/0161…:739`) | No aparece en el panel de VIM (`route.ts:58-62`). **No impide conceder** (§1.5) | Migración de salida (a2). VIM, a mano, antes de mezclar |
| 2 | Pareja en `_sincronizar_addons_del_plan` | ausente (`M/0159…:73`) | Ni las altas ni los cambios de plan conceden la tienda | Migración de salida (a1). Desde ese momento **cada alta en Negocio/Cadena y cada cambio de plan la concede sola** |
| 3 | Filas `tenant_addons` de `TIENDA` | ninguna, salvo la que se conceda a mano al negocio de pruebas (`SALIDA:153-156`) | `permitidos.tienda=false`: el admin enseña la invitación (`tienda-plan.ts:12`), el interruptor no enciende (`SIN_ADDON_TIENDA`, `M/0163…:57-59`) y la tienda pública responde 404 (`M/0163…:121-123`; `F/tienda/index.ts:345`) | Relleno de la migración (a3) para los planes que la incluyen; operador de VIM con «Activar…» para Esencial y para los que el relleno se salte |
| 4 | Espejos TS del panel (`ADDONS_DEL_PLAN`, `INCLUIDOS_DESDE_NEGOCIO`) | sin TIENDA | Vista previa de cambio de plan incompleta; alta manual a $100 en planes que la incluyen | Código (a4, a5); se despliega solo al mezclar |
| 5 | Interruptor del dueño `configuracion_tenant.modulo_tienda_activo` | `false` de fábrica (`SPEC:180-181`) | La tienda no existe para el público aunque tenga el complemento (`efectivos.tienda=false`) | **El dueño o un administrador del negocio**, en Admin → Tienda en línea. Exige dirección guardada (`SIN_TIENDA_CONFIGURADA`, `M/0163…:60-62`) y lista de revisión sin bloqueos (`P3:43`) |
| 6 | Configuración mínima: dirección, sucursal que participa, horario, teléfono, forma de pago, zonas si hay domicilio | vacía | No se puede encender (`P3:43`); «Esta tienda no está disponible por ahora» si ninguna sucursal participa (`SALIDA:238`) | El dueño, en el mismo apartado |
| 7 | Caja lista: `sucursal_recibe_pedidos` (marca de turno < 90 s) | sin caja que la selle | «Aún no abrimos.»: el menú se ve y no deja pedir (`SALIDA:239`) | Abrir turno en el **POS web**, o en una caja **0.8.0** (fila 8) |
| 8 | Instalador 0.8.0 de la caja | **no publicado**; `desktop/package.json:3` sigue en `0.7.0` (`INST:3-6`) | Ninguna caja instalada recibe pedidos de la tienda (`INST:63-66`; `CAJA:8-14`) | Fermín aprueba la lista; se publica en martes antes de las 10:00 (`INST:6`); lista «Antes de empaquetar» del RUNBOOK (`INST:58-59`) |
| 9 | Proyecto de Vercel `vim-tienda` | **no existe** (`docs/operacion/deploy-vercel.md:12`) | `apps/tienda` está en el repo sin publicar (`P5:210`) | Fermín, o Claude si se lo pide (`SALIDA:91-106`) |
| 10 | Variables de Vercel: `VIM_TIENDA_SECRET` (sensible, solo Production), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | sin poner | «No pudimos cargar la tienda»; captcha que no aparece (`SALIDA:235,242`) | Fermín o Claude (`SALIDA:108-127`). La clave está en `C:\Users\Fermi\.vim-pos-llaves\tienda-secret.txt` (`SALIDA:14-16`) |
| 11 | Dominio `pedidos.vimpos.com.mx` y su DNS | sin crear | La tienda no está en internet | **Solo Fermín** (`SALIDA:129-144`) |
| 12 | Cloudflare Turnstile: dominio en el widget | solo `admin.vimpos.com.mx` y `localhost` (`SALIDA:47`) | Pedir, registrarse y recuperar fallan | **Solo Fermín**, **antes** de que el dominio exista (`SALIDA:22-24,41-56`) |
| 13 | Secreto `TURNSTILE_HOSTNAMES` en Supabase | sin poner: por omisión solo `admin.vimpos.com.mx` (`F/_shared/turnstile.ts:16,34-37`) | «No pudimos comprobar que eres una persona.» en todo `pedir` (`SALIDA:243`) | Fermín o Claude; **los dos dominios**, o se rompe el registro de negocios (`SALIDA:58-69`) |
| 14 | Secretos `VIM_TIENDA_SECRET`, `VIM_TIENDA_URL`, `VIM_SMTP_*`, `TURNSTILE_SECRET_KEY` en Supabase; `CAPTCHA_OPCIONAL` ausente | sin verificar | Sin secreto todo es 401 (`F/tienda/index.ts:308-310`); sin URL o SMTP no sale ningún correo y la pantalla no avisa (`SALIDA:80-84`) | Fermín o Claude (`SALIDA:28-37,71-89`) |
| 15 | Migraciones 0163–0166 en producción y funciones `tienda`, `delivery-accion`, `delivery-espejo` desplegadas | sin verificar (los documentos piden comprobar 0165 y 0166: `SALIDA:32-34`; 0164 y funciones: `INST:51-56`) | Menú que no carga; cuentas que dan error (`SALIDA:236,245`) | VIM, a mano y antes de mezclar |
| 16 | Textos de la invitación del admin | «Estamos por lanzarla…» (`tienda-plan.ts:40-43`) | Quien no la tiene no puede pedirla, solo pedir aviso | Código; se despliega solo al mezclar |
| 17 | Legales: aviso provisional y términos sin sección de tienda | provisional (`privacidad/page.tsx:32-34`) | No bloquea técnicamente nada; es condición del diseño (`SPEC:437`) | Redacción + revisión de una persona; `TERMINOS_VERSION` si cambian los términos (`F/_shared/alta.ts:16`) |
| 18 | Sitio y novedades | sin tienda (§5) | Nadie se entera | Código + `pnpm sitio:generar` (`INST:60-61`) |

**Lo que SÍ pasa solo al mezclar código** (para diseñar «la mezcla no activa nada»):

- El admin y el panel se despliegan desde `main` (`P3:426`): los textos de la invitación (fila 16) y
  los espejos TS (fila 4) cambian en el instante de la mezcla, haya o no migración aplicada.
- Las migraciones **no** se aplican al mezclar: van a producción a mano y antes (`CLAUDE.md` del repo,
  «Convenciones de migraciones»; `SPEC:121-123`). Pero la migración **sí viaja a cada caja con el
  instalador** y corre ahí (`M/0159…:10-11`; `M/0164…:13`).
- Aplicar la migración de salida **no enciende ninguna tienda**: concede el permiso; el interruptor del
  dueño sigue apagado (`M/0159…:137-139` para lealtad; misma mecánica en `M/0161…:823-828`). Lo que sí
  cambia en ese instante: quien está en un plan que la incluye deja de ver la invitación y ve el
  apartado de configuración; y puede encenderla él mismo.
- Vuelta atrás sin tirar nada: apagar el interruptor del negocio; quitar el dominio de Vercel
  (`SALIDA:251-253`); dar de baja el complemento desde el panel (apaga el interruptor por disparador,
  `M/0163…:76-94`).

---

## 10. Decisiones abiertas (con recomendación en una línea)

1. **¿La activación va dentro de la migración de salida (como la 0159) o separada del resto?** →
   Separarla: una migración con los arreglos (retención, caducidad, idempotencia) que se puede aplicar ya,
   y otra mínima «de encendido» (activar, pareja, relleno) que Fermín aplica el día que decida: ese es el
   «paso suyo».
2. **Que la mezcla no cambie textos antes de tiempo.** → Que la invitación del admin lea `addons.activo`
   de `TIENDA` (lectura abierta, `M/0002…:491`): con el complemento inactivo sigue diciendo «avísenme», y
   cambia sola al aplicar la migración de encendido.
3. **¿A quién concede el relleno: suscripción ACTIVA (como la 0159) o plan actual del negocio?** → Por
   `tenants.plan_actual_id` con estado `ACTIVO`/`TRIAL`/`INTERNO`: es solo un permiso a $0 y evita el paso
   manual de `LEAL:31-35`; si se copia la 0159 tal cual, incluir su consulta de contraste en la lista.
4. **Planes heredados (`FT`…`ENT`) y planes fuera de la lista.** → Dejar la bandera como la puso la 0161
   (heredados incluidos) y revisar a mano en producción si existe algún plan creado fuera de migraciones.
5. **¿La invitación dice el precio ($100) o sigue «sin precios» como `PedirModulo`?** → Decir «incluida
   desde el plan Negocio; en Esencial, $100 al mes» leyendo el precio de `addons` (ya es público en
   `precios.html` para lealtad), manteniendo WhatsApp como única acción.
6. **¿Contratación con un clic desde el admin para Esencial?** → No en esta entrega: no existe para ningún
   complemento y el cobro es manual; se queda WhatsApp + «Activar…» en el panel.
7. **Textos «Tu plan ya no incluye la tienda en línea»** (`tienda-estado.tsx:32`, `tienda-compartir.tsx:35`,
   `tienda-reglas.ts:149`). → Cambiarlos por uno que sirva también a quien la pagaba aparte («Tu tienda
   en línea no está activa. Escríbenos.»).
8. **Idempotencia de `pedir`.** → Llave por intento de compra generada en el navegador, de la que el
   servidor deriva el código de seguimiento: el índice único de `seguimiento_hash` ya existente hace de
   candado y el reintento devuelve el mismo pedido.
9. **Caducidad del `ACEPTADO` de `ESCRITORIO` sin ticket: cuánto esperar y qué hacer.** → Cancelar con
   motivo `OTRO` a los 30 minutos de `aceptado_at` sin `ticket_id` en la nube (margen sobre los 10 min del
   push), dentro de `delivery_marcar_expirados`; y ampliar o quitar la ventana de 7 días de la pasada `NUBE`.
10. **Retención: ¿qué hacer con `tienda_cuenta_id` y con las notas?** → Blanquear `nota_cliente` y las
    notas de renglón a los 30 días; conservar `tienda_cuenta_id` (es lo que alimenta «Mis pedidos» y se
    anula al eliminar la cuenta), y corregir el aviso para que diga exactamente eso.
11. **`cliente_nombre = 'Cliente de app'` en pedidos de la tienda anonimizados.** → Dejarlo: es interno y
    cambiarlo no aporta; si se toca la función, usar un texto neutro («Cliente») para los dos canales.
12. **Antirobot o tope por negocio en `entrar`.** → Añadir ahora solo un cupo por negocio (barato, en
    `cuposDe`) y dejar el antirobot para cuando la CPU lo pida, como dice `ADR32:111`.
13. **Cupo de 5 pedidos por hora por IP, compartido entre negocios.** → Separarlo por negocio en la clave
    (`tienda:pide:ip:<ip>:<slug>`) y subirlo un poco; las redes móviles comparten IP.
14. **Limpieza de sesiones y enlaces vencidos.** → No hacer cron: el barrido oportunista basta para el
    volumen esperado; anotar la consulta de control.
15. **Observabilidad mínima.** → Sin proveedor nuevo: una tarjeta o consulta en el panel de VIM sobre
    `delivery_pedidos` (pedidos, vencidos y atascados por negocio y día) y un aviso por correo a
    `VIM_AVISOS_A` cuando aparezca `CUPO_NEGOCIO_AGOTADO` o un atascado.
16. **Analítica en la tienda pública** (`P5:29`). → Seguir sin ninguna; el aviso de privacidad lo promete
    y la medición del negocio sale de la base.
17. **Aviso de privacidad: ¿texto único de VIM por restaurante o texto del restaurante?** → Plantilla
    única redactada por VIM con el nombre del restaurante, revisada por una persona con criterio legal;
    hace falta decidir si se pide al dueño razón social y domicilio (hoy la tienda solo tiene el nombre
    comercial).
18. **¿Página de términos en la tienda para el comensal?** → Sí, corta (pago al recibir, cancelaciones,
    quién vende): la dirección `terminos` ya está reservada; enlazarla junto al aviso.
19. **¿El dueño acepta condiciones al encender la tienda?** → Sí, una casilla al primer encendido (molde
    de la de Uber) que deje constancia: los negocios dados de alta desde el panel no tienen
    `terminos_version` y la sección nueva de los términos los obliga como responsables de los datos.
20. **`TERMINOS_VERSION`.** → Subirla el mismo día que se publique la sección nueva de `terminos.html`.
21. **Orden de salida respecto de la 0.8.0.** → No conceder ni anunciar hasta el martes en que salga la
    0.8.0; antes, prueba completa en VIM Pruebas con POS web y con caja 0.8.0, y luego Knock-Out.
22. **Caja 0.7.0 y POS web en la misma sucursal** (`P4:281`). → Resolverlo por operación: actualizar las
    cajas del negocio antes de que encienda la tienda; `cajas.version_app` permite comprobarlo desde el panel.
23. **¿Reencender sola la tienda al renovar un complemento vencido?** (`P3:447`). → No: que el dueño la
    encienda; hoy vencer por fecha ni siquiera apaga el interruptor, así que al renovar vuelve sola de
    todas formas, y eso basta.
24. **Periodo de espera para reutilizar una dirección liberada** (`P3:447`). → Dejarlo fuera de la salida
    y anotarlo: sin tiendas reales todavía no hay QR impresos que proteger.
25. **Número de la migración.** → Siguiente libre aquí es la **0167** (la última es
    `0166_tienda_cuentas.sql`); confirmarlo contra `origin/main` y las ramas vivas antes de escribirla.
