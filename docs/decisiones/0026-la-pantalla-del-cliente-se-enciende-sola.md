# 0026 — La pantalla del cliente se enciende sola y la caja le publica la cuenta

**Fecha:** 2026-10-02 · **Estado:** vigente

**Supera:** la fila «Display al cliente» de `flujos/01-FLUJOS-COMUNES-CORE.md` §28.2.bis, y con ella
la decisión cerrada 22 de ese documento.

## Qué había

- **Especificación, flujos comunes §28.2.bis:** el «Display al cliente» era un módulo opcional,
  inactivo por omisión, que el negocio activa desde el admin. La decisión cerrada 22 lo dejaba para
  cuando un cliente lo pidiera.
- **La cuenta en captura no está en la base.** Vive solo en memoria de la caja (`useReducer` en
  `home-pos.tsx`) hasta que se envía a cocina o se cobra. Una pantalla que quisiera leerla de la
  base no tendría qué leer.
- **ADR 0014:** los módulos tienen dos capas, VIM permite y el dueño enciende.

## Qué hacemos ahora (entrega 1: solo la caja, sin migración)

1. **No es un módulo ni lleva candado de plan.** Va incluida en todos los planes. La caja la abre
   sola cuando detecta un segundo monitor en la computadora donde corre: al arrancar y cada vez que
   se conecta, se desconecta o cambia un monitor (espera 300 ms a que Windows termine su ráfaga de
   eventos). Con un solo monitor no pasa nada y no se muestra ningún aviso. El rol cocina nunca la
   abre. La ventana es de pantalla completa, sin marco, no recibe foco, no sale en la barra de
   tareas y no lleva el preload del escritorio. El monitor de la caja nunca es candidato, y es el
   que contiene su ventana: si la caja se arrastra al otro monitor, las dos pantallas se
   intercambian.

   **Sigue a la ventana de la caja.** Mandar la caja a la bandeja cierra la pantalla del cliente;
   volver a abrirla la reabre. Minimizarla no la cierra. «Salir» la cierra junto con todo lo demás.

   **Si la ventana muere, se reabre, pero no para siempre.** Una muerte inesperada (se cerró sola,
   murió el proceso que la dibuja, o no cargó la página) se reintenta hasta 5 veces en un minuto.
   A la sexta se anota una vez en el registro y se deja en paz hasta que cambien los monitores, la
   ventana de la caja (mostrarla, moverla) o el ajuste; cualquiera de los tres pone la cuenta en
   cero.

2. **La única configuración es local**, como la impresora: `pantalla-cliente.json` en la carpeta de
   datos de esa computadora, con `modo` (`auto` o `apagada`) y `displayId` (el monitor elegido, para
   quien tiene tres o más). Se cambia en el modal que ahora se llama «Impresoras y pantallas de esta
   caja»; la entrada del menú dice «Configurar impresoras y pantallas». Lo sirve el escritorio en
   `/__pantalla-cliente`, y solo contesta a la propia caja.

3. **La caja le publica la cuenta por `BroadcastChannel`** (`vim-pantalla-cliente`). Las dos
   ventanas son el mismo POS, en la misma computadora y con el mismo origen: se hablan directo, sin
   servidor y sin guardar la cuenta en la base mientras se captura. Los mensajes llevan `v: 1` y la
   vista los valida con Zod; uno que no entiende se ignora y conserva lo último válido.

4. **Lo que se publica se arma campo por campo** en `construirVista`, la única puerta entre la
   venta y el monitor. Nada del carrito se copia tal cual. Nunca salen las notas de cocina ni de la
   orden, el nombre de la cuenta, ni los datos del cliente o del domicilio.

5. **Cuatro fases, y reposo si la caja calla.** Reposo (logo y nombre del negocio), cuenta, cobro y
   pagado. La caja repite su estado cada 5 s mientras no esté en reposo; si la pantalla pasa 15 s
   sin recibir nada, vuelve a reposo. Pagado se muestra mientras la caja enseña su «Cobro completado»,
   con un tope de 8 s: pasado ese tiempo la caja publica reposo aunque su diálogo siga abierto.

6. **Los anuncios (entrega 2, no construida) no irán dentro del snapshot del sync.** Vivirán en un
   almacén de la nube, con una copia local en la caja que se refresca después de cada pull. Con
   anuncios, el reposo mostrará el carrusel; sin ellos sigue siendo el logo y el nombre.

## Por qué

- **Se enciende sola porque el hardware ya dice si hace falta.** Quien atiende un restaurante no
  va a entrar a un menú a elegir pantallas, y lo normal es que haya una sola candidata. La
  configuración existe solo para lo que la detección no puede adivinar: usar el segundo monitor
  para otra cosa, o tener más de uno.
- **Es local por lo mismo que la impresora:** qué monitor es cuál es cosa de cada computadora, y
  una segunda caja en la LAN no tiene por qué heredar el de la primera. Como módulo del ADR 0014
  habría sido un interruptor en el admin, en la nube, para algo que ocurre en una computadora
  concreta.
