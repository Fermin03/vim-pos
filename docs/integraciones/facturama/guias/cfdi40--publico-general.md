<!-- fuente: https://apisandbox.facturama.mx/guias/cfdi40/publico-general · capturado 2026-09-03 -->

# Crear CFDI CFDI global 4.0 / Público en General

	Para el caso de las operaciones en donde no se cuenta con la clave en el RFC del receptor,

	se puede emitir a sus clientes que no solicitan un CFDI en éstas operaciones que se conocen como "celebradas con el público en general".

	El CFDI global en donde consten las operaciones celebradas con el público en general, deberá remitirse al SAT o al proveedor de certificación de CFDI,

	según sea el caso dentro de las 24 horas siguientes al cierre de las operaciones realizadas de manera diaria, semanal,mensual o bimestral.

-
			El CFDI global deberá expedirse a más tardar a las 24 horas siguientes al cierre de las operaciones que lo integran.

-
			El monto del IVA y del IEPS deberá estar desglosado en forma expresa y por separado en los CFDI globales.

	Este comprobante tiene como base el CFDI 4.0

	Para más informacion puedes [ver como migrar a 4.0](https://apisandbox.facturama.mx/guias/cfdi40/migrar-cfdi40)

#### URL para la petición

#### POST

```
https://apisandbox.facturama.mx/3/cfdis
```

#### Datos generales

	CfdiType:  Debe ser "I" (ingreso)

	PaymentForm:  Clave de la forma de pago con la que se liquidó el comprobante de operaciones con el público en general de mayor monto de entre los contenidos en el CFDI global

	PaymentMethod:  Se debe registrar siempre la clave "PUE" (Pago en una sola exhibición)

	ExpeditionPlace:  Se debe registrar el código postal del lugar de expedición del comprobante (domicilio de la matriz o de la sucursal),
	 debe corresponder con alguna del catálogo del SAT

	Date:  Fecha y hora de expedición del comprobante (opcional)

	Folio:  Es el folio de control interno que asigna el contribuyente al comprobante (opcional)

#### Datos Generales

```
"CfdiType": "I",
	"PaymentForm": "01",
	"PaymentMethod": "PUE",
	"ExpeditionPlace" : "78240",
	"Date" : "2022-03-14 14:00:00",
	"Folio": 120,
```

#### Información Global

En este nodo se debe expresar la información relacionada con el comprobante global de operaciones con el público en general.

	Periodicity:  Campo requerido para registrar el período al que corresponde la información del comprobante global
 Cuando el valor de este campo sea “05” el campo RegimenFiscal debe ser “621”.

	Months:  Se debe registrar la clave del mes o los meses al que corresponde la información de las operaciones celebradas con el público en general

	Year:  Se debe registrar el año al que corresponde la información del comprobante global

#### Información global

```
"GlobalInformation": {
		"Periodicity": "04",
		"Months": "04",
		"Year": "2022"
	},
```

Catálogo de Periodicidad

- 01 - Diario

- 02 - Semanal

- 03 - Quincenal

- 04 - Mensual

- 05 - Bimestral

#### Receptor

	En este nodo se debe expresar la información del contribuyente receptor del comprobante.

	Rfc:  Se debe registrar el valor **"XAXX010101000"**

	CfdiUse:  Se debe registrar la clave **"S01"** (Sin efectos fiscales)

	Nombre:  En este campo se debe de registrar el valor ** "PUBLICO EN GENERAL" **

	FiscalRegime:  En este campo se debe registrar la clave **"616"**

	TaxZipCode:  En este campo se debe registrar el mismo código postal señalado en el campo **ExpeditionPlace**

#### Datos del receptor

```
"Receiver": {
		"Rfc": "XAXX010101000",
		"CfdiUse": "S01",
		"Name": "PUBLICO EN GENERAL",
        "FiscalRegime": "616",
        "TaxZipCode" : "78240"
	},
```

## La forma completa del ejemplo es

#### Factura Global

```
{
	"CfdiType": "I",
	"PaymentForm": "01",
	"PaymentMethod": "PUE",
    "ExpeditionPlace" : "78240",
    "GlobalInformation": {
		"Periodicity": "04",
		"Months": "04",
		"Year": "2022"
	},
	"Receiver": {
		"Rfc": "XAXX010101000",
		"CfdiUse": "S01",
		"Name": "PUBLICO EN GENERAL",
        "FiscalRegime": "616",
        "TaxZipCode" : "78240"
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
