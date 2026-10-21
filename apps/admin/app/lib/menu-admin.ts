import type { NombreIcono } from "@vim/ui/styles";
import { puedeVer } from "./acceso";

/**
 * El menú lateral del panel, como árbol (estilo Square): pocos grupos arriba que se despliegan en
 * sus opciones. Es LA navegación del admin: cada página tiene aquí su entrada, y las rutas no
 * cambian (ver docs/superpowers/specs/2026-10-20-admin-menu-tipo-square-design.md).
 *
 * Lo que cada negocio y rol ve lo decide `filtrarMenu` con las mismas reglas de siempre:
 * `puedeVer` (rol), `rutasOcultas` (módulos de operación) y lo que VIM le concedió.
 */
export type Hoja = { tipo: "hoja"; label: string; href: string; claves?: string[]; icon?: NombreIcono };
export type Grupo = { tipo: "grupo"; id: string; label: string; hijos: Nodo[]; icon?: NombreIcono };
export type Nodo = Hoja | Grupo;
export type MenuAdmin = { principal: Nodo[]; canales: Nodo[] };

export type ContextoMenu = {
  /** `null` = el perfil aún carga: no se filtra por rol (el guardián de rutas decide al entrar). */
  jerarquia: number | null;
  /** Rutas que este negocio no usa (módulos) o no tiene concedidas. */
  ocultas: ReadonlySet<string>;
  /** `false` = sin la Tienda contratada: el grupo se vuelve un solo enlace. `null` = leyendo. */
  tiendaContratada: boolean | null;
  /** Ids de los grupos de reportes que el índice enseñaría. `null` = no filtrar. */
  gruposInformes: ReadonlySet<string> | null;
};

const h = (label: string, href: string, claves?: string[]): Hoja => ({ tipo: "hoja", label, href, ...(claves && { claves }) });
const g = (id: string, label: string, hijos: Nodo[], icon?: NombreIcono): Grupo => ({ tipo: "grupo", id, label, hijos, ...(icon && { icon }) });

export const MENU: MenuAdmin = {
  principal: [
    { ...h("Inicio", "/dashboard", ["panel", "pasos"]), icon: "casa" },
    g("menu", "Menú", [
      h("Productos", "/catalogo/productos", ["catalogo", "platillos"]),
      h("Categorías", "/catalogo/categorias"),
      h("Modificadores", "/catalogo/modificadores", ["extras"]),
      h("Combos", "/catalogo/combos", ["paquetes"]),
      h("Recetas", "/catalogo/recetas", ["insumos"]),
      h("Promociones", "/promociones", ["descuento"]),
      h("Importar menú", "/catalogo/importar", ["excel", "subir"]),
    ], "catalogo"),
    g("inventario", "Inventario", [
      h("Existencias", "/inventario", ["insumos", "stock"]),
      h("Compras", "/inventario/compras"),
      h("Proveedores", "/inventario/proveedores"),
      h("Movimientos", "/inventario/movimientos", ["mermas", "ajustes"]),
    ], "caja"),
    g("clientes", "Clientes", [
      h("Directorio", "/clientes", ["clientes"]),
      h("Lealtad", "/lealtad", ["puntos", "premios"]),
      h("Reservaciones", "/reservaciones", ["reservas"]),
    ], "personas"),
    g("informes", "Informes", [
      h("Todos los informes", "/reportes", ["reportes"]),
      h("Qué se vende", "/reportes#que-se-vende", ["ventas"]),
      h("Cómo va la operación", "/reportes#operacion", ["cortes", "corte z"]),
      h("Inventario y costos", "/reportes#inventario-costos", ["margen"]),
      h("Qué vigilar", "/reportes#que-vigilar", ["reimpresiones"]),
      h("Varias sucursales", "/reportes#varias-sucursales", ["consolidado"]),
    ], "grafica"),
    g("personal", "Personal", [
      h("Usuarios", "/usuarios", ["empleados", "cajeros", "pin"]),
      h("Repartidores", "/usuarios/repartidores"),
      h("Roles y permisos", "/configuracion/roles"),
    ], "persona"),
    g("facturacion", "Facturación", [
      h("Facturas", "/facturacion", ["cfdi", "factura"]),
      h("Datos fiscales", "/configuracion/facturacion", ["sello", "csd", "rfc", "cfdi"]),
    ], "recibo"),
    g("ajustes", "Ajustes", [
      g("mi-negocio", "Mi negocio", [
        h("Datos del negocio", "/configuracion/negocio", ["nombre", "horario", "corte"]),
        h("Cómo vende tu negocio", "/configuracion/operacion", ["giro", "modulos"]),
        h("Sucursales", "/configuracion/sucursales"),
        h("Mesas", "/configuracion/mesas", ["salon", "comedor"]),
        h("Propinas", "/configuracion/propinas"),
        h("Zonas de envío", "/configuracion/envios", ["domicilio", "colonias"]),
        h("Marcas virtuales", "/configuracion/marcas"),
        h("Franquicias", "/configuracion/franquicias"),
      ]),
      g("dispositivos", "Dispositivos", [
        h("Cajas", "/configuracion/cajas", ["punto de cobro", "caja"]),
        h("Conectar computadora", "/configuracion/cajas/descargar", ["descargar", "instalar", "vincular"]),
        h("Estaciones de preparación", "/configuracion/areas", ["cocina", "kds", "areas"]),
        h("Terminal de tarjetas", "/configuracion/terminal", ["mercado pago", "tarjeta"]),
        h("Pantalla del cliente", "/configuracion/pantalla-cliente", ["anuncios"]),
      ]),
      g("cuenta", "Cuenta", [
        h("Plan y pagos", "/configuracion/plan", ["suscripcion"]),
        h("Seguridad", "/configuracion/seguridad", ["contrasena", "2fa"]),
        h("Sincronización", "/configuracion/sincronizacion"),
        h("Notificaciones", "/configuracion/notificaciones", ["avisos"]),
      ]),
    ], "engrane"),
  ],
  canales: [
    g("tienda", "Tienda en línea", [
      h("General", "/tienda", ["pedidos en linea"]),
      h("Pedidos y pagos", "/tienda/pedidos"),
      h("Sucursales y horarios", "/tienda/sucursales"),
      h("Menú", "/tienda/menu"),
    ], "bolsa"),
    g("delivery", "Apps de delivery", [
      h("Conexión", "/configuracion/integraciones", ["uber", "rappi", "didi"]),
      h("Conciliación", "/conciliacion", ["depositos"]),
    ], "moto"),
  ],
};

