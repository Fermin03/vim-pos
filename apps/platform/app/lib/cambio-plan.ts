// Vista previa de un cambio de plan (0141, ADR 0021).
//
// ESPEJO de `cambiar_plan_tenant()` + `_sincronizar_addons_del_plan()` en
// supabase/migrations/0141_cobro_promocion_prueba_plan.sql (`_sincronizar_addons_del_plan` se redefinió en la 0159 para
// incluir LEALTAD y en la 0167 para TIENDA). La base es la que decide; esto solo le
// enseña al operador, ANTES de confirmar, lo que la base va a hacer: folios del mes, add-ons que
// entran o salen y el precio del cobro. Si cambias la regla allá, cámbiala aquí.
import { EXTRAS, precioVigente, promocionVigente, type CodigoExtra } from "@vim/db/cobro";

/**
 * Qué bandera de `planes.features_incluidos` dice que el plan incluye cada add-on. Las mismas parejas
 * que recorre la base: `addons-del-plan-sql.test.ts` las compara con el SQL vigente.
 */
export const ADDONS_DEL_PLAN = [
  { codigo: "CFDI", bandera: "cfdi_incluido" },
  { codigo: "DELIVERY", bandera: "delivery_incluido" },
  { codigo: "LEALTAD", bandera: "lealtad_incluido" },
  { codigo: "TIENDA", bandera: "tienda_incluida" },
] as const;

/**
 * Parejas que la base solo sincroniza si el complemento está activo en el catálogo (`addons.activo`,
 * 0167): mientras VIM no encienda la tienda, cambiar de plan ni la concede ni la retira. Las demás
 * se sincronizan siempre, esté como esté el catálogo.
 */
const SOLO_CON_CATALOGO_ACTIVO: ReadonlySet<string> = new Set(["TIENDA"]);

export type PlanParaCambio = {
  id: string;
  nombre: string;
  precio_mensual_mxn: number;
  timbres_cfdi_mensuales?: number | null;
  features_incluidos?: Record<string, unknown> | null;
  /** Límites del plan; null = sin límite. Deciden qué extras por cantidad dejan de tener sentido (0147). */
  max_sucursales?: number | null;
  max_cajas_por_sucursal?: number | null;
};

export type AddonDelTenant = { codigo: string; activo: boolean; precio: number; incluidoEnPlan: boolean; /** Unidades (0147); sin dato, una. */ cantidad?: number };

/** La excepción de límites del cliente (`tenant_limites`): si existe, es la base sobre la que suman los extras. */
export type ExcepcionLimites = { max_sucursales: number | null; max_cajas_por_sucursal: number | null };

export type SuscripcionParaCambio = {
  precio_mensual_mxn: number | string;
  precio_promocional_mxn?: number | string | null;
  promocion_hasta?: string | null;
  promocion_nombre?: string | null;
} | null;

export type VistaPreviaPlan = {
  folios: { antes: number | null; despues: number };
  /** Add-ons que quedan incluidos a $0 con el plan nuevo (y antes no lo estaban). */
  concede: string[];
  /** De los anteriores, los que pagaba aparte: esa fila se cierra y deja de cobrarse. */
  dejaDePagar: { codigo: string; precio: number }[];
  /** Add-ons que daba el plan anterior y el nuevo no incluye: se retiran. */
  retira: string[];
  /**
   * Extras por cantidad que se retiran porque el plan nuevo ya no tiene ese límite (cajas
   * adicionales al subir a Cadena, 0147). Los demás extras se conservan: se pagan aparte.
   */
  retiraExtras: { codigo: CodigoExtra; cantidad: number; importe: number }[];
  /** null si no hay cobro vigente (no hay precio que cambiar). */
  precio: { antes: number; despues: number } | null;
  quitaPromocion: string | null;
};

export function incluye(plan: Pick<PlanParaCambio, "features_incluidos">, bandera: string): boolean {
  return plan.features_incluidos?.[bandera] === true;
}

export function vistaPreviaCambioPlan(args: {
  nuevo: PlanParaCambio;
  addons: AddonDelTenant[];
  foliosAntes: number | null;
  suscripcion: SuscripcionParaCambio;
  /** Precio pactado distinto al de lista; null/undefined = el de lista del plan nuevo. */
  precio?: number | null;
  /** Hoy en México (`hoyMx()`): una promoción ya vencida no se "quita", ya no está. */
  hoy: string;
  /** Excepción de límites vigente del cliente; con ella la base no es el plan. */
  excepcion?: ExcepcionLimites | null;
  /** Códigos de los add-ons activos en el catálogo (lo que la ficha ya lee con `activo = true`). Sin dato, ninguno. */
  catalogoActivo?: readonly string[];
}): VistaPreviaPlan {
  const { nuevo, addons, suscripcion } = args;
  const concede: string[] = [];
  const dejaDePagar: { codigo: string; precio: number }[] = [];
  const retira: string[] = [];
  for (const { codigo, bandera } of ADDONS_DEL_PLAN) {
    if (SOLO_CON_CATALOGO_ACTIVO.has(codigo) && !args.catalogoActivo?.includes(codigo)) continue;
    const activo = addons.find((a) => a.codigo === codigo && a.activo);
    if (incluye(nuevo, bandera)) {
      if (activo && activo.incluidoEnPlan && activo.precio === 0) continue;
      concede.push(codigo);
      if (activo && activo.precio > 0) dejaDePagar.push({ codigo, precio: activo.precio });
    } else if (activo?.incluidoEnPlan) {
      // Solo lo que dio el plan. Lo pagado aparte o de cortesía se queda.
      retira.push(codigo);
    }
  }
  // Espejo de `_retirar_extras_sin_limite()` (0147): la base es la excepción si existe y, si no,
  // el plan nuevo. Sin límite que ampliar, el extra se cierra para que no pague por nada.
  const retiraExtras: VistaPreviaPlan["retiraExtras"] = [];
  for (const codigo of Object.keys(EXTRAS) as CodigoExtra[]) {
    const limite = EXTRAS[codigo].limite;
    const base = args.excepcion?.[limite] ?? nuevo[limite] ?? null;
    if (base !== null) continue;
    const filas = addons.filter((a) => a.codigo === codigo && a.activo);
    const cantidad = filas.reduce((acc, a) => acc + (a.cantidad ?? 1), 0);
    if (cantidad > 0) retiraExtras.push({ codigo, cantidad, importe: filas.reduce((acc, a) => acc + a.precio * (a.cantidad ?? 1), 0) });
  }
  return {
    folios: { antes: args.foliosAntes, despues: Number(nuevo.timbres_cfdi_mensuales ?? 0) },
    concede,
    dejaDePagar,
    retira,
    retiraExtras,
    // "Antes" es lo que paga HOY (con promoción si sigue vigente), no el precio de lista.
    precio: suscripcion ? { antes: precioVigente(suscripcion, args.hoy), despues: args.precio ?? Number(nuevo.precio_mensual_mxn) } : null,
    quitaPromocion: suscripcion && promocionVigente(suscripcion, args.hoy) ? (suscripcion.promocion_nombre ?? "la promoción") : null,
  };
}
