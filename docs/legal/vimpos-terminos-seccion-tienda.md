# Términos del servicio de VIM POS — sección nueva: «Tu tienda en línea»

> **BORRADOR — requiere revisión de una persona con criterio legal antes de publicarse.**
>
> Lo escribió Claude el 9 oct 2026. **No es asesoría legal** y nadie con formación jurídica lo ha
> leído. No está publicado: `sitio-web/terminos.html` sigue como estaba (última actualización, 1 de
> octubre de 2026) y no tiene sección de tienda.

**A quién va dirigido.** Al restaurante que contrata VIM POS, no al comensal. Está escrito en el
mismo tono que el resto de los términos (de tú, en llano) y con el molde de la sección «Apps de
reparto», que es la más parecida.

**Dónde iría.** En `sitio-web/terminos.html`, después de «Apps de reparto» y antes de
«Disponibilidad y soporte».

**Qué hay que hacer el día que se publique** (está en la lista de encendido, paso 6.5): cambiar la
fecha de «Última actualización», subir la versión de términos que se le guarda a cada negocio al
registrarse (hoy `2026-10-01`), regenerar el sitio, y avisar a los clientes con 30 días si el
cambio les afecta —los propios términos lo prometen—. Ver [`LEEME.md`](LEEME.md), decisión 4.

Las notas `> Nota para quien revisa:` no son parte del texto.

---

## Tu tienda en línea

Con la tienda en línea tus clientes te piden desde su teléfono, para recoger o a domicilio, en una
página con tu nombre y tu menú, y el pedido llega a tu caja. Es opcional: la enciendes tú desde el
panel y la apagas cuando quieras. Está incluida desde el plan Negocio; en Esencial se contrata como
extra, con el precio de la página de precios.

**La tienda es tuya; nosotros somos el sistema.** Quien vende, prepara, entrega, cobra y responde
ante el cliente eres tú. Nosotros ponemos la página y hacemos que el pedido llegue a tu caja. No
somos parte de la venta ni representamos a tu negocio ante tus clientes.

**No cobramos comisión por pedido.** Pagas tu plan (o el extra) y nada más, vendas lo que vendas.
**El dinero no pasa por nosotros:** tu cliente te paga a ti al recibir, en efectivo o en tu
terminal. Hoy la tienda no cobra en línea.

**Los datos de tus clientes son tuyos, y tú respondes por ellos.** Para que alguien te pida, la
tienda le pide su nombre, su teléfono y, según el caso, su correo y su dirección; si crea una
cuenta, también una contraseña. Ante la ley de protección de datos personales, **el responsable de
esos datos eres tú**; nosotros los guardamos y los procesamos por encargo tuyo, solo para prestarte
el servicio. En concreto:

- No los usamos para nada nuestro, no los vendemos, no se los damos a nadie y no los cruzamos con
  los de otros negocios.
- Tu tienda enseña un aviso de privacidad y unas condiciones para pedir **a tu nombre**. Nosotros
  ponemos la plantilla, que describe cómo funciona el sistema; **tú nos das tu razón social o tu
  nombre completo, tu domicilio y un medio de contacto**, y revisas que lo que dice el aviso sea
  cierto para tu negocio. Si usas los datos de tus clientes para algo más —mandarles promociones,
  por ejemplo—, eso lo decides tú y te toca a ti informarlo y pedir permiso.
- Si un cliente te pide ver, corregir o borrar sus datos, **te toca a ti atenderlo**, en los plazos
  de la ley. Lo que puedes hacer tú mismo en el sistema, lo haces ahí; para lo que no, nos escribes
  y lo aplicamos nosotros.
- A los 30 días borramos de cada pedido en línea el nombre, el teléfono, el correo, la dirección y
  las notas del cliente; dejamos lo que pidió y su importe, para tus reportes. Lo que se queda en
  tu sistema de ventas —el cliente en tu lista de clientes y la cuenta de esa venta— es tuyo y lo
  conservas tú.
