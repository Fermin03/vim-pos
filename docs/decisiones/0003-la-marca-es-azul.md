# 0003 — La marca es azul, no naranja

**Fecha:** 23 de agosto de 2026 (commit `660508c`) · **Estado:** vigente

## Qué decía el plan

Todos los mockups y los documentos `08-WIREFRAMES.md` y `11-GUIA-DE-DESARROLLO.md` definen el
acento de marca como naranja `#E8502E`.

## Qué hacemos ahora

`accent: #0078C9` (azul), `accent-hover: #0063A8`, `accent-soft: #EAF3FB`.

## Por qué

Llegó el logotipo definitivo, que es azul. Se cambió el **token**, no solo el logotipo: un
logotipo azul junto a botones naranjas se lee como dos marcas en la misma pantalla.

De paso salda una deuda de accesibilidad. Blanco sobre el naranja daba 3.74:1 y no alcanzaba el
AA de WCAG; sobre este azul da 4.64:1 y sí.

## Consecuencias

- Los 231 mockups quedaron en el color viejo. Fue una de las razones de 0001.
- **Había dos fuentes de verdad de los tokens** (`tailwind-preset.js` y `tokens.css`) que se
  sincronizaban a mano. En esta misma migración se actualizó una y no la otra, y todo lo que usa
  `bg-accent` —el panel entero y el portal— estuvo saliendo del naranja viejo sin que nadie lo
  notara. **Resuelto el 31/08/2026 en [`0008`](0008-una-sola-fuente-de-tokens.md).**
- Quedan literales del naranja en el código como sombras (`rgba(232,80,46,.3)`), inofensivas
  pero delatoras.
