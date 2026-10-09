<!-- fuente: https://www.mercadopago.com.mx/developers/en/reference/in-person-payments/point/terminals/update-operation-mode/patch · capturado 2026-10-08 -->

# Update terminal operation mode

This endpoint allows you to change the terminal operating mode. The only terminals allowed for this request are NEWLAND_N950 and PAX_A910. In case of success, the request will return a response with status 200.

**PATCH** `/terminals/v1/setup`

## Request parameters

- `terminals` (array, optional)
  This node contains the terminal whose operating mode you want to modify.

  - `terminals[].id` (string, optional)
  Terminal unique identifier. You can identify the desired Point terminal by the last characters of this field, which should match the serial number displayed on the back label of the physical terminal. You must send it according to the following format: `type of terminal + "__" + terminal serial`, as in the following example: `NEWLAND_N950__SBX0000001`.

  - `terminals[].operating_mode` (string, optional)
  Operating mode desired for the terminal to function. It must be one of the following options:
Possible enum values:

  - `PDV`
  Point of Sale (POS) operating mode. It is the mode in which the terminal operates when integrated via API for traditional operator-assisted service.

  - `STANDALONE`
  Default terminal configuration. It's when the terminal is not integrated with the API and does not allow reconciliations between integrator systems and Mercado Pago, so its use is not recommended.

## Response parameters

- `terminals` (array, optional)
  This node will contain the terminal's information with its new operating mode.

  - `terminals[].id` (string, optional)
  Terminal unique identifier. You can identify the Point terminal by the last characters of this field, which should match the serial number displayed on the back label of the physical terminal.

  - `terminals[].operating_mode` (string, optional)
  Operating mode defined for the terminal. It can be one of the following options:
Possible enum values:

  - `PDV`
  Point of Sale (POS) operating mode. It is the mode in which the terminal operates when integrated via API for traditional operator-assisted service.

  - `STANDALONE`
  Default terminal configuration. It's when the terminal is not integrated with the API.

## Errors

| Status | Error | Description |
| ------- | ------- | ----------- |
| 400 | unsupported_site | Invalid site for this request. The only available locations/sites are Argentina, Brazil, Chile and Mexico. Check the sent Access Token and try to execute the request again. |
| 400 | unsupported_properties | A parameter that is not supported by the API was sent. Check the message returned in the error details to identify the problem and try again. |
| 400 | required_properties | Some required properties are missing. Check the message returned in the error details to identify the problem and try again by sending the missing information. |
| 400 | property_value | An incorrect value for some property was sent. Check the message returned in the error details to find out what the problem was and try again. |
| 400 | invalid_payload | Invalid payload. Check the sent fields and try to make the request again. |
| 401 | unauthorized | The value sent as Access Token is incorrect. Please check and try again with the correct value. |
| 403 | terminal_not_allowed_action | The terminal identified in the `id` field is not allowed to perform this action. The only terminals allowed for this request are PAX_A910 and NEWLAND_N950. |
| 403 | store_pos_not_found | The terminal used does not have a store associated or, if there is a store, it does not have a point of sale created. Please check the returned message and try submitting the request again. |
| 404 | not_found | Resource not found or the value sent is inexistent. Validate the information sent in the parameters and try the request again. |
| 412 | Only one pos-store with PDV mode ON or SUSPENDED is allowed | Operation not allowed because there is already a terminal associated with the point of sale, and each point of sale allows only one associated terminal in POS mode. |
| 500 | internal_error | Internal error. Please check the returned message and try submitting your request again. |

## Request example

### cURL

```bash
curl -X PATCH \
  'https://api.mercadopago.com/terminals/v1/setup' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -d '{
  "terminals": [
  {
  "id": "NEWLAND_N950__SBX0000001",
  "operating_mode": "PDV | STANDALONE"
  }
  ]
  }'
```

## Response example

```json
{
  "terminals": [
  {
  "id": "NEWLAND_N950__SBX0000001",
  "operating_mode": "PDV | STANDALONE"
  }
  ]
}
```
