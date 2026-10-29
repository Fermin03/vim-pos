# Equipo físico

Cómo conectar a la caja la impresora, el cajón de dinero, la pantalla del cliente, el lector de
código de barras y la terminal de tarjetas. Cada sección se entiende sola.

## Cómo instalar la impresora en Windows

**Quién:** dueño o encargado · **Dónde:** Windows y Caja → «Configurar impresoras y pantallas» · **Plan:** todos · **Giros:** todos
**Lo piden así:** instalar impresora, impresora USB, conectar la impresora, impresora de tickets, no reconoce la impresora

Úsalo para una impresora de tickets conectada por USB a la computadora de la caja.

1. Instala la impresora en Windows con el programa de su fabricante, como cualquier impresora.
   Confirma que Windows la ve y que imprime una página de prueba.
2. Abre VIM POS y entra con tu PIN.
3. Abre **«Menú»** (en comida rápida, tiendas y belleza, **«Más»**) y toca **«Configurar impresoras
   y pantallas»**.
4. Arriba, elige la estación que vas a configurar: **«Estación 1»** o **«Estación 2»**.
5. Toca **«Instalada en Windows»**.
6. En **«Impresora»**, elige tu impresora de la lista.
7. Elige el **«Ancho de papel»**: 80 mm o 58 mm.
8. Toca **«Imprimir prueba»**. Debe salir un ticket que dice «Si lees esto, la impresora quedo
   lista.»
9. Toca **«Guardar»**.

**Qué pasa después:** la caja imprime tickets y cortes en esa impresora. Esta configuración se
guarda solo en esta computadora: cada caja configura sus impresoras.
**Si algo falla:**
- «No hay impresoras instaladas» → la impresora todavía no está instalada en Windows. Revisa el
  paso 1.
- «Windows no encontró esa impresora. Elígela de nuevo en la lista.» → la quitaron o le cambiaron el
  nombre en Windows. Vuelve a elegirla.
- «Windows no pudo imprimir. Revisa la impresora en el panel de Windows.» → revisa que la impresora
  esté encendida, que tenga papel y que no haya impresiones atoradas en Windows.
- «No se pudieron leer las impresoras. Solo funciona en la caja.» → esta opción solo existe en VIM
  POS instalado en Windows, no en la caja web de la tableta.
