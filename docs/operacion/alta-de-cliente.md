# Alta de cliente nuevo: de "dijo que sí" a la primera venta

> Para quien opera VIM. Describe el producto **como está hoy** (1 oct 2026, con las migraciones
> 0145–0148). Si una pantalla ya no dice lo que dice aquí, manda la pantalla: corrige este
> documento en el mismo cambio.
>
> Dónde se hace cada cosa:
> **Panel de VIM** = `https://platform.vimpos.com.mx` · **Panel del dueño** = `https://admin.vimpos.com.mx`

## Antes de empezar: lo que hay que saber del cliente

- [ ] Nombre del negocio, giro, y **cuántas cajas y cuántas sucursales**. Eso decide el plan:
      una caja → **Esencial** ($699) · hasta tres cajas en una sucursal → **Negocio** ($999) ·
      varias sucursales → **Cadena** ($1,999). Todo más IVA.
- [ ] Nombre, **correo** (ahí llega su acceso) y WhatsApp del dueño.
- [ ] Si va a **facturar** y si quiere **Uber Eats** en la caja.
- [ ] Qué equipo tiene: computadora con **Windows 10 u 11** e impresora de tickets **de red**
      (Ethernet o Wi-Fi). **Las impresoras USB no funcionan.** Si no tiene, que la compre antes del
      día de arranque: es lo que más se compra mal.

Si llegó por el formulario de demo, está en **Panel de VIM → Prospectos**. Muévelo de estado
conforme avanza; al dar de alta al cliente desde ahí queda como **Ganado** solo.

---

## 1. Dar de alta el negocio

Hay dos caminos. Los dos dejan al negocio **en prueba 30 días** desde ese momento.

### Camino A — Se registra él solo

1. Mándale `https://admin.vimpos.com.mx/registro` (el sitio lo enlaza como "Pruébalo 30 días gratis").
2. Captura negocio, nombre, WhatsApp, correo, ciudad y contraseña, y acepta los términos.
3. Le llega un correo **"Confirma tu correo"**. Hasta que abra ese enlace no puede entrar.
4. A VIM le llega un aviso por correo de cada alta. Queda en plan **Esencial** (o **Cadena** si
   eligió el giro "Cadena"); si le toca otro, cámbialo (sección 3).

### Camino B — Lo das de alta tú

1. **Panel de VIM → Nuevo cliente** (o **Prospectos → Convertir en cliente…**, que llena el
   negocio, la persona, el teléfono, el giro y el plan sugerido).
2. Revisa el **código**: sale del nombre y va en direcciones y datos. Corregirlo después es caro.
3. Elige el plan y captura nombre y **correo** del dueño. **Provisionar cliente.**
4. Al dueño le llega una **invitación**; al abrirla crea su contraseña.

### Si el correo no le llegó

- [ ] Que revise spam y que el correo esté bien escrito.
- [ ] **Ficha del cliente → Contrato → Alta**: si dice "No ha confirmado su correo", pulsa
      **Reenviar invitación** (o **Reenviar confirmación**, según el camino). Uno por minuto,
      cinco por hora. Cuando ya confirmó, ahí mismo dice "Correo confirmado el …".
- [ ] Si el correo estaba mal escrito no hay cómo corregirlo: cancela y elimina esa alta
      (sección 9) —eso libera el código del negocio— y repítela con el correo correcto.

Con la cuenta confirmada le sale **un correo de bienvenida** con los primeros pasos, la descarga
de la caja, el equipo que hace falta, cómo se paga y el WhatsApp de soporte. Mándale además el
mensaje 8 de `lanzamiento/02-mensajes-whatsapp.md`.

---

## 2. Lo que ve el dueño al entrar

Su panel abre en **Primeros pasos**, que se van marcando solos:

1. **Datos del negocio** — nombre, zona horaria y hora de corte.
2. **Tu menú** — importar o capturar productos.
3. **Tu caja** — dar de alta el punto de cobro (su sucursal se crea con ella).
4. **Conecta la computadora de tu caja** — descargar, instalar y vincular (sección 5).
5. **Tu equipo** — cajeros y cocina con su PIN.
6. *Facturación* — opcional (sección 6).

Arriba del panel ve el aviso de su **prueba gratis** con la fecha en que termina. En
**Configuración → Plan y pagos** ve su plan, lo que tiene contratado con su total al mes, cuándo
le toca pagar, los datos para transferir y sus pagos registrados.

Para ver exactamente lo que él ve: **Ficha → Entrar como este cliente** (pide motivo; queda en la
bitácora).

