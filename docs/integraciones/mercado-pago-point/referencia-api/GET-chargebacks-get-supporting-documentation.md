<!-- fuente: https://www.mercadopago.com.mx/developers/en/reference/in-person-payments/point/chargebacks/get-supporting-documentation/get · capturado 2026-10-08 -->

# Get supporting documentation file

This endpoint allows you to download or render inline a documentation file previously uploaded to a chargeback case. The file is identified by its unique `uuid` and returned with its original MIME type, allowing it to be viewed directly in the browser. In case of success, the request will return a response with status 200.

**GET** `/v1/chargebacks/documentation/{type}/{uuid}`

## Request parameters

### Header

- `X-Caller-Id` (integer, required)
  ID of the authenticated user (`seller ID`) and owner of the requested resource.

### Path

- `type` (string, required)
  Type of the requested document. The only allowed value is `collector`, used for files uploaded by the seller.

- `uuid` (string, required)
  Unique identifier of the supporting documentation file, obtained from the `documentation` array in the response of `GET /v1/chargebacks/{id}`.

## Response parameters

This endpoint has no response body.

## Errors

| Status | Error | Description |
| ------- | ------- | ----------- |
| 400 | invalid_path_param | One or more parameters provided in the request path are invalid. Please confirm them and provide valid values to try again. |
| 403 | invalid_user_for_operation | The caller does not have permission to access the requested resource (not the owner of the case or supporting file). |
| 500 | internal_error | A generic error occurred. Check the request and try again. |

## Request example

### cURL

```bash
curl -X GET \
  'https://api.mercadopago.com/v1/chargebacks/documentation/{type}/{uuid}' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```
