<!-- fuente: https://developer.uber.com/docs/eats/guides/order-integration -->
## Order Integration

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

##### Understanding the Order Journey

When a customer places an order on Uber Eats, several steps occur before your system is involved:

-   The customer browses menus, customizes items, and adds them to their cart.
-   Uber calculates pricing, taxes, and fees.
-   Timing estimates are provided based on prep time and other real-time variables.

Uber manages these steps, calculated based on the configuration and real-time factors within our marketplace.

**Your integration begins after checkout.** Once the customer confirms their cart, an order is created and enters the **Orders API lifecycle**. At this point, your integration acts as the bridge between Uber’s platform and the merchant’s in-store operations.

##### Uber Eats Ordering Components

The Uber Eats order process consists of several core components that work together to enable seamless ordering, fulfillment, and delivery.

1.  **Discovery & Shopping** Uber manages feeds, menus, search, and cart building.
    
2.  **Checkout & Orchestration** Uber creates the order, calculates estimates, and dispatches a courier.
    
3.  **Order Integration**
    
    -   **Listen for orders**: Receive a webhook when an order is placed.
    -   **Retrieve order details**: Fetch order information using the provided webhook data.
    -   **Confirm quickly**: Accept or deny the order within the required time window.
    -   **Keep timing accurate**: Set or update ready times for accurate courier and customer arrival.
    -   **Mirror the handoff**: Track courier updates or provide them if the merchant delivers.
    -   **Close the loop**: Reconcile once the order is completed or canceled.

##### Reviewing Order Details

When your integration receives an order webhook, use the `order_id` from the payload to fetch full order details via the **Get Order Details** endpoint. This allows your system to review the order—including items, customer notes, delivery instructions, and timing estimates—before deciding whether to accept, adjust, or deny it.

**Steps:**

1.  **Receive webhook:** Listen for the `order.notifcation` event.
2.  **Extract order ID:** Parse the webhook payload to get the `order_id`.
3.  **Retrieve The Order Details:** Use the [Get Order Details endpoint](/docs/eats/references/api/order_suite#tag/GetOrder/operation/getOrder) with the `order_id`.
4.  **Process response:** Store and process the order data in your system for fulfillment.

**Example flow:**

-   Receive `order.notification` webhook → Extract `order_id` → Call Get Order Details API → Begin order processing

For more details, see the [Order Suite API reference](/docs/eats/references/api/order_suite).

##### Accepting Orders

After successfully retrieving and processing the order details, your integration should accept the order using the **Accept Order** endpoint. This is the standard “happy path”—if the order data is valid and the merchant can fulfill it, respond promptly to confirm acceptance.

-   For delivery orders, Uber dispatches a courier based on the predicted prep time.
-   For pickup orders, customers are notified when the order will be ready.

No further API action is required unless the order is later canceled or fulfillment details change.

##### Adjusting Order Fulfillment

If you are unable to fulfill part or all of an order (for example, an item is out of stock), use the **[Resolve Order Fulfillment Issue endpoint](/docs/eats/references/api/order_suite#tag/ResolveOrderFulfillmentIssue)**. This notifies the customer in the Uber Eats app, allowing them to cancel or modify their order. If the customer accepts the proposed changes, you will receive the `order.fulfillment_issues.resolved` webhook. At that point, fetch the updated order details to proceed with fulfillment.

_Note: Customers can only resolve fulfillment issues through the Uber Eats mobile app (iOS/Android), not via web browsers._

##### Denying Orders

If an order cannot be injected into the POS, deny it via POST Deny Order. Two workflows exist:

1.  **Default**: Orders are immediately canceled and the customer is notified.
2.  **Uber Eats Orders Application**: Denied orders can be manually accepted by staff. If not accepted within 11.5 minutes, the order is canceled.

##### Order Integration Workflow Diagram

The diagram below shows the full Uber Eats order flow — from checkout to completion — and how your integration connects at each step. It covers scheduled orders, fulfillment updates, and both Uber-dispatched and merchant-dispatched deliveries.

#### Testing Orders

To test your integration:

1.  **Customer Setup**: Sign in to [Uber Eats](https://www.ubereats.com) with your test account. Set the delivery address to your test store.
2.  **Store Setup**: Log in to [Uber Eats Orders](https://restaurant-dashboard.uber.com) with test store credentials. Ensure the store is **Open**.
3.  **Place an Order**: Place an order as a customer. No payment or courier is required. The order should appear in Uber Eats Orders and trigger a webhook.
4.  **Check Webhook Receipt**: Your service should receive a webhook similar to the [example webhook](/docs/eats/references/api/order_suite#tag/WebhookEvents/paths/webhookEvents/post). Respond with HTTP `200`.
5.  **Test Accept/Deny**: Use the [Accept Order Endpoint](/docs/eats/references/api/order_suite#tag/AcceptOrder/operation/acceptOrder) and [Deny Order Endpoint](/docs/eats/references/api/order_suite#tag/DenyOrder/operation/DenyOrder) to test both flows.

#### Next Steps

Once testing is complete, finalize your implementation and ensure all Uber Eats Marketplace APIs are working as expected. When ready, see [Going Live](going-live) for production launch steps.

[

Understanding the Order Journey

](#understanding-the-order-journey)[

Uber Eats Ordering Components

](#uber-eats-ordering-components)[

Reviewing Order Details

](#reviewing-order-details)[

Accepting Orders

](#accepting-orders)[

Adjusting Order Fulfillment

](#adjusting-order-fulfillment)[

Denying Orders

](#denying-orders)[

Order Integration Workflow Diagram

](#order-integration-workflow-diagram)[

Testing Orders

](#testing-orders)[

Next Steps

](#next-steps)
