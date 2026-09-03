<!-- fuente: https://apisandbox.facturama.mx/docs/examples · capturado 2026-09-03 -->

# Ejemplos Facturama API

## Ejemplo de CFDI 4.0

```
{
  "Serie": "A",
  "ExpeditionPlace": "06100",
  "PaymentConditions": "CREDITO A SIETE DIAS",
  "Folio": "100",
  "CfdiType": "I",
  "PaymentForm": "03",
  "PaymentMethod": "PUE",
  "Issuer": {
    "FiscalRegime": "601",
    "Rfc": "ESO1202108R2",
    "Name": "SinDelantal Mexico"
  },
  "Receiver": {
    "Rfc": "SME111110NY1",
    "Name": "SinDelantal Mexico",
    "CfdiUse": "P01"
  },
  "Items": [
    {
      "ProductCode": "10101504",
      "IdentificationNumber": "EDL",
      "Description": "Estudios de laboratorio",
      "Unit": "NO APLICA",
      "UnitCode": "MTS",
      "UnitPrice": 0.01,
      "Quantity": 1.0,
      "Subtotal": 0.01,
      "Taxes": [
        {
          "Total": 0.0,
          "Name": "IVA",
          "Base": 0.0,
          "Rate": 0.16,
          "IsRetention": true
        }
      ],
      "Total": 0.01
    },
    {
      "ProductCode": "10101504",
      "IdentificationNumber": "001",
      "Description": "SERVICIO DE COLOCACION",
      "Unit": "NO APLICA",
      "UnitCode": "E49",
      "UnitPrice": 100.0,
      "Quantity": 15.0,
      "Subtotal": 1500.0,
      "Discount": 0.0,
      "Taxes": [
        {
          "Total": 240.0,
          "Name": "IVA",
          "Base": 1500.0,
          "Rate": 0.16,
          "IsRetention": false
        }
      ],
      "Total": 1740.0
    }
  ]
}
```

## Ejemplo de Recibo de Pago Sencillo API-Lite

```
{
        "NameId": 1,
        "CfdiType": "P",
        "Folio": 100,
        "Serie": "A",
        "ExpeditionPlace": "78220",
        "Issuer": {
        	"Rfc": "ESO1202108R2",
        	"Name": "Expresion en Software SAPI de CV",
        	"FiscalRegime": "601"
        },
        "Receiver": {
            "Rfc": "JAR1106038RA",
            "Name": "SinDelantal Mexico",
            "CfdiUse": "P01"
        },
        "Complemento": {
        	"Payments": [{
        		"PaymentForm": "02",
        		"Amount": 10
        	},
            {
        		"PaymentForm": "03",
        		"Amount": 12
        	}]
        }
  }
```

## Ejemplo de Recibo de Pagos con Documentos Relacionados

```
{
        "NameId": 1,
        "CfdiType": "P",
        "Folio": 100,
        "Serie": "A",
        "ExpeditionPlace": "78220",
        "Issuer": {
        	"Rfc": "ESO1202108R2",
        	"Name": "Expresion en Software SAPI de CV",
        	"FiscalRegime": "601"
        },
        "Receiver": {
            "Rfc": "JAR1106038RA",
            "Name": "SinDelantal Mexico",
            "CfdiUse": "P01"
        },
        "Complemento": {
        	"Payments": [{
        		"PaymentForm": "02",
        		"Amount": 10,
        		"RelatedDocuments": [
			        {
			          "Uuid": "123e4567-e89b-12d3-a456-426655440000",
			          "Currency": "MXN",
			          "PaymentMethod": "PUE",
			          "PartialityNumber": 1,
			          "PreviousBalanceAmount": 1.0,
			          "AmountPaid": 1.0
		        }]
        	}]
        }
  }
```
