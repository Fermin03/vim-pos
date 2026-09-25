# Admin (`apps/admin`) — revisión de diseño

**24 sep 2026** · Puntaje **21/40** (catálogo e inventario 21 · reportes y dashboard 22 ·
configuración y acceso 21) · Rutas relativas a `apps/admin/app/` salvo que digan otra cosa.
Contexto y método en [`README.md`](README.md).

## Veredicto

Plantilla de admin genérica y bien ejecutada: barra lateral oscura, tarjetas blancas, encabezados
de tabla en mayúsculas grises, fila de 4 KPIs, filtros segmentados. La marca apenas asoma en los
botones azules y en las cifras en Sora. Lo propio del producto está en las palabras y la lógica,
no en la forma: "Sin slots: la caja no lo puede vender", el día contable, esperado contra
declarado en los cortes, "No es tu e.firma", la vigencia del sello leída del certificado.

`diseno/admin.md` diseña para "dueño en laptop". Don Beto dando de alta el menú de noche en el
celular quedó cubierto con parches en `globals.css` (inputs de 16 px, 44 px de alto, modales con
`100dvh`), no con el diseño.

## Lo que se repite en todo el admin

- **Hover pegado en el celular** y `Button` sin `:active` (ver [`README.md`](README.md)).
- **Acciones de fila invisibles al teclado:** `lg:opacity-0 group-hover` sin `group-focus-within`
  en `(panel)/catalogo/productos/page.tsx:166`, `catalogo/categorias/page.tsx:178`,
  `catalogo/modificadores/page.tsx:105`, `usuarios/page.tsx:224`, `components/opciones-editor.tsx:143`,
  `configuracion/sucursales/page.tsx:108`, `configuracion/cajas/page.tsx:129`, `configuracion/mesas/page.tsx:138`.
- **Cuatro formas de editar:** en línea bajo la tabla (inventario, clientes, promociones,
  reservaciones), modal, página propia, autoguardado al salir del campo.
- **Cinco formas de confirmar:** `confirm()`, `prompt()`, diálogos artesanales sin Esc ni foco,
  `Modal`, y nada (franquicias).
- **Tokens:** 172 hex fijos en 56 archivos; `success-soft` en 3 variantes, `warning-soft` en 4,
  `danger-soft` en 3; `border-line-soft` no existe en el preset y cae al gris de Tailwind
  (`#E5E7EB`) en 6 lugares; `StatusChip` 0 usos; 22 tamaños de letra (13 px ×177, 11.5 ×146,
  12.5 ×127); cinco estilos de checkbox.
- **Contraste:** `ink-3` 3.3:1 en encabezados de tabla, ayudas, "vs ayer" y ejes de gráfica;
  texto de la barra lateral `#76767E` sobre `ink` 4.0:1 a 10.5-11.5 px (`components/admin-shell.tsx:256, 268, 301`).
- **Fechas ISO crudas** y tres formateadores de pesos (`fmt`, `fmtMxn`, `mxn`).
- **Sin `<main>`** en el shell (`components/admin-shell.tsx:318`); mensajes de éxito sin `aria-live`.
- **Documento contra código:** `diseno/admin.md:71` pide 36-40 px en el admin; `Button` e inputs
  miden 44 px y no hay tamaño `sm`.

---

## Bloque 1 · Catálogo, inventario, clientes, promociones, reservaciones, usuarios

### Heurísticas — 21/40

| # | Heurística | Nota | Motivo |
|---|---|---|---|
| 1 | Estado | 2 | "Guardando…" funciona; los editores aparecen bajo el pliegue sin aviso, el autoguardado no avisa, el éxito dura 2.5 s |
| 2 | Mundo real | 2 | Jerga: slot, delta, default, "Neutro (categórico)", "Elige entre N y M", factor, emparejado, "rebanadas de F4" |
| 3 | Control | 2 | Borrado suave sin deshacer; cambiar rol y "No llegó" de un toque; sin aviso de cambios sin guardar |
| 4 | Consistencia | 1 | 4 anatomías de tabla, 4 patrones de editor, 5 de confirmación, 3 estilos de acción por fila |
| 5 | Prevención | 2 | Aciertos (fechas con tope, combo que nace pausado); la promo se corre 6 h, precios aceptan "1.2.3" |
| 6 | Reconocer | 2 | Acciones solo ícono y ocultas; la explicación de "crítico" y "factor" lejos de su columna |
| 7 | Eficiencia | 2 | Búsqueda, filtros, asignación masiva; sin ordenar columnas, sin acciones masivas en productos, sin duplicar, sin reordenar |
| 8 | Estética | 3 | Sobrio con un acento; párrafos de ayuda permanentes y KPIs que repiten los filtros |
| 9 | Errores | 2 | `lib/errores.ts` ejemplar; zod muestra solo el primer error, al final; error de red como "no encontrado" |
| 10 | Ayuda | 3 | Mucha ayuda en contexto (IVA, estación, precio del combo) |

**Carga cognitiva — fallan 5 de 8:** foco único (combo [id] junta formulario, slots y vista
previa con tres formas de guardar), bloques ≤4 (`ProductoForm` con 13 campos + fiscal), una cosa a
la vez (editores bajo la lista), memoria de trabajo (explicaciones bajo el botón, vista previa del
combo al fondo), revelación progresiva (marca virtual, estación, código y fiscal siempre visibles).

