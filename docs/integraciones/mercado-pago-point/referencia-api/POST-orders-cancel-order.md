<!-- fuente: https://www.mercadopago.com.mx/developers/en/reference/in-person-payments/point/orders/cancel-order/post · capturado 2026-10-08 -->

# Cancel order by ID

This endpoint allows you to cancel an order created for Mercado Pago Point and its transactions using the reference ID obtained in the response to its creation. Orders with `status=created` and `status=at_terminal` can be canceled. If successful, a request for an order with `status=created` returns a response with status 200, while a request for an order with `status=at_terminal` returns a response with status 202, indicating that the request was accepted, but the cancellation will only take effect after a [cancellation notification](/developers/en/docs/mp-point/notifications) is received.

**POST** `/v1/orders/{order_id}/cancel`

## Request parameters

### Header

- `x-allow-cancelable-status` (string, optional)
  This header is required to cancel an order with `status=at_terminal`, and its value must be exactly `at_terminal`. For orders with `status=created`, the header is ignored. Canceling an order with `status=at_terminal` also requires a terminal with a compatible software version; otherwise, the request behaves as if the header had not been sent. For more information about compatible terminal models, see [Cancel an order](/developers/en/docs/mp-point/payment-processing).

- `X-Idempotency-Key` (string, required)
  This feature allows you to safely retry requests without the risk of accidentally performing the same action more than once. This is useful for avoiding errors, such as creating two identical payments. To ensure that each request is unique, you must use an exclusive value in the header of each unique value for each call. If you use a value already assigned to another request, you will receive information corresponding to that created resource in response, not this new request. We suggest using a UUID V4 or random strings.

### Path

- `order_id` (string, required)
  Identifier of the order to be canceled. This value is returned in the response to the request made to the endpoint [POST /v1/orders](/developers/en/reference/in-person-payments/point/orders/create-order/post).

## Response parameters

- `id` (string, optional)
  Identifier of the order whose cancellation was requested.

- `user_id` (string, optional)
  ID of the Mercado Pago account that created the order.

- `type` (string, optional)
  Order type.
Possible enum values:

  - `point`
  Order created for Mercado Pago Point payments.

- `external_reference` (string, optional)
  It is the external reference of the order, assigned when creating it. The maximum allowed limit is 64 characters, and the allowed characters are: uppercase and lowercase letters, numbers, and the symbols hyphen (-) and underscore (_).

- `description` (string, optional)
  Description of the purchased product, the reason for the payment order.

- `expiration_time` (string, optional)
  Indicates the validity period of the payment order from its creation. During this time, the order will be available for processing by the customer; if it is not processed within the specified period, it will automatically expire and cannot be used, requiring the generation of a new payment order to continue. The minimum allowed value is 30 seconds (`PT30S`) and the maximum is 3 hours (`PT3H`). Usage examples: for a 30-second expiration: `PT30S`, for 10 minutes: `PT10M`, and for 1 hour and 15 minutes: `PT1H15M`. If the &#96;expiration_time&#96; field is not sent, the default period is 15 minutes.

- `country_code` (string, optional)
  Identifier of the site (country) to which the Mercado Pago application that created the order belongs.

- `processing_mode` (string, optional)
  Indicates how the order will be processed. For Point orders, the only allowed value is `automatic`, that sets the order to be ready to process.

- `integration_data` (object, optional)
  Contains information about the Mercado Pago application that created the order.

  - `integration_data.application_id` (string, optional)
  Identifier of the Mercado Pago application that created the order.

  - `integration_data.platform_id` (string, optional)
  Identifier of the platform, assigned by Mercado Pago.

  - `integration_data.integrator_id` (string, optional)
  Identifier of the user who develops the integration that creates the order, assigned by Mercado Pago.

  - `integration_data.sponsor` (object, optional)
  Contains information about the sponsor associated with the order.

  - `integration_data.sponsor.id` (string, optional)
  Mercado Pago's `USER_ID` of the integrator system.

- `status` (string, optional)
  Current status of the order.
Possible enum values:

  - `canceled`
  The order has been canceled, either through the API or the terminal.

  - `at_terminal`
  The cancellation request was accepted and returns HTTP 202, but the order remains at the terminal until the cancellation is confirmed through a [cancellation notification](/developers/en/docs/mp-point/notifications).

- `status_detail` (string, optional)
  Details about the current order status.
Possible enum values:

  - `canceled`
  The order has been canceled through the API.

  - `at_terminal`
  The order remains at the terminal while the asynchronous cancellation is processed. The response returns HTTP 202.

- `created_date` (string, optional)
  Order's creation date, in `yyyy-MM-ddTHH:mm:ss.sssZ` format.

- `last_updated_date` (string, optional)
  Order's last update date, in `yyyy-MM-ddTHH:mm:ss.sssZ` format.

