import { NextResponse } from "next/server";
import { autorizar, auditar } from "../../../lib/server";
import { hoyMx, sumarMeses } from "@vim/fecha";
import { MODULOS } from "@vim/db/modulos";
import { esExtra, EXTRAS_MAXIMO } from "@vim/db/cobro";
import { fechaBloqueo, mensajeBloqueoPorDefecto } from "../../../lib/bloqueo";
import { decidirAltaAddon, precioAltaAddon, type FilaAddon } from "../../../lib/addons";
import { precioValido } from "../../../lib/precio";
import { fechaValida, leerPromocion } from "../../../lib/promocion";
import { accesoDeDueno, type UsuarioAuth } from "../../../lib/acceso-dueno";
import type { SbClient } from "../../../lib/server";

// Detalle y acciones sobre un tenant (suspender/reactivar/cancelar, notas, plan).
// Todo auditado en super_admin_accesos. service_role, gated por X-Platform-Key.

const ESTADOS_VALIDOS = ["TRIAL", "ACTIVO", "SUSPENDIDO", "CANCELADO", "INTERNO"];

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;
  const { id } = await ctx.params;

  const { data: tenant, error } = await sb
    .from("tenants")
    .select(
      "id, codigo, nombre_comercial, estado, vertical_principal, razon_social, rfc, regimen_fiscal, " +
        "codigo_postal_fiscal, email_fiscal, fecha_alta, fecha_baja, motivo_baja, bloqueo_desde, bloqueo_mensaje, created_at, prueba_hasta, usuario_dueno_id, " +
        "plan:planes(id, codigo, nombre, precio_mensual_mxn, timbres_cfdi_mensuales, features_incluidos), " +
        "onboarding:tenant_onboarding_estado(fase, fase_wizard, fecha_invitacion, fecha_activacion, fecha_go_live, notas_internas, terminos_version, bienvenida_enviada_at), " +
        "suscripcion:suscripciones(estado, precio_mensual_mxn, proxima_fecha_cobro, ciclo_facturacion, fecha_inicio, precio_promocional_mxn, promocion_hasta, promocion_nombre)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!tenant) return NextResponse.json({ error: "NO_EXISTE" }, { status: 404 });

  // Saldo de folios: se lee de `tenant_folios_saldo`, que es la tabla que consulta el timbrado.
  //
  // Antes se derivaba del último movimiento del ledger. Parecía equivalente y no lo era: acreditar
  // solo insertaba en el ledger sin tocar el saldo, así que el panel enseñaba un número que el
  // timbrado no reconocía. La migración 0081 unificó las dos y esto lee la que manda.
  const { data: saldoRaw } = await sb
    .from("tenant_folios_saldo")
    .select("saldo_paquetes, folios_base_mensuales, folios_base_consumidos, periodo_actual")
    .eq("tenant_id", id)
    .maybeSingle();
  const saldo = saldoRaw as unknown as {
    saldo_paquetes: number; folios_base_mensuales: number; folios_base_consumidos: number; periodo_actual: string;
  } | null;

  const { data: addonsRaw } = await sb
    .from("tenant_addons")
    .select("id, activo, fecha_inicio, fecha_fin, precio_mensual_mxn, cantidad, incluido_en_plan, addon:addons(id, codigo, nombre, precio_mensual_mxn)")
    .eq("tenant_id", id)
    .order("fecha_inicio", { ascending: false });

  const { data: catalogoAddons } = await sb
    .from("addons")
    .select("id, codigo, nombre, descripcion, precio_mensual_mxn")
    .eq("activo", true)
    .order("orden_visualizacion");

  const { data: paquetes } = await sb
    .from("folios_paquetes")
    .select("id, codigo, nombre, cantidad_folios, precio_mxn")
    .eq("activo", true)
    .order("orden_visualizacion");

  const { count: nSucursales } = await sb.from("sucursales").select("id", { count: "exact", head: true }).eq("tenant_id", id).is("deleted_at", null);

  // Módulos y límites (0103, ADR 0014): la lectura la hacen las funciones de la base, aquí solo
  // se le suman las excepciones vigentes para que la ficha diga POR QUÉ un módulo está como está.
  const [{ data: modRaw }, { data: limRaw }, { data: flagsRaw }] = await Promise.all([
    sb.rpc("modulos_efectivos", { p_tenant: id }),
    sb.rpc("limites_efectivos", { p_tenant: id }),
    sb.from("tenant_feature_flags").select("flag_codigo, activado, motivo, fecha_fin, fecha_inicio").eq("tenant_id", id),
  ]);
  const ahora = Date.now();
  const excepciones = ((flagsRaw ?? []) as { flag_codigo: string; activado: boolean; motivo: string | null; fecha_fin: string | null; fecha_inicio: string }[])
    .filter((f) => !f.fecha_fin || new Date(f.fecha_fin).getTime() > ahora)
    .map((f) => ({ codigo: f.flag_codigo, activado: f.activado, motivo: f.motivo, fecha_fin: f.fecha_fin }));
  const modulos = {
    ...((modRaw ?? { permitidos: {}, efectivos: {} }) as { permitidos: Record<string, boolean>; efectivos: Record<string, boolean> }),
    excepciones,
  };
  const limites = (limRaw ?? null) as Record<string, unknown> | null;

  // El acceso del dueño (roadmap A5): ¿ya confirmó su correo? Si no, la ficha ofrece reenviarle
  // la invitación o la confirmación, según cómo se dio de alta. Vive en auth.users, no en una tabla.
  const t = tenant as unknown as { usuario_dueno_id?: string | null; onboarding?: { terminos_version?: string | null } | { terminos_version?: string | null }[] | null };
  const onb = Array.isArray(t.onboarding) ? t.onboarding[0] : t.onboarding;
  let dueno = null;
  if (t.usuario_dueno_id) {
    const { data: u } = await sb.auth.admin.getUserById(t.usuario_dueno_id);
    dueno = accesoDeDueno((u?.user ?? null) as UsuarioAuth | null, onb?.terminos_version ?? null);
  }

  return NextResponse.json({
    tenant,
    dueno,
    modulos,
    limites,
    foliosSaldo: saldo?.saldo_paquetes ?? 0,
    foliosBase: saldo
      ? { mensuales: saldo.folios_base_mensuales, consumidos: saldo.folios_base_consumidos, periodo: saldo.periodo_actual }
      : null,
    addons: addonsRaw ?? [],
    catalogoAddons: catalogoAddons ?? [],
    paquetes: paquetes ?? [],
    nSucursales: nSucursales ?? 0,
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }
  const accion = String(body.accion ?? "");

  if (accion === "cambiar_estado") {
    const nuevo = String(body.estado ?? "");
    if (!ESTADOS_VALIDOS.includes(nuevo)) return NextResponse.json({ error: "ESTADO_INVALIDO" }, { status: 400 });
    const motivo = (body.motivo as string | undefined)?.trim() || null;
    const esBaja = nuevo === "SUSPENDIDO" || nuevo === "CANCELADO";
    if (esBaja && (!motivo || motivo.length < 10)) return NextResponse.json({ error: "MOTIVO_REQUERIDO" }, { status: 400 });

    const patch: Record<string, unknown> = { estado: nuevo };
    if (esBaja) {
      patch.fecha_baja = new Date().toISOString();
      patch.motivo_baja = motivo;
      // Suspender pide los días de gracia de forma explícita; 0 = bloqueo inmediato (el pago no
      // tiene días de tolerancia, regla del 1 oct 2026). Cancelar bloquea ya, salvo que se capture gracia.
      const graciaRaw = body.gracia_dias == null ? null : Math.trunc(Number(body.gracia_dias));
      if (nuevo === "SUSPENDIDO" && (graciaRaw === null || !(graciaRaw >= 0))) return NextResponse.json({ error: "GRACIA_REQUERIDA" }, { status: 400 });
      const bloqueoDesde = graciaRaw !== null && graciaRaw >= 1 ? fechaBloqueo(hoyMx(), graciaRaw) : new Date().toISOString();
      patch.bloqueo_desde = bloqueoDesde;
      patch.bloqueo_mensaje = (body.mensaje as string | undefined)?.trim() || mensajeBloqueoPorDefecto(bloqueoDesde);
    } else {
      patch.fecha_baja = null; patch.motivo_baja = null; patch.bloqueo_desde = null; patch.bloqueo_mensaje = null;
    }
    const { error } = await sb.from("tenants").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await auditar(sb, { accion: `tenant.${nuevo.toLowerCase()}`, tenantId: id, motivo, payload: { estado: nuevo, bloqueo_desde: patch.bloqueo_desde ?? null } });
    return NextResponse.json({ ok: true, bloqueo_desde: patch.bloqueo_desde ?? null });
  }

  /** El motivo que escribió el operador, o null si falta o es menor a 10 caracteres. */
  const motivoDe = (): string | null => {
    const m = (body.motivo as string | undefined)?.trim() ?? "";
    return m.length >= 10 ? m : null;
  };
  const faltaMotivo = () => NextResponse.json({ error: "MOTIVO_REQUERIDO", detalle: "Escribe el motivo (10 caracteres o más)." }, { status: 400 });

  if (accion === "marcar_fase") {
    const fase = String(body.fase ?? "");
    if (!["INVITADO", "EN_CONFIGURACION", "GO_LIVE", "ABANDONADO"].includes(fase)) return NextResponse.json({ error: "FASE_INVALIDA" }, { status: 400 });
    // Dar por abandonado a un cliente se justifica; marcarlo en operación no hace falta.
    if (fase === "ABANDONADO" && !motivoDe()) return faltaMotivo();
    // upsert: algunos tenants (sembrados/INTERNO) no tienen fila de onboarding.
    const { error } = await sb.from("tenant_onboarding_estado").upsert({ tenant_id: id, fase }, { onConflict: "tenant_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await auditar(sb, { accion: "tenant.marcar_fase", tenantId: id, motivo: motivoDe(), payload: { fase } });
    return NextResponse.json({ ok: true });
  }

  if (accion === "notas") {
    const notas = (body.notas as string | undefined) ?? "";
    const { error } = await sb.from("tenant_onboarding_estado").upsert({ tenant_id: id, notas_internas: notas }, { onConflict: "tenant_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await auditar(sb, { accion: "tenant.notas", tenantId: id });
    return NextResponse.json({ ok: true });
  }

  // Ajuste manual y venta de paquete son la misma operación con distinto origen, así que las dos
  // pasan por `acreditar_folios_cfdi`. Esa función mueve el saldo Y el ledger en una transacción,
  // con bloqueo de fila: antes esto insertaba en el ledger a mano, dejaba el saldo intacto —el
  // timbrado nunca veía los folios acreditados— y calculaba el saldo previo con un SELECT que dos
  // pestañas simultáneas podían leer igual.
  if (accion === "ajustar_folios" || accion === "acreditar_paquete") {
    let cantidad: number;
    let paqueteId: string | null = null;
    let precio: number | null = null;
    let tipo: "AJUSTE_MANUAL" | "COMPRA_PAQUETE" = "AJUSTE_MANUAL";
    if (accion === "ajustar_folios" && !motivoDe()) return faltaMotivo();
    let motivo = (body.motivo as string | undefined)?.trim() || "Ajuste manual desde plataforma";

    if (accion === "acreditar_paquete") {
      paqueteId = String(body.paquete_id ?? "");
      if (!paqueteId) return NextResponse.json({ error: "PAQUETE_REQUERIDO" }, { status: 400 });
      const { data: paqRaw } = await sb
        .from("folios_paquetes")
        .select("cantidad_folios, precio_mxn, nombre")
        .eq("id", paqueteId)
        .maybeSingle();
      const paq = paqRaw as unknown as { cantidad_folios: number; precio_mxn: number; nombre: string } | null;
      if (!paq) return NextResponse.json({ error: "PAQUETE_NO_EXISTE" }, { status: 404 });
      // La cantidad y el precio salen del catálogo, NUNCA del cuerpo de la petición: si vinieran
      // de fuera, quien alcance este endpoint podría acreditar mil folios al precio de cien.
      cantidad = paq.cantidad_folios;
      precio = Number(paq.precio_mxn);
      tipo = "COMPRA_PAQUETE";
      motivo = (body.motivo as string | undefined)?.trim() || `Alta de ${paq.nombre}`;
    } else {
      cantidad = Math.trunc(Number(body.cantidad ?? 0));
      if (!cantidad) return NextResponse.json({ error: "CANTIDAD_REQUERIDA" }, { status: 400 });
    }

    const { data, error } = await sb.rpc("acreditar_folios_cfdi", {
      p_tenant_id: id,
      p_cantidad: cantidad,
      p_tipo: tipo,
      p_paquete_id: paqueteId,
      p_precio_pagado_mxn: precio,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const res = data as unknown as { saldo_paquetes: number };
    await auditar(sb, {
      accion: accion === "acreditar_paquete" ? "tenant.acreditar_paquete" : "tenant.ajustar_folios",
      tenantId: id, motivo,
      payload: { cantidad, tipo, paquete_id: paqueteId, precio, saldo: res.saldo_paquetes },
    });
    return NextResponse.json({ ok: true, saldo: res.saldo_paquetes });
  }

  // ── Add-ons ────────────────────────────────────────────────────────────────────────────────
  //
  // Activar escribe en `tenant_addons`; el efecto en el producto lo resuelve `tenant_addon_activo()`.
  // Desactivar NO borra la fila: le pone fecha de fin. La historia de qué tuvo contratado un
  // cliente y hasta cuándo es justamente lo que hace falta cuando reclama un cobro.
  // Los extras por cantidad (sucursal y caja adicional, 0147) NO entran por el alta y la baja de
  // los add-ons de siempre: ese camino no sabe de cantidades ni comprueba lo que el cliente ya usa.
  const esExtraPorCantidad = () => NextResponse.json(
    { error: "ES_EXTRA_POR_CANTIDAD", detalle: "La sucursal y la caja adicional se cambian por cantidad, en Extras." },
    { status: 400 },
  );

  // ── Extras por cantidad (0147, ADR 0024) ──────────────────────────────────────────────────
  // Poner cuántas sucursales o cajas adicionales tiene contratadas (0 = quitar). La regla entera
  // vive en `fijar_extra_tenant`: el límite sube solo, no deja bajar por debajo de lo que el
  // cliente ya usa, rechaza una caja adicional donde no hay límite de cajas, y cambiar la cantidad
  // el mismo día actualiza la fila en vez de chocar con `addon_unico_activo`.
  if (accion === "extra_fijar") {
    const codigo = String(body.addon_codigo ?? "");
    if (!esExtra(codigo)) return NextResponse.json({ error: "EXTRA_INVALIDO", detalle: "Solo la sucursal adicional y la caja adicional se contratan por cantidad." }, { status: 400 });
    // Es un cambio al contrato (sube o baja lo que paga): siempre con motivo.
    if (!motivoDe()) return faltaMotivo();
    const cantidad = typeof body.cantidad === "number" ? body.cantidad : Number.NaN;
    if (!Number.isInteger(cantidad) || cantidad < 0 || cantidad > EXTRAS_MAXIMO) {
      return NextResponse.json({ error: "CANTIDAD_INVALIDA", detalle: `La cantidad es un número entero de 0 a ${EXTRAS_MAXIMO}.` }, { status: 400 });
    }
    // Sin precio = el que ya tenía pactado y, si no tenía, el de catálogo (lo decide la base).
    const sinPrecio = body.precio_mensual_mxn == null || body.precio_mensual_mxn === "";
    const precio = sinPrecio ? null : precioValido(body.precio_mensual_mxn);
    if (!sinPrecio && precio === null) return NextResponse.json({ error: "PRECIO_INVALIDO", detalle: "El precio debe ser un importe de $0 en adelante." }, { status: 400 });

    const { data, error } = await sb.rpc("fijar_extra_tenant", {
      p_tenant_id: id, p_codigo: codigo, p_cantidad: cantidad, p_precio: precio, p_notas: motivoDe(),
    });
    if (error) {
      const conocido = /EXTRA_EN_USO|SIN_LIMITE|SIN_CAMBIOS|EXTRA_INVALIDO|CANTIDAD_INVALIDA|PRECIO_INVALIDO|TENANT_NO_EXISTE/.exec(error.message)?.[0];
      if (!conocido) return NextResponse.json({ error: error.message }, { status: 500 });
      // El porqué lo escribe la base en el HINT, con los números del cliente ("tiene 3 cajas activas…").
      const detalle = (error as { hint?: string | null }).hint || conocido;
      const choque = conocido === "EXTRA_EN_USO" || conocido === "SIN_LIMITE";
      return NextResponse.json({ error: conocido, detalle }, { status: choque ? 409 : 400 });
    }
    const res = (data ?? {}) as Record<string, unknown>;
    await auditar(sb, { accion: "tenant.extra_fijar", tenantId: id, motivo: motivoDe(), payload: { ...res, precio_pedido: precio } });
    return NextResponse.json({ ok: true, ...res });
  }

  if (accion === "addon_activar") {
    const codigo = String(body.addon_codigo ?? "");
    if (!codigo) return NextResponse.json({ error: "ADDON_REQUERIDO" }, { status: 400 });
    if (esExtra(codigo)) return esExtraPorCantidad();
    const { data: addonRaw } = await sb
      .from("addons")
      .select("id, nombre, precio_mensual_mxn")
      .eq("codigo", codigo)
      .maybeSingle();
    const addon = addonRaw as unknown as { id: string; nombre: string; precio_mensual_mxn: number } | null;
    if (!addon) return NextResponse.json({ error: "ADDON_NO_EXISTE" }, { status: 404 });

    // Un add-on ya vigente no se vuelve a dar de alta: la restricción de la base solo impide
    // repetir la MISMA fecha de inicio, así que sin esto un doble clic al día siguiente dejaría
    // dos filas activas y el cliente aparecería pagándolo dos veces.
    // Se leen TODAS sus filas de este add-on, no solo la activa: `addon_unico_activo` es
    // `UNIQUE (tenant_id, addon_id, fecha_inicio)`, así que una baja de HOY bloquea el INSERT de
    // hoy. `decidirAltaAddon` distingue los tres casos; el porqué está en `lib/addons.ts`.
    const { data: filasRaw } = await sb
      .from("tenant_addons")
      .select("id, activo, fecha_inicio")
      .eq("tenant_id", id)
      .eq("addon_id", addon.id);
    const decision = decidirAltaAddon((filasRaw ?? []) as FilaAddon[], hoyMx());
    if (decision.accion === "ya_estaba") return NextResponse.json({ ok: true, yaEstaba: true });

    // El plan no concede el módulo —si lo concediera, la caja de todo cliente de Negocio sondearía
    // sin usarlo— pero sí decide el precio: incluido desde Negocio, $100 al mes en Esencial.
    // Pre-llenarlo aquí evita que la política viva en la memoria de quien rellena el formulario;
    // un precio explícito en el cuerpo (cortesía, promoción) sigue ganando, por eso se comprueba
    // primero. Misma forma de leer el plan que usa `plan:planes(...)` en el GET de esta ruta.
    let precioLista = Number(addon.precio_mensual_mxn);
    {
      const { data: tRaw } = await sb.from("tenants").select("plan:planes(codigo)").eq("id", id).maybeSingle();
      const planCodigo = (tRaw as { plan?: { codigo?: string } } | null)?.plan?.codigo ?? "";
      precioLista = precioAltaAddon(codigo, planCodigo, precioLista);
    }
    // Un precio explícito se valida (hallazgo E-3): antes un negativo reventaba el CHECK de la base
    // con un 500, y "abc" o "" se guardaban como NaN o como un $0 que nadie decidió.
    const precio = body.precio_mensual_mxn != null ? precioValido(body.precio_mensual_mxn) : precioLista;
    if (precio === null) return NextResponse.json({ error: "PRECIO_INVALIDO", detalle: "El precio debe ser un importe de $0 en adelante." }, { status: 400 });
    // Una fila en $0.00 sin explicación invita a preguntar, dentro de seis meses, si el cero es un
    // error. El spec (§4) fija esta nota para Negocio/Cadena; solo se usa cuando el precio salió
    // en cero y nadie mandó un motivo propio — un motivo explícito (cortesía, promoción) manda.
    const motivo = (body.motivo as string | undefined)?.trim() || (precio === 0 ? "incluido en el plan" : null);
    // El $0 salió del plan (nadie mandó precio): se marca, para que bajar de plan lo retire (0141).
    // Un $0 explícito es cortesía y se queda aunque baje.
    const incluidoEnPlan = body.precio_mensual_mxn == null && precio === 0 && precioLista === 0;
    // Reactivar es deshacer la baja de hoy: se le pone el precio y el motivo del formulario, que
    // son los que el operador acaba de decidir, y se borra la fecha de fin.
    const { error } = decision.accion === "reactivar"
      ? await sb.from("tenant_addons")
        .update({ activo: true, fecha_fin: null, precio_mensual_mxn: precio, notas: motivo, incluido_en_plan: incluidoEnPlan })
        .eq("id", decision.id)
      : await sb.from("tenant_addons").insert({
        tenant_id: id, addon_id: addon.id, fecha_inicio: hoyMx(), activo: true,
        precio_mensual_mxn: precio, notas: motivo, incluido_en_plan: incluidoEnPlan,
      });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await auditar(sb, {
      accion: "tenant.addon_activar", tenantId: id, motivo: motivoDe() ?? `Alta del add-on ${addon.nombre}`,
      payload: { codigo, precio, reactivada: decision.accion === "reactivar" },
    });
    return NextResponse.json({ ok: true });
  }

  if (accion === "addon_desactivar") {
    // Antes era un clic, y en Delivery pausa las tiendas de Uber del cliente.
    if (!motivoDe()) return faltaMotivo();
    const codigo = String(body.addon_codigo ?? "");
    if (!codigo) return NextResponse.json({ error: "ADDON_REQUERIDO" }, { status: 400 });
    if (esExtra(codigo)) return esExtraPorCantidad();
    const { data: addonRaw } = await sb.from("addons").select("id, nombre").eq("codigo", codigo).maybeSingle();
    const addon = addonRaw as unknown as { id: string; nombre: string } | null;
    if (!addon) return NextResponse.json({ error: "ADDON_NO_EXISTE" }, { status: 404 });
    const { error } = await sb
      .from("tenant_addons")
      .update({ activo: false, fecha_fin: hoyMx() })
      .eq("tenant_id", id)
      .eq("addon_id", addon.id)
      .eq("activo", true);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Uber no lee nuestra base: se le pausa cada tienda viva (ver `pausarTiendasUber`, abajo).
    const { pausadas, fallos } = codigo === "DELIVERY" ? await pausarTiendasUber(sb, id) : { pausadas: 0, fallos: [] as string[] };

    await auditar(sb, {
      accion: "tenant.addon_desactivar", tenantId: id, motivo: `Baja del add-on ${addon.nombre}: ${motivoDe()}`,
      payload: { codigo, pausadas, fallos },
    });
    return NextResponse.json({ ok: true, pausadas, fallos });
  }

  if (accion === "cambiar_plan") {
    // Plan, folios del mes, add-ons incluidos y precio del cobro van en UNA transacción
    // (`cambiar_plan_tenant`, 0141). Antes solo se movía `plan_actual_id`: subir a Negocio no daba la
    // facturación que incluye, bajar a Esencial se la dejaba gratis, y los folios no se enteraban.
    const planId = String(body.plan_id ?? "");
    if (!planId) return NextResponse.json({ error: "PLAN_REQUERIDO" }, { status: 400 });
    if (!motivoDe()) return faltaMotivo();
    // Precio pactado opcional; sin él, el de lista del plan nuevo (lo decide la base).
    const precio = body.precio == null || body.precio === "" ? null : precioValido(body.precio);
    if (body.precio != null && body.precio !== "" && precio === null) {
      return NextResponse.json({ error: "PRECIO_INVALIDO", detalle: "El precio debe ser un importe de $0 en adelante." }, { status: 400 });
    }
    const { data, error } = await sb.rpc("cambiar_plan_tenant", { p_tenant_id: id, p_plan_id: planId, p_precio: precio });
    if (error) {
      const conocido = /PRECIO_INVALIDO|MISMO_PLAN|PLAN_RETIRADO|PLAN_NO_EXISTE|TENANT_NO_EXISTE|CAJAS_EXCEDEN_PLAN/.exec(error.message)?.[0];
      // Las cajas ya abiertas no caben en el plan nuevo (0147): la base lo rechaza y dice cuántas
      // sobran en el HINT. Es un choque con el estado del cliente (409), no un dato mal capturado.
      if (conocido === "CAJAS_EXCEDEN_PLAN") {
        return NextResponse.json({ error: conocido, detalle: (error as { hint?: string | null }).hint || conocido }, { status: 409 });
      }
      return NextResponse.json({ error: conocido ?? error.message }, { status: conocido ? 400 : 500 });
    }
    const res = (data ?? {}) as { addons?: { concedidos?: string[]; retirados?: string[] } } & Record<string, unknown>;
    // Si el plan nuevo ya no incluye delivery, la base lo retiró; a Uber hay que avisarle igual que
    // en una baja manual, o seguiría ofreciendo la tienda.
    const uber = res.addons?.retirados?.includes("DELIVERY") ? await pausarTiendasUber(sb, id) : null;
    await auditar(sb, { accion: "tenant.cambiar_plan", tenantId: id, motivo: motivoDe(), payload: { ...res, precio_pedido: precio, uber } });
    return NextResponse.json({ ok: true, ...res, fallos: uber?.fallos ?? [] });
  }

  if (accion === "suscripcion_activar") {
    // Convierte un cliente en pagador: una suscripción ACTIVA con el precio pactado y, si se
    // acordó, una promoción con fecha de fin (0141). El regreso al precio de lista queda
    // programado desde hoy: no depende de que alguien se acuerde en el mes 8.
    if (!motivoDe()) return faltaMotivo();
    const { data: t } = await sb.from("tenants").select("plan_actual_id, plan:planes(precio_mensual_mxn)").eq("id", id).maybeSingle();
    const planId = (t as { plan_actual_id?: string } | null)?.plan_actual_id;
    if (!planId) return NextResponse.json({ error: "TENANT_SIN_PLAN" }, { status: 400 });
    // El precio del cuerpo (cortesía, precio pactado) gana; si no viene, el de lista del plan.
    // Validado (hallazgo E-3): `Number(body.precio)` aceptaba negativos y NaN.
    const precio = precioValido(body.precio ?? (t as { plan?: { precio_mensual_mxn?: number } } | null)?.plan?.precio_mensual_mxn ?? 0);
    if (precio === null) return NextResponse.json({ error: "PRECIO_INVALIDO", detalle: "El precio debe ser un importe de $0 en adelante." }, { status: 400 });
    const ciclo = String(body.ciclo ?? "MENSUAL");
    if (ciclo !== "MENSUAL" && ciclo !== "ANUAL") return NextResponse.json({ error: "CICLO_INVALIDO" }, { status: 400 });
    // Fechas en hora de México, no del servidor: en UTC, activar una suscripción por la tarde
    // la dejaba fechada al día siguiente.
    // COBRO POR ADELANTADO (decisión de Fermín, 30/09/2026): el primer cobro vence HOY, el día de
    // la activación — se paga el mes que empieza. El pago de hoy cubre [hoy, hoy + 1 mes) y la base
    // (0130) mueve la fecha siguiente anclada al día de alta, con su recorte a fin de mes.
    const inicio = hoyMx();
    const prox = inicio;
    const promo = leerPromocion(body.promocion, precio, prox, ciclo);
    if (!promo.ok) return NextResponse.json({ error: promo.error, detalle: promo.detalle }, { status: 400 });
    // Expirar la vigente, crear la nueva y pasar TRIAL→ACTIVO van en UNA transacción (0137).
    // Antes eran tres escrituras sueltas: si el INSERT fallaba después del UPDATE, el cliente
    // quedaba con la anterior EXPIRADA y ninguna nueva — sin cobro vigente.
    const { error } = await sb.rpc("activar_suscripcion", {
      p_tenant_id: id, p_precio: precio, p_ciclo: ciclo, p_inicio: inicio, p_proxima: prox,
      p_promo_precio: promo.promo?.precio ?? null, p_promo_hasta: promo.promo?.hasta ?? null, p_promo_nombre: promo.promo?.nombre ?? null,
    });
    if (error) {
      const conocido = /PRECIO_INVALIDO|CICLO_INVALIDO|FECHAS_INVALIDAS|TENANT_SIN_PLAN|TENANT_NO_EXISTE|PROMOCION_[A-Z_]+/.exec(error.message)?.[0];
      return NextResponse.json({ error: conocido ?? error.message }, { status: conocido ? 400 : 500 });
    }
    await auditar(sb, { accion: "tenant.suscripcion_activar", tenantId: id, motivo: motivoDe(), payload: { precio, ciclo, promocion: promo.promo } });
    return NextResponse.json({ ok: true });
  }

  if (accion === "prueba_extender") {
    // La prueba no bloquea nada (0141): extenderla solo mueve la fecha de los avisos. Aun así va con
    // motivo y a la bitácora, porque es una concesión comercial y alguien preguntará por qué.
    if (!motivoDe()) return faltaMotivo();
    if (body.prueba_hasta == null || body.prueba_hasta === "") return NextResponse.json({ error: "FECHA_INVALIDA", detalle: "Elige la nueva fecha de fin." }, { status: 400 });
    // Una fecha que no existe (2027-02-30) se contesta aquí en español, no con el 500 crudo de la base.
    if (!fechaValida(body.prueba_hasta)) return NextResponse.json({ error: "FECHA_INVALIDA", detalle: "Esa fecha no existe en el calendario." }, { status: 400 });
    const hasta = body.prueba_hasta;
    const hoy = hoyMx();
    if (hasta < hoy) return NextResponse.json({ error: "FECHA_INVALIDA", detalle: "La nueva fecha no puede ser anterior a hoy." }, { status: 400 });
    if (hasta > sumarMeses(hoy, 6)) return NextResponse.json({ error: "FECHA_INVALIDA", detalle: "Más de seis meses de prueba ya no es prueba: activa el cobro con una promoción." }, { status: 400 });
    const { data: tRaw } = await sb.from("tenants").select("estado, prueba_hasta").eq("id", id).maybeSingle();
    const t = tRaw as { estado?: string; prueba_hasta?: string | null } | null;
    if (!t) return NextResponse.json({ error: "NO_EXISTE" }, { status: 404 });
    if (t.estado !== "TRIAL") return NextResponse.json({ error: "NO_ESTA_EN_PRUEBA", detalle: "Solo se extiende la prueba de un cliente en prueba." }, { status: 400 });
    const { error } = await sb.from("tenants").update({ prueba_hasta: hasta }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await auditar(sb, { accion: "tenant.prueba_extender", tenantId: id, motivo: motivoDe(), payload: { antes: t.prueba_hasta ?? null, despues: hasta } });
    return NextResponse.json({ ok: true });
  }

  if (accion === "suscripcion_estado") {
    const nuevo = String(body.estado ?? "");
    if (!["ACTIVA", "PAUSADA", "CANCELADA", "EXPIRADA"].includes(nuevo)) return NextResponse.json({ error: "ESTADO_INVALIDO" }, { status: 400 });
    if (!motivoDe()) return faltaMotivo();
    const patch: Record<string, unknown> = { estado: nuevo };
    if (nuevo === "CANCELADA" || nuevo === "EXPIRADA") patch.fecha_fin = new Date().toISOString();
    const { error } = await sb.from("suscripciones").update(patch).eq("tenant_id", id).in("estado", ["ACTIVA", "PAUSADA"]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await auditar(sb, { accion: `tenant.suscripcion_${nuevo.toLowerCase()}`, tenantId: id, motivo: (body.motivo as string | undefined)?.trim() || null });
    return NextResponse.json({ ok: true });
  }

  // ── Módulos por excepción (tenant_feature_flags) ──────────────────────────────────────────
  // Permitir escribe/actualiza el flag en true; quitar lo pone en false (así puede negar lo que
  // el plan incluye). "Según plan" = borrar el flag. cfdi no entra: lo decide el add-on.
  if (accion === "modulo_permitir" || accion === "modulo_quitar" || accion === "modulo_segun_plan") {
    const codigo = String(body.codigo ?? "");
    const motivo = (body.motivo as string | undefined)?.trim() || "";
    if (!MODULOS.some((m) => m.codigo === codigo && !m.porAddon)) return NextResponse.json({ error: "MODULO_INVALIDO" }, { status: 400 });
    if (accion !== "modulo_segun_plan" && motivo.length < 10) return NextResponse.json({ error: "MOTIVO_REQUERIDO" }, { status: 400 });
    if (accion === "modulo_segun_plan") {
      const { error } = await sb.from("tenant_feature_flags").delete().eq("tenant_id", id).eq("flag_codigo", codigo);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await sb.from("tenant_feature_flags").upsert(
        { tenant_id: id, flag_codigo: codigo, activado: accion === "modulo_permitir", motivo, fecha_inicio: new Date().toISOString(), fecha_fin: null },
        { onConflict: "tenant_id,flag_codigo" },
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    await auditar(sb, { accion: `tenant.${accion}`, tenantId: id, motivo: motivo || "Vuelve a lo que dice el plan", payload: { codigo } });
    return NextResponse.json({ ok: true });
  }

  // ── Límites por excepción (tenant_limites) ─────────────────────────────────────────────────
  if (accion === "limites") {
    const motivo = (body.motivo as string | undefined)?.trim() || "";
    if (motivo.length < 10) return NextResponse.json({ error: "MOTIVO_REQUERIDO" }, { status: 400 });
    const lee = (k: string): number | null => {
      const v = body[k];
      if (v === null || v === undefined || v === "") return null;
      const n = Math.trunc(Number(v));
      if (!Number.isFinite(n) || n < 1) throw new Error(`LIMITE_INVALIDO:${k}`);
      return n;
    };
    let fila: Record<string, unknown>;
    try {
      fila = { tenant_id: id, max_sucursales: lee("max_sucursales"), max_cajas_por_sucursal: lee("max_cajas_por_sucursal"), max_usuarios: lee("max_usuarios"), motivo };
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "LIMITE_INVALIDO" }, { status: 400 });
    }
    const { error } = await sb.from("tenant_limites").upsert(fila, { onConflict: "tenant_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await auditar(sb, { accion: "tenant.limites", tenantId: id, motivo, payload: fila });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "ACCION_DESCONOCIDA" }, { status: 400 });
}

/**
 * Pausa en Uber las tiendas del cliente cuando se le retira el add-on de delivery (baja manual o
 * bajar de plan, 0141). Uber no lee nuestra base: si no se le avisa, sigue ofreciendo la tienda y
 * cobrándole al cliente final por comida que nadie va a preparar.
 *
 * El add-on ya quedó retirado antes de llamar aquí, así que un fallo de red NO lo deshace: un fallo
 * de red no puede dejarle el servicio encendido. Queda en `fallos` (y en `delivery_eventos`, del
 * lado de la Edge Function) para que alguien reintente.
 *
 * `delivery-uber-conexion` valida por JWT de dueño y exige el módulo `delivery_apps` para "pausar";
 * ninguna de las dos cosas aplica aquí (no hay dueño con sesión, y el módulo se acaba de apagar).
 * Por eso esa función acepta, SOLO para "pausar", el camino interno `x-vim-interno` (mismo ESQUEMA
 * que cargar-csd/enviar-push, pero con secreto PROPIO — `VIM_DELIVERY_INTERNO_SECRET`: compartirlo
 * habría dejado tres funciones con poderes muy distintos colgando de una sola credencial), con el
 * tenant resuelto desde la conexión. `x-vim-interno` es la valla de la FUNCIÓN, no la del gateway:
 * `verify_jwt` sigue activo ahí, así que hace falta un `Authorization` que la pase — se manda la
 * `service_role key`. Ver el comentario en supabase/functions/delivery-uber-conexion/index.ts.
 */
async function pausarTiendasUber(sb: SbClient, id: string): Promise<{ pausadas: number; fallos: string[] }> {
  let pausadas = 0;
  const fallos: string[] = [];
  // "ACTIVA" y "ERROR". La segunda se sumó el 14 sep 2026 por decisión de negocio: una conexión
  // rota que no se cierra le sigue apareciendo abierta al cliente final, que pide comida que el
  // POS va a rechazar. El camino interno de `delivery-uber-conexion` usa para eso la regla
  // `pausar_vim`, que sí admite ERROR (el dueño conserva la estrecha).
  // PENDIENTE sigue fuera: nunca estuvo abierta en Uber, así que su pausa vuelve con 409, se
  // apuntaría en `fallos` y el operador vería "Uber no confirmó la pausa" de una tienda que
  // jamás estuvo activa.
  const { data: cxs } = await sb.from("delivery_conexiones")
    .select("id, estado").eq("tenant_id", id).eq("app", "APP_UBEREATS").in("estado", ["ACTIVA", "ERROR"]);
  const supabaseUrl = process.env.SUPABASE_URL;
  const claveServicio = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secretoInterno = process.env.VIM_DELIVERY_INTERNO_SECRET;
  for (const cx of (cxs ?? []) as { id: string; estado: string }[]) {
    try {
      if (!supabaseUrl || !claveServicio || !secretoInterno) throw new Error("SERVIDOR_SIN_CONFIG");
      const r = await fetch(`${supabaseUrl}/functions/v1/delivery-uber-conexion`, {
        method: "POST",
        // `Authorization`: sin ella, `verify_jwt` normal del gateway rechaza la llamada antes
        // de llegar al código de la función — necesaria, no una suposición: es justo lo que
        // hace que esta función funcione hoy para admin/lib/integraciones.ts, aunque con un
        // JWT de usuario en vez de la `service_role key` (ver "Comprobar antes de desplegar"
        // en el informe de la Task 6: que ESTA clave en particular la pase no está probado).
        // `apikey`: se deja por el precedente de /api/versiones (Storage, con la misma clave
        // rotada) — no confirmado que el gateway de Functions también lo exija, pero no hace
        // daño tenerlo de más.
        // `x-vim-interno` es la valla de la función, no la del gateway: identifica esta
        // llamada como el camino interno para que no necesite JWT de dueño.
        headers: {
          "content-type": "application/json",
          apikey: claveServicio,
          authorization: `Bearer ${claveServicio}`,
          "x-vim-interno": secretoInterno,
        },
        body: JSON.stringify({ accion: "pausar", conexion_id: cx.id, habilitar: false }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      pausadas += 1;
    } catch (e) {
      fallos.push(`${cx.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { pausadas, fallos };
}
