# Tienda en línea — lista para encenderla

Fermín: esta es **la** lista. La tienda en línea está construida, probada y mezclada, pero **apagada
para todos**. Nada de lo que hay en producción la enciende solo. Encenderla es recorrer esta lista
de arriba abajo, marcando casillas.

Cada paso dice tres cosas:

- **Quién lo hace.** **Fermín** = solo tú puedes (tu cuenta, tu dominio, o es decisión tuya).
  **Claude, con tu visto bueno** = Claude lo hace cuando se lo pides con esas palabras («haz el paso
  2.1»); nunca por su cuenta.
- **Cómo comprobar** que quedó.
- **Cómo deshacerlo.**

Documentos que acompañan a esta lista:

- [`tienda-publica-salida.md`](tienda-publica-salida.md) — el detalle de publicar la tienda en
  internet (Vercel, dominio, antirobot, claves) y las dos pruebas de humo paso a paso.
- [`instalador-0.8.0-pendiente.md`](instalador-0.8.0-pendiente.md) — qué lleva la caja 0.8.0 y su nota.
- [`tienda-vigilancia.md`](tienda-vigilancia.md) — qué mirar después de encender.
- [`tienda-en-linea-caja.md`](tienda-en-linea-caja.md) — para contestarle a un cliente por WhatsApp.
- [`../legal/LEEME.md`](../legal/LEEME.md) — los borradores de los textos legales y lo que hay que decidir.

## El orden, en una línea

Comprobar (0) → publicar la tienda en internet (1) → probarla nosotros con el POS web (2) → caja
0.8.0 en martes y probarla con una caja (3) → encender el complemento (4) → Knock-Out (5) →
anunciar (6).

**Se puede parar entre fase y fase el tiempo que haga falta.** Hasta la fase 4, ningún cliente nota
nada.

---

## Decisiones que te tocan antes de encender

Estas no las puede tomar Claude por ti. Las cinco primeras conviene cerrarlas antes de la fase 4.

- [ ] **1. Precio y planes, confirmados.** Hoy está programado así: la tienda va **incluida sin
      costo** en Negocio, Cadena y los planes anteriores por giro; en **Esencial cuesta $100 al mes**
      más IVA. Sin comisión por pedido. Si quieres otro precio, se cambia **antes** de la fase 4 (es
      un dato de la base; díselo a Claude).
- [ ] **2. Textos legales revisados.** Hay tres borradores en [`docs/legal/`](../legal/LEEME.md).
      Los tiene que leer una persona con criterio legal antes de publicarse. Mientras tanto, la
      tienda enseña dos páginas provisionales (aviso de privacidad y condiciones para pedir),
      veraces y marcadas como provisionales. **Decide:** ¿se enciende con las provisionales, o se
      espera a los definitivos?
- [ ] **3. ¿El dueño acepta condiciones al encender su tienda?** Hoy no: enciende con un
      interruptor y ya. El borrador de términos lo hace responsable de los datos de sus clientes, y
      los negocios que diste de alta tú desde el panel nunca aceptaron ningunos términos en
      pantalla. Recomendación: sí, una casilla la primera vez que enciende (como la de Uber). **Eso
      no está construido**; si lo quieres antes de encender, es trabajo nuevo.
- [ ] **4. ¿Se exige confirmar el correo al crear una cuenta?** Hoy no: el cliente se registra y
      entra de una vez, porque el registro va dentro de la compra. La consecuencia, aceptada a
      sabiendas: quien se ponga a probar correos puede deducir si un correo ya es cliente de un
      restaurante (lo frenan el antirobot y los topes por hora). Exigir confirmación lo cierra,
      pero el cliente tendría que ir a su correo antes de pedir con cuenta. Está explicado en
      [`decisiones/0032`](../decisiones/0032-la-tienda-es-un-canal-y-sus-clientes-no-viven-en-auth.md).
      Recomendación: salir así y decidirlo con datos de la primera semana.
