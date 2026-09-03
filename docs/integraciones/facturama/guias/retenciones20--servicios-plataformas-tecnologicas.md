<!-- fuente: https://apisandbox.facturama.mx/guias/retenciones20/servicios-plataformas-tecnologicas · capturado 2026-09-03 -->

# Complemento de Servicios para Plataformas Tecnologicas en Retenciones 2.0

	Complemento para expresar la información sobre los servicios prestados por personas físicas que utilicen plataformas tecnológicas.

	La creación de este **Complemento está basado en Retenciones 2.0**:

-  Factura de retención [ver en la guía](https://apisandbox.facturama.mx/guias/retenciones20)

#### URL para crear el comprobante

#### POST

```
https://apisandbox.facturama.mx/2/retenciones
```

### Nodo ServiciosPlataformasTecnologicas

Complemento para expresar la información sobre la enajenación de bienes y los servicios prestados por personas físicas o morales que utilicen plataformas tecnológicas

-
				**Periodicidad** Atributo requerido para especificar el periodo de retención.

				Ejemplo:  **"Periodicidad": "02"** [ver el catálogo](https://apisandbox.facturama.mx/guias/complementos/servicios-plataformas-tecnologicas/catalogos/periodicidad)

-
				**NumServ**  Atributo requerido para expresar el número de servicios realizados en el periodo.

				Ejemplo:  **"NumServ": "1"**

-
				**MontToServSIva**  Atributo requerido para expresar monto total de los servicios realizados en el periodo, sin incluir el monto del IVA.

				Ejemplo:  **"MontToServSIva": "100.00"**

-
				**TotalIvaTrasladado**  Atributo requerido para expresar monto total del IVA trasladado por los servicios realizados en el periodo.

				Ejemplo:  **"TotalIvaTrasladado": "16.00"**

-
				**TotalIvaRetenido**  Atributo requerido para expresar monto total del IVA retenido por los servicios realizados en el periodo.

				Ejemplo:  **"TotalIvaRetenido": "8.00"**

-
				**TotalIsrRetenido**  Atributo requerido para expresar monto total del ISR retenido por los servicios realizados en el periodo.

				Ejemplo:  **"TotalIsrRetenido": "3.00"**

-
				**DifIvaEntregadoPrestServ**  Atributo requerido para expresar la diferencia del IVA entregado al prestador del servicio en el periodo.

				Ejemplo:  **"DifIvaEntregadoPrestServ": "8.00"**

-
				**MonTotalporUsoPlataforma**  Atributo requerido para expresar el monto total cobrado al prestador del servicio por el uso de la plataforma en el periodo.

				Ejemplo:  **"MonTotalporUsoPlataforma": "7.40"**

-
				**MonTotalContribucionGubernamental**  Atributo condicional para expresar la suma de los atributos “ImpContrib“ del nodo hijo “ContribucionGubernamental” del periodo que corresponda.

				Ejemplo:  **"MonTotalContribucionGubernamental": "123.00"**

#### ServiciosPlataformasTecnologicas

```
"ServiciosPlataformasTecnologicas": {
            "Servicios": [
            ],
            "Periodicidad": "02",
            "NumServ": 1,
            "MontToServSIva": "1681.06",
            "TotalIvaTrasladado": "268.9696",
            "TotalIvaRetenido": "134.48",
            "TotalIsrRetenido": "16.81",
            "DifIvaEntregadoPrestServ": "134.4896",
            "MonTotalporUsoPlataforma": "14.66"
        }
```

### Nodo de Servicios

Forma parte del Nodo  ServiciosPlataformasTecnologicas
y es requerido para detallar la información de los servicios prestados por personas físicas que utilicen plataformas tecnológicas.

-
			**ImpuestosTrasladadosdelServicio ** Nodo requerido para detallar la información de los Impuestos trasladados de los servicios realizados por personas físicas utilizando plataformas tecnológicas.

-
			**ContribucionGubernamental**  Nodo opcional para detallar la información de las contribuciones gubernamentales pagadas por los servicios realizados por personas físicas utilizando plataformas tecnológicas.

-
			**ComisionDelServicio**  Nodo requerido para detallar la información de la comisión pagada por el uso de plataformas tecnológicas por cada servicio relacionado.

-
			**FormaPagoServ**  Atributo requerido para expresar la clave de la forma de pago con la que se liquida el servicio.

			Ejemplo:  **"FormaPagoServ": "02"** [ver el catálogo](https://apisandbox.facturama.mx/guias/complementos/servicios-plataformas-tecnologicas/catalogos/formadepagoserv)

-
			**TipoDeServ**  Atributo requerido para expresar la clave del tipo de servicio prestado.

			Ejemplo:  **"TipoDeServ ": "01"** [ver el catálogo](https://apisandbox.facturama.mx/guias/complementos/servicios-plataformas-tecnologicas/catalogos/tiposservicio)

-
			**SubTipServ**  Atributo condicional para identificar el subtipo del servicio prestado.

			Ejemplo:  **"SubTipServ": "02"**
			[ver el catálogo](https://apisandbox.facturama.mx/guias/complementos/servicios-plataformas-tecnologicas/catalogos/subtiposservicio)

-
			**RfcTerceroAutorizado**  Atributo opcional para registrar el RFC del tercero autorizado como personal de apoyo, por quien está registrado en la plataforma tecnológica para prestar servicios.

			Ejemplo:  **"RfcTerceroAutorizado": "AOBM900425EU2"**

-
			**FechaServ**  Atributo requerido para expresar la fecha en la que se prestó el servicio.

			Ejemplo:  **"FechaServ": "2019-05-30T14:51:25+06:00"**

-
			**PrecioServSinIva**  Atributo requerido para expresar el precio del servicio (sin incluir IVA).

			Ejemplo:  **"PrecioServSinIva": "100.00"**

#### Servicios

```
"Servicios": [
            {
                "ImpuestosTrasladadosdelServicio": {
                    "Base": "1681.06",
                    "Impuesto": "02",
                    "TipoFactor": "Tasa",
                    "TasaCuota": "0.160000",
                    "Importe": "268.9696"
                },
                "ComisionDelServicio": {
                    "Base": "1681.06",
                    "Importe": "14.66"
                },
                "FormaPagoServ": "02",
                "TipoDeServ": "05",
                "FechaServ": "2021-01-06",
                "PrecioServSinIva": "1681.06"
            }
        ],
```

### Ejemplo completo en JSON

#### Ejemplo completo en JSON

```
{
    "FolioInt": "0001",
    "FechaExp": "2022-08-01T08:08:01",
    "CveRetenc": "26",
    "LugarExpRetenc": "78180",
    "Emisor": {
        "RFCEmisor": "EKU9003173C9",
        "NomDenRazSocE": "ESCUELA KEMPER URGATE",
        "RegimenFiscalE": "601"
    },
    "Receptor": {
        "Nacionalidad": "Nacional",
        "Nacional": {
            "RFCRecep": "CACX7605101P8",
            "NomDenRazSocR": "XOCHILT CASAS CHAVEZ",
            "DomicilioFiscalR": "10740"
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
        "montoTotRet": "151.29",
        "ImpRetenidos": [
            {
                "BaseRet": "1681.06",
                "Impuesto": "01",
                "MontoRet": "16.81",
                "TipoPagoRet": "03"
            },
            {
                "BaseRet": "268.96",
                "Impuesto": "02",
                "MontoRet": "134.48",
                "TipoPagoRet": "01"
            }
        ]
    },
    "Complemento": {
        "ServiciosPlataformasTecnologicas": {
            "Servicios": [
                {
                    "ImpuestosTrasladadosdelServicio": {
                        "Base": "1681.06",
                        "Impuesto": "02",
                        "TipoFactor": "Tasa",
                        "TasaCuota": "0.160000",
                        "Importe": "268.9696"
                    },
                    "ComisionDelServicio": {
                        "Base": "1681.06",
                        "Importe": "14.66"
                    },
                    "FormaPagoServ": "02",
                    "TipoDeServ": "05",
                    "FechaServ": "2021-01-06",
                    "PrecioServSinIva": "1681.06"
                }
            ],
            "Periodicidad": "02",
            "NumServ": 1,
            "MontToServSIva": "1681.06",
            "TotalIvaTrasladado": "268.9696",
            "TotalIvaRetenido": "134.48",
            "TotalIsrRetenido": "16.81",
            "DifIvaEntregadoPrestServ": "134.4896",
            "MonTotalporUsoPlataforma": "14.66"
        }
    }
}
```
