# Clip PinPad — documentación capturada y diseño del cobro con terminal en VIM POS

**Fecha de captura:** 8 de octubre de 2026 · **Estado:** sesión de aprendizaje; no hay código, ni
credenciales, ni lector compatible.

La API de PinPad de Clip permite que un sistema que no corre en la terminal le mande un cobro: la
caja envía el monto, el lector despierta y cobra, y el resultado regresa al ticket. Es el **segundo
proveedor** de terminal integrada, después de Mercado Pago Point (`../mercado-pago-point/`), y se
monta sobre el mismo diseño. Esta carpeta guarda la documentación pública de Clip tal como estaba
el 8 de octubre de 2026, más los resúmenes y el diseño para construir sin volver al portal.

> Orden de construcción vigente (decisión del dueño, 8 oct 2026): Mercado Pago, luego **Clip**,
> luego Netpay. Esto es el estudio previo.

## Empieza por aquí

| Documento | Qué es |
|---|---|
| [`01-resumen-api.md`](01-resumen-api.md) | La API en 10 minutos: credenciales, requisitos del lector, crear-consultar-cancelar un cobro, propina y preferencias, avisos, estado del lector, devoluciones, pruebas |
| [`02-diseno-integracion-vimpos.md`](02-diseno-integracion-vimpos.md) | **Cómo entra en VIM POS**: qué se comparte con el diseño de Mercado Pago, qué cambia, conexión del restaurante, flujo de cobro, seguridad. Incluye la comparativa de los dos proveedores |
| [`03-preguntas-abiertas-y-siguientes-pasos.md`](03-preguntas-abiertas-y-siguientes-pasos.md) | Trámites del dueño, decisiones pendientes y dudas que solo se resuelven con un lector en la mano |

## Documentación capturada (fuente de verdad)

Fuente: <https://developer.clip.mx> (portal en español). Cada archivo lleva en la primera línea la
URL de origen y la fecha; lo demás es el texto **tal cual** lo sirve el portal. Cuando el resumen y
la fuente capturada no coincidan, manda la fuente capturada.

- `referencia-api/` — 35 páginas de la sección «Desarrolladores»:
  - **API de PinPad** (15): `introducción-a-la-api-de-pinpad`, `post_payment-1` (crear intención
    de pago), `get_payment` (consultar), `delete_payment-pinpad-request-id-1` y
    `delete_payment-serial-number-serial-number-id-1` (cancelar), `health-check`,
    `get_f2f-pinpad-v1-devices-status` (estado de lectores), `post_devices` y
    `get_devices-serial-number-preferences` (preferencias), `modo-kiosko`,
    `timeout-de-inactividad-1`, `habilitar-mostrar-sobre-otras-aplicaciones` (Clip Wakeup),
    `redireccionar-a-mi-app-después-de-la-transacción`, `webhook`, `notificación-de-resultados`.
  - **Comunes** (4): `token-de-autenticacion`, `pruebas`, `kyc`, `pci-compliance`.
  - **Reembolsos** (3), **transacciones** (2), **depósitos** (3), `referencia-postback-webhook`.
  - **SDK Terminal** (7): la otra vía, para una app Android **dentro** del lector. No es la
    nuestra; se capturó para no tener que volver si algún día hay app de mesero.
- `guias/` — 10 páginas: `api-de-pinpad`, `sdk-terminal`,
  `conciliacion-de-transacciones-apis-1`, `getting-started`, y de la sección «Pages»:
  preguntas frecuentes, demos de PinPad, soporte a desarrolladores, validación de credenciales y
  guías de solución.

Las páginas de endpoints traen al final la **definición OpenAPI completa** en JSON (parámetros,
respuestas y ejemplos): es la parte más confiable de cada archivo.

### Lo que la captura no trae

- **El token de ejemplo de `token-de-autenticacion.md`.** Es público, pero el escáner de secretos
  del repositorio lo marca; se sustituyó por `<TOKEN_DE_EJEMPLO_OMITIDO>` (tres apariciones). Es el
  único cambio hecho al texto capturado.
- **Imágenes y diagramas.** Quedan como enlace a `files.readme.io`; no se copiaron.
- **Checkout** (redireccionado, transparente, embebido), su SDK y los plugins de tiendas en línea:
  son cobro por internet, no aplican.
- **El demo descargable de PinPad** (`guias/demos-técnicos-pinpad.md` solo trae el texto).
- **Comisiones y plazos de depósito:** no están en el portal de desarrolladores.

## Qué NO está aquí

- Credenciales. No existen todavía (documento 03).
- Código. Esta sesión fue solo de aprendizaje.
- Nada verificado contra la API. Con Clip eso pesa más que con Mercado Pago: **no hay ambiente de
  pruebas para PinPad**, así que nada se puede comprobar sin un lector real.

## Cómo se capturó (para repetirlo cuando cambie)

- El portal es de ReadMe y sirve cada página como Markdown agregando **`.md`** a la URL, en
  español y completa. No hizo falta convertir HTML.
- El índice de todo lo que existe está en <https://developer.clip.mx/llms.txt>; de ahí salió la lista.
- Varias direcciones llevan acentos (`introducción-a-la-api-de-pinpad`): hay que codificarlas
  (`encodeURI`) antes de pedirlas. Los archivos conservan el nombre con acento.
- Desde esta máquina `curl` necesita `--ssl-no-revoke` (el antivirus intercepta TLS).
- Cada página trae en el encabezado `updatedAt`: sirve para saber qué cambió desde esta captura.