- `config` (object, optional)
  Order type configuration.

  - `config.point` (object, optional)
  Point order configuration.

  - `config.point.terminal_id` (string, optional)
  Identifier of the terminal that will obtain the order. You must send it according to the following format: `type of terminal + "__" + terminal serial`, as in the following example: `NEWLAND_N950__SBX0000001`. The serial number can be found on the rear label of the terminal.

  - `config.point.print_on_terminal` (string, optional)
  Indicates whether the terminal should print the receipt of the transaction. Its default value will be `seller_ticket`.
Possible enum values:

  - `seller_ticket`
  Value that determines the printing of the ticket for the seller.

  - `no_ticket`
  Value that determines that the ticket must not be printed.

  - `config.payment_method` (object, optional)
  Order's payment method configuration.

  - `config.payment_method.default_type` (string, optional)
  Indicates the payment method that the terminal will accept. By default, it will accept all payment methods and will allow the customer to select the payment method they want. If not, the possible values ​​are the following:
Possible enum values:

  - `debit_card`
  The terminal will accept only debit card payments.

  - `credit_card`
  The terminal will accept only credit card payments.

- `transactions` (object, optional)
  Contains information about the transaction associated with the order.

  - `transactions.payments` (array, optional)
  Contains information about the payment associated with the order.

  - `transactions.payments[].id` (string, optional)
  Identifier of the payment transaction created in the request, automatically generated by Mercado Pago.

  - `transactions.payments[].amount` (string, optional)
  Payment amount.

  - `transactions.payments[].status` (string, optional)
  Current status of the transaction.
Possible enum values:

  - `canceled`
  The order has been canceled, either through the API or the terminal.

  - `at_terminal`
  The payment remains at the terminal while the asynchronous cancellation is processed. The response returns HTTP 202.

  - `transactions.payments[].status_detail` (string, optional)
  Details about the current transaction status.
Possible enum values:

  - `canceled_by_api`
  The order has been canceled through the API.

  - `cancellation_requested`
  The cancellation request was accepted and returns HTTP 202, but the cancellation will only take effect after a [cancellation notification](/developers/en/docs/mp-point/notifications) is received.

## Errors

| Status | Error | Description |
| ------- | ------- | ----------- |
| 400 | empty_required_header | The `X-Idempotency-Key` header is required and was not sent. Make the request again including it. |
| 400 | bad_request | The `order_id` provided in the request path is not correct. Please confirm it and provide a valid ID to try again. |
| 401 | unauthorized | The value sent as Access Token is incorrect. Please check and try again with the correct value. |
| 404 | order_not_found | Order not found. Please check if you provided the correct order ID. |
| 409 | idempotency_key_already_used | The value sent as the idempotency header has already been used. Please try the request again sending a new value. |
| 409 | cannot_cancel_order | The order status does not allow cancellation. Only orders with `status=created` or `status=at_terminal` can be canceled via API. To cancel an order with `status=at_terminal`, send the header `x-allow-cancelable-status: at_terminal` and use a terminal with a compatible software version. For more information about compatible terminal models, see [Cancel an order](/developers/en/docs/mp-point/payment-processing). If the header is missing or invalid, or the terminal is not compatible, this error is returned. |
| 409 | order_already_canceled | The order has already been canceled. |
| 500 | idempotency_validation_failed | Validation fail. Please try submitting the request again. |
| 500 | 500 | Internal server error. Please try submitting the request again. |

## Request example

### cURL

```bash
curl -X POST \
  'https://api.mercadopago.com/v1/orders/{order_id}/cancel' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

## Response example

```json
{
  "id": "ORD0000ABCD222233334444555566",
  "user_id": "5238400195",
  "type": "point",
  "external_reference": "ext_ref_1234",
  "description": "Point Smart Mini",
  "expiration_time": "PT16M",
  "country_code": "MEX",
  "processing_mode": "automatic",
  "integration_data": {
  "application_id": "1234567890",
  "platform_id": "dev_1234567890",
  "integrator_id": "dev_123456",
  "sponsor": {
  "id": "446566691"
  }
  },
  "status": "canceled",
  "status_detail": "canceled",
  "created_date": "2024-09-10T14:26:42.109320977Z",
  "last_updated_date": "2024-09-10T14:26:42.109320977Z",
  "config": {
  "point": {
  "terminal_id": "NEWLAND_N950__SBX0000001",
  "print_on_terminal": "no_ticket"
  },
  "payment_method": {
  "default_type": "credit_card"
  }
  },
  "transactions": {
  "payments": [
  {
  "id": "PAY01J67CQQH5904WDBVZEM4JMEP3",
  "amount": "24.50",
  "status": "canceled",
  "status_detail": "canceled_by_api"
  }
  ]
  }
}
```
