# Facturación

Cómo emitir facturas (CFDI 4.0) con VIM POS: tus datos fiscales, tu sello digital, la autofactura
de tus clientes, la factura global, los folios y la cancelación. Cada sección se entiende sola.

## Cómo dar de alta mis datos fiscales y mi sello digital (CSD)

**Quién:** dueño o administrador · **Dónde:** Panel → Facturación → Datos fiscales · **Plan:** incluida desde el plan Negocio; en Esencial es un extra ([ver precios](https://vimpos.com.mx/precios)) · **Giros:** todos
**Lo piden así:** activar facturación, dar de alta mi RFC, subir mi sello, CSD, certificado, .cer y .key, empezar a facturar

Para facturar necesitas dos cosas: tus datos fiscales y tu sello digital. La pantalla te dice arriba
qué te falta, por ejemplo «Te falta 1 paso para facturar».

**Paso 1 · Tus datos fiscales:**

1. Entra a **Facturación → Datos fiscales**.
2. Llena **«RFC»**, **«Régimen fiscal»**, **«Nombre o razón social»** y **«Código postal fiscal»**,
   tal como aparecen en tu Constancia de Situación Fiscal.
3. Si quieres, escribe un **«Correo para copias»**: a ese correo llega una copia de cada factura.
4. Toca **«Guardar datos»**.

**Paso 2 · Tu sello digital (CSD):**

1. Ten a la mano los dos archivos que te dio el SAT al tramitar tu Certificado de Sello Digital (el
   **.cer** y el **.key**) y su contraseña. **No son los de tu e.firma.**
2. Sube el **«Archivo .cer»** y el **«Archivo .key»**.
3. Escribe la **«Contraseña de la llave privada»**.
4. Toca **«Cargar sello»**.

**Qué pasa después:** con tus datos guardados y tu sello cargado, la facturación queda activa y
arriba de la pantalla sale «Lista para facturar». Ya puedes emitir facturas desde el panel y tus
clientes pueden sacar la suya en el portal (factura.vimpos.com.mx). VIM no guarda tu archivo .key
ni la contraseña.
**Si algo falla:**
- «Revisa el RFC: persona física lleva 13 caracteres; empresa, 12.» → corrige el RFC.
- Si el sello no carga por la contraseña, revisa que sea la del sello digital y no la de tu e.firma.
- «No puedes facturar: el sello venció» → tramita un sello nuevo en el SAT y súbelo con
  **«Reemplazar sello»**.
**Relacionado:** [Cómo se factura solo mi cliente desde el ticket](#cómo-se-factura-solo-mi-cliente-desde-el-ticket)

## Cómo se factura solo mi cliente desde el ticket

**Quién:** el cliente del negocio · **Dónde:** factura.vimpos.com.mx · **Plan:** incluida desde el plan Negocio; en Esencial es un extra ([ver precios](https://vimpos.com.mx/precios)) · **Giros:** todos
**Lo piden así:** autofactura, el cliente quiere factura, portal de facturación, QR del ticket, facturar mi consumo

Tu cliente puede sacar su factura solo, sin pedírtela.

**Para que el ticket traiga el QR:** en el panel, en **Facturación → Datos fiscales → «Ajustes»**,
marca **«Imprimir el QR de autofactura en el ticket»** y toca **«Guardar ajustes»**. El ticket sale
con «¿Necesitas factura? Escanea el código».

**Lo que hace tu cliente:**

1. Escanea el QR del ticket, o entra a factura.vimpos.com.mx y escribe el código del negocio que
   viene en el ticket.
2. En **«Factura tu consumo»**, escribe el **«Folio del ticket»** y, si la pantalla se lo pide, el
   **«Total del ticket»**. Toca **«Continuar»**.
3. Llena **«Tus datos fiscales»**: **«RFC»**, **«Nombre o razón social»**, **«Código postal»**,
   **«Régimen fiscal»** y **«Uso de la factura»**. El **«Correo»** es opcional.
4. Toca **«Emitir factura»**.
5. Sale «Tu factura está lista», con su PDF, su XML y el folio fiscal.

**Qué pasa después:** cada factura que saca tu cliente usa uno de tus folios.
**Si algo falla:**
- Si a tu cliente no le sale la factura, revisa primero el código postal: tiene que ser el de su
  constancia, no el de su casa. Es el error más común.
- El nombre va en mayúsculas, sin “S.A. de C.V.”, con acentos y Ñ.
- «Este ticket ya tiene factura…» → quien la pidió puede descargarla otra vez con su RFC.
- «Este ticket ya no se puede facturar en línea…» → pasó el plazo o ya entró a la factura global.
  El mensaje le dice a tu cliente que vaya al negocio. Revisa el ticket desde el panel.
  [VERIFICAR: qué hace el dueño con un ticket que ya entró a la factura global]
**Relacionado:** [Cómo funciona la factura global](#cómo-funciona-la-factura-global)

## Cómo hacer una factura desde el panel

**Quién:** dueño o administrador · **Dónde:** Panel → Facturación → Facturas · **Plan:** incluida desde el plan Negocio; en Esencial es un extra ([ver precios](https://vimpos.com.mx/precios)) · **Giros:** todos
**Lo piden así:** hacer una factura, facturarle a un cliente, emitir CFDI, timbrar, factura de un ticket

Hazla desde el panel cuando tu cliente te pide la factura a ti en lugar de sacarla él mismo en el
portal (factura.vimpos.com.mx).

1. Entra a **Facturación → Facturas**.
2. Busca el ticket con **«Buscar por folio…»**, o cambia el rango (**«Hoy»**, **«7 días»**, **«30
   días»**, **«90 días»**).
3. En su renglón, toca **«Facturar»**.
4. Llena los datos del cliente: **«RFC del cliente»**, **«Razón social»**, **«Uso CFDI»**,
   **«Régimen fiscal del cliente»**, **«Código postal fiscal»** y **«Forma de pago»**. Si quieres,
   el **«Correo para enviar la factura»**.
5. Toca **«Crear y timbrar CFDI»**.

**Qué pasa después:** sale «CFDI timbrado correctamente». En la lista, el ticket muestra su UUID y
puedes descargar el XML y el PDF. La factura usa uno de tus folios.
**Si algo falla:**
- Si la factura no sale, revisa que el RFC, el nombre y el código postal sean exactamente los de la
  constancia del cliente.
- Si el ticket no aparece, revisa que esté pagado y que el rango de fechas lo incluya.
- «No quedan folios para timbrar…» → se acabaron tus folios. Mira [Cómo saber cuántos folios me quedan](#cómo-saber-cuántos-folios-me-quedan).
**Relacionado:** [Cómo cancelar una factura](#cómo-cancelar-una-factura)

## Cómo funciona la factura global

**Quién:** dueño o administrador · **Dónde:** Panel → Facturación → Facturas → «Factura global» · **Plan:** incluida desde el plan Negocio; en Esencial es un extra ([ver precios](https://vimpos.com.mx/precios)) · **Giros:** todos
**Lo piden así:** factura global, público en general, facturar las ventas del día, XAXX010101000, ventas sin factura

La factura global junta en una sola las ventas del periodo en las que nadie pidió factura. El SAT
pide emitirla dentro de las 24 horas siguientes al cierre del periodo. **VIM no la emite sola: la
emites tú, con un botón.**

**Elige cada cuánto:** en **Facturación → Datos fiscales → «Ajustes»**, busca **«Factura global:
cada cuánto la emites»** y elige «Diario», «Semanal (lunes a domingo)», «Quincenal (1–15 y
16–fin)», «Mensual» o «Bimestral (solo régimen 621)». Toca **«Guardar ajustes»**.

**Para emitirla:**

1. Entra a **Facturación → Facturas**. Arriba está **«Factura global»**.
2. Sale cada periodo pendiente, con cuántas ventas sin factura tiene y cuánto suman.
3. Empieza por el periodo más viejo: toca **«Emitir factura global»**. Puede tardar un minuto.

**Qué pasa después:** los tickets de ese periodo ya no los puede facturar tu cliente en el portal.
La factura global también usa un folio, pero se puede emitir aunque ya no te queden.
**Si algo falla:**
- Si tu cliente ya no puede facturar un ticket, revisa cada cuánto emites la global: con «Diario»,
  el ticket de ayer ya no se puede facturar hoy.
- «Bimestral» solo lo admite el SAT con régimen 621. Con otro régimen, el timbrado se rechaza.
- Si la pantalla dice «Estás al día…», no hay periodos pendientes.
**Relacionado:** [Cómo se factura solo mi cliente desde el ticket](#cómo-se-factura-solo-mi-cliente-desde-el-ticket)

## Cómo saber cuántos folios me quedan

**Quién:** dueño o cajero · **Dónde:** Caja → barra de arriba · **Plan:** Esencial con el extra de facturación: 10 al mes; Negocio: 20; Cadena: 40 ([ver precios](https://vimpos.com.mx/precios)) · **Giros:** todos
**Lo piden así:** folios, cuántas facturas me quedan, se acabaron los folios, comprar folios, paquete de folios

Cada factura timbrada usa un folio: las que emites en el panel y las que tus clientes sacan en el
portal. Tu plan trae folios cada mes.

**Dónde lo ves:** en la caja, en la barra de arriba, por ejemplo “38 folios”. Cuando quedan 25 o
menos dice, por ejemplo, “Quedan 5 folios”, y sin folios, «Sin folios para facturar».

**Qué pasa si se acaban:** las facturas nuevas no se emiten. El panel dice «No quedan folios para
timbrar. Contacta a VIM para acreditar un paquete.» La factura global sí se puede emitir aunque no
queden folios.

**Qué hacer:** escribe al WhatsApp de soporte de VIM, +52 56 6508 3346, para comprar un paquete de
folios. Hazlo con tiempo: los folios se acreditan después de que se registra tu pago.

**Si algo falla:** si el número de la caja no cambia después de facturar, toca **«actualizar»**,
junto al número. Hoy los folios se ven en la caja, no en el panel.
**Relacionado:** [Cómo hacer una factura desde el panel](#cómo-hacer-una-factura-desde-el-panel)

## Cómo cancelar una factura

**Quién:** dueño o administrador · **Dónde:** Panel → Facturación → Facturas · **Plan:** incluida desde el plan Negocio; en Esencial es un extra ([ver precios](https://vimpos.com.mx/precios)) · **Giros:** todos
**Lo piden así:** cancelar factura, anular CFDI, me equivoqué en la factura, refacturar, cancelación SAT

1. Entra a **Facturación → Facturas** y busca el ticket.
2. Toca **«Cancelar»** junto a su UUID.
3. Elige el **«Motivo»**:
   - «02 · Comprobante emitido con errores»: el más común. Úsalo si la factura tiene datos
     equivocados y no vas a hacer otra en su lugar.
   - «01 · Con errores, con comprobante que lo sustituye»: úsalo si vas a hacer otra factura en su
     lugar. Primero emite la correcta y pega su folio fiscal (UUID).
   - «03 · No se llevó a cabo la operación»: la venta se canceló y el cliente no pagó.
   - «04 · Operación ya incluida en la factura global»: la app lo explica como «Se facturó aparte
     algo que ya iba en la global».
4. Toca **«Cancelar factura»**.

**Qué pasa después:** si el SAT la cancela de inmediato, el ticket queda «Cancelado» y puedes bajar
el **«Acuse»**. Si el SAT le pide a tu cliente que acepte la cancelación, queda «Cancelación en
proceso» hasta que responda (tiene 72 horas). Para saber si ya quedó cancelada, toca **«Revisar
cancelación»**.
**Si algo falla:** «Cancelación rechazada» → tu cliente no aceptó y la factura sigue vigente.
Habla con tu cliente.
**Relacionado:** [Cómo hacer una factura desde el panel](#cómo-hacer-una-factura-desde-el-panel)
