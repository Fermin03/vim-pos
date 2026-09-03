<!-- fuente: https://apisandbox.facturama.mx/docs/api/GET-Cfdi-id_type · capturado 2026-09-03 -->

-

# Obtiene el detalle del CFDi con el id y tipo seleccionado

### Parámetros URI

type  **(
string
 )**

Tipo de comprbante a obtener, puede ser para API Web: ( payroll | received | issued ) y para API Multiemisor: ( issuedLite )

**
**

  Required

id  **(
string
 )**

Identificador unico de la factura

**
**

  Required

### Atributos de la petición

La petición no tiene atributos

### Argumentos de respuesta

[CfdiInfoModel](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=CfdiInfoModel)

Id  **(
string
 )**

Identifiacador unico del cfdi.

**
**

CfdiType  **(
string
 )**

Tipo del efecto del comprobante fiscal para el contribuyente emisor: ingreso, egreso ó traslado.

**
**

Type  **(
string
 )**

Tipo de comprobante segun catalogo del SAT.

**
**

Serie  **(
string
 )**

Numero de la serie en el control interno del contribuyente.

**
**

Folio  **(
string
 )**

Numero de la folio en el control interno del contribuyente.

**
**

Date  **(
string
 )**

Fecha y hora de expedición del comprobante fiscal.

**
**

CertNumber  **(
string
 )**

No del Certificado.

**
**

PaymentTerms  **(
string
 )**

Forma de pago.

**
**

PaymentConditions  **(
string
 )**

Condiciones comerciales aplicables para el pago del comprobante fiscal digital a través de Internet.

**
**

PaymentMethod  **(
string
 )**

Método de pago de los bienes o servicios amparados por el comprobante. Se entiende como método de pago leyendas tales como: cheque, tarjeta de crédito o debito, depósito en cuenta, etc.

**
**

PaymentAccountNumber  **(
string
 )**

Incorpora al menos los cuatro últimos digitos del número de cuenta con la que se realizó el pago.

**
**

PaymentBankName  **(
string
 )**

Nombre del banco donde se realizo el pago.

**
**

ExpeditionPlace  **(
string
 )**

Lugar de expedición del comprobante.

**
**

ExchangeRate  **(
decimal number
 )**

Tipo de cambio conforme a la moneda usada.

**
**

Currency  **(
string
 )**

Moneda utilizada para expresar los montos.

**
**

Subtotal  **(
decimal number
 )**

Representa la suma de los importes antes de descuentos e impuestos.

**
**

Discount  **(
decimal number
 )**

Representa el importe total de los descuentos aplicables antes de impuestos.

**
**

Total  **(
decimal number
 )**

Representar la suma del subtotal, menos los descuentos aplicables, más los impuestos trasladados, menos los impuestos retenidos.

**
**

Observations  **(
string
 )**

Observaciones no fiscales de la factura.

**
**

OrderNumber  **(
string
 )**

Observaciones no fiscales de la factura.

**
**

Issuer  **(
[TaxEntityInfoViewModel](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=TaxEntityInfoViewModel) )**

Nodo que contiene el detalle del emisor.

**
**

Receiver  **(
[ReceiverViewModel](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=ReceiverViewModel) )**

Nodo que contiene el detalle del receptor.

**
**

Items  **(
        Atributos de
[ItemInfoModel](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=ItemInfoModel)
 )**

Nodo que contiene el detalle de los conceptos.

**
**

Taxes  **(
        Atributos de
[TaxInfoModel](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=TaxInfoModel)
 )**

Nodo que contiene el detalle de los impuestos.

**
**

Complement  **(
 )**

Nodo que contiene complementos de extensión definidos por el SAT.

**
**

#### http method:

#### GET

**https://apisandbox.facturama.mx/cfdi/{id}?type={type}**

## Ejemplo de Respuesta

#### application/json, text/json

                **Ejemplo:**

```
{
  "Id": "7eo51BvzV-E16gBx3nnxfQ2",
  "CfdiType": "ingreso",
  "Serie": "R",
  "Folio": "1",
  "Date": "2018-02-27T10:46:19",
  "PaymentTerms": "03 - Transferencia electrónica de fondos",
  "PaymentConditions": "CREDITO A SIETE DIAS",
  "PaymentMethod": "PUE - Pago en una sola exhibición",
  "ExpeditionPlace": "78116",
  "ExchangeRate": 0.0,
  "Currency": "MXN - Peso Mexicano",
  "Subtotal": 1600.0,
  "Discount": 0.0,
  "Total": 1856.0,
  "Observations": "",
  "Issuer": {
    "FiscalRegime": "601 - General de Ley Personas Morales",
    "Rfc": "ESO1202108R2",
    "TaxName": "EXPRESION EN SOFTWARE"
  },
  "Receiver": {
    "Rfc": "RSS2202108U5",
    "Name": "RADIAL SOFTWARE SOLUTIONS"
  },
  "Items": [
    {
      "Discount": 0.0,
      "Quantity": 2.0,
      "Unit": "E49 - NO APLICA",
      "Description": "Estudios de viabilidad",
      "UnitValue": 50.0,
      "Total": 100.0
    },
    {
      "Discount": 0.0,
      "Quantity": 15.0,
      "Unit": "E49 - NO APLICA",
      "Description": "SERVICIO DE COLOCACION",
      "UnitValue": 100.0,
      "Total": 1500.0
    }
  ],
  "Taxes": [
    {
      "Total": 256.0,
      "Name": "IVA",
      "Rate": 16.0,
      "Type": "transferred"
    }
  ],
  "Complement": {
    "TaxStamp": {
      "Uuid": "215CEC43-7E57-44AC-9D63-B54BBC4745BD",
      "Date": "2018-02-27T10:46:23",
      "CfdiSign": "EFirmqT9Ig9BYKPENRgVWaahM6qrejl0dmT5uyfm2/kaBGJ903odRxR1kchP0at6m4vjkrIa0gzQ58psbpNrRUi+2IRbvmITiC+W0u+RPHZTZoa6zZXVDmqYDjDpKGHE1zw202EOm3RTmYEqzkYNcLu8b15tdqqdiUqa4EIrFszFs3N5NsaCv7mwAidteCpuQi99sSfLNvsThs4JYBV1ahMz5zghysmPuMoQGf5rOe9ELAYc2OSQ7SdY0M5zECAUz7N4wmI1tF1LdIurmxpfbZq+IBtL1zG9B9WqhGRJSvVdiCPJTY6KzSQ4E4CUjx2ZX9/57q9uWRHr4cxVhhMfTw==",
      "SatCertNumber": "20001000000300022323",
      "SatSign": "Go3Q/iFSVFKw9qohv3RIk+86B9jaqEEYjYqIrI498afSO7MiNDyB+TDC3cLTOZ7g+cRJx9aMGEAldoQ0jnAZA7FEsppE1YI6QpUzKoRUzy43azepQxueyTd0YSBq1WkeXme5LGTTiKTx19sSThPPCTUUbSl8P8mjTkjlA8RWOdHq4hU5X9PDqGj8DmIp8276ENTkHdB7Q2Q0zKv4tY55yIzPxcrhFS4pji/KK0BogjbbXw4/cd5ippXohAsfwocNvIkqWutWTKUAh4BKKZzZNmTByjYql+QRE2NfHf2hIdchMVPIKWR7i6OXjzPL4fMYAeq1cXf9nr64kCEBvi2rpg==",
      "RfcProvCertif": "FLI081010EK2"
    }
  }
}
```
