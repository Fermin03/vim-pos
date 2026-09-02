<!-- fuente: https://developer.uber.com/docs/eats/references/api/v2/Menu-refresh-request-webhook -->
## Menu Refresh

`WEBHOOK: POSThttps://[<YOUR_WEBHOOK_URI>](/dashboard "Click to configure your app's Webhook URI under the Settings section in Developer Dashboard.") event_type: store.menu_refresh_request`

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

This webhook is sent to notify you that a menu refresh has been requested by Uber Eats.

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
| `event_type` | string (enum) | The type of the event, e.g. `store.menu_refresh_request`. Always check this field as new event types may be added in the future without notice. |
| `store_id` | string | Unique identifier of the store |
| `partner_store_id` | string | Unique identifier of the store, from partner’s end. |
| `resource_href` | string | Contains the full GET endpoint to retrieve the store details. |
| `webhook_meta.client_id` | string | Unique identifier of the Application this webhook has been generated for (equivalent to ApplicationID). |
| `webhook_meta.webhook_config_id` | string | Unique identifier of the webhook type. |
| `webhook_meta.webhook_msg_timestamp` | integer | Unix timestamp of when the event occurred. |
| `webhook_meta.webhook_msg_uuid` | string | Unique identifier of the webhook event (for tracking purposes). |

##### Example Webhook

```
{
  "event_type": "store.menu_refresh_request",
  "partner_store_id": "123456",
  "resource_href": "https://api.uber.com/v1/eats/stores/66f60075-a9c8-4ef7-9f4a-c7867f448905",
  "store_id": "66f60075-a9c8-4ef7-9f4a-c7867f448905",
  "webhook_meta": {
    "client_id": "_ZIpOrYYqMTBOFy3-ig_pdeRtBosx1DZ",
    "webhook_config_id": "merchant-integration.menu-refresh-request",
    "webhook_msg_timestamp": 1622813397,
    "webhook_msg_uuid": "b2340f4c-6dd7-4d65-a9bc-016631a2a13a"
  }
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
