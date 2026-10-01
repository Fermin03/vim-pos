import { NextResponse } from "next/server";
import { autorizar } from "../../lib/server";
import { enlaceProspecto, ESTADOS_PROSPECTO, type EstadoProspecto, type Prospecto } from "../../lib/prospectos";

// Bandeja de prospectos de demo (0084 + 0145). Se lee con service_role: la tabla no tiene tenant y
// su política de RLS niega a todo el mundo, así que este servidor es la única puerta.
//
// Antes una solicitud de demo solo llegaba por correo. El correo sigue saliendo (`solicitar-demo`),
// pero la fila es la fuente de verdad y aquí es donde se atiende.

/** Tope de filas. La bandeja es de trabajo diario; lo viejo se borra con `borrar_prospectos_viejos`. */
const LIMITE = 500;

export async function GET(req: Request) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;

  const estado = new URL(req.url).searchParams.get("estado");
  if (estado && !(ESTADOS_PROSPECTO as readonly string[]).includes(estado)) {
    return NextResponse.json({ error: "ESTADO_INVALIDO", detalle: "Ese estado de seguimiento no existe." }, { status: 400 });
  }

  // Se trae todo y se filtra aquí: son pocas filas y así el conteo por estado sale de la misma
  // lectura (con el filtro en la consulta, los contadores de los demás estados irían a cero).
  const { data, error } = await sb
    .from("prospectos")
    .select("id, nombre, whatsapp, negocio, cajas, sucursales, giro, usa_hoy, mensaje, origen, utm_source, utm_campaign, estado, notas, atendido_en, estado_cambiado_en, creado_en")
    .order("creado_en", { ascending: false })
    .limit(LIMITE);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const todos = (data ?? []) as unknown as Prospecto[];
  const conteo = Object.fromEntries(ESTADOS_PROSPECTO.map((e) => [e, 0])) as Record<EstadoProspecto, number>;
  for (const p of todos) if (p.estado in conteo) conteo[p.estado] += 1;

  const prospectos = (estado ? todos.filter((p) => p.estado === estado) : todos)
    // El enlace se arma en el servidor para que la pantalla no tenga que saber la regla de la lada.
    .map((p) => ({ ...p, enlace: enlaceProspecto(p) }));

  return NextResponse.json({ prospectos, conteo, total: todos.length, limite: LIMITE });
}
