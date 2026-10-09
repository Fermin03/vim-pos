<!-- fuente: https://www.mercadopago.com.mx/developers/en/reference/in-person-payments/point/chargebacks/upload-supporting-documentation/post · capturado 2026-10-08 -->

# Upload supporting documentation

This endpoint allows you to upload supporting documentation files to dispute a chargeback case. Supported file types: `image/jpeg`, `image/png`, and `application/pdf`. Before uploading documentation, verify the case status with `GET /v1/chargebacks/{id}` to confirm that `documentation_status=pending`, since documentation can only be uploaded once per case. In case of success, the request will return a response with status 200.

**POST** `/v1/chargebacks/{id}/documentation`

## Request parameters

### Header

- `X-Caller-Id` (integer, required)
  ID of the authenticated user (`seller ID`) and owner of the requested resource.

### Path

- `id` (string, required)
  Numeric `case_id` of the chargeback case to upload the supporting documentation for.

## Response parameters

This endpoint has no response body.

## Errors

| Status | Error | Description |
| ------- | ------- | ----------- |
| 400 | missing_required_params | The `case_id` of the chargeback or the `X-Caller-Id` parameter is missing. Resend the request with the required information. |
| 400 | missing_files | No supporting files were sent in the request. Resend the request including the required files. |
| 400 | empty_file | The uploaded supporting file is empty. Resend the request with valid files. |
| 400 | documentation_already_submitted | The case already has supporting documentation submitted (`documentation_status` is not `pending`). Send a request to the retrieval endpoint (`GET /v1/chargebacks/{id}`) to check the file that was already submitted. |
| 403 | invalid_user_for_operation | The caller does not have permission to access the requested resource (not the owner of the case or supporting file). |
| 413 | too_many_files | More than 10 supporting files were sent, exceeding the allowed limit. |
| 413 | file_size_exceeded | The total size of the supporting files exceeds 10 MB, exceeding the allowed limit. |
| 415 | unsupported_file_type | The supporting file format is invalid. Only JPEG, PNG, and PDF files are supported. |
| 500 | internal_error | A generic error occurred. Check the request and try again. |

## Request example

### cURL

```bash
curl -X POST \
  'https://api.mercadopago.com/v1/chargebacks/{id}/documentation' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

## Response example

```json
[
  {
  "type": "collector",
  "url": "https://storage.mlstatic.com/op/123/456789/comprobante.pdf",
  "description": "Chargeback 1",
  "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
]
```
