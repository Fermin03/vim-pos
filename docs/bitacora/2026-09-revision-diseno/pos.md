# Caja (`apps/pos`) — revisión de diseño

**24 sep 2026** · Puntaje **24/40** · Rutas relativas a `apps/pos/app/` salvo que digan otra cosa.
Contexto y método en [`README.md`](README.md).

## Veredicto

**El comportamiento está hecho para el mostrador; el aspecto es de panel administrativo genérico.**

Lo que sí es propio viene de incidentes reales del piloto: el cambio en verde a 60 px, el
`CANCELADO` impreso para cocina, la banda invertida de alergias en pedidos de apps con cuenta
regresiva, cuadrículas que no scrollean y distinguen toque de deslizamiento, la barra de inicio
con el orden de Soft Restaurant que el personal ya conocía.

Lo visual podría ser de cualquier dashboard B2B: tarjetas blancas con bordes `#ECECE9` (~1.2:1
contra blanco), texto `ink-3` a ~3.3:1, Inter Tight + Sora, un azul. Los mosaicos de producto
son cajas blancas de texto idénticas; el color de categoría vive solo en un ícono de 24 px que
desaparece si la pastilla mide menos de 130 px (`components/catalogo-productos.tsx:156-165`).

**Oportunidades:** franja de color de categoría en cada mosaico; borde rasgado en el panel del
ticket; botones de billete con el color del billete real ($100 rojo, $200 verde); un modo de
"mostrador" con bordes y letra más fuertes para reflejos.

## Heurísticas

| # | Heurística | Nota | Problema clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 3 | El banner sin conexión de la pantalla de orden es fuerte (`home-pos.tsx:1830`); en inicio es un punto de 6 px con texto de ~9.6 px (`pantalla-inicio.tsx:282-288`) |
| 2 | Mundo real | 3 | Buen español de dominio, pero `APP_UBEREATS` crudo (`pantalla-monitor-ventas.tsx:145`), rol crudo (`pantalla-inicio.tsx:163`), sin billete de $20 (`modal-cobro.tsx:374`), "Ticket #" + fragmento de UUID en vez de folio (`modal-cobro.tsx:405, 558`) |
| 3 | Control y libertad | 2 | "Limpiar" vacía el carrito sin confirmar ni deshacer (`sidebar-ticket.tsx:185-192`, `home-pos.tsx:2000`); el velo del aviso de combo se come el siguiente toque (`hoja-combo.tsx:11`) |
| 4 | Consistencia | 2 | 17 overlays artesanales fuera del `Modal`, 7 opacidades de velo, 11 anchos fijos de modal, 35 tamaños de letra, 3 estilos de botón volver, logo viejo y nuevo conviviendo |
| 5 | Prevención de errores | 2 | `variant="danger"` 0 usos ✔; "Cancelar cuenta" a 8 px de "Cobrar" (`pantalla-cuentas-modo.tsx:402-403`); desvincular de un toque ✔ |
| 6 | Reconocer antes que recordar | 2 | Mosaicos solo texto; precios ocultos por defecto; etiquetas de inicio de ~10 px |
| 7 | Flexibilidad y eficiencia | 2 | Sin búsqueda de producto, sin código, sin atajos; venta en efectivo de 5+ toques; 700 ms tras el PIN (`modal-pin.tsx:38`) |
| 8 | Estética minimalista | 3 | Sobrio, pero ~70 % de la pantalla de inicio es logo y la barra de cuenta tiene 7-8 botones iguales |
| 9 | Recuperarse de errores | 3 | El cierre lista las cuentas que lo bloquean con "Ir a la cuenta" (excelente); mensajes crudos del backend y "Error" a secas |
| 10 | Ayuda | 2 | Buenas pistas en línea; nada para una cajera nueva; los vacíos dicen "créalas en el admin" |

## Carga cognitiva — fallan 4 de 8, 1 parcial

