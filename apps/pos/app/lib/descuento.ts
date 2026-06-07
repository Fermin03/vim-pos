"use client";
import { z } from "zod";
import { employeeClient } from "./supabase";

export type TipoDescuento = "PORCENTAJE" | "MONTO_FIJO" | "CORTESIA_TOTAL" | "OVERRIDE_PRECIO";
export type MotivoDescuento =
  | "CORTESIA_INVITADO"
  | "PRODUCTO_DEFECTO_LEVE"
  | "CLIENTE_FRECUENTE"
  | "INCONVENIENCIA_OPERATIVA"
  | "OTRO";

export const MOTIVOS: { codigo: MotivoDescuento; label: string }[] = [
  { codigo: "CORTESIA_INVITADO", label: "Cortesía" },
  { codigo: "PRODUCTO_DEFECTO_LEVE", label: "Producto defectuoso" },
  { codigo: "CLIENTE_FRECUENTE", label: "Cliente VIP / frecuente" },
  { codigo: "INCONVENIENCIA_OPERATIVA", label: "Ajuste de precio" },
  { codigo: "OTRO", label: "Otro" },
];

export const descuentoSchema = z
  .object({
    tipo: z.enum(["PORCENTAJE", "MONTO_FIJO", "CORTESIA_TOTAL", "OVERRIDE_PRECIO"]),
    valor: z.number().nonnegative("El valor no puede ser negativo"),
    motivoCategoria: z.enum([
      "CORTESIA_INVITADO",
      "PRODUCTO_DEFECTO_LEVE",
      "CLIENTE_FRECUENTE",
      "INCONVENIENCIA_OPERATIVA",
      "OTRO",
    ]),
    motivoTexto: z.string().trim().max(200).optional().or(z.literal("")),
  })
  .refine((d) => d.motivoCategoria !== "OTRO" || (d.motivoTexto ?? "").length > 0, {
    message: "Describe el motivo",
    path: ["motivoTexto"],
  })
  .refine((d) => d.tipo !== "PORCENTAJE" || d.valor <= 100, {
    message: "El porcentaje no puede pasar de 100",
    path: ["valor"],
  })
  .refine((d) => d.tipo === "CORTESIA_TOTAL" || d.valor > 0, {
    message: "El valor debe ser mayor a 0",
    path: ["valor"],
  });
export type DescuentoInput = z.infer<typeof descuentoSchema>;

/** El código del permiso requerido en BD para cada tipo de descuento. */
export function permisoDescuento(tipo: TipoDescuento): string {
  if (tipo === "CORTESIA_TOTAL") return "descuento.cortesia_total";
  if (tipo === "OVERRIDE_PRECIO") return "descuento.override_precio";
  return "descuento.manual_aplicar";
}

/** Aplica el descuento (asume autorizacion_pin_id ya obtenido). Dispara recalcular_totales por trigger.
 *  Si se pasa ticketItemId, el descuento/override aplica a ese ÍTEM; si no, al ticket completo. */
export async function aplicarDescuento(
  token: string,
  args: {
    ticketId: string;
    ticketItemId?: string | null;
    input: DescuentoInput;
    autorizacionPinId: string;
    solicitanteId: string;
    autorizoId: string;
  },
): Promise<void> {
  const { error } = await employeeClient(token).rpc("aplicar_descuento_manual", {
    p_ticket_id: args.ticketId,
    p_ticket_item_id: args.ticketItemId ?? null,
    p_tipo: args.input.tipo,
    p_valor: args.input.valor,
    p_motivo_categoria: args.input.motivoCategoria,
    p_motivo_texto: args.input.motivoTexto || null,
    p_autorizacion_pin_id: args.autorizacionPinId,
    p_usuario_solicitante_id: args.solicitanteId,
    p_usuario_autorizo_id: args.autorizoId,
    p_client_id_local: null,
  });
  if (error) throw new Error(error.message);
}

/** Calcula el monto de descuento para PREVIEW en cliente (la BD es la autoridad).
 *  Para OVERRIDE_PRECIO, `valor` es el nuevo precio: el "descuento" es base - valor. */
export function previewDescuento(tipo: TipoDescuento, valor: number, totalActual: number): number {
  if (tipo === "CORTESIA_TOTAL") return totalActual; // 100% off
  if (tipo === "OVERRIDE_PRECIO") return Math.max(0, Math.round((totalActual - Math.max(0, valor)) * 100) / 100);
  if (!valor || valor <= 0) return 0;
  const m = tipo === "PORCENTAJE" ? (totalActual * Math.min(valor, 100)) / 100 : Math.min(valor, totalActual);
  return Math.round(m * 100) / 100;
}
