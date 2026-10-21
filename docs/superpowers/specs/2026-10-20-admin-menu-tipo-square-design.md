# Admin: menú desplegable e inicio con pasos (estilo Square)

Fecha: 20 oct 2026 · Rama local `feat/admin-menu` (worktree `C:/vwtAdm`) · **Sin push, PR ni
producción hasta que Fermín lo diga.**

## Por qué

Fermín siente que el panel del dueño (`apps/admin`) "no es tan eficiente y no es tan sencillo de
entender para una persona que lo verá por primera vez". Esa persona es **el dueño que se registra
solo y configura su negocio sin que nadie le explique**.

Fermín usa el panel de Square (lo revisamos juntos en una cuenta de abarrotes y en la de
Knock-out Burger) y le gustan su distribución y sus menús. Lo que hace fácil a Square para alguien
nuevo:

1. **Todo se encuentra desde el mismo menú lateral.** Pocas secciones arriba; cada una se despliega
   ahí mismo en sus opciones (hasta tres niveles), y al abrir una se cierra la otra.
2. **El inicio dice qué hacer primero**: «Configura tu negocio para empezar a vender — Completaste
   N de M pasos», con una tarjeta por paso, un botón por tarjeta y el siguiente marcado.

Hoy nuestro admin tiene 13 secciones planas sin submenús visibles; cada sección arma su propia
sub-navegación dentro de la página (pestañas en Catálogo, Lealtad, Tienda y Envíos; una columna de
20 opciones en Configuración), y hay páginas a las que solo se llega sabiendo que existen (Compras,
Proveedores, Movimientos, Repartidores, Importar menú, Conectar computadora). Los pasos de
configuración viven en `/bienvenida`, una página aparte con un enlace desde el inicio.

Boceto aprobado por Fermín: menú agrupado y desplegable + inicio con las tarjetas de pasos, más dos
ajustes que salieron de ver la cuenta de comida (grupo **Dispositivos** dentro de Ajustes; el bloque
de pasos desaparece al terminar).

## Metas

- Un dueño nuevo encuentra cualquier página del admin desde el menú lateral, sin conocerla antes.
- Al entrar por primera vez, el inicio le dice qué sigue y lo lleva ahí con un botón.
- Menos lugares donde vive la navegación: el menú lateral es *la* navegación.

## No-metas

- **No** es un rediseño visual. Colores, tipografía, espaciado e iconos salen de
  `packages/ui/tokens.css` y `docs/diseno/` como hoy. Square inspira la *estructura*, no el aspecto.
- **No** cambian las URLs. Cada página conserva su ruta (`/catalogo/productos`,
  `/configuracion/cajas`…): enlaces, marcadores, correos y el guardián de rutas siguen sirviendo.
- **No** se agregan funciones nuevas al negocio (nada de "Aceptar pago", kiosco, etc.).
- **No** se tocan permisos: rol, módulos de operación (ADR 0034) y plan (ADR 0014) se respetan igual.

## Anti-metas (sería un fracaso aunque funcione)

- Que alguien con un rol o giro que hoy no ve una sección la vea después.
- Que una página quede huérfana: sin entrada en el menú y sin forma de llegar.
- Que el menú, desplegado, se vuelva más largo y confuso que el de hoy.
- Que el admin en celular quede peor que hoy.

## El menú nuevo

Arriba, como en Square: el nombre del negocio con la línea de sucursal que ya existe (lo que hoy es
la tarjeta "1 de N sucursales"; **solo texto, no es un selector global** — la sucursal se sigue
eligiendo dentro de cada página como hoy) y un **buscador** del menú. Luego los grupos. Una línea separa los canales de
venta al final. Abajo queda el pie actual (Ayuda por WhatsApp, persona, rol, salir).

Mapa completo (→ ruta actual, que no cambia). *Cursiva* = hoy no tiene entrada visible.