- **Foco único — falla.** Cuentas: "Nueva orden" y "Cobrar" ambos azul sólido (`pantalla-cuentas-modo.tsx:271, 403`). Modificadores: chip azul "Obligatorio" junto al botón azul de confirmar (`modal-modificadores.tsx:297, 449`). Apps de delivery: un "Aceptar" azul por tarjeta.
- **Bloques ≤4 — falla.** Barra de inicio 9-10 mosaicos; 6 métodos de pago; barra de cuenta 7-8 acciones.
- **Agrupación — parcial.** La barra de cuenta mezcla agregar, descuento, imprimir, borrar, cancelar renglones, cancelar cuenta y cobrar en una fila que se envuelve: "Cobrar" cambia de lugar.
- **Opciones mínimas — falla.** El efectivo domina y no tiene camino por defecto; la pantalla de efectivo tiene 20 objetivos.
- **Memoria de trabajo — falla.** Precios ocultos (`catalogo-productos.tsx:229`); el conteo del corte no tiene ayuda de billetes y monedas (deuda anotada en `abrir-turno.tsx:12`); el cambio baja de 60 px a 20 px en la confirmación (`home-pos.tsx:1424`).
- **Pasan:** jerarquía en la pantalla de orden, una cosa a la vez (combos paso a paso), revelación progresiva (menú general, interruptor de precios).

## Recorrido en hora pico

- **PIN.** Amable ("¿Quién está en caja?"), teclas de ~89 px, teclado físico. Pero la primera pantalla muestra el logo viejo dibujado a mano (`topbar-pos.tsx:5-17`, usado en `selector-empleados.tsx:74`) y cada entrada paga 700 ms de "Bienvenido".
- **Tomar la orden.** Los mosaicos iguales obligan a leer. El aviso de combo interrumpe cada producto elegible. Modificadores abre con un grupo obligatorio titulado en rojo (`modal-modificadores.tsx:285`), un chip azul y una pista ámbar para el mismo estado: se lee como error antes de hacer nada.
- **Cobrar (el pico).** Propina opcional → 6 métodos → efectivo. La pantalla de efectivo es el mejor momento del producto: cambio grande en verde, estado "Falta" claro, Cobrar deshabilitado hasta cubrir.
- **El final baja el pico.** "Cobro completado" encoge el cambio a 20 px y exige tocar "Nuevo ticket"; con impresora de vista previa, un segundo "Nuevo ticket" de ~30 px.
- **Cancelar.** El texto explica bien la irreversibilidad, pero el botón es del mismo azul que Cobrar (`modal-cancelar-ticket.tsx:201`).
- **Cierre de turno.** La revisión y la lista de cuentas que bloquean tranquilizan. Pero el ícono de éxito es palomita aun con −$40 (`pantalla-cierre.tsx:480`), el conteo no es ciego y depende del teclado del sistema operativo.

## Fortalezas

1. **El momento del cambio** (`modal-cobro.tsx:425-472`): 60 px en verde, texto según estado ("Entrega este cambio al cliente" / "Falta"), teclado por centavos con teclas físicas y Enter, atajo "Pago exacto".
2. **Cuadrículas medidas que no scrollean** (`catalogo-productos.tsx:99-123`, `lib/rejilla.ts`): menos de 24 px cuenta como toque, lo agotado se ve deshabilitado, botones de página de 46×58 px.
3. **Texto que dice la consecuencia:** "¿Cerrar la caja?" avisa que las pantallas de cocina se detienen (`pantalla-inicio.tsx:362-377`); el cierre lista las cuentas exactas que bloquean; alergias con banda roja invertida y cuenta regresiva que se pone roja bajo 2 min (`pantalla-pedidos-apps.tsx:186-205`).

## Problemas prioritarios