- **Se cierra con la caja en la bandeja porque la caja casi nunca se cierra de verdad.** Cerrar su
  ventana la manda a la bandeja, y ahí pasa la noche. Si la pantalla del cliente se quedara
  abierta, su bloqueo de suspensión tendría los monitores encendidos para siempre, y una cuenta a
  medio capturar podría seguir a la vista del mostrador con la caja escondida.
- **Pagado tiene tope porque el diálogo de la caja no siempre se cierra solo.** Con impresora se
  cierra a los 5 s. Sin impresora se queda abierto con el recibo en pantalla, y también al imprimir
  una copia, con un aviso de reparto o con un recibo que falló. Sin tope, «¡Gracias!» se quedaba
  frente al siguiente cliente hasta que el cajero cerrara su diálogo.
- **Las reaperturas tienen tope porque una ventana que muere nada más abrir no se arregla
  insistiendo.** Sin tope se recreaba cada 300 ms sin fin y llenaba `vim-pos.log`. Lo que puede
  arreglarla es que algo cambie, y eso es justo lo que vuelve a intentarlo.
- **`BroadcastChannel` y no la base, un IPC o el ui-server.** La cuenta ya vive en memoria de la
  caja. Guardarla en la base solo para que otra ventana la lea sería una escritura más por cada
  toque del cajero en la ruta crítica de la venta. El canal no necesita red, y se prueba en un
  navegador con dos pestañas.
- **Publicar nunca debe poder romper la venta.** Todo envío va dentro de un `try`: sin canal, con
  un canal que falla o sin nadie escuchando, la caja vende igual.
- **Campo por campo y no copiando objetos.** El carrito lleva notas de cocina y los datos de quien
  pide a domicilio. Si el mensaje copiara el objeto, el día que alguien le agregue un campo al
  carrito saldría en un monitor girado hacia el mostrador sin que nadie lo hubiera decidido.
- **Reposo por silencio, no solo por mensaje.** Una caja colgada o recargada a media cuenta no
  avisa que terminó. Sin esta regla, la cuenta de un cliente quedaría a la vista del siguiente.
- **Sin preload a propósito.** El preload expone `__VIM_SALIR`; la pantalla que mira el cliente no
  debe poder apagar la caja. Lo que necesita para hablar con el backend local se lo inyecta el
  ui-server en el HTML.
- **Los anuncios, fuera del snapshot.** Son imágenes (el diseño prevé hasta unos 600 KB cada una) y
  el snapshot es la lista de tablas que baja en cada pull. Un almacén con copia local las lleva a
  la caja una vez y sin tocar el sync. Queda escrito ahora para que no se meta dentro por comodidad.

## Consecuencias

- **Funciona sin internet y sin tocar la venta.** La entrega 1 no lleva migración, ni cambios en
  la web, ni nada en la base: es un instalador de la caja.
- **No sirve para una tablet por red.** `BroadcastChannel` solo conecta ventanas de la misma
  computadora. Una tablet en la LAN necesitaría que el ui-server emitiera la cuenta por SSE, como el
  KDS; eso queda fuera.
- **El POS en navegador no abre ventana.** No hay Electron que la abra, y el apartado del modal no
  se muestra (tampoco en la segunda caja de la LAN, donde la ruta no contesta). Abrir `?cliente` en
  otra pestaña del mismo navegador sirve para ver el diseño, no para operar.
- **Mientras la ventana está abierta, la computadora no apaga las pantallas por inactividad**
  (`prevent-display-sleep`): un monitor que se va a negro frente al cliente parece descompuesto.
  Quien no lo quiera la apaga desde el modal. Con la caja en la bandeja la ventana está cerrada y
  el bloqueo suelto: la computadora vuelve a dormir sus pantallas como siempre.
- **Depende de cuál es el monitor principal de Windows al arrancar.** La caja abre su ventana en el
  principal y la del cliente toma el otro. Si el principal es el que mira al mostrador, las dos
  pantallas arrancan intercambiadas; se corrige en Windows, o arrastrando la caja a su monitor.
- **En «Duplicar» no se abre.** Windows reporta un solo monitor aunque haya dos enchufados. El
  ajuste lo dice («Revisa que Windows esté en «Extender» y no en «Duplicar»»).
- **El cliente ve el mismo monto a pagar que el cajero, con una excepción aceptada:** mientras el
  cajero todavía elige la propina, el cliente ve el monto sin la propina que aún no se confirma. Al
  confirmarla, las dos pantallas coinciden.
- **La ventana, el foco y los monitores no se pueden probar sin dos monitores.** Las pruebas
  automáticas cubren la elección de monitor, el antirrebote, la caja en la bandeja, el tope de
  reaperturas, la limpieza al cerrar, qué entra en `construirVista` (incluido que ningún dato
  privado salga) y las reglas del canal (el silencio de 15 s y el tope de pagado); lo demás está en
  la lista de «Pantalla del cliente» de `desktop/RUNBOOK.md`, que se pasa con cada instalador que
  toque la ventana o la vista.
- **La entrega 2 (anuncios) necesita su propia migración, su propia pantalla en el admin y otro
  instalador.** Nada de eso está hecho; este ADR solo fija dónde vivirán.
