<!-- fuente: https://apisandbox.facturama.mx/guias/crear-cuenta · capturado 2026-09-03 -->

# Crear una cuenta

**La API se maneja en 2 entornos independientes (Sanbox y Producción)**, dependiendo del entorno que deseas usar, requieres una cuenta del mismo.

Para saber en que entorno estás creando la cuenta, debes fijarte en la URL, o seguir estos pasos:

### Crear cuenta en Sandbox

- [Ingresa a la URL de Registro en Sandbox](https://dev.facturama.mx/api/registro)

-  Completa el proceso de llenado de datos donde el "Wizard" te lleva de la mano y ademas puedes consultar [aquí para cualquier duda](https://apisandbox.facturama.mx/guias/datos)  *

### Crear cuenta en Producción

- [Ingresa a la URL de Producción](https://app.facturama.mx/api/registro)

- Completa el proceso de llenado de datos donde el "Wizard" te lleva de la mano y ademas puedes consultar [aquí para cualquier duda](https://www.api.facturama.com.mx/guias/datos)  *

* El proceso de llenado de datos es idéntico para ambos entornos

### URLs base para las peticiones

Dependiendo del entorno en que vas a consumir la API, las peticiones se realizan a alguna de nuestras URLs

- Sandbox / Pruebas: **https://apisandbox.facturama.mx/**

- Productivo / Facturas reales:   **https://api.facturama.mx/**

#### Recomendaciones

```
1) Que tu usuario de Sandbox sea diferente del de Producción
    Emplea diferentes usuarios y contraseñas para los distintos ambientes
   esto te evitará confusiones respecto al ambiente con el que estas trabajando

2) Que los datos empleados para hacer las pruebas sean un poco diferentes
o completamente diferentes a los reales de tu negocio
    En el ambiente Sandbox no coloques los datos precisos de tu empresa o negocio
    esto te evitará confusiones respecto al ambiente con el que estas trabajando,
    y te permitirá identificar un comprobante de pruebas con respecto a uno real, con tan solo ver el XML o PDF
```

### Ejemplo de creación de cuenta en entorno Sandbox (pero aplica igual para el entorno de Producción)

Especificando los datos de usuario y contraseña, que permitirán hacer "login"

>Observaciones:

- El RFC deberá ser único en la plataforma, es decir que no debe de estár asociado a ninguna cuenta

- En el caso de que se desee emplear la API Multiemisor, el RFC continua siendo requerido

- Esto es porque el RFC especificado, es al cual se le expedirán las facturas por contratación del servicio de Facturación. (Es decir, tu RFC como cliente de Facturama)

		Nota: Se puede colocar el RFC de pruebas de SAT para crear una cuenta: **EKU9003173C9**

		(Esto solo es recomendable en el ambiente de Sandbox)

	![imagen](https://apisandbox.facturama.mx/Areas/Guias/Content/img/facturama-registro-sandbox.png)