- [ ] **5. Caja 0.7.0 y POS web a la vez en una sucursal.** Una caja con versión anterior a la 0.8.0
      no entiende los pedidos de la tienda. Si en la misma sucursal alguien abre además el POS en el
      navegador, la tienda se abre y la caja vieja no se entera de lo que llega. Regla propuesta:
      **ningún negocio enciende su tienda hasta que todas sus cajas tengan la 0.8.0** (se comprueba
      con la consulta 7 de vigilancia). ¿De acuerdo?
- [ ] **6. Razón social y domicilio del restaurante.** La ley pide que el aviso de privacidad diga
      quién es el responsable y dónde está. Hoy la tienda solo conoce el nombre comercial. Las
      opciones y lo que costaría cada una están en [`docs/legal/LEEME.md`](../legal/LEEME.md).
- [ ] **7. El día.** La caja 0.8.0 sale en martes antes de las 10:00. La fase 4 puede ser ese mismo
      martes o después, nunca antes.

---

## Fase 0 — Comprobar que producción está como se espera

Nada de esta fase cambia algo: es mirar.

- [ ] **0.1 La migración 0167 está aplicada.** · Claude, con tu visto bueno
      («comprueba que la 0167 está aplicada»).
      *Comprobar:* la función `tienda_encender_complemento` existe en la base.
      *Deshacer:* nada que deshacer.
- [ ] **0.2 Las tres funciones están desplegadas con el código de esta entrega:** `tienda`,
      `delivery-accion` y `delivery-espejo`. · Claude, con tu visto bueno.
      *Comprobar:* la fecha de despliegue de las tres es posterior a la mezcla de la entrega 7.
      **La 0167 y `delivery-accion` van siempre juntas:** con la migración aplicada y la función
      vieja, una caja 0.8.0 no podría avisar que ya tiene un pedido y se le cancelaría a los 15
      minutos de aceptarlo.
- [ ] **0.3 El complemento sigue apagado.** · Claude, con tu visto bueno.
      *Comprobar:* esta consulta dice `activo = false` y precio `100.00`:

      ```sql
      SELECT codigo, activo, precio_mensual_mxn FROM addons WHERE codigo = 'TIENDA';
      ```
- [ ] **0.4 No hay planes fuera de la lista.** La tienda se concede por plan, y solo conoce los
      planes Esencial, Negocio, Cadena y los seis anteriores por giro. Si en producción existe un
      plan creado a mano (uno personalizado), **no la concede** y hay que decidir qué hacer con él.
      · Claude, con tu visto bueno.
      *Comprobar:* esta consulta enseña cada plan y si incluye la tienda; revisa los que tengan
      negocios y digan `false` o vacío:

      ```sql
      SELECT p.codigo, p.activo,
             (p.features_incluidos ->> 'tienda_incluida') AS incluye_tienda,
             count(t.id) AS negocios
        FROM planes p
        LEFT JOIN tenants t ON t.plan_actual_id = p.id AND t.estado IN ('ACTIVO', 'TRIAL', 'INTERNO')
       GROUP BY 1, 2, 3
       ORDER BY 1;
      ```
- [ ] **0.5 Los dos procesos automáticos corren** (el de cada minuto y el de cada noche).
      · Claude, con tu visto bueno. *Comprobar:* consulta 10 de
      [`tienda-vigilancia.md`](tienda-vigilancia.md).
- [ ] **0.6 Las decisiones 1 a 5 de arriba están tomadas.** · Fermín.

## Fase 1 — Publicar la tienda en internet

Publicar la tienda **no la enciende para nadie**: sin negocios con la tienda encendida, todas las
direcciones dicen «No encontramos esta página». El detalle de cada paso (qué pantalla, qué botón,
qué valor) está en [`tienda-publica-salida.md`](tienda-publica-salida.md); aquí va solo la lista.

