"use client";
// Lo que el admin lee y escribe de la tienda en línea (tablas de 0161/0163), siempre bajo RLS con la
// sesión del dueño. Las reglas puras (dirección, horario, lista de revisión) viven en tienda-reglas.ts.
import { z } from "zod";
import { supabase } from "./supabase";
import { tenantId } from "./datos";
import { combosNoComprables, type ComboNoComprable, type ComboParaRevisar } from "./tienda-combos";
import { filaOculta, type CambioMenu, type CategoriaCatalogo, type Ocultos, type ProductoCatalogo } from "./tienda-menu";
import { ofertaTienda, type OfertaTienda } from "./tienda-plan";
import { errorDeDireccion, errorDeHorario, leerHorario, mensajeTienda, type SucursalTienda } from "./tienda-reglas";

const SOLO_ADMIN = "Solo el dueño o un administrador puede cambiar esto.";

const fallo = (error: { message: string; code?: string }, porDefecto: string): Error => new Error(mensajeTienda(error, porDefecto));

// ── Configuración ─────────────────────────────────────────────────────────────

export type ConfigTienda = {
  /** En la base es la columna `slug`; al dueño siempre se le dice «dirección». */
  direccion: string; color: string; descripcion: string;
  /** Ruta dentro del almacén público `productos`; la base guarda la ruta, no la URL. */
  logoRuta: string | null; logoUrl: string | null;
  aceptacion: "MANUAL" | "AUTO"; minutosAceptacion: number; pagoEfectivo: boolean; pagoTarjeta: boolean;
};
export type DatosConfigTienda = Omit<ConfigTienda, "logoRuta" | "logoUrl">;
/** Los dos bloques de la página que guardan en la fila de la tienda: «Tu tienda» y «Pedidos». */
export type BloqueConfig = "datos" | "pedidos";

const configSchema = z.object({
  direccion: z.string().superRefine((d, ctx) => {
    const e = errorDeDireccion(d);
    if (e) ctx.addIssue({ code: "custom", message: e });
  }),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "El color no es válido."),
  descripcion: z.string().max(200, "La descripción puede tener hasta 200 caracteres."),
  aceptacion: z.enum(["MANUAL", "AUTO"]),
  minutosAceptacion: z.number().int("Los minutos van en números enteros.").min(3, "Los minutos para aceptar van de 3 a 15.").max(15, "Los minutos para aceptar van de 3 a 15."),
  pagoEfectivo: z.boolean(),
  pagoTarjeta: z.boolean(),
}).refine((d) => d.pagoEfectivo || d.pagoTarjeta, { message: "Deja activa al menos una forma de pago.", path: ["pagoEfectivo"] });

/** La dirección pública del logo a partir de su ruta en el almacén. */
export const urlDelLogo = (ruta: string | null): string | null =>
  ruta ? supabase.storage.from("productos").getPublicUrl(ruta).data.publicUrl : null;

/** null = todavía no hay tienda configurada. */
export async function leerConfigTienda(): Promise<ConfigTienda | null> {
  const tid = await tenantId();
  const { data, error } = await supabase
    .from("tienda_config")
    .select("slug, color, descripcion, logo_ruta, aceptacion, minutos_aceptacion, pago_efectivo, pago_tarjeta")
    .eq("tenant_id", tid)
    .maybeSingle();
  if (error) throw fallo(error, "No se pudo leer la tienda");
  if (!data) return null;
  const c = data as Record<string, unknown>;
  const logoRuta = typeof c.logo_ruta === "string" && c.logo_ruta !== "" ? c.logo_ruta : null;
  return {
    direccion: String(c.slug), color: String(c.color), descripcion: String(c.descripcion ?? ""),
    logoRuta, logoUrl: urlDelLogo(logoRuta),
    aceptacion: c.aceptacion === "AUTO" ? "AUTO" : "MANUAL", minutosAceptacion: Number(c.minutos_aceptacion),
    pagoEfectivo: c.pago_efectivo === true, pagoTarjeta: c.pago_tarjeta === true,
  };
}

/**
 * Crea la fila la primera vez (con todo, para que nazca completa); después cada bloque actualiza
 * SOLO sus columnas: la página arma `d` con lo que tiene en memoria, y una pestaña vieja que guarda
 * «Pedidos» pisaría la dirección que otra pestaña (u otro administrador) acaba de guardar.
 * Nunca escribe `logo_ruta` (lo maneja el logo).
 */
