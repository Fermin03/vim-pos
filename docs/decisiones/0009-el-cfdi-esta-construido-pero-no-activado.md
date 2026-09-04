# 0009 — El CFDI está construido y NO está activado

**Fecha:** 31 de agosto de 2026 · **Estado:** SUPERADO el 3 de septiembre de 2026 · se conserva como
historia de por qué el módulo estuvo apagado y qué se comprobó al encenderlo

> **Superado (3 sep 2026).** Facturama de producción contratado (Multiemisor activo), secrets
> puestos y verificados, sello de Knock-Out (RFC de Fermín) cargado, y probado con comprobantes
> reales: timbrado desde el admin (KO1C-2026-000109) y desde el portal público
> (KO1C-2026-000130), correo con XML y PDF, descarga y archivo en Storage, y **cancelación
> confirmada por el SAT** con acuse (`Cancelado sin aceptación`). Lo que se corrigió ese día:
> archivo de XML/PDF/acuse (0098 + `descargar-cfdi`), hora del PAC sin zona, ruta de cancelación
> (`/api-lite/cfdis/{id}?motive=`), CORS del portal. Detalle en
> `docs/integraciones/facturama/02-vimpos-y-facturama.md` y `03-activacion-produccion.md`.
> El paso 5 (quitar los «Muy pronto» del sitio) se hizo el mismo 3 de septiembre de 2026: ya no
> queda ninguno en `sitio-web/`, la prosa habla en presente sin nombrar al PAC, y los `.md` y
> `llms.txt` para agentes están regenerados.

## Por qué existe este documento

Porque hoy esto solo vive en la cabeza de Fermín, y es de las cosas que, mal entendidas, pueden
terminar en un comprobante fiscal inválido en manos de un cliente.

Que la especificación describa el timbrado con detalle (`13-ORQUESTACION-TIMBRADO-CFDI.md`) y que
el código esté completo hace fácil suponer que funciona. **No funciona todavía.**

## Qué SÍ está construido

Prácticamente todo:

- Cinco Edge Functions: `timbrar-cfdi`, `timbrar-global`, `cancelar-cfdi`, `cargar-csd`,
  `autofacturar`.
- Un selector de PAC con redundancia y tres adaptadores: Facturama (principal, el único que sirve
  multi-tenant), Facturapi (respaldo) y un mock de desarrollo.
- Nueve migraciones: orquestación, emisor por tenant, add-on y folios, factura global,
  cancelación, QR en el ticket.
- El portal público de autofactura (`apps/factura`), con validación de régimen contra uso de CFDI.
- **26 pruebas en verde** (`pnpm test:functions`).

## Qué falta, exactamente

**Las credenciales del PAC.** `FACTURAMA_API_USER` y `FACTURAMA_API_PASSWORD` no están
contratadas. Sin ellas, `obtenerPac()` no falla: cae al siguiente de la lista.

Eso es lo peligroso. El mock **simula un timbrado exitoso**: inventa un UUID, arma un XML con la
forma correcta, el CFDI queda en estado `TIMBRADO`, se consume un folio y se le manda el correo
al cliente. No revienta nada. Solo que ese comprobante **no existe ante el SAT**.

En la base queda como `pac_proveedor = 'OTRO'`, que es la única señal de que algo iba mal — y hay
que saber buscarla.

## El estado real en producción (verificado el 31/08/2026)

| Dato | Valor |
|---|---|
| Tenants con el add-on CFDI **activo** | **2** |
| CFDI emitidos, de cualquier tipo, alguna vez | **0** |
| Emisores dados de alta | 1, `estado: ACTIVO`, sin vigencia de CSD registrada |
| PAC anotado en ese emisor | `FACTURAPI` |

`autofacturar` solo exige que el add-on esté activo. **No comprueba que haya CSD ni que el PAC sea
real.** O sea: el camino está abierto para esos dos tenants. Que no haya salido un solo CFDI es
porque nadie lo ha intentado, no porque algo lo impida.

## Lo que el sitio le dice al cliente

*(Vigente hasta el 3 de septiembre de 2026; desde ese día el sitio anuncia la facturación como
disponible.)*

Aquí no hay problema: el sitio **lo dice**. `precios.html`, `funciones.html` y la página dedicada
`facturacion-cfdi.html` marcan la facturación como «Muy pronto», y el home lo explica en voz alta:
*«facturación dice "muy pronto" en vez de fingir que ya está»*.

Se anuncia como incluida en el precio, sin fecha inventada. Esa es la decisión y se sostiene.

## Lo que NO se puede hacer

- **Activar el add-on a un cliente nuevo** sin haber contratado antes el PAC. Activarlo es abrir
  el portal público de autofactura.
- **Dar por bueno un CFDI de pruebas.** Si `pac_proveedor` dice `OTRO`, ese comprobante es del
  mock.
- Suponer que Facturapi sirve de sustituto: deduce el emisor de la llave, así que con una llave
  global **todo saldría con nuestro RFC**, no con el del restaurante. Está para respaldo, no para
  operar.

## Para activarlo

1. Contratar Facturama **Multiemisor** (no la cuenta normal: la multiemisor es la que lleva el
   emisor en el payload y permite timbrar a nombre de cada cliente).
2. Poner `FACTURAMA_API_USER`, `FACTURAMA_API_PASSWORD` y `FACTURAMA_BASE_URL` en los secrets de
   las Edge Functions. **Sin `FACTURAMA_BASE_URL` se apunta al sandbox a propósito**, para que un
   despliegue a medias timbre en pruebas y no contra el SAT de verdad.
3. Cargar el CSD de cada emisor con `cargar-csd`.
4. Timbrar uno real y comprobarlo en el portal del SAT antes de decirle a nadie que ya está.
5. Quitar los «Muy pronto» del sitio. Están en `sitio-web/precios.html` (tres),
   `funciones.html`, `facturacion-cfdi.html`, y la prosa de `index.html` y `nosotros.html` que
   presume de decirlo. Regenerar después los `.md` y `llms.txt` con `pnpm sitio:generar`.
   **Hecho el 3 de septiembre de 2026.**

## La guarda del mock — **hecha el 31/08/2026**

El mock ya no entra solo. Hay que pedirlo con `PAC_PERMITIR_MOCK=1`; sin eso y sin credenciales
reales, `elegirPac()` devuelve `NINGUNO` y no se timbra nada.

Cuando no hay PAC, `timbrarConFailover` devuelve un fallo normal con código `PAC_NO_CONFIGURADO`,
así que el CFDI se marca en `ERROR` por el camino que ya existía y nadie se queda con un
comprobante a medias. El panel recibe un 502 con el motivo; el portal público, un 503 con un
mensaje propio —*«La facturación de este restaurante todavía no está activa. Guarda tu ticket y
pídesela en el negocio»*— porque el mensaje genérico mandaba al comensal a revisar su Constancia
por un fallo que no es suyo.

La decisión vive en `_shared/pac/seleccion.ts`, aparte y sin imports, con **nueve pruebas** que
cubren lo que importa: que media credencial no cuente, que un permiso que no sea exactamente `1`
no valga, y que dejar la variable puesta no degrade un PAC real.

Con esto, un despliegue al que le falte un secret falla ruidoso en vez de emitir facturas falsas.
**Lo que sigue faltando es contratar el PAC** — la guarda no activa nada, solo impide el daño.
