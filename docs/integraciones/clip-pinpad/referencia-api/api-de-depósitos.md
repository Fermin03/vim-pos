<!-- fuente: https://developer.clip.mx/reference/api-de-depósitos · capturado 2026-10-08 -->

---
updatedAt: 2026-07-16T17:23:24.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Introducción a depósitos

La API de Depósitos esta diseñada para obtener la información referente a los depósitos realizados en los últimos 90 días. De la misma manera y con la información de los depósitos consultados se puede obtener un reporte detallado de sus transacciones.

<Callout icon="🚧" theme="warn">
  ### Importante

  La API de Depósitos está disponible únicamente para cuentas Clip que **no cuentan con Cuenta Digital**.

  Si la cuenta utilizada tiene habilitada la[ **Cuenta Digital**](https://blog.clip.mx/articulo/cuenta-digital-para-tu-negocio), el endpoint puede responder exitosamente con un arreglo vacío:

  ```json
  {
    "settlements": []
  }
  ```

  Esta respuesta **no representa un error en la solicitud.** Indica que la cuenta consultada **no es compatible con la API de Depósitos.**
</Callout>

## El recurso Settlements

La siguiente tabla contiene los elementos de la estructura del objeto **settlements**:

```json settlements
{
  "settlements": [
    {
      "disbursement_date": "2025-04-10",
      "settlement_report_id": "OVTWVWZ2B",
      "gross_amount": 1.85,
      "total_fee": 0.04,
      "total_tax": 0.01,
      "total_retention": 0.9,
      "disbursed_net_amount": 0.95,
      "total_transactions": 86,
      "links": {
        "self": {
          "href": "/settlements/e3e5116c-639b-41da-b3bf-202c8c5d7834",
          "method": "GET"
        }
      }
    }
  ]
}
```

<HTMLBlock>{`
<div></div>
  <table >
    <tbody>
      <tr >
        <td  colspan="6" rowspan="1">
          <p ><span ><strong>Elemento</strong></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ><strong>Descripci&oacute;n</strong></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ><strong>Tipo</strong></span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="6" rowspan="1">
          <p ><span >settlements</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Arreglo de objetos del tipo </span><span >settlements</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >array</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="5" rowspan="1">
          <p ><span >disbursement_date</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Fecha de pago</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >string</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="5" rowspan="1">
          <p ><span >settlement_report_id</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >ID del </span><span >reporte de dep&oacute;sitos</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >string</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="5" rowspan="1">
          <p ><span >gross_amount</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Cantidad t</span><span >otal antes de impuestos</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >number</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="5" rowspan="1">
          <p ><span >total_fee</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Cantidad total de comisi&oacute;n sobre la cantidad antes de impuestos</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >number</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="5" rowspan="1">
          <p ><span >total_tax</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Cantidad </span><span >de</span><span >&nbsp;impuestos por IVA sobre la comisi&oacute;n </span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >number</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="5" rowspan="1">
          <p ><span >t</span><span >o</span><span >tal_retention</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Cantidad total de comisi&oacute;n e impuestos a deducir </span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >number</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="5" rowspan="1">
          <p ><span >disbursed_net</span><span >_amount</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Cantidad a depositar despu&eacute;s de impuestos</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >number</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="5" rowspan="1">
          <p ><span >total_transactions</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Total de transacciones que incluye el reporte</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >string</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="5" rowspan="1">
          <p ><span >links</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Objeto de tipo </span><span >links</span><span >.</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >string</span></p>
        </td>
      </tr>
    </tbody>
  </table>
<style></style>
`}</HTMLBlock>

## El recurso Settlement

La siguiente tabla contiene los elementos de la estructura del objeto **settlement**:

```json settlement
{
  "settlement": {
    "settlement_report_id": "OVTWVWZ2B",
    "merchant_name": "Clip",
    "disbursement_date": "2025-04-10",
    "gross_amount": 1.85,
    "disbursed_net_amount": 0.95,
    "total_transactions": 86,
    "details": [
      {
        "date": "2025-03-30",
        "payments": [
          {
            "receipt_no": "S04Vnpf",
            "payment_date": "2025-03-30",
            "amount": 0.01,
            "terms": null,
            "charges": {
              "charge": {
                "fee": 0.0,
                "tax": 0.0
              },
              "surcharge": null
            },
            "tip": 0.0,
            "total_retention": 0.0,
            "settled_amount": 0.01,
            "payment_method": "OTHER",
            "card": {
              "brand": "MC",
              "last4": "1907",
              "issuer": "NU MEXICO FINANCIERA"
            },
            "merchant_invoice": null,
            "user_email": "partners.checkout@payclip.com"
          },
          {
            "receipt_no": "P7SrWeu",
            "payment_date": "2025-03-30",
            "amount": 0.01,
            "terms": null,
            "charges": {
              "charge": {
                "fee": 0.0,
                "tax": 0.0
              },
              "surcharge": null
            },
            "tip": 0.0,
            "total_retention": 0.0,
            "settled_amount": 0.01,
            "payment_method": "OTHER",
            "card": {
              "brand": "MC",
              "last4": "1907",
              "issuer": "NU MEXICO FINANCIERA"
            },
            "merchant_invoice": null,
            "user_email": "partners.checkout@payclip.com"
          }
        ]
      }
    ]
  },
  "links": null
}
```

<HTMLBlock>{`
<div></div>
<table >
    <tbody>
      <tr >
        <td  colspan="10" rowspan="1">
          <p ><span ><strong>Elemento</strong></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ><strong>Descripci&oacute;n</strong></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ><strong>Tipo</strong></span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="10" rowspan="1">
          <p ><span >settlement</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Objeto de tipo </span><span >settlement</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >object</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="9" rowspan="1">
          <p ><span >settlement_report_id</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >ID del reporte de dep&oacute;sitos a detallar</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >string</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="9" rowspan="1">
          <p ><span >merchant_name</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Nombre del comerciante</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >string</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="9" rowspan="1">
          <p ><span >disbursement_date</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Fecha de pago</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >string</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="9" rowspan="1">
          <p ><span >gross_amount</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Total antes de impuestos</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >number</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="9" rowspan="1">
          <p ><span >disbursed_net_amount</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Cantidad a depositar despu&eacute;s de impuestos</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >number</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="9" rowspan="1">
          <p ><span >total_transactions</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Total de transacciones que contiene el reporte</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >string</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="9" rowspan="1">
          <p ><span >details</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Arreglo de objetos con el esquema </span><span >details</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >array</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="8" rowspan="1">
          <p ><span >date</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Fecha del reporte</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >string</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="8" rowspan="1">
          <p ><span >payments</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Arreglo de objetos con el esquema </span><span >payment</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >array</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="7" rowspan="1">
          <p ><span >receipt_no</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >ID de la transacci&oacute;n</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >string</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="7" rowspan="1">
          <p ><span >payment _date</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Fecha de creaci&oacute;n del reporte</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >string</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="7" rowspan="1">
          <p ><span >amount</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Monto de la transacci&oacute;n en pesos</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >float</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="7" rowspan="1">
          <p ><span >terms</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Indica si el pago est&aacute; diferido en mensualidades. Cuando el pago no est&aacute; diferido, su valor es </span><span class="c42 c22 c74">null</span><span >. </span></p>
          <p ><span >Mensualidades disponibles:</span></p>
          <p ><span class="c17">3, 6, 9 y 12</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >string</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="7" rowspan="1">
          <p ><span >charges</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Objeto que contiene la informaci&oacute;n relacionada a los distintos cargos del pago</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >object</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="6" rowspan="1">
          <p ><span >charge</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Objeto de tipo </span><span >charge</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >object</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="5" rowspan="1">
          <p ><span >fee</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Comisi&oacute;n en pesos</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >float</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="5" rowspan="1">
          <p ><span >tax</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Cantidad de IVA</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >float</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="6" rowspan="1">
          <p ><span >surcharge</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Objeto de tipo </span><span >surcharge</span><span >&nbsp;con informaci&oacute;n de la comisi&oacute;n por mensualidades. Se calcula con base en el valor del campo </span><span
              >terms</span><span >&nbsp;del objeto </span><span >payments</span><span >&nbsp;de esta respuesta.</span></p>
          <p ><span >NOTA</span><span >: este campo a&uacute;n no est&aacute; implementado, por lo que su valor es nulo.</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >object</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="7" rowspan="1">
          <p ><span >tip</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Monto de la propina en pesos</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >float</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="7" rowspan="1">
          <p ><span >total_retention</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Retenci&oacute;n total en pesos</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >float</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="7" rowspan="1">
          <p ><span >settled_amount</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Cantidad a depositar</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >float</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="7" rowspan="1">
          <p ><span >payment_method</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Especifica la categor&iacute;a de la forma de pago:</span></p>
          <ul class="c60 lst-kix_19gayyfqeohq-0 start">
            <li ><span >DEBIT</span><span >: la tarjeta es de d&eacute;bito</span></li>
            <li ><span >CREDIT</span><span >: la tarjeta es de cr&eacute;dito</span></li>
            <li ><span >OTHER</span><span >: la tarjeta no es de d&eacute;bito ni cr&eacute;dito, por ejemplo, tarjeta de vales</span></li>
          </ul>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >string</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="7" rowspan="1">
          <p ><span >card</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Objeto que contiene detalles de la tarjeta utilizada.</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >object</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="6" rowspan="1">
          <p ><span >brand</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Tipo de tarjeta utilizada para el pago</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >string</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="6" rowspan="1">
          <p ><span >last4</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >&Uacute;ltimos cuatro d&iacute;gitos de la tarjeta utilizada para el pago</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >string</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="6" rowspan="1">
          <p ><span >issuer</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Banco emisor de la tarjeta</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >string</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="7" rowspan="1">
          <p ><span >merchant_invoice</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >N&uacute;mero proporcionado por el merchant para referencia</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >string</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span ></span></p>
        </td>
        <td  colspan="7" rowspan="1">
          <p ><span >user_email</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Correo electr&oacute;nico del usuario de Clip </span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >string</span></p>
        </td>
      </tr>
      <tr >
        <td  colspan="10" rowspan="1">
          <p ><span >links</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >Objeto de tipo </span><span >links</span></p>
        </td>
        <td  colspan="1" rowspan="1">
          <p ><span >object</span></p>
        </td>
      </tr>
    </tbody>
  </table>
<style></style>
`}</HTMLBlock>

<Callout icon="📘" theme="info">
  ### ¿Necesitas ayuda?

  Si tienes preguntas sobre cómo hacer la integración de la API, puedes contactar a nuestros desarrolladores técnicos mediante los siguientes pasos:

  1. Crear un ticket al seleccionar el botón **Ayuda** disponible en la parte inferior derecha de este sitio.
  2. Llena la información solicitada y envía tu solicitud de ayuda. Te responderemos en alrededor de 2 horas en días laborables.

  También puedes contactarnos en nuestra área de Customer Happiness:

  - [Portal web](https://ayuda.clip.mx/hc/es)
  - Llámanos al **55 6393-2323** Clip es el único con atención personalizada 24/7 los 365 días del año.
  - Envíanos un mensaje por WhatsApp al **55 6393-2323** y te atenderemos.
  - Escríbenos al correo **[help@clip.mx](mailto:help@clip.mx)**
</Callout>

<br />