export async function guardarConfigTienda(d: DatosConfigTienda, bloque: BloqueConfig): Promise<void> {
  const v = configSchema.safeParse(d);
  if (!v.success) throw new Error(v.error.issues[0]?.message ?? "Revisa los datos de la tienda.");
  const tid = await tenantId();
  const columnas = {
    datos: { slug: d.direccion, color: d.color, descripcion: d.descripcion.trim() === "" ? null : d.descripcion },
    pedidos: { aceptacion: d.aceptacion, minutos_aceptacion: d.minutosAceptacion, pago_efectivo: d.pagoEfectivo, pago_tarjeta: d.pagoTarjeta },
  };
  const { data: existe, error: errLectura } = await supabase.from("tienda_config").select("tenant_id").eq("tenant_id", tid).maybeSingle();
  if (errLectura) throw fallo(errLectura, "No se pudo guardar la tienda");
  if (!existe) {
    const { error } = await supabase.from("tienda_config").insert({ tenant_id: tid, ...columnas.datos, ...columnas.pedidos });
    if (error) throw fallo(error, "No se pudo guardar la tienda");
    return;
  }
  const { data, error } = await supabase
    .from("tienda_config").update({ ...columnas[bloque], updated_at: new Date().toISOString() }).eq("tenant_id", tid).select("tenant_id");
  if (error) throw fallo(error, "No se pudo guardar la tienda");
  // La RLS no contesta con error a un UPDATE ajeno: simplemente no encuentra la fila.
  if (!data || data.length === 0) throw new Error(SOLO_ADMIN);
}

// ── Sucursales ────────────────────────────────────────────────────────────────

/** Todas las sucursales vivas, participen o no, con sus zonas activas contadas en una sola consulta. */
export async function leerSucursalesTienda(): Promise<SucursalTienda[]> {
  const [suc, tienda, zonas] = await Promise.all([
    supabase.from("sucursales").select("id, nombre, telefono, activa").is("deleted_at", null).order("nombre", { ascending: true }),
    supabase.from("tienda_sucursales").select("sucursal_id, participa, recoger, domicilio, horario"),
    supabase.from("zonas_envio").select("sucursal_id").eq("activa", true).is("deleted_at", null),
  ]);
  if (suc.error) throw fallo(suc.error, "No se pudieron leer las sucursales");
  if (tienda.error) throw fallo(tienda.error, "No se pudieron leer las sucursales de la tienda");
  if (zonas.error) throw fallo(zonas.error, "No se pudieron leer las zonas de envío");
  const deTienda = new Map(((tienda.data ?? []) as Record<string, unknown>[]).map((f) => [String(f.sucursal_id), f]));
  const nZonas = new Map<string, number>();
  for (const z of (zonas.data ?? []) as { sucursal_id: string }[]) nZonas.set(z.sucursal_id, (nZonas.get(z.sucursal_id) ?? 0) + 1);
  return ((suc.data ?? []) as { id: string; nombre: string; telefono: string | null; activa: boolean }[]).map((s) => {
    const t = deTienda.get(s.id);
    return {
      id: s.id, nombre: s.nombre, telefono: s.telefono ?? "", activa: s.activa,
      participa: t?.participa === true, recoger: t ? t.recoger === true : true, domicilio: t?.domicilio === true,
      horario: leerHorario(t?.horario), zonasActivas: nZonas.get(s.id) ?? 0,
    };
  });
}

/** No toca `pausa_hasta`: esa la pone la caja. */
export async function guardarSucursalTienda(
  id: string,
  d: Pick<SucursalTienda, "participa" | "recoger" | "domicilio" | "horario">,
): Promise<void> {
  const e = errorDeHorario(d.horario);
  if (e) throw new Error(e);
  const tid = await tenantId();
  const { data, error } = await supabase
    .from("tienda_sucursales")
    .upsert(
      { sucursal_id: id, tenant_id: tid, participa: d.participa, recoger: d.recoger, domicilio: d.domicilio, horario: d.horario, updated_at: new Date().toISOString() },
      { onConflict: "sucursal_id" },
    )
    .select("sucursal_id");
  if (error) throw fallo(error, "No se pudo guardar la sucursal");
  if (!data || data.length === 0) throw new Error(SOLO_ADMIN);
}

