<!-- fuente: https://apisandbox.facturama.mx/guias/cfdi40/nota-credito · capturado 2026-09-03 -->

# Crear Nota de Crédito para CFDI 4.0 - Comprobante de egreso

	Amparan devoluciones, descuentos y bonificaciones para efectos de deducibilidad y también puede utilizarse para corregir o restar un comprobante de ingresos
	en cuanto a los montos que documenta, como la aplicación de anticipos.

#### URL para la petición

#### POST

```
https://apisandbox.facturama.mx/3/cfdis
```

#### Variantes con respecto al CFDI de Ingreso

	"NameId": "2" Nombre "Nota de crédito" de acuerdo al [Catálogo de nombres del CFDI](https://apisandbox.facturama.mx/guias/catalogos/nombres-cfdi)

	"CfdiType": "E" Este campo adquiere el valor de **E** (Egreso)

	"PaymentMethod": "PUE" Regisrar la clave **PUE**  (Pago en una sola exhibición)

#### Datos Generales

```
"CfdiType": "E",
	"NameId": "2",
	"ExpeditionPlace": "78240",
	"PaymentForm": "01",
	"PaymentMethod": "PUE",
```

#### Nodo "Relations"

	Nodo "Relations"  Se debe registrar siempre el Nodo **Relations** para referenciar a un CFDI el cual será la factura de ingreso en la cual se este aplicando dicho descuento o bonificación

	[Ver como relacionar un CFDI](https://apisandbox.facturama.mx/guias/conocimientos/cfdi-relacionados)

#### Nodo "Relations"

```
"Relations": {
		"Type": "01",
		"Cfdis": [{
			"Uuid": "45ab1a98-1709-446a-8759-e45a8d76b557"
		}]
	},
```

#### Receptor

	En este nodo se debe expresar la información del contribuyente receptor del comprobante.

	CfdiUse:  Se debe registrar el valor **"G02"** (Devoluciones, descuentos o bonificaciones)

#### Datos del receptor

```
"Rfc": "URE180429TM6",
	"CfdiUse": "G02",
	"Name": "UNIVERSIDAD ROBOTICA ESPAÑOLA",
	"FiscalRegime": "601",
	"TaxZipCode" : "65000"
```

#### Items

	ProductCode:  Se debe registrar el valor que corresponda según el caso ó la clave **"84111506"** (Servicios de facturación)

	UnitCode:  Se debe registrar el valor que corresponda según el caso ó la clave **"ACT"** (Actividad)

#### Items

```
"Items": [{
		"Quantity": "1",
		"ProductCode": "84111506",
		"UnitCode": "ACT",
		"Unit": "Pieza",
		"Description": "Detector de humo",
		"UnitPrice": "1500.00",
		"Subtotal": "1500.00",
		"TaxObject" : "02",
		"Taxes": [{
			"Name": "IVA",
			"Rate": "0.16",
			"Total": "240",
			"Base": "1500",
			"IsRetention": "false",
			"IsFederalTax": "true"
		}],
		"Total": "1740.00"
	}]
```

## La forma completa del ejemplo es

#### Nota de crédito

```
{
    "CfdiType": "E",
	"NameId": "2",
	"ExpeditionPlace": "78240",
	"PaymentForm": "01",
	"PaymentMethod": "PUE",
	"Receiver": {
		"Rfc": "URE180429TM6",
		"CfdiUse": "G02",
		"Name": "UNIVERSIDAD ROBOTICA ESPAÑOLA",
        "FiscalRegime": "601",
        "TaxZipCode" : "65000"
	},
    "Relations": {
		"Type": "01",
		"Cfdis": [{
			"Uuid": "45ab1a98-1709-446a-8759-e45a8d76b557"
		}]
	},
	"Items": [{
		"Quantity": "1",
		"ProductCode": "84111506",
		"UnitCode": "ACT",
		"Unit": "Pieza",
		"Description": "Detector de humo",
		"UnitPrice": "1500.00",
		"Subtotal": "1500.00",
        "TaxObject" : "02",
		"Taxes": [{
			"Name": "IVA",
			"Rate": "0.16",
			"Total": "240",
			"Base": "1500",
			"IsRetention": "false",
			"IsFederalTax": "true"
		}],
		"Total": "1740.00"
	}]
}
```