1. **Inicio** → `/dashboard` (sin submenú; es un enlace directo)
2. **Menú**
   - Productos → `/catalogo/productos`
   - Categorías → `/catalogo/categorias`
   - Modificadores → `/catalogo/modificadores`
   - Combos → `/catalogo/combos`
   - Recetas → `/catalogo/recetas` (etiqueta "Plan Negocio" como hoy)
   - Promociones → `/promociones`
   - *Importar menú* → `/catalogo/importar`
3. **Inventario** (etiqueta "Plan Negocio" como hoy)
   - Existencias → `/inventario`
   - *Compras* → `/inventario/compras`
   - *Proveedores* → `/inventario/proveedores`
   - *Movimientos* → `/inventario/movimientos`
4. **Clientes**
   - Directorio → `/clientes`
   - Lealtad → `/lealtad` (sus pestañas Programa / Premios / Movimientos se quedan dentro de la página)
   - Reservaciones → `/reservaciones`
5. **Informes** — el submenú son los grupos del índice actual de reportes:
   - Todos los informes → `/reportes`
   - Qué se vende · Cómo va la operación · Inventario y costos · Qué vigilar · Varias sucursales →
     `/reportes#<grupo>` (el índice salta a ese grupo). Los 15 reportes siguen en el índice, no en el menú.
   - El submenú **muestra solo los grupos que el índice mostraría** a ese negocio y rol (mismo filtro
     que `reportes/page.tsx`: módulos de `leerReportesDisponibles()` y jerarquía por reporte). Un
     Supervisor o un negocio de una sucursal no ve "Inventario y costos" / "Varias sucursales".
6. **Personal**
   - Usuarios → `/usuarios`
   - *Repartidores* → `/usuarios/repartidores`
   - Roles y permisos → `/configuracion/roles`
7. **Facturación**
   - Facturas → `/facturacion`
   - Datos fiscales → `/configuracion/facturacion`
8. **Ajustes** (tercer nivel, como "Cuenta y configuración" / "Administración de dispositivos" de Square)
   - **Mi negocio**: Datos del negocio `/configuracion/negocio` · Cómo vende tu negocio
     `/configuracion/operacion` · Sucursales `/configuracion/sucursales` · Mesas
     `/configuracion/mesas` · Propinas `/configuracion/propinas` · Zonas de envío
     `/configuracion/envios` · Marcas virtuales `/configuracion/marcas` · Franquicias
     `/configuracion/franquicias`
   - **Dispositivos**: Cajas `/configuracion/cajas` · *Conectar computadora*
     `/configuracion/cajas/descargar` · Estaciones de preparación `/configuracion/areas` · Terminal
     de tarjetas `/configuracion/terminal` · Pantalla del cliente `/configuracion/pantalla-cliente`
   - **Cuenta**: Plan y pagos `/configuracion/plan` · Seguridad `/configuracion/seguridad` ·
     Sincronización `/configuracion/sincronizacion` · Notificaciones `/configuracion/notificaciones`

— separador —

9. **Tienda en línea**: General `/tienda` · Pedidos y pagos `/tienda/pedidos` · Sucursales y horarios
   `/tienda/sucursales` · Menú `/tienda/menu`
10. **Apps de delivery**: Conexión `/configuracion/integraciones` · Conciliación `/conciliacion`
    - Sin el complemento `delivery_apps` solo se oculta **Conexión**, como hoy. Conciliación se sigue
      viendo (hoy la ve cualquiera con jerarquía ≥ 3), así que el grupo queda con una opción.

Tienda sin contratar: el layout de `/tienda` ya cambia todas sus páginas por `TiendaSinContratar`;
en ese estado el grupo se reduce a **un solo enlace** "Tienda en línea" → `/tienda`, sin submenú.

`Envíos › Colonias` (`/configuracion/envios/colonias`) es pestaña dentro de Zonas de envío y no
lleva entrada propia. El callback `/integraciones/mercado-pago/callback` vive fuera de `/configuracion`.

