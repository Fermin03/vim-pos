<!-- fuente: https://www.mercadopago.com.mx/developers/en/reference/in-person-payments/point/stores/update-store/put · capturado 2026-10-08 -->

# Update store

This endpoint allows for updating the data of a physical store. To use it, you must provide the seller's identification and the branch identification, along with the parameters containing the information you wish to update. You will receive a 200 response as a result of a successful request.

**PUT** `/users/{user_id}/stores/{id}`

## Request parameters

### Path

- `user_id` (string, required)
  The user_id corresponds to the collector_id. It refers to the user_id of the Mercado Pago account that receives the money from sales, that is, the account responsible for collecting the funds.

- `id` (string, required)
  Store creation ID. Upon registering a store, you will receive a corresponding ID. This ID can be used for various operations, including updating the store's data.

- `name` (string, optional)
  Store name.

- `business_hours` (object, optional)
  Business hours. They are divided by day of the week and up to four opening and closing times per day are allowed.

  - `business_hours.monday` (array, optional)
  Monday

  - `business_hours.monday[].open` (string, optional)
  Store opening time on mondays previously defined in the request, for example, 08:00.

  - `business_hours.monday[].close` (string, optional)
  Store closing time on mondays previously defined in the request, for example, at 12:00.

  - `business_hours.tuesday` (array, optional)
  Tuesday

  - `business_hours.tuesday[].open` (string, optional)
  Store opening time on Tuesdays previously defined in the request for example, 09:00.

  - `business_hours.tuesday[].close` (string, optional)
  Store closing time on Tuesdays previously defined in the request, for example, at 18:00.

- `external_id` (string, optional)
  The unique store identifier, set by the integrated system and can contain up to 60 characters.

- `location` (object, optional)
  Store location. It is essential that this field is filled with the accurate location data of the store, as this can prevent issues related to tax collection. Additionally, correct completion ensures that your store has visibility on the map of stores that accept payments through the Mercado Pago app, which can increase your revenue.

  - `location.street_number` (string, optional)
  Street number.

  - `location.street_name` (string, optional)
  Street name.

  - `location.city_name` (string, optional)
  City.

  - `location.state_name` (string, optional)
  State.

  - `location.latitude` (number, optional)
  Latitude.

  - `location.longitude` (number, optional)
  Longitude.

  - `location.reference` (string, optional)
  Landmark of the provided address. For example: Near Mercado Pago.

## Response parameters

- `id` (string, optional)
  Store creation ID. Upon registering a store, you will receive a corresponding ID. This ID can be used for various operations, including updating the store's data.

- `name` (string, optional)
  Store's name.

- `date_creation` (string, optional)
  Store creation date. This field displays the date and time in ISO 8601 format, such as 2024-08-08T19:29:45.019Z.

- `business_hours` (object, optional)
  Business hours. They are divided by day of the week and up to four opening and closing times per day are allowed.

  - `business_hours.monday` (array, optional)
  Monday

  - `business_hours.monday[].open` (string, optional)
  Store opening time on mondays previously defined in the request, for example, 08:00.

  - `business_hours.monday[].close` (string, optional)
  Store closing time on mondays previously defined in the request, for example, at 12:00.

- `location` (object, optional)
  Store location.

  - `location.address_line` (string, optional)
  Field that returns the complete address of the created store.

  - `location.latitude` (number, optional)
  Latitude.

  - `location.longitude` (number, optional)
  Longitude.

  - `location.reference` (string, optional)
  Landmark of the provided address.

- `external_id` (string, optional)
  The unique store identifier, set by the integrated system and can contain up to 60 characters.

- `date_created` (string, optional)
  Store creation date: this field displays the date and time in ISO 8601 format, such as 2024-08-08T19:29:45.019Z.

## Errors

| Status | Error | Description |
| ------- | ------- | ----------- |
| 400 | bad_request | Field description too long.` If you receive this error, check the external_id parameter and ensure it does not exceed the maximum limit of 60 characters. |
| 400 | INVALID_USER_ID | user_id must be number. |
| 400 | UNKNOWN_FIELD | Unknown field. |
| 400 | INVALID_STORE_ID | Invalid store_id. |
| 400 | INVALID_NAME | The `name` field must be string. |
| 400 | INVALID_BUSINESS_HOURS | The `business_hours` field must be a json_object. |
| 400 | INVALID_DAY | The `day` field must be a json_array. |
| 400 | INVALID_LOCATION | The `location` field must be json_object. |
| 400 | INVALID_STREET_NAME | The `street_name` field must be string. |
| 400 | INVALID_STREET_NUMBER | The `street_number` field must be string. |
| 400 | INVALID_CITY_NAME | The `city_name` field must be a string. |
| 400 | INVALID_STATE_NAME | The `state_name` field must be a string. |
| 400 | INVALID_REFERENCE | The `reference` field must be a string. |
| 400 | validation_error | `Monday exceeds the maximum length of 4 for Opening Hours`. Review the `opening_hours` field and ensure it does not exceed the maximum limit of 4 schedules. The day of the week returned in the code will vary according to the day that is exceeding the allowed number of schedules. |
| 403 | Forbidden | `You don't have permission to access the URL on this server`. If you receive this error, check if the store_id used is correct and make a new request. |

## Request example

### cURL

```bash
curl -X PUT \
  'https://api.mercadopago.com/users/{user_id}/stores/{id}' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -d '{
  "name": "Sucursal Instore",
  "business_hours": {
  "monday": [
  {
  "open": "08:00",
  "close": "12:00"
  }
  ],
  "tuesday": [
  {
  "open": "09:00",
  "close": "18:00"
  }
  ]
  },
  "external_id": "SUC001",
  "location": {
  "street_number": "1602",
  "street_name": "Example Street Name.",
  "city_name": "México",
  "state_name": "CDMX",
  "latitude": 27.175193925922862,
  "longitude": 78.04213533235064,
  "reference": "Near to Mercado Pago"
  }
  }'
```

## Response example

```json
{
  "id": 1234567,
  "name": "Store name",
  "date_creation": "2024-08-08T19:29:45.019Z",
  "business_hours": {
  "monday": [
  {
  "open": "08:00",
  "close": "12:00"
  }
  ]
  },
  "location": {
  "address_line": "Example Street Name, 0123, City name, State name.",
  "latitude": 27.175193925922862,
  "longitude": 78.04213533235064,
  "reference": "Near to Mercado Pago"
  },
  "external_id": "SUC002",
  "date_created": "2019-08-08T19:29:45.019Z"
}
```
