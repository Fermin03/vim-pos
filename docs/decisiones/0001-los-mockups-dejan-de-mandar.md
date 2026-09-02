# 0001 — Los mockups dejan de ser fuente de verdad

**Fecha:** 30 de agosto de 2026 · **Estado:** vigente

## Qué decía el plan

`CLAUDE.md` listaba `MOCKUPS/` (231 pantallas, P-001 … P-231) entre las fuentes de verdad, y la
regla de trabajo era portarlas al pie: el frontend debía reproducir el diseño ya definido por
viewport, no aproximarlo.

## Qué hacemos ahora

Los mockups **no mandan**. El diseño lo mandan, en este orden:

1. `docs/diseno/` — el núcleo de marca y un documento por app.
2. `packages/config/tailwind-preset.js` + `packages/ui/tokens.css` — los valores.
3. El código.

Los 231 archivos se archivaron en `respaldos/mockups-2026-08-hasta-aqui-mandaron/`. No se
borraron: no estaban en git, no había otro respaldo, y ocupan 5 MB.

## Por qué

El producto se movió y ellos no:

- **Todos están en el naranja `#E8502E`.** La marca es azul desde el 23 de agosto (ver 0003).
- **Las funciones cambiaron.** Movimientos de caja de cuatro tipos a dos (0007), agregar
  productos dejó de ser pantalla aparte (0006), comedor entra por lista (0005). Nada de eso
  aparece en los mockups.

Seguirlos al pie empezó a producir decisiones equivocadas: describían un producto que ya no
existe. Una fuente de verdad que miente es peor que no tener ninguna, porque se obedece.

## Consecuencias

- Lo que se pierde: no hay una referencia visual completa dibujada de antemano. Cada pantalla
  nueva se diseña contra `docs/diseno/`, que es texto y reglas, no imágenes.
- Siguen sirviendo como referencia de **estructura e intención** — varias pantallas salieron
  bien portándolas, la última fue el retiro de efectivo (P-098).
- El demo estático del cliente, que se generaba desde estos mockups, **se retiró el 02/09/2026**
  y vive en `respaldos/demo-2026-09-retirado/`. Ver [`0010`](0010-el-demo-estatico-se-retira.md).
