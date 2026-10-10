<!-- fuente: https://www.mercadopago.com.mx/developers/en/reference/in-person-payments/point/pos/delete-pos/delete · capturado 2026-10-08 -->

# Delete point of sale

This endpoint allows the deletion of a specific point of sale, identified by its ID. The point of sale must belong to the Access Token user. In case of success, the request will return a response with status 204 and no body. If the same request is resent with the same X-Idempotency-Key (first call successful — 204), the second call will return 200.

**DELETE** `/v2/pos/{pos_id}`

## Request parameters

### Header

- `X-Idempotency-Key` (string, required)
  This feature allows you to safely retry requests without the risk of accidentally performing the same action more than once. This is useful for avoiding errors, such as deleting a point of sale twice. To ensure that each request is unique, you must use an exclusive value in the header for each call. If you use a value already assigned to another request, you will receive information corresponding to that created resource in response, not this new request. We suggest using a UUID V4 or random strings. The header accepts values between 1 and 64 characters.

### Path

- `pos_id` (string, required)
  It is the numeric identifier of the point of sale to be deleted, automatically assigned by Mercado Pago at creation time through the endpoint [POST /v2/pos](/developers/en/reference/in-person-payments/point/pos/create-pos/post). Must be a valid `integer` greater than or equal to 0.

## Response parameters

This endpoint has no response body.

## Errors

| Status | Error | Description |
| ------- | ------- | ----------- |
| 400 | resource_bad_request_error | The `pos_id` provided in the path is not a valid `integer` or is negative. Verify that the value is a non-negative base-10 `integer`. |
| 400 | bad_request | The request could not be processed. Verify that the point of sale belongs to the Access Token user and that the X-Idempotency-Key header is present and not empty. |
| 400 | idempotency_key_already_used | The X-Idempotency-Key value sent was already used in a previous request with a different payload. Generate a new unique value for each distinct operation. |
| 401 | unauthorized | The value sent as Access Token is incorrect or missing. Please check and try again with a valid Access Token. |
| 404 | pos_not_found | No point of sale was found for the provided `pos_id` and the Access Token user. Verify that the ID is correct and belongs to your account. |
| 409 | conflict | The same request is already being processed by another concurrent call with the same X-Idempotency-Key. Wait a few seconds and retry with the same key and the same payload. |
| 500 | internal_server_error | An unexpected error occurred on the server. This is a transient failure not related to the request data. Please try again after a few moments. |

## Request example

### cURL

```bash
curl -X DELETE \
  'https://api.mercadopago.com/v2/pos/{pos_id}' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```