Rutas que siguen sin entrada en el menú, a propósito: `/bienvenida` (ver abajo), `/configuracion/cfdi`,
`/configuracion/fiscal`, los callbacks de Mercado Pago y Uber, y las páginas `nuevo` / `[id]` (el
elemento padre queda marcado como activo).

### Comportamiento

- Tocar un grupo **lo despliega o lo pliega; no navega**. Abrir uno cierra el hermano abierto del
  mismo nivel (acordeón, como Square).
- Al cargar cualquier página, el grupo (y subgrupo) que contiene la ruta actual aparece desplegado y
  el elemento activo marcado. La regla de "activo" sigue siendo por prefijo, y gana el más largo
  (para que `/configuracion/cajas/descargar` marque *Conectar computadora* y no *Cajas*).
- Un grupo cuyas opciones quedan todas ocultas para este negocio/rol desaparece entero. Si le queda
  una sola opción, sigue siendo grupo (consistencia) — *decisión del constructor si se ve mejor como enlace directo*.
- **Buscador**: filtra las opciones del menú mientras escribes (por etiqueta y por unas cuantas
  palabras clave por opción, p. ej. Cajas ↔ "punto de cobro"; Datos fiscales ↔ "sello", "CSD").
  Muestra los resultados como lista plana con su ruta ("Ajustes › Dispositivos › Cajas"). Solo busca
  en el menú, no en datos del negocio. Enter abre el primer resultado; Esc limpia.
- Celular: el mismo menú dentro del cajón actual (debajo de `lg`); todo lo demás del cajón se queda
  igual (Esc, velo, 44 px, safe-area, cierre al navegar).
- Teclado y lector de pantalla: grupos como botones con `aria-expanded`; elemento activo con
  `aria-current="page"`.

### Qué pasa con las sub-navegaciones dentro de las páginas

Lo que ahora está en el menú deja de repetirse dentro de la página:

- **Se retiran** `config-sidenav.tsx` (columna de Configuración) y `catalogo-tabs.tsx` (pestañas del
  catálogo).
- **Se retiran** las pestañas de la Tienda en `tienda/marco.tsx` (el resto del marco —encabezado,
  solo lectura, diálogos— se queda).
- **Se quedan** las pestañas de Lealtad y de Envíos (Zonas / Colonias): son partes de *una* opción del
  menú, no opciones hermanas.
- `/catalogo` a secas conserva su redirección de hoy (`/catalogo/categorias`); `/configuracion` a
  secas va a `/configuracion/negocio`.
- La tarjeta de enlaces internos de Inventario (hacia Compras/Proveedores/Movimientos) puede quedarse
  o irse; decisión del constructor.

## El inicio con pasos

- **Quién lo ve:** solo jerarquía ≥ 4 (Dueño y Administrador). Todos los pasos llevan a páginas que
  piden 4; un Supervisor solo vería tarjetas que terminan en "Sin acceso".
- **Fase del alta (`fase` del tenant) — se conserva tal cual.** Hoy `/bienvenida` es lo único que la
  mueve: `INVITADO → EN_CONFIGURACION` al primer ingreso, y `GO_LIVE` con el botón «Terminar
  configuración». `apps/platform` la lee (alerta "Alta estancada", "Marcar en operación",
  ABANDONADO). Esas dos escrituras se mudan al inicio:
  - la primera vez que un Dueño/Administrador ve el bloque, pasa de `INVITADO` a `EN_CONFIGURACION`;
  - cuando los obligatorios están completos, el bloque cambia a «Tu negocio está listo para vender»
    con el botón **Terminar configuración**, que marca `GO_LIVE` igual que hoy.
  - Mostrar u ocultar el bloque se decide por **`fase !== "GO_LIVE"`**, como el aviso de hoy, no por
    los pasos: así un negocio que ya está en operación no vuelve a ver los pasos.
- Arriba del panel actual (`/dashboard`), mientras falten pasos: **«Configura tu negocio para empezar
  a vender»**, "Completaste N de 6 pasos", una barra de avance y una **tarjeta por paso**.
