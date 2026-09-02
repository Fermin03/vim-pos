<!-- fuente: https://developer.uber.com/docs/eats/guides/authentication -->
## Authentication

`POSThttps://auth.uber.com/oauth/v2/token`

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

##### Overview

The Uber Eats API uses OAuth 2.0 for authentication and authorization. Understanding the correct authentication flow is critical for successful integration, as different endpoints require different token types based on their purpose.

**OAuth 2.0 Endpoints**

| Endpoint | URL |
| --- | --- |
| Authorization Endpoint | `https://auth.uber.com/oauth/v2/authorize` |
| Token Endpoint | `https://auth.uber.com/oauth/v2/token` |

##### Authentication Flows

The Eats API uses two distinct OAuth 2.0 grant types depending on the operation:

| Grant Type | Use Case | Token Source | Required For |
| --- | --- | --- | --- |
| `client_credentials` | Regular API operations | App credentials | Store, Menu, Order, and Reporting endpoints |
| `authorization_code` | Store activation | User authorization | Store discovery and integration activation |

**Why Two Different Flows?**

-   **Client Credentials**: Your app operates on stores you’re already connected to using your app’s credentials
-   **Authorization Code**: Merchants must explicitly authorize your app to access their stores through OAuth consent

##### Client Credentials Flow

Use this flow for all regular API operations after your app is connected to a store.

###### Step 1: Generate Token

Retrieve your `client_id` and `client_secret` from the [Developer Dashboard](/dashboard).

```
curl -F "client_secret=$CLIENT_SECRET" \
     -F "client_id=$CLIENT_ID" \
     -F "grant_type=client_credentials" \
     -F "scope=eats.store eats.order" \
     https://auth.uber.com/oauth/v2/token
```

###### Step 2: Use Bearer Token

Include the access token in the Authorization header for API requests:

```
curl -H 'Authorization: Bearer <TOKEN>' \
     https://api.uber.com/v1/eats/stores
```

**Example Response:**

```
{
  "access_token": "KA.ewogICJ2ZXJzaW9uIjogMiwKICAiaWQiOiAiZmFuY3kgc2VlaW5nIHlvdSBoZXJlLCBodHRwOi8vdC51YmVyLmNvbS9kZXYtcGxhdGZvcm0tam9icyIsCiAgImV4cGlyZXNfYXQiOiAxNDk3NzQxNjIyLAogICJwaXBlbGluZV9rZXlfaWQiOiAiZm9vYmFyIiwKICAicGlwZWxpbmVfaWQiOiAxCn0K.9jPtNyS9vHJ9HVmxA4Y6vwIcwv7v1tx1BMYwztpIeID",
  "expires_in": 2592000,
  "token_type": "Bearer",
  "scope": "eats.store eats.order",
  "refresh_token": ""
}
```

**Token Management:**

-   Tokens are valid for 30 days (2,592,000 seconds)
-   Cache and reuse tokens until expiration
-   Rate limit: 100 token requests per hour
-   After 100 tokens, oldest token is invalidated

**Rate Limiting:** Client credentials grant type requests are limited to **100 requests per hour**. After generating **100 tokens** with the client credentials grant type, creating a new token will invalidate the oldest token.

##### Authorization Code Flow

Use this flow only for store discovery and integration activation when merchants authorize your app.

###### Step 1: Redirect for Authorization

Direct merchants to the authorization URL:

```
https://auth.uber.com/oauth/v2/authorize?client_id=<CLIENT_ID>&response_type=code&redirect_uri=<REDIRECT_URI>&scope=eats.pos_provisioning
```

###### Step 2: Exchange Code for Token

After merchant authorization, exchange the code for an access token:

```
curl -F "client_secret=$CLIENT_SECRET" \
     -F "client_id=$CLIENT_ID" \
     -F "grant_type=authorization_code" \
     -F "redirect_uri=$REDIRECT_URI" \
     -F "code=AUTHORIZATION_CODE" \
     https://auth.uber.com/oauth/v2/token
```

###### Step 3: Use for Store Operations

Use this token only for store discovery and activation:

```
curl -H 'Authorization: Bearer <USER_TOKEN>' \
     https://api.uber.com/v1/eats/stores
```

For complete activation workflow, see the [Integration Activation Flows guide](integration-activation-flows).

##### Available Scopes

The following scopes are available for use with the Uber Eats Marketplace APIs. To gain access to scopes in production, your app must first be approved and whitelisted by the Uber Eats team.

Each Eats endpoint requires one of the scopes listed below and the token generated for the scope(s) must be used correspondingly. Multiple scopes can be authorized using the same access token, provided that the **grant type is the same**.

###### Client Credentials Scopes

