<!-- fuente: https://www.mercadopago.com.mx/developers/en/reference/in-person-payments/point/stores/create-store/post · capturado 2026-10-08 -->

# Create store

This endpoint enables the creation of physical stores for selling products or services. Each account can establish multiple stores. A status 200 indicates that the request has been successfully processed.

**POST** `/users/{user_id}/stores`

## Request parameters

### Path

- `user_id` (string, required)
  The user_id corresponds to the collector_id. It refers to the user_id of the Mercado Pago account that receives the money from sales, that is, the account responsible for collecting the funds.

- `name` (string, optional)
  Store name.

- `business_hours` (object, optional)
  Business hours. They are divided by day of the week and up to four opening and closing times per day are allowed.

  - `business_hours.monday` (array, optional)
  Monday.

  - `business_hours.monday[].open` (string, optional)
  Store opening time on mondays. For example, 08:00. This field uses the 24-hour format.

  - `business_hours.monday[].close` (string, optional)
  Store closing time, for example, at 12:00. This field uses the 24-hour format.

  - `business_hours.tuesday` (array, optional)
  Tuesday.

  - `business_hours.tuesday[].open` (string, optional)
  Store opening time on Tuesdays, for example, 09:00. This field uses the 24-hour format.

  - `business_hours.tuesday[].close` (string, optional)
  Store closing time on Tuesdays, for example, 18:00. This field uses the 24-hour format.

- `external_id` (string, optional)
  External identifier of the store for the integrator's system. It can contain any alphanumeric value up to 60 characters, and must be unique for each store.

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

- `date_created` (string, optional)
  Store creation date: this field displays the date and time in ISO 8601 format, such as 2024-08-08T19:29:45.019Z.

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

- `location` (object, optional)
  Location.

  - `location.address_line` (string, optional)
  Field that returns the complete address of the created store.

  - `location.latitude` (number, optional)
  Latitude.

  - `location.longitude` (number, optional)
  Longitude.

  - `location.reference` (string, optional)
  Landmark of the provided address

- `external_id` (string, optional)
  external_id

## Errors

| Status | Error | Description |
| ------- | ------- | ----------- |
| 400 | UNKNOWN_FIELD | Unknown field. |
| 400 | INVALID_NAME | The `name` field must be string - Ensure the `name` value is textual without numeric or special characters. |
| 400 | BAD_REQUEST | Errors caused by inconsistencies in the request information. See below for possible responses. |
| 400 | INVALID_BUSINESS_HOURS | The `business_hours` field must be a json_object - Verify the format and include necessary attributes such as open and close times. |
| 400 | INVALID_DAY | The `day` field must be a json_array - Ensure that the field contains an array of valid day names. |
| 400 | INVALID_LOCATION | The `location` field must be json_object - Check that the location details like latitude and longitude are properly formatted as JSON. |
| 400 | INVALID_STREET_NAME | The `street_name` field must be string - Confirm that the field contains only textual information with no special characters or numbers. |
| 400 | INVALID_STREET_NUMBER | The `street_number` field must be string - Ensure the field contains textual representations of numbers or special characters if needed. |
| 400 | INVALID_CITY_NAME | The `city_name` field must be a string - Verify that the field is correctly filled with city names and contains no numbers or special characters. |
| 400 | INVALID_STATE_NAME | The `state_name` field must be a string - Check that the state names are correctly entered without numeric or special characters. |
| 400 | INVALID_REFERENCE | The `reference` field must be a string - Ensure the field is filled with textual information that aids in identifying the location. |
| 400 | VALIDATION_ERROR | This error is generated due to a fault or absence in a specific field. It can also occur when a required parameter is not provided in the request. Check the 'description' or 'message' associated with the error for more details and proceed with the appropriate correction. |
| 403 | Forbidden | You do not have permission to perform this operation. Please contact an administrator for assistance and make sure that the user_id used is the same as your account. |

## Request example

### cURL

```bash
curl -X POST \
  'https://api.mercadopago.com/users/{user_id}/stores' \
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
  "street_number": "0123",
  "street_name": "Example Street Name.",
  "city_name": "City name.",
  "state_name": "State name.",
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
  "name": "Sucursal Instore",
  "date_created": "2019-08-08T19:29:45.019Z",
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
  "location": {
  "address_line": "Example Street Name, 0123, City name, State name.",
  "latitude": 27.175193925922862,
  "longitude": 78.04213533235064,
  "reference": "Near to Mercado Pago"
  },
  "external_id": "SUC001"
}
```