// ── Interruptor ───────────────────────────────────────────────────────────────

/**
 * El interruptor CRUDO de la base. Ojo: un complemento que vence por fecha deja
 * `modulo_tienda_activo = true`, así que la página NO debe fiarse solo de esto: lo combina con los
 * módulos efectivos que ya tiene antes de decir «encendida».
 * Sin fila en `configuracion_tenant` está apagada.
 */
export async function leerTiendaEncendida(): Promise<boolean> {
  const tid = await tenantId();
  const { data, error } = await supabase.from("configuracion_tenant").select("modulo_tienda_activo").eq("tenant_id", tid).maybeSingle();
  if (error) throw fallo(error, "No se pudo leer si la tienda está encendida");
  return (data as { modulo_tienda_activo?: boolean } | null)?.modulo_tienda_activo === true;
}

/** Mismo upsert que la lealtad: casi ningún negocio tiene fila en `configuracion_tenant` al inicio. */
export async function encenderTienda(encendida: boolean): Promise<void> {
  const tid = await tenantId();
  const { error } = await supabase
    .from("configuracion_tenant")
    .upsert({ tenant_id: tid, modulo_tienda_activo: encendida }, { onConflict: "tenant_id" });
  if (error) throw fallo(error, "No se pudo cambiar");
}

// ── Pendientes del catálogo ───────────────────────────────────────────────────

/** Productos vivos, visibles y no pausados a los que les falta algo para lucir en la tienda. */
export async function contarPendientesDeCatalogo(): Promise<{ sinFoto: number; sinDescripcion: number; enCategoriaInactiva: number }> {
  const productos = () =>
    supabase.from("productos").select("id", { count: "exact", head: true })
      .is("deleted_at", null).eq("visible_en_pos", true).neq("estado", "PAUSADO");
  const contar = async (q: PromiseLike<{ count: number | null; error: { message: string; code?: string } | null }>) => {
    const { count, error } = await q;
    if (error) throw fallo(error, "No se pudo revisar el catálogo");
    return count ?? 0;
  };
  const { data: cats, error } = await supabase.from("categorias").select("id, activa, deleted_at");
  if (error) throw fallo(error, "No se pudo revisar el catálogo");
  const inactivas = ((cats ?? []) as { id: string; activa: boolean; deleted_at: string | null }[])
    .filter((c) => !c.activa || c.deleted_at != null).map((c) => c.id);
  // El catálogo guarda lo vacío como NULL (`descripcion || null`), por eso basta `.is(…, null)`.
  const [sinFoto, sinDescripcion, enCategoriaInactiva] = await Promise.all([
    contar(productos().is("imagen_url", null)),
    contar(productos().is("descripcion", null)),
    inactivas.length === 0 ? 0 : contar(productos().in("categoria_id", inactivas)),
  ]);
  return { sinFoto, sinDescripcion, enCategoriaInactiva };
}

// ── Combos que la tienda no puede vender ──────────────────────────────────────

/** PostgREST corta en 1000 filas: con el catálogo cortado las opciones saldrían incompletas y el aviso mentiría. */
const TOPE_FILAS = 1000;

/**
 * Los combos que no se pueden comprar en la tienda. Qué es opción de un paso sale de lo mismo que
 * valida la venta (0165, `slots`): en un paso por categoría, los productos de la categoría menos los
 * excluidos (fila con `activa = false`); sin categoría, solo las filas activas. Ignora los menús
 * propios por sucursal (ADR 0029). Si el catálogo no cabe en una consulta, no avisa.
 */