**[P0] Un toque en la pantalla de PIN desvincula la caja** ✔
- `components/selector-empleados.tsx:116-123` → `page.tsx:90-95` (`deviceSignOut` + `olvidarCreds`). Sin confirmación ni PIN.
- La pantalla que toda cajera usa varias veces por turno puede dejar la caja sin vender hasta que llegue el dueño con las credenciales del dispositivo.
- **Arreglo:** mover a Menú → Ajustes detrás de PIN de supervisor, con un aviso que diga que re-vincular pide las credenciales del dispositivo.

**[P1] Lo destructivo no tiene peso visual**
- `variant="danger"` tiene 0 usos ✔. Confirmaciones irreversibles en azul: `modal-cancelar-ticket.tsx:201`, `modal-cancelar-item.tsx:188`, `modal-cancelar-items.tsx:296`, `pantalla-devoluciones.tsx:327`.
- "Limpiar" vacía el carrito sin confirmar ni deshacer. "Quitar", "Eliminar" y "Cancelar cuenta" son grises y solo se ponen rojos con hover (`sidebar-ticket.tsx:354`, `pantalla-cuentas-modo.tsx:451, 660`), y en táctil no hay hover.
- Contradice `diseno/nucleo.md` ("danger = cancelar, borrar"): el azul dice "esto es lo que sigue".
- **Arreglo:** `danger` en confirmaciones irreversibles; toast "Deshacer" de 5 s en Limpiar y Quitar (o mantener presionado, ver movimiento); etiquetas destructivas en rojo en reposo; "Cancelar cuenta" a un menú "Más…" lejos de Cobrar.

**[P1] Texto chico y tenue para brazo extendido, reflejos y pantalla táctil**
- Etiquetas de inicio con `clamp(0.6rem,1.35vh,…)` ≈ 10.4 px en una pantalla de 768 px de alto (`pantalla-inicio.tsx:442`); insignias ~8.8 px (`:444`); estado del pie ~9.6 px (`:282`).
- Nombres de producto topados a 11-16 px, típicamente 14 (`lib/rejilla.ts:293-295`).
- `ink-3` en controles tocables; ~40 % de las declaraciones de texto son de 12.5 px o menos (441 por debajo de 14 px).
- **Arreglo:** piso de 13 px fijo (no por alto de pantalla) para cualquier etiqueta; productos a 16-20 px; `ink-2` como mínimo en todo lo tocable.

**[P1] La regla de un acento se rompe y los colores de estado significan otra cosa**
- Dos azules sólidos en la misma pantalla (`pantalla-cuentas-modo.tsx:271, 403`).
- Azul para estado, no acción: chip "Obligatorio" (`modal-modificadores.tsx:297`, `modal-combo.tsx:209`), barra de pasos del combo (`modal-combo.tsx:197`), insignias de inicio (`pantalla-inicio.tsx:444`).
- Rojo para estados normales: mesa OCUPADA (`pantalla-mesas.tsx:13`) —con el salón lleno, la alerta de "cuenta muy larga" no destaca—, renglón de descuento (`sidebar-ticket.tsx:414`), error de combo rojo sobre azul (`modal-combo.tsx:203`).
- **Arreglo:** insignias en tinta; "Obligatorio" como contorno neutro que se pone ámbar solo tras intentar confirmar; OCUPADA en `info` o neutro; descuentos en `success`.

**[P1] Tocar no responde y el hover se queda pegado** (detalle en la tabla de movimiento)
- Sin `:active` en `Button`, Cobrar, teclado numérico, stepper, métodos de pago, mosaicos de inicio y opciones de modificadores. ~190 estilos `hover:` disparan en táctil.
- **Arreglo:** `hoverOnlyWhenSupported` + una clase `.pulsable` compartida.

