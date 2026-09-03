# Activar facturación real — checklist

Contratado el 3 sep 2026 a las 16:04: «API - anualidad», $1,650 MXN, en la cuenta de producción
`app.facturama.mx` con RFC VIMF0308282D7 (cuenta preexistente de Fermín). El orden importa: un paso saltado deja un comprobante inválido
en manos de un cliente (ADR `docs/decisiones/0009`).

## 1. Contratar (Fermín, con Facturama)

- [x] Cuenta de **producción** en `https://app.facturama.mx` (la de sandbox no sirve; son cuentas
      distintas). RFC de la cuenta: el de VIM (Fermín, persona física). Hecho 3 sep 2026.
- [ ] Correo de la cuenta cambiado a `integraciones@vimpos.com.mx` (Cuentas → datos de la cuenta).
- [ ] Confirmar por escrito que la modalidad **Multiemisor** está activa en la cuenta (Fermín ya
      confirmó que viene incluida en el plan; pedir que lo dejen por correo).
- [ ] Precio por folio: publicado $0.50 (1–10,000). Comprar el primer paquete de folios desde la web
      de Facturama. Nuestro margen: los paquetes VIM van de $2.00 a $1.00 por folio.
- [ ] Guardar usuario y contraseña de la API en el gestor de contraseñas. **Nunca en el chat ni en
      el repo.** Esa credencial vale tanto como los sellos fiscales de todos los clientes juntos.

## 2. Secrets en Supabase (Fermín, dashboard → Edge Functions → Secrets)

| Secret | Valor |
|---|---|
| `FACTURAMA_API_USER` | usuario de la cuenta de producción |
| `FACTURAMA_API_PASSWORD` | contraseña de la cuenta de producción |
| `FACTURAMA_BASE_URL` | `https://api.facturama.mx` |

`elegirPac()` toma Facturama en cuanto existen las dos primeras. Verificar después con un timbrado
de prueba, no con el listado de secrets.

## 3. Emisor de Knock-Out (Fermín con el dueño; admin → Configuración → CFDI)

Estado actual en producción: `tenant_cfdi_emisor` tiene el RFC de Fermín como marcador,
`proveedor_pac = FACTURAPI` y sin sello. Hay que:

- [ ] Capturar RFC, razón social **como aparece en la Constancia, en mayúsculas y sin régimen
      societario** (`SA DE CV` fuera), régimen fiscal y CP del lugar de expedición (la sucursal).
- [ ] Poner `proveedor_pac = FACTURAMA`.
- [ ] Subir el CSD del restaurante (`.cer`, `.key` y contraseña de la llave; **no** la de la
      e.firma). El admin llama a `cargar-csd` → `POST /api-lite/csds` (o `PUT` si ya existía).
- [ ] Verificar vigencia del certificado (la lee `certificado.ts`) y anotar la fecha de caducidad
      (cuatro años): renovarlo es operación normal.
- [ ] Add-on `CFDI` activo y folios acreditados con `acreditar_folios_cfdi` desde `/platform`.
- [ ] Logo del negocio en PNG o JPG para el PDF (`LogoUrl` no acepta SVG).

## 4. Primera prueba real (nosotros, con Fermín mirando)

1. Ticket de $1.00 en la caja, factura individual a un RFC real que controlemos (el de Fermín),
   con CP de su Constancia. Comprobar UUID en el XML y que el PDF y el XML quedaron en Storage.
2. Verificar el CFDI en el portal del SAT (`verificacfdi.facturaelectronica.sat.gob.mx`) con UUID,
   RFC emisor, RFC receptor y total.
3. Enviar por correo desde el admin y confirmar que llega con XML y PDF.
4. **Cancelar** con motivo `02` y confirmar `Status: canceled` y acuse real. Sandbox nunca canceló:
   este es el primer lugar donde se prueba la cancelación de verdad. Confirmar también cuál de las
   dos rutas documentadas cancela (ver `02-vimpos-y-facturama.md`).
5. Factura global del día con el ticket restante (si lo hay) y verificarla en el SAT.
6. Autofactura desde `factura.vimpos.com.mx` con el QR de un ticket.

## 5. Operación continua

- **Saldo de folios de la cuenta Facturama**: se compra en su web y no lo vemos por API. Regla:
  cuando el saldo baje del consumo de un mes, recargar. Anotar en el calendario una revisión mensual
  hasta que haya un aviso automático.
- **Historial de cambios** de Facturama (`guias/historial-actualizaciones.md`): revisión mensual; los
  catálogos del SAT cambian.
- **Caducidad de CSD**: aviso al dueño 60 días antes (pendiente de construir; hoy manual).
- **Datos e incidentes**: el XML y el PDF son datos fiscales del cliente y de su receptor; el
  aviso de privacidad ya cubre facturación. Si Facturama tiene incidente, la cola `tickets_cfdi`
  reintenta; el failover a Facturapi solo aplica a fallos de transporte, y Facturapi no es
  multi-tenant, así que en la práctica el respaldo es esperar.

## 6. Qué decir en el sitio mientras tanto

`vimpos.com.mx` y `agents.md` dicen «activación del PAC en curso». Es correcto hasta que se
complete la sección 4. Al terminar, actualizar sitio, `agents.md`, el ADR 0009 (estado
«superado») y la memoria `project_cfdi_activacion`.
