<!-- fuente: https://apisandbox.facturama.mx/guias/perfil-fiscal · capturado 2026-09-03 -->

# Perfil fiscal

El perfil fiscal, contiene los datos fiscales del propietario de la cuenta, que se emplean para 2 finalidades:

- Al momento de contratar servicios de Facturama, **estos datos se emplean para que nosotros (Facturama) te facturemos los servicios contratados**

- En el caso de API Web, estos datos se emplean además como los **datos del emisor**

- [Acceder al perfil fiscal](https://apisandbox.facturama.mx/guias/perfil-fiscal#acceder-perfil-fiscal)

- [Menú del perfil fiscal](https://apisandbox.facturama.mx/guias/perfil-fiscal#menu-perfil-fiscal)

- [Mi perfil](https://apisandbox.facturama.mx/guias/perfil-fiscal#mi-perfil)

- [Carga de sellos digitales CSD y FIEL](https://apisandbox.facturama.mx/guias/perfil-fiscal#carga-csd-fiel)

- [Lugares de expedición y series](https://apisandbox.facturama.mx/guias/perfil-fiscal#lugares-expedicion-series)

- [Tipos de comprobantes](https://apisandbox.facturama.mx/guias/perfil-fiscal#tipos-de-comprobantes)

## Acceder al perfil fiscal

- Ubica la **barra de navegación** en la parte superior derecha de cualquier ventana de Facturama

-
        Presiona el ícono
        ![imagen](https://apisandbox.facturama.mx/Areas/Guias/Content/img/navbar-user.png)

    ![imagen](https://apisandbox.facturama.mx/Areas/Guias/Content/img/navbar-facturama.png)

Barra de navegación de Facturama, ubicada en la sección superior derecha de cualquier ventana

## Menú del perfil fiscal

Una vez que accedemos al perfil fiscal, aparece un menú adicional en la **sección derecha de la ventana**, donde tenemos las opciones para modificar todo lo referente a la cuenta.

            ![imagen](https://apisandbox.facturama.mx/Areas/Guias/Content/img/perfil-fiscal-menu.png)

Menú del perfil fiscal

## Mi perfil

Permite editar:

- Logo

- RFC

- Información del perfil fiscal

            ![imagen](https://apisandbox.facturama.mx/Areas/Guias/Content/img/perfil-fiscal-mi-perfil.png)

## Carga de Sellos digitales CSD y Fiel

Los **Sellos digitales** son necesarios para la **creación de CFDIs**, pues se emplean para validar el emisor ante el [PAC.](#)

            La **Firma electrónica avanzada** se emplea para la recuperación de facturas previas (se recuperan directamente del SAT).

            Y en el caso de que decidas que el **Equipo de contabilidad de Facturama** te lleve tu contabilidad.

Para ambos tipos de sellos, se emplean los controles:

-
                ![imagen](https://apisandbox.facturama.mx/Areas/Guias/Content/img/sellos-digitales-cer.png)
                Carga del certificado

-
                ![imagen](https://apisandbox.facturama.mx/Areas/Guias/Content/img/sellos-digitales-key.png)
                Carga de la llave

-
                ![imagen](https://apisandbox.facturama.mx/Areas/Guias/Content/img/sellos-digitales-key-bajar.png)
                Descarga de la llave

-
                ![imagen](https://apisandbox.facturama.mx/Areas/Guias/Content/img/sellos-digitales-cer-bajar.png)
                Descarga del certificado

            ![imagen](https://apisandbox.facturama.mx/Areas/Guias/Content/img/sellos-facturama.png)

## Lugares de expedición y series

Son las sucursales que tiene una misma entidad fiscal.

Cada una de las sucursales puede tener una o más series.

            ![imagen](https://apisandbox.facturama.mx/Areas/Guias/Content/img/perfil-fiscal-lugares-expedicion.png)

Lugares de expedición donde se muestra además el listado de series de la Sucursal principal

#### Agregar lugar de expedición

            Puedes agregarlo, presionando el botón
            ![imagen](https://apisandbox.facturama.mx/Areas/Guias/Content/img/perfil-fiscal-lugares-expedicion-boton.png)

La información más relevante al SAT es el **código postal**, el cual tiene que ser válido y seleccionable de la lista.

        ![imagen](https://apisandbox.facturama.mx/Areas/Guias/Content/img/perfil-fiscal-lugares-expedicion-nuevo.png)

Especificando un nuevo lugar de expedición

#### Series y agregar serie

            Puedes ver las **series de una sucursal** presionando el ícono
            ![imagen](https://apisandbox.facturama.mx/Areas/Guias/Content/img/perfil-fiscal-lugares-expedicion-boton-serie-lineas.png)
            que se encuentra al lado del nombre de la sucursal.

            En el listado que se muestra, agrega una serie presionando el botón.
            ![imagen](https://apisandbox.facturama.mx/Areas/Guias/Content/img/perfil-fiscal-lugares-expedicion-boton-serie.png)

Al momento de crear la serie, se le puede especificar el **número de folio en el que inicia.**

        ![imagen](https://apisandbox.facturama.mx/Areas/Guias/Content/img/perfil-fiscal-lugares-expedicion-nueva-serie.png)

Agregando la serie RED que inicia en el folio 150

## Tipos de comprobantes

            Puedes seleccionar los tipos de comprobantes que deseas tener disponibles en tu plataforma

            Marcando las casillas correspondientes.

            Los tipos de comprobantes marcados, son los que estarán disponibles al obtener el listado de **"Catálogo de nombres" (NameIds).**

            * Puedes marcar todos por ejemplo sin un costo adicional

            ![imagen](https://apisandbox.facturama.mx/Areas/Guias/Content/img/perfil-fiscal-tipos-comprobantes.png)

Selección de tipos de comprobantes que se desean disponibles en la plataforma
