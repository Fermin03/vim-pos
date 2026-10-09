"use client";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
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
import { ponerFotoProducto, quitarFotoProducto } from "../lib/foto-producto";
import { ofreceFotoDeProducto } from "../lib/tienda-plan";
import { limpiarPrecio } from "../lib/numeros";
import { Plegable } from "./plegable";
import { CampoImagen } from "./campo-imagen";
import { useModulos } from "./admin-shell";
import { AvisoCajasMenu } from "./aviso-cajas-menu";
import { DisponibilidadSucursales } from "./disponibilidad-sucursales";
import {
  agotadosParaGuardar,
  cajasQueNoRespetanMenu,
  filasFormIniciales,
  guardarAgotado,
  leerMenuDeProducto,
  listarSucursalesMenu,
  precioValido,
  type FilaFormMenu,
  type FilaMenuSucursal,
} from "../lib/menu-sucursal";
import { guardarFilaDeMenu, hrefConMenu, leerFilaDeMenu } from "../lib/menus";
import { useMenuCatalogo } from "./selector-menu";
import type { Caja } from "../lib/configuracion";
import { input, label } from "./campos";

const ayuda = "mt-1 text-13 text-ink-2";

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
  // Menú del catálogo (ADR 0029). `menuCat` es el menú que se está administrando: el precio y «se
  // vende» que se editan aquí son los de ese menú. Sin franja de menús (una sola sucursal y ningún
  // menú propio) el formulario se ve y guarda como siempre.
  const menuCat = useMenuCatalogo();
  const enMenu = menuCat.visible && menuCat.listo;
  const [seVende, setSeVende] = useState(producto?.en_menu_general ?? true);
  // ¿Ya se cargó el precio y el «se vende» del menú elegido? Hasta entonces no se puede guardar.
  const [filaMenuLista, setFilaMenuLista] = useState(false);
  // Sube cada vez que termina de cargarse el precio del menú (también al recargar el producto): la
  // línea base de «cambios sin guardar» se vuelve a fijar, p. ej. «160.50» que vuelve como «160.5».
  const [cargaN, setCargaN] = useState(0);
  // «Agotado hoy» (0155): una fila por sucursal activa; con dos o más, Disponibilidad muestra la
  // tabla y el agotado deja de estar en el selector.
  const [agotados, setAgotados] = useState<FilaFormMenu[]>([]);
  const [menuExistente, setMenuExistente] = useState<FilaMenuSucursal[]>([]);
  const [menuListo, setMenuListo] = useState(false);
  const [cajasViejas, setCajasViejas] = useState<Caja[]>([]);
  // Id del producto recién creado: si luego falla el menú, el siguiente «Guardar» lo actualiza.
  const [idCreado, setIdCreado] = useState<string | null>(null);
  const multi = agotados.length >= 2;
  // Sin poder leer los menús no se guarda nada: el formulario se vería como el General y el precio
  // de un menú propio caería ahí.
  const cargando = !menuCat.listo || !!menuCat.error || (editar && enMenu && !filaMenuLista);
  // De vuelta a la lista, en el menú que se estaba editando.
  const destino = hrefConMenu(volverA, enMenu ? menuCat.id : null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  // La foto se sube al momento y solo toca `imagen_url`: no entra en «cambios sin guardar» ni espera
  // al «Guardar» del formulario, y lo que el dueño tenga a medio escribir se queda como está.
  // Solo se ofrece a quien tiene la tienda en línea: sin ella, la ficha queda como siempre.
  const conFoto = ofreceFotoDeProducto(useModulos());
  const idFoto = producto?.id ?? idCreado;
  const [fotoUrl, setFotoUrl] = useState(producto?.imagen_url ?? null);
  const [fotoOcupada, setFotoOcupada] = useState(false);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);

  async function cambiarFoto(accion: (id: string) => Promise<string | null>, fallo: string) {
    if (!idFoto || fotoOcupada) return;
    setErrorFoto(null);
    setFotoOcupada(true);
    try {
      setFotoUrl(await accion(idFoto));
    } catch (e) {
      setErrorFoto(mensajeError(e, fallo));
    }
    setFotoOcupada(false);
  }

  // ¿Hay cambios sin guardar? Se compara contra lo que había al abrir (o al último guardado). De las
  // sucursales solo cuenta el agotado: su precio y «se vende» los proyecta la base y cambian solos.
  const valores = JSON.stringify([nombre, categoriaId, marcaId, areaId, precio, descripcion, codigo, estado, agotado, visible, claveSat, tasaIva, ivaIncluido, seVende, agotados.map((f) => [f.sucursalId, f.agotado])]);
  const [base, setBase] = useState(valores);
  const sucio = valores !== base;

  // El menú llega después del primer render: al llegar, lo cargado es el punto de partida, no un cambio.
  useEffect(() => {
    if (menuListo && filaMenuLista) setBase(valores);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al terminar de cargar
  }, [menuListo, filaMenuLista, cargaN]);

  // El precio y «se vende» de este producto en el menú elegido. En el General salen del producto;
  // en un menú propio, de su fila de menu_productos.
  useEffect(() => {
    if (!menuCat.listo) return;
    if (!producto || !enMenu) {
      setFilaMenuLista(true);
      setCargaN((n) => n + 1);
      return;
    }
    if (menuCat.esGeneral) {
      setPrecio(String(producto.precio_base_mxn));
      setSeVende(producto.en_menu_general);
      setFilaMenuLista(true);
      setCargaN((n) => n + 1);
      return;
    }
    let vivo = true;
    setFilaMenuLista(false);
    leerFilaDeMenu(menuCat.id, producto.id)
      .then((f) => {
        if (!vivo) return;
        if (!f) {
          setError("Este producto no está en este menú. Recarga la página.");
          return;
        }
        setPrecio(String(f.precio_mxn));
        setSeVende(f.disponible);
        setFilaMenuLista(true);
        setCargaN((n) => n + 1);
      })
      .catch(() => {
        if (vivo) setError("No se pudo leer el precio de este menú");
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `producto` no cambia mientras el formulario vive
  }, [producto, menuCat.listo, menuCat.id, enMenu]);
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
    Promise.all([listarSucursalesMenu(), producto ? leerMenuDeProducto(producto.id) : Promise.resolve([] as FilaMenuSucursal[])])
      .then(([sucursales, filas]) => {
        const iniciales = filasFormIniciales(sucursales, filas);
        setMenuExistente(filas);
        setAgotados(iniciales);
        // Con una sola sucursal, «Agotado» del selector es el de esa sucursal.
        if (iniciales.length === 1 && iniciales[0]!.agotado) setAgotado(true);
        setMenuListo(true);
      })
      .catch(() => setError("No se pudo leer el agotado por sucursal"));
    cajasQueNoRespetanMenu().then(setCajasViejas).catch(() => setCajasViejas([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `producto` no cambia mientras el formulario vive
  }, [producto]);

  async function guardar(e?: FormEvent) {
    e?.preventDefault();
    if (cargando) return;
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
    // Antes de tocar la base: un «.» suelto (que limpiarPrecio deja en «0.») no es precio.
    const precioMenu = precioValido(precio);
    if (precioMenu === null || precioMenu === "invalido") {
      setError("Escribe un precio válido.");
      return;
    }
    setGuardando(true);
    try {
      // Si el producto ya se creó en un intento anterior (y falló lo que sigue), se actualiza: no se duplica.
      const idPrevio = producto?.id ?? idCreado;
      const enPropio = enMenu && !menuCat.esGeneral;
      let id: string;
      if (idPrevio) {
        // En un menú propio el precio tecleado es el del menú, no el del General: al producto se le
        // manda el suyo de siempre (solo si ya existía antes de abrir el formulario).
        const datos = enPropio && producto ? { ...parsed.data, precio_base_mxn: producto.precio_base_mxn } : parsed.data;
        await actualizarProducto(idPrevio, datos);
        id = idPrevio;
        if (enMenu) {
          await guardarFilaDeMenu(
            menuCat.id,
            id,
            enPropio ? { precio_mxn: precioMenu, disponible: seVende } : { disponible: seVende },
          );
        }
      } else {
        id = await crearProducto(parsed.data, enPropio ? { enMenuGeneral: false } : {});
        setIdCreado(id);
        // Nace en todos los menús al precio tecleado; aquí se ajusta el menú elegido.
        const ajuste = enPropio ? { disponible: seVende, precio_mxn: precioMenu } : !seVende ? { disponible: false } : null;
        if (enMenu && ajuste) {
          try {
            await guardarFilaDeMenu(menuCat.id, id, ajuste);
          } catch {
            setError(
              enPropio
                ? "El producto se creó, pero no se pudo encender en este menú. Vuelve a intentar."
                : `El producto se creó, pero no se pudo aplicar «se vende» en ${menuCat.nombre}. Vuelve a intentar.`,
            );
            setGuardando(false);
            return;
          }
        }
      }
      try {
        // Con una sola sucursal, el agotado del selector va a la fila de esa sucursal.
        const filasForm = multi ? agotados : agotados.map((f) => ({ ...f, agotado }));
        const enviadas = agotadosParaGuardar(
          id,
          filasForm.map((f) => ({ sucursalId: f.sucursalId, agotado: f.agotado })),
          menuExistente,
        );
        await guardarAgotado(enviadas);
        // Solo las filas que de verdad se mandaron cuentan como existentes: una sucursal sin agotar
        // y sin fila no debe crearse en un segundo «Guardar».
        setMenuExistente((prev) => [
          ...prev,
          ...enviadas
            .filter((e) => !prev.some((p) => p.sucursal_id === e.sucursal_id))
            .map((e) => ({
              ...e,
              disponible: true,
              precio_mxn: null,
              agotado_automatico: filasForm.find((f) => f.sucursalId === e.sucursal_id)?.agotadoAuto ?? false,
            })),
        ]);
      } catch {
        setError("El producto se guardó, pero no el agotado por sucursal. Vuelve a intentar.");
        setGuardando(false);
        return;
      }
      if (guardarTambien) await guardarTambien();
      setBase(valores);
      if (alGuardar) {
        // Aquí no se navega: el componente sigue montado, así que el botón vuelve a habilitarse.
        setGuardando(false);
        alGuardar();
      } else {
        router.push(destino);
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
    router.push(destino);
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
            <div className="flex items-baseline justify-between gap-2">
              <label className={label} htmlFor="precio">
                Precio
              </label>
              {enMenu && <span className="mb-1.5 truncate text-13 text-ink-2">en {menuCat.nombre}</span>}
            </div>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-2" aria-hidden="true">$</span>
              <input
                id="precio"
                className={`${input} pl-7 tabular-nums`}
                value={precio}
                inputMode="decimal"
                onChange={(e) => setPrecio(limpiarPrecio(e.target.value))}
                disabled={cargando}
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
              disabled={cargando}
              value={!multi && agotado ? "AGOTADO" : enMenu && estado === "ACTIVO" && !seVende ? "NO_SE_VENDE" : estado}
              onChange={(e) => {
                const v = e.target.value;
                setAgotado(v === "AGOTADO");
                if (v === "AGOTADO") {
                  setSeVende(true);
                  return;
                }
                setEstado(v === "PAUSADO" ? "PAUSADO" : "ACTIVO");
                if (enMenu) setSeVende(v !== "NO_SE_VENDE");
              }}
            >
              <option value="ACTIVO">Se vende</option>
              {enMenu && <option value="NO_SE_VENDE">No se vende en este menú</option>}
              {!multi && <option value="AGOTADO">Agotado · se ve en gris y no se puede vender</option>}
              <option value="PAUSADO">
                {enMenu ? "Pausado · no aparece en ningún menú" : multi ? "Pausado · no aparece en ninguna sucursal" : "Pausado · no aparece"}
              </option>
            </select>
          </div>
          <label className="flex min-h-[44px] items-center gap-2.5">
            <input type="checkbox" className="h-5 w-5 accent-ink" checked={!visible} onChange={(e) => setVisible(!e.target.checked)} />
            <span className="text-sm">
              <span className="font-medium">Producto interno</span> <span className="text-ink-2">· no se muestra en la caja</span>
            </span>
          </label>
          {multi && (
            <>
              <AvisoCajasMenu cajas={cajasViejas} />
              <DisponibilidadSucursales
                filas={agotados}
                onCambio={(sucursalId, cambio) =>
                  setAgotados((prev) => prev.map((f) => (f.sucursalId === sucursalId ? { ...f, ...cambio } : f)))
                }
              />
            </>
          )}
          {enMenu && (
            <p className="text-13 text-ink-2">
              {!editar && !menuCat.esGeneral && (
                <>
                  <b className="font-semibold text-ink">Solo se venderá en {menuCat.nombre}.</b>{" "}
                </>
              )}
              El precio y si se vende son de {menuCat.nombre}. El nombre, la categoría y los datos fiscales son del producto y valen
              para todos los menús.
            </p>
          )}
        </fieldset>

        {conFoto && (
          <CampoImagen
            titulo="Foto"
            url={fotoUrl}
            alt={`Foto de ${nombre.trim() || "este producto"}`}
            ajuste="cover"
            textoSubir="Subir foto"
            textoVacio="Sin foto"
            ayuda="La ve tu cliente en la tienda en línea. JPG, PNG o WebP."
            claseAyuda={ayuda}
            bloqueo={idFoto ? undefined : "Guarda el producto para poder subirle foto."}
            trabajando={fotoOcupada}
            apagado={guardando}
            quitar={{ titulo: "¿Quitar la foto?", mensaje: "El producto se queda sin foto en tu tienda en línea." }}
            mensaje={errorFoto && <p className="mt-2 text-sm font-medium text-danger" role="alert">{errorFoto}</p>}
            onSubir={(archivo) => void cambiarFoto((id) => ponerFotoProducto(id, archivo, fotoUrl), "No se pudo subir la foto")}
            onQuitar={() => void cambiarFoto(async (id) => { if (fotoUrl) await quitarFotoProducto(id, fotoUrl); return null; }, "No se pudo quitar la foto")}
          />
        )}

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
          <p className="-mt-1 text-13 text-ink-2">
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

        {menuCat.error && (
          <p className="text-sm font-medium text-danger" role="alert">
            {menuCat.error}
          </p>
        )}
        {error && (
          <p className="text-sm font-medium text-danger" role="alert">
            {error}
          </p>
        )}

        {/* Barra fija abajo: en el celular, "Guardar" siempre a la mano sin bajar hasta el final. */}
        <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-2 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur-sm lg:mx-0 lg:px-0">
          {sucio && !guardando && <span className="mr-auto text-13 text-ink-2" aria-live="polite">Cambios sin guardar</span>}
          <Button variant="ghost" onClick={() => void volver()} disabled={guardando}>
            {editar ? "Volver" : "Cancelar"}
          </Button>
          <Button type="submit" disabled={guardando || cargando}>
            {guardando ? "Guardando…" : editar ? "Guardar cambios" : "Crear producto"}
          </Button>
        </div>
      </div>
      {dialogoConfirmar}
    </form>
  );
}