**[P1] Esperas artificiales en el PIN**
- 700 ms en `modal-pin.tsx:38`, 600 ms en `modal-autorizacion-pin.tsx:68`, 350 + 600 ms con un "Volviendo a tu ticket…" falso en `pantalla-bloqueo.tsx:36-39` y `modal-sesion-expirada.tsx:34-36`. La autorización se usa en 29 flujos, a menudo con el cliente esperando.
- Tras un PIN equivocado, un timer de 850-1000 ms (`clearSignal`) borra los dígitos que ya se tecleaban para el reintento (`modal-pin.tsx:44`, `pantalla-bloqueo.tsx:45`, `modal-autorizacion-pin.tsx:74`, `modal-sesion-expirada.tsx:44`).
- **Arreglo:** mantener los puntos verdes ≤250 ms y seguir; limpiar el error con la siguiente tecla, sin timer.

**[P2] Los avisos mueven la cuadrícula bajo el dedo**
- Sin conexión, sync y error son filas extra encima del catálogo (`home-pos.tsx:1829-1840, 1971`). La cuadrícula se dimensiona con `useHueco`, así que un aviso cambia filas y páginas; la comprobación de conexión corre cada 20 s y con Wi-Fi inestable puede parpadear.
- **Arreglo:** sin conexión/sync como pastilla dentro de la barra de captura de alto fijo; el error como barra `fixed` sobre el borde inferior del catálogo.

**[P2] El catálogo es genérico: la cajera tiene que leer**
- Mosaicos blancos de solo texto con bordes ~1.2:1 (`catalogo-productos.tsx:213-243`); pastillas de categoría de 44 px contra los 56 px que pide `diseno/pos.md` para objetivos frecuentes (`:46`).
- **Arreglo:** franja de 4-6 px con el color de la categoría y un tinte suave; foto o código corto opcional; pastillas de 56 px.

**[P2] Modales y pantallas construidos de muchas formas**
- 17 archivos con overlay propio sin trampa de foco (`modal-cobro.tsx:1146`, `pantalla-cuentas-modo.tsx:524`, diálogos de `pantalla-pedidos-apps.tsx`…); 7 velos (`bg-black/40`, `bg-ink/30` a `/70`); 11 anchos de 340 a 880 px; 6 alturas de encabezado.
- Volver: chevron de 36 px sin etiqueta en el cierre (`pantalla-cierre.tsx:331`); `BotonVolver` mide 40 px, bajo el mínimo de 44 (`boton-volver.tsx:18`); en el monitor "Volver" pega con el título (`pantalla-monitor-ventas.tsx:83-85`, visible en la captura).
- **Arreglo:** un solo cascarón de modal (sm / md / 80 %) y un componente de encabezado de pantalla; `BotonVolver` a h-11.

**[P2] Deriva de tokens y restos de la marca naranja**
- Sombra `rgba(232,80,46,.3)` bajo Cobrar y "Agregar al ticket" ✔ (`sidebar-ticket.tsx:460, 483`, `modal-modificadores.tsx:449`).
- `warning-soft` existe en 4 valores (token `#FCF6E8` + `#F6EEDD`, `#FBF6E8`, `#FCF3E6`), `success-soft` en 3, `danger-soft` en 3. Pizarra `#4A5568`/`#ECEEF1` fuera de paleta en el chip de modo (`sidebar-ticket.tsx:198-200`).
- 150 hex fijos fuera de `recibo-*` (99 no corresponden a ningún token; más comunes `#F6EEDD` ×17, `#E8DCC0` ×13, `#FBECEA` ×11). Top: `pantalla-mesas` 23, `modal-cobro` 20, `pantalla-reservaciones` 16.
- `rounded-[11px]`, `[9px]`, `[7px]` fuera de la escala 4/6/8; `z-[…]` con valores 1, 41, 55, 60, 70, 80 sin escala (5 en `home-pos`).
- **Arreglo:** codemod a tokens + regla de lint que prohíba hex dentro de `className`.

