<!-- fuente: https://www.mercadopago.com.mx/developers/en/reference/in-person-payments/point/overview · capturado 2026-10-08 -->

---
product_landing_hero:
 - title: Mercado Pago Point
 - message: Mercado Pago Point allows you to integrate terminals into your point-of-sale (POS) system to process in-person payments with cards and automatically reconcile sales. This reference describes the available endpoints and how to interact with them.
 - info: Looking for integration steps? [Go to Mercado Pago Point documentation](/developers/en/docs/mp-point/overview).
---

## Available endpoints

All endpoints that make up the Mercado Pago Point integration, from the initial infrastructure setup to the management of charges. For third-party integrations, authenticate your API calls using [OAuth](/developers/en/reference/authentication/oauth/_oauth_token/post).

:::AccordionComponent{title="Physical stores" pill="Core"}

Stores represent the physical locations of your business. Each store groups the POS and Point terminals that operate at that location.

| Operation | Path | Description |
|---|---|---|
| :TagComponent{tag="POST" text="Create store" href="/developers/en/reference/in-person-payments/point/stores/create-store/post" color="green"} | `/users/{user_id}/stores` | Registers a physical store where the POS and Point terminals will operate. |
| :TagComponent{tag="GET" text="Search stores" href="/developers/en/reference/in-person-payments/point/stores/search-store/get" color="accent"} | `/users/{user_id}/stores/search` | Searches stores by `external_id` or other available parameters; returns paginated results. |
| :TagComponent{tag="GET" text="Get store" href="/developers/en/reference/in-person-payments/point/stores/get-store/get" color="accent"} | `/stores/{id}` | Returns the registration data of a store: name, business hours, location, and external identifier. |
| :TagComponent{tag="PUT" text="Update store" href="/developers/en/reference/in-person-payments/point/stores/update-store/put" color="orange"} | `/users/{user_id}/stores/{id}` | Updates the configuration data of an existing store. |
| :TagComponent{tag="DELETE" text="Delete store" href="/developers/en/reference/in-person-payments/point/stores/delete-store/delete" color="red"} | `/users/{user_id}/stores/{id}` | Deletes a store and unlinks it from its POS. |

:::

:::AccordionComponent{title="POS" pill="Core"}

Each POS is a point of sale within a store. When creating it, you can link it to a Point terminal so it receives the payment orders.

| Operation | Path | Description |
|---|---|---|
| :TagComponent{tag="POST" text="Create POS" href="/developers/en/reference/in-person-payments/point/pos/create-pos/post" color="green"} | `/pos` | Creates a POS in a store and links it to a Point terminal to process payments. |
| :TagComponent{tag="GET" text="Search POS" href="/developers/en/reference/in-person-payments/point/pos/search-pos/get" color="accent"} | `/pos` | Searches POS by `external_id` or other available parameters; returns paginated results. |
| :TagComponent{tag="GET" text="Get POS" href="/developers/en/reference/in-person-payments/point/pos/get-pos/get" color="accent"} | `/pos/{id}` | Returns the detail of a POS, including its status and configuration. |
| :TagComponent{tag="PUT" text="Update POS" href="/developers/en/reference/in-person-payments/point/pos/update-pos/put" color="orange"} | `/pos/{id}` | Updates the configuration of an existing POS. |
| :TagComponent{tag="DELETE" text="Delete POS" href="/developers/en/reference/in-person-payments/point/pos/delete-pos/delete" color="red"} | `/pos/{id}` | Deletes a POS and unlinks the associated terminal. |

:::

:::AccordionComponent{title="Terminals" pill="Core"}

Point terminals are the physical Mercado Pago Point devices associated with your account. You can query them and configure their operation mode via API.

