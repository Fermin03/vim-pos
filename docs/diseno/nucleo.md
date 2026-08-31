# Núcleo del design system

Lo que comparten **todas** las apps de VIM POS: color, tipografía, espaciado, radios y los
componentes que se usan en más de una. Describe **lo que el código hace hoy**, no un ideal. Donde
la realidad y la intención no coinciden, se dice y se marca como deuda — un design system que
describe una versión imaginaria del producto no sirve para decidir nada.

## Esto es la capa de abajo

Cada app tiene además su propio documento, porque lo que de verdad las diferencia no es el color:
es quién las usa y en qué condiciones.

| App | Documento | Quién y dónde |
|---|---|---|
| POS | [`pos.md`](pos.md) | Cajero · táctil 15" · de pie, con prisa |
| Admin | [`admin.md`](admin.md) | Dueño · laptop · sentado, analizando |
| KDS | [`kds.md`](kds.md) | Cocinero · pantalla a 2 m · sin mouse |
| Factura | [`factura.md`](factura.md) | Cliente final · teléfono · una sola vez |
| Platform | [`platform.md`](platform.md) | VIM interno · acciones peligrosas |
| Sitio | [`sitio.md`](sitio.md) | Visitante · marketing · sin build |

Si una regla aplica a todos, va aquí. Si aplica a uno, va en el suyo. Ante duda, gana el documento
de la app.

**Fuente de verdad, en este orden:**

1. `packages/config/tailwind-preset.js` — los tokens que consumen las apps.
2. `packages/ui/tokens.css` — los mismos valores como variables CSS, para lo que no pasa por Tailwind.
3. Este documento y el de cada app — el porqué y las reglas de uso.

Los dos primeros deben mantenerse en espejo. Si cambias uno y no el otro, la app y el ticket
impreso dejan de parecerse. Ya pasó: ver [`decisiones/0003`](../decisiones/0003-la-marca-es-azul.md).

> Los mockups **ya no mandan**. Se archivaron el 30/08/2026; ver
> [`decisiones/0001`](../decisiones/0001-los-mockups-dejan-de-mandar.md).

---

## 1. Color

### Marca

| Token | Valor | Uso |
|---|---|---|
| `accent` | `#0078C9` | **Una sola acción dominante por pantalla.** Cobrar, Enviar a cocina, Confirmar. |
| `accent-hover` | `#0063A8` | Estado hover del anterior. |
| `accent-soft` | `#EAF3FB` | Fondos de realce muy suaves. Nunca texto. |

El azul es la señal de "esto es lo que sigue". Si una pantalla tiene tres botones azules, no tiene
ninguno: el cajero pierde el segundo de orientación que el color estaba comprando.

**Era naranja `#E8502E` hasta agosto de 2026**, cuando llegó el logotipo definitivo y la marca pasó
a azul. Se cambió el token, no solo el logotipo: un logotipo azul junto a botones naranjas se lee
como dos marcas en la misma pantalla. De paso se salda una deuda de accesibilidad — blanco sobre el
naranja daba 3.74:1 y no alcanzaba el AA de WCAG; sobre este azul da 4.64:1 y sí.

### Logotipo

Un cuadrado azul con el borde inferior en zigzag —el corte del papel del ticket— y la "V" en
blanco. Un solo archivo manda y de ahí sale todo lo demás:

| Qué | Dónde | Cómo se obtiene |
|---|---|---|
| **Maestro** | `apps/admin/public/icon.svg` | el archivo de diseño |
| Favicon del POS | `apps/pos/public/icon.svg` | copia del maestro |
| En pantalla | `<LogoVim />` de `@vim/ui/styles` | el vector, en línea |
| Icono de app e instalador | `desktop/build/icon.png` (1024) | `npm run iconos` |
| Bandeja del sistema | `desktop/build/tray.png` (32) | `npm run iconos` |

**No se dibuja a mano.** Hasta agosto de 2026 la marca estaba escrita en HTML en doce pantallas —un
cuadrado negro, una "V" de texto y un punto de color— así que cambiar el logotipo obligaba a tocar
doce archivos, y además dependía de que el dispositivo tuviera la tipografía instalada. Si hace
falta la marca en un sitio nuevo, se usa `<LogoVim />`.

