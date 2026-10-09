<!-- fuente: https://www.mercadopago.com.mx/developers/en/reference/in-person-payments/point/orders/create-order/post · capturado 2026-10-08 -->

# Create order

This endpoint allows to create an order for Mercado Pago Point for payment transactions. In case of success, the request will return a response with status 201.

**POST** `/v1/orders`

## Request parameters

### Header

- `X-Idempotency-Key` (string, required)
  This feature allows you to safely retry requests without the risk of accidentally performing the same action more than once. This is useful for avoiding errors, such as creating two identical payments. To ensure that each request is unique, you must use an exclusive value in the header of each unique value for each call. If you use a value already assigned to another request, you will receive information corresponding to that created resource in response, not this new request. We suggest using a UUID V4 or random strings.

- `type` (string, optional)
  Order type, associated with the Mercado Pago solution for which it is created. For Mercado Pago Point payments, the only possible value is `point`.
Possible enum values:

  - `point`
  Value associated with the creation of orders for Mercado Pago Point payments.

- `external_reference` (string, optional)
  It is the external reference of the order, assigned when creating it. The maximum allowed limit is 64 characters, and the allowed characters are: uppercase and lowercase letters, numbers, and the symbols hyphen (-) and underscore (_). It must be a unique value for each order and cannot contain PII data.

- `expiration_time` (string, optional)
  Indicates the validity period of the payment order from its creation. During this time, the order will be available for processing by the customer; if it is not processed within the specified period, it will automatically expire and cannot be used, requiring the generation of a new payment order to continue. The minimum allowed value is 30 seconds (`PT30S`) and the maximum is 3 hours (`PT3H`). Usage examples: for a 30-second expiration: `PT30S`, for 10 minutes: `PT10M`, and for 1 hour and 15 minutes: `PT1H15M`. If the &#96;expiration_time&#96; field is not sent, the default period is 15 minutes.

- `transactions` (object, optional)
  Contains information about the transaction associated with the order. When the `type` is `point`, it is only possible to include 1 transaction per order.

  - `transactions.payments` (array, optional)
  Contains information about the payment order.

  - `transactions.payments[].amount` (string, optional)
  Payment total amount. It accepts up to 2 decimal places, and the decimal separator is optional. Valid examples: &#96;10&#96;, &#96;10.5&#96;, and &#96;10.00&#96;.

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
  Order's payment method configuration. Although sending this parameter is optional, we recommend that you take it into account if you choose to configure the terminal in question to accept only one payment method. If not sent, the terminal operates with its default configuration, accepting all available payment methods and allowing the customer to choose.

  - `config.payment_method.default_type` (string, optional)
  Indicates the payment method that the terminal will accept. By default, it will accept all payment methods and will allow the customer to select the payment method they want. Although sending this parameter is optional, we recommend that you take it into account if you choose to configure the terminal in question to accept only one payment method. Otherwise, the possible values are the following:
Possible enum values:

  - `debit_card`
  The terminal will accept only debit card payments.

  - `credit_card`
  The terminal will accept only credit card payments.

- `description` (string, optional)
  Description of the purchased product or service, the reason for the payment order. The maximum limit is 150 characters.

- `integration_data` (object, optional)
  Contains information about the Mercado Pago application that created the order.

  - `integration_data.platform_id` (string, optional)
  Identifier of the platform, assigned by Mercado Pago.

  - `integration_data.integrator_id` (string, optional)
  Identifier of the user who develops the integration that creates the order, assigned by Mercado Pago.

  - `integration_data.sponsor` (object, optional)
  Contains information about the sponsor associated with the order.

  - `integration_data.sponsor.id` (string, optional)
  Mercado Pago's `USER_ID` of the integrator system.

## Response parameters

- `id` (string, optional)
  Identifier of the order created in the request, automatically generated by Mercado Pago.

- `type` (string, optional)
  Order type.
Possible enum values:

  - `point`
  Order created for Mercado Pago Point payments.

- `user_id` (string, optional)
  ID of the Mercado Pago account that created the order.

- `external_reference` (string, optional)
  It is the external reference of the order, assigned when creating it. The maximum allowed limit is 64 characters, and the allowed characters are: uppercase and lowercase letters, numbers, and the symbols hyphen (-) and underscore (_).

- `description` (string, optional)
  Description of the product or service purchased, the reason for the payment order.

