"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@vim/ui/styles";
import {
  actualizarProducto,
  crearProducto,
  listarCategoriasOpciones,
  listarMarcasOpciones,
  productoSchema,
  type CategoriaOpcion,
  type MarcaOpcion,
  type Producto,
} from "../lib/catalogo";

const input =
  "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-[13px] font-medium text-ink-2";

export function ProductoForm({ producto }: { producto: Producto | null }) {
  const router = useRouter();
  const editar = !!producto;

  const [cats, setCats] = useState<CategoriaOpcion[]>([]);
  const [marcas, setMarcas] = useState<MarcaOpcion[]>([]);
  const [nombre, setNombre] = useState(producto?.nombre ?? "");
  const [categoriaId, setCategoriaId] = useState(producto?.categoria_id ?? "");
  const [marcaId, setMarcaId] = useState(producto?.marca_virtual_id ?? "");
  const [precio, setPrecio] = useState(producto ? String(producto.precio_base_mxn) : "");
  const [descripcion, setDescripcion] = useState(producto?.descripcion ?? "");
  const [codigo, setCodigo] = useState(producto?.codigo_interno ?? "");
  const [estado, setEstado] = useState<"ACTIVO" | "PAUSADO">(
    producto?.estado === "PAUSADO" ? "PAUSADO" : "ACTIVO",
  );
  const [agotado, setAgotado] = useState(producto?.estado === "AGOTADO" || (producto?.agotado_manual ?? false));
  const [visible, setVisible] = useState(producto?.visible_en_pos ?? true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    listarCategoriasOpciones()
      .then(setCats)
      .catch(() => setError("No se pudieron cargar las categorías"));
    listarMarcasOpciones()
      .then(setMarcas)
      .catch(() => {/* marcas opcionales: si no hay, el selector queda solo con "Sin marca" */});
  }, []);

  async function guardar() {
    setError(null);
    const parsed = productoSchema.safeParse({
      nombre,
      categoria_id: categoriaId,
      precio_base_mxn: Number(precio),
      descripcion,
      codigo_interno: codigo,
      estado,
      agotado,
      visible_en_pos: visible,
      marca_virtual_id: marcaId,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setGuardando(true);
    try {
      if (editar) await actualizarProducto(producto!.id, parsed.data);
      else await crearProducto(parsed.data);
      router.push("/catalogo/productos");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
      setGuardando(false);
    }
  }

  return (
    <div className="max-w-[640px]">
      <div className="flex flex-col gap-5">
        <div>
          <label className={label} htmlFor="nombre">
            Nombre del producto
          </label>
          <input
            id="nombre"
            className={input}
            value={nombre}
            maxLength={200}
            autoFocus
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Hamburguesa Clásica"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label} htmlFor="categoria">
              Categoría
            </label>
            <select
              id="categoria"
              className={input}
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
            >
              <option value="">Elige una categoría…</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="precio">
              Precio base (MXN)
            </label>
            <input
              id="precio"
              className={input}
              value={precio}
              inputMode="decimal"
              onChange={(e) => setPrecio(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0.00"
            />
            <p className="mt-1 text-[11.5px] text-ink-3">IVA 16% incluido en el precio.</p>
          </div>
        </div>

        <div>
          <label className={label} htmlFor="desc">
            Descripción <span className="text-ink-3">· opcional</span>
          </label>
          <textarea
            id="desc"
            className="min-h-[72px] w-full rounded border border-line-strong px-3 py-2.5 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]"
            value={descripcion}
            maxLength={500}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Breve descripción que verá el cliente"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label} htmlFor="codigo">
              Código interno <span className="text-ink-3">· opcional</span>
            </label>
            <input
              id="codigo"
              className={input}
              value={codigo}
              maxLength={50}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Ej. HAM-001"
            />
          </div>
          <div>
            <label className={label} htmlFor="estado">
              Estado
            </label>
            <select
              id="estado"
              className={input}
              value={estado}
              disabled={agotado}
              onChange={(e) => setEstado(e.target.value as "ACTIVO" | "PAUSADO")}
            >
              <option value="ACTIVO">Activo · visible y vendible</option>
              <option value="PAUSADO">Pausado · oculto del POS</option>
            </select>
          </div>
        </div>

        {marcas.length > 0 && (
          <div>
            <label className={label} htmlFor="marca">
              Marca virtual <span className="text-ink-3">· opcional</span>
            </label>
            <select id="marca" className={input} value={marcaId} onChange={(e) => setMarcaId(e.target.value)}>
              <option value="">Sin marca</option>
              {marcas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11.5px] text-ink-3">Para operar varios conceptos desde el mismo local.</p>
          </div>
        )}

        <div className="flex flex-col gap-2.5 rounded-lg border border-line bg-surface p-4">
          <label className="flex items-center gap-2.5">
            <input type="checkbox" className="h-4 w-4 accent-[#16161A]" checked={agotado} onChange={(e) => setAgotado(e.target.checked)} />
            <span className="text-sm">
              <span className="font-medium">Marcar como agotado</span>{" "}
              <span className="text-ink-3">(visible en gris, no se puede agregar al ticket)</span>
            </span>
          </label>
          <label className="flex items-center gap-2.5">
            <input type="checkbox" className="h-4 w-4 accent-[#16161A]" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
            <span className="text-sm">
              <span className="font-medium">Visible en el POS</span>{" "}
              <span className="text-ink-3">(desmarca para productos internos)</span>
            </span>
          </label>
        </div>

        <p className="text-[12.5px] text-ink-3">
          Imagen, precios por modo de servicio, grupos de modificadores y área de cocina se configuran
          en sus módulos (rebanadas siguientes de F4).
        </p>

        {error && (
          <p className="text-sm font-medium text-danger" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-line pt-5">
          <Button variant="ghost" onClick={() => router.push("/catalogo/productos")} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : editar ? "Guardar cambios" : "Crear producto"}
          </Button>
        </div>
      </div>
    </div>
  );
}