| Operation | Path | Description |
|---|---|---|
| :TagComponent{tag="GET" text="Get terminal list" href="/developers/en/reference/in-person-payments/point/terminals/get-terminals/get" color="accent"} | `/terminals/v1/list` | Lists the terminals available for the account; returns the identifier, operating mode, and associated POS for each one. |
| :TagComponent{tag="PATCH" text="Update terminal operation mode" href="/developers/en/reference/in-person-payments/point/terminals/update-operation-mode/patch" color="gray"} | `/terminals/v1/setup` | Changes the terminal's operation mode between `STANDALONE` and `PDV`. |

:::

:::AccordionComponent{title="Orders" pill="Core"}

Orders are the payment requests sent to the terminal. Your backend creates the order with the amount and the target POS; the terminal receives it automatically and the customer makes the payment.

| Operation | Path | Description |
|---|---|---|
| :TagComponent{tag="POST" text="Create order" href="/developers/en/reference/in-person-payments/point/orders/create-order/post" color="green"} | `/v1/orders` | Creates a payment order and sends it to the terminal linked to the POS; the customer makes the payment. |
| :TagComponent{tag="GET" text="Get order by ID" href="/developers/en/reference/in-person-payments/point/orders/get-order/get" color="accent"} | `/v1/orders/{id}` | Returns the status and detail of an order, including the payment result on the terminal. |
| :TagComponent{tag="POST" text="Cancel order by ID" href="/developers/en/reference/in-person-payments/point/orders/cancel-order/post" color="green"} | `/v1/orders/{id}/cancel` | Cancels an order with `status=created` or `status=at_terminal`. For the latter, the conditional `x-allow-cancelable-status: at_terminal` header must be sent; completion is asynchronous and must be confirmed by a webhook notification. |
| :TagComponent{tag="POST" text="Refund an order" href="/developers/en/reference/in-person-payments/point/orders/refund-order/post" color="green"} | `/v1/orders/{id}/refund` | Refunds a processed order, fully or partially. |
| :TagComponent{tag="POST" text="Simulate order status" href="/developers/en/reference/in-person-payments/point/orders/simulate-order/post" color="green"} | `/v1/orders/{id}/events` | Simulates the result of an order in a test environment with the statuses `processed`, `failed`, or `canceled`, among others, without processing a real payment. |

:::

:::AccordionComponent{title="Chargebacks" pill="Post-payment management"}

| Operation | Path | Description |
|---|---|---|
| :TagComponent{tag="GET" text="Get chargeback" href="/developers/en/reference/in-person-payments/point/chargebacks/get-chargeback/get" color="accent"} | `/v1/chargebacks/{id}` | Retrieves a chargeback case by its ID returned in the body of the [configured notification](/developers/en/docs/mp-point/optional-notifications). Returns the chargeback details, including the dispute status, affected amount, and response deadline. |
| :TagComponent{tag="GET" text="Search chargebacks" href="/developers/en/reference/in-person-payments/point/chargebacks/search-chargebacks/get" color="accent"} | `/v1/chargebacks/search` | Searches all chargebacks for a payment by its "payment_id" returned in the body of the [configured notification](/developers/en/docs/mp-point/optional-notifications). The search returns paginated results with the detail of each case. |
| :TagComponent{tag="POST" text="Upload supporting documentation" href="/developers/en/reference/in-person-payments/point/chargebacks/upload-supporting-documentation/post" color="green"} | `/v1/chargebacks/{id}/documentation` | Uploads evidence files to dispute a chargeback while its status ("documentation_status") is "pending". |
| :TagComponent{tag="GET" text="Get supporting documentation file" href="/developers/en/reference/in-person-payments/point/chargebacks/get-supporting-documentation/get" color="accent"} | `/v1/chargebacks/documentation/{type}/{uuid}` | Downloads or renders inline a documentation file uploaded for a chargeback case. |

:::

---
product_landing_how_integrate:
 - title: All set to get started?
 - sub_title: Go to the first endpoint and start setting up your payments infrastructure with Mercado Pago Point.
 - button_description: Create store
 - button_link: /developers/en/reference/in-person-payments/point/stores/create-store/post
---