**El orden importa:** 1.1 y 1.2 van antes que 1.5. Si el dominio existe antes, el primer cliente
que pida recibe «No pudimos comprobar que eres una persona.»

- [ ] **1.1 Antirobot (Cloudflare Turnstile): añadir `pedidos.vimpos.com.mx` al widget que ya
      existe.** · Fermín. (Paso 1 de la guía.)
      *Comprobar:* el widget lista tres dominios: `admin.vimpos.com.mx`, `localhost` y el nuevo.
      *Deshacer:* quitar el dominio del widget. No crear un widget nuevo ni cambiar llaves.
- [ ] **1.2 Claves en Supabase.** · Claude, con tu visto bueno. (Paso 2 de la guía.)
      - `TURNSTILE_HOSTNAMES` con **los dos** dominios (`admin.vimpos.com.mx,pedidos.vimpos.com.mx`).
        Con uno solo se rompe el registro de negocios.
      - `VIM_TIENDA_URL=https://pedidos.vimpos.com.mx`.
      - Que existan `VIM_TIENDA_SECRET`, `TURNSTILE_SECRET_KEY` y los `VIM_SMTP_*`.
      - Que **no** exista `CAPTCHA_OPCIONAL`.

      *Comprobar:* la lista de secretos (solo nombres) y que el registro de negocios en
      `admin.vimpos.com.mx/registro` sigue enseñando y resolviendo su captcha.
      *Deshacer:* borrar `TURNSTILE_HOSTNAMES` devuelve el comportamiento de fábrica (solo admin).
- [ ] **1.3 Crear el proyecto `vim-tienda` en Vercel.** · Claude, con tu visto bueno (o tú).
      (Paso 3.) *Comprobar:* el proyecto aparece, con carpeta raíz `apps/tienda`.
      *Deshacer:* borrar el proyecto.
- [ ] **1.4 Sus tres variables, solo en Production.** · Claude, con tu visto bueno (o tú). (Paso 4.)
      La clave de la tienda sale de `C:\Users\Fermi\.vim-pos-llaves\tienda-secret.txt` y nunca se
      pega en el chat. *Comprobar:* las tres en la lista; el despliegue termina en «Ready».
      *Deshacer:* borrar las variables.
- [ ] **1.5 Dominio `pedidos.vimpos.com.mx` y su registro DNS.** · Fermín. (Paso 5.)
      *Comprobar:* `https://pedidos.vimpos.com.mx/` carga una página que dice «Pedidos en línea», y
      `https://pedidos.vimpos.com.mx/nadie-existe` dice «No encontramos esta página».
      *Deshacer:* quitar el dominio en Vercel: la tienda sale de internet en minutos.

## Fase 2 — Probarla nosotros, con un negocio de pruebas y el POS web

Todavía sin instalador nuevo y sin clientes. Se usa **VIM Pruebas** y el POS abierto en el
navegador, que ya sabe recibir pedidos de la tienda.

- [ ] **2.1 Conceder el complemento solo a VIM Pruebas.** · Claude, con tu visto bueno («concede
      el complemento TIENDA a VIM Pruebas»). Se hace a mano en la base, porque mientras el
      complemento esté apagado el panel no lo ofrece.
      *Comprobar:* en el admin de VIM Pruebas, «Tienda en línea» ya no enseña la invitación sino la
      configuración. *Deshacer:* darlo de baja (eso además apaga su tienda).
- [ ] **2.2 Configurar y encender la tienda de VIM Pruebas.** · Fermín, en su admin → Tienda en
      línea: dirección (por ejemplo `vim-pruebas`), una sucursal que participe, horario que incluya
      la hora de la prueba, forma de pago, y el interruptor. Para probar domicilio, una zona de
      envío. (Paso 6 de la guía.) *Comprobar:* la lista de pendientes de la pantalla queda vacía y
      el interruptor queda encendido. *Deshacer:* apagar el interruptor.
