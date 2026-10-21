# Textos legales de la tienda en línea — léeme primero

Fermín: en esta carpeta hay **tres borradores**. Ninguno está publicado y ninguno debe publicarse
hasta que lo lea una persona con criterio legal (un abogado, o alguien que sepa de protección de
datos y de consumo). Los escribió Claude a partir de cómo funciona el sistema de verdad; lo que
pueden tener mal no es lo que dicen que hace el sistema, sino si eso basta para cumplir la ley.

| Archivo | Para quién es | Dónde se publicaría |
|---|---|---|
| [`tienda-aviso-de-privacidad.md`](tienda-aviso-de-privacidad.md) | El comensal que pide en la tienda de un restaurante | En cada tienda: `pedidos.vimpos.com.mx/<negocio>/privacidad` |
| [`tienda-terminos-para-el-comensal.md`](tienda-terminos-para-el-comensal.md) | El mismo comensal | En cada tienda: `pedidos.vimpos.com.mx/<negocio>/terminos` |
| [`vimpos-terminos-seccion-tienda.md`](vimpos-terminos-seccion-tienda.md) | El restaurante que contrata VIM POS | Sección nueva en `vimpos.com.mx/terminos` |

**Qué hay hoy en la tienda, mientras tanto.** Dos páginas cortas, veraces y marcadas como
provisionales: «Aviso de privacidad» y «Condiciones para pedir», enlazadas al pie de cada tienda.
No aparecen en buscadores. Dicen lo que el sistema hace, sin pretender ser el texto legal completo.

**Cómo leer los borradores.** Lo que va entre `[CORCHETES EN MAYÚSCULAS]` es un hueco que cambia de
un restaurante a otro. Los párrafos que empiezan con `> Nota para quien revisa:` no son parte del
texto: son las dudas que Claude no puede resolver y que le tocan a quien revise.

---

## La idea de fondo, en tres frases

1. **El restaurante es el responsable** de los datos de sus comensales: son sus clientes y es él
   quien decide para qué se usan.
2. **VIM es el encargado**: guarda y procesa esos datos por cuenta del restaurante, y nada más.
3. Por eso el aviso de privacidad de cada tienda va **a nombre del restaurante**, no de VIM, y por
   eso los términos de VIM POS necesitan una sección donde el restaurante lo acepte.

Es lo que se decidió en el diseño de la tienda, y es el mismo criterio que ya usa VIM con los datos
de los comensales de Uber.

---

## Decisiones que estos textos obligan a tomar

Ordenadas de la que más pesa a la que menos.

### 1. ¿Se le pide al restaurante su razón social y su domicilio?

**El problema.** La ley pide que el aviso de privacidad diga quién es el responsable y cuál es su
domicilio. Hoy la tienda solo conoce el **nombre comercial** del restaurante («Knock-Out Burger») y
los teléfonos de sus sucursales. No sabe la razón social, ni el domicilio del responsable, ni un
correo para solicitudes sobre datos personales. Los tres huecos del borrador no se pueden llenar.

**Las opciones.**

- **(a) Pedírselo al dueño en el admin y que sea requisito para encender la tienda.** Es lo
  correcto y lo que los borradores dan por hecho. Qué habría que cambiar en el producto:
  - Tres datos nuevos en la configuración de la tienda: nombre o razón social del responsable,
    domicilio, y correo o medio de contacto para datos personales. El sistema ya tiene un campo de
    razón social del negocio (el de los datos fiscales), pero casi siempre está vacío en negocios
    que no facturan, y no hay domicilio del negocio en ningún lado; lo más limpio es que la tienda
    tenga los suyos y que la razón social se proponga sola cuando ya exista.
  - Un bloque nuevo en Admin → Tienda en línea («Datos legales»), con una línea que explique para
    qué son y que se van a ver en público.
  - Un pendiente más en la lista que ya impide encender la tienda si falta algo.
  - Que las dos páginas de la tienda (aviso y condiciones) los enseñen.
  - Tamaño: una migración pequeña, un bloque de formulario y dos páginas. Del orden de una entrega
    corta; no es de un día para otro porque toca base, admin y tienda, con sus pruebas.
  - Los negocios que ya tuvieran la tienda encendida ese día tendrían que llenarlos: hay que decidir
    si se les da un plazo o se les apaga.
- **(b) Salir con el nombre comercial y los teléfonos, y completarlo después.** Es lo que hacen hoy
  las páginas provisionales. Más rápido; deja el aviso incompleto frente a la ley mientras dure.
- **(c) Que el restaurante mande sus datos por WhatsApp y VIM los capture a mano.** Sirve para los
  primeros cinco negocios; no para cincuenta. Necesita igual los tres datos nuevos en la base.

**Recomendación:** (a) antes de anunciar la tienda en grande; (b) es defendible para la prueba con
Knock-Out y los primeros negocios, sabiendo que es temporal.

### 2. ¿El dueño acepta condiciones al encender su tienda?

Hoy enciende con un interruptor y nada más. La sección nueva de los términos lo hace responsable de
los datos de sus clientes, y eso conviene que conste: los negocios que dio de alta VIM desde el
panel **nunca aceptaron ningunos términos en pantalla** (solo quien se registró solo tiene guardada
la versión que aceptó).