**[P2] Fricción en la ruta del dinero**
- Venta en efectivo de 5+ toques sin camino rápido; la confirmación encoge el cambio y exige un toque; tocar el velo del aviso de combo equivale a "No, solo" y se traga el siguiente producto; no hay billete de $20.
- **Arreglo:** Cobrar como botón dividido (Efectivo exacto / Efectivo… / Otro); cambio a ≥48 px y volver a orden nueva sola al cerrar el cajón; que el velo deje pasar o ignore el toque; agregar $20.

## Personas

**Alex (cajero rápido):** sin búsqueda ni código; el teclado solo cubre Escape, dígitos del PIN y del efectivo, y Enter en efectivo (`modal-cobro.tsx:241-248`) —sin atajos para Cobrar, Pago exacto ni categorías—; 700 ms de entrada y 850 ms de bloqueo tras PIN equivocado; el aviso de combo interrumpe cada hamburguesa; "Cobro completado" agrega un toque obligatorio a cada venta.

**Sam (accesibilidad):** `ink-3` ~3.3:1; texto del pie sobre `sel` ~3.2:1 a 10-11 px; ámbar sobre `#F6EEDD` ~4.0:1 (`banda-acceso.tsx:57`, `modal-cancelar-ticket.tsx:154`). 17 diálogos sin trampa ni foco inicial; inputs con `outline-none` y solo un cambio de borde de 1 px (`sidebar-ticket.tsx:242, 367`); 11 estilos `focus-visible` en 193 botones. Significado solo en `title` (`sidebar-ticket.tsx:335` "%", `pantalla-inicio.tsx:425`). Tamaños por alto de pantalla ignoran el tamaño de texto del usuario (riesgo WCAG 1.4.4). Sin movimiento reducido para el shake. Categoría solo por color.

**Lupita (cajera en hora pico: dedos con grasa, reflejos, interrupciones, poca experiencia):** "Nota", "Quitar" y "%" de ~28 px; stepper de 36 px (`sidebar-ticket.tsx:307-357`); acciones de cuenta de 36 px; "Menú" de 32 px (`pantalla-inicio.tsx:169`), bajo el piso de 36 de `nucleo.md`. Con reflejo, bordes de 1.2:1 desaparecen; sin conexión es un punto de 6 px. "Limpiar" es un toque gris arriba del ticket y "Desvincular" está bajo su propio nombre. Tres colores (azul, rojo, ámbar) para un mismo "obligatorio". Apertura y cierre dependen del teclado del sistema operativo (`abrir-turno.tsx:122-128`, `pantalla-cierre.tsx:366-372`).

## Movimiento (Emil Kowalski)

La base que existe está bien: Cobro, modificadores, combo y "Cobro completado" abren sin
animación (correcto para algo que se usa 100+ veces al día); el `Modal` compartido tiene un pop
de 200 ms con `cubic-bezier(.22,1,.36,1)` bien afinado; no hay Framer Motion, `will-change` ni
`scale(0)`. `diseno/nucleo.md` y `diseno/pos.md` no tienen reglas de movimiento.

### Correcciones a lo que ya se mueve