export async function leerCombosNoComprables(): Promise<ComboNoComprable[]> {
  const [prods, pasos, filas] = await Promise.all([
    supabase.from("productos").select("id, nombre, categoria_id, es_combo").is("deleted_at", null).eq("visible_en_pos", true).neq("estado", "PAUSADO"),
    supabase.from("combo_grupos").select("id, combo_producto_id, nombre, categoria_id").is("deleted_at", null).eq("activo", true).gte("minimo_selecciones", 1),
    supabase.from("combo_opciones").select("grupo_id, producto_id, activa").is("deleted_at", null),
  ]);
  if (prods.error) throw fallo(prods.error, "No se pudieron revisar los combos");
  if (pasos.error) throw fallo(pasos.error, "No se pudieron revisar los combos");
  if (filas.error) throw fallo(filas.error, "No se pudieron revisar los combos");
  const productos = (prods.data ?? []) as { id: string; nombre: string; categoria_id: string; es_combo: boolean }[];
  const opciones = (filas.data ?? []) as { grupo_id: string; producto_id: string; activa: boolean }[];
  if (productos.length >= TOPE_FILAS || opciones.length >= TOPE_FILAS) return [];
  const porId = new Map(productos.map((p) => [p.id, p]));
  const combos = new Map<string, ComboParaRevisar>();
  for (const c of productos.filter((p) => p.es_combo)) combos.set(c.id, { nombre: c.nombre, slots: [] });
  for (const g of (pasos.data ?? []) as { id: string; combo_producto_id: string; nombre: string; categoria_id: string | null }[]) {
    const combo = combos.get(g.combo_producto_id);
    if (!combo) continue;
    const suyas = opciones.filter((o) => o.grupo_id === g.id);
    const ids = g.categoria_id
      ? productos.filter((p) => p.categoria_id === g.categoria_id && !p.es_combo && !suyas.some((o) => o.producto_id === p.id && !o.activa)).map((p) => p.id)
      : suyas.filter((o) => o.activa && porId.get(o.producto_id)?.es_combo === false).map((o) => o.producto_id);
    combo.slots.push({ nombre: g.nombre, obligatorio: true, opciones: ids.map((id) => ({ productoId: id, nombre: porId.get(id)?.nombre ?? "" })) });
  }
  return combosNoComprables([...combos.values()]);
}

// ── Menú de la tienda (0168) ──────────────────────────────────────────────────

export type MenuTiendaLeido = { categorias: CategoriaCatalogo[]; productos: ProductoCatalogo[]; ocultos: Ocultos };

type Respuesta = { data: unknown; error: { message: string; code?: string } | null };
const NO_SE_GUARDO = "No se pudo guardar el cambio";

/** PostgREST corta en 1000 filas: se pide por páginas hasta que una venga incompleta. */
async function todasLasFilas<T>(pagina: (desde: number, hasta: number) => PromiseLike<Respuesta>): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += TOPE_FILAS) {
    const { data, error } = await pagina(desde, desde + TOPE_FILAS - 1);
    if (error) throw fallo(error, "No se pudo leer tu catálogo");
    const lote = (data ?? []) as T[];
    filas.push(...lote);
    if (lote.length < TOPE_FILAS) return filas;
  }
}

/**
 * El catálogo como lo ve UNA sucursal y lo que esa sucursal tiene escondido. Trae también los
 * productos que la tienda no enseña por otra razón (no visibles en el POS, pausados, no se venden
 * ahí): el bloque los pinta con su nota. Las categorías, solo las activas.
 */
export async function leerMenuTienda(sucursalId: string): Promise<MenuTiendaLeido> {
  const [cats, prods, deSucursal, ocultos] = await Promise.all([
    supabase.from("categorias").select("id, nombre, orden_visualizacion").is("deleted_at", null).eq("activa", true),
    todasLasFilas<{ id: string; nombre: string; categoria_id: string; orden_visualizacion: number | null; es_combo: boolean; precio_base_mxn: number | string; visible_en_pos: boolean; estado: string }>(
      (desde, hasta) => supabase.from("productos")
        .select("id, nombre, categoria_id, orden_visualizacion, es_combo, precio_base_mxn, visible_en_pos, estado")
        .is("deleted_at", null).order("id", { ascending: true }).range(desde, hasta)),
    todasLasFilas<{ producto_id: string; disponible: boolean | null; precio_mxn: number | string | null }>(
      (desde, hasta) => supabase.from("productos_sucursal")
        .select("producto_id, disponible, precio_mxn").eq("sucursal_id", sucursalId).order("producto_id", { ascending: true }).range(desde, hasta)),
    todasLasFilas<{ categoria_id: string | null; producto_id: string | null }>(
      (desde, hasta) => supabase.from("tienda_ocultos")
        .select("categoria_id, producto_id").eq("sucursal_id", sucursalId).order("id", { ascending: true }).range(desde, hasta)),
  ]);
  if (cats.error) throw fallo(cats.error, "No se pudo leer tu catálogo");
  const aqui = new Map(deSucursal.map((f) => [f.producto_id, f]));
  return {
    categorias: ((cats.data ?? []) as { id: string; nombre: string; orden_visualizacion: number | null }[])
      .map((c) => ({ id: c.id, nombre: c.nombre, orden: c.orden_visualizacion ?? 0 })),
    productos: prods.map((p) => {
      const s = aqui.get(p.id);
      return {
        id: p.id, nombre: p.nombre, categoriaId: p.categoria_id, orden: p.orden_visualizacion ?? 0, esCombo: p.es_combo === true,
        precio: Number(s?.precio_mxn ?? p.precio_base_mxn),
        visibleEnPos: p.visible_en_pos === true, pausado: p.estado === "PAUSADO", seVendeAqui: s?.disponible !== false,
      };
    }),
    ocultos: {
      categorias: new Set(ocultos.flatMap((o) => (o.categoria_id ? [o.categoria_id] : []))),
      productos: new Set(ocultos.flatMap((o) => (o.producto_id ? [o.producto_id] : []))),
    },
  };
}

