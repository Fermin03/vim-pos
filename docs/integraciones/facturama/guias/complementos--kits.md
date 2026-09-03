<!-- fuente: https://apisandbox.facturama.mx/guias/complementos/kits · capturado 2026-09-03 -->

Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

# Kits - Expresar las partes que integran un concepto

	En este nodo se pueden expresar las partes o componentes que
	integran la totalidad del concepto expresado en el comprobante
	fiscal digital por Internet

## Nodo Partes

El nodo "Parts" pertence al nodo "Item" y puede tener varios elementos

Cada uno de los elementos de este nodo representa un elemento que conforma el **Kit**

	**Quantity ** Se debe registrar la cantidad de bienes o servicios

	**ProductCode ** Código del producto, [Ver el catálogo del SAT](http://pys.sat.gob.mx/PyS/catPyS.aspx)

	**UnitCode**Opcional, código de la unidad [Ver caálogo del SAT](http://pys.sat.gob.mx/PyS/catUnidades.aspx)

	**IdentificationNumber ** Opcional, para especificar el número de serie de un producto

	**Description ** Se debe registrar la descripción del bien o servicio correspondiente

	**UnitPrice ** Opcional, Se puede registrar el valor o precio unitario del bien o servicio

#### Nodo "Parts"

```
"Parts": [
			{
				"Quantity" : 10,
				"ProductCode" : "41116401",
				"UnitCode": "H87",
				"IdentificationNumber":"4",
				"Description" : "Martillos de impacto",
				"UnitPrice" : 100
			}
		],
```

## La forma completa del ejemplo es

#### CFDI con Kit

```
{
	"CfdiType": "I",
	"PaymentForm": "03",
	"PaymentMethod": "PUE",
	"ExpeditionPlace": "78000",
	"Receiver": {
		"Rfc": "EKU9003173C9",
		"CfdiUse": "G03",
		"Name": "Receiver company name"
	},
	"Items": [{
		"ProductCode": "27113201",
		"Description": "Conjuntos generales de herramientas",
		"UnitCode": "KT",
		"Quantity": 2,
		"UnitPrice": 2000,
		"Subtotal": 4000,
		"Taxes": [{
			"Total": 640,
			"Name": "IVA",
			"Base": 4000,
			"Rate": 0.16,
			"IsRetention": false
		}],
		"Parts": [{
			"Quantity": 10,
			"UnitCode": "H87",
			"ProductCode": "41116401",
			"IdentificationNumber": "4",
			"Description": "Martillos de impacto",
			"UnitPrice": 100
		},
		{
			"Quantity": 8,
			"UnitCode": "H87",
			"ProductCode": "27111701",
			"IdentificationNumber": "56jy",
			"Description": "Destornillador",
			"UnitPrice": 250
		},
		{
			"Quantity": 4,
			"UnitCode": "H87",
			"ProductCode": "27112105",
			"IdentificationNumber": "56th8",
			"Description": "Pinzas",
			"UnitPrice": 250
		}],
		"Total": 4640
	}]
}
```
