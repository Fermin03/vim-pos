# Cocina

Cómo llegan los pedidos a cocina: en papel (comanda) o en la pantalla de cocina, y cómo repartirlos
por estación. Cada sección se entiende sola.

## Cómo crear estaciones de preparación

**Quién:** dueño o administrador · **Dónde:** Panel → Ajustes → Dispositivos → Estaciones de preparación · **Plan:** todos · **Giros:** comida
**Lo piden así:** estaciones, barra y cocina por separado, que las bebidas salgan aparte, áreas de cocina

Una estación es un lugar donde se prepara algo, por ejemplo “Cocina” y “Barra”. La comanda se parte
y cada estación recibe solo lo suyo.

1. Entra a **Ajustes → Dispositivos → Estaciones de preparación**.
2. Toca **«Nueva estación»**.
3. Escribe el **«Nombre»** (por ejemplo “Barra”), elige el **«Tipo»** y la **«Sucursal»**.
4. Toca **«Guardar»**.
5. En **Menú → Categorías**, asigna cada categoría a su estación (por ejemplo, “Bebidas” a
   “Barra”). Si un producto se prepara en otra estación, cámbiale la estación en su ficha.
6. En cada caja, en **«Configurar impresoras y pantallas»**, elige qué impresora usa cada estación.