- [ ] **2.3 Abrir turno en el POS web** (pos.vimpos.com.mx) en esa sucursal. · Fermín.
      **Sin ninguna caja 0.7.0 abierta en esa misma sucursal.**
      *Comprobar:* la tienda dice «Abierto» y deja pedir.
- [ ] **2.4 Prueba de humo del pedido, de punta a punta**, desde tu teléfono. · Fermín (Claude
      puede ir mirando los registros). Son los nueve puntos del paso 7 de la guía: ver el menú,
      armar el pedido, enviarlo, aceptarlo en el POS, imprimir, cobrar, recibir el correo, cerrar
      turno y ver «Aún no abrimos.»
- [ ] **2.5 Prueba de humo de las cuentas.** · Fermín. Los nueve puntos del paso 8 de la guía:
      crear cuenta, salir, entrar, recuperar contraseña **con un correo real**, pedir con sesión,
      guardar dirección, eliminar la cuenta.
- [ ] **2.6 Lo nuevo de esta entrega.** · Fermín.
      - **Reintentar es seguro.** Arma un pedido, pon el teléfono en modo avión justo al tocar
        «Enviar pedido» y quítalo unos segundos después. La pantalla dice que no pudo confirmar y
        ofrece **Reintentar**. Tócalo. *Comprobar:* en el POS aparece **un solo** pedido, no dos.
        (Si el modo avión no alcanza a cortarlo y el pedido entra a la primera, no pasa nada: la
        prueba solo no se dio.)
      - **Las páginas del pie.** Al final de la tienda hay dos enlaces: «Aviso de privacidad» y
        «Condiciones para pedir». Los dos abren y los dos dicen que son provisionales.
- [ ] **2.7 Mirar la vigilancia.** · Claude, con tu visto bueno. Consultas 1, 3 y 9 de
      [`tienda-vigilancia.md`](tienda-vigilancia.md): salen tus pedidos de prueba, ninguno
      atascado, y tu cuenta de prueba.

**Si algo falla en esta fase**, la tabla «Si algo falla» de la guía dice la causa probable de cada
mensaje. No se sigue a la fase 3 con una prueba a medias.

## Fase 3 — Instalador 0.8.0 de la caja, y prueba con una caja

Las cajas instaladas no reciben pedidos de la tienda hasta tener la 0.8.0.

- [ ] **3.1 Aprobar la lista de lo que incluye la 0.8.0 y su nota.** · Fermín. Está en
      [`instalador-0.8.0-pendiente.md`](instalador-0.8.0-pendiente.md). Sin tu visto bueno no se
      publica.
- [ ] **3.2 Empaquetar la 0.8.0 y probarla instalada en VIM Pruebas, antes de publicarla.**
      · Claude, con tu visto bueno, con la lista «Antes de empaquetar» del RUNBOOK completa
      (instalador de 155 MB o más). Con esa caja, en VIM Pruebas:
      - Abre turno en la caja (y **cierra el POS web** de esa sucursal). La tienda debe decir «Abierto».
      - Haz un pedido desde el teléfono. En la caja suena y aparece en Pedidos en línea. Acéptalo.
      - *Comprobar:* el teléfono pasa a «En preparación»; se crea la cuenta en Pick-up o Domicilio
        y sale la comanda; al imprimir y cobrar, el teléfono avanza a listo y a entregado.
      - **El pedido aceptado que nunca llega a cuenta se cancela solo.** Haz otro pedido, acéptalo
        y **apaga la caja de inmediato** (o desconéctale el internet antes de que cree la cuenta).
        *Comprobar:* a los 15 minutos el teléfono dice que el pedido se canceló. Si la caja alcanzó
        a crear la cuenta antes de apagarse, no se cancela: es lo correcto.
      - Consulta 3 de vigilancia: vacía.