- Si llegáramos a saber de un acceso indebido a los datos de tus clientes, te avisamos sin demora
  para que puedas avisarles tú.

> Nota para quien revisa: la ley pide que la relación responsable–encargado conste en un
> instrumento con ciertas cláusulas (instrucciones, confidencialidad, medidas de seguridad,
> devolución o supresión al terminar, subcontratación). Decidir si estos párrafos bastan o hace
> falta un anexo aparte. Los subencargados reales hoy son Supabase (base de datos) y Vercel
> (alojamiento de la página), además de Cloudflare (antirobot) y el servicio de correo.
>
> Nota para quien revisa: «nos das tu razón social, tu domicilio y un medio de contacto» **hoy no
> se puede hacer en el sistema**: no hay dónde capturarlos. Ver `LEEME.md`, decisión 1. «Te avisamos
> sin demora» tampoco tiene un procedimiento escrito.

**Lo que te toca a ti.**

- **Que alguien atienda.** La tienda solo recibe pedidos con un turno abierto en tu caja y con
  internet. Un pedido que nadie acepta en el tiempo que tú configuraste se cancela solo, y el
  cliente lo ve. Un cliente al que no le contestan no vuelve: si no puedes atender, pausa la tienda
  o apágala.
- **Que tu menú diga la verdad.** Precios, fotos, descripciones y lo que está agotado los pones tú.
  Lo que el cliente ve como total es lo que le cobras.
- **Tus obligaciones como vendedor.** Lo que vendes, cómo lo entregas, tus devoluciones, tus
  facturas y tus impuestos son tuyos, igual que en el mostrador.
- **Tu caja al día.** La tienda necesita la versión de la caja que la soporta; si tu caja no está
  actualizada, no recibe los pedidos.

**Lo que no se vale.** Vender en tu tienda algo ilegal o algo que no puedes vender; usar los datos
de tus clientes para molestarlos o para dárselos a otros; hacerte pasar por otro negocio; o usar la
tienda para engañar a quien te pide. Si pasa, podemos apagar tu tienda, avisándote antes salvo que
sea urgente o la ley nos obligue a otra cosa. La dirección de tu tienda
(`pedidos.vimpos.com.mx/tu-negocio`) la eliges tú entre las que estén libres; no puede usar el
nombre de otro negocio.

**Disponibilidad.** Aplica lo mismo que al resto del servicio: hacemos nuestro mejor esfuerzo y no
prometemos un porcentaje. La tienda, a diferencia de tu caja, **necesita internet**: si se cae el
tuyo o se cae la página, tus clientes no pueden pedir, y tu caja sigue cobrando como siempre. Para
proteger a todos, la tienda limita cuántos pedidos puede recibir un mismo negocio por hora y
cuántos puede hacer una misma persona; si un día te quedas corto, escríbenos.

**Si cancelas o cambias de plan.** Si cambias a un plan que no incluye la tienda, o cancelas el
extra o el servicio, tu tienda se apaga y su dirección deja de funcionar. Los pedidos y los
clientes que ya están en tu sistema se quedan contigo, con las mismas reglas del apartado «Tus
datos son tuyos».

> Nota para quien revisa: falta decidir qué pasa con **las cuentas de los comensales** cuando un
> restaurante cancela: hoy se quedan guardadas mientras exista el negocio en el sistema y nadie le
> avisa al comensal. También qué pasa con la dirección de una tienda: mientras el negocio la tenga
> configurada nadie más puede tomarla, pero si la cambia, la anterior queda libre de inmediato para
> otro negocio (podría haber QR impresos apuntando a ella).
>
> Nota para quien revisa: el límite de responsabilidad general de los términos (lo pagado en los
> últimos 3 meses) aplicaría también a la tienda. Confirmar que cubre el caso de un incidente con
> datos de comensales, donde el responsable ante ellos es el restaurante.
