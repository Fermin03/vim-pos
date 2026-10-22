# Cobro a pantalla completa — diseño

**Fecha:** 21 oct 2026 · **Pidió:** Fermín · **App:** `apps/pos` (caja)
**Bocetos aprobados:** [`2026-10-21-cobro-pantalla-completa/`](2026-10-21-cobro-pantalla-completa/)
(`boceto-flujo-efectivo.html` y `boceto-tarjeta-transferencia-dividido.html`; abrir en el navegador).

## Por qué

El cobro de hoy es un modal (`modal-cobro.tsx`) que cambia de tamaño en cada paso (560 px,
960 px, 920×700) y el de efectivo junta en una sola tarjeta recibido, cambio, seis billetes,
«pago exacto», teclado y botón. Fermín lo describe como **revoltoso**. La referencia es el cobro de
Square: cada paso ocupa toda la pantalla, una cifra protagonista, una lista limpia de opciones y un
solo botón principal.

**Éxito:** el cajero cobra sin buscar nada en la pantalla; cada paso se ve igual de tamaño y en el
mismo lugar; el modal de efectivo deja de sentirse revuelto.

## Metas

1. Todas las pantallas del cobro, de «Cobrar» a «Cobro completado», son **pantalla completa**
   (cubren la caja entera, 1024×768 típico) y del mismo tamaño en todos los pasos.
2. Se ven como Square **pero con el design system de VIM**: fondo blanco, tokens de
   `packages/ui/tokens.css`, dinero en `font-display` bold `tabular-nums`, azul (`accent`) solo en
   la acción principal. **No** se copia el fondo negro de Square.
3. **La propina se pregunta siempre después de elegir el método de pago**, nunca antes.
4. Transferencia y tarjeta «a mano» **ya no piden monto**: se registran por el total pendiente.
5. Pago dividido en una sola pantalla, sin modal encima para agregar cada pago.

## No metas

- No cambia la lógica de dinero: `lib/cobro.ts`, `lib/cobro-pagos.ts`, `lib/terminal.ts`, las RPC y
  las Edge Functions de terminal se quedan igual. Es un cambio de presentación y de orden de pasos.
- No se agrega dividir la cuenta por persona o por productos (no existe hoy y no entra aquí).
- No cambia la pantalla del cliente (`pantalla-cliente.tsx`); sigue recibiendo `montoCobro` igual.
- No se toca «Cambiar forma de pago» de una cuenta ya cerrada (`modal-cambiar-pago.tsx`): no es
  parte del cobro en curso. *(Decisión de Claude; ver «Decisiones de Claude».)*
- No hay modo oscuro.

## Antimetas (sería un fracaso aunque funcione)

- Que un cobro con terminal se pueda interrumpir con Escape o con un botón de regresar.
- Que la propina se pregunte dos veces (VIM y el lector Clip) en el mismo cobro.
- Que cobrar en efectivo tome más toques que hoy.
- Colores escritos a mano fuera de los tokens (hoy los íconos de `METODOS` y la sombra de
  selección traen hex fijos; en las pantallas nuevas no deben aparecer).

## Reglas que aplican a todas las pantallas

Salen de `docs/diseno/pos.md` y se respetan tal cual:

