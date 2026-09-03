<!-- fuente: https://apisandbox.facturama.mx/guias/retenciones/complementos/intereses · capturado 2026-09-03 -->

# Complemento Intereses para el comprobante de retenciones e información de pagos

	A partir de 2014 debe incorporarse al comprobante de retenciones e información de pagos el complemento de intereses, para expresar los intereses obtenidos por rendimiento en inversiones, los cuales pueden provenir del sistema financiero u de operaciones financieras derivadas.

	El comprobante de retenciones e información de pagos debe incluir:

- Datos generales.

- La clave de retenciones 16 (Intereses).

- Complemento de intereses.

## Nodo Complemento Intereses

		**Version: **  Atributo requerido con valor prefijado que indica la versión del complemento de intereses obtenidos en el periodo o ejercicio

		**SistFinanciero: ** Atributo requerido para expresar si los interés obtenidos en el periodo o ejercicio provienen del sistema financiero

        **RetiroAORESRetInt: ** Atributo requerido para expresar si los intereses obtenidos fueron retirados en el periodo o ejercicio

		**OperFinancDerivad: ** Atributo requerido para expresar si los intereses obtenidos corresponden a operaciones financieras derivadas.

		**MontIntNominal: ** Atributo requerido para expresar el importe del interés Nóminal obtenido en un periodo o ejercicio

		**MontIntReal: ** Atributo requerido para expresar el monto de los intereses reales (diferencia que se obtiene restando al tipo de interés nominal y la tasa de inflación del periodo o ejercicio )

		**Perdida: ** Atributo requerido para expresar la pérdida por los intereses obtenidos en el periodo o ejercicio

#### Nodo "Complemento Intereses"

```
"Complemento": {
        "Intereses": {
            "Version": "1.0",
            "SistFinanciero": "SI",
            "RetiroAORESRetInt": "NO",
            "OperFinancDerivad": "SI",
            "MontIntNominal": 134.48,
            "MontIntReal": 16.81,
            "Perdida": 100
        }
    }
```

## La forma completa del ejemplo es

#### Complemento de Intereses

```
{
    "FolioInt": "216647",
    "FechaExp": "2021-10-04T08:08:01-06:00",
    "CveRetenc": "16",
    "Emisor": {
        "RFCEmisor": "EKU9003173C9",
        "NomDenRazSocE": "Xenon_Industrial_Articles"
    },
    "Receptor": {
        "Nacionalidad": "Nacional",
        "Nacional": {
            "RFCRecep": "MISC491214B86",
            "NomDenRazSocR": "string"
        }
    },
    "Periodo": {
        "MesIni": "01",
        "MesFin": "01",
        "Ejerc": "2021"
    },
    "Totales": {
        "montoTotOperacion": "1681.06",
        "montoTotGrav": "1681.06",
        "montoTotExent": "0.00",
        "montoTotRet": "16.8106",
        "ImpRetenidos": [
            {
                "BaseRet": "1681.06",
                "Impuesto": "01",
                "MontoRet": "16.8106",
                "TipoPagoRet": "Pago definitivo"
            }
        ]
    },
    "Complemento": {
        "Intereses": {
            "Version": "1.0",
            "SistFinanciero": "SI",
            "RetiroAORESRetInt": "NO",
            "OperFinancDerivad": "SI",
            "MontIntNominal": 134.48,
            "MontIntReal": 16.81,
            "Perdida": 100
        }
    }
}
```
