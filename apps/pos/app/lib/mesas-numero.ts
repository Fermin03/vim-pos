"use client";
import { employeeClient } from "./supabase";

/**
 * Resolver una mesa por su NÚMERO, para poder abrir cuenta escribiéndolo en vez de buscarla en
 * el mapa.
 *
 * La mesa tiene que existir de verdad: `asignar_mesa_a_ticket` la exige, y de ahí salen el
 * estado ocupada/libre y los reportes por mesa. Por eso, si el número no existe, no se inventa
 * nada en silencio — se avisa a quien llama para que ofrezca crearla.
 */

export type MesaBasica = { id: string; numero: string; estado: string };

/** Busca la mesa por número en la sucursal. null si no existe. */
export async function buscarMesaPorNumero(
  token: string,
  sucursalId: string,
  numero: string,
): Promise<MesaBasica | null> {
  const { data, error } = await employeeClient(token)
    .from("mesas")
    .select("id, numero, estado")
    .eq("sucursal_id", sucursalId)
    .eq("numero", numero.trim())
    .is("deleted_at", null)
    .eq("activa", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as MesaBasica | null) ?? null;
}

/**
 * Crea la mesa con ese número. Solo se llama cuando el cajero lo confirma: un restaurante que
 * acomoda mesas nuevas no debería tener que ir al panel, pero tampoco queremos que un dedazo
 * ("55" en vez de "5") ensucie el catálogo sin que nadie lo note.
 */
export async function crearMesaConNumero(
  token: string,
  args: { tenantId: string; sucursalId: string; numero: string },
): Promise<MesaBasica> {
  const { data, error } = await employeeClient(token)
    .from("mesas")
    .insert({
      tenant_id: args.tenantId,
      sucursal_id: args.sucursalId,
      numero: args.numero.trim(),
      capacidad: 4,
      estado: "LIBRE",
      activa: true,
    })
    .select("id, numero, estado")
    .single();
  if (error) throw new Error(error.message);
  return data as MesaBasica;
}
