<!-- fuente: https://developer.uber.com/docs/eats/references/api/v1/get-eats-stores -->
## List All Stores

`GEThttps://api.uber.com/v1/eats/stores`

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

This endpoint allows a partner to enumerate the stores that this access token is authorized against. The behavior of this endpoint changes depending on the type of access token that it is called with:

-   If the call is made with a user `authorization_code` access-token (e.g. `eats.pos_provisioning`), this will retrieve all stores authorized to that user.
-   If called with a `client_credentials` access token (e.g. `eats.store` scope), this will retrieve all stores authorized to the app.

Some users or applications might have access to 10,000s of store(s). As such, we highly recommend requesting payload compression on this endpoint.

##### Encoding

The response payload for this endpoint may be very large. We highly recommend the use of a standard HTTP compression algorithm to optimise bandwidth usage and processing time. To opt-in, please add the following header:

| Header | Description |
| --- | --- |
| `Accept-Encoding` | Contains the compression algorithm used to compress the request payload. Compression algorithms currently supported: `gzip`. |

##### Authorization

OAuth 2.0 Bearer token with at least one of the `eats.store`; `eats.pos_provisioning` scopes. For more information, see [User Access Token Authentication](/docs/riders/guides/authentication/user-access-token).

##### Query Params

| Name | Type | Description |
| --- | --- | --- |
| `limit` | `int` | _(optional)_ The maximum number of stores that appear per page. (Default 50) |
| `start_key` | `string` | _(optional)_ Key used for requesting a specific page for a list of stores. The `next_key` in the response is used to retrieve the next page. |

##### Example Request

Try It Replace the token in the below request to use it a terminal.

```
curl -X GET \
  -H "authorization: Bearer $UBER_TOKEN" \
  'https://api.uber.com/v1/eats/stores?limit=10'
```

##### Response Body Parameters

| Name | Type | Description |
| --- | --- | --- |
| `next_key` | `string` | Key used to request the next page of results. An empty string; missing; or `null` value indicates there are no more records to paginate. |
| `stores` | `array` | An array of all the stores associated to Merchant Access token. See the object definition for each store in [GET /v1/eats/stores/{store\_id}](/docs/eats/references/api/v1/eats-stores-store_id-get) |

##### Example Response

```
{
  "next_key": "Mw==",
  "stores": [
    {
      "name": "Sushi Sushi Sushi",
      "store_id": "7e973b58-40b7-4bd8-b01c-c7d1cbd194f6",
      "location": {
        "address": "636 W 28th Street",
        "address_2": "Floor 3",
        "city": "New York",
        "country": "US",
        "postal_code": "10001",
        "state": "NY",
        "latitude": 40.7527198,
        "longitude": -74.00635
      },
      "contact_emails": [
        "owner@example.com",
        "announcements+uber@example.com",
        "store-east@example.com"
      ],
      "raw_hero_url": "https://www.example.com/hero_url_east.png",
      "price_bucket": "$$$",
      "avg_prep_time": 5,
      "status": "active",
      "merchant_store_id": "541324",
      "timezone": "America/New_York",
      "web_url": "https://www.ubereats.com/new-york/sushi-sushi-sushi",
      "pos_data": {
        "integration_enabled": true,
        "order_manager_client_id": "XxXxXxXxXxXxXxXxXxXxX",
        "integrator_store_id": "mypos-sushi3-541324",
        "integrator_brand_id": "sushi3",
        "store_configuration_data": "{\"hideMenuItems\": [\"salmon\", \"yellowtail\"]}",
        "is_order_manager_pending": true
      }
    },
    {
      "name": "Sushi Sushi Sushi",
      "store_id": "d8ce1955-d78a-469b-91a4-01f0b23f9213",
      "location": {
        "address": "1455 Market Street",
        "address_2": "Floor 4",
        "city": "San Francisco",
        "country": "US",
        "postal_code": "94103",
        "state": "CA",
        "latitude": 37.775232,
        "longitude": -122.417528
      },
      "contact_emails": [
        "owner@example.com",
        "announcements+uber@example.com",
        "store-west@example.com"
      ],
      "raw_hero_url": "https://www.example.com/hero_url_west.png",
      "price_bucket": "$$",
      "avg_prep_time": 10,
      "status": "active",
      "merchant_store_id": "786541",
      "timezone": "America/Los_Angeles",
      "web_url": "https://www.ubereats.com/san-francisco/sushi-sushi-sushi",
      "pos_data": {
        "integration_enabled": true,
        "order_manager_client_id": "XxXxXxXxXxXxXxXxXxXxX",
        "integrator_store_id": "mypos-sushi3-786541",
        "integrator_brand_id": "sushi3",
        "store_configuration_data": "{\"hideMenuItems\": [\"tuna\"]}"
      }
    }
  ]
}
```

[

Encoding

](#encoding)[

Authorization

](#authorization)[

Query Params

](#query-params)[

Example Request

](#example-request)[

Response Body Parameters

](#response-body-parameters)[

Example Response

](#example-response)
