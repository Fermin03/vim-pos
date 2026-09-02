<!-- fuente: https://developer.uber.com/docs/eats/guides/sandbox -->
## Sandbox & Testing

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

The **Eats Marketplace API Sandbox** uses dedicated testing domains to help you build and test integrations safely without affecting live merchants.

#### Sandbox Domains

Uber Eats provides dedicated sandbox infrastructure with specific domains for testing:

**Testing Applications:**

-   **API Calls:** `https://test-api.uber.com`
-   **Authentication:** `https://sandbox-login.uber.com`
-   **Scopes:** Automatically granted for sandbox domains only

**Production Applications:**

-   **API Calls:** `https://api.uber.com`
-   **Authentication:** `https://auth.uber.com`
-   **Scopes:** Manual approval required

> **Important:** Always match your token domain with your API domain to avoid authentication errors.

#### Quick Setup: Create Your Testing Application

1.  **Create Application** in [Developer Dashboard](https://developer.uber.com/dashboard)
2.  **Select “Eats Marketplace”** as the API suite
3.  **Choose “Testing”** as application type
4.  **Note your credentials** - you’ll use these with sandbox domains

![Application Type Selection](https://tb-static.uber.com/prod/delivery-integrations/Doc-docs-sandbox-testing-selection.png)

**What happens next:**

-   Scopes are automatically granted for sandbox domains only
-   You get access to simulated stores and orders
-   All API calls use the `test-api.uber.com` domain
-   Request test stores from [Integration Tech Support](http://t.uber.com/integration-support)

#### Using the Sandbox Domains

**Critical:** Testing applications must use sandbox domains. Mixing domains will cause authentication failures.

#### 1. Get Your Sandbox Token

Always use `sandbox-login.uber.com` for testing application tokens:

**Example: Requesting an access token for a TEST app**

```
curl -F 'client_id=YOUR_SANDBOX_CLIENT_ID' \
     -F 'client_secret=YOUR_SANDBOX_CLIENT_SECRET' \
     -F 'grant_type=client_credentials' \
     -F 'scope=eats.order' \
     https://sandbox-login.uber.com/oauth/v2/token
```

**Expected Response:**

```
{
  "access_token": "KA.eyJ...",
  "token_type": "Bearer",
  "expires_in": 2592000,
  "scope": "eats.order"
}
```

#### 2. Make Sandbox API Calls

With your sandbox token, use the `test-api.uber.com` domain for all API requests:

```
curl -X GET "https://test-api.uber.com/v1/delivery/orders/{order_id}" \
     -H "Authorization: Bearer YOUR_SANDBOX_ACCESS_TOKEN" \
     -H "Content-Type: application/json"
```

**Domain Mapping:**

-   **Testing:** `sandbox-login.uber.com` → `test-api.uber.com`
-   **Production:** `auth.uber.com` → `api.uber.com`

* * *

### Identifying Your Application Type

Your application-type is showcased in the developer dashboard.

![Application Type Identification](https://tb-static.uber.com/prod/delivery-integrations/Dev-docs-sandbox-image-app-type.png)

_Check your Developer Dashboard to see your application type_

* * *

#### Sandbox vs Production Purposes

-   The Sandbox environment is for API development and testing only.
-   The **Production Validation** process is required for production scopes and merchant-facing operations. This ensures quality, compliance, and readiness before live deployment.
-   **Sandbox access does NOT guarantee production access** - all applications moving to production are reviewed in detail.
-   When your integration is complete, you must create a **PRODUCTION** application in the developer dashboard.

* * *

#### Comprehensive API Testing

**Store Management**

```
# Get store information
curl -H "Authorization: Bearer YOUR_SANDBOX_TOKEN" \
     https://test-api.uber.com/v1/delivery/stores/YOUR_TEST_STORE_ID

# Update store status
curl -X PATCH \
     -H "Authorization: Bearer YOUR_SANDBOX_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"..": ".."}' \
     https://test-api.uber.com/v1/eats/stores/YOUR_TEST_STORE_ID/status
```

**Menu Management**

```
# Upload menu
curl -X POST \
     -H "Authorization: Bearer YOUR_SANDBOX_TOKEN" \
     -H "Content-Type: application/json" \
     -d @menu.json \
     https://test-api.uber.com/v1/delivery/stores/YOUR_TEST_STORE_ID/menus
```

**Order Processing**

```
# Accept order
curl -X POST \
     -H "Authorization: Bearer YOUR_SANDBOX_TOKEN" \
     -H "Content-Type: application/json" \
     https://test-api.uber.com/v1/delivery/orders/ORDER_ID/accept_pos_order
```

#### Webhook Testing

Set up webhook endpoints for comprehensive order flow testing:

```
// Example webhook handler
app.post('/webhook/orders', (req, res) => {
  const { event_type, order } = req.body;

  switch(event_type) {
    case 'orders.notification':
      // Handle new order
      console.log('New order:', order.id);
      break;
    case 'orders.status_changed':
      // Handle status updates
      console.log('Order status changed:', order.current_state);
      break;
  }

  res.status(200).send('OK');
});
```

* * *

#### Troubleshooting Sandbox Issues

**Domain Mismatch Errors (Most Common)**

-   **Wrong:** Using `api.uber.com` with sandbox tokens
-   **Wrong:** Using `auth.uber.com` for testing applications
-   **Correct:** Always use: `sandbox-login.uber.com` → `test-api.uber.com`

**Authentication Failures**

-   Verify credentials are from your TESTING application
-   Check that scopes were automatically granted (they should be)
-   Ensure token hasn’t expired (30-day lifetime)

**Sandbox Data Questions**

-   Request test stores from [Integration Tech Support](http://t.uber.com/integration-support)
-   Data resets periodically - don’t rely on persistent test data
-   All sandbox activity is isolated from production merchants

[

Sandbox Domains

](#sandbox-domains)[

Quick Setup: Create Your Testing Application

](#quick-setup:-create-your-testing-application)[

Using the Sandbox Domains

](#using-the-sandbox-domains)[

1\. Get Your Sandbox Token

](#1.-get-your-sandbox-token)[

2\. Make Sandbox API Calls

](#2.-make-sandbox-api-calls)[

Identifying Your Application Type

](#identifying-your-application-type)[

Sandbox vs Production Purposes

](#sandbox-vs-production-purposes)[

Comprehensive API Testing

](#comprehensive-api-testing)[

Webhook Testing

](#webhook-testing)[

Troubleshooting Sandbox Issues

](#troubleshooting-sandbox-issues)
