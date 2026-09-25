"use client";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, useConfirmar } from "@vim/ui/styles";
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
import { listarAreasCocina, type AreaCocina } from "../lib/areas-cocina";
import { mensajeError } from "../lib/errores";
import { limpiarPrecio } from "../lib/numeros";
import { Plegable } from "./plegable";

const input =
  "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-[13px] font-medium text-ink-2";
const ayuda = "mt-1 text-[12.5px] text-ink-2";

/**
 * Las tasas de IVA como las diría el contador. Antes la opción decía "0% · alimentos para
 * llevar" y la ayuda de abajo "la tasa 0 solo aplica a alimentos no preparados": se
 * contradecían, y la correcta es la segunda (la comida preparada paga 16 % también para
 * llevar o a domicilio).
 */
export const OPCIONES_IVA = [
  { v: "16", l: "16% · comida y bebida preparadas" },
  { v: "0", l: "0% · productos sin preparar" },
  { v: "8", l: "8% · región fronteriza" },
];
export const AYUDA_IVA = "La comida preparada paga 16 % aunque sea para llevar o a domicilio. Ante la duda, pregúntale a tu contador.";

export function ProductoForm({
  producto,
  alGuardar,
  guardarTambien,
  extra,
  volverA = "/catalogo/productos",
}: {
  producto: Producto | null;
  /**
   * Qué hacer al guardar, en vez de salir a la lista de productos. El editor de combos lo usa
   * para quedarse en la pantalla de pasos y recargar el producto.
   */
  alGuardar?: () => void;
  /**
   * Lo que la pantalla tenga pendiente de guardar además del producto (hoy: los modificadores
   * marcados). Se espera ANTES de salir: sin esto se perdían sin aviso.
   */
  guardarTambien?: () => Promise<void>;
  /** Contenido que va dentro del formulario, antes del botón de guardar (los modificadores). */
  extra?: ReactNode;
  /** A dónde lleva "Cancelar" (antes, dentro de un combo, mandaba a Productos). */
  volverA?: string;
}) {
  const router = useRouter();
  const editar = !!producto;
  const [confirmar, dialogoConfirmar] = useConfirmar();

  const [cats, setCats] = useState<CategoriaOpcion[]>([]);
  const [marcas, setMarcas] = useState<MarcaOpcion[]>([]);
  const [areas, setAreas] = useState<AreaCocina[]>([]);
  const [nombre, setNombre] = useState(producto?.nombre ?? "");
  const [categoriaId, setCategoriaId] = useState(producto?.categoria_id ?? "");
  const [marcaId, setMarcaId] = useState(producto?.marca_virtual_id ?? "");
  const [areaId, setAreaId] = useState(producto?.area_cocina_id ?? "");
  const [precio, setPrecio] = useState(producto ? String(producto.precio_base_mxn) : "");
  const [descripcion, setDescripcion] = useState(producto?.descripcion ?? "");
  const [codigo, setCodigo] = useState(producto?.codigo_interno ?? "");
  const [estado, setEstado] = useState<"ACTIVO" | "PAUSADO">(producto?.estado === "PAUSADO" ? "PAUSADO" : "ACTIVO");
  const [agotado, setAgotado] = useState(producto?.estado === "AGOTADO" || (producto?.agotado_manual ?? false));
  const [visible, setVisible] = useState(producto?.visible_en_pos ?? true);
  const [claveSat, setClaveSat] = useState(producto?.clave_sat ?? "");
  const [tasaIva, setTasaIva] = useState(producto ? String(producto.tasa_iva) : "16");
  const [ivaIncluido, setIvaIncluido] = useState(producto?.iva_incluido_en_precio ?? true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // ¿Hay cambios sin guardar? Se compara contra lo que había al abrir (o al último guardado).
  const valores = JSON.stringify([nombre, categoriaId, marcaId, areaId, precio, descripcion, codigo, estado, agotado, visible, claveSat, tasaIva, ivaIncluido]);
  const guardado = useRef(valores);
  const sucio = valores !== guardado.current;
  useEffect(() => {
    if (!sucio) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sucio]);

  useEffect(() => {
    listarCategoriasOpciones()
      .then(setCats)
      .catch(() => setError("No se pudieron cargar las categorías"));
    listarMarcasOpciones()
      .then(setMarcas)
      .catch(() => {/* marcas opcionales: si no hay, el selector queda solo con "Sin marca" */});
    // Estaciones: si no hay ninguna, el selector no se muestra y el producto imprime en cocina.
    listarAreasCocina().then((a) => setAreas(a.filter((x) => x.activa))).catch(() => setAreas([]));
  }, []);

  async function guardar(e?: FormEvent) {
    e?.preventDefault();
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
      area_cocina_id: areaId,
      clave_sat: claveSat,
      tasa_iva: Number(tasaIva),
      iva_incluido_en_precio: ivaIncluido,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisa los datos del producto.");
      return;
    }
    setGuardando(true);
    try {
      if (editar) await actualizarProducto(producto!.id, parsed.data);
      else await crearProducto(parsed.data);
      if (guardarTambien) await guardarTambien();
      guardado.current = valores;
      if (alGuardar) {
        // Aquí no se navega: el componente sigue montado, así que el botón vuelve a habilitarse.
        setGuardando(false);
        alGuardar();
      } else {
        router.push(volverA);
      }
    } catch (err) {
      setError(mensajeError(err, "No se pudo guardar"));
      setGuardando(false);
    }
  }

  async function volver() {
    if (
      sucio &&
      !(await confirmar({ titulo: "¿Salir sin guardar?", mensaje: "Los cambios que hiciste en este producto se van a perder.", boton: "Salir sin guardar" }))
    )
      return;
    router.push(volverA);
  }

  const masDatos = [descripcion && "descripción", codigo && "código", marcaId && "marca", areaId && "estación"].filter(Boolean) as string[];
  const tasa = OPCIONES_IVA.find((o) => o.v === tasaIva)?.v ?? tasaIva;
  const fiscalDistinto = !!claveSat || tasaIva !== "16" || !ivaIncluido;

  return (
    <form onSubmit={guardar} noValidate className="max-w-[640px]">
      <div className="flex flex-col gap-5">
        {/* Lo esencial primero: con esto la caja ya puede venderlo. */}
        <div>
          <label className={label} htmlFor="nombre">
            Nombre
          </label>
          <input
            id="nombre"
            className={input}
            value={nombre}
            maxLength={200}
            autoFocus={!editar}
            onChange={(e) => setNombre(e.target.value)}
            placeholder={producto?.es_combo ? "Ej. Combo Clásico" : "Ej. Hamburguesa Clásica"}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="precio">
              Precio
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-2" aria-hidden="true">$</span>
              <input
                id="precio"
                className={`${input} pl-7 tabular-nums`}
                value={precio}
                inputMode="decimal"
                onChange={(e) => setPrecio(limpiarPrecio(e.target.value))}
                placeholder="0.00"
                aria-describedby="precio-ayuda"
              />
            </div>
            <p id="precio-ayuda" className={ayuda}>
              {ivaIncluido ? `Con IVA de ${tasa}% incluido.` : `Al cobrar se le suma ${tasa}% de IVA.`}
            </p>
          </div>
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
        </div>

        <fieldset className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
          <legend className="sr-only">Disponibilidad</legend>
          <div>
            <label className={label} htmlFor="estado">
              En la caja
            </label>
            <select
              id="estado"
              className={input}
              value={agotado ? "AGOTADO" : estado}
              onChange={(e) => {
                const v = e.target.value;
                setAgotado(v === "AGOTADO");
                if (v !== "AGOTADO") setEstado(v as "ACTIVO" | "PAUSADO");
              }}
            >
              <option value="ACTIVO">Se vende</option>
              <option value="AGOTADO">Agotado · se ve en gris y no se puede vender</option>
              <option value="PAUSADO">Pausado · no aparece</option>
            </select>
          </div>
          <label className="flex min-h-[44px] items-center gap-2.5">
            <input type="checkbox" className="h-5 w-5 accent-ink" checked={!visible} onChange={(e) => setVisible(!e.target.checked)} />
            <span className="text-sm">
              <span className="font-medium">Producto interno</span> <span className="text-ink-2">· no se muestra en la caja</span>
            </span>
          </label>
        </fieldset>

        <Plegable titulo="Más datos" resumen={masDatos.length ? masDatos.join(", ") : "descripción, código, estación"} abierto={masDatos.length > 0 && !editar}>
          <div>
            <label className={label} htmlFor="desc">
              Descripción
            </label>
            <textarea
              id="desc"
              className="min-h-[72px] w-full rounded border border-line-strong px-3 py-2.5 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]"
              value={descripcion}
              maxLength={500}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Lo que verá el cliente"
            />
          </div>
          <div>
            <label className={label} htmlFor="codigo">
              Código interno
            </label>
            <input id="codigo" className={input} value={codigo} maxLength={50} onChange={(e) => setCodigo(e.target.value)} placeholder="Ej. HAM-001" />
          </div>
          {marcas.length > 0 && (
            <div>
              <label className={label} htmlFor="marca">
                Marca virtual
              </label>
              <select id="marca" className={input} value={marcaId} onChange={(e) => setMarcaId(e.target.value)}>
                <option value="">Sin marca</option>
                {marcas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
              <p className={ayuda}>Para operar varios conceptos desde el mismo local.</p>
            </div>
          )}
          {/* Un combo no tiene estación propia: la comanda la generan los productos que el
              cliente elige en cada paso, cada uno con la suya. */}
          {areas.length > 0 && !producto?.es_combo && (
            <div>
              <label className={label} htmlFor="area">
                Estación de preparación
              </label>
              <select id="area" className={input} value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                <option value="">La de su categoría</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
              <p className={ayuda}>
                Dónde se imprime su comanda. Casi siempre se deja la de su categoría; esto es para la
                excepción, como una limonada que se prepara en cocina.
              </p>
            </div>
          )}
        </Plegable>

        {/* Datos fiscales: alimentan el CFDI. Cerrados salvo que ya tengan algo distinto de lo
            normal (clave propia, otra tasa o IVA por fuera). */}
        <Plegable
          titulo="Datos fiscales"
          resumen={`IVA ${tasaIva}% ${ivaIncluido ? "incluido" : "aparte"}${claveSat ? ` · clave ${claveSat}` : ""}`}
          abierto={fiscalDistinto && !editar}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="tasa-iva">
                Tasa de IVA
              </label>
              <select id="tasa-iva" className={input} value={tasaIva} onChange={(e) => setTasaIva(e.target.value)}>
                {OPCIONES_IVA.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="clave-sat">
                Clave de producto SAT <span className="font-normal text-ink-2">· opcional</span>
              </label>
              <input
                id="clave-sat"
                className={input}
                value={claveSat}
                inputMode="numeric"
                maxLength={8}
                onChange={(e) => setClaveSat(e.target.value.replace(/\D/g, ""))}
                placeholder="90101500"
              />
            </div>
          </div>
          <p className="-mt-1 text-[12.5px] text-ink-2">
            {AYUDA_IVA} Sin clave, se factura como servicio de restaurante.
          </p>
          <label className="flex min-h-[44px] items-center gap-2.5">
            <input type="checkbox" className="h-5 w-5 accent-ink" checked={ivaIncluido} onChange={(e) => setIvaIncluido(e.target.checked)} />
            <span className="text-sm">
              <span className="font-medium">El precio ya incluye el IVA</span> <span className="text-ink-2">· lo normal en restaurante</span>
            </span>
          </label>
        </Plegable>

        {extra}

        {error && (
          <p className="text-sm font-medium text-danger" role="alert">
            {error}
          </p>
        )}

        {/* Barra fija abajo: en el celular, "Guardar" siempre a la mano sin bajar hasta el final. */}
        <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-2 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur-sm lg:mx-0 lg:px-0">
          {sucio && !guardando && <span className="mr-auto text-[13px] text-ink-2" aria-live="polite">Cambios sin guardar</span>}
          <Button variant="ghost" onClick={() => void volver()} disabled={guardando}>
            {editar ? "Volver" : "Cancelar"}
          </Button>
          <Button type="submit" disabled={guardando}>
            {guardando ? "Guardando…" : editar ? "Guardar cambios" : "Crear producto"}
          </Button>
        </div>
      </div>
      {dialogoConfirmar}
    </form>
  );
}
