<!-- fuente: https://developer.clip.mx/reference/habilitar-mostrar-sobre-otras-aplicaciones · capturado 2026-10-08 -->

---
updatedAt: 2026-07-15T01:38:15.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Configurar Clip Wakeup (Mostrar sobre otras aplicaciones)

Las terminales Clip permiten abrir automáticamente la aplicación Clip PinPad al generar una intención de pago mediante la funcionalidad Clip Wakeup.  Para que este comportamiento funcione correctamente en algunos dispositivos, es necesario habilitar el permiso Mostrar sobre otras aplicaciones dentro de la configuración de la aplicación Clip PinPad.

## ¿Qué es Clip Wakeup?

Clip Wakeup es una funcionalidad de la API PinPad que permite abrir automáticamente la aplicación Clip PinPad cuando se genera una intención de pago desde tu integración.

Cuando esta funcionalidad está correctamente configurada, el usuario no necesita abrir manualmente la aplicación antes de procesar el pago.

## ¿Cuándo debo realizar esta configuración?

Esta configuración únicamente es necesaria en algunos modelos de terminales, ya que requieren otorgar manualmente el permiso Mostrar sobre otras aplicaciones.

Aplica para:

* Clip Pro 2
* Clip Total
* Clip Total 2

&#x20;En el resto de las terminales Clip, este permiso viene habilitado de forma predeterminada durante la instalación de la aplicación.

<Callout icon="🚧" theme="warn">
  ### Importante

  Asegúrate de haber iniciado sesión en la aplicación Clip PinPad antes de realizar esta configuración.
</Callout>

## <br />Configuración paso a paso<br />

### Paso 1. Abre la aplicación Clip PinPad

Inicia sesión utilizando tu cuenta.<br />

<Image src="https://files.readme.io/f88ad97353295177b9a41ce26d0c9d63beaf842a8a4fdf4071fdd66db88f58bf-Captura_de_pantalla_2026-07-14_183617.png" align="left" width="300px" wrap={false} />

### Paso 2. Accede a tu perfil

Desde la pantalla principal selecciona tu **Perfil**

![](https://files.readme.io/0c48870191ac47adabedd124484a86f028e78894be4f2039c32e432a7a0dd7f8-Captura_de_pantalla_2026-07-14_155056.png)

<br />

### Paso 3. Selecciona "Mostrar sobre otras aplicaciones"

Dentro del menú encontrarás la opción **Mostrar sobre otras aplicaciones.**

![](https://files.readme.io/62e4ee3318d1d74836ae54ec14f26bdfee1d38709cd6524984ed5ca849cbad89-Captura_de_pantalla_2026-07-14_155150.png)

<br />

### Paso 4. Selecciona Clip PinPad

Busca la aplicación **Clip PinPad** dentro de la lista.

![](https://files.readme.io/f4875a845620863ef494411d96d8b434f7ec50858e9f8586e6f3467a253d7c9d-Captura_de_pantalla_2026-07-14_155255.png)

### Paso 5. Activa el permiso

Habilita la opción:

**Permitir mostrar sobre otras apps**

![](https://files.readme.io/fa456904169011e3b3e300444c5d62a711b0d00ced1b37ae75414579c73ba74c-Captura_de_pantalla_2026-07-14_155348.png)

### Paso 6. Regresa a la aplicación

Una vez habilitado el permiso, vuelve a la pantalla principal de Clip PinPad.

Con esto la configuración habrá finalizado.

![](https://files.readme.io/ea3443d298cc51d616a220218c2d704b00fccb245c384effa7ea9bc490c2442c-Captura_de_pantalla_2026-07-14_155453.png)

<Callout icon="🚧" theme="warn">
  ### Importante

  Para el resto de Terminales Clip, este comportamiento viene habilitado desde su instalación.
</Callout>

<Callout icon="📘" theme="info">
  ### ¿Necesitas Ayuda?

  Si lo que buscas no está documentado, contáctanos por el siguiente medio:

  - Envía un correo electrónico a la dirección [sdk@payclip.com](mailto:sdk@payclip.com).
</Callout>

<br />