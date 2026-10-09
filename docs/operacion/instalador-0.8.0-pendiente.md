# Instalador 0.8.0 de la caja — pendiente de aprobación

> **No se ha subido la versión ni se ha empaquetado nada.** `desktop/package.json` sigue en
> **0.7.0**, que es la última publicada (8 oct 2026). Este documento es la lista de lo que
> incluiría la 0.8.0 y un borrador de su nota, para que Fermín decida. Sin su visto bueno no se
> publica (`actualizaciones.md` §2); y se publica en martes, antes de las 10:00.

Redactado el 9 oct 2026 sobre la rama `feat/tienda-caja` (entrega 4 de la tienda en línea).

## Por qué 0.8.0

Es una **función**: el cliente puede hacer algo que antes no podía (recibir y atender pedidos de la
tienda en línea propia en la caja). Según `actualizaciones.md` §1 sube el segundo número: de 0.7.0
a **0.8.0**. No es un hito (nadie tiene que reinstalar ni reconfigurar nada), así que no toca la 1.0.0.

## Qué incluye

El instalador lleva el POS empaquetado (`pos-ui/`) y el agente de la caja, así que cambian los dos.

**Agente de la caja (`desktop/src/`)**
- Declara la tienda en cada sondeo y reporta si hay turno abierto: sin esto la nube no sabe que
  la caja está lista y la tienda de la sucursal sale «sin turno abierto».
- Baja los pedidos de la tienda, crea su cuenta con la lógica de la tienda y, si el negocio la
  eligió, los acepta sola.
- Reporta a la nube en qué va cada pedido (listo, entregado, cancelado) mirando la cuenta local.
- Cancela solo el pedido que ya no se puede armar (precio, zona, producto que cambió) y deja el
  motivo escrito para el cajero. Espera 3 minutos a que el catálogo local alcance a un producto
  recién creado.
- Arranca también en un negocio que tiene la tienda pero no apps de delivery.

**POS dentro de la caja (`apps/pos`)**
- «Pedidos en línea» junta Uber y la tienda; tarjeta propia de la tienda; Aceptar y Rechazar con
  motivo; barra para pausar y reanudar la tienda.
- Timbre que se repite cada 20 segundos hasta atender el pedido. **Cambia también para Uber**:
  antes sonaba una vez al llegar y callaba al abrir el POS con un pedido ya pendiente.
- Comanda automática al aceptar, una sola vez.
- La nota del pedido (con cuánto paga el cliente) en las cuentas de Pick-up y Domicilio y en el
  ticket impreso. **Cambia para cualquier nota** que se escriba en una cuenta de esos dos modos,
  sea o no de la tienda.

**No cambia:** nada de Comedor ni de Para llevar; la ruta de Uber (aceptar, rechazar, marcar listo)
queda como estaba.

## Antes de publicarla (orden de `actualizaciones.md` §3)

1. **Migración 0164** a producción, a mano y antes de mezclar (`tienda_reportar_estado`, y el aviso
   de vencidos que dice de dónde era el pedido). Respaldo antes.
2. **Funciones:** `delivery-accion` y `delivery-espejo`. Siguen contestando igual a las cajas
   anteriores (la clave nueva solo se manda a quien declara la tienda).
3. **Web:** el POS web recibe la pantalla nueva al mezclar.
4. **Instalador** y, al final, `latest.json`. Pasar la lista «Antes de empaquetar» del RUNBOOK
   (postgrest.exe presente, `dist` con `node_modules` de verdad, `.exe` de ≥ ~155 MB).
5. Después: nota en `sitio-web/novedades.html` y entrada en `sitio-web/funciones.html` (es una
   función nueva), `pnpm sitio:generar`, `pnpm test:sitio`.

Mientras la 0.8.0 no salga, **las cajas instaladas no reciben pedidos de la tienda** aunque el
código ya esté en `main`: un negocio con caja instalada que encienda la tienda la verá «sin turno
abierto» (ver [`tienda-en-linea-caja.md`](tienda-en-linea-caja.md)). Conviene no encender la tienda
a clientes con caja instalada hasta que salga, o hacerlo con la 0.8.0 puesta en su caja.

## Qué hay que saber antes de aprobar

- **Probado:** pruebas del agente y de la lógica del POS, y las consultas nuevas contra el esquema
  real. **No probado:** el recorrido completo contra la nube real, la pantalla en el navegador (se
  verifica en la tarea 6 de la entrega, paso 3) y una caja instalada recibiendo un pedido de punta
  a punta. Eso se hace en VIM Pruebas el lunes, antes de pasarte la lista final.
- **Pendiente conocido:** un pedido de la tienda aceptado cuya caja se apagó antes de crear la cuenta
  no caduca solo (la nube no ve la cuenta local). Está anotado para la entrega 7.
- **Cambio visible en Uber** (el timbre repetido): es deliberado, pero un cliente que ya usa Uber
  lo va a notar el primer día. Está en la nota.

## Borrador de la nota de versión

Texto para `npm run release-manifest -- "…"` y para el release. Va en **un solo párrafo** (la caja
lo muestra como texto corrido); aquí está en líneas para leerlo.

```
Nuevo: los pedidos de la tienda en línea de tu negocio llegan a la caja. Los aceptas o los rechazas en Pedidos en línea (en el inicio), o la caja los acepta sola si así lo configuraste, y al aceptar se crea la cuenta en Pick-up o Domicilio y sale la comanda en cocina. Desde esa misma pantalla puedes pausar la tienda 30 minutos, 1 hora o hasta que la reanudes.
Mejoras: el timbre de un pedido nuevo se repite cada 20 segundos, en cualquier pantalla, hasta que lo atiendas. La nota del pedido, con cuánto paga el cliente, se ve en las cuentas de Pick-up y Domicilio y sale en el ticket impreso.
```

Revisada contra las reglas de la §4: sin palabras internas, sin otras versiones, sin relleno,
de tú y en presente, dos secciones de dos frases cada una. «Correcciones» no va porque esta
versión no arregla nada que el cliente haya visto roto.

Aviso al cliente (§5): al ser 0.x.0, además de la nota en la caja, un mensaje por WhatsApp o
correo. Sugerencia para ese mensaje, ya sin hablar de cajas: «Ya puedes recibir los pedidos de tu
tienda en línea directamente en la caja. Actualiza cuando te aparezca el aviso.»
