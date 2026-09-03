<!-- fuente: https://apisandbox.facturama.mx/guias/cfdi40/complementos/complemento-pago-20 · capturado 2026-09-03 -->

# Complemento de pago 2.0 para CFDI 4.0

	Un complemento de pago como su nombre lo indica es aquel documento electronico que ampara una operación de actos o actividades que se realizan, por los ingresos que
	perciban de los contribuyentes.

	Debe expedirse por la recepción de los pagos recibidos en parcialidades y en los casos en que el pago de la contraprestación no se pague en una sola exhibición,
	así como, cuando el pago se realice con posterioridad a la emisión de la factura, incluso cuando se trate de operaciones a crédito y estas se paguen totalmente
	en fecha posterior a la emisión de la factura correspondiente.

- Evita cancelaciones indebidas de facturas.

- Evita falsas duplicidades de ingresos en facturación de parcialidades.

- Sabrás si una factura ha sido o no pagada.

	A partir del 01 de enero del 2022, entra en vigor la versión 2.0 del complemento de recepción de pagos, esta versión es compatible con la versión 4.0 del CFDI,
	siendo obligatorio su uso a partir del 1 de julio de 2022.

	Este complemento únicamente está disponible para CFDI 4.0

	[¿deseas realizar la transición de CFDI 3.3 a 4.0?](https://apisandbox.facturama.mx/guias/cfdi40/migrar-cfdi40)

#### Consideraciones a tomar en cuenta en el nodo general del CFDI:

- No debe incluir Conceptos ó Items

- No debe incluir PaymentMethod

- No debe incluir PaymentForm

- No debe incluir Currency

- CfdiType debe ser "P" Pago

- En el nodo Receptor el atributo CfdiUse debe ser "**CP01**"

- Debe contener el nodo Complement donde especificara los detalles del pago

- Información detallada de los atributos del pago: [ver en la documentación de la API](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=PaymentBinding20Model)

- Fecha del Pago (Date)

- Forma en que se pago (PaymentForm)

- Monto (Amount)

- Se desglosan los impuestos trasladados y retenidos en el CFDI emplando el campo **TaxObject** para indicar el desglose de impuestos

- y opcionalmente los Documentos CFDI que se relacionan al pago

### Ejemplo de un CFDI de Pago:

	Pago que se realizo el "2022-04-10" al RFC "URE180429TM6" en la sucursal con el codigo postal "78240"

	para realizar el primer pago de "1,500" pesos con transferencia electrónica de fondos "03"

	el monto previo es de 2,000 y al realizar el pago de 1,500 restan 500 por saldar

	al CFDI relacionado con el siguiente Folio Fiscal: "C94C8AF3-C774-4D4C-802E-781411934A6E"

	en este caso del documento original no es objeto de impuesto

		Nota: En este ejemplo considere que debe existir una sucursal asociada con el Codigo Postal 78240, Un Perfil Fiscal Completo y un CFDI a Relacionar

		Estos datos son especificados en el "Perfi fiscal" [Ver como editar el perfil fiscal](https://apisandbox.facturama.mx/guias/perfil-fiscal)

## Ejemplo de complemento de pago 2.0

#### Complemento de pago sin impuestos

```
{
  "CfdiType": "P",
  "NameId": "14",
  "Folio": "93",
  "ExpeditionPlace": "78240",
  "Receiver": {
    "Rfc": "URE180429TM6",
    "CfdiUse": "CP01",
    "Name": "UNIVERSIDAD ROBOTICA ESPAÑOLA",
    "FiscalRegime": "601",
    "TaxZipCode" : "65000"
   },
  "Complemento": {
    "Payments":  [
        {
          "Date": "2022-04-10",
          "PaymentForm": "03",
          "Amount": "1500",
          "RelatedDocuments": [
            {
              "TaxObject": "01",
              "Uuid": "C94C8AF3-C774-4D4C-802E-781411934A6E",
              "Serie": "BQ",
              "Folio": "2205",
              "PaymentMethod": "PUE",
              "PartialityNumber": "1",
              "PreviousBalanceAmount": "2000",
              "AmountPaid": "1500",
              "ImpSaldoInsoluto": "500"
            }
          ]
        }
    ]
  }
}
```

## Ejemplos de complementos

#### Complemento de pago con impuestos

```
{
    "CfdiType": "P",
    "NameId": "14",
    "Folio": "93",
    "ExpeditionPlace": "78240",
    "Receiver": {
        "Rfc": "URE180429TM6",
        "CfdiUse": "CP01",
        "Name": "UNIVERSIDAD ROBOTICA ESPAÑOLA",
        "FiscalRegime": "601",
        "TaxZipCode": "65000"
    },
    "Complemento": {
        "Payments": [
            {
                "Date": "2022-03-25T12:00:00.000Z",
                "PaymentForm": "01",
                "Amount": "116",
                "Currency": "MXN",
                "RelatedDocuments": [
                    {
                        "TaxObject": "02",
                        "Uuid": "11c9536f-6bd0-4c32-9337-f8a73a15b775",
                        "PartialityNumber": "1",
                        "Serie": "1111",
                        "Folio": "45",
                        "Currency": "MXN",
                        "PaymentMethod": "PPD",
                        "PreviousBalanceAmount": "116",
                        "AmountPaid": "116",
                        "ImpSaldoInsoluto": "0",
                        "Taxes": [
                            {
                                "Name": "IVA",
                                "Rate": "0.16",
                                "Total": "16",
                                "Base": "100",
                                "IsRetention": "false"
                            }
                        ]
                    }
                ]
            }
        ]
    }
}
```

#### Complemento con un pago asociado a 2 comprobantes y tasa de cambio USD

```
{
  "CfdiType": "P",
  "NameId": "14",
  "Folio": "93",
  "ExpeditionPlace": "78240",
  "Receiver": {
    "Rfc": "URE180429TM6",
    "CfdiUse": "CP01",
    "Name": "UNIVERSIDAD ROBOTICA ESPAÑOLA",
    "FiscalRegime": "601",
    "TaxZipCode" : "65000"
   },
  "Complemento": {
    "Payments":  [
        {
          "Date": "2018-10-04",
          "PaymentForm": "03",
          "Amount": "12040.82",
          "Currency": "MXN",
          "RelatedDocuments": [
            {
              "TaxObject": "02",
              "Uuid": "C94C8AF3-C774-4D4C-802E-781411934A6E",
              "Serie": "BQ",
              "Folio": "2205",
              "Currency": "USD",
              "EquivalenceDocRel": 0.049,
              "PaymentMethod": "PUE",
              "PartialityNumber": "1",
              "PreviousBalanceAmount": "1160.00",
              "AmountPaid": "580.00",
              "ImpSaldoInsoluto": "580.00",
              "Taxes": [
                  {
                    "Total": 80,
                    "Name": "IVA",
                    "Base": 500,
                    "Rate": 0.160000,
                    "IsRetention": false
                  }
              ]
            },
            {
              "TaxObject": "02",
              "Uuid": "C94C8AF3-C774-4D4C-802E-781411934A6F",
              "Serie": "BQ",
              "Folio": "2206",
              "Currency": "MXN",
              "PaymentMethod": "PUE",
              "PartialityNumber": "1",
              "PreviousBalanceAmount": "204.08",
              "AmountPaid": "204.08",
              "ImpSaldoInsoluto": "0.00",
              "Taxes": [
                  {
                    "Total": 1.60,
                    "Name": "IVA",
                    "Base": 10,
                    "Rate": 0.160000,
                    "IsRetention": false
                  }
              ]
            }
          ]
        }
    ]
  }
}
```