const sinAncla = (href: string) => href.split("#")[0]!;
const ancla = (href: string) => href.split("#")[1];

function filtrarNodos(nodos: Nodo[], ctx: ContextoMenu): Nodo[] {
  return nodos.flatMap((n): Nodo[] => {
    if (n.tipo === "grupo") {
      if (n.id === "tienda" && ctx.tiendaContratada === false) {
        return filtrarNodos([{ tipo: "hoja", label: n.label, href: "/tienda", icon: n.icon }], ctx);
      }
      const hijos = filtrarNodos(n.hijos, ctx);
      return hijos.length > 0 ? [{ ...n, hijos }] : [];
    }
    const ruta = sinAncla(n.href);
    if (ctx.ocultas.has(ruta)) return [];
    if (ctx.jerarquia !== null && !puedeVer(ctx.jerarquia, ruta)) return [];
    const a = ancla(n.href);
    if (a && ctx.gruposInformes && !ctx.gruposInformes.has(a)) return [];
    return [n];
  });
}

export function filtrarMenu(menu: MenuAdmin, ctx: ContextoMenu): MenuAdmin {
  return { principal: filtrarNodos(menu.principal, ctx), canales: filtrarNodos(menu.canales, ctx) };
}

/** Todas las hojas con sus ancestros (ids y etiquetas). */
function aplanar(nodos: Nodo[], ids: string[] = [], etiquetas: string[] = []): { hoja: Hoja; ids: string[]; etiquetas: string[] }[] {
  return nodos.flatMap((n) => (n.tipo === "hoja"
    ? [{ hoja: n, ids, etiquetas }]
    : aplanar(n.hijos, [...ids, n.id], [...etiquetas, n.label])));
}
const todas = (menu: MenuAdmin) => [...aplanar(menu.principal), ...aplanar(menu.canales)];

/** La hoja que marca la ruta actual. Gana el href más largo, para que una subruta con entrada
 *  propia (`/configuracion/cajas/descargar`) no quede marcada como su padre. Las anclas de Informes
 *  no cuentan: `/reportes` marca "Todos los informes". */
export function rutaActiva(menu: MenuAdmin, pathname: string): string | null {
  const candidatas = todas(menu)
    .map(({ hoja }) => hoja.href)
    .filter((href) => !ancla(href) && (pathname === href || pathname.startsWith(href + "/")))
    .sort((a, b) => b.length - a.length);
  return candidatas[0] ?? null;
}

/** Ids de los grupos que hay que desplegar para enseñar esa hoja. */
export function caminoDe(menu: MenuAdmin, href: string | null): string[] {
  return todas(menu).find(({ hoja }) => hoja.href === href)?.ids ?? [];
}

const normalizar = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

/** Busca por etiqueta y por claves, sin acentos ni mayúsculas. Solo el menú, no datos del negocio. */
export function buscarEnMenu(menu: MenuAdmin, texto: string): { label: string; href: string; ruta: string[] }[] {
  const q = normalizar(texto);
  if (!q) return [];
  return todas(menu)
    .filter(({ hoja }) => [hoja.label, ...(hoja.claves ?? [])].some((t) => normalizar(t).includes(q)))
    .map(({ hoja, etiquetas }) => ({ label: hoja.label, href: hoja.href, ruta: etiquetas }));
}
