<!-- fuente: https://apisandbox.facturama.mx/guias/api-web/cfdi/consultar · capturado 2026-09-03 -->

# Consultar CFDIs para API Web

            Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

	Recuerda que la API tiene 2 modalidades API Web y API Multiemisor [Ver modalidades de la API](https://apisandbox.facturama.mx/guias#api-modalidades)

	En este caso estamos tratando para **API Web**

**Parámetros de filtrado**

- [Tipo de CFDIs a consultar](https://apisandbox.facturama.mx/guias/api-web/cfdi/consultar#type)

- [Intervalo de folios](https://apisandbox.facturama.mx/guias/api-web/cfdi/consultar#folio-intervals)

- [Intervalos de fechas](https://apisandbox.facturama.mx/guias/api-web/cfdi/consultar#date-intervals)

- [RFC del Receptor](https://apisandbox.facturama.mx/guias/api-web/cfdi/consultar#receiver-rfc)

- [Nombre del Receptor](https://apisandbox.facturama.mx/guias/api-web/cfdi/consultar#receiver-name)

- [Paginación](https://apisandbox.facturama.mx/guias/api-web/cfdi/consultar#page)

#### URL para las consultas

#### GET

```
https://apisandbox.facturama.mx/cfdi?type=issued
```

### Parámetros disponibles para el filtrado:

Los parámetros de filtrado son incluyentes, por lo que se pueden usar varios o todos al mismo tiempo para acotar los resultados

	**type**:  Indica el tipo de CFDI que se está consultando (parámetro obligatorio)

Valores disponibles para API Web:

- **issued** = Emitida

- **received** = Recibidas

- **payroll** =  Nomina

Filtrar empleando un intervalos de folios

	**folioStart**: Folio de inicio para el intervalo

	**folioEnd**: Folio de final

		Se puede buscar por un único folio, especificando el mismo como inicio y fin del intervalo

Valores para el filtrado por intervalo de fechas

	**dateStart**: Folio de inicio para el intervalo

	**dateEnd**: Folio de final

Formato: dia/mes/año  Ejemplo:   **01/01/2020**

Filtrado por RFC del receptor

	**rfc**: RFC del receptor o una parte del mismo

Filtrado nombre del receptor

	**taxEntityName**:  Nombre del receptor o una parte del mismo

	**status**: Estado de cancelación del CFDI

Valores disponibles:

- **all** = Todas (activas, canceladas y pendientes )

- **active** = Activas

- **canceled** =  Canceladas

- **pending** =  Pendientes (en espera de que el receptor acepte o rechace una solicitud de cancelación)

	**orderNumber**: Número de orden

Valores disponibles:

- **true** = Muestra únicamente las que SI tienen Número de Orden

- **false** = Muestra únicamente las que NO tienen Número de Orden

- **ValorEspecífico** Muestra las que tienen específicamente el número de orden. Ejemplo de valor específico:  **P-E-005036-1-1**

	**page**: Número página

Los catálogos y el listado de CFDIs están paginados, esto quiere decir que:

		Unicamente se muestran 100 elementos por cada respuesta de la API.

		Para cambiar (o especificar) la página se emplea el atributo **page**

	Ejemplo:

- **page=0** =  Representa los primeros 100 elementos (del 1 al 100)

- **page=1** = Representa los segundos 100 elementos (del 101 al 200)

- etc.

#### Ejemplo de uso de los parámetros de filtrado

#### GET

```
https://apisandbox.facturama.mx/cfdi?type=issued&folioStart=100&folioEnd=200&rfc=XAXX&taxEntityName=Publico&dateStart=01/01/2019&dateEnd=15/02/2019&status=active&orderNumber=true&page=0
```

**Te recordamos que puedes usar uno de nuestros SDKs, en el caso de usar un SDK, el méfodo que representa ese opción es List **

[**Ver los SDKs**](https://github.com/Facturama/)
