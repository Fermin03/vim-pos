# 0010 — El demo estático se retira; la demo es el producto real

**Fecha:** 2 de septiembre de 2026 · **Estado:** vigente

## Qué había

Una carpeta `demo/` en la raíz del proyecto, fuera del repositorio: un demo estático navegable
(POS + Admin) construido cableando los 231 mockups con una capa de navegación falsa. Se hizo para
enseñar cómo funcionaría el producto antes de que existiera.

## Qué hacemos ahora

Se retira. La carpeta se archiva en `respaldos/demo-2026-09-retirado/` con su LEEME, sin borrarse.

La demostración de venta es **en vivo, en el producto real**: se cargan productos del prospecto y
cobra una venta de prueba. Es lo que el sitio promete en `/demo`, palabra por palabra. Y el sitio
se ilustra con capturas de la app real (`sitio-web/_capturas/`), guionizadas para poder rehacerse
cuando la interfaz cambie.

## Por qué

- **Enseñaba un producto que ya no existe.** Está hecho con los mockups, que dejaron de mandar el
  30/08/2026 ([`0001`](0001-los-mockups-dejan-de-mandar.md)): naranja en vez de azul, cuatro tipos
  de movimiento de caja, la pantalla de extras aparte, comedor por mapa. Un prospecto que viera el
  sitio y luego el demo vería dos productos distintos — y lo notaría justo al cerrar.
- **Ya no cumplía ninguna función.** Nunca estuvo enlazado desde el sitio (los 61 enlaces a
  `/demo` van al formulario de pedir demo). Solo se compartía a mano.
- **Rehacerlo desde la app sería construir una imitación de algo que ya se enseña de verdad.**

## Lo que NO se decide aquí

Si algún día se quiere que un prospecto pruebe solo, sin llamada: la respuesta es un **tenant de
prueba en el POS real** con datos de muestra y reinicio automático — RLS, aislamiento, limpieza
periódica. Es una función de producto con su propio ADR cuando toque, no una carpeta estática.

## Consecuencias

- `demo/` desaparece de la raíz del proyecto. `_build/build.mjs` sigue dentro del archivo y apunta
  a los mockups archivados: regenerar produce, a propósito, el producto viejo.
- Las referencias en `README.md` del repo, el tablero `MEMORY.md` y las memorias de sesión se
  actualizaron en el mismo movimiento.
