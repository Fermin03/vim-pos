# Demo autoguiada de la caja — diseño

Fecha: 20 oct 2026 · Decidido con Fermín en conversación · Estado: borrador para aprobar

## Por qué

Un consultor con varios clientes restauranteros pidió una demo. Hoy la demo de venta es **en vivo**, con
Fermín presente (`lanzamiento/03-guion-de-demo.md`). Eso no escala a prospectos que llegan por terceros.
Fermín quiere un **enlace** que cualquiera abra en tableta o PC y que le enseñe el sistema **tal cual
funciona**, con una guía que explique cada botón, para que el prospecto termine queriendo contratar.

El ADR 0010 (que retiró el demo estático de mockups) ya dejó escrito que, si algún día un prospecto debía
probar solo, la respuesta era «un tenant de prueba en el POS real con datos de muestra y reinicio
automático, con su propio ADR». Este diseño es eso. **Su ADR es el 0044 (`docs/decisiones/0044-demo-autoguiada-con-tenant-por-visitante.md`).**

## Qué es éxito

Un dueño de restaurante abre el enlace sin que nadie le explique nada, recorre un turno completo con sus
propias manos en unos 10 minutos y al final escribe a VIM por WhatsApp.

## Metas

- El **producto real** (`apps/pos`), no capturas ni maqueta.
- Un **recorrido completo por pasos** (abajo) de las cinco etapas que eligió Fermín: abrir turno, hacer una
  venta, ver el monitor de ventas, cerrar turno, ver el corte.
- Guía **«Hazlo tú»** (opción B, elegida por Fermín): ilumina un elemento, pide la acción y **no avanza
  hasta que la persona la hace**. Barra de avance arriba («Paso 4 de 17 · Hacer una venta»).
- **Entrada directa** con un botón **Iniciar demo**. Sin formulario previo (Fermín).
- Funciona en **iPad y tabletas Android en horizontal** y en **PC**, desde el navegador. Es un enlace, no
  una app de tienda (Fermín).

## No metas (esta versión)

- Panel del dueño, cocina (KDS), tienda en línea, facturación, app de meseros, Uber, lealtad.
- Offline, impresión física, cajón, terminal de tarjeta: en la demo el ticket se ve en pantalla.
- Publicar en App Store o Play Store.
- Celular o tableta en vertical (se muestra un aviso, ver abajo).
- **Tocar el sitio web** (Fermín): por ahora la demo es solo un enlace para compartir. La página
  `sitio-web/demo.html` y su formulario se quedan como están.

## Anti-metas (fracaso aunque funcione)

- Que un visitante anónimo pueda leer o escribir **cualquier dato de producción** (clientes reales,
  Knock-Out). Por eso la demo vive en otro proyecto de Supabase.
- Que un visitante vea las ventas de otro.
- Que la demo enseñe un producto distinto al real (lo que mató al demo de mockups, ADR 0010).
- Que la demo se quede atrás del producto porque nadie le aplica las migraciones.

## El recorrido (aprobado por Fermín)

Negocio de ejemplo: **Crazy Burgers** (semilla `sitio-web/_capturas/semilla-demo.sql`, ficticio).

**0. Bienvenida**
1. Pantalla de entrada: «Vas a operar un turno completo de Crazy Burgers, un negocio de ejemplo. Tarda unos
   10 minutos». Botones **Iniciar demo** y **Prefiero explorar solo** (este segundo entra sin guía).

**1. Abrir turno**
2. Elegir a la cajera (Ana). Cada empleado entra con su nombre.
3. Teclear su PIN (la guía lo muestra). Así se sabe quién cobró qué.
4. Escribir el fondo de caja (p. ej. $500) y tocar **Abrir turno**.

**2. Hacer una venta**
5. Elegir el tipo de pedido (para llevar). De eso depende el ticket y la comanda.
6. Tocar una hamburguesa: pide el término y no deja seguir sin él.
7. Agregar un extra con precio y la nota «sin cebolla».
8. Agregar una bebida; mirar el ticket a la derecha.
9. Tocar **Cobrar**: se explica la pantalla de cobro.
10. Pago dividido (parte efectivo, parte tarjeta) y, si quiere, propina.
11. Ver el ticket en pantalla: en el negocio real sale impreso, con su código para facturar.
12. (Opcional) Una segunda venta sin guía.

**3. Monitor de ventas**
13. Abrir el monitor: venta del turno, tickets cobrados, ticket promedio, propinas.

**4. Cerrar turno**
14. **Cerrar turno**: el conteo es ciego, el cajero cuenta sin saber cuánto debería haber.
15. Capturar lo contado. **La guía pide contar $20 de menos a propósito.**

**5. Ver el corte**
16. Corte generado: sistema contra contado y la diferencia marcada. Es lo que el dueño revisa cada noche.
17. Cierre: «Así de fácil es un turno con VIM POS». Botones **Hablar con VIM por WhatsApp**
    (+52 56 6508 3346) y **Ver precios** (vimpos.com.mx/precios), más un campo opcional «Déjame tu
    WhatsApp y te contactamos».

Los textos finales de cada paso los escribe James (redactor), cortos: una o dos frases por paso. Los
nombres de botones de esta lista son descriptivos; se confirman contra la caja al construir.

## Cómo se construye

### Decidido con Fermín

