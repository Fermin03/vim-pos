<!-- fuente: https://apisandbox.facturama.mx/guias/api-multi/proceso-facturacion · capturado 2026-09-03 -->

# Proceso de facturación en API Multiemisor

            Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

	Al usar la API Multiemisor,  se tiene la ventaja de poder crear CFDIs desde diferentes Emisores,

	siempre y cuando se tengan los sellos digitales (CSD) de cada uno de los RFCs con los que se desea emitir CFDIs

	Si quieres conocer acerca de que son los CSD, puedes revisar ésta entrada de nuestro blog:

	[Que son los Sellos Digitales CSD](https://facturama.mx/blog/que-significa/sellos-digitales-csd/)

	En ocasiones se tienen dudas acerca de si se puede usar la API Multiemisor y API Web a la vez

	Te comento que solo contamos con una API que tiene 2 modalidades (API Web y API Multiemisor)

	[Ver documentación de las modalidades de la API](https://apisandbox.facturama.mx/guias#api-modalidades)

	Una sola cuenta de API la puedes usar para API Web y para API Multiemisor (al mismo tiempo, sin costo adicional).

#### Para usar API Multiemisor los pasos son:

	 **1)** Carga los sellos digitales de los RFCs con los que deseas emitir

	Lo sellos solo los cargas una vez, y en adelante los podrás usar para generar los CFDIs,

	Nosotros nos basamos en el RFC del emisor para buscar en tu cuenta los certificados correspondientes.
	[Ver como cargar los sellos](https://apisandbox.facturama.mx/guias/api-multi/csds)

	**2)** Emite un CFDI

	[Ver como emitir un CFDI en API Multiemisor](https://apisandbox.facturama.mx/guias/api-multi/cfdi/factura)

	El endpoint es diferente al de API Web y en el caso de que uses un SDK también será necesario que tomes en cuenta este nuevo endpoint.

	**3)** Consultar los CFDIs

	En API Multiemisor no se tiene la posiblidad de visualizar los comprobantes en la plataforma web, por lo que deberás usar el endpoint correspondiente para tus consultas.

	[Ver como consultar los CFDIs](https://apisandbox.facturama.mx/guias/api-multi/cfdi/consultar)

	**4)** Cancelar el CFDI

	[Ver como emitir un CFDI en API Multiemisor](https://apisandbox.facturama.mx/guias/api-multi/cfdi/cancelacion)

	El endpoint es diferente al de API Web y en el caso de que uses un SDK también será necesario que tomes en cuenta este nuevo endpoint.