- Los pasos y su cálculo de "completo" son **los de hoy**, sin cambios: `lib/onboarding.ts` (Datos
  del negocio, Tu menú, Tu caja, Conecta la computadora de tu caja, Tu equipo, Facturación opcional).
- Cada tarjeta: icono, título, la descripción de una línea que ya existe, y un botón que lleva a su
  `href`. El primer paso incompleto lleva la marca **SIGUIENTE** y su botón es el principal; los
  demás botones son secundarios. Los completos se ven apagados con "✓ Listo".
- **Ignorar**: solo en el paso opcional (Facturación). Los obligatorios no se pueden ignorar.
  Ignorar se recuerda por negocio en el navegador (`localStorage`, con try/catch) — basta para
  quitarlo de la vista; no es un dato que deba ir a la base.
- El bloque desaparece al pasar a `GO_LIVE` (con el botón de arriba, o si Plataforma marca "en operación").
- `/bienvenida` redirige a `/dashboard`. Todo lo que hoy enlaza a `/bienvenida` (correo de
  confirmación, registro, avisos) llega así al inicio con los pasos.
- El resto del inicio (KPIs, ventas por hora, top productos, franja de caja, accesos rápidos, avisos)
  no cambia. Con el bloque de pasos visible, el estado vacío "Aún no hay ventas" puede reducirse para
  no competir — decisión del constructor.

## Restricciones

- Next.js App Router existente en `apps/admin`; componentes y tokens de `@vim/ui`. Sin dependencias nuevas.
- Permisos: el menú se sigue filtrando con lo mismo que hoy — `lib/acceso.ts` (`MIN_JERARQUIA`, rol)
  y `lib/operacion.ts` (`rutasOcultas` / `filtrarSecciones`, ADR 0034), y "Apps de delivery" se
  oculta sin el complemento `delivery_apps` (hoy en `configuracion/layout.tsx`; al retirar el
  sidenav, esa regla tiene que llegar al menú). Ojo: algunas rutas de `/configuracion/*` piden hoy la
  jerarquía de Configuración (4); Roles y Datos fiscales siguen pidiendo lo mismo aunque cambien de
  grupo.
- Las etiquetas "Plan Negocio" y las pantallas de "no contratado" de Tienda/Lealtad se comportan
  igual que hoy.
- Leer `docs/diseno/admin.md` antes de tocar UI y actualizarlo con la nueva navegación (la
  navegación es parte del diseño, y `docs/diseno/` manda). Cargar las skills de diseño del proyecto
  (Emil Kowalski antes de escribir CSS; ponytail antes de escribir código).
- Se trabaja y verifica **en local** (dev server del admin contra Supabase local, entrando sin
  contraseña como dice la memoria del rediseño del admin). Nada de push, PR, merge ni despliegue.
- Comprobación de tipos con `tsc --noEmit`, no con `next build` (comparte `.next` con el dev server).

## Lo que queda al constructor

- La estructura de datos del menú (un árbol en un archivo, o lo que sea más simple) y cómo se
  reparte entre `admin-shell.tsx` y componentes nuevos.
- Las palabras clave exactas del buscador.
- Animación del despliegue (si la hay, corta y respetando `prefers-reduced-motion`).
- Iconos de los grupos nuevos (del set existente de `Icono`).
- Cómo salta `/reportes#<grupo>` (ancla simple basta).

## Cómo sabremos que quedó

- Cada ruta del mapa se abre desde el menú y queda marcada como activa; las páginas `nuevo`/`[id]`
  marcan a su padre.
- Con un rol Supervisor, y con un giro que oculta mesas/reservaciones/envíos, el menú muestra
  exactamente lo que hoy se puede abrir — ni más ni menos.
- Un negocio recién registrado ve el bloque de 6 pasos en el inicio; al completarlos, desaparece.
- En celular (375 px) el menú funciona dentro del cajón sin scroll horizontal.
- Capturas antes/después para que Fermín las revise.
