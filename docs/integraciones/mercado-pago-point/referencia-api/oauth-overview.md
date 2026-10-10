<!-- fuente: https://www.mercadopago.com.mx/developers/en/reference/authentication/oauth/overview · capturado 2026-10-08 -->

---
product_landing_hero:
 - title: OAuth
 - message: The OAuth API allows your application to obtain and refresh Access Tokens to authenticate API calls to Mercado Pago on behalf of sellers. This reference describes the available endpoint and how to interact with it.
 - info: Looking for more information? [Go to the OAuth documentation](/developers/en/docs/security/oauth)
---

## Available endpoints

The only necessary endpoint for the OAuth integration.

| Operation | Path | Description |
|---|---|---|
| :TagComponent{tag="POST" text="Create and refresh token" href="/developers/en/reference/authentication/oauth/_oauth_token/post" color="green"} | `/oauth/token` | Creates or refreshes an `access_token` from a `grant_type` (`authorization_code`, `refresh_token` or `client_credentials`); returns the token, its expiration, and the associated `refresh_token`. |

<br>
<br>

---
product_landing_how_integrate:
 - title: All set to get started?
 - sub_title: Go to the endpoint and start managing Access Tokens.
 - button_description: Create token
 - button_link: /developers/en/reference/authentication/oauth/_oauth_token/post
---
