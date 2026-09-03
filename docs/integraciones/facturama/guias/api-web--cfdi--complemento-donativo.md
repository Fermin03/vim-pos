<!-- fuente: https://apisandbox.facturama.mx/guias/api-web/cfdi/complemento-donativo · capturado 2026-09-03 -->

Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

# Donativos

	Permite incluir la información requerida por el Servicio de Administración Tributaria a las organizaciones civiles o fideicomisos autorizados para recibir donativos,

	que permite hacer deducibles los Comprobantes Fiscales Digitales (CFD) y Comprobantes Fiscales Digitales a través de Internet (CFDI) a los donantes.

	La creación de un CFDI para **Donativos** es muy similar a los CFDI básicos:

-  Para API Web [ver en la guía](https://apisandbox.facturama.mx/guias/api-web/cfdi/factura)

-  Para API Multiemisor [ver en la guía](https://apisandbox.facturama.mx/guias/api-multi/cfdi/factura)

	Solo se diferencían en:

-
			Aquí se agrega el Nodo **Donation**, el cual forma parte del Nodo **Complemento**

			Permite especificar la información propia del donativo

	Puedes [ver la referencia de la API](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=Donat) referente a este complemento

### Datos generales

Tiene las variantes:

		**"NameId": "9"** Nombre "Recibo Deducible" de acuerdo al [Catálogo de nombres del CFDI](https://apisandbox.facturama.mx/guias/catalogos/nombres-cfdi)

		**"PaymentForm"** La forma de pago depende del tipo de donativo

-
				**Donativo numerario** Las "convencionales" : "01" Efectivo, "03" Transferencia de fondos

				Ejemplo:  **"PaymentForm": "03"**

-
				**Donativo en especie**  Se aplica cuando el donativo es en especie (por ejemplo cobijas, o agua embotellada) y se emplea: "12" Dación en pago

				Ejemplo:  **"PaymentForm": "12"**

```
"CfdiType": "I",
	"ExpeditionPlace": "26015",
	"NameId": "9",
	"Folio": "94",
	"PaymentForm": "12",
	"PaymentMethod": "PUE",
```

### Receptor

Tiene las variantes:

	**"CfdiUse": "D04"** Uso del CFDI "Donativos" de acuerdo al [Catálogo de nombres del CFDI](https://apisandbox.facturama.mx/guias/catalogos/nombres-cfdi)

```
"Receiver": {
		"CfdiUse": "D04",
		"Name": "CECILIA MIRANDA SANCHEZ",
		"Rfc": "MISC491214B86",
		"FiscalRegime": "605",
		"TaxZipCode": "65010"
	}
```

### Nodo de donación

	Forma parte del nodo de complementos.

	Se agrega para incluir la información requerida por el Servicio de Administración Tributaria correspondiente a donativos

	**"AuthorizationDate"** Fecha de autorización La fecha del oficio en que se haya informado a la organización civil o fideicomiso, la procedencia de la autorización para recibir donativos deducibles, o su renovación correspondiente otorgada por el SAT

	**"AuthorizationNumber"** Número de autorización El número del oficio en que se haya informado a la organización civil o fideicomiso, la procedencia de la autorización para recibir donativos deducibles, o su renovación correspondiente otorgada por el SAT

	**"Legend"** Leyenda Atributo requerido para señalar de manera expresa que el comprobante que se expide se deriva de un donativo

#### Nodo "Donation"

```
"Complemento": {
		"Donation": {
			"AuthorizationDate": "30/01/2019",
			"AuthorizationNumber": "B400-05-08-2014-005",
			"Legend": "El comprobante es un donativo"
		}
	},
```

#### Nodo "Donation"

```
"Complemento"=> {
		"Donation"=> {
			"AuthorizationDate": "30/01/2019",
			"AuthorizationNumber": "B400-05-08-2014-005",
			"Legend": "El comprobante es un donativo"
		}
	},
```

#### Nodo "Donation"

```
"Complemento": {
		"Donation": {
			"AuthorizationDate": "30/01/2019",
			"AuthorizationNumber": "B400-05-08-2014-005",
			"Legend": "El comprobante es un donativo"
		}
	},
```

#### Nodo "Donation"

```
"Complemento": {
		"Donation": {
			"AuthorizationDate": "30/01/2019",
			"AuthorizationNumber": "B400-05-08-2014-005",
			"Legend": "El comprobante es un donativo"
		}
	},
```

#### Nodo "Donation"

```
"Complemento": {
		"Donation": {
			"AuthorizationDate": "30/01/2019",
			"AuthorizationNumber": "B400-05-08-2014-005",
			"Legend": "El comprobante es un donativo"
		}
	},
```

#### Nodo "Donation"

```
"Complemento": {
		"Donation": {
			"AuthorizationDate": "30/01/2019",
			"AuthorizationNumber": "B400-05-08-2014-005",
			"Legend": "El comprobante es un donativo"
		}
	},
```

## La forma completa del ejemplo en JSON es

#### CFDI con con complemento de donativo

```
{
	"CfdiType": "I",
	"ExpeditionPlace": "26015",
	"NameId": "9",
	"Folio": "94",
	"PaymentForm": "12",
	"PaymentMethod": "PUE",
	"Complemento": {
		"Donation": {
			"AuthorizationDate": "30/01/2023",
			"AuthorizationNumber": "B400-05-08-2014-005",
			"Legend": "El comprobante es un donativo"
		}
	},
	"Items": [{
		"Description": "Cobija de lana y algodon",
		"ProductCode": "20102000",
		"IdentificationNumber": "FP114",
		"Quantity": "3",
		"Subtotal": "3000",
		"Total": "3000",
		"Unit": "NO APLICA",
		"UnitCode": "EA",
		"UnitPrice": "1000",
		"TaxObject": "01"
	}],
	"Receiver": {
		"CfdiUse": "D04",
		"Name": "CECILIA MIRANDA SANCHEZ",
		"Rfc": "MISC491214B86",
		"FiscalRegime": "605",
		"TaxZipCode": "65010"
	}
}
```
