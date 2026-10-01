import { NextResponse } from "next/server";
import { autorizar } from "../../lib/server";

// Catálogo de planes (para el selector de plan en el detalle de un tenant).

export async function GET(req: Request) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  const { data, error } = await auth.sb
    .from("planes")
    .select("id, codigo, nombre, vertical, precio_mensual_mxn, timbres_cfdi_mensuales, features_incluidos, max_sucursales, max_cajas_por_sucursal")
    .eq("activo", true)
    .order("orden_visualizacion", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ planes: data ?? [] });
}
