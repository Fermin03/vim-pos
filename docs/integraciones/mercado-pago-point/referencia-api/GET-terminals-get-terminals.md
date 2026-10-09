<!-- fuente: https://www.mercadopago.com.mx/developers/en/reference/in-person-payments/point/terminals/get-terminals/get · capturado 2026-10-08 -->

# Get list of terminals

This endpoint allows you to obtain a list of the Point terminals active in your account, with the information corresponding to their respective point of sale, store, and operating mode. The only terminals allowed for this request are NEWLAND_N950 and PAX_A910. In case of success, the request will return a response with status 200.

**GET** `/terminals/v1/list`

## Request parameters

### Query

- `limit` (integer, optional)
  Pagination limit. This parameter specifies the maximum number of records you want to get in the response. It must be a numeric value, greater than or equal to 1 and less than or equal to 50. The default value is 50.

- `offset` (integer, optional)
  Pagination offset. This parameter determines the starting point from which the records should be obtained. It must be a numerical value greater than or equal to zero (0). Its default value is zero (0).

- `store_id` (string, optional)
  It's the store identifier, which corresponds to the `id` parameter obtained in the response to its creation through the endpoint [POST /users/{user_id}/stores](/developers/en/reference/in-person-payments/point/stores/create-store/post). You should send it only if you want to filter the available terminals by store.

- `pos_id` (integer, optional)
  It's the device Point of Sale identifier, which corresponds to the `id` parameter obtained in the response to its creation through the endpoint [POST /v2/pos](/developers/en/reference/in-person-payments/point/pos/create-pos/post). You should send it only if you want to filter the available terminals by point of sale.

## Response parameters

- `data` (object, optional)
  This node contains a list of available Point terminals associated with your Mercado Pago account.

  - `data.terminals` (array, optional)
  This node contains the information related to each terminal, including the associated point of sale and store, and its operation mode.

  - `data.terminals[].id` (string, optional)
  Terminal unique identifier. You can identify the desired Point terminal by the last characters of this field, which should match the serial number displayed on the back label of the terminal.

  - `data.terminals[].pos_id` (integer, optional)
  Identifier of the point of sale associated with the Point terminal.

  - `data.terminals[].store_id` (string, optional)
  Identifier of the store associated with the Point terminal.

  - `data.terminals[].external_pos_id` (string, optional)
  External identifier of the point of sale, defined by the integrator during its creation.

  - `data.terminals[].operating_mode` (string, optional)
  Operating mode defined for the terminal at the time of the request.
Possible enum values:

  - `PDV`
  Point of Sale (POS) operating mode. It is the mode in which the terminal operates when integrated via API for traditional operator-assisted service.

  - `STANDALONE`
  Default terminal configuration. It's when the terminal is not integrated with the API.

  - `UNDEFINED`
  The configuration that the terminal has is not recognized.

- `paging` (object, optional)

  - `paging.total` (integer, optional)
  This parameter indicates the total number of elements available, beyond those selected to be displayed.

  - `paging.offset` (integer, optional)
  Starting point from which records were obtained, selected when submitting the request.

  - `paging.limit` (integer, optional)
  Specifies the maximum number of records obtained, selected when sending the request.

## Errors

| Status | Error | Description |
| ------- | ------- | ----------- |
| 401 | unauthorized | The value sent as Access Token is incorrect. Please check and try again with the correct value. |
| 500 | internal_error | Internal error. Please check the returned message and try submitting your request again. |

## Request example

### cURL

```bash
curl -X GET \
  'https://api.mercadopago.com/terminals/v1/list?limit=<LIMIT>&offset=<OFFSET>&store_id=<STORE_ID>&pos_id=<POS_ID>' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

## Response example

```json
{
  "data": {
  "terminals": [
  {
  "id": "NEWLAND_N950__SBX0000001",
  "pos_id": 47792476,
  "store_id": "47792478",
  "external_pos_id": "SUC0101POS",
  "operating_mode": "PDV | STANDALONE | UNDEFINED"
  }
  ]
  },
  "paging": {
  "total": 1,
  "offset": 0,
  "limit": 50
  }
}
```
