<!-- id=1894 path=Integration Guide > Our Authorization API Module -->
## Our Authorization API Module

Our **Authorization API Module** have 2 main functions:

### Get and Refresh the Authtoken

With it, our partners have a way to get and refresh the stores’ token. The `auth_token` is used to authenticate against DiDi’s APIs and once you have this token, it’ll be used in the parameters of all other endpoints.

We recommend implementing an automatic routine to refresh the `auth_token` as seen below to prevent problems with other endpoints, especially when confirming an order.

![auth_token refresh process](https://pt-starimg.didistatic.com/static/starimg/img/1Yz59RuJDT1625873949766.png)

To generate an `auth_token`, retrieve your `app_id`and `app_secret` for your app from your [Application Management](https://developer.didi-food.com/en-US/app/application/statistical). 

### Create a Webpage for Bind/Unbid Stores

With it, you'll create a webpage to ask stores the autorization to add their store to your app. This is useful specially to POS partners to bind/unbind the stores without having to contact DiDi's team and send the store agreement contract.

### APIs and Callbacks

| **Name** | **Type** | **Function** |
| --- | --- | --- |
| `/auth/authtoken/get/` | Endpoint | Get store's `auth_token`|
| `/auth/authtoken/refresh/` | Endpoint | Refresh store's `auth_token`|
| `/auth/authorizationpage/getUrl/` | Endpoint | Generate an URL for self-service store binding |