| Antes | Después | Por qué |
|---|---|---|
| Sin tokens de curva; el preset escribe `.18s ease`, `.4s` y `cubic-bezier(.22,1,.36,1)` (`packages/config/tailwind-preset.js:83-85`) | `--ease-out: cubic-bezier(0.23,1,0.32,1); --ease-in-out: cubic-bezier(0.77,0,0.175,1)` en `tokens.css`; `transitionTimingFunction: { vim: "var(--ease-out)" }` | Una sola fuente de curvas, como el color |
| `animate-vim-shake` a 400 ms y sin movimiento reducido (`packages/ui/src/components/pin-keypad.tsx:270`) | `.3s var(--ease-in-out)`; `animation: none` con `prefers-reduced-motion` | Los puntos rojos ya dicen "error" |
| Sin `prefers-reduced-motion` en ningún lado | `@media (prefers-reduced-motion: reduce){ .animate-vim-pop{animation-name:vim-fade} .animate-vim-shake{animation:none} }` | Reducido = cambiar movimiento por fundido, no quitar todo |
| `transition-all` en `sidebar-ticket.tsx:336, 345, 354, 440, 471, 501, 519` y `modal-cobro.tsx:426, 492, 584, 659, 831, 902, 927` | `transition-colors` | Solo cambian color, borde o fondo |
| `modal-cobro.tsx:484` `transition-all … active:scale-[.97]` en billetes | `transition-[transform,background-color,border-color] duration-150 ease-vim active:scale-[.97] active:duration-[60ms]` | Solo lo que se mueve; la presión llega al instante |
| `modal-cobro.tsx:790` `transition-[width] duration-300` en la barra de pago dividido | `w-full` con `translateX(${pct-100}%)` y `transition-transform duration-200` | Animar el ancho obliga a recalcular layout |
| `catalogo-productos.tsx:220-223` `transition` (11 propiedades) + `hover:shadow-sm` | `transition-[transform,border-color] duration-150 active:scale-[.97] active:duration-[60ms]`; sin sombra al pasar | Lo más tocado de la app; la sombra repinta y se queda pegada |
| `paginador.tsx:66` mismo `transition` | Igual que el mosaico | Presión consistente en toda la cuadrícula |
| Teclado numérico de efectivo `active:bg-line` con 150 ms (`modal-cobro.tsx:221-222`) | `transition-[background-color,transform] duration-150 active:duration-0 active:bg-line active:scale-[.97]` | Un toque rápido termina antes de que se vea el fundido |
| Teclas del PIN `hover:bg-hover` igual a `active:bg-hover` (`packages/ui/src/components/pin-keypad.tsx:315`) | `active:bg-line active:scale-[.96] active:duration-[60ms]`, hover solo con mouse | En táctil la última tecla queda gris como si siguiera presionada |
| Puntos del PIN con `transition-colors` de 150 ms (`packages/ui/src/components/pin-keypad.tsx:280`) | `duration-75` o sin transición | Teclear rápido le gana al llenado |
| `sidebar-ticket.tsx:289` `active:scale-[.99]` en el renglón completo | `active:bg-sel` sin transición | Escalar 1 % un bloque de texto se ve como temblor |
| `pantalla-mesas.tsx:174` `hover:shadow-[0_4px_14px…]` en mesas | Quitar; `active:scale-[.97]` | Sombra animada, pegada en táctil, sin respuesta al tocar |
| `modal-modificadores.tsx:333-338` el fondo se funde en 150 ms y el anillo cambia al instante | Selección instantánea + escala al presionar | Las dos partes del mismo cambio van desfasadas |
| `modal-cobro.tsx:443-450` el cambio salta entre 60 y 30 px | Número en un hueco de alto fijo (`h-[60px] items-end`) | La caja brinca justo cuando se toca el billete que cubre |

### Retroalimentación que falta

