# Revisión a fondo — agosto 2026

Revisión sección por sección de `/admin` (47 páginas), el POS de caja y `/platform`, mirando el
producto como lo vería un cliente final.

Todo lo que sigue está **verificado contra el código y contra la base de producción**. Los primeros
barridos por palabras clave produjeron varios falsos positivos —marcaban como incompletas páginas
que estaban bien—, así que cada hallazgo se confirmó leyendo el caso concreto.

---

## Ya corregido en esta pasada

| Qué | Dónde |
|---|---|
| Códigos internos de mockup (`P-181`, `doc 09`, `Flujos FT §4`) visibles en las tarjetas | `/admin` → Reportes |
| Los 14 reportes se agrupan por la pregunta que responden, en vez de una rejilla plana | `/admin` → Reportes |
| Título "Stock actual" que no coincidía con el menú "Inventario" | `/admin` → Inventario |
| Tres archivos muertos, uno con jerga a la vista: *"Sucursales visibles (RLS por tenant)"*, *"El POS operativo va en F5"* | POS y `/admin` |
| El código del cliente se deriva del nombre comercial (nació un `vim-pruevas` por teclearlo aparte) | `/platform` |
| *"Crea el tenant… Queda en TRIAL, fase INVITADO"* → texto en español llano | `/platform` |
| Se retiran las dos promesas incumplidas (A1 y A2): aviso visible en Promociones y subtítulo corregido en Propinas | `/admin` |
| Guardián de rutas por rol, con la misma tabla que el menú (antes se llegaba tecleando la URL) | `/admin` |
| El panel rechaza a cajero y personal en la puerta: su herramienta es el POS | `/admin` |

---

## A · Promesas que el producto no cumple

Lo más grave: la interfaz afirma algo que no ocurre. No falla con un error — falla en silencio, y
el cliente se entera cuando las cuentas no cuadran.

### A1 · Las promociones no se aplican

`/admin` → Promociones dice, literalmente:

> *"Ofertas y descuentos que se aplican automáticamente en el POS según sus condiciones."*

**El POS no toca las promociones en ningún punto del código.** La función `evaluar_promociones_aplicables`
existe en la base desde la migración 0008 y nadie la llama. `aplicar_promocion` tampoco.

**Y ya hay una promoción creada en producción.** Si Knock-Out la configuró esperando que aplicara,
no ha hecho nada y nadie lo ha notado.

### A2 · Las propinas no se reparten

`/admin` → Configuración → Propinas dice:

> *"Cómo VIM POS sugiere la propina al cobrar **y cómo se reparte entre tu equipo**."*

La **captura** de propina sí funciona (`establecer_propina_ticket`). El **reparto** no:
`entregar_propina` y la tabla `propinas_distribucion` no tienen un solo consumidor. Se puede
configurar cómo se reparte; el reparto nunca ocurre.

---

## B · Construido y desconectado

Trabajo terminado que no está enchufado. No engaña a nadie —no se promete en la interfaz— pero es
valor ya pagado que no rinde.

### B1 · Reparto a domicilio completo

`apps/pos/app/lib/delivery.ts` tiene ocho funciones: asignar repartidor, confirmar salida,
confirmar entrega, liquidar. Más `modal-liquidar-delivery.tsx`, con desglose efectivo/tarjeta para
cuando el repartidor regresa con dinero. La tabla `delivery_asignaciones` existe en producción, con
0 filas.

**Nada de eso está cableado.** Knock-Out hace domicilio hoy con un mecanismo mucho más simple: se
marca que el pedido salió, y ya. Cuando el repartidor vuelve con efectivo, no hay dónde cuadrarlo.

### B2 · Dividir la cuenta entre comensales

`split_cuenta` divide una cuenta abierta en N tickets equitativos. Definida en la migración 0010,
sin consumidor. Es una petición habitual en comedor.

### B3 · Detección de descuentos sospechosos

`detectar_descuentos_sospechosos` marca usuarios que exceden umbrales. Existe el reporte de
descuentos por usuario, pero la detección automática no corre.

---

## C · Permisos

### C1 · Las rutas del panel no estaban protegidas *(corregido)*

**Corrección de un hallazgo mal reportado en la primera versión de este informe:** se dijo que el
menú no filtraba por rol. Sí lo hacía —`jer >= it.minJerarquia`—; el barrido buscó las palabras
"rol" y "permiso" y el código usa `minJerarquia`. Un cajero solo veía "Panel".