- **Cabecera fija de 72 px**: a la izquierda el botón de regresar (círculo de 56 px, `←`; en el
  primer paso es `✕` y cierra el cobro), al centro el contexto en `ink-3` («Efectivo · Ticket
  #A-0142»), a la derecha una acción secundaria solo si el paso la tiene. El botón de regresar
  está **siempre en el mismo sitio y tamaño**.
- **Una sola acción azul por pantalla.** Botón principal de 72 px de alto.
- Tacto: todo objetivo ≥ 56 px en el cobro; 8 px mínimo entre «quitar» y cualquier otra acción.
- El total (o la cifra protagonista del paso) es el número más grande de la pantalla.
- **Escape**: regresa al paso anterior; en el primer paso cierra el cobro; **no hace nada** mientras
  se procesa un pago, corre el atajo de efectivo exacto o la terminal está cobrando (igual que hoy
  en `modal-cobro.tsx` l.1371–1381, con `useEscape`/`capaVisible`).
- El teclado físico sigue funcionando en el teclado numérico (dígitos, Backspace, Enter).
- **Sin animación entre pasos** (tokens.css: lo que se toca cientos de veces al día no se anima).
  El paso aparece y ya.
- Cubre también la barra lateral del ticket: la pantalla es una capa `fixed inset-0` sobre todo el
  POS, con fondo `bg`/`surface`.

## El flujo

```
Cobrar ─► 1 ¿Cómo paga? ─► 2 Propina* ─► 3 Efectivo ───────────┐
                     │                 ├► Tarjeta (terminal) ─┤
                     │                 ├► Transferencia ───────┤─► 4 Registrando ─► 5 Cobro completado
                     │                 └► Más: débito/crédito ─┘
                     └► Dividir pago ─► 2 Propina* ─► D Pago dividido ─┘
```

\* La propina se salta si la sucursal no la captura (`sug.capturar === false`) o si el método es
**Tarjeta con un lector que pregunta la propina** (`propina_en_lector`). Ya existe el camino
`propinaAlElegir`/`trasPropina` en `modal-cobro.tsx`: el cambio es usarlo **siempre** en lugar de
abrir en la vista `propina`. Con eso desaparece el tope de 4 s («Cargando…» mientras se averigua si
el lector pregunta la propina), porque el selector ya no depende de esa respuesta para abrirse.

Una propina que ya estaba en el ticket **antes de abrir el cobro** se respeta y no se vuelve a
preguntar (comportamiento actual).

**Regresar y la propina** *(decisión de Claude)*: la propina queda atada al método elegido.

- Regresar desde el paso del método (efectivo, transferencia, dividido…) lleva a la **propina**,
  para poder cambiarla.
- Regresar desde la propina a **«¿Cómo paga?»** deshace la propina elegida en este cobro
  (`establecerPropina(token, ticketId, 0)` o el valor que traía el ticket al abrir) y el paso 1
  vuelve a mostrar el total **sin** esa propina. Al elegir otro método se pregunta de nuevo (o la
  pregunta el lector Clip si el nuevo método es Tarjeta).
- Así nunca queda cobrada una propina que no se confirmó para el método con el que se pagó.

### 1 · ¿Cómo paga?

- Cabecera: `✕` · «Ticket #… · Mesa 4» (o el nombre de la cuenta) · enlace **«Dividir pago»**.
- Centro: el total pendiente a 96 px y debajo «Elige cómo paga el cliente».
- Abajo, lista de filas de 72 px con separadores `line` y chevron, sin íconos de colores:
  **Efectivo**, **Tarjeta** (con subtítulo del estado de la terminal: «Terminal Clip lista» o, en
  `warning`, «Terminal no disponible: enciéndela y abre Clip PinPad»), **Transferencia**, **Más**.
- Sin terminal ligada, «Tarjeta» se parte en **Débito** y **Crédito** (registro a mano), como hoy,
  y **«Más» no aparece**.
- Con terminal ligada, **«Más»** abre una lista igual (misma pantalla, cabecera `←` · «Otra forma
  de pago») con dos filas: **«Débito · a mano»** y **«Crédito · a mano»**, con el subtítulo «La
  cobraste en otra terminal». Reemplaza al botón «La cobré en otra terminal» del pie; no registra
  nada por sí sola. *(Decisión de Claude.)*
- Tocar **Tarjeta** con la terminal «no disponible» vuelve a revisar la terminal (como hoy); si
  sigue sin estar lista, abre «Más». Si todavía no se sabe si el lector pregunta la propina, se
  espera la respuesta de `terminalDeCaja` con «Revisando la terminal…».

### 2 · Propina

- Cabecera: `←` · «{Método} · Ticket #…».
- «¿Agregar propina?» y «Sobre $560.00».
- Tres tarjetas grandes (128 px) con el porcentaje y su monto, de `leerSugerenciasPropina`.
- Abajo, dos botones secundarios: **«Otro monto»** (abre el teclado numérico del paso de efectivo,
  con «Continuar» como acción azul) y **«Sin propina»**.
- **Tocar una opción avanza directo** al método elegido; no hay botón «Confirmar».
- Respeta `sug.libre` y `sug.sin`: si la sucursal los apagó, esos botones no aparecen.

### 3 · Efectivo

- Cabecera: `←` · «Total con propina $616.00» (o «Total» sin propina).
- Dos zonas: a la izquierda las cifras — **Recibido** (80 px, la cifra protagonista), **Cambio**
  en `success` (o **Falta** en `warning` mientras no alcanza) y una fila de atajos; a la derecha el
  teclado (12 teclas de 76 px: 1–9, 00, 0, ⌫).
- **Atajos sugeridos** en lugar de los seis billetes fijos: «Exacto» más hasta cuatro montos
  redondos mayores al total, sin repetir (para $616: $620, $650, $700, $1,000). Tocar uno **fija**
  el recibido a ese monto (hoy los billetes se suman; con montos sugeridos sumar no tiene sentido).
- Botón azul abajo, ancho completo: «Cobrar y dar $384.00 de cambio» / «Cobrar $616.00 exacto»;
  apagado mientras falte dinero.
- El atajo «Efectivo exacto» de la barra del ticket se conserva: si la sucursal captura propina,
  pasa primero por el paso 2 y luego cobra exacto sin mostrar el paso 3.

### Tarjeta (terminal)

- **Cobrando:** sin botón de regresar en la cabecera. Indicador de espera (círculo `accent-soft`
  con punto `accent`, estático), el monto a 88 px, «Cobra en la terminal» y la instrucción de Clip o
  de Mercado Pago. Único botón: «Cancelar cobro». Escape no hace nada.
- **No pasó:** mismo monto en `ink-3`, «El cobro no pasó» en `danger`, el motivo de la terminal;
  botones «Cambiar forma de pago» (secundario) y «Volver a intentar» (azul).
- **No se pudo confirmar:** la misma pantalla con «Sí, dice aprobado» (abre `ModalAutorizacionPin`
  encima, como hoy) y «No pasó, cambiar forma de pago».
- «Mandando el cobro a la terminal…» usa la pantalla de cobrando con ese texto.
- Las fases y su lógica son las de `vista-terminal.tsx`; solo cambia el contenedor y el acomodo.

### Transferencia y «a mano» (débito, crédito)

- Cabecera: `←` · «Transferencia · Ticket #…».
- El total pendiente a 88 px y una línea de ayuda («Revisa que la transferencia ya llegó antes de
  registrarla»; para débito/crédito: «Registra el pago que cobraste en otra terminal»).
- Un botón azul: «Registrar transferencia por $616.00». **Sin teclado**: se aplica el total
  pendiente. Un pago parcial se hace con «Dividir pago». *(Aprobado por Fermín.)*

### D · Pago dividido

- Cabecera: `←` · «Pago dividido · Ticket #…».
- Izquierda: **Falta por cobrar** a 72 px, barra de avance en `success`, «Pagado $X de $Y» y la
  lista de pagos agregados (método, monto, `✕` de 44 px para quitar).
- Derecha: «Siguiente pago» con selector de método (Efectivo / Tarjeta / Transferencia; sin
  terminal: Efectivo / Débito / Crédito / Transferencia; con terminal, «Débito · a mano» y
  «Crédito · a mano» quedan detrás de un «Más»), el monto con el atajo «Todo lo que falta» y el
  teclado. Al entrar, el monto propuesto es lo que falta.
- Abajo: mientras falte dinero, la acción azul es «Agregar $X con {método}» y «Completar cobro» está
  apagado; cuando ya no falta nada, «Completar cobro» pasa a azul y «Agregar» desaparece.
- Al completar, los pagos se aplican en orden (`aplicarPagosEnOrden`); cada pago con terminal
  muestra la pantalla «Cobra en la terminal» por su monto, como hoy (ADR 0033, `pos.md` l.389+).
- Desaparece `ModalAgregarPago`.

### 4 · Registrando pago

- Arriba, «Cambio $384.00 / de $1,000.00» (solo en efectivo con cambio). Centro: indicador de
  carga y «Registrando pago». Se muestra mientras `procesando` es verdadero tras el botón final.

### 5 · Cobro completado

- Reemplaza el modal de `cobro-completado.tsx` por una pantalla completa.
- Sin palomita verde y sin botón arriba a la derecha (*pedido por Fermín*).
- Centro: «Recibió $1,000.00» en `ink-2` y **«$384.00 de cambio»** a 88 px en `success`. Sin cambio:
  «Total $616.00 · sin cambio».
- Abajo: «Imprimir copia» (secundario) y «Nueva venta» (azul), y la cuenta regresiva de 5 s con su
  barra, que se pausa igual que hoy. **La impresión no cambia**: el ticket se sigue imprimiendo solo
  (`autoImprimir`) y el botón saca una copia; el boceto decía «Imprimir ticket» por descuido.
- El error de ticket, si lo hay, se muestra encima de los botones.

## Qué se toca

- `apps/pos/app/components/modal-cobro.tsx`: el contenedor pasa a pantalla completa; cada vista se
  reacomoda; desaparecen `ModalAgregarPago` y el teclado en `VistaOtro`; el orden propina→método
  se invierte.
- `apps/pos/app/components/vista-terminal.tsx`: acomodo nuevo, misma lógica.
- `apps/pos/app/components/cobro-completado.tsx`: pantalla completa.
- `home-pos.tsx`: solo si hace falta para montar la capa sobre todo el POS.
- `docs/diseno/pos.md`: agregar una sección «Cobro a pantalla completa» con las reglas de arriba.
- Pruebas: las de `lib/` no deberían cambiar; si alguna prueba de componente cubre el orden de la
  propina, se actualiza.

## Entrega

- Rama nueva desde `main` (el checkout local está en `feat/tienda-submenus`, atrás de `main`, con
  cambios sin guardar de otras tareas: trabajar en un worktree).
- Es una función nueva de la caja → versión **0.x.0** según `docs/operacion/actualizaciones.md`.
  Antes de publicar, lista de lo que incluye y OK de Fermín.
- Verificar en la caja local con un cobro de cada tipo: efectivo con cambio, efectivo exacto (atajo),
  tarjeta con terminal (si hay una a la mano), transferencia, débito a mano y pago dividido mixto,
  con y sin propina configurada, y con propina en el lector Clip.

## Decisiones de Claude (revisar)

- «Cambiar forma de pago» de una cuenta cerrada queda fuera.
- Los atajos de efectivo **fijan** el recibido en lugar de sumarlo.
- «Más» agrupa débito/crédito a mano y «La cobré en otra terminal».
- Sin animación entre pasos.
- Regresar a «¿Cómo paga?» deshace la propina elegida en este cobro; regresar desde un método
  vuelve a la propina.
- «Más» solo existe con terminal y contiene Débito y Crédito a mano.
- La impresión automática no cambia; el botón es «Imprimir copia».
- El contexto de la cabecera (mesa o nombre de la cuenta) se pasa desde `home-pos`.
- Dentro del pago dividido, «Cobra en la terminal» también es pantalla completa, no una ventana
  encima.

## Queda a criterio de quien lo construya

- Si las vistas se separan en archivos propios o siguen dentro de `modal-cobro.tsx`.
- La regla exacta de los montos sugeridos de efectivo, mientras sean hasta cuatro, mayores al total y
  redondos.
- El texto de ayuda de cada pantalla, siempre corto y sin jerga.

## Agregado el 21 oct: sin vista previa del ticket y «Enviar por correo»

Pedido de Fermín a media construcción:

- **Al terminar la venta ya no se abre la vista previa del ticket**, en ningún giro. Con impresora
  configurada se imprime como siempre; sin impresora no se muestra nada.
- **Sin impresora, «Cobro completado» ofrece «Enviar por correo»** (en lugar de «Imprimir copia»),
  como en Square. Abre una pantalla completa con el correo del cliente y «Enviar». Al enviarse,
  «Cobro completado» dice «Ticket enviado a …». El correo del cliente no se guarda.
- **Cómo viaja:** la caja manda los mismos renglones que imprimiría (`construirTicketJob`, sin logo
  ni corte) a la función `enviar-ticket`, que los valida, los escapa y los manda con el SMTP de VIM
  (`_shared/ticket-correo.ts`). Así el correo sale igual que el papel y la caja de escritorio —cuyo
  ticket puede no haber subido— funciona igual: su gateway reenvía a la nube como el dispositivo.
  El único enlace posible en el correo es el de VIM para facturar.
- **Sin internet** la caja dice «No se pudo enviar: la caja no tiene internet».