| Antes | Después | Por qué |
|---|---|---|
| Tailwind 3.4 sin restricción: ~190 `hover:` disparan en táctil | `future: { hoverOnlyWhenSupported: true }` en `apps/pos/tailwind.config.ts` (o el preset). Comprobar `matchMedia` en la terminal de Knock-Out | Una línea pone todo hover detrás de `(hover:hover) and (pointer:fine)` |
| `Button` con `transition-colors`, sin estado activo (`packages/ui/src/components/button.tsx:12-21`) | `transition-[background-color,transform] duration-150 active:scale-[.97] active:duration-[60ms]` | "Nuevo ticket" y "Completar cobro" se tocan en cada venta |
| Cobrar y Enviar sin estado presionado (`sidebar-ticket.tsx:460, 483`; `modal-cobro.tsx:508, 596, 1013`) | `active:scale-[.98]` (a todo el ancho, .98 basta) | La acción principal de cada venta no confirma el toque |
| Stepper `h-9 w-9` solo con hover (`sidebar-ticket.tsx:314, 326`) | `h-11 w-11`, `active:bg-line active:duration-0` | Bajo los 44 px de `pos.md` y mudo en táctil |
| Filas de método de pago solo con hover (`modal-cobro.tsx:296, 322`) | `active:bg-line active:duration-0` | Se tocan en cada venta |
| Mosaicos de inicio solo con hover (`pantalla-inicio.tsx:427`) | `group` + `group-active:scale-[.95]` en ícono y etiqueta + `active:bg-sel` | Van pegados en barra: se escala el contenido, no el segmento |
| Los renglones nuevos caen bajo el pliegue sin señal (`sidebar-ticket.tsx:256`) | Al crecer la lista, `scrollTop = scrollHeight` instantáneo; marcar el último agregado con el `border-l-4` que hoy es transparente, sin animar | Retroalimentación espacial que no cuesta tiempo |
| "Limpiar" (~30 px) vacía el carrito de un toque (`sidebar-ticket.tsx:185-192`) | Mantener presionado: overlay `clip-path: inset(0 100% 0 0)` → `inset(0)` en 1000 ms lineal al sostener, regresa en 200 ms; objetivo a h-11 | Protege de un roce sin agregar modal |
| Toast que aparece y desaparece en seco; un segundo toast puede cerrar al primero antes de tiempo (`home-pos.tsx:2111, 2117`) | Entrada opacidad + `translateY(-8px)` 200 ms, salida 150 ms; limpiar el timeout anterior | Uso ocasional: movimiento estándar; y la carrera del timer |
| Hoja de combo aparece de golpe (`hoja-combo.tsx:12-13`) | `transform: translateX(-50%)` en CSS, transición de 160 ms y `@starting-style { transform: translate(-50%,12px); opacity: 0 }` (Electron 43 lo soporta) | Decenas de veces al día: corto |
| `dialogo-avisos.tsx:115-116` sin entrada | `animate-vim-fade` en el velo y `animate-vim-pop` en la tarjeta | Raro: puede igualar al `Modal` |
| `pantalla-cierre.tsx:480` palomita aun con faltante | Si `diferenciaTotal === 0`: palomita dibujada con `stroke-dashoffset` 400 ms y filas escalonadas 40 ms; si no, ícono de alerta sin movimiento | El cierre es raro: se permite un momento de satisfacción, no sobre un faltante |
| Cambio a 20 px en "Cobro completado" (`home-pos.tsx:1421-1424`) | `text-[44px] font-display font-bold tabular-nums` | El cajón abre al cobrar: es el número con el que se cuenta |
| `diseno/pos.md` sin sección de movimiento | Agregar "Movimiento": regla de frecuencia, qué se anima, la presión, los tokens | Para que nadie "arregle" los modales instantáneos |

### Lo que no debe animarse

| Antes | Después | Por qué |
|---|---|---|
| Cobro, modificadores, combo, "Cobro completado" y vista previa del recibo abren al instante | **Mantener.** Nunca pasarlos al `Modal` (agrega 200 ms) | 100+ veces al día |
| `Modal` anima "Poner/Cuentas en espera" y "Cuentas para llevar" (`modal-espera.tsx:28, 77`, `modal-cuentas-para-llevar.tsx:45`) | Prop `instantaneo` que salta `vim-pop` (velo ≤120 ms) | Decenas de veces al día desde la barra |
| Cambio de categoría, de página y paginado con flechas | Instantáneos, sin deslizar | Frecuentes; las flechas son teclado |
| Totales | Sin contadores que suben | Un total que se dice en voz alta debe ser final de inmediato |
| Cobro cambia de 560 a 920 px entre vistas (`modal-cobro.tsx:1154-1156`) | Instantáneo | Frecuente; animar tamaño recalcula layout |
| Esperas del PIN y spinner falso (ver P1) | ≤250 ms, sin spinner | Casi un segundo que ningún trabajo justifica |
| `backdrop-blur-md` en `pantalla-bloqueo.tsx:65`; `backdrop-blur-sm` en `modal-abrir-caja.tsx:77`, `modal-autorizacion-pin.tsx:88`, `modal-sesion-expirada.tsx:69` | Quitar; dejar `bg-white/[.74]` o `bg-ink/40` | Caro en PCs táctiles de gama baja |