- **Enlace**, no tiendas.
- **Base de datos aparte**: un proyecto de Supabase **solo para la demo**, en el **plan gratuito**.
  Fermín aceptó que, si nadie la usa en una semana, el proyecto se duerme y el primer visitante espera o ve
  un error.

### Decisiones mías (Claude), vetables

- **Dónde vive:** la misma app `apps/pos` desplegada en `demo.vimpos.com.mx`, apuntando al proyecto de
  demo por variables de entorno (`NEXT_PUBLIC_SUPABASE_URL` / anon key). Un solo código, como hoy entre
  Electron y navegador (`app/lib/supabase.ts`).
- **Un negocio por visitante:** **Iniciar demo** llama a una función (Edge Function en el proyecto de
  demo) que clona Crazy Burgers en un tenant nuevo, crea su identidad de dispositivo y devuelve una sesión.
  La caja entra **sin la pantalla de vincular dispositivo**. La semilla actual solo corre en Supabase local
  (superusuario + `session_replication_role`); hay que convertirla en algo que la función pueda ejecutar.
- **Limpieza:** un trabajo programado borra cada noche los tenants de demo de más de 24 h, con sus
  usuarios de Auth.
- **Modo demo en la caja:** una bandera (variable de entorno de compilación) que activa la guía, fuerza el
  `PreviewAdapter` de impresión y oculta lo que no aplica (actualizaciones, salir, vincular).
- **Tableta:** ajustar las pantallas del recorrido para iPad horizontal (hoy hay anchos fijos, p. ej.
  barra lateral de 240 px en `home-pos.tsx` y paneles de 360/560 px en `pantalla-cierre.tsx`). En
  vertical: aviso «Gira tu tableta». En pantallas de teléfono: «Ábrela en una tableta o computadora».
- **Qué se clona de Crazy Burgers:** catálogo (productos, modificadores, extras, categorías), tipos de
  pedido, mesas, empleados con PIN y la caja. **Sin turnos abiertos, sin tickets, sin historial, sin Uber
  ni inventario, y sin el usuario de la dueña** (sería la misma contraseña repetida en cada tenant). Así el
  paso 4 abre el primer turno, y el monitor y el corte muestran solo lo que hizo el visitante, con los $20
  de faltante a la vista. La semilla de capturas (`semilla-demo.sql`) no se toca; la de la demo es otra.
- **Recargar o volver:** mientras su sesión viva (hasta 24 h), el visitante regresa a **su mismo**
  negocio y la guía sigue en el paso donde iba. Si el tenant ya se borró o la sesión expiró, vuelve a la
  pantalla de bienvenida y **Iniciar demo** crea uno nuevo.
- **«Prefiero explorar solo» y fuera de alcance:** en todo el modo demo (con y sin guía) se ocultan los
  módulos fuera de alcance (cocina, facturar, Uber, lealtad, terminal, tienda). Mesas puede quedar visible
  si funciona sin configuración extra; si no, se oculta.
- **Contacto opcional del paso 17:** reutiliza la función que ya existe, `solicitar-demo`, que guarda en
  `prospectos` de producción y se atiende desde /platform. Es lo único que la demo toca de producción, y es
  un formulario público que ya existe. Se marca el origen como «demo autoguiada».
- **Medición mínima, sin GTM:** la función de demo registra cada tenant creado y el último paso alcanzado
  de la guía. Con eso se sabe cuántos iniciaron, cuántos terminaron y dónde se quedan, sin tocar la CSP.
- **De qué código sale:** de `main`, con las migraciones que ya están en producción. Nada de las ramas
  locales (retail, belleza, servicios, meseros).
- **Abuso:** límite de cuántas demos se pueden iniciar por IP y por hora, y un tope de tenants vivos.

### Para quien construya

- Librería de la guía o hecha a mano: no hay ninguna en el repo; elegir la opción más chica que permita
  «esperar a que el usuario haga X» y que funcione táctil.
- Cómo detecta la guía que el paso se cumplió (eventos de la app, cambio de estado, selector).
- Cómo mantener el esquema del proyecto de demo al día con producción. Mínimo: el mismo
  `supabase db push` que se corre a producción, y una línea en el procedimiento de migraciones.
- Qué Edge Functions de la caja hay que desplegar también en el proyecto de demo (al menos `pin-login` y
  `autorizar-pin`; sin ellas el PIN responde 503).

## Requisitos que dependen de Fermín

- **Crear el proyecto de Supabase gratuito.** Si la organización actual es de pago, un proyecto nuevo ahí
  **se cobra**; el gratuito va en una organización aparte, creada por Fermín con su cuenta.
- **Autorizar el despliegue** en Vercel (nuevo proyecto o dominio `demo.vimpos.com.mx`). Hasta entonces
  todo se construye y se prueba en local.

## Riesgos y cosas por verificar
- **Que se duerma:** con el gratuito, si pasa una semana sin visitas el proyecto se pausa. Si molesta en la
  práctica, la salida es pasar a pago (~US$25/mes), no inventar trucos para mantenerlo despierto.
- **Capacidad:** cada visitante crea un tenant; el plan gratuito tiene poca RAM y poco disco. La limpieza
  nocturna y el tope de tenants vivos son lo que lo sostiene.
- **Desfase con el producto:** si una migración no llega a la demo, la caja de la demo se rompe. Es la
  misma trampa que ya existe con la nube.
