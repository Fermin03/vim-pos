<!-- fuente: https://www.mercadopago.com.mx/developers/en/reference/in-person-payments/point/chargebacks/get-chargeback/get · capturado 2026-10-08 -->

# Get chargeback

This endpoint allows you to retrieve the full details of a chargeback case identified by its `case_id`. The requester must be the seller who owns the case. The response includes the associated payments, disputed amount, reason, coverage information, documentation status, submitted files, and relevant dates. In case of success, the request will return a response with status 200.

**GET** `/v1/chargebacks/{id}`

## Request parameters

### Header

- `X-Caller-Id` (integer, required)
  ID of the authenticated user (`seller ID`) and owner of the requested resource.

### Path

- `id` (string, required)
  Numeric `case_id` of the chargeback case to retrieve.

## Response parameters

- `id` (string, optional)
  Unique identifier of the case.

- `payments` (array, optional)
  IDs of the payments associated with the case. May include multiple payments when they are cart or bundle purchases.

- `currency` (string, optional)
  Currency in which the disputed amount is.

- `amount` (number, optional)
  Total disputed amount.

- `reason` (string, optional)
  Human-readable reason for the chargeback, as provided by the payment method or card network.

- `reason_id` (string, optional)
  Identifier of the chargeback reason.

- `coverage_applied` (boolean, optional, nullable)
  Indicates whether Mercado Pago applied coverage to the seller. A value of `true` means coverage was applied, so the money is not frozen and the seller is protected by the coverage policy. A value of `false` means coverage was not applied.

- `coverage_eligible` (boolean, optional)
  Indicates whether the case meets the coverage eligibility criteria based on the payment flow and product classification. A value of `true` means the case is eligible, while `false` means it is not.

- `documentation_required` (boolean, optional)
  Legacy field. Regardless of whether the returned value is `true` or `false`, always submit supporting documentation to substantiate the chargeback dispute and demonstrate the validity of the sale.

- `documentation_status` (string, optional)
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

- `documentation` (array, optional)
  List of supporting documentation files already uploaded for the case.

  - `documentation[].type` (string, optional)
  Party responsible for uploading the supporting documentation. The only allowed value is `collector`, used for files uploaded by the seller.
Possible enum values:

  - `collector`
  The only allowed value. Identifies supporting documentation files uploaded by the seller.

  - `documentation[].url` (string, optional)
  URL to access or view the supporting file.

  - `documentation[].description` (string, optional)
  Descriptive text identifying the type of evidence in the supporting file. For example: invoice, shipping proof, screenshot, etc.

  - `documentation[].uuid` (string, optional)
  Unique identifier of the supporting file. Used as the `uuid` parameter in the `GET /v1/chargebacks/documentation/{type}/{uuid}` endpoint to download or render the file.

- `date_documentation_deadline` (string, optional, nullable)
  Deadline date and time to submit the supporting documentation, in ISO 8601 format. Returns `null` when the API does not provide a deadline.

- `date_created` (string, optional)
  Date the case was opened in ISO 8601 format.

- `date_last_updated` (string, optional)
  Date of the last update to the case in ISO 8601 format.

- `live_mode` (boolean, optional)
  Indicates whether the case corresponds to a production environment. When `true`, the case corresponds to real transactions, not test ones.

## Errors

| Status | Error | Description |
| ------- | ------- | ----------- |
| 400 | invalid_path_param | One or more parameters provided in the request path are invalid. Please confirm them and provide valid values to try again. |
| 403 | invalid_user_for_operation | The caller does not have permission to access the requested resource (not the owner of the case or supporting file). |
| 404 | chargeback_not_found | The `case_id` of the chargeback is not numeric or does not exist. Check the value and try again. |
| 500 | internal_error | A generic error occurred. Check the request and try again. |

## Request example

### cURL

```bash
curl -X GET \
  'https://api.mercadopago.com/v1/chargebacks/{id}' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

## Response example

```json
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
  "type": "collector",
  "url": "https://storage.mlstatic.com/op/123/456789/comprobante.pdf",
  "description": "Comprobante de envío",
  "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
  ],
  "date_documentation_deadline": "2024-02-15T23:59:59.000-03:00",
  "date_created": "2024-02-01T10:30:00.000-03:00",
  "date_last_updated": "2024-02-03T14:00:00.000-03:00",
  "live_mode": true
}
```
