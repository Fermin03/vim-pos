<!-- fuente: https://apisandbox.facturama.mx/guias/conocimientos/cfdi-relacionados · capturado 2026-09-03 -->

Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

# CFDIs relacionados ¿Como relacionar un CFDI?

	Un CFDI relacionado es: un comprobante fiscal que está ligado a otro CFDI.

	La relación puede ser de 7 tipos [Ver tipos de relación](#tipos-relaciones-cfdi)

## Nodo Relations

El nodo "Relations" es donde se especifican los CFDIs relacionados

	**Type ** Atributo requerido para colocar la clave del tipo de relación [Ver tipos de relación](#tipos-relaciones-cfdi)

	**Cfdis ** Atributo requerido con el folio fiscal (UUID) de un CFDI relacionado con el presente comprobante (puede ser más de un comprobante relacionado, dependiendo del contexto).
	.

#### Nodo "Relations"

```
"Relations": {
        "Type": "04",
        "Cfdis": [{ "Uuid": "27568D31-7E57-442F-BA77-798CBF30BD7D" }]
    },
```

## Tipos de relación

El valor del catálogo debe especificarse con 2 dígitos,	ejemplo: 04

Puedes [conocer más de los documentos relacionados en nuestro blog Facturama](https://facturama.mx/blog/que-significa/cfdi-relacionado/)

	**01** Nota de crédito de los documentos relacionados.

	**02** Nota de débito de los documentos relacionados.

	**03** Devolución de mercancía sobre facturas o traslados previos.

	**04** Sustitución de CFDI previos.

	**05** Traslados de mercancías facturados previamente.

	**06** Factura generada por los traslados previos.

	**07** CFDI por aplicación de anticipo.

## ¿En que parte se coloca el nodo de "Relations"?

Se coloca al mismo nivel que el nodo "Receiver" y el nodo de "Items"

#### Ejemplo de CFDI con nodo de CFDIs relacionados

```
{
	"ExpeditionPlace": "78180",
	"Folio": "110",
	"CfdiType": "I",
	"PaymentForm": "03",
	"PaymentMethod": "PUE",
	"Receiver": {
		"Rfc": "URE180429TM6",
		"CfdiUse": "G03",
		"Name": "Agua purificada en garrafon"
	},
	"Relations": {
		"Type": "04",
		"Cfdis": [{
			"Uuid": "27568D31-7E57-442F-BA77-798CBF30BD7D"
		}]
	},
	"Items": [{
		"ProductCode": "82101600",
		"Description": "Fees plataformas Online",
		"UnitCode": "E48",
		"Quantity": 1.0,
		"UnitPrice": 694.01,
		"Subtotal": 694.01,
		"Taxes": [{
			"Total": 111.04,
			"Name": "IVA",
			"Base": 694.01,
			"Rate": 0.16,
			"IsRetention": false
		}],
		"Total": 805.05
	}]
}
```