Clase compartida propuesta para `globals.css`:

```css
@layer components {
  .pulsable { transition: transform 160ms var(--ease-out), background-color 150ms ease, border-color 150ms ease; }
  .pulsable:active:not(:disabled) { transform: scale(.97); transition-duration: 60ms; }
}
```

## Detector

- `side-tab` ×2: `sidebar-ticket.tsx:248` es real (nota de orden con borde izquierdo ámbar de 2 px y tres hex: `#D4A017` —token de advertencia del KDS usado fuera—, `#FBF6E8` —casi `warning-soft`— y `#7A5A10` sin token); `:273` es falso positivo (`border-l-4 border-l-transparent`, nunca toma color).
- Botones solo-ícono sin `aria-label`: `modal-cobro.tsx:644` (cerrar), `pantalla-cierre.tsx:331` (volver), `selector-zona.tsx:122-124` ("＋"). Solo con `title`: `selector-zona.tsx:116` ("✎", además 11 px y objetivo diminuto) y `sidebar-ticket.tsx:332` ("%").
- Texto < 12 px en interactivos: `modal-config-impresora.tsx:212, 227` (11.5 px), `selector-zona.tsx:116` (11 px).
- Justificados: `global-error.tsx` (no importa `globals.css`), `logo-vim.tsx`, `recibo-*` (papel térmico de 80 mm), `!important` dentro de `@media print`.

## Observaciones menores

1. El encabezado de inicio muestra el código de rol crudo para quien no es cajero (`pantalla-inicio.tsx:163`); el login usa etiquetas amables.
2. El chip de modo de servicio lleva palomita y parece interruptor, pero es de solo lectura (`sidebar-ticket.tsx:198-201`).
3. Renglones con cursor de mano y fondo al pasar aunque no se puedan editar (`sidebar-ticket.tsx:273`).
4. "Poner pedido en espera" se deshabilita sin conexión sin decir por qué (`home-pos.tsx:2009`, `sidebar-ticket.tsx:517`).
5. Cobrar del panel mide ~50 px contra los 56 de `pos.md` (`sidebar-ticket.tsx:483`).
6. El subtítulo de "Crédito" repite la etiqueta (`modal-cobro.tsx:159`).
7. La insignia "Default" del combo va en verde de éxito (`modal-combo.tsx:249`); "Elegir"/"Cambiar" miden ~26 px (`:301`).
8. Radios fuera de escala: `rounded-[11px]` (`modal-cobro.tsx:301`), `rounded-2xl` (menú general, `pantalla-estado.tsx:38`), `rounded-xl` (confirmación, `home-pos.tsx:~1415`).
9. La tarjeta "Efectivo esperado" tiene borde de tinta y parece seleccionada; cualquier descuento > $0 sale en ámbar todos los días (monitor de ventas).
10. La leyenda de mesas no incluye "fuera de servicio"; quedan un comentario "NO el naranja" y un formateador de dinero duplicado (`pantalla-mesas.tsx:9, 19`).
11. El título de apps de delivery es sans de 17 px, distinto a todas las demás pantallas; su folio no usa cifras tabulares (`pantalla-pedidos-apps.tsx:128, 194`).
12. El stepper mide 36 px en el carrito y 44 en el combo.
13. Sugerencias del fondo de caja y chips de motivo de cancelación de ~30 px (`abrir-turno.tsx:~138`, `modal-cancelar-ticket.tsx:165-171`).
14. El menú general repite "Cerrar turno", que ya está en la barra de inicio.
