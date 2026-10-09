<!-- fuente: https://www.mercadopago.com.mx/developers/en/reference/in-person-payments/point/chargebacks/search-chargebacks/get · capturado 2026-10-08 -->

# Search chargebacks

This endpoint allows you to search for all chargeback cases associated with a `payment_id`, returned from a notification configured for the `chargebacks` topic. The requester must be the seller of the queried payment, and the response will include pagination and the full details of each case found, including the status of its supporting documentation. In case of success, the request will return a response with status 200.

**GET** `/v1/chargebacks/search`

## Request parameters

### Header

- `X-Caller-Id` (integer, required)
  ID of the authenticated user (`seller ID`) and owner of the requested resource.

### Query

- `payment_id` (integer, required)
  ID of the payment for which chargeback cases are to be searched, obtained from a notification configured for the `chargebacks` topic.

- `offset` (integer, optional)
  Number of results to skip for pagination. The minimum and default value is 0.

- `limit` (integer, optional)
  Number of results per page. The minimum value is 1 and the default value is 10.

## Response parameters

- `paging` (object, optional)
  Pagination metadata.

  - `paging.offset` (integer, optional)
  Index of the first returned result.

  - `paging.limit` (integer, optional)
  Maximum number of results per page.

  - `paging.total` (integer, optional)
  Total results available for the search.

- `results` (array, optional)
  List of chargeback cases found.

  - `results[].id` (string, optional)
  Unique identifier of the case.

  - `results[].payments` (array, optional)
  IDs of the payments associated with the case. May include multiple payments when they are cart or bundle purchases.

  - `results[].currency` (string, optional)
  Currency in which the disputed amount is.

  - `results[].amount` (number, optional)
  Total disputed amount.

  - `results[].reason` (string, optional)
  Human-readable reason for the chargeback, as provided by the payment method or card network.

  - `results[].reason_id` (string, optional)
  Identifier of the chargeback reason.

  - `results[].coverage_applied` (boolean, optional, nullable)
  Indicates whether Mercado Pago applied coverage to the seller. A value of `true` means coverage was applied, so the money is not frozen and the seller is protected by the coverage policy. A value of `false` means coverage was not applied.

  - `results[].coverage_eligible` (boolean, optional)
  Indicates whether the case meets the coverage eligibility criteria based on the payment flow and product classification. A value of `true` means the case is eligible, while `false` means it is not.

  - `results[].documentation_required` (boolean, optional)
  Legacy field. Regardless of whether the returned value is `true` or `false`, always submit supporting documentation to substantiate the chargeback dispute and demonstrate the validity of the sale.

  - `results[].documentation_status` (string, optional)
  Status of the supporting documentation submitted by the seller.
Possible enum values:

  - `pending`
  The supporting documentation has not yet been submitted by the seller.

  - `review_pending`
  The supporting documentation was submitted and is pending review by the Mercado Pago team.

  - `valid`
  The submitted supporting documentation was reviewed and considered valid.

  - `invalid`
  The submitted supporting documentation was reviewed and considered invalid.

  - `not_supplied`
  No supporting documentation was submitted within the established deadline.

  - `not_applicable`
  The API classified supporting documentation as not applicable to this case. This returned status is independent of the legacy `documentation_required` field; submit files when `documentation_status` is `pending`.

  - `results[].documentation` (array, optional)
  List of supporting documentation files already uploaded for the case.

  - `results[].documentation[].type` (string, optional)
  Party responsible for uploading the supporting documentation. The only allowed value is `collector`, used for files uploaded by the seller.
Possible enum values:

  - `collector`
  The only allowed value. Identifies supporting documentation files uploaded by the seller.

  - `results[].documentation[].url` (string, optional)
  URL to access or view the supporting file.

  - `results[].documentation[].description` (string, optional)
  Descriptive text identifying the type of evidence in the supporting file. For example: invoice, shipping proof, screenshot, etc.

  - `results[].documentation[].uuid` (string, optional)
  Unique identifier of the supporting file. Used as the `uuid` parameter in the `GET /v1/chargebacks/documentation/{type}/{uuid}` endpoint to download or render the file.

  - `results[].date_documentation_deadline` (string, optional, nullable)
  Deadline date and time to submit the supporting documentation, in ISO 8601 format. Returns `null` when the API does not provide a deadline.

  - `results[].date_created` (string, optional)
  Date the case was opened in ISO 8601 format.

  - `results[].date_last_updated` (string, optional)
  Date of the last update to the case in ISO 8601 format.

  - `results[].live_mode` (boolean, optional)
  Indicates whether the case corresponds to a production environment. When `true`, the case corresponds to real transactions, not test ones.

## Errors

| Status | Error | Description |
| ------- | ------- | ----------- |
| 400 | invalid_payment_id | The `payment_id` parameter is missing or invalid. Check the notification received for the `chargebacks` topic to obtain the correct ID. |
| 403 | unauthorized_payment_access | The requester is not authorized to query the indicated payment. Only the seller account associated with the payment can perform this query. |
| 500 | internal_error | A generic error occurred. Check the request and try again. |

## Request example

### cURL

```bash
curl -X GET \
  'https://api.mercadopago.com/v1/chargebacks/search?payment_id=<PAYMENT_ID>&offset=<OFFSET>&limit=<LIMIT>' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

## Response example

```json
{
  "paging": {
  "offset": 0,
  "limit": 10,
  "total": 1
  },
  "results": [
  {
  "id": "123456789",
  "payments": [
  987654321
  ],
  "currency": "MXN",
  "amount": "50.00",
  "reason": "unauthorized",
  "reason_id": "6",
  "coverage_applied": true,
  "coverage_eligible": true,
  "documentation_required": true,
  "documentation_status": "pending",
  "documentation": [
  {
  "type": null,
  "url": null,
  "description": null,
  "uuid": null
  }
  ],
  "date_documentation_deadline": "2024-02-15T23:59:59.000-03:00",
  "date_created": "2024-02-01T10:30:00.000-03:00",
  "date_last_updated": "2024-02-03T14:00:00.000-03:00",
  "live_mode": true
  }
  ]
}
```
