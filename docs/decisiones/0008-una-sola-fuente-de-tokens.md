# 0008 — Los tokens tienen una sola fuente

**Fecha:** 31 de agosto de 2026 · **Estado:** vigente

## Qué había antes

Dos archivos con los mismos valores, sincronizados a mano:

- `packages/ui/tokens.css` — variables CSS en hexadecimal.
- `packages/config/tailwind-preset.js` — los mismos hexadecimales otra vez, para Tailwind.

El propio preset avisaba en un comentario de que había que tocar los dos. No sirvió: en la
migración de naranja a azul ([`0003`](0003-la-marca-es-azul.md)) se actualizó uno y no el otro, y
todo lo que usa `bg-accent` —el panel entero y el portal— estuvo saliendo del color viejo sin que
nadie lo notara.

## Qué hacemos ahora

`packages/ui/tokens.css` es la única fuente. El preset **no tiene valores**: apunta a las
variables.

```js
const token = (nombre) => `rgb(var(--${nombre}) / <alpha-value>)`;
accent: { DEFAULT: token("accent"), hover: token("accent-hover"), soft: token("accent-soft") }
```

Cambiar un color es cambiar una línea de `tokens.css`, y las cinco apps se enteran solas.

## Por qué en canales y no en hexadecimal

Esa era exactamente la razón por la que existían dos archivos. Tailwind necesita meter la
opacidad dentro del color: `bg-ink/40` compila a `rgb(var(--ink) / 0.4)`, y eso solo funciona si
la variable trae `22 22 26`. Un `#16161A` no se puede meter ahí.

El hexadecimal va al lado en un comentario, para poder leerlo y copiarlo.

**Consecuencia para quien escriba CSS a mano:** una variable sola ya no es un color. Hay que
envolverla: `color: rgb(var(--ink))`. Los seis sitios que las usaban directo se ajustaron.

## Cómo se verificó

Se resolvieron **106 utilidades de color** con el preset —las tres familias de cada token más los
modificadores de opacidad que se usan de verdad— antes y después del cambio, sustituyendo las
variables por sus canales para poder compararlas. **Cero diferencias.** El cambio no mueve un
solo color.

## Consecuencias

- **El tema oscuro del KDS pasa de decorativo a funcional.** Antes, `[data-theme="kds"]`
  redefinía las variables pero las clases de Tailwind traían el hexadecimal quemado, así que
  dentro del KDS un `bg-surface` salía blanco igual. Ahora el atributo retematiza de verdad
  cualquier componente compartido. Nadie lo aplica todavía; está anotado en `diseno/kds.md`.
- Se arreglaron de paso dos sombras de `modal-modificadores.tsx` que usaban
  `theme(colors.ink)` — una forma que Tailwind rechaza, así que llevaban tiempo sin dibujarse.
- **El sitio web sigue fuera.** Es HTML estático sin build: no consume ni el preset ni el CSS, y
  tiene 16 literales `#0078C9` copiados a mano. Mientras no haya un paso que los compare, un
  cambio de marca sigue obligando a revisar el sitio aparte. Anotado en `diseno/sitio.md`.
