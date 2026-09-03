<!-- fuente: https://apisandbox.facturama.mx/guias/descargar-sdk · capturado 2026-09-03 -->

# Descargar el SDK

    **Los SDKs, brindan las herramientas, para consumir la API de Facturama.**

    Los SDK funcionan para ambos **entornos (Sandbox y Producción)** y para

    ambas **modalidades (API Web y API Multiemisor).**

    puedes ir a las [Generalidades](https://apisandbox.facturama.mx/guias/diferencias) de esta documentación para aclarar ambos conceptos

            Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

### Ruby

    Para ruby se tiene la gema en rubygems: [https://rubygems.org/gems/facturama](https://rubygems.org/gems/facturama)

#### Instalación de la gema

**gem install facturama**

### PHP

    Es recomendable utilizar [composer](https://getcomposer.org/)  para instalar la librería ó puedes hacer fork del
    [repositorio](https://github.com/Facturama/facturama-php-sdk) y modificar a tu conveniencia.

#### Instalación via composer

**composer require facturama/facturama-php-sdk:^2.0@dev**

### Javascript

    Puede ser descargado desde el  [repositorio](https://github.com/Facturama/facturama-javascript-sdk)

#### Archivos JS

**facturama.api.js**

**facturama.api.multiemisor.js**

### Java

    Puede ser descargado desde el  [repositorio](https://github.com/Facturama/facturama-java-sdk)

### .Net Framework 4.5 ó superior

    Es recomendable utilizar [NuGet](https://docs.microsoft.com/es-es/nuget/)  para instalar la librería ó puedes hacer fork del
    [repositorio](https://github.com/Facturama/facturama-dotnet-sdk) y modificar a tu conveniencia.

#### Instalación NuGet

**Install-Package Facturama**

El comando debe ser ejecutado en **Package Manager Console** el cual es accesible mediante: View > Other Windows > Package Manager Console

### Python

    Es recomendable utilizar [pip](https://pip.pypa.io/en/stable/)  para instalar la librería ó puedes hacer fork del
    [repositorio](https://github.com/Facturama/facturama-python-sdk) y modificar a tu conveniencia.

#### Instalación mediante pip

**pip install -e git://github.com/Facturama/facturama-python-sdk.git@master#egg=facturama**
