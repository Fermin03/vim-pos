<!-- fuente: https://www.mercadopago.com.mx/developers/en/reference/in-person-payments/point/stores/get-store/get · capturado 2026-10-08 -->

# Get store

This endpoint allows access to all information about a physical establishment using the desired store ID. Upon success, the request will return a status code 200.

**GET** `/stores/{id}`

## Request parameters

### Path

- `id` (string, required)
  Store ID. This number is obtained when creating a store and consolidates all information related to it, such as opening and closing hours, location, and name.

## Response parameters

- `id` (string, optional)
  Store identification number.

- `name` (string, optional)
  Store's name.

- `date_creation` (string, optional)
  Date and time the store was created.

- `business_hours` (object, optional)
  Business hours. They are divided by day of the week and up to four opening and closing times per day are allowed.

  - `business_hours.monday` (array, optional)
  Monday

  - `business_hours.monday[].open` (string, optional)
  Store opening time on mondays. For example, 08:00.

  - `business_hours.monday[].close` (string, optional)
  Store closing time on mondays, for example, at 13:00.

  - `business_hours.tuesday` (array, optional)
  Tuesday

  - `business_hours.tuesday[].open` (string, optional)
  Store opening time on Tuesdays, for example, 09:00.

  - `business_hours.tuesday[].close` (string, optional)
  Store closing time on Tuesdays, for example, 18:00.

  - `business_hours.wednesday` (array, optional)
  Wednesday

  - `business_hours.wednesday[].open` (string, optional)
  Store opening time on Wednesdays, for example, 07:00.

  - `business_hours.wednesday[].close` (string, optional)
  Store closing time on Wednesdays, for example, 10:00.

- `location` (object, optional)
  Store location.

  - `location.address_line` (string, optional)
  Field that returns the complete address of the created store.

  - `location.reference` (string, optional)
  Landmark of the provided address

  - `location.latitude` (number, optional)
  Latitude

  - `location.longitude` (number, optional)
  Longitude

- `external_id` (string, optional)
  Unique store identifier, which is defined by the integrating system and can contain up to 60 characters.

## Errors

| Status | Error | Description |
| ------- | ------- | ----------- |
| 401 | UNAUTHORIZED_SCOPES | `You are not allowed to access this resource`. Please review the `store_id` field and ensure that the information entered is correct and valid. |
| 401 | Unauthorized | `Invalid access token.` Please check if the access token entered in the request is correct. |
| 404 | 404 | `Not-Found. Store xx not found.` Please check the entered store_id and ensure the information is valid. The 'xx' will be replaced with the invalid store_id provided in the request. |

## Request example

### cURL

```bash
curl -X GET \
  'https://api.mercadopago.com/stores/{id}' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

## Response example

```json
{
  "id": 30163646,
  "name": "Sucursal Instore",
  "date_creation": "2024-05-16T14:54:28.573Z",
  "business_hours": {
  "monday": [
  {
  "open": "08:00",
  "close": "13:00"
  }
  ],
  "tuesday": [
  {
  "open": "09:00",
  "close": "18:00"
  }
  ],
  "wednesday": [
  {
  "open": "07:00",
  "close": "10:00"
  }
  ]
  },
  "location": {
  "address_line": "Example Street Name, 0123, City name, State name.",
  "reference": "Near to Mercado Pago",
  "latitude": -23.52613,
  "longitude": -46.76169
  },
  "external_id": "SUC001"
}
```
