"use client";
import { employeeClient } from "./supabase";

export type TipoSeleccion =
  | "UNICA_OBLIGATORIA"
  | "UNICA_OPCIONAL"
  | "MULTIPLE_OPCIONAL"
  | "MULTIPLE_OBLIGATORIA_RANGO";

export type OpcionModificador = {
  id: string;
  nombre: string;
  precioExtra: number;
  esDefault: boolean;
  agotada: boolean;
};

export type GrupoModificadores = {
  id: string;
  nombre: string;
  tipoSeleccion: TipoSeleccion;
  min: number | null;
  max: number | null;
  opciones: OpcionModificador[];
};

type FilaUnion = {
  orden_visualizacion: number;
  grupo: {
    id: string;
    nombre: string;
    tipo_seleccion: TipoSeleccion;
    activo: boolean;
    deleted_at: string | null;
    minimo_selecciones: number | null;
    maximo_selecciones: number | null;
    opciones: {
      id: string;
      nombre: string;
      precio_extra_mxn: string | number;
      es_default: boolean;
      activa: boolean;
      agotada: boolean;
      deleted_at: string | null;
      orden_visualizacion: number;
    }[];
  } | null;
};

/** Grupos de modificadores aplicables a un producto, ordenados; cada grupo con sus opciones activas. RLS por tenant. */
export async function obtenerGruposDeProducto(
  token: string,
  productoId: string,
): Promise<GrupoModificadores[]> {
  const { data, error } = await employeeClient(token)
    .from("productos_grupos_modificadores")
    .select(
      "orden_visualizacion, grupo:grupos_modificadores(id, nombre, tipo_seleccion, activo, deleted_at, minimo_selecciones, maximo_selecciones, opciones:opciones_modificador(id, nombre, precio_extra_mxn, es_default, activa, agotada, deleted_at, orden_visualizacion))",
    )
    .eq("producto_id", productoId)
    .order("orden_visualizacion", { ascending: true });
  if (error) throw new Error(error.message);

  const filas = (data ?? []) as unknown as FilaUnion[];
  return filas
    .map((f) => f.grupo)
    .filter((g): g is NonNullable<FilaUnion["grupo"]> => !!g && g.activo && g.deleted_at === null)
    .map((g) => ({
      id: g.id,
      nombre: g.nombre,
      tipoSeleccion: g.tipo_seleccion,
      min: g.minimo_selecciones,
      max: g.maximo_selecciones,
      opciones: (g.opciones ?? [])
        .filter((o) => o.activa && o.deleted_at === null)
        .sort((a, b) => a.orden_visualizacion - b.orden_visualizacion)
        .map((o) => ({
          id: o.id,
          nombre: o.nombre,
          precioExtra: Number(o.precio_extra_mxn),
          esDefault: o.es_default,
          agotada: o.agotada,
        })),
    }));
}
