<!-- fuente: https://developer.uber.com/docs/eats/quality-and-performance -->
## Quality & Performance Standards

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

To maintain a great customer experience for merchant integrations utilizing Uber Eats Marketplace APIs, we require our partners to adhere to specific quality and performance standards.

These standards are subject to adjustment at any time and a failure to adhere to or meet these standards may result in temporarily or permanently revoked API access and/or removal or disabling of merchant stores.

#### Quality Standards

Integration quality is essential to the Eats marketplace as it allows partners to take full advantage of the suite of Eats workflows and integration features and ensures Eaters have a great experience. As new workflows/features are amended or added, partners will be expected to support and incorporate these changes into their integrations.

The Uber API is constantly being worked on to add features, make improvements, and fix bugs. This means that you should expect changes to be introduced and documented. When a significant change is made to an endpoint, the version number used in the path of the resource being requested will be increased.

However, some changes or additions are backwards-compatible and your applications should be flexible enough to handle them. These include:

-   Adding new attributes to the response of an existing endpoint
-   Changing the order of attributes of responses (JSON by definition is an object of unordered key/value pairs)

##### Order & Store API Integrations

All integrations that handle order or store workflows must meet the following requirements to ensure correct order processing, fulfillment, and store operations.

**Retail partners must meet all general requirements and recommendations below, in addition to the retailer-specific requirements and recommendations called out in the sections labeled “for retailers.”**

###### Required

-   Support integration management endpoints, including [Activate Integration](/docs/eats/references/api/integration_activation_suite#tag/Integration-Activation), [Retrieve Integration Config](/docs/eats/references/api/integration_activation_suite#tag/Retrieve-Integration-Config), [Update Integration](/docs/eats/references/api/integration_activation_suite#tag/Update-Integration-Config), and [Remove Integration](/docs/eats/references/api/integration_activation_suite#tag/Remove-Integration-Config).
-   Support for order notification and order failure [webhooks](guides/webhooks).
-   Adherence to the Eats [order integration flow](guides/order-integration), including making explicit POST Accept, Deny, and Cancel requests with supported reason types.
-   Support for store management endpoints, including [Retrieve Store Status](./references/api/store_suite#tag/GetStoreStatus), [Set Store Status](./references/api/store_suite#tag/SetStoreStatus), and [Update Store Prep Time](./references/api/store_suite#tag/SetPrepTime).
-   Rejecting orders if allergens/special instructions are provided and they cannot be relayed to the POS.

###### Required for retailers

-   Adherence to the Retail [Order Fulfillment API Guide](guides/retail-order-fulfillment) for replacements and approval tracking, including marking items as found, proposing substitutions, respecting customer replacement preferences, receiving real-time customer responses, and finalizing fulfillment by marking the order as ready.
-   Support for the [Replacement Recommendation](./references/api/order_suite#tag/GetReplacementRecommendations) endpoint for suggesting replacements to pickers.
-   Support for the [Update Delivery Partner Count](./references/api/delivery_partner_suite#tag/UpdateDeliveryPartnerCount) endpoint for large orders requiring more than one courier.

###### Recommended

-   Support for [Disposable Items](./references/api/order_suite#tag/GetOrder).
-   Support for [Allergens](./references/api/order_suite#tag/GetOrder).
-   Support for item-level special instructions.
-   Support for cart-level (order-level) special instructions.
-   Support for all available endpoints in the Store and Order API suites.

###### Recommended for retailers

-   Support for handling price-by-weight products across all applicable endpoints, including order details ingestion and found item actions in the Resolve Fulfillment APIs, for items sold by unit or by weight.

##### Menu API Integrations

All integrations handling Store or Menu management should meet the following standards.

###### Required

Full support of the Menu API† where the partner has the ability to make programmatic updates to Eats menus including but not limited to the following fields:

-   Accurate Item-Level/Order-Level Special Instruction Support Flags
-   Tax Categories for Items (where applicable)
-   Store-level Tax Area ID (zip +4) (where applicable)

†Support for all V2 Menu API Suite endpoints is required.

###### Recommended

-   [Restaurant Status](./references/api/store_suite#tag/SetStoreStatus)
-   Menu Image URLs
-   Out of Stock (OOS) Item Adjustments

#### Performance Standards

Integrations that support live marketplace stores must meet certain performance criteria in order to remain active on Eats. These criteria include a baseline **injection success rate** that will be monitored daily and shared with mutual and prospective customers. Once integration stability is confirmed, this reporting may be configured for a weekly cadence.

**Injection Success Rate:** 99.9%  
_(No. of Accepted Orders / Total Submitted Orders)_

Integrations that fail to meet a 99% injection success rate can be subject to revoked API access and/or removal or disabling of restaurant stores from the Eats marketplace. The degree of API access limitation will be determined by:

1.  Magnitude of the difference between the expected and actual performance criteria.
2.  Amount of time the expected performance criteria rate wasn’t met.

Any review or evaluation of a partner’s performance metrics will take into consideration the products and workflows used in the integration.

[

Quality Standards

](#quality-standards)[

Order & Store API Integrations

](#order-&-store-api-integrations)[

Required

](#required)[

Required for retailers

](#required-for-retailers)[

Recommended

](#recommended)[

Recommended for retailers

](#recommended-for-retailers)[

Menu API Integrations

](#menu-api-integrations)[

Required

](#required-1)[

Recommended

](#recommended-1)[

Performance Standards

](#performance-standards)
