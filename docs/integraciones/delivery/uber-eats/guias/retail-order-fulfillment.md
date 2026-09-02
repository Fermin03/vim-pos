<!-- fuente: https://developer.uber.com/docs/eats/guides/retail-order-fulfillment -->
## Retail Order Fulfillment API Guide

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

Uber provides a set of API features that allow **retailer merchants** to find, remove, and adjust the quantity of items in the cart, and replace items that are out of stock. Customers can track fulfillment of their order and approve/reject suggested replacements for out-of-stock items from directly within Uber’s consumer application. This document explains the UI components and API features that are required for API-integrated merchants to use this set of fulfillment features.

With this API, your integration can:

-   **Update item status**: Mark items as fully available, partially available, or out of stock.
-   **Propose substitutions**: Suggest a best-match replacement or honor the customer’s pre-selected substitute.
-   **Respect customer preferences**: Automatically refund, substitute, or await approval depending on the customer’s choice.
-   **Receive real-time responses**: Listen for webhooks when a customer approves, rejects, or proposes an alternate replacement.
-   **Finalize fulfillment**: Mark the order ready once all items are confirmed.

This fits directly in with Uber’s common order fulfillment API - [Order Integration Guide](/docs/eats/guides/order-integration).

1.  **Receive an order** via the Webhook [orders.notification](/docs/eats/references/api/order_suite#tag/WebhookEvents/paths/webhookEvents/post).
2.  **Retrieve Order Details (items & preferences)** with [GetOrder](/docs/eats/references/api/order_suite#tag/GetOrder).
3.  **Accept Order** with [AcceptOrder](/docs/eats/references/api/order_suite#tag/AcceptOrder).
4.  **Update item availability or propose replacements** with [ResolveFulfillmentIssues](/docs/eats/references/api/order_suite#tag/ResolveOrderFulfillmentIssue).
5.  **Wait for customer response** when applicable via the Webhook [orders.fulfillment\_issues.resolved](/docs/eats/references/api/order_suite#tag/WebhookEvents/paths/webhookEvents/post).
6.  **Acknowledge customer response** with [ResolveFulfillmentIssues](/docs/eats/references/api/order_suite#tag/ResolveOrderFulfillmentIssue).
7.  **Finalize** by marking the order ready [OrderReady](/docs/eats/references/api/order_suite#tag/OrderReady).

### 1. Customer Experience

#### 1.1 Set Replacement Preferences

Prior to checkout, customers select their replacement preferences if their requested item is out of stock. Customers have the opportunity to update these preferences post-checkout as well.

-   **Best Match**: the merchant proposes a replacement to the customer.
-   **Specific Item**: the customer pre-selects a replacement. If the specific item selected by the customer is not available, the merchant can fall back to best match instead.
-   **Refund**: the customer wants a refund if the item is out of stock

| 
Best Match

 | 

Specific Item Selection

 |
| --- | --- |
| 

![Best Match](https://tb-static.uber.com/prod/delivery-integrations/Dev-Docs_GR_CX_RFI_REPLACE_FOR_ME1.svg)

 | 

![Specific Item Selection](https://tb-static.uber.com/prod/delivery-integrations/Dev-Docs_GR_CX_RFI_SUBSTITUTE_ME.svg)

 |

#### 1.2 Fulfillment Tracking

-   **Found Items**: As items are found, customers see a green check mark appear next to those items in real time.
-   **Out of Stock Items**: When items are out of stock, customers get a notification letting them know that the merchant proposed a replacement item, or the merchant refunded the item.

| 
Replacement Suggestion

 | 

Removed Item

 |
| --- | --- |
| 

![Best Match](https://tb-static.uber.com/prod/delivery-integrations/Dev-Docs_GR_CX_RFI_REPLACEMENT_SUGGESTION.png)

 | 

![Specific Item Selection](https://tb-static.uber.com/prod/delivery-integrations/Dev-Docs_GR_CX_RFI_REMOVED_ITEM.png)

 |

#### 1.3 Approving and Rejecting Replacements

![Alt Text](https://tb-static.uber.com/prod/delivery-integrations/Dev-Docs_GR_CX_RFI_OOI_OPTIONS_1.png)

  
  

-   When the customer selects the **“Specific Item”** replacement option and that specific item is found, the customer is not asked for approval.  
      
    
-   When the merchant proposes a **“Best Match replacement”**, the customer has the option to approve, reject, or request an alternative replacement item.  
      
    
-   The customer has up until the merchant marks the order as **[Ready](/docs/eats/references/api/order_suite#tag/OrderReady)** to respond.

  

### 2. Understanding the API Fulfillment Workflow

#### 2.1 In-Stock & Partial Availability

When an item is **found in stock** or **partially available**, call the [Resolve Fulfillment Issues endpoint](/docs/eats/references/api/order_suite#tag/ResolveOrderFulfillmentIssue) with the correct `issue_type`:

-   **PARTIAL\_AVAILABILITY**: The requested item is available but in a lower quantity than requested.
-   **FOUND\_ITEM**: The item is available in full quantity and can be fulfilled as requested.

When reporting **found** or **partially available** items, you must update `fulfillment_issues.item_availability.items_available` with the correct quantity data.

**Quantity Object** details on quantity/weight objects (`in_sellable_unit`, `in_priceable_unit`).

Reference

-   **`in_sellable_unit`** _(required for all items)_
    
    -   `measurement_unit.measurement_type`:
        -   `MEASUREMENT_TYPE_COUNT` → item sold by count
        -   `MEASUREMENT_TYPE_WEIGHT` → item sold by weight
    -   `amount_e5`: numeric quantity/weight in E5 format
-   **`in_priceable_unit`** _(only if sold by count but priced by weight)_
    
    -   `measurement_unit.measurement_type`: must be `MEASUREMENT_TYPE_WEIGHT`
    -   `amount_e5`: actual weight in E5 format

> **Note:** Always include `weight.unit_type` when items are sold or priced by weight.

> **Sample Values**

Supported Weight Unit Type

-   WEIGHT\_UNIT\_TYPE\_METRIC\_GRAM
-   WEIGHT\_UNIT\_TYPE\_METRIC\_KILOGRAM
-   WEIGHT\_UNIT\_TYPE\_IMPERIAL\_ONCE
-   WEIGHT\_UNIT\_TYPE\_IMPERIAL\_POUND

-   #### Partial Availability
    

> Use `issue_type: PARTIAL_AVAILABILITY` when the requested item is available in **lower quantity or weight** than ordered.

> **Note**: An **action\_type** is not required for the `PARTIAL_AVAILABILITY` issue type.

> **Sample Payloads**

\> Always include \`in\_sellable\_unit\`. If the item is sold by count but priced by weight, also include \`in\_priceable\_unit\`. Item Sold by Count, Priced by Count
```
{
  "fulfillment_issues": [
   {
      "issue_type": "PARTIAL_AVAILABILITY",
      "item": {
         "cart_item_id": "a6374625-5302-467b-bc99-f31d1c171ea7" // cart_item_id of the affected item. Corresponds to the same field on order.carts.items.cart_item_id items within the Get Order Details response.
      },
      "item_availability": {
         "items_available": {
            "in_sellable_unit": {
               "measurement_unit": {
                  "measurement_type": "MEASUREMENT_TYPE_COUNT" // Measurement type for the item sold by count.
               },
               "amount_e5": 100000 // Numeric value of the quantity found in E5 format.
            }
         }
      }
   }
  ]
}
```
Item Sold by Count, Priced by Weight
```
{
  "fulfillment_issues": [
   {
      "issue_type": "PARTIAL_AVAILABILITY",
      "item": {
         "cart_item_id": "6e646e2a-3961-4d0c-b17d-13fe808618cd" // cart_item_id of the affected item. Corresponds to the same field on order.carts.items.cart_item_id items within the Get Order Details response.
      },
      "item_availability": {
         "items_available": {
            "in_sellable_unit": {
               "measurement_unit": {
                  "measurement_type": "MEASUREMENT_TYPE_COUNT" // Measurement type for the item sold by count.
               },
               "amount_e5": 400000 // Numeric value of the quantity found in E5 format.
            },
            "in_priceable_unit": {
               "measurement_unit": {
                  "measurement_type": "MEASUREMENT_TYPE_WEIGHT", // Measurement type for the item priced by weight.
                  "weight": {
                     "unit_type": "WEIGHT_UNIT_TYPE_IMPERIAL_POUND" // The weight unit type that is being used for the item.
                  }
               },
               "amount_e5": 2100000 // Numeric value of the weight found in E5 format.
            }
         }
      }
   }
  ]
}
```
Item Sold by Weight, Priced by Weight
```
{
  "fulfillment_issues": [
   {
      "issue_type": "PARTIAL_AVAILABILITY",
      "item": {
         "cart_item_id": "a6374625-5302-467b-bc99-f31d1c171ea7" // cart_item_id of the affected item. Corresponds to the same field on order.carts.items.cart_item_id items within the Get Order Details response.
      },
      "item_availability": {
         "items_available": {
            "in_sellable_unit": {
               "measurement_unit": {
                  "measurement_type": "MEASUREMENT_TYPE_WEIGHT", // Measurement type for the item sold by weight.
                  "weight": {
                     "unit_type": "WEIGHT_UNIT_TYPE_IMPERIAL_POUND" // The weight unit type that is being used for the item.
                  },
               "amount_e5": 210000 // Numeric value of the weight found in E5 format.
               }
            }
         }
      }
   }
  ]
}
```

-   #### Found Item
    

> Use `issue_type: FOUND_ITEM` when the requested item is **fully available** in the requested quantity.

> **Note**: An **action\_type** is not required for the `FOUND_ITEM` issue type.

> Always include `in_sellable_unit`. If the item is sold by count but priced by weight, also include `in_priceable_unit`.

> **Sample Payloads**

Item Sold by Count, Priced by Count
```
{
  "fulfillment_issues": [
   {
      "issue_type": "FOUND_ITEM",
      "item": {
         "cart_item_id": "a6374625-5302-467b-bc99-f31d1c171ea7" // cart_item_id of the affected item. Corresponds to the same field on order.carts.items.cart_item_id items within the Get Order Details response.
      },
      "item_availability": {
         "items_available": {
            "in_sellable_unit": {
               "measurement_unit": {
                  "measurement_type": "MEASUREMENT_TYPE_COUNT" // Measurement type for the item sold by count.
               },
               "amount_e5": 100000 // Numeric value of the quantity found in E5 format.
            }
         }
      }
   }
  ]
}
```
Item Sold by Count, Priced by Weight
```
{
  "fulfillment_issues": [
   {
      "issue_type": "FOUND_ITEM",
      "item": {
         "cart_item_id": "6e646e2a-3961-4d0c-b17d-13fe808618cd" // cart_item_id of the affected item. Corresponds to the same field on order.carts.items.cart_item_id items within the Get Order Details response.
      },
      "item_availability": {
         "items_available": {
            "in_sellable_unit": {
               "measurement_unit": {
                  "measurement_type": "MEASUREMENT_TYPE_COUNT" // Measurement type for the item sold by count.
               },
               "amount_e5": 400000 // Numeric value of the quantity found in E5 format.
            },
            "in_priceable_unit": {
               "measurement_unit": {
                  "measurement_type": "MEASUREMENT_TYPE_WEIGHT", // Measurement type for the item priced by weight.
                  "weight": {
                     "unit_type": "WEIGHT_UNIT_TYPE_IMPERIAL_POUND" // The weight unit type that is being used for the item.
                  }
               },
               "amount_e5": 2100000 // Numeric value of the weight found in E5 format.
            }
         }
      }
   }
  ]
}
```
Item Sold by Weight, Priced by Weight
```
{
  "fulfillment_issues": [
   {
      "issue_type": "FOUND_ITEM",
      "item": {
         "cart_item_id": "a6374625-5302-467b-bc99-f31d1c171ea7" // cart_item_id of the affected item. Corresponds to the same field on order.carts.items.cart_item_id items within the Get Order Details response.
      },
      "item_availability": {
         "items_available": {
            "in_sellable_unit": {
               "measurement_type": "MEASUREMENT_TYPE_WEIGHT", // Measurement type for the item sold by weight.
               "weight": {
                  "unit_type": "WEIGHT_UNIT_TYPE_IMPERIAL_POUND" // The weight unit type that is being used for the item.
               },
               "amount_e5": 210000 // Numeric value of the weight found in E5 format.
            }
         }
      }
   }
  ]
}
```

#### 2.2 Out-of-Stock Workflow

This workflow leverages the following components: **1** the [Get Order Details Endpoint](/docs/eats/references/api/order_suite#tag/GetOrder), **2** the [Resolve Fulfillment Issues Endpoint](/docs/eats/references/api/order_suite#tag/ResolveOrderFulfillmentIssue), and **3** the [Orders Fulfillment Issues Resolved Webhook](/docs/eats/references/api/order_suite#tag/WebhookEvents/paths/webhookEvents/post). By combining these components, the API enables merchants to handle out-of-stock scenarios dynamically, ensuring that customers are informed and their preferences respected throughout the order fulfillment process. Here’s a sample workflow of these components working together:

1.  **Check customer preferences** Use [Get Order Details](/docs/eats/references/api/order_suite#tag/GetOrder) to retrieve the customer’s replacement preferences from: `carts.items.fulfillment_action.action_type`
    
    Possible values:
    
    -   `REPLACE_FOR_ME`: Customer allows merchant to propose a best-match replacement.
    -   `SUBSTITUTE_ME`: Customer pre-selects a specific replacement.
    -   `REMOVE_ITEM`: Customer requests refund/removal if unavailable.
2.  **Report out-of-stock** Call [Resolve Fulfillment Issues](/docs/eats/references/api/order_suite#tag/ResolveOrderFulfillmentIssue) with `issue_type: OUT_OF_ITEM` and the correct `action_type`.
    
3.  **Wait for customer response** When customer’s response is received, Uber will trigger the `orders.fulfillment_issues.resolved` webhook. Use [Get Order Details](/docs/eats/references/api/order_suite#tag/GetOrder) to retrieve the customer’s response from: `carts.fulfillment_issues.customer_ack_type`
    
    Possible values:
    
    -   `ALTERNATIVE_ITEM_PROPOSED`: Customer counters with a different substitute.
    -   `SUBSTITUTION_REJECTED`: Customer rejects replacement.
4.  **Acknowledge customer response** Call [Resolve Fulfillment Issues](/docs/eats/references/api/order_suite#tag/ResolveOrderFulfillmentIssue) with `issue_type: OUT_OF_ITEM` and the new `action_type`.
    
5.  **Finalize** Call [Order Ready](/docs/eats/references/api/order_suite#tag/OrderReady) when done preparing the order.
    

#### 2.3 Resolving Customer Order Fulfillment Issues

When an item is confirmed as out of stock (`issue_type: OUT_OF_ITEM`), the merchant must take an action based on the customer’s replacement preference. The correct **action\_type** is returned in `carts.items.fulfillment_action.action_type` field from [GetOrder](/docs/eats/references/api/order_suite#tag/GetOrder).

Available `action_type` values:

-   **REPLACE\_FOR\_ME** → Merchant proposes a best-match replacement (`item_substitute` required).
-   **SUBSTITUTE\_ME** → Merchant must use the customer’s pre-selected replacement (`item_substitute` required).
-   **REMOVE\_ITEM** → Merchant removes the item and refunds it.

When the customer responds to the merchant’s initial action (signaled by a webhook), the customer’s new preference is updated. The correct **action\_type** is returned in `carts.fulfillment_issues.customer_ack_type` field from [GetOrder](/docs/eats/references/api/order_suite#tag/GetOrder).

New available `action_type` values:

-   **ALTERNATIVE\_ITEM** (`ALTERNATIVE_ITEM_PROPOSED`) → Merchant must use the customer’s alternative replacement (`item_substitute` required).
-   **SUBSTITUTION\_REJECTED** → No merchant action is required. Uber Eats removes the item and refunds it automatically.

Merchants must also provide quantity and weight details when proposing a replacement (`REPLACE_FOR_ME` or `SUBSTITUTE_ME`).

**Quantity Object** details on quantity/weight objects (`in_sellable_unit`, `in_priceable_unit`).

Reference

-   **`in_sellable_unit`** _(required for all items)_
    
    -   `measurement_unit.measurement_type`:
        -   `MEASUREMENT_TYPE_COUNT` → item sold by count
        -   `MEASUREMENT_TYPE_WEIGHT` → item sold by weight
    -   `amount_e5`: numeric quantity/weight in E5 format
-   **`in_priceable_unit`** _(only if sold by count but priced by weight)_
    
    -   `measurement_unit.measurement_type`: must be `MEASUREMENT_TYPE_WEIGHT`
    -   `amount_e5`: actual weight in E5 format

-   ##### Replace for Customer
    

> Use when the item is **out of stock** and the customer has chosen **Best Match** (`REPLACE_FOR_ME`). You must provide a replacement in the `item_substitute` object with its available quantity.

> **Sample Payloads**

Item Sold by Count, Priced by Count
```
{
  "fulfillment_issues": [
   {
      "issue_type": "OUT_OF_ITEM",
      "action_type": "REPLACE_FOR_ME",
      "item": {
         "cart_item_id": "89917bd8-36b4-4229-b9c9-76bdb942ff2b" // cart_item_id of the affected item. Corresponds to the same field on order.carts.items.cart_item_id items within the Get Order Details response.
      },
      "item_substitute": {
         "id": "product_0007566911503",
         "quantity": {
            "in_sellable_unit":{
               "measurement_unit": {
                  "measurement_type": "MEASUREMENT_TYPE_COUNT" // Measurement type for the item sold by count.
               },
               "amount_e5": 100000 // Numeric value of the quantity found in E5 format.
            }
         }
      }
   }
  ]
}
```
Item Sold by Count, Priced by Weight
```
{
  "fulfillment_issues": [
   {
      "issue_type": "OUT_OF_ITEM",
      "action_type": "REPLACE_FOR_ME",
      "item": {
         "cart_item_id": "a6374625-5302-467b-bc99-f31d1c171ea7" // cart_item_id of the affected item. Corresponds to the same field on order.carts.items.cart_item_id items within the Get Order Details response.
      },
      "item_substitute": {
         "id": "product_0007566981503",
         "quantity": {
            "in_sellable_unit": {
               "measurement_unit": {
                  "measurement_type": "MEASUREMENT_TYPE_COUNT" // Measurement type for the item sold by count.
               },
               "amount_e5": 400000 // Numeric value of the quantity found in E5 format.
            },
            "in_priceable_unit": {
               "measurement_unit": {
                  "measurement_type": "MEASUREMENT_TYPE_WEIGHT", // Measurement type for the item priced by weight.
                  "weight": {
                     "unit_type": "WEIGHT_UNIT_TYPE_IMPERIAL_POUND" // The weight unit type that is being used for the item.
                  }
               },
               "amount_e5": 2100000 // Numeric value of the weight found in E5 format.
            }
         }
      }
   }
  ]
}
```
Item Sold by Weight, Priced by Weight
```
{
  "fulfillment_issues": [
   {
      "issue_type": "OUT_OF_ITEM",
      "action_type": "REPLACE_FOR_ME",
      "item": {
         "cart_item_id": "a6374625-5302-467b-bc99-f31d1c171ea7" // cart_item_id of the affected item. Corresponds to the same field on order.carts.items.cart_item_id items within the Get Order Details response.
      },
      "item_substitute": {
         "id": "product_0007566981503",
         "quantity": {
            "in_sellable_unit": {
               "measurement_type": "MEASUREMENT_TYPE_WEIGHT", // Measurement type for the item sold by weight.
               "weight": {
                  "unit_type": "WEIGHT_UNIT_TYPE_IMPERIAL_POUND" // The weight unit type that is being used for the item.
               },
               "amount_e5": 210000 // Numeric value of the weight found in E5 format.
            }
         }
      }
   }
  ]
}
```

-   ##### Substitute for Customer
    

> Use when the item is **out of stock** and the customer has already selected a **specific replacement** (`SUBSTITUTE_ME`). Your integration must propose the customer’s chosen substitute in the `item_substitute` object returned in the `carts.items.fulfillment_action.action_type.item_substitutes` object from [GetOrder](/docs/eats/references/api/order_suite#tag/GetOrder), including its available quantity.

> **Sample Payloads**

Item Sold by Count, Priced by Count
```
{
  "fulfillment_issues": [
   {
      "issue_type": "OUT_OF_ITEM",
      "action_type": "SUBSTITUTE_ME",
      "item": {
         "cart_item_id": "89917bd8-36b4-4229-b9c9-76bdb942ff2b" // cart_item_id of the affected item. Corresponds to the same field on order.carts.items.cart_item_id items within the Get Order Details response.
      },
      "item_substitute": {
         "id": "product_0007566911503",
         "quantity": {
            "in_sellable_unit":{
               "measurement_unit": {
                  "measurement_type": "MEASUREMENT_TYPE_COUNT" // Measurement type for the item sold by count.
               },
               "amount_e5": 100000 // Numeric value of the quantity found in E5 format.
            }
         }
      }
   }
  ]
}
```
Item Sold by Count, Priced by Weight
```
{
  "fulfillment_issues": [
   {
      "issue_type": "OUT_OF_ITEM",
      "action_type": "SUBSTITUTE_ME",
      "item": {
         "cart_item_id": "a6374625-5302-467b-bc99-f31d1c171ea7" // cart_item_id of the affected item. Corresponds to the same field on order.carts.items.cart_item_id items within the Get Order Details response.
      },
      "item_substitute": {
         "id": "product_0007566981503",
         "quantity": {
            "in_sellable_unit": {
               "measurement_unit": {
                  "measurement_type": "MEASUREMENT_TYPE_COUNT" // Measurement type for the item sold by count.
               },
               "amount_e5": 400000 // Numeric value of the quantity found in E5 format.
            },
            "in_priceable_unit": {
               "measurement_unit": {
                  "measurement_type": "MEASUREMENT_TYPE_WEIGHT", // Measurement type for the item priced by weight.
                  "weight": {
                     "unit_type": "WEIGHT_UNIT_TYPE_IMPERIAL_POUND" // The weight unit type that is being used for the item.
                  }
               },
               "amount_e5": 2100000 // Numeric value of the weight found in E5 format.
            }
         }
      }
   }
  ]
}
```
Item Sold by Weight, Priced by Weight
```
{
  "fulfillment_issues": [
   {
      "issue_type": "OUT_OF_ITEM",
      "action_type": "SUBSTITUTE_ME",
      "item": {
         "cart_item_id": "a6374625-5302-467b-bc99-f31d1c171ea7" // cart_item_id of the affected item. Corresponds to the same field on order.carts.items.cart_item_id items within the Get Order Details response.
      },
      "item_substitute": {
         "id": "product_0007566981503",
         "quantity": {
            "in_sellable_unit": {
               "measurement_type": "MEASUREMENT_TYPE_WEIGHT", // Measurement type for the item sold by weight.
               "weight": {
                  "unit_type": "WEIGHT_UNIT_TYPE_IMPERIAL_POUND" // The weight unit type that is being used for the item.
               },
               "amount_e5": 210000 // Numeric value of the weight found in E5 format.
            }
         }
      }
   }
  ]
}
```

-   ###### Remove Customer Item
    

> Use when the item is **out of stock** and the customer has requested a **refund/removal** (`REMOVE_ITEM`). In this case, you only need to reference the unavailable `cart_item_id`. No substitute or quantity is required.

> **Sample Payloads**

Remove Item
```
{
  "fulfillment_issues": [
   {
      "issue_type": "OUT_OF_ITEM",
      "action_type": "REMOVE_ITEM",
      "item": {
         "cart_item_id": "89917bd8-36b4-4229-b9c9-76bdb942ff2b" // cart_item_id of the affected item. Corresponds to the same field on order.carts.items.cart_item_id items within the Get Order Details response.
      }
   }
  ]
}
```

-   ##### [¶](#customer-response-\(webhook\)) Customer Response (Webhook)
    

> When the customer responds to a replacement suggestion, the [Orders Fulfillment Issues Resolved Webhook](/docs/eats/references/api/order_suite#tag/WebhookEvents/paths/webhookEvents/post) fires.

> Your integration should:

> 1.  **Acknowledge the webhook** with `200 OK`.
> 2.  **Fetch updated order details** using the `resource_href`.
> 3.  **Check the customer’s response** in `carts.fulfillment_issues.customer_ack_type`.
> 4.  **Take the next action** (fulfill, propose alt item, remove, etc.).

> This webhook indicates that the customer has responded to a fulfillment issue and signals the merchant to retrieve the updated order details by calling the [Get Order Details Endpoint](/docs/eats/references/api/order_suite#tag/GetOrder). The customer’s response is found in `carts.fulfillment_issues.customer_ack_type` field. The possible values are:

> -   **NO\_ACK\_REQUIRED**: Customer response is not needed. Fulfill this replacement even if the customer does not respond.
> -   **AWAITING\_ACTION**: Waiting for a customer response. Do not finalize this replacement without customer approval.
> -   **SUBSTITUTION\_APPROVED**: The customer approves the suggested replacement item. Uber Eats updates the customer’s order automatically.
> -   **ALTERNATIVE\_ITEM\_PROPOSED**: The customer requested an [alternate replacement item](#alternative-item-for-customer).
> -   **SUBSTITUTION\_REJECTED**: The customer [rejects the replacement item](#rejected-replacement). Uber Eats removes the item and refunds it automatically.

> **Sample Webhook**

Orders Fulfillment Resolved Webhook
```
{
  "event_id": "535e3f4a-5641-587c-a39a-022e907109e4",
  "event_type": "orders.fulfillment_issues.resolved",
  "event_time": 1754090973974771039,
  "resource_href": "https://api.uber.com/v1/delivery/order/9694ae6b-a4d4-457f-831a-4526bb720f4b",
  "meta": {
    "user_id": "a0cd5418-0731-4e4a-be9c-2a6c13a36b13",
    "resource_id": "9694ae6b-a4d4-457f-831a-4526bb720f4b",
    "status": "pos"
  },
  "webhook_meta": {}
}
```

-   ##### Alternative Item for Customer
    

> Use when the the customer has responded to the initial merchant’s action with a new **specific replacement** (`customer_ack_type: ALTERNATIVE_ITEM_PROPOSED`). Your integration must propose the customer’s new chosen substitute in the `item_substitute` object returned in the `carts.fulfillment_issues.item_substitute` object from [GetOrder](/docs/eats/references/api/order_suite#tag/GetOrder), including its available quantity.

> **Sample Payloads**

Item Sold by Count, Priced by Count
```
{
  "fulfillment_issues": [
   {
      "issue_type": "OUT_OF_ITEM",
      "action_type": "ALTERNATIVE_ITEM",
      "item": {
         "cart_item_id": "89917bd8-36b4-4229-b9c9-76bdb942ff2b" // cart_item_id of the affected item. Corresponds to the same field on order.carts.items.cart_item_id items within the Get Order Details response.
      },
      "item_substitute": {
         "id": "product_0065722720617",
         "quantity": {
            "in_sellable_unit":{
               "measurement_unit": {
                  "measurement_type": "MEASUREMENT_TYPE_COUNT" // Measurement type for the item sold by count.
               },
               "amount_e5": 100000 // Numeric value of the quantity found in E5 format.
            }
         }
      }
   }
  ]
}
```
Item Sold by Count, Priced by Weight
```
{
  "fulfillment_issues": [
   {
      "issue_type": "OUT_OF_ITEM",
      "action_type": "ALTERNATIVE_ITEM",
      "item": {
         "cart_item_id": "a6374625-5302-467b-bc99-f31d1c171ea7" // cart_item_id of the affected item. Corresponds to the same field on order.carts.items.cart_item_id items within the Get Order Details response.
      },
      "item_substitute": {
         "id": "product_0007566981503",
         "quantity": {
            "in_sellable_unit": {
               "measurement_unit": {
                  "measurement_type": "MEASUREMENT_TYPE_COUNT" // Measurement type for the item sold by count.
               },
               "amount_e5": 400000 // Numeric value of the quantity found in E5 format.
            },
            "in_priceable_unit": {
               "measurement_unit": {
                  "measurement_type": "MEASUREMENT_TYPE_WEIGHT", // Measurement type for the item priced by weight.
                  "weight": {
                     "unit_type": "WEIGHT_UNIT_TYPE_IMPERIAL_POUND" // The weight unit type that is being used for the item.
                  }
               },
               "amount_e5": 2100000 // Numeric value of the weight found in E5 format.
            }
         }
      }
   }
  ]
}
```
Item Sold by Weight, Priced by Weight
```
{
  "fulfillment_issues": [
   {
      "issue_type": "OUT_OF_ITEM",
      "action_type": "ALTERNATIVE_ITEM",
      "item": {
         "cart_item_id": "a6374625-5302-467b-bc99-f31d1c171ea7" // cart_item_id of the affected item. Corresponds to the same field on order.carts.items.cart_item_id items within the Get Order Details response.
      },
      "item_substitute": {
         "id": "product_0007566981503",
         "quantity": {
            "in_sellable_unit": {
               "measurement_type": "MEASUREMENT_TYPE_WEIGHT", // Measurement type for the item sold by weight.
               "weight": {
                  "unit_type": "WEIGHT_UNIT_TYPE_IMPERIAL_POUND" // The weight unit type that is being used for the item.
               },
               "amount_e5": 210000 // Numeric value of the weight found in E5 format.
            }
         }
      }
   }
  ]
}
```

-   ##### Rejected Replacement
    

> When the the customer has responded rejecting the replacement, the item will be **automatically** removed from the customer’s order. Your integration must call the [GetOrder](/docs/eats/references/api/order_suite#tag/GetOrder) to retrieve an updated order details.

[

1\. Customer Experience

](#1.-customer-experience)[

1.1 Set Replacement Preferences

](#1.1-set-replacement-preferences)[

1.2 Fulfillment Tracking

](#1.2-fulfillment-tracking)[

1.3 Approving and Rejecting Replacements

](#1.3-approving-and-rejecting-replacements)[

2\. Understanding the API Fulfillment Workflow

](#2.-understanding-the-api-fulfillment-workflow)[

2.1 In-Stock & Partial Availability

](#2.1-in-stock-&-partial-availability)[

Partial Availability

](#partial-availability)[

Found Item

](#found-item)[

2.2 Out-of-Stock Workflow

](#2.2-out-of-stock-workflow)[

2.3 Resolving Customer Order Fulfillment Issues

](#2.3-resolving-customer-order-fulfillment-issues)[

Replace for Customer

](#replace-for-customer)[

Substitute for Customer

](#substitute-for-customer)[

Remove Customer Item

](#remove-customer-item)[

Customer Response (Webhook)

](#customer-response-\(webhook\))[

Alternative Item for Customer

](#alternative-item-for-customer)[

Rejected Replacement

](#rejected-replacement)
