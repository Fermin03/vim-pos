# 0031 — Facturama es el único PAC

**Fecha:** 7 de octubre de 2026 · **Estado:** vigente

## Qué había antes

Un selector de PAC "con redundancia" y tres adaptadores: Facturama (principal), Facturapi
(respaldo) y un mock de desarrollo. Con la variable `PAC_RESPALDO` puesta, si el principal fallaba
en transporte se reintentaba el timbrado con el segundo. Así lo describe [0009](0009-el-cfdi-esta-construido-pero-no-activado.md)
y así lo planeaba la especificación (multi-PAC).

## Qué hacemos ahora

Un PAC real, Facturama, y el mock solo si se pide con `PAC_PERMITIR_MOCK=1`.

- `elegirPac()` responde `FACTURAMA`, `MOCK` o `NINGUNO`. Una `FACTURAPI_API_KEY` ya no cuenta.
- No existe `PAC_RESPALDO` ni conmutación: si Facturama no contesta, el timbrado falla y se
  reintenta después por la cola de siempre.
- Se borró `supabase/functions/_shared/pac/facturapi.ts`.

## Por qué

**Facturapi no podía ser respaldo.** Deduce el emisor de su llave. Con una llave global, todo CFDI
habría salido con el RFC de VIM y no con el del restaurante: un comprobante válido ante el SAT a
nombre de quien no vendió. Un respaldo así es peor que esperar.

**Nunca se probó ni se configuró.** El adaptador estaba marcado `@SIN-VERIFICAR`: escrito contra la
documentación, jamás ejecutado contra el servicio. Y en producción nunca hubo `FACTURAPI_API_KEY`
ni `PAC_RESPALDO` (revisado en los secrets el día de esta decisión), así que la conmutación no
podía ocurrir.

**Sin él, la conmutación quedaba vacía.** Los otros valores de `PAC_RESPALDO` eran `facturama` (el
mismo que el principal, se descartaba) y `mock` (solo válido cuando no hay credenciales, que es
justo cuando el principal ya es el mock).

## Consecuencias

- El comportamiento en producción no cambia: ya timbraba solo con Facturama.
- El enum `cfdi_proveedor_pac` de la base conserva `FACTURAPI` y los demás valores. No hay
  migración, y los smokes que usan ese valor siguen igual.
- `timbrarConFailover` pasó a llamarse `timbrar` y dejó de devolver `failover` (7 oct 2026, cuando se
  tocaron los tres handlers de timbrado): era siempre `false` y nadie lo leía.
- Si algún día hace falta un segundo PAC, tiene que ser **multi-emisor** (el emisor en el payload,
  como Facturama) y llevar su propio ADR. La interfaz `PacAdapter` sigue ahí para eso.
