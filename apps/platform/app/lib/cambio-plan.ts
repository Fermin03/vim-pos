// Vista previa de un cambio de plan (0141, ADR 0021).
//
// ESPEJO de `cambiar_plan_tenant()` + `_sincronizar_addons_del_plan()` en
// supabase/migrations/0141_cobro_promocion_prueba_plan.sql. La base es la que decide; esto solo le
// enseña al operador, ANTES de confirmar, lo que la base va a hacer: folios del mes, add-ons que
// entran o salen y el precio del cobro. Si cambias la regla allá, cámbiala aquí.
import { precioVigente, promocionVigente } from "@vim/db/cobro";

/** Qué bandera de `planes.features_incluidos` dice que el plan incluye cada add-on. */
export const ADDONS_DEL_PLAN = [
  { codigo: "CFDI", bandera: "cfdi_incluido" },
  { codigo: "DELIVERY", bandera: "delivery_incluido" },
] as const;

export type PlanParaCambio = {
  id: string;
  nombre: string;
  precio_mensual_mxn: number;
  timbres_cfdi_mensuales?: number | null;
  features_incluidos?: Record<string, unknown> | null;
};

export type AddonDelTenant = { codigo: string; activo: boolean; precio: number; incluidoEnPlan: boolean };

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
}): VistaPreviaPlan {
  const { nuevo, addons, suscripcion } = args;
  const concede: string[] = [];
  const dejaDePagar: { codigo: string; precio: number }[] = [];
  const retira: string[] = [];
  for (const { codigo, bandera } of ADDONS_DEL_PLAN) {
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
  return {
    folios: { antes: args.foliosAntes, despues: Number(nuevo.timbres_cfdi_mensuales ?? 0) },
    concede,
    dejaDePagar,
    retira,
    // "Antes" es lo que paga HOY (con promoción si sigue vigente), no el precio de lista.
    precio: suscripcion ? { antes: precioVigente(suscripcion, args.hoy), despues: args.precio ?? Number(nuevo.precio_mensual_mxn) } : null,
    quitaPromocion: suscripcion && promocionVigente(suscripcion, args.hoy) ? (suscripcion.promocion_nombre ?? "la promoción") : null,
  };
}