**Relacionado:** [Cómo conectar la impresora en la caja](#cómo-conectar-la-impresora-en-la-caja)

## Cómo conectar la impresora en la caja

**Quién:** dueño o encargado · **Dónde:** Caja → «Menú» o «Más» → «Configurar impresoras y pantallas» · **Plan:** todos · **Giros:** todos
**Lo piden así:** impresora de red, impresora con cable de red, IP de la impresora, impresora de cocina, dos impresoras, Epson

En la ventana **«Impresoras y pantallas de esta caja»** eliges el tipo de cada impresora:

- **«En pantalla»:** sin impresora. El ticket se muestra en la pantalla.
- **«Instalada en Windows»:** impresora USB instalada en la computadora
  ([Cómo instalar la impresora en Windows](#cómo-instalar-la-impresora-en-windows)).
- **«Genérica (red)»:** impresora de tickets con cable de red. Escribe la **«IP de la impresora»**
  (sale en su hoja de prueba) y el **«Puerto»** (casi siempre 9100).
- **«Epson (red)»:** impresora Epson en red. Escribe su IP y toca **«Probar conexión»**.

**Para tener una impresora en caja y otra en cocina:**

1. Configura **«Estación 1»** y **«Estación 2»**, una por impresora.
2. En **«¿Qué imprime cada estación?»**, elige a dónde van los **«Tickets y cortes (caja)»** y las
   **«Comandas (cocina)»**.
3. Si diste de alta estaciones de preparación en el panel (por ejemplo bebidas y cocina), en
   **«¿Dónde imprime cada estación de preparación?»** elige la impresora de cada una.
4. Toca **«Guardar»**.

**Qué pasa después:** cada papel sale en su impresora.
**Si algo falla:**
- Si tickets y comandas van a la misma estación, la comanda no sale sola. La caja te lo avisa con
  «Con esta opción, la comanda no sale sola; imprímela cuando la necesites.»
- «No se pudo conectar (revisa IP, puerto y que esté en la misma red).» → la impresora y la
  computadora tienen que estar en la misma red del local. Compara la IP que escribiste con la que
  sale en la hoja de prueba de la impresora.
**Relacionado:** [Qué hacer si no imprime](problemas-comunes.md#qué-hacer-si-no-imprime)

## Cómo abrir el cajón de dinero

**Quién:** supervisor, o cajero con el PIN de un supervisor · **Dónde:** Caja → «Menú» o «Más» → «Abrir cajón» · **Plan:** todos · **Giros:** todos
**Lo piden así:** abrir el cajón, abrir la caja de dinero, el cajón no abre, cajón de efectivo

El cajón de dinero se conecta a la impresora de tickets, y la caja lo abre a través de ella.

1. Abre **«Menú»** (en comida rápida, tiendas y belleza, **«Más»**).
2. Toca **«Abrir cajón»**.
3. Si te lo pide, un supervisor escribe su PIN.

**Qué pasa después:** sale «Cajón abierto». Queda registrado quién lo abrió y cuándo.
**Si algo falla:**
- «Se perdió la conexión de la impresora. Revisa que esté encendida y conectada a la red.» → el
  cajón depende de la impresora. Revisa la impresora primero.
- «El cajón no respondió. Inténtalo de nuevo.» → revisa que el cable del cajón esté bien conectado
  a la impresora.
**Relacionado:** [Cómo conectar la impresora en la caja](#cómo-conectar-la-impresora-en-la-caja)

## Cómo encender la pantalla del cliente

**Quién:** dueño o encargado · **Dónde:** Caja → «Configurar impresoras y pantallas» → «Pantalla del cliente» · **Plan:** todos · **Giros:** todos
**Lo piden así:** pantalla para el cliente, segundo monitor, que el cliente vea el total, display

La pantalla del cliente le muestra la cuenta, el total y el cambio en un segundo monitor.

1. Conecta un segundo monitor a la computadora de la caja.
2. En Windows, configura las pantallas en **«Extender»**, no en «Duplicar».
3. La caja abre sola la pantalla del cliente en el segundo monitor.
4. Para revisarla, abre **«Menú»** (o **«Más»**) → **«Configurar impresoras y pantallas»**. Arriba,
   en **«Pantalla del cliente»**, ves su estado y la casilla **«Encendida»**. Si tienes varios
   monitores, ahí eliges cuál.

**Qué pasa después:** el cliente ve lo que se va agregando, el total a pagar y su cambio. Lo que
cambies en «Pantalla del cliente» se aplica al momento, sin tocar «Guardar».
**Si algo falla:**
- «No se detecta otro monitor. En Windows, elige «Extender», no «Duplicar».» → cambia esa opción en
  la configuración de pantalla de Windows.
- «Apagada.» → marca la casilla **«Encendida»**.
- Si cierras la ventana de la caja con la X, la caja se va a la bandeja de Windows y la pantalla
  del cliente también se cierra. Vuelve a salir cuando abres la caja de nuevo.
**Relacionado:** [Cómo conectar la impresora en la caja](#cómo-conectar-la-impresora-en-la-caja)

## Cómo usar un lector de código de barras

**Quién:** cajero · **Dónde:** Caja → «Cobrar» · **Plan:** todos · **Giros:** tiendas (ropa, abarrotes, frutería, ferretería, vinos)
**Lo piden así:** escáner, lector de códigos, pistola, escanear productos, código de barras

1. Conecta el lector por USB a la computadora de la caja.
2. En la venta, escanea el producto. No hace falta tocar el buscador: la caja lo recibe en cualquier
   momento de la venta.
3. El producto se agrega al ticket.

Si un producto no tiene código, búscalo por nombre en el buscador, donde dice «Escanea o busca por
nombre o SKU…».

**Qué pasa después:** cada escaneo suma una pieza al ticket.
**Si algo falla:** si el producto no aparece, revisa en el panel que tenga su código de barras
capturado en **Menú → Productos**. Para imprimir etiquetas con código, usa **Menú → Etiquetas**.
[VERIFICAR: si el lector también agrega productos en comida rápida y belleza]
**Relacionado:** [Cómo hacer una venta y cobrarla](vender-en-la-caja.md#cómo-hacer-una-venta-y-cobrarla)

## Cómo conectar la terminal de Mercado Pago Point

**Quién:** dueño o administrador · **Dónde:** Panel → Ajustes → Dispositivos → Terminal de tarjetas · **Plan:** todos · **Giros:** todos
**Lo piden así:** conectar Mercado Pago, terminal Point, cobrar con tarjeta desde la caja, ligar la terminal

Con la terminal conectada, la caja le manda el monto a la terminal y, cuando el cliente paga, el
cobro se registra solo en la caja.

1. Entra a **Ajustes → Dispositivos → Terminal de tarjetas** y toca **«Conectar Mercado Pago»**.
2. Entra con la cuenta de Mercado Pago del negocio y autoriza a VIM POS.
3. En la sucursal donde vas a usar la terminal, escribe la **«Ubicación del local»** (la liga de
   Google Maps de tu local o sus coordenadas) y toca **«Usar terminal en esta sucursal»**.
4. En **«Cajas»**, toca **«Agregar terminal»** en la caja que va a cobrar con ella.
5. Enciende la terminal y escanea su código QR con la app de Mercado Pago en tu celular. En la app,
   elige la sucursal y la caja.
6. De vuelta en el panel de VIM, toca **«Ya la ligué, buscarla»** y luego **«Cobrar desde la caja»**.
7. Apaga y enciende la terminal.

**Qué pasa después:** el panel dice «La caja le manda el cobro» y, en la pantalla de cobro de la
caja, sale **«Tarjeta»**. En
la sucursal también eliges si la terminal imprime su comprobante y cuánto tiempo tiene el cliente para pagar en la
terminal.
**Si algo falla:**
- «A la sucursal le falta calle, ciudad o estado…» → completa su dirección en **Ajustes → Mi
  negocio → Sucursales**.
- La terminal de Mercado Pago no pide propina: la caja la pregunta al cobrar.
- Para dejar de usarla, toca **«Desconectar»**. Después puedes seguir cobrando con ella: tecleas el
  monto en la terminal y registras el pago a mano en la caja.
**Relacionado:** [Cómo cobrar con la terminal de tarjetas](vender-en-la-caja.md#cómo-cobrar-con-la-terminal-de-tarjetas)

## Cómo conectar la terminal Clip

**Quién:** dueño o administrador · **Dónde:** Panel → Ajustes → Dispositivos → Terminal de tarjetas · **Plan:** todos · **Giros:** todos
**Lo piden así:** conectar Clip, lector Clip, Clip PinPad, cobrar con Clip desde la caja

Necesitas un lector Clip (la terminal) con la app **Clip PinPad** instalada.

1. En tu cuenta de Clip, entra a **Panel de Desarrollador → Credenciales**, crea una credencial nueva
   solo para VIM POS. Copia la API key y la clave secreta: las vas a pegar en el panel de VIM.
2. En el panel de VIM, entra a **Ajustes → Dispositivos → Terminal de tarjetas** y toca
   **«Conectar Clip»**.
3. Pega la **«API key»** y la **«Clave secreta»** y toca **«Conectar Clip»**.
4. En la sucursal donde vas a cobrar con Clip, toca **«Usar terminal en esta sucursal»**.
5. En cada caja que va a cobrar con Clip, abre **«Elige un lector»**, escoge el número de serie de tu
   lector y toca **«Usar este lector»**.

**Qué pasa después:** al cobrar, la caja manda el monto al lector. En la sucursal eliges si el
lector imprime su comprobante, cuánto tiempo tiene el cliente para pagar y si **el cliente elige la propina en la
terminal** (con hasta tres porcentajes). Si la elige en la terminal, la caja ya no la pregunta.
**Si algo falla:**
- «Clip no reconoció la API key o la clave secreta…» → cópialas otra vez desde Clip.
- Si no sale ningún lector en **«Elige un lector»**, falta que Clip le instale la app Clip PinPad.
  Escribe a Clip con el número de serie del lector; el panel te dice a qué correo.
- «Terminal no disponible: enciéndela y abre Clip PinPad» → enciende el lector y abre la app.
**Relacionado:** [Cómo cobrar con la terminal de tarjetas](vender-en-la-caja.md#cómo-cobrar-con-la-terminal-de-tarjetas)
