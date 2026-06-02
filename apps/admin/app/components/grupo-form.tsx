"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@vim/ui/styles";
import {
  NATURALEZA,
  TIPO_SELECCION,
  actualizarGrupo,
  crearGrupo,
  grupoSchema,
  type Grupo,
  type Naturaleza,
  type TipoSeleccion,
} from "../lib/modificadores";

const input =
  "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-[13px] font-medium text-ink-2";

export function GrupoForm({ grupo }: { grupo: Grupo | null }) {
  const router = useRouter();
  const editar = !!grupo;
  const [nombre, setNombre] = useState(grupo?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(grupo?.descripcion ?? "");
  const [tipo, setTipo] = useState<TipoSeleccion>(grupo?.tipo_seleccion ?? "UNICA_OBLIGATORIA");
  const [naturaleza, setNaturaleza] = useState<Naturaleza>(grupo?.naturaleza ?? "NEUTRO");
  const [minimo, setMinimo] = useState(grupo?.minimo_selecciones != null ? String(grupo.minimo_selecciones) : "1");
  const [maximo, setMaximo] = useState(grupo?.maximo_selecciones != null ? String(grupo.maximo_selecciones) : "2");
  const [activo, setActivo] = useState(grupo?.activo ?? true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const esRango = tipo === "MULTIPLE_OBLIGATORIA_RANGO";

  async function guardar() {
    setError(null);
    const parsed = grupoSchema.safeParse({
      nombre,
      descripcion,
      tipo_seleccion: tipo,
      naturaleza,
      minimo_selecciones: esRango ? Number(minimo) : null,
      maximo_selecciones: esRango ? Number(maximo) : null,
      activo,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setGuardando(true);
    try {
      if (editar) {
        await actualizarGrupo(grupo!.id, parsed.data);
        router.push("/catalogo/modificadores");
      } else {
        const id = await crearGrupo(parsed.data);
        // Tras crear, ir a la edición para agregar opciones.
        router.push(`/catalogo/modificadores/${id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
      setGuardando(false);
    }
  }

  return (
    <div className="max-w-[640px]">
      <div className="flex flex-col gap-5">
        <div>
          <label className={label} htmlFor="nombre">Nombre del grupo</label>
          <input id="nombre" className={input} value={nombre} maxLength={150} autoFocus onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Término de cocción, Extras, Sin ingredientes" />
        </div>

        <div>
          <label className={label} htmlFor="desc">Descripción <span className="text-ink-3">· opcional</span></label>
          <input id="desc" className={input} value={descripcion} maxLength={300} onChange={(e) => setDescripcion(e.target.value)} placeholder="Nota breve para tu equipo" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label} htmlFor="tipo">Cómo se elige</label>
            <select id="tipo" className={input} value={tipo} onChange={(e) => setTipo(e.target.value as TipoSeleccion)}>
              {(Object.keys(TIPO_SELECCION) as TipoSeleccion[]).map((t) => (
                <option key={t} value={t}>{TIPO_SELECCION[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="nat">Naturaleza</label>
            <select id="nat" className={input} value={naturaleza} onChange={(e) => setNaturaleza(e.target.value as Naturaleza)}>
              {(Object.keys(NATURALEZA) as Naturaleza[]).map((n) => (
                <option key={n} value={n}>{NATURALEZA[n]}</option>
              ))}
            </select>
          </div>
        </div>

        {esRango && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label} htmlFor="min">Mínimo a elegir</label>
              <input id="min" className={input} value={minimo} inputMode="numeric" onChange={(e) => setMinimo(e.target.value.replace(/[^0-9]/g, ""))} />
            </div>
            <div>
              <label className={label} htmlFor="max">Máximo a elegir</label>
              <input id="max" className={input} value={maximo} inputMode="numeric" onChange={(e) => setMaximo(e.target.value.replace(/[^0-9]/g, ""))} />
            </div>
          </div>
        )}

        <label className="flex items-center gap-2.5">
          <input type="checkbox" className="h-4 w-4 accent-[#16161A]" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          <span className="text-sm"><span className="font-medium">Grupo activo</span> <span className="text-ink-3">(disponible para asignar a productos)</span></span>
        </label>

        {!editar && (
          <p className="text-[12.5px] text-ink-3">Después de crear el grupo podrás agregarle sus opciones.</p>
        )}

        {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}

        <div className="flex items-center justify-end gap-2 border-t border-line pt-5">
          <Button variant="ghost" onClick={() => router.push("/catalogo/modificadores")} disabled={guardando}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : editar ? "Guardar cambios" : "Crear grupo"}
          </Button>
        </div>
      </div>
    </div>
  );
}
