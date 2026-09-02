<!-- fuente: https://developer.uber.com/docs/eats/references/api/webhooks/orders-release -->
## Order Release

`WEBHOOK: POSThttps://[<YOUR_WEBHOOK_URI>](/dashboard "Click to configure your app's Webhook URI under the Settings section in Developer Dashboard.") event_type: orders.release`

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

This webhook is sent to notify you that an accepted order should be released to the kitchen.

Your service should return an `HTTP 200` response code with an empty response body to acknowledge receipt of the webhook event. If Uber does not receive a 200 acknowledgement response, the webhook event will be resent based on an exponential backoff algorithm (i.e. starting at 1 second after the initial attempt, then 2 seconds, then 4 seconds etc.) until 7 total events were sent without a response.

##### Webhook Headers

Uber will include security headers for all requests made to your webhook URL.

| Header | Description |
| --- | --- |
| `X-Environment` | Indicates if this request is coming from the `production` or `sandbox` API. |
| `X-Uber-Signature` | SHA256 hash of the request body, using the client secret as the key. |

##### Webhook Security

Webhook messages are signed so that your app can verify that the sender is Uber. Webhooks requests contain an `X-Uber-Signature` header. The value of this field is a lowercased hexadecimal HMAC signature of the webhook HTTP request body, using the client secret as a key and SHA256 as the hash function.

Python Example

```
digester = hmac.new(client_secret, webhook_body, hashlib.sha256)
return digester.hexdigest()
```

#### Webhook Event Structure

| Name | Type | Description |
| --- | --- | --- |
| `event_id` | string | Unique event identifier to ensure that events are only digested once. Events are retried if not acknowledged and their delivery is not guaranteed to be in order. |
| `event_time` | integer | Unix timestamp of when the event occurred. |
| `meta` | object | The object containing additional information that is specific to the `event_type`. |
| `meta.user_id` | string | Unique identifier of the location (store\_id) this event was generated for. |
| `meta.resource_id` | string | Unique identifier of the resource this event has been generated for. For the Order API, this ID is equivalent to the `order_id`. |
| `meta.status` | string | The status of the webhook notification. Valid types include `pos`. |
| `resource_href` | string | Contains the full GET endpoint to retrieve the order details. |

##### Example Webhook

```
{
    "event_type": "orders.release",
    "event_id": "c4d2261e-2779-4eb6-beb0-cb41235c751e",
    "event_time": 1427343990,
    "meta": {
        "resource_id": "153dd7f1-339d-4619-940c-418943c14636",
        "status": "pos",
        "user_id": "89dd9741-66b5-4bb4-b216-a813f3b21b4f"
    },
    "resource_href": "https://api.uber.com/v2/eats/order/153dd7f1-339d-4619-940c-418943c14636",
    ...
}
```

[

Webhook Headers

](#webhook-headers)[

Webhook Security

](#webhook-security)[

Webhook Event Structure

](#webhook-event-structure)[

Example Webhook

](#example-webhook)
