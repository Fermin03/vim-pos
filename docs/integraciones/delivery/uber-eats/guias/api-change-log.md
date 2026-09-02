<!-- fuente: https://developer.uber.com/docs/eats/api-change-log -->
## Uber Eats Marketplace API Change Log

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

Keep track of changes and improvements to the Uber Eats APIs.

Uber Eats Marketplace APIs are versioned at the endpoint-level. With the exception of privacy or security fixes, introduction of a backwards-incompatible change will result in the version number of the API being incremented. Backward-incompatible changes will be communicated 90 days in advance so as to not interrupt integrations. A majority of Uber Eats Marketplace API changes are backward-compatible and can be adopted as soon as released.

##### 2026-07-02 Order API: Customer Order Edit Webhook

**Added** Customer Order Edit webhook event for the Order API.

-   **Webhook Added**: [orders.customer\_order\_edit](/docs/eats/references/api/order_suite#tag/Webhooks)
-   **Feature Description**: New `orders.customer_order_edit` webhook event that notifies merchants when a customer edits their order post-checkout. The event is triggered when a customer adds a new item to the cart, updates the quantity of an existing item, removes an item, or updates their replacement preference for an item.
-   **Endpoints Affected**: [Webhooks](/docs/eats/references/api/order_suite#tag/Webhooks)

##### 2026-04-17 Order API: Validate Item Fulfillment

**Added** Validate Item Fulfillment endpoint for the Order API.

-   **Endpoint Added**: [ValidateItemFulfillment](/docs/eats/references/api/order_suite#tag/ValidateItemFulfillment)
-   **Feature Description**: New `POST /v1/delivery/order/{order_id}/validate-item-fulfillment` dry-runs fulfillment payloads before [ResolveOrderFulfillmentIssue](/docs/eats/references/api/order_suite#tag/ResolveOrderFulfillmentIssue). The response body includes a `results` array of validation rows. Each row’s `code` is one of `BARCODE_MATCHED`, `BARCODE_MISMATCH`, or `BARCODE_NOT_FOUND`, and its `level` is one of `ERROR`, `WARN`, or `INFO`. Validation compares scanned barcodes to expected item metadata on the order. For `BARCODE_MISMATCH`, resolution details appear when the scan maps to a different catalog item than expected. `ERROR` means Resolve Fulfillment Issues rejects the same payload; `WARN` means the issue is non-blocking and merchants can still force fulfill; `INFO` means informational feedback (successful validation or notes with severity below `WARN`). On [GetOrder](/docs/eats/references/api/order_suite#tag/GetOrder), cart items include `supported_barcode_types` when available; entries are barcode format types.
-   **Endpoints Affected**: [ValidateItemFulfillment](/docs/eats/references/api/order_suite#tag/ValidateItemFulfillment), [ResolveOrderFulfillmentIssue](/docs/eats/references/api/order_suite#tag/ResolveOrderFulfillmentIssue) and [GetOrder](/docs/eats/references/api/order_suite#tag/GetOrder)

##### 2026-02-05 Order API: Replacement Recommendations and Schema Improvements

**Added** New Replacement Recommendations endpoint and improvements to Order API.

-   **Endpoint Added**: [GetReplacementRecommendations](/docs/eats/references/api/order_suite#tag/GetReplacementRecommendations)
-   **Feature Description**: New endpoint that enables retail merchants to receive up to seven high-confidence replacement recommendations for out-of-stock items. Recommendations are generated using Uber’s machine-learning models, incorporating real-time store availability and historical replacement feedback to help pickers make faster substitution decisions and reduce friction during fulfillment.
-   **Endpoints Affected**: [ResolveOrderFulfillmentIssue](/docs/eats/references/api/order_suite#tag/ResolveOrderFulfillmentIssue)
-   **Added**: `ALTERNATIVE_ITEM` action type - Allows merchant to process a customer’s alternative replacement proposal when the customer does not accept the suggested replacement (REPLACE\_FOR\_ME). This action is available for “Retail” merchants only.

##### [¶](#2026-01-07-menu-api:-adding-new-field-in-menu-price-object-\(put-&-get-endpoints\)) 2026-01-07 Menu API: Adding New field in menu price Object (PUT & GET endpoints)

-   **Added**: `in_store_price` has been added to the request body. With this field, partners can share the item price merchant charges for in-store purchases, excluding any additional merchant discounts.
-   **Added**: `in_store_discounted_price` has been added to the request body. With this field, partners can share the item price merchant charges for in-store purchases, including any additional merchant discounts.

##### 2025-10-22 Order API: Adding Pickup Instructions

-   **Endpoints Affected**: [AcceptOrder](/docs/eats/references/api/order_suite#tag/AcceptOrder) and Previous Version [AcceptOrder](/docs/eats/references/api/v1/post-eats-order-orderid-acceptposorder)
-   **Added**: `order_pickup_instructions` has been added to the request body. With this field, partners can update an individual order’s pickup instructions for the courier.

##### 2025-08-21 Order API: Endpoint Payload Structure Corrections

-   **Endpoints Affected**: [CancelOrder](/docs/eats/references/api/order_suite#tag/CancelOrder)
-   **Changed**: The `CancelOrder` endpoint’s request payload has been updated to correctly use an optional `cancellation_reason` object. Previously, documentation incorrectly showed the cancellation fields (`info`, `type`, and `client_error_code`) as top-level fields.

##### 2025-07-15 Order API: Adding New Field in Promotions Object

-   **Endpoints Affected**: [GetOrder](/docs/eats/references/api/order_suite#tag/GetOrder) and Previous Version [GetOrder](/docs/eats/references/api/v2/order_suite#tag/GetOrder)
-   **Changed**: Added `promotion_uuid` and `promo_funding_split` to the `Promotions` object.

##### 2025-05-30 Order API: Endpoint Structure Corrections

**Changed** Corrected Get Order API Payments Structure

-   **Endpoints Affected**: [GetOrder](/docs/eats/references/api/order_suite#tag/GetOrder)
-   **Changed**: `payment.payment_detail.item_charges.price_breakdown.total.gross` now correctly reflects the response payload.

##### 2024-10-31 Enhanced Cart Item Quantity Representation

**Added** Support for Grocery and Retail replacements.

-   **Endpoints Affected**: [GetOrder](/docs/eats/references/api/order_suite#tag/GetOrder) and [ResolveFulfillmentIssues](/docs/eats/references/api/order_suite#tag//ResolveOrderFulfillmentIssue)
-   **Feature Description**: This update introduces a new issue type `FOUND_ITEM` as well as `in_sellable_unit` and `in_priceable_unit` properties within the RFF and GET order details payload. These additions enable merchants to distinguish between customer-facing quantities and store priceable units, enhancing accuracy and flexibility in inventory and pricing management.
    -   **`FOUND_ITEM`** - Item was found and in enough quantity to fulfill the order
    -   **`in_sellable_unit`** - Reflects the quantity as displayed to customers, with detailed properties for measurement types and units (e.g., Kg, Lb, Un).
    -   **`in_priceable_unit`** - Represents the store’s priceable unit for the item, which may differ from customer-facing quantities for optimized inventory tracking and pricing.

##### 2024-10-22 Order API: Replacement, Tracking & Approvals

**Added** Replacement, Tracking & Approvals (RT&A) support for Grocery and Retail merchants.

-   **Endpoints Affected**: [GetOrder](/docs/eats/references/api/order_suite#tag/GetOrder) and [ResolveFulfillmentIssues](/docs/eats/references/api/order_suite#tag//ResolveOrderFulfillmentIssue)
-   **Required**: To gain access to the “Replacement, Tracking & Approvals” feature (RT&A), your app must first be approved and whitelisted by the Uber Eats team.
-   **Feature Description**: This feature allows customers to approve or reject replacements proposed by merchants when original items are out of stock, reducing dissatisfaction with unexpected substitutions. Once the customer responds, merchants can view the response and take necessary actions, such as removing the item or proposing a new replacement. Merchants with RT&A enabled can trigger this flow by sending action\_type: `REPLACE_FOR_ME` when resolving fulfillment issues.

##### 2024-10-14 Order API: Dispatch Multiple Courier

**Added** Dispatch Multiple Courier Endpoint.

-   **Endpoint Added**: [UpdateDeliveryPartnerCount](/docs/eats/references/api/delivery_partner_suite#tag/UpdateDeliveryPartnerCount)
-   **Required Scope**: `delivery.multiple.courier`. To gain access to the required scope, your app must first be approved and whitelisted by the Uber Eats team.
-   **Feature Description**: Disptach Multi-Courier (DMC) is a feature designed to support merchants, such as restaurants and grocery stores, when they have large orders that exceed the carrying capacity of a single courier. With DMC, merchants can request between 2 to 4 couriers, and in exceptional cases, up to 5 couriers.

##### 2024-09-16 Order API: Extended Resolve Fulfillment Issues Support

**Added** Support for Grocery and Retail replacements.

-   **Endpoints Affected**: [GetOrder](/docs/eats/references/api/order_suite#tag/GetOrder) and [ResolveFulfillmentIssues](/docs/eats/references/api/order_suite#tag//ResolveOrderFulfillmentIssue)
-   **Feature Description**: A new enum `action_type` has been added for Grocery and Retail merchants to resolve order’s fulfillment issues:
    -   **`SUBSTITUTE_ME`** - Allows merchant to replace an item with customer’s specific replacement preference. This action should only be used when the customer’s preferred action is `SUBSTITUTE_ME` and it’s available for “Retail” merchants only.
    -   **`REPLACE_FOR_ME`** - Allows merchant to choose a replacement to send to the customers. This action is available for “Retail” merchants only.
    -   **`REMOVE_ITEM`** - Allows merchant to remove an item if it’s unavailable. This action is available for “Retail” merchants only.

##### 2024-08-21 Order API: Addition of BYOC Order Tracking Fields in [Get Order Details](/docs/eats/references/api/order_suite#tag/GetOrder/operation/getOrder)

**Added** New field in GET Order Details payload.

-   **Added**: `order_tracking_metadata` – Field to store order tracking metadata for BYOC orders. This is only populated when a merchant is set to handle Bring-Your-Own-Courier (“BYOC”) orders. For all other fulfillment types, like “DELIVERY\_BY\_UBER”, this object is omitted.
-   **Feature Description**: Developers are expected to generate a QR code from the URL provided in the field, enabling the merchant’s delivery couriers to scan the QR code and seamlessly integrate with the Uber Driver app. This allows them to provide real-time delivery location updates directly to the customer as they complete the delivery.

##### 2024-05-27 Outage Mitigation Enhancements in Store Status API

**Endpoint Changes:**

-   **Endpoints Affected**: `GetStoreStatus`, `GetStoreDetails`, `GetStore` ([Store API Suite](/docs/eats/references/api/store_suite) & [Previous Store Status API](/docs/eats/references/api/v1/get-eats-stores-storeid-status))
-   **Enhancement Description**: A new enum, `INCIDENT_DETECTED_ON_ORDER_MANAGEMENT_APPLICATION`, has been added to the offline\_reason\_metadata field. This update prevents locations from resuming operations via SetStoreStatus during outages detected by Uber in the order fulfillment application. It is critical to ensure that your developer application includes valid user email addresses to maintain communication with Uber during potential service disruptions.

**Endpoint Behavioral Change:**

-   **Error Handling** If an attempt is made to set online a store during an active outage or severe degradation detected by Uber, the API will respond with:
    -   **Status Code:** `400 - Bad Request`
    -   **Error Message:** `"Uber has detected your order fulfillment application is experiencing an outage. Store status cannot be updated at this time."`

##### 2024-03-13 Reporting API: Introduction of constraints on request timerange

Introduced specific constraints on the permissible time ranges for a reporting request. These include both range and lookback periods applicable to various report types. For comprehensive information about these constraints, please refer to the Request Constraints section under the [Reporting API](/docs/eats/references/api/v1/post-eats-report) documentation.

##### 2024-02-28 Public Postman Workspace

Uber’s Eats Marketplace APIs are available at [https://www.postman.com/uber](https://www.postman.com/uber).

The intent of this workspace is to facilitate the sharing of request examples and use-cases. If you wish to suggest any additions, we welcome inputs from our community: [https://t.uber.com/integration-support](https://t.uber.com/integration-support).

[![Run In Postman](https://run.pstmn.io/button.svg)](https://app.getpostman.com/run-collection/6384856-f96487fc-70ad-4971-acd0-a987f613d8b8?action=collection%2Ffork&source=rip_markdown&collection-url=entityId%3D6384856-f96487fc-70ad-4971-acd0-a987f613d8b8%26entityType%3Dcollection%26workspaceId%3De5995580-1109-4772-a883-92e9531beae5)

##### 2024-02-06 New Uber Eats Marketplace Promotions API Suite

[Promotions API Suite](/docs/eats/references/api/promotions_suite)

Uber’s new Promotions API allows storefronts to read, create and delete promotions autonomously.

**Features:**

-   **Create Promotion:** Introduces the ability to create promotions for stores.
-   **Revoke Promotion:** Allows revoking a promotion by specifying its ID.
-   **Get Promotion:** Retrieves details of a single promotion by specifying its ID.
-   **Get Promotions:** Provides a list of all promotions on a store, filtered by state and time range.

##### 2024-02-05 Enhanced Integration Configuration API Suite

[Integration Configuration API Suite](/docs/eats/references/api/integration_activation_suite)

Uber’s Integration Configuration APIs have been updated to enable versioning configuration and additional store-level configurations for best management of store configurations within Uber.

**New Features Include**

-   **Webhook API Version** for setting version for webhook notifications. Note that you must set the webhooks version to “1.0” if you are using Uber’s updated [Order API Suite](/docs/eats/references/api/order_suite).
-   **Manual Acceptance** enabling merchants to handle acceptance on our Uber Eats Order software in conjuction with their integration.
-   **Improved Webhook Management** enabling application to toggle webhooks based on location.

##### 2023-09-18 New Order & Store API Suites

[Order API Suite](/docs/eats/references/api/order_suite) - [Store API Suite](/docs/eats/references/api/store_suite)

All our new features can be enabled via manual requests to our Eats Partner Tech Support teams. Please fill out a [Tech Support Request](https://docs.google.com/forms/d/e/1FAIpQLSf0Ais6oU-yeLqHf9AAD6yUvLZ9KTfyYchHjWtdr6ZZnoWQWQ/viewform). In coming weeks, we will enable methods for developers to use these methods via our Integration APIs.

At Uber, our relentless pursuit to provide superior services and tools for our partners is at the heart of our operations. With this in mind, we are thrilled to announce the forthcoming release of our new Store and Order Management API suites.

This significant advancement is a strategic initiative to synchronize our support methods and better equip your external platforms to handle the needs of our shared platform users. By aligning the capabilities of our merchant live order fulfillment application (Uber Eats Orders Android / iOS) with our API suites, we aim to provide you with an enhanced, efficient, and streamlined toolset that mirrors our in-house application functionalities. We believe this will empower you with more robust tools to innovate and grow with our platform.

**New Features include**

-   **Schedule Order Webhook** for additional notification at time of order placement.
-   **Adjust Order Fulfillment** Endpoint and Webhook to enable adjustment of orders with your customers. `POST Resolve Fulfillment Issues` & `order.fulfillment_issues.resolved`.
-   **Store Status Webhook** notifications from Uber when a store’s status has been adjusted.

##### 2022-03-25 **Order API:** Addition of Tax Reporting fields in [Get Order Details](api/v2/get-eats-order-orderid)

These fields are gated behind an allowlist. Please fill out a [Tech Support Request](https://docs.google.com/forms/d/e/1FAIpQLSf0Ais6oU-yeLqHf9AAD6yUvLZ9KTfyYchHjWtdr6ZZnoWQWQ/viewform) if you wish to receive these fields.

**Added** New fields in order payload taxReporting with tax detail breakdown

-   **Tax Location ID** for the **Eater** and **Store**
-   **Tax Labels** for each item in the **Cart**
-   **Tax Reporting** structure in **Accounting**

##### 2022-01-08 **Integration API:** Enhancements and rebranding of [Integration Config API](/docs/eats/references/api/integration_activation_suite)

These fields are gated behind an allowlist. Please fill out a [Tech Support Request](https://docs.google.com/forms/d/e/1FAIpQLSf0Ais6oU-yeLqHf9AAD6yUvLZ9KTfyYchHjWtdr6ZZnoWQWQ/viewform) if you wish to receive these fields.

In an effort to consolidate and standardize external integration metadata and configurations, Uber is enabling new fields to fetch application specific metadata via the `GET` /`pos_data` endpoint and update it using the `PATCH` & `POST` /`pos_data` endpoints. For ease-of-use, the individual and paging `GET` /`stores` endpoint(s) will now also include `pos_data` as a store sub-field.

**Activate and Update Integration Details**

-   **Added** `is_order_manager` – set this flag to true if you want to nominate your app for managing the core order workflow. The order manager app is responsible for accepting; rejecting; or canceling orders on behalf of the merchant. Most apps will be required to perform follow-up actions to complete the process: you must listen and respond to the `store.provisioned` webhook. As there can only be one order manager, if your app is eventually promoted, any existing order manager app will be demoted. Note: you should not request this flag if your app is passively observing store and order activity.
-   **Added** `integrator_store_id` – developer’s unique store-specific ID for reference.
-   **Added** `integrator_brand_id` – developer’s unique brand-specific ID for reference.
-   **Changed** name of `partner_store_id` to merchant\_store\_id in Activate Integration endpoint
-   **Changed** name of `pos_integration_enabled` to integration\_enabled in Get Integration Details and Update Integration Details endpoints
-   **Deprecated** `pos_integration_enabled` field in Activate Integration

**Get Order Details**

-   **Added** `order_manager_client_id` – order manager of the order. This client ID is the only client ID that can accept the orders. If you are not the Order Manager, your client ID is not responsible for accepting, denying, or canceling the order.
-   **Added** `integrator_store_id` – developer’s unique store-specific ID for reference.
-   **Added** `integrator_brand_id` – developer’s unique brand-specific ID for reference.
-   **Added** `merchant_store_id` – merchant unique store-specific ID for reference.

[

2026-07-02 Order API: Customer Order Edit Webhook

](#2026-07-02-order-api:-customer-order-edit-webhook)[

2026-04-17 Order API: Validate Item Fulfillment

](#2026-04-17-order-api:-validate-item-fulfillment)[

2026-02-05 Order API: Replacement Recommendations and Schema Improvements

](#2026-02-05-order-api:-replacement-recommendations-and-schema-improvements)[

2026-01-07 Menu API: Adding New field in menu price Object (PUT & GET endpoints)

](#2026-01-07-menu-api:-adding-new-field-in-menu-price-object-\(put-&-get-endpoints\))[

2025-10-22 Order API: Adding Pickup Instructions

](#2025-10-22-order-api:-adding-pickup-instructions)[

2025-08-21 Order API: Endpoint Payload Structure Corrections

](#2025-08-21-order-api:-endpoint-payload-structure-corrections)[

2025-07-15 Order API: Adding New Field in Promotions Object

](#2025-07-15-order-api:-adding-new-field-in-promotions-object)[

2025-05-30 Order API: Endpoint Structure Corrections

](#2025-05-30-order-api:-endpoint-structure-corrections)[

2024-10-31 Enhanced Cart Item Quantity Representation

](#2024-10-31-enhanced-cart-item-quantity-representation)[

2024-10-22 Order API: Replacement, Tracking & Approvals

](#2024-10-22-order-api:-replacement,-tracking-&-approvals)[

2024-10-14 Order API: Dispatch Multiple Courier

](#2024-10-14-order-api:-dispatch-multiple-courier)[

2024-09-16 Order API: Extended Resolve Fulfillment Issues Support

](#2024-09-16-order-api:-extended-resolve-fulfillment-issues-support)[

2024-08-21 Order API: Addition of BYOC Order Tracking Fields in Get Order Details

](#2024-08-21-order-api:-addition-of-byoc-order-tracking-fields-in-get-order-details)[

2024-05-27 Outage Mitigation Enhancements in Store Status API

](#2024-05-27-outage-mitigation-enhancements-in-store-status-api)[

2024-03-13 Reporting API: Introduction of constraints on request timerange

](#2024-03-13-reporting-api:-introduction-of-constraints-on-request-timerange)[

2024-02-28 Public Postman Workspace

](#2024-02-28-public-postman-workspace)[

2024-02-06 New Uber Eats Marketplace Promotions API Suite

](#2024-02-06-new-uber-eats-marketplace-promotions-api-suite)[

2024-02-05 Enhanced Integration Configuration API Suite

](#2024-02-05-enhanced-integration-configuration-api-suite)[

2023-09-18 New Order & Store API Suites

](#2023-09-18-new-order-&-store-api-suites)[

2022-03-25 Order API: Addition of Tax Reporting fields in Get Order Details

](#2022-03-25-order-api:-addition-of-tax-reporting-fields-in-get-order-details)[

2022-01-08 Integration API: Enhancements and rebranding of Integration Config API

](#2022-01-08-integration-api:-enhancements-and-rebranding-of-integration-config-api)
