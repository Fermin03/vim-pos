# 0044 — La demo autoguiada es la caja real en un proyecto aparte, con un negocio por visitante

**Fecha:** 20 de octubre de 2026 · **Estado:** vigente · **Cumple** lo que dejó pendiente
[0010](0010-el-demo-estatico-se-retira.md).

## Qué había antes

La demo de venta es en vivo, con Fermín presente. El ADR 0010 retiró el demo estático de mockups y dejó
escrito que, si algún día un prospecto debía probar solo, la respuesta era «un tenant de prueba en el POS
real con datos de muestra y reinicio automático, con su propio ADR». Esa llegada es hoy: un consultor con
varios clientes restauranteros pidió un enlace que cualquiera abra en tableta o PC.

## Qué hacemos ahora

- **Un proyecto de Supabase gratuito, aparte de producción**, solo para la demo. Ningún dato de
  producción vive ahí ni al revés.
- **Un negocio por visitante.** «Iniciar demo» llama a una Edge Function que clona Crazy Burgers
  (catálogo, tipos de pedido, mesas, empleados con PIN y caja; sin turnos, tickets ni historial) en un
  tenant nuevo y devuelve una sesión. Mismo aislamiento por RLS que cualquier cliente.
- **Borrado a las 24 h.** Un trabajo programado elimina cada noche los tenants de demo de más de 24 h, con
  sus usuarios de Auth. Mientras viva su sesión, el visitante regresa a su mismo negocio.
- **La misma app `apps/pos`**, desplegada en `demo.vimpos.com.mx` y apuntada al proyecto de demo por
  variables de entorno. Una bandera de compilación activa la guía «Hazlo tú», fuerza la vista previa de
  impresión y oculta lo que no aplica. Un solo código, no una imitación.
- **Migración** `NNNN_demo_autoguiada.sql` (número en la Task 1).

El diseño completo está en `docs/superpowers/specs/2026-10-20-demo-autoguiada-design.md`.

## Por qué

- **Lo que mató al demo de mockups fue enseñar un producto distinto al real** (0010). La demo es la caja
  de verdad, con las mismas migraciones y los mismos flujos.
- **Un visitante anónimo no puede tocar producción.** Por eso el proyecto aparte: si algo falla en el
  aislamiento, lo único expuesto es un negocio ficticio.
- **Un negocio por visitante** evita que uno vea las ventas de otro y permite que el monitor y el corte
  muestren solo lo que hizo esa persona.
- **Gratuito** porque la demo no justifica un costo fijo mientras no se sepa cuánto se usa.

## Alternativas descartadas

- **Un solo tenant de demo compartido con reinicio periódico.** Los visitantes se pisarían y verían las
  ventas ajenas.
- **Un tenant de demo dentro del proyecto de producción.** Un visitante anónimo quedaría a una política
  RLS mal escrita de los datos de Knock-Out.
- **Volver a un demo estático o a capturas guiadas.** Es lo que 0010 retiró.
- **Una app en App Store o Play Store.** Un enlace basta y no depende de revisión de tiendas.

## Consecuencias

- **Cada migración se aplica también al proyecto de demo**, con el mismo `supabase db push` que se corre a
  producción; va como una línea más del procedimiento de migraciones. Si una migración no llega, la caja
  de la demo se rompe (la misma trampa que ya existe con la nube). También hay que desplegar ahí las Edge
  Functions que la caja necesita (al menos `pin-login` y `autorizar-pin`).
- **La demo se duerme tras 7 días sin uso** (plan gratuito): el primer visitante espera o ve un error. Si
  molesta en la práctica, la salida es pasar a pago, no mantenerla despierta con trucos.
- **Capacidad limitada** (poca RAM y disco): la limpieza nocturna, un límite de demos por IP y hora y un
  tope de tenants vivos son lo que la sostiene.
- **Lo único que la demo toca de producción** es `solicitar-demo` (contacto opcional del último paso),
  marcado con el origen «demo autoguiada».
- **El proyecto gratuito va en una organización aparte**, creada por Fermín: uno nuevo en la organización
  de pago se cobraría.