| Scope | Grant Type | Description |
| --- | --- | --- |
| `eats.store` | `client_credentials` | Indicates a token has permission to update and retrieve store and menu information |
| `eats.store.status.write` | `client_credentials` | Indicates a token has permission to set store availability (pause/unpause stores without changing menu hours) |
| `eats.order` | `client_credentials` | Indicates a token has permission to accept/deny/cancel orders and read v1 orders |
| `eats.store.orders.read` | `client_credentials` | Indicates a token has permission to read v2 orders |
| `eats.report` | `client_credentials` | Indicates a token has permission to generate reports (e.g. transaction reports) for stores |

###### Authorization Code Scopes

| Scope | Grant Type | Description |
| --- | --- | --- |
| `eats.pos_provisioning` | `authorization_code` | Indicates a token has permission to setup/remove POS integration and retrieve stores |

##### Common Issues

**“Invalid token” errors:**

-   Verify you’re using the correct grant type for the endpoint
-   Store activation requires `authorization_code` tokens
-   Regular operations require `client_credentials` tokens

**“Insufficient scope” errors:**

-   Ensure your token includes the required scope for the endpoint
-   Multiple scopes must use the same grant type

**Rate limiting:**

-   Client credentials requests are limited to 100 per hour
-   Cache tokens and reuse until expiration

##### Error Handling

Common authentication errors and their resolutions:

| Error Code | Error | Description | Resolution |
| --- | --- | --- | --- |
| `invalid_request` | Required parameters missing | Required parameters were not provided | Check that all required parameters are included |
| `invalid_client` | Invalid client credentials | The client ID or secret provided is invalid | Verify your credentials in the [Developer Dashboard](/dashboard) |
| `invalid_grant` | Invalid grant type | Grant type must be `authorization_code` or `client_credentials` | Use the correct grant type for your use case |
| `invalid_scope` | Invalid scope | The scope parameter is not valid | Ensure scopes are correctly spelled and available for your grant type |
| `access_denied` | User denied consent | User denied authorization during OAuth flow | User must re-authorize your application |
| `server_error` | Server error | The server returned an unknown error | Retry the request; contact support if persistent |

##### Token Security

**Token Storage:** Use variable-length data types for storing tokens as token lengths may change over time. Never hardcode token lengths or store tokens in client-side code.

**Best Practices:**

-   Store tokens securely on your server
-   Never expose tokens in client-side applications
-   Implement proper token refresh logic
-   Monitor token expiration and refresh proactively
-   Use HTTPS for all API requests
-   Implement proper error handling and retry logic

##### FAQ

**Can I use a user access token for Menu and Order endpoints?**

No. Menu and Order endpoints require an application-generated (`client_credentials`) access token. It is not possible to generate one token with both `eats.pos_provisioning` (`authorization_code` grant type) and `eats.order` (`client_credentials` grant type) scopes.

**Can my access token have multiple scopes?**

Yes, if the scopes have the same grant type. For example, a single token can be generated to retrieve store data (`eats.store`), update store status (`eats.store.status.write`), process orders (`eats.order`), and access reports (`eats.report`).

**How long do tokens last?**

Client credentials tokens are valid for 30 days (2,592,000 seconds). Authorization code tokens follow the same expiration pattern. Always check the `expires_in` field in the response and implement proper token refresh logic.

**What happens when I hit the rate limit?**

When you exceed 100 token requests per hour, you’ll receive `429 Too Many Requests` errors. Additionally, if you have more than 100 active tokens, creating a new token will invalidate the oldest token. To avoid issues, cache and reuse tokens until they expire rather than generating new tokens for each request.

##### Next Steps

-   [Integration Activation Flows](integration-activation-flows) - Complete store activation workflow
-   [Getting Started](getting-started) - Full integration setup process
-   [Store Integration](store-integration) - Managing store data and status

[

Overview

](#overview)[

Authentication Flows

](#authentication-flows)[

Client Credentials Flow

](#client-credentials-flow)[

Step 1: Generate Token

](#step-1:-generate-token)[

Step 2: Use Bearer Token

](#step-2:-use-bearer-token)[

Authorization Code Flow

](#authorization-code-flow)[

Step 1: Redirect for Authorization

](#step-1:-redirect-for-authorization)[

Step 2: Exchange Code for Token

](#step-2:-exchange-code-for-token)[

Step 3: Use for Store Operations

](#step-3:-use-for-store-operations)[

Available Scopes

](#available-scopes)[

Client Credentials Scopes

](#client-credentials-scopes)[

Authorization Code Scopes

](#authorization-code-scopes)[

Common Issues

](#common-issues)[

Error Handling

](#error-handling)[

Token Security

](#token-security)[

FAQ

](#faq)[

Next Steps

](#next-steps)