/**
 * Vuelve a mostrar: borra las filas de esa columna en la sucursal. La RLS no contesta con error a un
 * DELETE ajeno, solo no borra nada; tampoco borra nada si otra pestaña ya lo había mostrado. Lo que
 * distingue los dos casos es si alguna fila sigue ahí.
 */
async function borrarOcultos(sucursalId: string, columna: "categoria_id" | "producto_id", ids: string[]): Promise<void> {
  const { data, error } = await supabase.from("tienda_ocultos").delete().eq("sucursal_id", sucursalId).in(columna, ids).select("id");
  if (error) throw fallo(error, NO_SE_GUARDO);
  if (data && data.length > 0) return;
  const { data: sigue, error: errLectura } = await supabase.from("tienda_ocultos").select("id").eq("sucursal_id", sucursalId).in(columna, ids).limit(1);
  if (errLectura) throw fallo(errLectura, NO_SE_GUARDO);
  if (sigue && sigue.length > 0) throw new Error(SOLO_ADMIN);
}

/**
 * Esconde (inserta la fila) o vuelve a mostrar (la borra) una categoría o un producto en una
 * sucursal. Repetir lo ya hecho no es un error: otra pestaña pudo adelantarse.
 */
export async function cambiarMenuTienda(sucursalId: string, c: CambioMenu): Promise<void> {
  if (!c.escondido) return borrarOcultos(sucursalId, c.tipo === "categoria" ? "categoria_id" : "producto_id", [c.id]);
  const { error } = await supabase.from("tienda_ocultos").insert(filaOculta(await tenantId(), sucursalId, c));
  // 23505: ya estaba escondido.
  if (error && error.code !== "23505") throw fallo(error, NO_SE_GUARDO);
}

/** «Mostrar todos»: borra de un golpe las filas de esos productos en la sucursal. */
export async function mostrarProductosTienda(sucursalId: string, productoIds: string[]): Promise<void> {
  // Por tandas: los ids viajan en la dirección de la petición y cientos no caben.
  for (let i = 0; i < productoIds.length; i += 100) await borrarOcultos(sucursalId, "producto_id", productoIds.slice(i, i + 100));
}

// ── La invitación (quien todavía no la tiene) ─────────────────────────────────

/**
 * Lo que la invitación necesita: si VIM ya ofrece el complemento, cuánto cuesta y si el plan del
 * negocio lo incluye. `addons` y `planes` son catálogo de lectura abierta (0002). Nunca lanza: si algo
 * falla devuelve null y la invitación se queda con el texto de siempre.
 */
export async function leerOfertaTienda(): Promise<OfertaTienda | null> {
  try {
    const tid = await tenantId();
    const [a, t] = await Promise.all([
      supabase.from("addons").select("activo, precio_mensual_mxn").eq("codigo", "TIENDA").maybeSingle(),
      supabase.from("tenants").select("plan:planes(features_incluidos)").eq("id", tid).maybeSingle(),
    ]);
    if (a.error || t.error) return null;
    const plan = (t.data as { plan?: { features_incluidos?: unknown } | null } | null)?.plan;
    return ofertaTienda(a.data, plan?.features_incluidos);
  } catch {
    return null;
  }
}