**Qué pasa después:** cada estación recibe solo sus productos, en su impresora o en su pestaña de
la pantalla de cocina.
**Si algo falla:** si todos los productos salen en la misma comanda, revisa que cada categoría
tenga su estación asignada. La impresora de cada estación la eliges en cada caja, porque cada caja
tiene sus propias impresoras.
**Relacionado:** [Cómo conectar la impresora en la caja](equipo-fisico.md#cómo-conectar-la-impresora-en-la-caja)

## Cómo conectar la pantalla de cocina

**Quién:** dueño o encargado · **Dónde:** computadora de la cocina → «VIM POS Cocina» · **Plan:** todos · **Giros:** comida
**Lo piden así:** pantalla de cocina, KDS, monitor en la cocina, ver pedidos en pantalla, sin comanda de papel

1. Instala VIM POS en la computadora de la cocina, conectada a la misma red que la caja
   ([Cómo descargar e instalar VIM POS en la computadora](instalar-y-vincular-la-caja.md#cómo-descargar-e-instalar-vim-pos-en-la-computadora)).
2. Abre el acceso **VIM POS Cocina** que dejó el instalador.
3. En **«Vincular esta pantalla de cocina»**, escribe el **«Identificador del dispositivo»** y la
   **«Clave del dispositivo»** y toca **«Vincular pantalla»**. Esos datos los encuentras en el panel,
   en **Ajustes → Dispositivos → Cajas**, al tocar **«¿Te pide identificador y clave?»**.
   [VERIFICAR: de qué caja se toman el identificador y la clave para la pantalla de cocina]
4. La caja tiene que estar encendida con VIM POS abierto.

También puedes ver la pantalla de cocina desde la caja, en **«Menú»** → **«Cocina»**, si tu negocio
la tiene encendida. Si no la ves, pide que te la enciendan por el WhatsApp de soporte de VIM.

**Qué pasa después:** la pantalla arranca directo en «Cocina» cada vez que la abres.
**Si algo falla:**
- «No se pudo contactar la caja…» o «No se pudo conectar con la caja. Reintentando…» → revisa que la
  caja esté encendida y en la misma red. Toca **«Reintentar ahora»**.
- Para desvincular la pantalla de cocina, en el engrane de **«Ajustes»**, toca **«Desvincular esta
  pantalla»**.
**Relacionado:** [Cómo usar la pantalla de cocina](#cómo-usar-la-pantalla-de-cocina)

## Cómo usar la pantalla de cocina

**Quién:** cocina · **Dónde:** pantalla de cocina · **Plan:** todos · **Giros:** comida
**Lo piden así:** marcar listo, pedido listo, cómo se usa la pantalla de cocina, deshacer, sonido

Cada pedido sale en una tarjeta con su número, el tiempo que lleva y de dónde viene (por ejemplo
“Mesa 4”). Debajo van los productos, sus modificadores y las notas. La nota de toda la orden sale en
amarillo.

1. Prepara el pedido.
2. Toca **«LISTO»** en la tarjeta.
3. Si te equivocaste, toca **«Deshacer»** en los 5 segundos siguientes.

**Para ver solo tu estación:** arriba toca la pestaña de tu estación, o **«Todas»** para ver todo.
Si otra estación aún debe algo de ese pedido, la tarjeta dice «Falta en …».

**Botones de arriba:** **«Sonido»** para el aviso de pedido nuevo (si dice **«Activar sonido»**,
toca la pantalla una vez), y **«Contraste»** para verla en blanco y negro.

**Qué pasa después:** la tarjeta desaparece. Los pedidos nuevos llegan solos con un aviso.
**Si algo falla:**
- «SIN CONEXIÓN» en rojo → la pantalla no se puede conectar con la caja y vuelve a intentarlo sola
  cada 5 segundos. Revisa que la caja esté encendida.
- «No se pudo marcar … como lista…» → vuelve a tocar **«LISTO»**.
- Si cancelan un producto, desaparece de la tarjeta en unos segundos.
**Relacionado:** [Cómo saber si un pedido va tarde](#cómo-saber-si-un-pedido-va-tarde)

## Cómo saber si un pedido va tarde

**Quién:** cocina y encargado · **Dónde:** pantalla de cocina · **Plan:** todos · **Giros:** comida
**Lo piden así:** pedido atrasado, tiempo de cocina, cuánto lleva, tarde, rojo

Cada tarjeta muestra cuánto tiempo lleva el pedido, y cambia de color:

- **«NUEVA»:** en su primer minuto.
- **Ámbar:** desde los 8 minutos.
- **Rojo, con «TARDE»:** desde los 15 minutos.

**Qué pasa después:** el dueño ve los tiempos en el panel, en **Informes → Cómo va la operación →
«Tiempos de cocina»**: cuánto tarda en salir la comida comparado con un objetivo de 15 minutos.
**Si algo falla:** si muchos pedidos salen en rojo, revisa el informe **«Tiempos de cocina»** para
ver en qué estación o a qué hora se atrasan.
**Relacionado:** [Cómo usar la pantalla de cocina](#cómo-usar-la-pantalla-de-cocina)

## Cómo trabajar con comanda en papel

**Quién:** cajero y cocina · **Dónde:** impresora de cocina · **Plan:** todos · **Giros:** comida
**Lo piden así:** comanda, ticket de cocina, orden impresa, papel para la cocina, no sale la comanda

**Cuándo sale sola:**

- En mesas, barra, pick-up y domicilio: al tocar **«Enviar a cocina»**. Si agregas productos
  después, sale otra solo con lo nuevo, marcada “AGREGADO A LA ORDEN”.
- En comida rápida (para llevar y comer aquí): al cobrar.
- En restaurantes, la comanda de un pedido para llevar sale al cobrar solo si la cocina tiene su
  propia impresora. Si hay una sola impresora, el ticket del cliente sirve de comanda.

**Qué dice:** el tipo de servicio (MESA, BARRA, DOMICILIO…), la estación, el número de orden, la
hora, el nombre del cliente (barra, pick-up o domicilio), los productos con sus modificadores y la
nota de cada producto, y el cajero y la caja.

**Si se cancela un producto ya mandado:** sale una comanda “CANCELADO / NO PREPARAR” en la estación
que lo preparaba.

**Si algo falla:**
- La comanda no lleva el número de mesa ni la nota de toda la orden: esos dos datos solo salen en
  la pantalla de cocina.
- Si la impresora falla, la caja vuelve a intentar imprimir la comanda cada 10 segundos.
- «Los productos se cancelaron, pero NO se pudo avisar a cocina. Avísales a mano.» → avisa en
  persona a cocina qué productos se cancelaron.
**Relacionado:** [Cómo reimprimir un ticket o una comanda](vender-en-la-caja.md#cómo-reimprimir-un-ticket-o-una-comanda)
