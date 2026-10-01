import { z } from "zod";
import { auditar, type SbClient } from "./server";
import { agruparPorBucket, Archivo, type ArchivoStorage } from "./eliminar";

/**
 * Borra de Storage los archivos de un cliente YA eliminado (0144, M2).
 *
 * La lista no viaja en la respuesta de `eliminar_tenant`: se lee de
 * `tenants_eliminados.archivos_pendientes`, que la base llenó dentro de la misma transacción que
 * eliminó. Así, si el servidor se cae entre el commit y este borrado —o la respuesta no se
 * entiende— la lista sigue ahí, y esta misma función sirve para reintentar desde "Clientes
 * eliminados". Lo que no se pudo borrar se deja pendiente con `marcar_archivos_eliminados`.
 *
 * Devuelve `null` si ese id no es de un cliente eliminado.
 */
export async function limpiarArchivosEliminado(sb: SbClient, id: string): Promise<{ borrados: number; pendientes: number } | null> {
  const { data, error } = await sb
    .from("tenants_eliminados")
    .select("id, codigo, nombre_comercial, archivos_pendientes")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error(`[eliminar] no se pudo leer los archivos pendientes de ${id}: ${error.message}`);
    return { borrados: 0, pendientes: 0 };
  }
  const fila = data as { id: string; codigo: string; nombre_comercial: string; archivos_pendientes: unknown } | null;
  if (!fila) return null;

  const lista = z.array(Archivo).safeParse(fila.archivos_pendientes);
  const archivos: ArchivoStorage[] = lista.success ? lista.data : [];
  if (archivos.length === 0) return { borrados: 0, pendientes: 0 };

  const quedan: ArchivoStorage[] = [];
  let borrados = 0;
  for (const [bucket, nombres] of agruparPorBucket(archivos)) {
    const { error: e } = await sb.storage.from(bucket).remove(nombres);
    if (e) {
      // El mensaje de Storage se queda aquí: nombra buckets y recursos internos.
      console.error(`[eliminar] Storage no borró ${nombres.length} archivo(s) de ${bucket} (${fila.codigo}): ${e.message}`);
      quedan.push(...nombres.map((nombre) => ({ bucket, nombre })));
    } else {
      borrados += nombres.length;
    }
  }

  const { error: mErr } = await sb.rpc("marcar_archivos_eliminados", { p_id: id, p_pendientes: quedan });
  if (mErr) console.error(`[eliminar] no se pudo actualizar los archivos pendientes de ${fila.codigo}: ${mErr.message}`);

  await auditar(sb, {
    accion: "tenant.eliminar_archivos",
    motivo: quedan.length > 0 ? "Quedaron archivos sin borrar tras eliminar al cliente" : "Archivos borrados tras eliminar al cliente",
    payload: { tenant_eliminado: { id: fila.id, codigo: fila.codigo, nombre_comercial: fila.nombre_comercial }, borrados, pendientes: quedan.length },
  });
  return { borrados, pendientes: quedan.length };
}
