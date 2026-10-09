<!-- fuente: https://www.mercadopago.com.mx/developers/en/reference/in-person-payments/point/stores/delete-store/delete · capturado 2026-10-08 -->

# Delete store

This endpoint allows the deletion of a specific physical store, identified by its ID. The successful response of this request will return a status 200.

**DELETE** `/users/{user_id}/stores/{id}`

## Request parameters

### Path

- `user_id` (string, required)
  The user_id corresponds to the collector_id. It refers to the user_id of the Mercado Pago account that receives the money from sales, that is, the account responsible for collecting the funds.

- `id` (string, required)
  Store ID. This number is obtained when creating a store and consolidates all information related to it, such as opening and closing hours, location, and name.

## Response parameters

- `store` (number, optional)
  Store identification number that was deleted.

- `user` (number, optional)
  Number of the user responsible for the deletion of the store.

## Errors

| Status | Error | Description |
| ------- | ------- | ----------- |
| 400 | INVALID_USER_ID | user_id must be a number - Verify that the user_id provided is numeric and try again. |
| 400 | INVALID_STORE_ID | store_id must be a number - Ensure that the store_id entered is numeric and correct any errors. |
| 401 | unauthorized_scopes | `Mismatch between user id '1762651252' and store id '61125074.` This error is displayed when attempting to delete a store belonging to another user. If you encounter this error, verify the `store_id` and ensure it belongs to your user. |
| 403 | Forbidden | `You don't have permission to access the URL on this server`. If you receive this error, check if the store_id used is correct and make a new request. |
| 404 | not_found | `store 6112507 not found.` This error occurs when attempting to delete a store, but the store_id is incorrect. Please review the store_id parameter and ensure that the number entered corresponds to a valid store. |

## Request example

### cURL

```bash
curl -X DELETE \
  'https://api.mercadopago.com/users/{user_id}/stores/{id}' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

## Response example

```json
{
  "store": 1234567,
  "user": 129653108
}
```