**Fortalezas:** texto que nombra consecuencias (aviso de unidades en `(panel)/inventario/page.tsx:217-227`,
anulación de compra en `inventario/compras/[id]/page.tsx:97`); primitivas compartidas que
resolvieron lo difícil (`Modal` con trampa de foco y Esc, `packages/ui/src/components/modal.tsx:58-107`);
dinero con disciplina (Sora, `tabular-nums`, alineado a la derecha; bajo en ámbar y agotado en rojo).

### Problemas prioritarios

**[P1] Cuatro formas de editar y cinco de confirmar**
- Editor en línea bajo la tabla y la paginación: `(panel)/inventario/page.tsx:363`, `clientes/page.tsx:306`, `promociones/page.tsx:200`, `reservaciones/page.tsx:157`. Al pulsar "Editar" en la fila 1 no se ve nada.
- Diálogos artesanales sin Esc ni trampa de foco: `inventario/page.tsx:468`, `inventario/proveedores/page.tsx:104`, `inventario/compras/[id]/page.tsx:94`.
- `confirm()`/`prompt()` nativos en 6 lugares (insumo, cliente, promo, proveedor, apagar descuento, cancelar reservación en `reservaciones/page.tsx:148`).
- **Arreglo:** un solo `Modal` (cajón lateral en lg, hoja completa en móvil) para las entidades cortas; `ConfirmarPeligro` compartido; borrar las 3 implementaciones artesanales.

**[P1] El celular se rompe en el alta del menú**
- Tabla de opciones del combo con `overflow-hidden` (`components/combo-slots-editor.tsx:437`) y columnas fijas de 426 px (`:225-229`): se cortan "Incluido" y "Quitar".
- Fila de color e ícono sin envolver en el modal de categoría (`components/modal-categoria.tsx:115`).
- Modales `w-[440px]`/`w-[420px]` fijos en repartidores (`usuarios/repartidores/page.tsx:215, 274`), tabla sin contenedor de scroll (`:141`).
- Nueva compra es una tabla de inputs de 1000 px (`inventario/compras/nueva/page.tsx:202`). Importar solo acepta pegar CSV.
- **Arreglo:** tarjetas por debajo de lg en tablas editables, `flex-wrap`, `w-full max-w-[440px]`, `TablaScroll`, subir `.csv`/`.xlsx`.

**[P1] Jerga y texto de desarrollo en el constructor del menú**
- "Slot", "Delta", "Default", "Solo el delta de la opción" (`components/combo-slots-editor.tsx:30, 226-227`, `lib/combos.ts:7`); "Neutro (categórico)", "Elige entre N y M" (`lib/modificadores.ts:9, 17`).
- "…(rebanadas siguientes de F4)" (`components/producto-form.tsx:315-318`), además falso: la estación ya se configura arriba.
- IVA contradictorio: la opción dice "0% · alimentos para llevar" (`:276`) y la ayuda "0 solo aplica a no preparados" (`:280`).
- **Arreglo:** slot → "paso", Delta → "Cuesta de más", Default → "Preseleccionada"; explicar u ocultar "Naturaleza"; borrar el párrafo de F4; alinear el IVA con el contador.

**[P1] Páginas con varios guardados y sin foco**
- En `productos/[id]`, "Guardar cambios" navega fuera (`components/producto-form.tsx:100`) y descarta los modificadores marcados abajo (`components/producto-modificadores.tsx:91`).
- Combos mezcla guardado explícito, en modal y autoguardado al salir del campo (`components/combo-slots-editor.tsx:251`); la vista previa del precio —lo esencial según `admin.md`— está al fondo (`catalogo/combos/[id]/page.tsx:45`); "Cancelar" dentro del combo lleva a Productos (`producto-form.tsx:327`).
- En grupos, "Guardar cambios" sale a la lista aunque abajo quedan las opciones (`components/grupo-form.tsx:55`).
- **Arreglo:** un modelo de guardado por página (autoguardado con "Guardado ✓" o barra fija); vista previa fija a la derecha en lg; prop `volverA`; aviso de cambios sin guardar.

**[P1] Accesibilidad**
- Acciones de fila invisibles al teclado (ver arriba). Filas de combos que solo abren con mouse (`<tr onClick>`, `catalogo/combos/page.tsx:124`).
- Interruptores sin nombre accesible (`catalogo/combos/page.tsx:89`, `inventario/page.tsx:236`); búsquedas sin etiqueta (productos:98, categorías:101, usuarios:150, clientes:215); radios y checkboxes del combo que no dicen de qué producto son (`components/combo-slots-editor.tsx:255-271`).

**[P1] Fechas y números**
- Promociones: la vigencia se corre 6 h en cada edición (`promociones/page.tsx:177` + `lib/promociones.ts:89`) — ver [`README.md`](README.md).
- Stock con 1, 2 y 3 decimales en la misma columna: 12.41 L, 9.7 kg, 2.535 kg (`inventario/page.tsx:319`), contra `admin.md`.
- Precios aceptan "1.2.3" (`components/producto-form.tsx:154`).
- "Registrar compra" se deshabilita sin decir por qué; el mensaje de `:147` nunca se muestra (`inventario/compras/nueva/page.tsx:263`).