**Sus colores van literales, no por token.** Un logotipo no cambia con el tema ni sigue al acento
de la interfaz. Hoy coinciden en el mismo azul, pero son dos decisiones distintas.

### Tinta

| Token | Valor | Uso |
|---|---|---|
| `ink` | `#16161A` | Texto principal, cifras, títulos. |
| `ink-2` | `#5A5A60` | Texto secundario, etiquetas de campo. |
| `ink-3` | `#8E8E94` | Texto de apoyo, ayudas, marcas de tiempo. |

Tres niveles bastan. Un cuarto tono intermedio siempre acaba usándose "porque el otro no se veía
bien", que es la manera educada de decir que la jerarquía se rompió.

### Semánticos

| Token | Valor | Significa |
|---|---|---|
| `success` | `#2E7D52` | Cobrado, entregado, cuadrado. |
| `warning` | `#9A6B12` | Requiere atención pero no bloquea. Sin conexión, cuenta vieja. |
| `danger` | `#C0392B` | Destructivo o bloqueante. Cancelar, borrar, diferencia de caja. |
| `info` | `#2C5AA0` | Neutro informativo. Sincronizando, avisos del sistema. |

**Regla dura:** `danger` es para lo que **destruye o impide**, no para lo que "se ve mal". Un
faltante de caja es rojo; una cuenta abierta hace dos horas es `warning`. Si todo lo incómodo es
rojo, el rojo deja de detener a nadie.

### Superficies y líneas

| Token | Valor | Uso |
|---|---|---|
| `bg` / `surface` | `#FFFFFF` | Fondo y tarjetas. |
| `line` | `#ECECE9` | Separadores dentro de un bloque. |
| `line-strong` | `#DDDDD9` | Bordes de controles: inputs, botones fantasma. |
| `hover` | `#F6F6F4` | Fondo al pasar el cursor. |
| `sel` | `#FBFBFA` | Fila o tarjeta seleccionada. |

### Paleta funcional (categorías y gráficas)

`cat-blue #2C5AA0` · `cat-green #2E7D52` · `cat-teal #1F7A82` · `cat-violet #6B4FA0` ·
`cat-amber #B5701A` · `cat-wine #9A3050`

**Nunca el azul de marca para datos.** Una barra azul de marca en una gráfica compite con el botón
Cobrar por el mismo significado, y el ojo no puede sostener dos.

> **Deuda:** estos seis tokens están definidos y **no se usan en ninguna parte**. Las categorías
> del catálogo guardan su propio `color_hex` libre, así que hoy no hay nada que garantice contraste
> ni coherencia. Al construir la vista de gráficas conviene decidir: o se adopta la paleta, o se
> borra del preset. Tenerla ahí sin uso solo confunde a quien la lea.

### Tema oscuro (KDS)

El KDS invierte superficies bajo `[data-theme="kds"]`: fondo `#1A1A1E`, tarjetas `#26262B`, texto
`#F0F0EC`, y `warning`/`danger` aclarados (`#D4A017`, `#E04040`) porque los originales no
sobreviven sobre negro.

Es el único tema alternativo. **No se usa para la web ni para el POS de caja**: en cocina la
pantalla está lejos, con grasa y luz difícil; en la caja no.

---

## 2. Tipografía

Tres familias, cargadas desde Google Fonts en el `layout` de cada app:

| Familia | Token | Para qué |
|---|---|---|
| **Inter Tight** | `font-sans` | Todo el texto de interfaz. Es la voz por defecto. |
| **Sora** | `font-display` | Títulos, botones y **cifras de dinero**. |
| **JetBrains Mono** | `font-mono` | Tickets, reportes, folios, cualquier cosa que se alinee en columnas. |

**Por qué Sora en el dinero:** los totales se leen de reojo, a un metro, mientras se cuenta
efectivo. Necesitan peso y anchura constante. Siempre acompañados de `tabular-nums`, o las cifras
bailan al actualizarse y obligan a releer.

