<!-- fuente: https://developer.uber.com/docs/eats/guides/integration-activation-flows -->
## Integration Configuration Flows

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

##### Overview

Uber Eats provides merchants with multiple mechanisms for activating and configuring their live production stores against a given app integration.

1.  During onboarding, Uber may pre-integrate a store with integrator mapping details.
2.  Once live, the merchant should contact Uber technical support teams through our [Tech Support Form](http://t.uber.com/integration-support)
3.  Through an integration partner’s own website, by merchant’s authorizing you app with [OAuth login flow](/docs/riders/guides/authentication/user-access-token), allowing you to call the [`GET /stores`](/docs/eats/references/api/store_suite) and [`POST /pos_data`](/docs/eats/references/api/integration_activation_suite) endpoints. See details below.

In each case, apps will be be notified of any initial and subsequent changes to their store integration status via the [`store.provisioned`](/docs/eats/guides/webhooks) webhook. To provide a cohesive merchant experience, you should listen and respond to these webhooks. This is especially important if your app is responsible for core order workflow management (accepting; rejecting; or cancelling orders) as you may be requested to do follow-up actions (e.g. upload a menu).

If the integration details are wrong, or your integration is unable to operate the store, you should modify or deactivate the integration via [`PATCH /pos_data`](/docs/eats/references/api/integration_activation_suite). Should your app ever be deactivated from a store, you will receive a [`store.deprovisioned`](/docs/eats/guides/webhooks) webhook.

Once an app is activated against a given store, its `client_credentials` access token(s) will be able to call most APIs; and it will start to receive webhook notifications related to the store.

Using [`GET /pos_data`](/docs/eats/references/api/integration_activation_suite); [`PATCH /pos_data`](/docs/eats/references/api/integration_activation_suite); and [`POST /pos_data`](/docs/eats/references/api/integration_activation_suite) endpoints, integration partners can read and write their ID and configuration data against each store to facilitate mappings and debugging. For convenience, a subset of this integrator store data is also available when fetching or enumerating store details via the [`GET /stores`](/docs/eats/references/api/store_suite) endpoints.

##### Triggering Activation From 3rd Party Workflow

-   **Authorization**  
    Developers can redirect users to Uber’s [OAuth login flow](/docs/riders/guides/authentication/user-access-token), temporarily authorizing your app to access their stores.
-   **Retrieve Stores**  
    Upon authorization, developer can retrieve all stores associated to the authorizing merchant via [`GET /stores`](/docs/eats/references/api/store_suite). This call returns Uber’s unique identifier and store location data. Developer must map Uber’s unique ID to correct stores using the location data. External store ID can be arbitrary and should not be used as a sole matchpoint.
-   **Activation**  
    Developers can activate their app against a store the [`POST /pos_data`](/docs/eats/references/api/integration_activation_suite) endpoint using the merchant user’s access token. This grants your app with perpetual access to the store.
-   **Deactivating**  
    Developers can temporarily de-activate their app by setting `integration_enabled` to `false` with the [`PATCH /pos_data`](/docs/eats/references/api/integration_activation_suite); or more permanently revoke integration by calling the [`DELETE /pos_data`](/docs/eats/references/api/integration_activation_suite) endpoints.

###### Merchant Authentication Workflow

###### Third-Party Activation Workflow

###### FAQs

**My token is not authorized for endpoints?**

The user access token (`authorization_code` grant type) is active for endpoints below:

-   [`GET /stores`](/docs/eats/references/api/store_suite)
-   [`POST /pos_data`](/docs/eats/references/api/integration_activation_suite)
-   [`DELETE /pos_data`](/docs/eats/references/api/integration_activation_suite)

Once a store is provisioned to a developer account via `POST /pos_data`, the developer will have access to the store using developer generated access token (`client_credentials` grant type). Developers should only use the user generated token when retrieving, provisioning or de-provisioning a merchant location.

**Merchant is ready to provision the location but not ready to go live in the marketplace?**

The [Set Restaurant Status](/docs/eats/api/v1/post-eats-store-storeid-status) endpoint will enable you to pause the location so it does not appear within the Uber Eats marketplace. When the location is ready to launch, set restaurant status to `ONLINE`.

##### Next Steps

Review the [Store Integration guide](store-integration).

[

Overview

](#overview)[

Triggering Activation From 3rd Party Workflow

](#triggering-activation-from-3rd-party-workflow)[

Merchant Authentication Workflow

](#merchant-authentication-workflow)[

Third-Party Activation Workflow

](#third-party-activation-workflow)[

FAQs

](#faqs)[

Next Steps

](#next-steps)
