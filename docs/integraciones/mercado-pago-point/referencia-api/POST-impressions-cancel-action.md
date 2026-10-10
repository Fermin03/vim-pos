<!-- fuente: https://www.mercadopago.com.mx/developers/en/reference/in-person-payments/point/impressions/cancel-action/post · capturado 2026-10-08 -->

# Cancel action by ID

This endpoint allows you to cancel an action created for Mercado Pago Point and its transactions using the reference ID obtained in the response to its creation. Only an action in status `created` can be canceled. In case of success, the request will return a response with status 200.

**POST** `/terminals/v1/actions/{action_id}/cancel`

## Request parameters

### Header

- `X-Idempotency-Key` (string, required)
  This feature allows you to safely retry requests without the risk of accidentally performing the same action more than once. This is useful for avoiding errors, such as creating two identical payments. To ensure that each request is unique, it's important to use an exclusive value in the header of your request. We suggest using a UUID V4 or random strings.

### Path

- `action_id` (string, required)
  ID of the action that is being canceled. This value is returned in the response to the request made to the endpoint [POST /terminals/v1/actions](/developers/en/reference/in-person-payments/point/impressions/create-terminal/post).

## Response parameters

This endpoint has no response body.

## Errors

| Status | Error | Description |
| ------- | ------- | ----------- |
| 400 | empty_required_header | The 'X-Idempotency-Key' header is required and was not sent. Make the requisition again including it. |
| 400 | invalid_path_param | The action_id provided in the request path is not correct. Please confirm it and provide a valid ID to try again. |
| 401 | unauthorized | The value provided as the Access Token is incorrect. Please check and resubmit the request with the correct value. |
| 404 | order_not_found | Order not found. Please check if you provided the correct order ID. |
| 409 | idempotency_key_already_used | The value sent as the idempotency header has already been used. Please try the request again sending a new value. |
| 409 | cannot_cancel_order | There is a conflict trying to cancel the order due to its current status. Please note that orders can only be canceled via API when `status=created`. If you are trying to cancel an order with status `status=at_terminal`, you will need to do from the terminal. |
| 500 | idempotency_validation_failed | Validation fail. Please try submitting the request again. |
| 500 | 500 | Internal server error. Please try submitting the request again. |

## Request example

### cURL

```bash
curl -X POST \
  'https://api.mercadopago.com/terminals/v1/actions/{action_id}/cancel' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```
