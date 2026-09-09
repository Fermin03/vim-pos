"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@vim/ui/styles";
import { CLAVE_SAT_COMBO, comboSchema, crearCombo } from "../lib/combos";
import { listarCategoriasOpciones, type CategoriaOpcion } from "../lib/catalogo";
import { mensajeError } from "../lib/errores";

// Mismas clases que producto-form.tsx: misma app, mismo look.
const input =
  "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-[13px] font-medium text-ink-2";

/**
 * Alta de un combo. Solo crea (no hay edición aquí): una vez creado, los campos propios del
 * producto se editan con `ProductoForm` desde la página del editor — es la misma tabla
 * `productos`, no hace falta un formulario de edición aparte.
 */
export function ComboForm() {
  const router = useRouter();
  const [cats, setCats] = useState<CategoriaOpcion[]>([]);
  const [nombre, setNombre] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [precio, setPrecio] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [claveSat, setClaveSat] = useState(CLAVE_SAT_COMBO);
  const [tasaIva, setTasaIva] = useState("16");
  const [ivaIncluido, setIvaIncluido] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    listarCategoriasOpciones()
      .then(setCats)
      .catch(() => setError("No se pudieron cargar las categorías"));
  }, []);

  async function guardar() {
    setError(null);
    const parsed = comboSchema.safeParse({
      nombre,
      categoria_id: categoriaId,
      precio_base_mxn: Number(precio),
      descripcion,
      clave_sat: claveSat,
      tasa_iva: Number(tasaIva),
      iva_incluido_en_precio: ivaIncluido,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setGuardando(true);
    try {
      const id = await crearCombo(parsed.data);
      // Después de crear, a agregarle slots: sin ellos la caja no puede venderlo.
      router.replace(`/catalogo/combos/${id}`);
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar"));
      setGuardando(false);
    }
  }

  return (
    <div className="max-w-[640px]">
      <div className="flex flex-col gap-5">
        <div>
          <label className={label} htmlFor="nombre">
            Nombre del combo
          </label>
          <input
            id="nombre"
            className={input}
            value={nombre}
            maxLength={200}
            autoFocus
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Combo Clásico"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="categoria">
              Categoría
            </label>
            <select id="categoria" className={input} value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
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
            <p className="mt-1 text-[11.5px] text-ink-3">
              Lo que cuesta hacerlo combo. El precio de la hamburguesa (u otro producto principal) se suma después.
            </p>
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

        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="mb-3 text-[13px] font-medium text-ink-2">Datos fiscales</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="clave-sat">
                Clave de producto SAT
              </label>
              <input
                id="clave-sat"
                className={input}
                value={claveSat}
                inputMode="numeric"
                maxLength={8}
                onChange={(e) => setClaveSat(e.target.value.replace(/\D/g, ""))}
                placeholder="90101503"
              />
              <p className="mt-1 text-[11.5px] text-ink-3">Prellenada con la clave genérica de comida rápida. Cámbiala si tu contador lo indica.</p>
            </div>
            <div>
              <label className={label} htmlFor="tasa-iva">
                Tasa de IVA
              </label>
              <select id="tasa-iva" className={input} value={tasaIva} onChange={(e) => setTasaIva(e.target.value)}>
                <option value="16">16% · consumo en el lugar</option>
                <option value="0">0% · alimentos para llevar</option>
                <option value="8">8% · región fronteriza</option>
              </select>
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2.5">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#16161A]"
              checked={ivaIncluido}
              onChange={(e) => setIvaIncluido(e.target.checked)}
            />
            <span className="text-sm">
              <span className="font-medium">IVA incluido en el precio</span>{" "}
              <span className="text-ink-3">(como se acostumbra en restaurante)</span>
            </span>
          </label>
        </div>

        {/* No hay selector de estado a propósito: el combo nace PAUSADO. Al crearlo todavía no
            tiene ni un slot, y una caja que no haya tomado la 0.4.65 (sin migración 0110) lo
            pintaría como un producto normal y lo vendería al precio base, sin cocinar nada. Se
            publica desde la ficha del combo cuando ya tiene sus slots. */}
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="text-sm font-medium">El combo se crea pausado</p>
          <p className="mt-1 text-[12.5px] text-ink-2">
            Todavía no tiene slots, así que la caja no debe venderlo. En la siguiente pantalla le
            agregas sus slots (qué hamburguesa, qué acompañamiento, qué bebida) y ahí mismo lo
            publicas cambiando su estado a <b className="text-ink">Activo</b>.
          </p>
        </div>

        {error && (
          <p className="text-sm font-medium text-danger" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-line pt-5">
          <Button variant="ghost" onClick={() => router.push("/catalogo/combos")} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Crear combo"}
          </Button>
        </div>
      </div>
    </div>
  );
}