- [ ] **3.3 Publicar la 0.8.0, en martes antes de las 10:00.** · Claude, con tu visto bueno, en el
      orden de [`actualizaciones.md`](actualizaciones.md) §3.
      *Comprobar:* una caja de VIM Pruebas en 0.7.0 ofrece actualizar y queda en 0.8.0.
      *Deshacer:* una caja no baja de versión. Si la 0.8.0 sale mal se corrige con una versión más
      alta; mientras tanto se puede regresar el aviso de actualización a la 0.7.0 para que
      ninguna caja más la tome (lo hace Claude).
- [ ] **3.4 Aviso a clientes de la versión** (es 0.x.0: además de la nota en la caja, un mensaje).
      · Fermín. El texto sugerido está al final de `instalador-0.8.0-pendiente.md`. **Ojo:** ese
      mensaje habla de la tienda; si la fase 4 no va a ser el mismo día, cámbialo por uno que no la
      prometa todavía.

## Fase 4 — Encender el complemento

Este es **el** interruptor. Una sola instrucción en la base:

```sql
SELECT tienda_encender_complemento();
```

**Qué hace, exactamente:**

1. Marca el complemento «Tienda en línea» como activo en el catálogo.
2. Se lo concede, **sin costo**, a cada negocio activo, en prueba o interno cuyo plan la incluye
   (Negocio, Cadena y los planes anteriores por giro) y que no lo tuviera ya.
3. Nada más.

**Qué devuelve:** tres datos, por ejemplo `{"activado": true, "concedidos": 12, "ya_tenian": 1}`.
`activado` dice si el complemento estaba apagado y esta llamada lo prendió; `concedidos`, a cuántos
negocios se les dio en esta llamada; `ya_tenian`, cuántos ya lo tenían (VIM Pruebas, por la fase 2).

**Qué NO hace: no abre ninguna tienda.** Cada dueño tiene que entrar a su admin, configurarla y
encender su propio interruptor. A Esencial no se le concede: lo contrata aparte.

**Qué cambia en ese instante, sin que nadie más toque nada:**

- Los dueños de Negocio y Cadena dejan de ver «Estamos por lanzarla…» en su admin y ven el
  apartado para configurar su tienda. **Pueden encenderla ellos mismos desde ese momento.**
- Los de Esencial ven que cuesta $100 al mes y un botón para escribirte por WhatsApp.
- En el panel de VIM aparece «Tienda en línea» en la sección «Add-ons» de la ficha de cada cliente, para activarla o
  darla de baja a mano.
- De ahí en adelante, cada alta en Negocio o Cadena y cada cambio de plan la concede o la retira
  solo. Pasar a un cliente a Esencial le retira la tienda y se la apaga.

Se puede llamar dos veces sin miedo: la segunda no duplica nada y devuelve `concedidos: 0`.

> **Si prefieres ir más despacio:** las fases 4 y 5 se pueden hacer al revés. Se le concede el
> complemento **solo a Knock-Out**, a mano, igual que a VIM Pruebas en el paso 2.1; se hace toda la
> fase 5; y cuando Knock-Out lleve unos días vendiendo bien, se hace la fase 4 para los demás. Es
> el camino más prudente y no cuesta nada extra.

- [ ] **4.1 Ver a quién se le va a conceder, antes de hacerlo.** · Claude, con tu visto bueno.

      ```sql
      SELECT t.nombre_comercial, t.estado, p.codigo AS plan
        FROM tenants t
        JOIN planes p ON p.id = t.plan_actual_id
       WHERE t.estado IN ('ACTIVO', 'TRIAL', 'INTERNO')
         AND COALESCE((p.features_incluidos ->> 'tienda_incluida')::boolean, false)
       ORDER BY 1;
      ```

      *Comprobar:* lees la lista y estás de acuerdo con ella. Anota cuántos son.