---

## 3. Contrato: plan, prueba, cobro y pagos

Todo en **Panel de VIM → Clientes → (el cliente) → Contrato**.

### Cambiar de plan

- [ ] **Cambiar plan…** enseña antes de confirmar lo que cambia: folios del mes, lo que gana o
      pierde, y el cobro antes → después. Los extras (sucursales y cajas adicionales) se
      conservan, salvo los que el plan nuevo deja sin sentido.

### La prueba

- 30 días desde el alta. **No bloquea nada**: al vencer solo avisa, a él y a ti (Atención →
  "Prueba vencida sin cobro").
- [ ] Para dar más días: **Prueba gratis → Extender prueba…** (hasta seis meses; pide motivo).

### Activar el cobro — con la promoción del piloto

Cuando dice que se queda:

1. **Cobro → Activar cobro…**
2. Precio de lista del plan y **"Se cobra: cada mes"**.
3. Si es uno de los cinco del piloto (**solo Esencial**): pulsa **"Piloto 5 negocios: $499 por
   6 meses"**. Quedan seis pagos a $499 y el séptimo ya a $699; el regreso al precio de lista
   queda programado, nadie tiene que acordarse.
4. Motivo y **Activar**.

**El cobro es por adelantado: el primer pago vence ese mismo día** y cubre el mes que empieza.
Activa el cobro el día que de verdad vaya a pagar, no antes.

### Registrar un pago

1. Te manda el comprobante por WhatsApp.
2. **Contrato → Pagos → Registrar pago**: el monto ya viene propuesto (plan + add-ons y extras),
   método, fecha y referencia. Puedes registrar varios meses de una vez.
3. La fecha del siguiente cobro avanza sola. Si te equivocaste, **Anular** el último pago (con motivo).

### Mes de cortesía por referido (a mano)

La regla: **un mes gratis por cada recomendado que contrate y ya esté vendiendo**, aplicado en el
siguiente cobro de quien recomendó. No hay botón; se hace con lo que existe.

**No se puede registrar un pago en $0**: "Registrar pago" exige un monto mayor a cero (la pantalla,
la función y la tabla lo rechazan). Así que el mes de cortesía no se registra como pago; se
**pausa** el cobro ese mes y el pago siguiente cubre dos:

1. **El día que le tocaba pagar** el mes de cortesía: **Contrato → Cobro → Pausar cobro…**, con el
   motivo **"Mes de cortesía por referido de [negocio recomendado]"**. Eso es lo que queda en la
   bitácora. En pausa no sale como "Cobro vencido" en Atención, su caja sigue vendiendo y él ve
   "Cobro en pausa" en su panel, no un aviso de pago vencido.
2. Anótalo también en **Notas internas** (quién recomendó a quién y qué mes fue).
3. **Al mes siguiente**, cuando pague: **Reanudar cobro…** y luego **Registrar pago** con
   **Meses = 2**, **Monto = lo de UN mes** y, en Notas del pago, "Incluye mes de cortesía por
   referido de [negocio]". El panel avisará de que lo acordado por dos meses es el doble: es lo
   esperado. La fecha del siguiente cobro avanza los dos meses y queda donde debe.

No lo dejes en "pausa" más de ese mes: en pausa no hay alerta que te recuerde cobrarle.

---

## 4. Add-ons y extras

En **Contrato**. Lo que se activa aquí se suma al total que ve el dueño en Plan y pagos.

| Qué | Precio | Notas |
|---|---|---|
| **Facturación electrónica** (CFDI) | $349/mes en Esencial; incluida en Negocio y Cadena | Los folios se compran aparte por paquete (Ficha → Facturación). Activarlo solo le da permiso: el sello lo sube él (sección 6). |
| **Apps de delivery** (Uber Eats) | $100/mes en Esencial; incluido desde Negocio | Después de activarlo, el dueño lo enciende y conecta su tienda en **Configuración → Integraciones**. Ver `delivery-uber-sandbox.md`. |
| **Sucursal adicional** | $599/mes por cada sucursal adicional | En **Extras**. Cada una es una sucursal más. |
| **Caja adicional** | $249/mes por cada caja nueva que abra | En **Extras**. Es **una caja**, en la sucursal que sea — no una por sucursal. En Cadena no aplica: sus cajas ya son sin límite. |