### Escala real

La escala **no está tokenizada**. El código usa valores literales, y estos son los que de verdad
aparecen en el POS:

| Tamaño | Apariciones | Papel de hecho |
|---|---|---|
| `13px` | 116 | El caballo de batalla: texto de interfaz. |
| `12.5px` | 84 | Texto secundario y ayudas. |
| `15px` | 49 | Texto destacado dentro de un bloque. |
| `12px` | 42 | Etiquetas, metadatos. |
| `14px` | 38 | Botones y controles. |
| `11px`–`11.5px` | 51 | Chips, marcas de tiempo, notas al pie. |

> **Deuda:** que existan `12px`, `12.5px` y `13px` conviviendo es señal de decisiones tomadas de a
> una. Para la web conviene fijar una escala corta (12 / 13 / 15 / 18 / 24 / 32) y respetarla; en
> el POS, migrar es caro y de bajo retorno — funciona y nadie se queja.

---

## 3. Espaciado y radios

**Espaciado** en múltiplos de 4: `4 · 8 · 12 · 16 · 20 · 24 · 32`. No hay valores intermedios y no
deberían agregarse: la mitad del orden visual de una interfaz sale de que las distancias se
repitan.

**Radios:** `sm 4px` · `base 6px` · `lg 8px`. El radio grande es para contenedores (tarjetas,
modales); el base para controles. Nada redondeado por completo salvo chips e indicadores.

---

## 4. Controles y superficie táctil

Alturas usadas, por frecuencia: `h-11` (44px) · `h-10` (40px) · `h-12` (48px) · `h-9` (36px) ·
`h-14` (56px).

| Altura | Cuándo |
|---|---|
| `h-14` | Acción dominante en pantalla de captura. Se toca con el pulgar sin mirar. |
| `h-12` | Botones grandes de catálogo y teclado numérico. |
| `h-11` | **Predeterminado** de botones e inputs. |
| `h-10` | Acciones secundarias en barras densas. |
| `h-9` | Solo dentro de tarjetas o modales, para acciones terciarias. |

**Nada por debajo de 36px en superficies que se tocan.** El POS se opera de pie, con prisa y a
veces con guantes; un objetivo de 32px se falla lo suficiente como para que el cajero deje de
confiar en la pantalla.

---

## 5. Componentes compartidos

Viven en `packages/ui/src/components` y se importan desde `@vim/ui/styles`:

- **`Button`** — variantes `primary` (azul), `ghost` (borde), `danger` (rojo); tamaños `md`
  (h-11) y `lg` (h-14). Siempre un `<button>` real, con foco visible por teclado.
- **`Modal`** — contenedor de diálogo con título opcional.
- **`PinKeypad`** — teclado numérico para PIN.
- **`StatusChip`** — etiqueta de estado.

**Regla:** si un patrón aparece en dos apps, sube a `@vim/ui`. Si aparece dos veces en la misma
app, sube a `app/components`. Copiar y pegar la tercera vez es cuando el sistema empieza a
divergir sin que nadie lo note.

> **Deuda:** hay componentes que deberían estar aquí y viven sueltos en `apps/pos` — `BotonVolver`,
> `RenglonItem`. Se quedaron ahí porque nacieron en el POS; no hay razón de fondo.

---

## 6. Cómo cambiar esto

1. Se toca `tailwind-preset.js` **y** `tokens.css` en el mismo commit. Siempre los dos.
2. Si el cambio afecta a lo impreso —el ticket, la comanda—, se revisa el papel, no solo la
   pantalla: la impresora térmica no tiene color y el contraste se comporta distinto.
3. Este documento se actualiza en el mismo commit. Un design system que va por detrás del código
   es peor que no tenerlo: la gente lo lee, decide en falso, y descubre el desfase tarde.

4. Si la regla solo aplica a una app, no la escribas aquí: va en `docs/diseno/<app>.md`. Este
   documento se hizo grande justo por eso, y las reglas de caja acabaron mezcladas con las de
   marca.
