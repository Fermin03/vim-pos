<!-- fuente: https://www.mercadopago.com.mx/developers/en/reference/in-person-payments/point/orders/simulate-order/post · capturado 2026-10-08 -->

# Simulate order status

This endpoint allows you to simulate a final status for an order created with test credentials. The simulation does not generate events or interactions with the Point terminal. The status change may take up to 10 seconds to be completed, or up to 40 seconds in the case of simulating the action_required status. In case of success, the request will return a response with status 204 and no content.

**POST** `/v1/orders/{order_id}/events`

## Request parameters

### Path

- `order_id` (string, required)
  Identifier of the order that will have its final status simulated. This value is returned in the response to the request made to the endpoint [POST /v1/orders](/developers/en/reference/in-person-payments/point/orders/create-order/post).

- `status` (string, required)
  Final status to simulate for the order. The status change may take up to 10 seconds to be processed (or up to 40 seconds to simulate the `action_required` status). The order will automatically change to the `at_terminal` status before reaching the requested final status.
Possible enum values:

  - `processed`
  The order has been successfully processed.

  - `canceled`
  The order has been canceled.

  - `expired`
  The order has expired.

  - `failed`
  The payment has failed.

  - `refunded`
  The payment has been refunded. To simulate this status, the order must have been previously processed. Unlike other statuses, `refunded` transitions directly without passing through `at_terminal`.

  - `action_required`
  Action required from the customer.

- `payment_method_type` (string, optional)
  Type of payment method used in the transaction. This field allows you to specify which payment method you want to simulate.
Possible enum values:

  - `debit_card`
  Simulates a payment made with a debit card.

  - `credit_card`
  Simulates a payment made with a credit card.

- `installments` (integer, optional)
  Number of installments for the payment. Only applies when `payment_method_type` is `credit_card`.

- `payment_method_id` (string, optional)
  This field allows you to specify which card brand or payment method you want to simulate. Only available when the status to simulate is `processed` or `failed`.
Possible enum values:

  - `amex`
  American Express credit card brand.

  - `master`
  Mastercard credit card brand.

  - `visa`
  Visa credit card brand.

  - `debmaster`
  Mastercard debit card brand.

  - `debvisa`
  Visa debit card brand.

- `status_detail` (string, optional)
  Status detail. Only available when the status to simulate is `processed` or `failed`.
Possible enum values:

  - `accredited`
  The payment has been successfully accredited. Only allowed value for `processed` status.

  - `bad_filled_card_data`
  The card data is incorrect. Only available for `failed` status.

  - `required_call_for_authorize`
  A call is required to authorize the payment. Only available for `failed` status.

  - `card_disabled`
  The card is disabled. Only available for `failed` status.

  - `high_risk`
  The payment was rejected due to high risk. Only available for `failed` status.

  - `insufficient_amount`
  The account has insufficient funds. Only available for `failed` status.

  - `invalid_installments`
  The number of installments is invalid. Only available for `failed` status.

  - `max_attempts_exceeded`
  The maximum number of attempts has been exceeded. Only available for `failed` status.

  - `rejected_other_reason`
  The payment was rejected for other reason. Only available for `failed` status.

  - `processing_error`
  An error occurred while processing the payment. Only available for `failed` status.

## Response parameters

This endpoint has no response body.

## Errors

| Status | Error | Description |
| ------- | ------- | ----------- |
| 400 | bad_request | The `order_id` provided in the path is not a valid ULID. Check the value and try again. |
| 400 | bad_request | Invalid data was sent in the request body. For example, invalid status values, or fields like `payment_method_id` or `installments` with status values different from those mentioned in the field description, or additional fields not allowed. |
| 400 | bad_request | Invalid order status transition. The status change you are trying to simulate is not allowed by the status machine. |
| 401 | unauthorized | The value sent as Access Token is incorrect. Please check and try again with the correct value. |
| 403 | forbidden | No permission to access the resource. |
| 404 | order_not_found | The Order ID provided in the URL path does not exist. Check if the ID is correct and if the order was created with test credentials. |
| 500 | internal_error | An error occurred on our side while processing the request. If the problem persists, please contact Mercado Pago. |

## Request example

### cURL

```bash
curl -X POST \
  'https://api.mercadopago.com/v1/orders/{order_id}/events' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -d '{
  "status": "processed",
  "payment_method_type": "credit_card",
  "installments": 1,
  "payment_method_id": "master",
  "status_detail": "accredited"
  }'
```
