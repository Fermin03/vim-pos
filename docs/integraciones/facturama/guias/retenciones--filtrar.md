<!-- fuente: https://apisandbox.facturama.mx/guias/retenciones/filtrar · capturado 2026-09-03 -->

# Filtrar Retenciones

Aplica para: Factura de retención

            Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

#### Filtrar mediante folio

#### GET

```
https://apisandbox.facturama.mx/retenciones?folio={folio}&status={status}

    Ejemplo:
    https://apisandbox.facturama.mx/retenciones?folio=vLDZ-Ve1RBy_SAuej5ofCA2&status=all
```

		**{folio}**:  Folio que se desea filtrar

		**{status}** (opcional):   Status de la factura [all | active | canceled]

#### Filtrar mediante palabra clave

#### GET

```
https://apisandbox.facturama.mx/retenciones?keyword={keyword}&status={status}

    Ejemplo:
    https://apisandbox.facturama.mx/retenciones?keyword=desarrollo&status=all
```

		**{keyword}**:  Palabra clave mediante la que se desea filtrar

		**{status}**:   Status de la factura [all | active | canceled]

### Respuesta del filtrado

	La respuesta respecto al "HTTP Response" si la petición fué exitosa regresa un **200**

#### Ejemplo de respuesta de filtrado de retenciones

```
[
    {
        "Id": "WMjroReXpN36b02eBT9n2A2",
        "Type": "Received",
        "Folio": "312",
        "TaxName": "Nombre de la empresa o negocio",
        "Rfc": "EKU9003173C9",
        "Date": "2020-06-11T11:20:41",
        "Subtotal": 0.0,
        "Total": 1000.00,
        "Uuid": "80aa793e-6b63-47d7-b281-d16559a88a57",
        "IsActive": true,
        "Status": "active"
    },
    {
        ....
    }
]
```

	**Id**:   Identificador de la rentención en Facturama

	**Uuid**:   Identificador único de la retención ante el SAT

	**IsActive**:   Boleano que indica si está vigente

	**Status**:   Indica el estado de la retención (como IsActive), valores posibles [active | canceled | pending]

	El valor de "Status" están relacionado con la [cancelación](https://apisandbox.facturama.mx/guias/retenciones/cancelacion)
