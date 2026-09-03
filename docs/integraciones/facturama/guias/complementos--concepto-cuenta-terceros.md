<!-- fuente: https://apisandbox.facturama.mx/guias/complementos/concepto-cuenta-terceros · capturado 2026-09-03 -->

Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

# CFDI por cuenta de terceros

	Este CFDI lo puedes utilizar si actúas como comisionista o prestas servicios de cobranza.

	Tanto el comisionista o prestador de servicio de cobranza como el comitente o prestatario deben cumplir con lo siguiente:

- Estar inscrito en el RFC y con estatus Activo.

- No ubicarse en algún supuesto del 17-H, fracción X del Código Fiscal de la Federación.

- Contar con CSD vigente.

## Nodo ThirdPartyAccount

El nodo "ThirdPartyAccount" deberá ir dentro del nodo "Items"

    **Rfc **Clave del Registro Federal de Contribuyentes correspondiente al contribuyente tercero.

    **Name **Nombre o razón social del contribuyente tercero.

    **FiscalRegime **Régimen fiscal, tal como está dado de alta en el SAT.

    **TaxZipCode** Código postal del tercero.

#### Nodo "ThirdPartyAccount"

```
"ThirdPartyAccount":
	{
		"Rfc":"CACX7605101P8",
		"Name":"XOCHILT CASAS CHAVEZ",
		"FiscalRegime":"616",
		"TaxZipCode":"36257"
	}
```

## Forma completa del ejemplo

#### Complemento concepto por cuenta de terceros

```
{
    "NameId": "29",
    "Currency": "MXN",
    "Folio": "100",
    "Serie": "FCPCT",
    "CfdiType": "I",
    "PaymentForm": "03",
    "PaymentMethod": "PUE",
    "OrderNumber": "TEST-001",
    "ExpeditionPlace": "78000",
    "Date": "2025-01-01T12:00:00",
    "PaymentConditions": "CFDI por cuenta de terceros",
    "Observations": "Elemento Observaciones solo visible en PDF",
    "Exportation": "01",
    "Receiver":
    {
      "Rfc": "URE180429TM6",
      "CfdiUse": "CP01",
      "Name": "UNIVERSIDAD ROBOTICA ESPAÑOLA",
      "FiscalRegime": "601",
      "TaxZipCode": "86991"
    },
    "Items": [
    {
      "ProductCode": "10101504",
      "IdentificationNumber": "EDL",
      "Description": "Estudios de laboratorio",
      "Unit": "NO APLICA",
      "UnitCode": "MTS",
      "UnitPrice": 50,
      "Quantity": 2.0,
      "Subtotal": 100,
      "TaxObject":"02",
      "Taxes": [
        {
          "Total": 16,
          "Name": "IVA",
          "Base": 100,
          "Rate": 0.16,
          "IsRetention": false
        }
      ],
      "Total": 116,
      "ThirdPartyAccount":{
            "Rfc":"CACX7605101P8",
            "Name":"XOCHILT CASAS CHAVEZ",
            "FiscalRegime":"616",
            "TaxZipCode":"36257"
        }
    }
  ]
}
```