El hueco real era otro: **ocultar un enlace no impide teclear la dirección.** No había guardián de
rutas ni middleware, así que un cajero llegaba a `/configuracion/fiscal` o al reporte Z
escribiéndolos en la barra del navegador.

Corregido: el mínimo de cada sección vive ahora en una sola tabla (`app/lib/acceso.ts`) que usan
el menú **y** un guardián de rutas, con una pantalla que explica el rol y a quién pedirle acceso.
Con dos listas separadas, la primera sección nueva rompía una de las dos sin que se notara.

### C2 · RLS filtra por tenant, no por rol *(abierto — es la frontera de verdad)*

Las políticas de las tablas sensibles —`tenants` (RFC y razón social), `usuarios_perfil`,
`usuarios_acceso`, `suscripciones`, `tickets`— filtran **solo por tenant**. Quien tenga sesión del
negocio puede leer sus datos aunque la pantalla no se los muestre.

Y no es hipotético: Knock-Out tiene hoy una **cajera con cuenta de correo y contraseña**
(`angelavim2009@…`, rol CAJERO) que puede iniciar sesión en `/admin`. El guardián nuevo le cierra
la interfaz; la capa de datos sigue abierta para quien sepa consultarla directamente.

**El guardián es conveniencia, no seguridad.** Cerrar esto de verdad exige políticas conscientes
del rol, y es trabajo de la capa de datos.

**Mitigado en parte:** el panel ahora rechaza en la puerta a cajero y personal (por debajo de
SUPERVISOR). La cajera de Knock-Out ya no entra, y no se le tocó la cuenta — su acceso al POS es
por PIN y no depende de ese correo. Quedan dentro supervisor, administrador y dueño; para ellos la
capa de datos sigue sin distinguir rol, que es lo que falta cerrar.

---

## D · Riesgo latente

### D1 · El desglose de IVA en pantalla es fijo al 16%

`calcularTotalesDisplay` asume 16% para el desglose; la base recalcula con la tasa real de cada
producto al cobrar. **El total siempre es correcto**, pero el subtotal e IVA de la pantalla pueden
diferir del ticket impreso si algún producto tiene otra tasa.

Hoy es inocuo: los 77 productos activos están al 16%. Deja de serlo con un cliente que venda algo
a tasa 0 — abarrotes, alimentos no preparados —, que es justo lo que aparecerá al vender a otras
verticales.

---

## Lo que se revisó y está bien

Para no volver a buscarlo:

- Los once enlaces del menú de `/admin` resuelven a páginas reales; los trece de Configuración también.
- Las 30 páginas de `/admin` tienen sus estados de carga, error y vacío.
- Ninguna página de configuración lee sin poder guardar.
- Las 14 páginas de reportes manejan rango vacío.
- La aritmética de dinero redondea por línea y al total, y la base recalcula al cobrar.
- No hay botones sin acción, formularios sin manejo de error, textos en inglés ni imágenes sin descripción.
- La conciliación de apps consulta tablas que sí existen.
- El formulario de alta de `/platform` valida, sanea y explica el resultado.

---

## Plan propuesto

Ordenado por lo que más cuesta dejar como está.

| # | Qué | Por qué primero | Tamaño |
|---|---|---|---|
| ~~1~~ | ~~Retirar la promesa de promociones~~ — **hecho**: aviso visible en la pantalla, indicando usar Descuento mientras tanto | | |
| ~~2~~ | ~~Retirar la promesa del reparto de propinas~~ — **hecho**: el subtítulo ya solo habla de la captura | | |
| 1 | **Conectar las promociones al POS** (pendiente de fondo) | El aviso deja el producto honesto, no completo | Medio |
| 2 | **Conectar el reparto de propinas** (pendiente de fondo) | Igual | Medio |
| 3 | **Políticas RLS conscientes del rol** (C2) | El guardián de rutas es conveniencia; esto es la frontera real, y hay una cajera con acceso hoy | Medio-grande |
| 4 | **Conectar la liquidación de domicilio** | Knock-Out hace domicilio hoy y no cuadra el efectivo del repartidor | Medio |
| 6 | **Dividir cuenta** | Petición habitual en comedor; la función ya existe | Medio |
| 7 | **IVA por producto en el desglose de pantalla** | Antes de vender a una vertical con tasa 0 | Pequeño |

**Sobre 1 y 2 conviene decidir antes que programar.** Retirar la frase de la interfaz cuesta
minutos y deja el producto honesto hoy; conectar la función cuesta días y lo deja completo. Las dos
son respuestas válidas — lo que no es válido es dejarlo como está.
