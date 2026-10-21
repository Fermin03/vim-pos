# 0050 — Clip es el segundo proveedor de terminal, y la conexión decide quién cobra

**Fecha:** 20 de octubre de 2026 · **Estado:** vigente · **Amplía** [0033](0033-el-cobro-con-terminal-lo-aplica-la-caja.md).
Construido en local (rama `feat/terminal-clip`); sin producción y sin lector probado.

## Qué había antes

El cobro con terminal hablaba solo con Mercado Pago Point: `terminal-cobro` llamaba directo a su API
y los tokens OAuth del restaurante vivían en Vault (0033).

## Qué hacemos ahora

**El proveedor lo decide la conexión de la caja.** `terminal-cobro` lee la conexión y elige el
adaptador (`_shared/terminal/proveedor.ts`: Mercado Pago o Clip). Lo común (estados, errores,
`DatosCobro`) vive en `comun.ts`. La migración 0260 agrega el proveedor `CLIP`, `propina_opciones`
(los porcentajes que muestra el lector), `terminal_cobros.propina_mxn` y deja `caja_id_externo`
opcional, porque Clip no tiene cajas: basta el número de serie.

**La clave de Clip va en Vault con el mismo mecanismo.** Reusamos `terminal_guardar_tokens`: la API
key entra como *access*, la clave secreta como *refresh*, y sin vencimiento (no caducan). No hay
tabla ni función nueva.

**El aviso de Clip no trae firma, así que nunca se cree.** `terminal-webhook-clip` solo toma el id
del cobro y **siempre confirma consultando a Clip**; lo que diga el aviso no se aplica. Tiene límite
de frecuencia por cobro.

**Sin respuesta del lector, primero se cancela por número de serie.** Si Clip confirma la
cancelación, el cobro queda `RECHAZADO` (`SIN_RESPUESTA`). Si no la confirma, queda en `REVISAR`:
la cajera mira la terminal y decide con PIN. Los tiempos de Clip se mantienen bajo los 25 s del
puente del escritorio.

**Conexión en el admin:** «Conectar Clip» (`terminal-clip-conexion`: conectar, lectores, sucursal,
caja, configurar, desconectar). La caja muestra «Terminal no disponible…» si el lector no está
listo y lo vuelve a preguntar al tocar Tarjeta. Los textos son neutrales: no nombran al proveedor.

## Por qué

Es lo que menos cambia lo ya probado: Mercado Pago sigue igual, y Clip entra como adaptador. El
aviso sin firma no se puede verificar, pero sí se puede **preguntar**; consultar a Clip es más
seguro que pedirle a Clip que se identifique. Cancelar antes de rechazar evita el doble cobro.

## Alternativas descartadas

- **Un proveedor por negocio.** El proveedor va por sucursal: una sucursal puede cobrar con Clip y
  otra del mismo negocio con Mercado Pago. Dentro de una sucursal, todas sus cajas usan la misma cuenta.
- **Una tabla propia para las llaves de Clip.** Vault ya hacía el trabajo.
- **Creer el aviso si trae el estado.** Sin firma, cualquiera puede mandarlo.
- **Rechazar el cobro sin cancelar por serie.** Un cobro que sí pasó se cobraría dos veces.

## Pospuesto a propósito

- **Propina elegida en el lector.** No sabemos cómo regresan `tip_amount` y `amount_paid` hasta ver
  un cobro real. Hoy los porcentajes solo se guardan: el cobro va con `is_tip_enabled: false` y el
  lector no los muestra; la propina de la cuenta se cobra como siempre.
  **Ya construida (21 oct 2026):** Clip confirmó que la propina llega aparte en `tip_amount`. Con el
  interruptor del admin encendido, la caja manda el cobro con `is_tip_enabled` y `tip_options`, fija
  la propina en el ticket y aplica monto + propina. Falta verla con un lector (doc 03 §E).
- **Cobro de prueba de $1 al conectar.** Hasta tener lector.
- **Guía con `curl` y skill `clip-pinpad`.** Salen de la sesión con lector.

## Consecuencias

- La migración necesita `--include-all`: las ramas locales traen 0188–0250.
- Falta todo lo que solo se ve con lector: ver `docs/integraciones/clip-pinpad/03-…`.
- `database.types.ts` se editó a mano; regenerar con `pnpm db:types` antes del PR.
- Clip no tiene ambiente de pruebas: el primer cobro real es la prueba.