**[P2] Controles prometidos que no existen, y roles que se contradicen**
- Categorías dice "El orden define cómo aparecen en el POS" (`catalogo/categorias/page.tsx:81`) pero no se puede reordenar.
- KPI "Bloqueados · requieren desbloqueo" (`usuarios/page.tsx:131`) sin forma de encontrarlos.
- Placeholder "Happy hour 2x1" (`promociones/page.tsx:206`) sin tipo 2x1 ni alcance por producto.
- "Nuevo usuario" ofrece el rol Repartidor "si va a usar el sistema" (`components/modal-nuevo-usuario.tsx:15`); Repartidores dice que no usan el sistema (`usuarios/repartidores/page.tsx:115-119`); "Cambiar rol" quita Repartidor y agrega Personalizado (`lib/usuarios.ts:24`).

### Páginas

| Página | Nota | Problema principal |
|---|---|---|
| Shell y barra lateral | regular | Íconos repetidos, hex fijos, texto a 4.0:1, tarjeta de sucursal que parece selector y no lo es, sin `<main>` |
| `catalogo` | bien | Solo redirige |
| `catalogo/categorias` | regular | Promete un orden que no se puede cambiar; el modal de color e ícono se desborda en móvil |
| `catalogo/productos` | regular | Acciones invisibles al teclado; filas de ~60 px contra 40 del doc |
| `catalogo/productos/nuevo` | regular | 13 campos + fiscal de golpe; "rebanadas de F4"; IVA contradictorio |
| `catalogo/productos/[id]` | **mal** | "Guardar cambios" sale y pierde los modificadores |
| `catalogo/combos` | regular | Filas solo con mouse; interruptor sin nombre |
| `catalogo/combos/nuevo` | bien | Explica bien que nace pausado |
| `catalogo/combos/[id]` | **mal** | Tres modelos de guardado, jerga, tabla recortada en móvil, vista previa al fondo |
| `catalogo/modificadores` | regular | Acciones ocultas; "grupo(s)" |
| `catalogo/modificadores/nuevo` | regular | "Naturaleza: Neutro (categórico)" sin explicar |
| `catalogo/modificadores/[id]` | regular | Tres secciones y tres guardados; borrar opción sin confirmar |
| `catalogo/recetas` | regular | Otra anatomía de tabla; `border-line-soft` inexistente |
| `catalogo/recetas/[productoId]` | regular | "Crítico" explicado bajo el botón |
| `catalogo/importar` | regular | Solo pegar CSV; sin pestañas; `<Link><Button>` anidado; dos primarios |
| `inventario` | regular | Editor bajo el pliegue; modal artesanal; decimales mezclados |
| `inventario/compras` | regular | No usa `RangoFechas`; fechas ISO; sin totales |
| `inventario/compras/nueva` | regular | Tabla de 1000 px; "Registrar" deshabilitado mudo |
| `inventario/compras/[id]` | bien | Solo el diálogo artesanal |
| `inventario/proveedores` | regular | `confirm()` nativo; inputs sin `type=tel/email` |
| `clientes` | regular | Editor bajo el pliegue; "Bloquear" sin explicar |
| `promociones` | **mal** | Editar corre la vigencia 6 h; "2x1" que no existe; "Agotada" en `danger` |
| `reservaciones` | regular | `prompt()` para cancelar; "Llegó"/"No llegó" de ~30 px pegados y sin deshacer |
| `usuarios` | regular | KPI "Bloqueados" sin salida; rol sin confirmar; doble título |
| `usuarios/repartidores` | regular | Contradice el rol de Usuarios; borrar en azul; modal de 440 px fijo |

---

## Bloque 2 · Dashboard, reportes, facturación, conciliación

### Heurísticas — 22/40

| # | Heurística | Nota | Problema clave |
|---|---|---|---|
| 1 | Estado | 2 | "En vivo" con punto pulsando, pero no se vuelve a pedir nada (`dashboard/page.tsx:136-142, 206-210`); al filtrar la tabla se cambia por "Cargando…"; los atajos de fecha no marcan el activo |
| 2 | Mundo real | 3 | Se cuelan "p95", "(FOLIO_MONTO)", "Sin match", fechas ISO |
| 3 | Control | 2 | Migas que no son enlaces; el rango se reinicia a 30 días en cada reporte; modales de facturación sin Esc |
| 4 | Consistencia | 2 | 6 diseños de tarjeta de cifra, 2 selectores segmentados, 4 estilos de etiqueta de estado, 3 formas de total; nombre en el índice ≠ título en 6 de 15 |
| 5 | Prevención | 3 | `RangoFechas` bloquea futuro y rango invertido y dice por qué; corte silencioso a 200 filas |
| 6 | Reconocer | 2 | El rango no viaja; migas "fantasma" ("Ventas", "Auditoría"); tres entradas del menú con el mismo ícono |
| 7 | Eficiencia | 1 | Sin exportar, imprimir ni ordenar; rango fuera de la URL; sin comparar periodos |
| 8 | Estética | 3 | Limpio; "sin día previo" repetido en 4 tarjetas |
| 9 | Errores | 2 | Sin "Reintentar"; error de factura global en texto neutro (`facturacion/page.tsx:128`) |
| 10 | Ayuda | 2 | Nadie explica el día contable en el filtro, ni "Match %" o "Neto app" |

