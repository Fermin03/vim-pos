<!-- fuente: https://apisandbox.facturama.mx/guias/api-multi/cfdi/factura · capturado 2026-09-03 -->

# Crear CFDIs 4.0 mediante API Multiemisor

            Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

	Al usar la API Multiemisor,  se tiene la ventaja de poder crear CFDIs desde diferentes Emisores,

	siempre y cuando se tengan los sellos digitales (CSD) de cada uno de los RFCs con los que se desea emitir CFDIs

	La creación de un CFDI en la modalidad multiemisor es muy similar (casi identica) que el API Web [ver en la guía](https://apisandbox.facturama.mx/guias/api-web/cfdi/factura)

	Solo se diferencían en:

-
			Aquí se agrega el Nodo **Issuer**, que contiene la información del Emisor

			El RFC del emisor debe tener cargados los sellos digitales CSD [ver en la guía](https://apisandbox.facturama.mx/guias/api-multi/csds)

-
			Aquí se agrega el campo de **Folio** para especificar el folio

			El folio tiene que ser especificado, ya que no se asigna automáticamente

	Puedes incluir datos adicionales no fiscales, pero si útiles para su representacion impresa tales cómo

- Logo

- Direccion del emisor

- Direccion del receptor

- Observaciones

	Para más informacion puedes [verlo en la Referncia API](https://apisandbox.facturama.mx/docs-multi/api/POST-api-lite-2-cfdis)

#### URL para la petición

#### POST

```
https://apisandbox.facturama.mx/api-lite/3/cfdis
```

#### Datos generales

	Folio:  Se debe especificar el Folio (atributo para control interno).

	Puede ser conceptualmente:

- Numérico (de 1 a 10 caracteres): Contiene exclusivamente números,
 ejemplo: "238746"

- Alfanumérico (de 1 a 40 caracteres) : Formado por letras y números conjuntamente, no puede contener el caracter "pipe" (|),
 ejemplo: "vLDZ-Ve1RBy_SAuej5ofCA2"

	En ambos casos se colocan en éste atributo, la diferencia está en que:

	Para hacer uso de las [consultas de CFDI por intervalo de folios](https://apisandbox.facturama.mx/guias/api-multi/cfdi/consultar#folio-intervals) será necesario que el folio sea numérico, ya que los alfanuméricos no serán considerados

	LogoUrl:  URL del logo que se desea colocar en el PDF, esquina superior izquierda

#### Datos generales

```
"NameId": "1",
    "CfdiType": Facturama::CfdiType::INGRESO,
    "ExpeditionPlace": "78116",
	"LogoUrl":"https://www.ejemplos.co/wp-content/uploads/2015/11/Logo-Chanel.jpg",
    "PaymentForm": "03",
    "PaymentMethod": "PUE",
	"Folio": "100",
```

#### Emisor

	**Es quien expide el CFDI**. Principal característica de la API Multiemisor

	En la estructura es representado por un nodo que se coloca en el atributo **Issuer**

	puedes [ver en la documentación de la API](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=IssuerBindingModel)

	FiscalRegime:  Regimenes Fiscales
	[ver en la guía](https://apisandbox.facturama.mx/guias/catalogos/regimenes-fiscales)

	Rfc:  Clave del Registro Federal de Contribuyentes del Emisor (recuerda que debes tener los CSD del RFC cargados) [ver en la guía](https://apisandbox.facturama.mx/guias/api-multi/csds)

	**Name ** El nombre del emisor ahora se debe registrar en mayusculas y sin el régimen societario

	Debe registrarse **tal y como se encuentra** en la **Cédula de Identificación Fiscal y Constancia de Situación Fiscal**,
	respetando números, espacios y signos de puntuación

	Ejemplo:

-
			Nombre o Razón Social:  Empresa Emisora S.A. DE C.V

			Debe colocarse: EMPRESA EMISORA

			[Estos datos los puedes obtener en la CSF](https://facturama.mx/blog/receptos-cambios-factura-4-0-sat/)

			 Nota: Esto aplica tanto para personas físicas como morales

#### Datos del emisor

```
"Issuer": {
        "FiscalRegime": "601",
        "Rfc": "EKU9003173C9",
        "Name": "ESCUELA KEMPER URGATE"
    },
```

## La forma completa del ejemplo es

#### CFDI Factura de Ingreso 4.0 para API Multiemisor con Impuestos

```
{
	"CfdiType": "I",
	"PaymentForm": "01",
	"PaymentMethod": "PUE",
	"ExpeditionPlace" : "78240",
	"Date" : "2022-03-14 14:00:00",
	"Folio": 120,
    "Issuer": {
        "FiscalRegime": "601",
        "Rfc": "EKU9003173C9",
        "Name": "ESCUELA KEMPER URGATE"
    },
	"Receiver": {
		"Rfc": "URE180429TM6",
		"CfdiUse": "G03",
	"Name": "UNIVERSIDAD ROBOTICA ESPAÑOLA",
	"FiscalRegime": "601",
	"TaxZipCode" : "65000",
		"Address": {
			"Street" : "Guadalcazar del receptor",
			"ExteriorNumber" : "300",
			"InteriorNumber" : "A",
			"Neighborhood": "Las lomas",
			"ZipCode" : "65000",
			"Municipality" : "San Luis Potosi",
			"State" : "San Luis Potosi",
			"Country" : "México"
		}
	},
	"Items": [{
		"ProductCode": "25173108",
		"Description": "GPS estandar pruebas",
		"UnitCode": "E48",
		"Quantity": 1.0,
		"UnitPrice": 100.0,
		"Subtotal": 100.00,
	"TaxObject" : "02",
		"Taxes": [{
			"Total": 16,
            "Name": "IVA",
            "Base": 100,
            "Rate": 0.16,
            "IsRetention": false
		}],
		"Total": 116
	}]
}
```

#### CFDI Factura de Ingreso 4.0 para API Multiemisor sin Impuestos

```
{
	"CfdiType": "I",
	"PaymentForm": "01",
	"PaymentMethod": "PUE",
	"ExpeditionPlace" : "78240",
	"Date" : "2022-03-14 14:00:00",
	"Folio": 120,
    "Issuer": {
        "FiscalRegime": "601",
        "Rfc": "EKU9003173C9",
        "Name": "ESCUELA KEMPER URGATE"
    },
	"Receiver": {
		"Rfc": "URE180429TM6",
		"CfdiUse": "G03",
	"Name": "UNIVERSIDAD ROBOTICA ESPAÑOLA",
	"FiscalRegime": "601",
	"TaxZipCode" : "65000",
		"Address": {
			"Street" : "Guadalcazar del receptor",
			"ExteriorNumber" : "300",
			"InteriorNumber" : "A",
			"Neighborhood": "Las lomas",
			"ZipCode" : "65000",
			"Municipality" : "San Luis Potosi",
			"State" : "San Luis Potosi",
			"Country" : "México"
		}
	},
	"Items": [{
		"ProductCode": "25173108",
		"Description": "GPS estandar pruebas",
		"UnitCode": "E48",
		"Quantity": 1.0,
		"UnitPrice": 100.0,
		"Subtotal": 100.00,
	"TaxObject" : "01",
		"Total": 116
	}]
}
```
