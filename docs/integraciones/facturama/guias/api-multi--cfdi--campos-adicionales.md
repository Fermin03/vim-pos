<!-- fuente: https://apisandbox.facturama.mx/guias/api-multi/cfdi/campos-adicionales · capturado 2026-09-03 -->

# Campos adicionales en API Multiemisor

            Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

       Adicional a los campos fiscales e indispensables mostrados en en:
	[Crear CFDIs mediante API Multiemisor](https://apisandbox.facturama.mx/guias/api-multi/cfdi/factura)

	Es posible agregar algunos datos adicionales no fiscales al PDF

    Estos campos son:

-
			**Observations**  Pemite colocar texto a manera de observación.

-
			**PaymentBankName**  Nombre del banco donde se realiza el pago.

-
			**PaymentAccountNumber**  Número de cuenta donde se realza el pago.

-
			**OrderNumber**  Número de orden.

#### Campos adicionales

```
"Observations": "Ejemplo de observaciones en API Multiemisor",
	"PaymentBankName": "Banamex",
	"PaymentAccountNumber": "1234",
	"OrderNumber": "445566"
```

## La forma completa del ejemplo es

#### CFDI Factura

```
{
	"Serie": "B",
	"ExpeditionPlace": "11529",
	"Folio": "110",
	"CfdiType": "I",
	"PaymentForm": "03",
	"PaymentMethod": "PUE",
	"Issuer": {
		"FiscalRegime": "601",
		"Rfc": "EKU9003173C9",
		"Name": "Empresa internacional SA de CV"
	},
	"Receiver": {
		"Rfc": "FUGM8606085HA",
		"CfdiUse": "G03",
		"Name": "Agua purificada en garrafon"
	},
	"Items": [{
		"ProductCode": "82101600",
		"Description": "Fees plataformas Online - 10-2019-MONTERREY-VISTAHERMOSA",
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
	}, {
		"ProductCode": "82101600",
		"Description": "Royalties - 10-2019-MONTERREY-VISTAHERMOSA",
		"UnitCode": "E48",
		"Quantity": 1.0,
		"UnitPrice": 7069.65,
		"Subtotal": 7069.65,
		"Taxes": [{
			"Total": 1131.14,
			"Name": "IVA",
			"Base": 7069.65,
			"Rate": 0.16,
			"IsRetention": false
		}],
		"Total": 8200.79
	}],
		"Observations": "Ejemplo de observaciones en API Multiemisor",
		"PaymentBankName": "Banamex",
		"PaymentAccountNumber": "1234",
		"OrderNumber": "445566"
}
```
