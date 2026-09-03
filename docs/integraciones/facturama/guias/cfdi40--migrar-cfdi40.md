<!-- fuente: https://apisandbox.facturama.mx/guias/cfdi40/migrar-cfdi40 · capturado 2026-09-03 -->

Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

# Principales diferencias del CFDI 4.0 con respecto al 3.3 (ahora obsoleto)

	El CFDI 4.0 entra como ** obligatorio el 1 de Abril de 2023**

	El CFDI 3.3 tuvo como periodo de convivencia del 1 de enero de 2022 al 31 de marzo de 2023

	En Facturama se he creado una la versión de la API, **para CFDI 4.0 es la  versión 3  de la API**

	y ** aplica principalmente para la creación del CFDI**,

	ya que los métodos adicionales (Consulta, descarga, envío por correo, etc) permanecen sin cambios

Para el ambiente sandbox puedes emplear los [Sellos Digitales CSD de pruebas](https://apisandbox.facturama.mx/guias/conocimientos/sellos-digitales-pruebas)

#### URL para crear CFDI 4.0

#### POST

```
https://apisandbox.facturama.mx/3/cfdis
```

## Cambios en los atributos

	**Exportation **(opcional) Permite registrar la clave con la que se identifica si el comprobante ampara una operación de exportación, las distintas claves vigentes se encuentran incluidas en el catálogo.

	Cuando **no** se especifica  el dato, se considera por defecto **"01" - No aplica**

	Cuando se registre el valor "02", se debe incluir el "Complemento para Comercio Exterior".

-  01 - No aplica

-  02 - Definitiva con clave A1

-  03 - Temporal

-  04 - Definitiva con clave distinta a A1 o cuando no existe enajenación en términos del CFF

	**Date ** (opcional) Es la fecha y hora de expedición del comprobante fiscal.

	Se expresa en la forma  AAAA-MM-DDThh:mm:ss  y debe corresponder con la hora local donde se expide el comprobante. (basado en el código postal)

	Ejemplo: 2022-03-02 12:00:00

		Nota: Continúa siendo opcional, (en caso de mandar el campo nulo Facturama asigna la actual)

## Emisor

	**Name ** El nombre del emisor ahora se debe registrar en mayusculas y sin el régimen societario

	Debe registrarse **tal y como se encuentra** en la **Cédula de Identificación Fiscal y Constancia de Situación Fiscal**,
	respetando números, espacios y signos de puntuación

	Ejemplo:

-
			Nombre o Razón Social:  Empresa Importante S.A. DE C.V

			Debe colocarse: EMPRESA IMPORTANTE

			[Estos datos los puedes obtener en la CSF](https://facturama.mx/blog/receptos-cambios-factura-4-0-sat/)

			 Nota: Esto aplica tanto para personas físicas como morales

## Receptor

	**Name ** El nombre del receptor ahora se debe registrar en mayusculas y sin el régimen societario

	Debe registrarse **tal y como se encuentra** en la **Cédula de Identificación Fiscal y Constancia de Situación Fiscal**,
	respetando números, espacios y signos de puntuación

	Ejemplo:

-
			Nombre o Razón Social:  Empresa Receptora S.A. DE C.V

			Debe colocarse: EMPRESA RECEPTORA

			[Estos datos los puedes obtener en la CSF](https://facturama.mx/blog/receptos-cambios-factura-4-0-sat/)

			 Nota: Esto aplica tanto para personas físicas como morales

	**FiscalRegime ** Régimen fiscal, tal como está dado de alta en el SAT  Nuevo

	**CfdiUse **Debe ser de acuerdo al régimen fiscal del receptor y desaparece el P01 (Por definir)

	[conocer más del uso del CFDI](https://facturama.mx/blog/que-significa/uso-de-cfdi/)

	**TaxZipCode ** Código postal del receptor  Nuevo

## Conceptos

	**TaxObject ** Objeto de impuesto   Nuevo

	Se debe registrar la clave correspondiente para indicar si la operación comercial es objeto o no de impuesto.

- **01** - No objeto de impuesto

- **02** - (Sí objeto de impuesto), se deben desglosar los Impuestos a nivel de Concepto.

- **03** - (Sí objeto del impuesto y no obligado al desglose) no se desglosan impuestos a nivel Concepto.

- **04** - (Sí Objeto de impuesto y no causa impuesto)

#### Ejemplo de CFDI 4.0

```
{
	"CfdiType": "I",
	"PaymentForm": "01",
	"PaymentMethod": "PUE",
	"ExpeditionPlace" : "78240",
	"Date" : "2022-03-14 14:00:00",
	"Receiver": {
	    "Rfc": "URE180429TM6",
	    "CfdiUse": "G03",
	    "Name": "UNIVERSIDAD ROBOTICA ESPAÑOLA",
	    "FiscalRegime": "601",
	    "TaxZipCode" : "65000"
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