- `expiration_time` (string, optional)
  Indicates the validity period of the payment order from its creation. During this time, the order will be available for processing by the customer; if it is not processed within the specified period, it will automatically expire and cannot be used, requiring the generation of a new payment order to continue. The minimum allowed value is 30 seconds (`PT30S`) and the maximum is 3 hours (`PT3H`). Usage examples: for a 30-second expiration: `PT30S`, for 10 minutes: `PT10M`, and for 1 hour and 15 minutes: `PT1H15M`. If the &#96;expiration_time&#96; field is not sent, the default period is 15 minutes.

- `processing_mode` (string, optional)
  Indicates how the order will be processed. For Point orders, the only allowed value is `automatic`, that sets the order to be ready to process.

- `country_code` (string, optional)
  Identifier of the site (country) to which the Mercado Pago application that created the order belongs.

- `currency` (string, optional)
  Identifier of the currency used in the order.

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

  - `created`
  The order has been successfully created.

- `status_detail` (string, optional)
  Details about the status of the order.
Possible enum values:

  - `created`
  The order has been successfully created.

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
  Current status of the payment transaction.
Possible enum values:

  - `created`
  The order has been successfully created.

## Errors

| Status | Error | Description |
| ------- | ------- | ----------- |
| 400 | empty_required_header | The `X-Idempotency-Key` header is required and was not sent. Make the request again including it. |
| 400 | required_properties | Some required properties are missing. Check the message returned in the error details to identify the problem and try again by sending the missing information. |
| 400 | unsupported_properties | An unsupported property was sent. Check the message returned in the error details to find out what the problem was and try again. |
| 400 | minimum_properties | The minimum number of properties required to execute the request was not sent. Check the message returned in the error details to find out what the problem was and try again. |
| 400 | property_type | The wrong property type was submitted. For example, an `integer` value for a `string` property. Check the message returned in the error details to find out what the problem was and try again. |
| 400 | minimum_items | The minimum number of items for some property was not sent. Check the message returned in the error details to find out what the problem was and try again. |
| 400 | maximum_items | A greater number of items were sent than allowed for some property. Check the message returned in the error details to find out what the problem was and try again. |
| 400 | property_value | An incorrect value for some property was sent. Check the message returned in the error details to find out what the problem was and try again. |
| 400 | json_syntax_error | An incorrect JSON was sent. Check the message returned in the error details to find out what the problem was and try again. |
| 401 | unauthorized | The value sent as Access Token is incorrect. Please check and try again with the correct value. |
| 403 | forbidden_checking_terminal_owner | The Point terminal does not belong to the user who submitted the request. Check if the value sent for `terminal_id` is correct or if the terminal is linked to your account. |
| 409 | idempotency_key_already_used | The value sent as the idempotency header has already been used with a different request within the last 24 hours. Please try the request again sending a new value. |
| 409 | already_queued_order_for_terminal | The terminal already has an order waiting. It is necessary to finalize or cancel it to send new orders. |
| 500 | idempotency_validation_failed | Validation fail. Please try submitting the request again. |
| 500 | 500 | Generic error. Please try submitting the request again. |

## Request example

### cURL

```bash
curl -X POST \
  'https://api.mercadopago.com/v1/orders' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -d '{
  "type": "point",
  "external_reference": "ext_ref_1234",
  "expiration_time": "PT16M",
  "transactions": {
  "payments": [
  {
  "amount": "50.00"
  }
  ]
  },
  "config": {
  "point": {
  "terminal_id": "NEWLAND_N950__SBX0000001",
  "print_on_terminal": "no_ticket"
  },
  "payment_method": {
  "default_type": "credit_card"
  }
  },
  "description": "Smartphone",
  "integration_data": {
  "platform_id": "dev_1234567890",
  "integrator_id": "dev_123456",
  "sponsor": {
  "id": "446566691"
  }
  }
  }'
```

## Response example

```json
{
  "id": "ORD00001111222233334444555566",
  "type": "point",
  "user_id": "5238400195",
  "external_reference": "ext_ref_1234",
  "description": "Smartphone",
  "expiration_time": "PT16M",
  "processing_mode": "automatic",
  "country_code": "MEX",
  "currency": "MXN",
  "integration_data": {
  "application_id": "1234567890",
  "platform_id": "dev_1234567890",
  "integrator_id": "dev_123456",
  "sponsor": {
  "id": "446566691"
  }
  },
  "status": "created",
  "status_detail": "created",
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
  "amount": "50.00",
  "status": "created"
  }
  ]
  }
}
```