**Recomendación:** sí; una casilla la primera vez que enciende, que guarde la fecha y la versión
del texto, como ya se hace al conectar Uber. **No está construido.**

### 3. ¿Quién revisa los textos, y con cuáles se enciende?

- Encender con las páginas provisionales y cambiarlas cuando estén los definitivos, **o** esperar a
  los definitivos.
- Las provisionales no mienten, pero no son un aviso de privacidad completo (no tienen el domicilio
  del responsable ni el procedimiento formal para ejercer derechos).

**Recomendación:** provisionales para la prueba interna y Knock-Out; definitivos antes del aviso a
todos los clientes.

### 4. ¿Cuándo se publica la sección nueva de los términos de VIM POS, y cómo se avisa?

Los términos vigentes prometen avisar con **30 días** si un cambio afecta al cliente. Una sección
que solo aplica a quien encienda la tienda se puede leer como «no te afecta si no la usas», pero es
una interpretación: que lo confirme quien revise. El día que se publique hay que subir también la
versión de términos que se guarda en cada registro nuevo.

### 5. ¿Se informa algo más sobre los proveedores que reciben datos?

La tienda carga dos servicios de fuera que reciben la dirección IP del visitante: el antirobot
(Cloudflare) y las tipografías (Google). Además están la nube donde vive la base y el alojamiento
de la página, con servidores fuera de México.

- Decidir si en el aviso se nombran las empresas o basta con describirlas.
- **Las tipografías de Google se pueden quitar**: servirlas desde la propia página (como ya hace el
  sitio de VIM) es un cambio pequeño y borra un tercero del aviso. Recomendación: hacerlo.
- Confirmar en qué país están los servidores de la base antes de publicar el aviso.

### 6. Las notas del pedido pueden traer datos de salud

El cliente puede escribir «soy alérgico al cacahuate». No se pide, pero puede llegar, y es un dato
sensible. Esas notas se borran del pedido en línea a los 30 días, pero **se quedan en la cuenta de
la venta** dentro del sistema del restaurante. Que quien revise diga si hace falta una frase
expresa, y si conviene poner junto al campo de notas un texto como «No escribas datos personales».

### 7. Cosas que los borradores prometen y el sistema todavía no hace

Si se quedan en el texto, hay que construirlas; si no, se quitan.

| Lo que dice el borrador | Cómo está hoy |
|---|---|
| «Si el aviso cambia y tienes cuenta, se te avisa a tu correo» | No existe. |
| Queda constancia de que el comensal aceptó el aviso al crear su cuenta | La pantalla dice «Al crear tu cuenta aceptas el aviso de privacidad», pero **no se guarda la fecha** de esa aceptación (el lugar para guardarla existe y está vacío). |
| El restaurante atiende las solicitudes de acceso, corrección y borrado | El restaurante puede editar o eliminar a un cliente en su admin, pero ese «eliminar» **solo lo quita de la lista: el registro sigue guardado** en la base. No hay un borrado de verdad de «todo lo de esta persona» (cliente, direcciones, nombre y nota en sus cuentas), ni un procedimiento escrito para cuando se lo pida a VIM. Es el hueco más serio de esta tabla. |
| VIM avisa al restaurante «sin demora» si hay un acceso indebido | No hay procedimiento escrito. |
| Los datos del pedido se borran a los 30 días | Cierto en la nube. **No está comprobado** que el borrado llegue a la copia que guarda la computadora de la caja del restaurante. |
| Una cuenta dura «hasta que la elimines» | Cierto, y por eso mismo una cuenta abandonada no caduca nunca. Decidir si debe caducar por inactividad. |

### 8. Detalles para quien revise

- **Menores de edad:** la tienda no pregunta la edad.
- **Devoluciones:** el borrador de condiciones no fija política; cada restaurante tiene la suya.
- **Jurisdicción** de las condiciones para el comensal: sin decidir.
- **Facturas:** el borrador dice «pídesela al restaurante»; es cierto, la tienda no factura.
- **Confirmar el correo al registrarse:** hoy no se exige, y por eso quien pruebe correos puede
  deducir si uno ya es cliente de un restaurante. Es una decisión de producto ya tomada y
  documentada (`docs/decisiones/0032`); se menciona aquí porque toca a la privacidad.
- **Plazos para contestar una solicitud** (20 y 15 días hábiles) y **nombre de la autoridad**: se
  copiaron del aviso de privacidad vigente de VIM; verificar que siguen vigentes.

---

## Cuando los textos estén revisados

1. Decidir la 1 y la 2 (son las que piden trabajo en el producto).
2. Pasar el aviso y las condiciones revisados a las dos páginas de la tienda, quitando la franja de
   «provisional».
3. Publicar la sección nueva en los términos de VIM POS, con su fecha, y subir la versión de
   términos.
4. Añadir al aviso de privacidad **de VIM** un párrafo sobre los comensales de la tienda propia (hoy
   solo habla de los de las apps de reparto).

Todo eso está en la fase 6 de [`../operacion/tienda-encendido.md`](../operacion/tienda-encendido.md).