- [ ] **4.2 Anotar cuántas tiendas hay encendidas ahora** (debe ser solo VIM Pruebas). · Claude.

      ```sql
      SELECT count(*) AS tiendas_encendidas FROM configuracion_tenant WHERE modulo_tienda_activo;
      ```
- [ ] **4.3 Encender.** · Claude, **solo con tu visto bueno explícito** («enciende el complemento
      de la tienda»).

      ```sql
      SELECT tienda_encender_complemento();
      ```

      *Comprobar:* `activado` es `true`, y `concedidos` + `ya_tenian` da el número del paso 4.1.
- [ ] **4.4 Comprobar que no abrió ninguna tienda.** · Claude. La consulta del paso 4.2 da **el
      mismo número** que antes. Y la consulta 5 de [`tienda-vigilancia.md`](tienda-vigilancia.md)
      lista a quién se le concedió: todos con `incluido_en_plan = true`, precio `0.00` y
      `tienda_encendida = false` (salvo VIM Pruebas).
- [ ] **4.5 Verlo con tus ojos.** · Fermín. Entra al admin de un negocio en plan Negocio (VIM
      Pruebas sirve): «Tienda en línea» enseña la configuración. En el panel de VIM, la ficha de un
      cliente en Esencial lista «Tienda en línea» a $100 en «Add-ons».

**Cómo deshacer la fase 4.** Hay dos niveles; los dos los hace Claude, con tu visto bueno.

- *Dejar de conceder, sin quitarle nada a nadie:* se apaga el complemento en el catálogo. Las altas
  y los cambios de plan dejan de concederlo y el panel deja de ofrecerlo; quien ya lo tiene, lo
  conserva.

  ```sql
  UPDATE addons SET activo = false WHERE codigo = 'TIENDA';
  ```
- *Retirarlo a todos los que lo recibieron por su plan:* además de lo anterior, se dan de baja esas
  concesiones. **Esto apaga la tienda de quien ya la hubiera encendido** (no borra su
  configuración: al devolvérselo, la vuelve a encender él). No toca a quien la paga aparte.

  ```sql
  UPDATE tenant_addons ta
     SET activo = false, fecha_fin = (now() AT TIME ZONE 'America/Mexico_City')::date
    FROM addons a
   WHERE a.id = ta.addon_id AND a.codigo = 'TIENDA' AND ta.activo AND ta.incluido_en_plan;
  ```

## Fase 5 — Knock-Out, el primer negocio real

- [ ] **5.1 Todas las cajas de Knock-Out están en 0.8.0.** · Claude, con tu visto bueno (segunda
      consulta del punto 7 de [`tienda-vigilancia.md`](tienda-vigilancia.md)). Si alguna no, se
      actualiza antes de seguir. *Deshacer:* nada que deshacer.
- [ ] **5.2 Knock-Out tiene el complemento.** · Claude. Si se hizo la fase 4 y su plan la incluye,
      ya lo tiene; si no, se le concede a mano. *Comprobar:* consulta 5 de vigilancia.
- [ ] **5.3 Configurar su tienda con el dueño, sin encenderla.** · Fermín, con el dueño, en su
      admin → Tienda en línea: dirección (la que irá en su QR y sus redes: **elegirla bien, porque
      cambiarla después rompe lo impreso**), logo y color, sucursal, horario real, formas de pago,
      zonas de envío si reparte, y si acepta a mano o en automático. Revisar que el menú de la
      tienda tenga fotos y que «Combos que tus clientes no pueden pedir» esté vacío.
- [ ] **5.4 Explicarle a quien cobra qué va a ver.** · Fermín. El timbre que se repite, dónde
      aceptar y rechazar, cómo pausar la tienda desde la caja, y que no hay botón de «listo»: el
      cliente se entera cuando se imprime el ticket y cuando se cobra. Apoyo:
      [`tienda-en-linea-caja.md`](tienda-en-linea-caja.md).