**Carga cognitiva — fallan 5 de 8:** bloques (6 tarjetas en "Qué se vende"), jerarquía (9 de 15
reportes arrancan con la tabla sin una cifra que conteste la pregunta), opciones (`RangoFechas`
pone 7 controles juntos), memoria (el rango se pierde al cambiar de reporte; en la captura de
conciliación la cabecera dice −$359 y las tarjetas suman $224), revelación (marcas, eventos,
no-shows y consolidado visibles aunque el negocio no use esos módulos).

**Fortalezas:** fechas que no mienten (`hoyContable`, "Volver a hoy", aviso si la caja dejó de
subir ventas, `dashboard:200-259`); `RangoFechas` hecho una vez para 13 reportes
(`components/rango-fechas.tsx:22-26, 60-61, 90-95`); Cortes Z es el mejor reporte ("Cortes con
faltante 0 de 12 · todo cuadrado", filtro "Con diferencia", `reportes/z-historico/page.tsx:66-109`).

### Problemas prioritarios

**[P1] El dashboard no contesta "¿cuadró la caja?" y "En vivo" es falso**
- Sin diferencia de efectivo, turnos cerrados ni cancelaciones, aunque la consulta ya trae `ticketsCancelados`, `descuentos`, `devoluciones` y `tendencia` (`lib/reportes.ts:246`). Sin polling ni Realtime bajo el punto que pulsa (`dashboard:208`).
- **Arreglo:** franja "Caja" (turnos cerrados, diferencia neta con signo, enlace al corte del día) + línea de cancelaciones y descuentos; refrescar cada 60 s o por Realtime, o "Actualizado 21:14 · Actualizar".

**[P1] La gráfica por hora engaña en el eje y no sirve en el celular**
- Solo trae horas con venta y las ordena por número (`lib/reportes.ts:242-244`): de las 15 salta a las 18 como si fueran contiguas y las 0-2 h del día contable quedan antes de las 12. "Promedio/hora" divide solo entre horas con venta.
- Valores solo con hover (`dashboard:91-99`); barras `#DDDDD9` a 1.36:1 (WCAG 1.4.11 pide 3:1); hover en azul de marca, que el núcleo prohíbe en datos (`:94`).
- Por verificar: las barras cuentan solo PAGADO (`lib/reportes.ts:229`) y los combos PAGADO + FACTURADO (`:218`).
- **Arreglo:** eje continuo de apertura a cierre en orden contable con ceros; gris ≥3:1; barras enfocables con `aria-label`; bajo `lg`, lista de "3 mejores horas".

**[P1] Los 15 reportes no comparten plantilla**
- Comparten `PageHeader`, `RangoFechas` y la cadena de clases del encabezado de tabla pegada ~15 veces. Divergen en tarjetas (6 diseños), totales (`tfoot` con raya solo en ventas-categoría; fila en `tbody` en consolidado; frase en apps, descuentos y no-shows; nada en 6), ámbar de atención (`#B26A00` vs token `#9A6B12`).
- **Arreglo:** `<ReporteLayout>` (filtro, 2-4 cifras, tabla, pie), `<Tabla>` configurada por columnas (alineación, formato, total), `<StatTile>`, `StatusChip`. Un nombre por reporte. Seis reportes son la misma consulta "venta por dimensión": evaluar uno solo con selector.

**[P1] La navegación manda a lugares equivocados**
- El acceso "Estado de resultados · Ventas, IVA, descuentos, comisiones" (`dashboard:13`) abre "Consolidado por sucursal", sin IVA ni comisiones.
- Migas sin `href` y con niveles fantasma (`reportes/ventas-producto/page.tsx:29`, `reportes/descuentos/page.tsx:25`); rango fuera de la URL.
- **Arreglo:** reapuntar o renombrar; `href` a "Reportes"; `?desde&hasta`; ocultar reportes de módulos no usados.

**[P1] Contraste del texto secundario** — `ink-3` en encabezados de 11.5 px, "vs ayer", vacíos, ayudas y horas del eje de 10 px (`dashboard:101`); etiquetas `#B26A00` sobre `#FDF3E7` ~3.9:1. En el admin, texto informativo en `ink-2`, o proponer oscurecer `--ink-3` a ~`#6E6E74` (decisión de todo el sistema).

**[P2] Recargar borra la pantalla** — cada filtro hace `setFilas(null)` y todo brinca; la búsqueda por folio consulta en cada tecla (`facturacion:91, 161-166`); sin "Reintentar". Dejar los datos al 50 % con `aria-busy`, esperar 300 ms antes de buscar.

**[P2] Modales de facturación y conciliación**
- `PanelFacturar` y `PanelCancelar` artesanales, sin Esc ni trampa de foco; `PanelCancelar` sin `role="dialog"` (`facturacion:382`); etiquetas como `<span>` (`:319-341`).
- Conciliación repite el título (`conciliacion:127-128, 196-199`), pinta "Conciliada" en verde junto a −$359 y "Sin match", muestra `(FOLIO_MONTO)` crudo (`:242`), filas solo con mouse (`:70`).
- "Cancelar" en la fila cancela un CFDI ante el SAT (`facturacion:199`) y "Cancelar" en el panel solo cierra (`:345`).

**[P2] El color va contra sus reglas** — azul de marca en datos (barra del consolidado `:78`, hover de la gráfica); `danger` para "vendiste menos que ayer" (`dashboard:27`) y "cocina lenta" (`reportes/tiempos-cocina/page.tsx:17`). La paleta `cat-*` no pasa el validador de dataviz (teal ≈ verde ΔE 7.7; verde/vino ΔE 4.6 para deutan; `cat-green`/`cat-blue` = success/info). Si hace falta: `#2E7D52, #6B4FA0, #B5701A, #2C5AA0, #9A3050`.

### Páginas

| Página | Nota | Problema principal |
|---|---|---|
| `dashboard` | regular | No contesta "¿cuadra?", "En vivo" falso, eje que engaña, solo hover |
| `reportes` | regular | Agrupado por pregunta (bien); 14 tarjetas sin filtrar por módulo, nombres ≠ títulos |
| `reportes/apps-externas` | regular | Etiquetas a 3.9:1, total en frase, fechas ISO, 8 columnas |
| `reportes/consolidado` | regular | Barra en azul de marca, ruido con una sucursal, mal enlazado |
| `reportes/descuentos` | regular | Sin total ni % de la venta |
| `reportes/eventos` | regular | Único sin rango de fechas; neto en verde |
| `reportes/modo-servicio` | regular | Decimales mezclados (50 % y 33.3 %), barras redundantes |
| `reportes/no-shows` | regular | Tasa diaria sin línea de tendencia |
| `reportes/reimpresiones` | bien | Umbral explicado; etiqueta con hex propio |
| `reportes/tiempos-cocina` | bien | `danger` para "lento"; "≤15" escrito a mano pese a `OBJETIVO_MIN` |
| `reportes/ventas-area` | regular | Sin total ni % |
| `reportes/ventas-categoria` | bien | La única con fila de totales; unidades sin separador de miles |
| `reportes/ventas-marca` | regular | Sin total; color libre del dato |
| `reportes/ventas-mesero` | regular | Título ≠ índice; sin total |
| `reportes/ventas-producto` | regular | Corte silencioso a 200, sin ordenar, "Ingreso" fuera en móvil |
| `reportes/z-historico` | bien | El mejor; fechas ISO, sin cajero, abre en 30 días |
| `facturacion` | regular | Modales artesanales sin Esc ni etiquetas; búsqueda sin espera |
| `conciliacion` | **mal** | Título duplicado, "Conciliada" en verde con −$359, enum crudo, filas solo con mouse |

---

## Bloque 3 · Acceso, bienvenida y configuración

### Heurísticas — 21/40

| # | Heurística | Nota | Motivo |
|---|---|---|---|
| 1 | Estado | 2 | Solo "Cargando…"; éxitos que se borran a los 2.5 s lejos de la acción (`configuracion/cfdi/page.tsx:299-300`); sin estado "lista para facturar" ni "caja vinculada" |
| 2 | Mundo real | 2 | CFDI excelente; pero "slug", zonas IANA (`configuracion/negocio/page.tsx:13-19`), "Quick Service", "sandbox", VAPID (`notificaciones:155`), claves de BD (`sincronizacion:22-26`) |
| 3 | Control | 2 | La clave del dispositivo se pierde con Esc (`cajas:174`); cambiar de sucursal descarta lo editado (`propinas:40-62`); `recargar()` pisa lo no guardado (`cfdi:115`) |
| 4 | Consistencia | 1 | 3 patrones de acción por fila, 4 de confirmación, 5 estilos de checkbox, 3 fondos de aviso, editor en línea contra modal |
| 5 | Prevención | 2 | Vigencia del sello del `.cer` y aviso bimestral (bien); régimen guardado ≠ visto, regenerar clave sin confirmar, slug editable sin advertencia |
| 6 | Reconocer | 2 | Acciones ocultas hasta hover; facturar pide dos pantallas y cambiar "Modo" |
| 7 | Eficiencia | 2 | Solo Seguridad usa `<form>`: Enter no guarda en ninguna otra pantalla |
| 8 | Estética | 3 | Calmado; Integraciones (5 botones por fila) y la matriz de Roles, densas |
| 9 | Errores | 2 | `lib/errores.ts` bueno; errores de borrado detrás del modal; un problema en verde (`integraciones:128-130 → :211`) |
| 10 | Ayuda | 3 | Ayudas contextuales sobresalientes (sello, periodicidad, estaciones) |

**Carga cognitiva — fallan 5 de 8, 1 parcial:** foco (hasta 4 "Configurar" azules en
`bienvenida:103`; un "Activar" primario por fila en el callback de Uber), bloques (grupo
"Operación" del menú con 10 entradas, `components/config-sidenav.tsx:12-23`), una cosa a la vez
(CFDI mezcla cuatro asuntos con dos formas de guardar), opciones (6 giros en inglés en
`registro:11-18`), memoria (datos fiscales → RFC otra vez en CFDI → sello → Modo → Guardar);
revelación parcial.

**Fortalezas:** `lib/errores.ts` traduce PostgREST y red a español accionable en todas las
pantallas; el texto de CFDI y Fiscal sabe del dominio (vigencia del sello con aviso a 60 días,
`cfdi:210-227`; "No la guardamos", `:259-261`; aviso de que el cambio aplica a facturas nuevas,
`fiscal:75-86`); la lista de bienvenida se marca sola con datos reales (`lib/onboarding.ts:41-58`).

### Problemas prioritarios

**[P0] Regenerar la clave de la caja: un clic, sin confirmación, desde un ícono oculto** ✔
- Botón solo con hover (`configuracion/cajas/page.tsx:129-132`); invalida de inmediato la clave de una caja en uso (`:18-28`); el aviso llega después (`:180-182`); el modal con la clave se cierra con Esc o clic fuera y la clave se pierde (`:174`).
- Es el modo de fallo del incidente de Knock-Out del 8 sep, y vincular la tablet —el primer valor real— hoy es invisible.
- **Arreglo:** columna visible "Dispositivo: vinculado hace 3 min / sin vincular"; si ya hay dispositivo, modal `danger` "La caja X dejará de sincronizar hasta que captures la clave nueva"; el modal de credenciales solo se cierra con "Ya la capturé".

**[P1] Facturar partido en dos pantallas, sin estado "lista para facturar"**
- "Datos fiscales" se marca completo con solo la razón social (`lib/onboarding.ts:44, 57`); sello, RFC (otra vez) y "Modo" viven en otra pantalla, enlazada solo desde la barra lateral; "Modo" arranca en "Pruebas (sandbox)" (`cfdi:23-27, 44`); el subtítulo dice "Conecta tu PAC" (`:145`) aunque el PAC lo pone VIM (`:37-40`).
- **Arreglo:** una sección "Facturación" con 3 pasos (datos ✓, sello ✓, activar facturación real); RFC tomado de los datos fiscales; "Modo" → botón "Activar facturación real" habilitado con sello vigente y confirmación; el paso de bienvenida se completa con sello + ACTIVO.

**[P1] CFDI pierde lo editado** — `subirSello`/`quitarSello` llaman `recargar()` (`cfdi:115, 133`), que reescribe estado, periodicidad, QR y RFC (`:56-62`); el aviso sale al pie (`:299-300`). Refrescar solo `emisor.csd`, que cada tarjeta guarde y avise en sí misma.

**[P1] Fiscal guarda un régimen distinto al que se ve** ✔ — `"612"` por defecto (`fiscal:28, 46`); con RFC de 12 caracteres la lista solo muestra 601/603 (`:97-99`) y se guarda 612. Además "✗ Formato de RFC incompleto" en rojo desde la primera letra (`:148-151`) y un control de persona que parece segmentado pero son `<span>` (`:119-134`). Vaciar el régimen si no está en la lista, `refine` de zod persona×régimen, validar al salir del campo.

**[P1] Callejones sin salida en la primera vez**
- El registro no crea sucursal; el modal de caja ofrece un select vacío (`components/modal-caja.tsx:293-299`); Mesas y Estaciones desactivan "Nueva…" sin decir por qué (`mesas:101, 111`, `areas:285, 304`); el registro manda a `/dashboard`, no a bienvenida (`registro:88`); al terminar, el banner desaparece (`dashboard:151`) y `/bienvenida` queda huérfana; no hay paso "Vincula tu caja".
- **Arreglo:** sucursal predeterminada al registrarse o crearla dentro del modal; registro → `/bienvenida`; paso de vincular; bienvenida accesible hasta GO_LIVE.

**[P2] Destructivas sin patrón** — "¿Eliminar X?" sin consecuencia (`sucursales:147`); "Eliminar" en azul (`areas:392`, `envios:483`); `confirm()` en Marcas, CFDI e Integraciones; Franquicias borra sin confirmar (`franquicias:241`); el error del borrado se pinta detrás del modal abierto (`sucursales:37, 58`, `cajas:62, 83`, `mesas:87, 104`).

**[P2] Tokens y componentes duplicados** — ~40 hex; `#FCF3E6` (cfdi), `#F6EEDD` (cajas, roles, notificaciones, sincronización) y el token casi sin uso; cinco checkboxes (`accent-[#16161A]`, `accent-[#0078C9]`, `accent-accent`, `accent-ink`, nativo); naranja retirado `#E8502E` como color por defecto de marcas (`marcas:19, 48, 109`); la cadena de clases del input copiada en 15 archivos. Componentes `Campo` y `Aviso tono=…`.

**[P2] Accesibilidad** — switch sin nombre (`integraciones:188-194`); matriz de Roles con botones de 24 px y un `title` que no dice qué rol ni qué permiso (`roles:124-135`); input sin etiqueta en Franquicias (`:215`) y select sin etiqueta en Roles (`:160`); éxitos sin `role="status"`; solo Recuperar marca `aria-invalid`; `<Link><Button>` anidados (`bienvenida:102, 119, 129`; callback de Uber `:102, 111, 194`); barra de progreso sin `role="progressbar"` (`bienvenida:80`).

### Personas

- **Jordan (primera vez):** el registro pide "Código del negocio (slug)" antes que el nombre (`registro:114-118`); giros en inglés; Enter no avanza; "Ese correo ya tiene una cuenta. Inicia sesión." sin enlace; "Te faltan 1 pasos" (`bienvenida:124`); vincular la tablet escondido.
- **Don Beto (configurando de noche):** zona horaria IANA; slug editable sin advertir que cambia los folios (`negocio:180-183`); estado como enum crudo (`:107`); `autoComplete="off"` en la contraseña del sello (`cfdi:257`) —Chrome puede autollenar la del panel y el error sería "contraseña incorrecta"—; vigencia del sello en ISO (`:216`); Propinas guarda "10, 15, 2O" como [10, 15] sin avisar (`propinas:64-69`).

### Páginas

| Página | Nota | Problema principal |
|---|---|---|
| Login (`page.tsx`) | bien | El error de Google/Microsoft es texto de desarrollador ("¿El proveedor está habilitado?", `:159, 167`) |
| `registro` | regular | Slug primero, giros en inglés, sin `<form>` |
| `recuperar` | bien | Hex a mano y ✓ en el botón |
| `establecer-acceso` | regular | Enlace vencido manda a "Pídele a VIM" también a quien recupera contraseña (`:83`) |
| `bienvenida` | regular | Huérfana al terminar, sin paso "vincular caja", `Link>Button` |
| `configuracion` | regular | Redirige a Negocio en vez de mostrar un resumen de estado |
| `configuracion/negocio` | regular | Zona IANA; slug sin advertencia |
| `configuracion/fiscal` | **mal** | Régimen guardado ≠ visto; ✗ rojo al escribir |
| `configuracion/cfdi` | **mal** | Sin "lista para facturar"; `recargar()` pisa; sandbox por defecto |
| `configuracion/sucursales` | regular | Borrar sin consecuencia; error tras el modal |
| `configuracion/cajas` | **mal** | Regenerar clave sin confirmar; la clave se pierde con Esc |
| `configuracion/mesas` | regular | "Ocupada" en rojo (`:26`); "Nueva mesa" deshabilitado mudo |
| `configuracion/areas` | regular | "Eliminar" en azul; modal se desborda en móvil (`:356, 384`) |
| `configuracion/propinas` | regular | Porcentajes en texto libre, lo inválido se descarta sin avisar |
| `configuracion/envios` | regular | "Eliminar" en azul; costo alineado a la izquierda (`:344, 353`) |
| `configuracion/marcas` | regular | Editor abajo sin mover el foco; naranja viejo por defecto |
| `configuracion/franquicias` | **mal** | Borra sin confirmar; input sin etiqueta |
| `configuracion/integraciones` | regular | Switch sin nombre; un problema sale en verde |
| `configuracion/integraciones/uber/callback` | regular | Términos debajo de los botones deshabilitados (`:172, 185-191`) |
| `configuracion/roles` | regular | Objetivos de 24 px; cambios al instante; fragmento sin `key` (`:109`) |
| `configuracion/seguridad` | bien | Sin migas; no pide la contraseña actual (`:249`) |
| `configuracion/sincronizacion` | regular | Claves crudas de BD; ¿sigue viva con el outbox congelado? |
| `configuracion/notificaciones` | regular | "Enviar prueba" nunca confirma (`:134-137, 181`); jerga VAPID |

---

## Movimiento (Emil Kowalski)

| Antes | Después | Por qué |
|---|---|---|
| `hover:` sin restricción en todo el admin (Tailwind 3.4) | `future: { hoverOnlyWhenSupported: true }` en el preset | En el celular la fila tocada se queda en `bg-hover` y el bote de basura en rojo |
| `Button` con `transition-colors` y sin `:active` (`packages/ui/src/components/button.tsx:14`) | `transition-[background-color,color,transform] duration-150 active:scale-[0.97]` | "Guardar" y "Cargar sello" no se sienten |
| Barra de progreso `transition-all` sobre `width` (`bienvenida/page.tsx:81`) | Ancho completo con `scaleX(pct)`, `origin-left`, `transform 300ms cubic-bezier(.23,1,.32,1)` | Animar el ancho fuerza layout |
| Perilla del switch cambia `left` bajo `transition-transform` (`integraciones:193`, `catalogo/combos/page.tsx:94`, `inventario/page.tsx:241`) | `left-0.5` fijo + `translate-x-5`, 150 ms | Hoy salta sin animar |
| Cajón móvil `duration-200 ease-out` (`components/admin-shell.tsx:232`) | 240 ms `cubic-bezier(.32,.72,0,1)`, salida 180 ms, `motion-reduce:transition-none` | Curva de cajón; salida más rápida |
| `vim-pop` sin versión reducida (`packages/ui/src/components/modal.tsx:114, 125, 164`) | `motion-reduce:animate-[vim-fade_.18s_ease]` | Se quita el desplazamiento, se conserva la opacidad |
| Diálogos artesanales sin entrada (`inventario/page.tsx:468`, `proveedores:104`, `compras/[id]:94`, `facturacion:297, 382`) | Usar `Modal` | Unos modales entran animados y otros no |
| Acciones reveladas solo con `group-hover` | `lg:group-focus-within:opacity-100`, `duration-100` | Con teclado el foco cae en algo invisible |
| `transition` genérico en ~40 controles (`catalogo/productos/page.tsx:112, 171`; `page.tsx:80`; `areas:333`) | `transition-colors` o `transition-[border-color,box-shadow] duration-150` | Declarar propiedades exactas |
| Éxito como `<p>` que empuja la tabla y se borra a los 2.5 s (`catalogo/combos/page.tsx:79`, `inventario/page.tsx:230`, `clientes/page.tsx:170`, `negocio:201`, `fiscal:216`, `cfdi:300`) | Toast fijo con `aria-live`, entrada `translateY(8px)` + opacidad 200 ms, 4-5 s | Sin salto de layout; 2.5 s no alcanzan para leer |
| "Cargando…" reemplaza la tabla (~20 lugares) | Datos previos a `opacity:.5` 150 ms + `aria-busy`, o filas esqueleto de alto fijo | Estabilidad y velocidad percibida |
| Menú de sugerencias del combo aparece de golpe (`components/combo-slots-editor.tsx:416`) | Opacidad + `scale(.97)` con `transform-origin: top`, 150 ms | Un desplegable nace de su disparador |
| Barra de la gráfica con `group-hover:bg-accent` y tooltip solo con hover (`dashboard:94, 97`) | Hover solo con puntero fino; tooltip también con `:focus-within`, 125 ms desde `translateY(2px) scale(.97)`, instantáneo entre barras vecinas | Hover pegado en táctil y azul de marca en datos |
| `animate-pulse` infinito en "En vivo" (`dashboard:208`) | Solo si hay polling real; `none` con movimiento reducido | Movimiento perpetuo que afirma algo falso |
| Tarjetas de reportes y accesos con `hover:shadow` y sin `:active` (`reportes/page.tsx:80`, `dashboard:376`) | Hover con puntero fino; `:active { scale(.98) }` 120 ms | Al tocar no hay respuesta |
| Atajos de fecha sin estado (`components/rango-fechas.tsx:79-86`) | `aria-pressed` + estilo seleccionado + `active:scale-[.97]` | No confirma cuál está activo |
| "Copiar" → "Copiado ✓" cambia el ancho (`configuracion/cajas/page.tsx:204`) | Ancho fijo, cruce de opacidad del ícono 150 ms | El botón baila; y el mensaje sale aunque `clipboard` falle |
| Filtro segmentado de productos (`catalogo/productos/page.tsx:112`) | **Dejarlo instantáneo** | Se usa decenas de veces al día |

## Observaciones menores

1. Íconos repetidos en la barra lateral: Catálogo = Promociones, Clientes = Reservaciones, Conciliación = Facturación = Reportes (`components/admin-shell.tsx:41-55`); la tarjeta de sucursal parece selector y no hace nada (`:250`).
2. Migas inconsistentes: "Catálogo" es enlace solo en Importar; Promociones dice "Catálogo" pero vive arriba; Clientes y Reservaciones sin migas.
3. Cambiar rol muestra dos títulos y aplica al primer clic (`usuarios/page.tsx:331, 334, 343`).
4. "Invitar usuario" / "Crear usuario" / "Nuevo usuario" para lo mismo; el PIN se ve en claro (`components/modal-nuevo-usuario.tsx:67, 153`).
5. Dos paginadores: ‹ › de ~26 px sin etiqueta en Inventario (`inventario/page.tsx:351, 354`) y "Anterior/Siguiente" de 44 px en Clientes (`clientes/page.tsx:286`).
6. Un error de red se muestra como "Producto no encontrado" (`catalogo/productos/[id]/page.tsx:18`, igual en combos y modificadores).
7. Reservaciones usa `text-[#2C5AA0]` en vez de `text-info` (`reservaciones/page.tsx:25`).
8. Categoría con productos: el borrado no dice qué pasa con ellos (`catalogo/categorias/page.tsx:245`); borrar una opción de modificador no confirma (`components/opciones-editor.tsx:102`).
9. Plurales de atajo "combo(s)", "grupo(s)"; "Asignar a  seleccionados" con doble espacio (`components/asignacion-masiva-grupo.tsx:140`).
10. Checkboxes de recetas sin `accent`: salen en el azul del navegador, casi el de marca.
11. Tres formatos de fecha: ISO en Compras, "24 sep 26" en Clientes, "Hace 3 días" en Usuarios.
12. `modo-servicio:41` mezcla 50 % y 33.3 % en la misma columna; su subtítulo contradice al índice.
13. `tiempos-cocina:68` escribe "≤15 min" a mano aunque existe `OBJETIVO_MIN` (`:14`).
14. `eventos:49` gasta el verde en un neto positivo normal; es el único reporte sin rango.
15. Facturación pone un "Facturar" azul por fila que compite con "Emitir factura global".
16. Las tablas usan la clase `tabla-caja` aunque existe `TablaScroll` (`components/page-header.tsx:67`).
17. Registro: "Atrás" h-11 junto a "Crear mi cuenta" h-14 (`registro:159-160`).
18. 🎉 y ✓ dentro del texto de la interfaz (`bienvenida:113`, `recuperar:113`).

## Preguntas

1. Si Don Beto da de alta el menú en el celular, ¿no merece un flujo de "un producto por pantalla" (nombre → precio → categoría → listo) con lo fiscal en valores por defecto?
2. Para el dueño, "Datos fiscales" y "CFDI / PAC" son una sola pregunta: ¿ya puedo facturar? ¿Por qué no un semáforo con ese nombre?
3. En el celular, ¿el panel podría ser una sola pregunta —"¿Cómo cerró hoy?"— y dejar los 14 reportes para la laptop?
