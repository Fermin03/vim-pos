<!-- fuente: https://www.mercadopago.com.mx/developers/en/reference/in-person-payments/point/stores/search-store/get · capturado 2026-10-08 -->

# Search stores

This endpoint allows you to find all the information about created stores using specific filters. A status 200 indicates that the request has been successfully processed.

**GET** `/users/{user_id}/stores/search`

## Request parameters

### Path

- `user_id` (string, required)
  The user_id corresponds to the collector_id. It refers to the user_id of the Mercado Pago account that receives the money from sales, that is, the account responsible for collecting the funds.

### Query

- `external_id` (string, optional)
  unique store identifier, set by the integrated system and can contain up to 60 characters.

## Response parameters

This endpoint has no response body.

## Errors

| Status | Error | Description |
| ------- | ------- | ----------- |
| 400 | INVALID_USER_ID | user_id must be a number - If this error appears, ensure that the user_id provided is strictly numeric. |
| 400 | INVALID_OFFSET | offset must be a number - If you encounter this error, verify that the offset is a numeric value. |
| 400 | INVALID_LIMIT | limit must be a number - In case this error occurs, please check that the limit is specified as a numeric value. |
| 400 | INVALID_EXTERNAL_ID | external_id must be alphanumeric - If this error appears, ensure the external_id contains only letters and numbers. |
| 403 | Forbidden | `You don't have permission to access the URL on this server.` If you receive this message, check the user_id field and ensure it is correct and numeric only. |
| 404 | store_not_found | `Store not found.` Check if the search parameter used to locate the store is valid and make a new request. |

## Request example

### cURL

```bash
curl -X GET \
  'https://api.mercadopago.com/users/{user_id}/stores/search?external_id=<EXTERNAL_ID>' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

## Response example

```json
[
  {
  "paging": {
  "total": 1,
  "offset": 0,
  "limit": 30
  },
  "results": [
  {
  "id": 30163646,
  "name": "Sucursal Instore",
  "date_creation": "2021-04-16T14:54:28.573Z",
  "business_hours": {
  "monday": null,
  "tuesday": null,
  "wednesday": null
  },
  "location": {
  "address_line": null,
  "reference": null,
  "latitude": null,
  "longitude": null
  },
  "external_id": "SUC001"
  }
  ]
  }
]
```