- [ ] **5.5 Encender en una hora tranquila y hacer un pedido real de prueba.** · Fermín, desde tu
      teléfono, estando ahí o al teléfono con ellos. Un pedido para recoger pagado en efectivo, de
      punta a punta. *Comprobar:* suena en la caja, sale la comanda, se cobra, y tu teléfono llega
      a «Entregado». *Deshacer:* apagar el interruptor en su admin; la tienda deja de recibir al
      instante.
- [ ] **5.6 Dejarla encendida y mirar los primeros días.** · Claude, con tu visto bueno: cada
      mañana la lista «Qué mirar la primera semana» de [`tienda-vigilancia.md`](tienda-vigilancia.md).
      · Fermín: preguntarle al dueño cómo le fue al tercer día.
- [ ] **5.7 Hasta aquí Knock-Out no la ha anunciado a sus clientes.** Cuando esté tranquilo, se le
      entrega su dirección y su QR (salen del propio admin → Tienda en línea → Compartir).

## Fase 6 — Anunciar

Nada de esto está hecho ni redactado: es la lista de **qué hay que tocar** el día que decidas
anunciarla. Conviene que sea después de la fase 5.

- [ ] **6.1 Sitio web, página de precios** (`sitio-web/precios.html`): una fila «Tienda en línea»
      en la tabla que compara los planes, y una tarjeta entre los extras ($100 al mes en Esencial).
- [ ] **6.2 Sitio web, página de funciones** (`sitio-web/funciones.html`): una sección nueva, y
      sumarla a las descripciones de la página que enumeran las funciones.
- [ ] **6.3 Sitio web, novedades** (`sitio-web/novedades.html`): la nota de la 0.8.0 y de la tienda.
- [ ] **6.4 Regenerar y probar el sitio:** `pnpm sitio:generar` y `pnpm test:sitio`. · Claude.
- [ ] **6.5 Términos del servicio** (`sitio-web/terminos.html`): publicar la sección nueva, ya
      revisada (borrador en [`docs/legal/vimpos-terminos-seccion-tienda.md`](../legal/vimpos-terminos-seccion-tienda.md)),
      con la fecha nueva; y **el mismo día** subir la versión de términos que se le guarda a cada
      negocio que se registra (hoy `2026-10-01`). · Claude, con tu visto bueno.
- [ ] **6.6 Aviso de privacidad de VIM** (`sitio-web/aviso-privacidad.html`): hoy solo habla de los
      comensales de las apps de reparto; falta un párrafo sobre los de la tienda propia (VIM los
      trata por encargo del restaurante).
- [ ] **6.7 Páginas legales de la tienda:** cambiar las dos provisionales por los textos definitivos.
- [ ] **6.8 Aviso a clientes** por WhatsApp o correo: que ya pueden tener su tienda, que no cobra
      comisión, cuánto cuesta en su plan y dónde se enciende. · Fermín (el texto lo puede redactar
      James).
- [ ] **6.9 Redes y material de venta.** · Fermín. Recordatorio: sin números de clientes en público.

Lo que **no** hay que tocar, porque cambia solo: el admin (la invitación ya dice lo que
corresponde a cada plan desde la fase 4) y el panel de VIM.

---

## Cómo apagar todo rápido si algo sale mal

De lo más pequeño a lo más grande. Ninguno borra pedidos, clientes ni configuración.

