<!-- fuente: https://developer.uber.com/docs/eats/guides/errors -->
## Errors

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

The Eats APIs use HTTP response codes to communicate errors. A list of common errors encountered on the platform is listed below. As a general rule of thumb, a 4xx error is an issue on the client side, and a 5xx is an error on the Uber side.

##### HTTP Response Codes

| Error | Code | Message | Transient | Description |
| --- | --- | --- | --- | --- |
| 400 | validation\_failed | Invalid request | No | The input failed validation. This may happen if any of the input fields are not the correct type, or required fields are missing. |
| 403 | user\_not\_allowed | User not allowed to access the store | No | Current user is not allowed to access this store. |
| 403 | user\_not\_allowed | User not allowed to access the order | No | Current user is not allowed to access this order. |
| 403 | resource\_update\_not\_allowed | Updating online\_status of this store is not allowed | No | The store online status strategy is not `external`. |
| 403 | resource\_update\_not\_allowed | Updating auto\_accept\_enabled of this store is not allowed | No | Auto-accept is only configurable by Uber Eats. This setting cannot be updated by API. |
| 404 | resource\_not\_found | Store not found | No | The provided store id does not exist. |
| 404 | resource\_not\_found | Order not found | No | The provided order id does not exist. |
| 409 | resource\_status\_conflict | Order status conflict | No | This usually means you have tried to accept / deny an order that has already been accepted or denied. |
| 500 | internal\_server\_error | Internal Server Error | No | Indicates an internal error on the Uber side. |
| 503 | service\_unavailable | Service Unavailable | Yes | Usually indicates some connectivity issues internal to Uber. |

##### Error Handling

Communicating with remote services or resources, especially over the Internet can be subject to transient failures. A transient failure can include, but is not limited to the following:

-   A temporary loss in network connectivity.
-   A temporary unavailability of a service or data.
-   Service Timeouts.

Failures of this type are not typically long-lasting and if the action that triggered the failure is retried after a reasonable period of time, the subsequent call is likely to succeed.

By default, the Uber API will not retry a failed request. The [HTTP Response Codes](#http-response-codes) may be useful in determining whether a retry is appropriate and how long to wait before attempting the retry.

The list below outlines several strategies that can be performed on transient failures:

-   **Exponential Backoff (Recommended):** Wait a short time before retrying the request, then exponentially increasing the time between each subsequent retry.
-   **Regular Intervals:** Wait the same amount of time between each retry operation
-   **Immediate Retry:** Retry the operation immediately. It should be noted that an immediate retry should only be attempted once, and if additional retries are required that one of the above strategies should be preferred.

An operation that **results in a fatal error should not be retried** as the operation is unlikely to succeed with subsequent attempts.

Retries that are too aggressive can have an adverse effect on the remote service or resource and may present the system from recovering and can result in requests being blocked or throttled.

[

HTTP Response Codes

](#http-response-codes)[

Error Handling

](#error-handling)