**Cómo se cuentan las cajas.** El plan da un número de cajas **por sucursal** (Esencial 1,
Negocio 3). Cada caja que abra por encima de eso, en cualquier sucursal, ocupa una **caja
adicional**. El panel lo dice así: *"1 caja por sucursal + 2 cajas adicionales (1 en uso)"*.
Ejemplo: dos sucursales en un plan de 1 caja por sucursal y **una** adicional → puede tener tres
cajas en total (la tercera, en la sucursal que quiera); la cuarta se rechaza hasta contratar otra.

- [ ] **Crecer se vende como extra, no como excepción.** En **Módulos y límites** se puede subir
      un límite a mano, pero eso es una **"Excepción sin cobro"**: solo para una cortesía o algo
      temporal, siempre con motivo. Si el cliente va a pagar por la caja o la sucursal, es un extra.
- [ ] **Extras → Agregar… / Cambiar…**: cantidad, precio por unidad y motivo. El diálogo enseña
      el límite y el total al mes, antes → después.
- [ ] Al **bajar de plan**, si las cajas que ya tiene abiertas no caben (ni con sus adicionales),
      el panel rechaza el cambio y dice cuántas sobran: o contrata las que faltan o desactiva cajas.
- [ ] Para **quitar** un extra, primero tiene que desactivar la caja o la sucursal de más; si no,
      el panel lo rechaza y dice cuántas sobran.
- [ ] **Inventario, recetas y mermas** vienen desde **Negocio**. En Esencial el dueño ve la
      sección con una explicación y un botón para escribirte. Si se lo quieres dar de cortesía:
      **Contrato → Módulos que puede usar → Recetas e inventario → Permitir** (con motivo).

---

## 5. Instalar y vincular la caja

Lo hace el dueño (o tú con él por videollamada), **en la computadora donde va a cobrar**.

- [ ] En su panel: **Configuración → Cajas**. Si no hay caja, la da de alta.
- [ ] **Configuración → Cajas → Descargar** → **Descargar VIM POS**. Ese día sí necesita internet.
- [ ] Al abrir el instalador, Windows puede decir **"Windows protegió tu PC"** (SmartScreen): es
      porque el instalador aún no lleva firma. **Más información → Ejecutar de todas formas.**
- [ ] Abre **VIM POS** desde el escritorio. Pide vincular.
- [ ] En el panel, **Configuración → Cajas → Vincular** en su caja: muestra un **identificador** y
      una **clave**, una sola vez. Se capturan en la caja. (Si se pierden, se genera otra; la
      anterior deja de servir.)
- [ ] **Impresora**: conectada a la **misma red** que la computadora. En la caja, **menú →
      Configurar impresora** pide su **IP** (sale del autotest de la impresora; puerto 9100).
      Probar hasta que diga "Impresora lista". El cajón va conectado a la impresora.
- [ ] ¿Pantalla en cocina? El mismo instalador deja **VIM POS Cocina**; se instala en esa
      computadora, en la misma red.

**Cómo saber que quedó:** en la ficha, **Operación** enseña la caja con su versión y "en línea".
Una caja que nunca ha conectado no aparece viva; si pasan tres días del alta sin una sola venta,
sale en Atención como "Nunca ha vendido".

---

## 6. Facturación (solo si va a facturar)

1. Que tenga el add-on de **Facturación electrónica** (sección 4).
2. El dueño, en **Configuración → Facturación**, hace tres pasos en orden:
   - **Sus datos**: RFC, razón social, régimen y código postal, tal como en su Constancia.
   - **Su sello digital (CSD)**: archivo `.cer`, archivo `.key` y la contraseña de la llave.
     **No es la e.firma.** Al subirlo bien, el sistema da por **verificado** ese RFC: es lo único
     que prueba que el RFC es suyo, y sin eso no se timbra nada.
   - **Activar.**
3. Compra de folios: **Ficha → Facturación → Acreditar paquete de folios** cuando te pague el paquete.
4. Prueba: una venta real pequeña → el cliente final escanea el código del ticket y se factura
   solo en `https://factura.vimpos.com.mx`.

En **Panel de VIM → Facturación** ves a todos los que facturan, sus folios y los sellos por
vencer (avisa 30 días antes; el dueño también lo ve en su panel).

---

## 7. Lista del día uno

Lo mejor es arrancar en su día más tranquilo, no en viernes.

- [ ] Menú cargado y revisado (precios, modificadores).
- [ ] Cajeros con su PIN; entran en la caja.
- [ ] **Abrir turno** con fondo.
- [ ] Una venta de prueba: varios productos, cobro en efectivo con cambio y uno con tarjeta.
- [ ] El ticket sale impreso y el cajón abre. La comanda llega a cocina (impresa o en pantalla).
- [ ] **Desconectar el internet** y cobrar otra venta: tiene que cobrar e imprimir igual.
      Reconectar y ver que la venta aparece en su panel.