| Qué pasa | Qué se hace | Quién | Cuánto tarda |
|---|---|---|---|
| Un negocio está rebasado en este momento | **Pausar** la tienda desde la caja (Pedidos en línea → Pausar: 30 minutos, 1 hora o hasta reanudar) | El cajero | Al instante |
| Un negocio tiene un problema con su tienda | **Apagar su interruptor**: su admin → Tienda en línea | El dueño, o tú entrando a su admin | Al instante |
| Hay que quitarle la tienda a un negocio | Panel de VIM → ficha del cliente → Add-ons → Tienda en línea → **Dar de baja…**. Su tienda se apaga sola | Fermín | Al instante |
| La tienda pública falla para todos (no carga, cobra mal, se ve rota) | **Quitar el dominio** `pedidos.vimpos.com.mx` en Vercel → vim-tienda → Settings → Domains. Nadie puede entrar a ninguna tienda; las cajas y el POS siguen vendiendo normal | Fermín | Minutos |
| Hay que apagar **todas** las tiendas ya, sin esperar al dominio | Apagar todos los interruptores desde la base (abajo). Cada dueño tendrá que volver a encender el suyo | Claude, con tu visto bueno | Al instante |
| No quieres que se conceda a nadie más | Apagar el complemento en el catálogo (primer «deshacer» de la fase 4) | Claude, con tu visto bueno | Al instante |
| La caja 0.8.0 salió mal | No se baja de versión: se detiene el aviso de actualización y se corrige con una versión más alta. Es una urgencia: no espera al martes | Claude, con tu visto bueno | Horas |

Apagar todas las tiendas desde la base. **Antes** se guarda la lista de quién la tenía encendida,
para poder avisarles:

```sql
SELECT t.nombre_comercial, tc.slug
  FROM configuracion_tenant c
  JOIN tenants t ON t.id = c.tenant_id
  LEFT JOIN tienda_config tc ON tc.tenant_id = c.tenant_id
 WHERE c.modulo_tienda_activo;
```

```sql
UPDATE configuracion_tenant SET modulo_tienda_activo = false WHERE modulo_tienda_activo;
```

**Después de apagar, siempre:** los pedidos que ya habían entrado siguen en las cajas. Hay que
atenderlos o rechazarlos; los que nadie toque se vencen solos en unos minutos y el cliente lo ve.
Si el corte fue largo, mirar la consulta 3 de vigilancia (atascados).

---

## Anexo — los 18 interruptores y dónde quedó cada uno

Antes de esta entrega se contaron 18 cosas que mantenían la tienda apagada. Esta tabla dice en qué
paso de la lista se mueve cada una, para que no se quede ninguna sin dueño.

| # | Interruptor | Dónde se mueve |
|---|---|---|
| 1 | El complemento, apagado en el catálogo | Paso 4.3 |
| 2 | Que los planes concedan la tienda en altas y cambios de plan | Ya está en la base (0167), pero no actúa hasta el paso 4.3 |
| 3 | Que cada negocio tenga el complemento | Paso 2.1 (VIM Pruebas), 4.3 (todos), 5.2 (Knock-Out); Esencial, a mano desde el panel |
| 4 | Que el panel de VIM sepa que los planes la incluyen | Ya está; se despliega al mezclar y no se ve hasta el paso 4.3 |
| 5 | El interruptor de cada dueño | Pasos 2.2 y 5.5; cada dueño el suyo |
| 6 | La configuración mínima de cada tienda | Pasos 2.2 y 5.3; cada dueño la suya |
| 7 | Una caja con turno abierto avisando | Pasos 2.3 (POS web) y 3.2 (caja 0.8.0) |
| 8 | El instalador 0.8.0 | Fase 3 |
| 9 | El proyecto de Vercel | Paso 1.3 |
| 10 | Las variables de Vercel | Paso 1.4 |
| 11 | El dominio y su DNS | Paso 1.5 |
| 12 | El dominio en el antirobot de Cloudflare | Paso 1.1 |
| 13 | `TURNSTILE_HOSTNAMES` en Supabase | Paso 1.2 |
| 14 | Los demás secretos de Supabase | Paso 1.2 |
| 15 | Migraciones y funciones en producción | Pasos 0.1 y 0.2 |
| 16 | Los textos de la invitación del admin | Ya están; cambian solos en el paso 4.3 |
| 17 | Los textos legales | Decisión 2 y pasos 6.5 a 6.7 |
| 18 | El sitio y las novedades | Pasos 6.1 a 6.4 |
