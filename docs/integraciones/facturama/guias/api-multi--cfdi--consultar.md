<!-- fuente: https://apisandbox.facturama.mx/guias/api-multi/cfdi/consultar · capturado 2026-09-03 -->

# Consultar CFDIs para API Multiemisor

            Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

	Recuerda que la API tiene 2 modalidades API Web y API Multiemisor [Ver modalidades de la API](https://apisandbox.facturama.mx/guias#api-modalidades)

	En este caso estamos tratando para **API Multiemisor**

**Parámetros de filtrado**

- [Tipo de CFDIs a consultar](https://apisandbox.facturama.mx/guias/api-multi/cfdi/consultar#type)

- [Intervalo de folios](https://apisandbox.facturama.mx/guias/api-multi/cfdi/consultar#folio-intervals)

- [Intervalos de fechas](https://apisandbox.facturama.mx/guias/api-multi/cfdi/consultar#date-intervals)

- [RFC del Emisor](https://apisandbox.facturama.mx/guias/api-multi/cfdi/consultar#issuer-rfc)

- [RFC del Receptor](https://apisandbox.facturama.mx/guias/api-multi/cfdi/consultar#receiver-rfc)

- [Nombre del Receptor](https://apisandbox.facturama.mx/guias/api-multi/cfdi/consultar#receiver-name)

- [Paginación](https://apisandbox.facturama.mx/guias/api-multi/cfdi/consultar#page)

#### URL para las consultas

#### GET

```
https://apisandbox.facturama.mx/cfdi?type=issuedLite
```

### Parámetros disponibles para el filtrado:

Los parámetros de filtrado son incluyentes, por lo que se pueden usar varios o todos al mismo tiempo para acotar los resultados

	**type**:  Indica el tipo de CFDI que se está consultando (parámetro obligatorio)

Valores disponibles para API Multiemisor:

- **issuedLite** = Emitida en API Multiemisor

Valores para el filtrado de un un intervalo de folios (aplica únicamnete para folios numéricos)

	**folioStart**: Folio de inicio para el intervalo

	**folioEnd**: Folio de final

		Se puede buscar por un único folio, especificando el mismo como inicio y fin del intervalo

Valores para el filtrado por intervalo de fechas

	**dateStart**: Folio de inicio para el intervalo

	**dateEnd**: Folio de final

Formato: dia/mes/año  Ejemplo:   **01/01/2020**

Filtrado por RFC del emisor

	**rfcIssuer**:  RFC del emisor o una parte del mismo

Filtrado por RFC del receptor

	**rfc**:  RFC del receptor o una parte del mismo

Filtrado nombre del receptor

	**taxEntityName**:  Nombre del receptor o una parte del mismo

	**status**:  Estado de cancelación del CFDI

Valores disponibles:

- **all** = Todas (activas, canceladas)

- **active** = Activas

- **canceled** =  Canceladas

	**page**:  Número página

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
https://apisandbox.facturama.mx/cfdi?type=issuedLite&folioStart=100&folioEnd=200&rfcIssuer=EKU9003173C9&rfc=XAXX&taxEntityName=Publico&dateStart=01/01/2019&dateEnd=15/02/2019&status=active&page=0
```

**Te recordamos que puedes usar uno de nuestros SDKs, en el caso de usar un SDK, el méfodo que representa ese opción es List **

[**Ver los SDKs**](https://github.com/Facturama/)
