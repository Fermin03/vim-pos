<!-- fuente: https://apisandbox.facturama.mx/guias/primeros-pasos · capturado 2026-09-03 -->

# Referenciar SDK para su uso

            Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

### Ruby

Referencia a la gema de facturama

#### Referencia

**require 'facturama'**

### PHP

    Referencia a la librería

#### Referencia

**require __DIR__.'/vendor/autoload.php';**

### Javascript

    Puede ser descargado desde el  [repositorio.](https://github.com/Facturama/facturama-javascript-sdk)

Puedes colocar los archivos en la ruta que te parezca adecuada, y refenciarlos como cualquier archivo JS.

#### Referencias

**<script src='https://code.jquery.com/jquery-3.1.1.min.js'></script>**

**<script src='../Facturama/facturama.api.js'></script>**

**<script src='../Facturama/facturama.api.multiemisor.js'></script>**

### Java

    Puedes descargar el archivo jar de [aquí](https://github.com/Facturama/facturama-java-sdk/blob/dev/dist/FacturamaAPISDK-0.1.jar)
    o acceder al  [repositorio.](https://github.com/Facturama/facturama-java-sdk)

Agrega el archivo jar como una referencia en tu proyecto.

#### Referencias

**import com.Facturama.sdk_java.Models.*;**

**import com.Facturama.sdk_java.Services.*;**

### .Net Framework 4.5 ó superior

Una vez instalado el paquete con NuGet se coloca  la referencia donde se va a emplear:

#### Referencia

                        **
                            using Facturama;

                            using Facturama.Models;

                            using Facturama.Models.Request;

                        **

### Python

#### Referencia

                **
                    import facturama
                **

## Crear una instancia Facturama API

### Ruby

Ejemplo de creación de una instancia de la API de Facturama.

            Puedes obtener tu **usuario** y **contraseña** creando tu cuenta de Facturama, puedes [ver en la guía](https://apisandbox.facturama.mx/guias/crear-cuenta) cómo crearla en
            [Sandbox](https://dev.facturama.mx/api/registro) ó
            [Producción](https://app.facturama.mx/web/registro).

#### Crear instancia

**facturama = Facturama::FacturamaApiWeb.new('username', 'password',true)**

### PHP

    Es recomendable utilizar [composer](https://getcomposer.org/)  para instalar la librería ó puedes hacer fork del
    [repositorio](https://github.com/Facturama/facturama-php-sdk) y modificar a tu conveniencia.

#### Crear instancia

**$facturama = new \Facturama\Client('username', 'password');**

### Javascript

    Configura **valuesFacturama**, que es un objeto que contiene los valores:

#### url

        Una de las URL Base de Facturama API, aquí debes colocar la que corresponda a la modalidad deseada:

        Modo Sandbox:  **https://apisandbox.facturama.mx/**

        Modo Producción:  **https://api.facturama.mx/**

        Toma en cuenta que la URL debe terminar con la diagonal, para que  funcione correctamente

#### token

        Cadena en base64 de tu usuario y contraseña de facturama, empleado para la autenticación básica (basic auth) en la forma:

        **usuario:contraseña**

        La cadena formada en el ejemplo está formada por:   **pruebas:pruebas2011** en base64

#### Crear instancia

                **
                    var valuesFacturama = {

                      token: "cHJ1ZWJhczpwcnVlYmFzMjAxMQ==",

                      url: "https://apisandbox.facturama.mx/"

                    };
                **

Después de las configuración de valuesFacturama, se tiene automáticamente una instancia de facturama en **window.Facturama**

    Y es usable como **Facturama**

### Java

El valor **isDevMode** es un booleano donde **true = Modo Sandbox y false = Modo Producción**

#### Crear instancia

**FacturamaApi facturama = new FacturamaApi('username', 'password', isDevMode);**

### .Net Framework 4.5 ó superior

El tercer parámetro es un booleano que indica si está en modo sandbox o producción. En el caso de que no esté presente, se considera Sandbox.

#### Referencia

**var facturama = new FacturamaApi('username', 'password');**

### Python

El tercer parámetro es un booleano que indica si está en modo sandbox o producción. En el caso de que no esté presente, se considera Sandbox.

#### Referencia

                **
                    facturama._credentials = ('username', 'password')

                    facturama.sandbox = True
                **

Después de las configuración, se tiene automáticamente una instacia de facturama en **facturama**