- [ ] Cancelar un producto y un ticket, con autorización.
- [ ] **Cerrar el turno** y revisar que el corte cuadre con el efectivo.
- [ ] Si factura: una factura de prueba.
- [ ] En la ficha: **Contrato → Alta → Marcar en operación**.

---

## 8. Si no paga

**No hay días de tolerancia.** Los avisos van antes, no después:

- [ ] Tres días antes: mensaje **7A** de `lanzamiento/02-mensajes-whatsapp.md`.
- [ ] El día del pago, si no llegó el comprobante: mensaje **7B**.
- [ ] Vencido sin pago (Atención → "Cobro vencido"): **Ficha → Zona peligrosa → Suspender…**
      - Días de gracia: **0** por omisión = la caja se bloquea en cuanto recibe el aviso (unos
        minutos, aunque esté a media jornada). Si le das días, bloquea a las 6:00 de ese día.
      - Pide motivo y escribir el nombre del negocio.
      - Mándale el mensaje **7C**.
- [ ] Cuando pague: **Registrar pago** y **Zona peligrosa → Reactivar…**. La caja vuelve en su
      siguiente conexión (hasta diez minutos): díselo así.

Bloqueado, su panel queda en solo lectura (ve sus reportes y cómo pagar) y **no pierde nada**.

---

## 9. Bajas

- **Cancelar** (**Zona peligrosa → Cancelar cliente…**): deja de poder vender desde la fecha de
  bloqueo. Su historial se queda y se puede **reactivar**.
- **Eliminar** — no se puede deshacer. Solo aparece con el cliente ya **cancelado** y terminada su
  gracia. Exige entrar con **tu cuenta de operador y tu segundo factor** (la clave compartida no
  elimina), motivo, el nombre del negocio y la palabra `ELIMINAR`. El diálogo enseña antes lo que
  se va a borrar. **Un cliente que timbró alguna factura no se elimina**: queda dado de baja. Lo
  que queda se ve en **Clientes → Clientes eliminados**. Sirve sobre todo para altas de prueba.

---

## 10. Dónde mirar cada día

- **Atención** — lo que hay que hacer hoy: cajas bloqueadas o sin sincronizar, clientes sin
  ventas, pruebas por vencer, cobros vencidos, folios y sellos por agotarse, altas estancadas y
  **prospectos sin contactar** (más de 24 horas).
- **Prospectos** — solicitudes de demo. El contador de la barra son los que nadie ha contestado.
- **Errores** — lo que falla en las cajas y los paneles de los clientes, agrupado por mensaje.
- **Bitácora** — todo lo que se hizo desde este panel, quién y por qué.

---

## 11. Si algo sale mal

| Qué pasa | Qué hacer |
|---|---|
| **Se fue el internet en el local** | Nada: la caja sigue cobrando, imprimiendo y mandando a cocina. Las ventas suben solas al volver. Lo que sí necesita internet es facturar y ver las ventas desde fuera. |
| **La caja no imprime** | Impresora encendida y en la misma red; revisar la IP en la configuración de impresora de la caja y **Probar**. |
| **"No me llegó el correo"** | Sección 1, "Si el correo no le llegó". |
| **La caja no aparece en línea** | Que la abran y tenga internet. En la ficha, Operación dice hace cuánto dio señal y qué versión tiene. |
| **Se dañó la computadora** | La caja se **respalda sola cada día** (con la caja quieta y sin turno abierto) y sus ventas sincronizadas están en la nube. Instalar en otra computadora y vincular con una **clave nueva**. Si lleva tres días sin respaldo, llega aviso a Errores. Detalle: `../../desktop/RUNBOOK.md`. |
| **Un error raro en pantalla** | **Errores** en el panel de VIM: trae el mensaje, la versión y cuántas veces pasó. |
| **No puede crear otra caja o sucursal** | Es el límite de su plan: se le da de alta el extra (sección 4). El mensaje que ve dice cuántas cajas adicionales tiene en uso. |
| **No ve Inventario** | Su plan es Esencial (sección 4). |
| **Quedó bloqueado y ya pagó** | Registrar el pago y **Reactivar** (sección 8). |

Soporte al cliente: WhatsApp **+52 56 6508 3346**, lunes a viernes de 9:00 a 18:00, sábado y
domingo de 9:00 a 14:00. El número y el horario que ven los clientes se cambian en
**Panel de VIM → Pagos y soporte**.
