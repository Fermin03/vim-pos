<!-- fuente: https://developer.uber.com/docs/eats/references/api/v2/patch-eats-orders-orderid-cart -->
## Patch Cart

`PATCHhttps://api.uber.com/v2/eats/orders/{order_id}/cart`

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

This _Patch Cart_ endpoint allows a developer to update the shopping cart for an order. Currently, it’s used to indicate fulfillment issues with particular items.

**This API is available only for Grocery Stores**

This API is available only for stores configured internally with type **Grocery Store**. Attempts to use this API with stores with other types will result in failed requests with status code 400.

#### Authorization

OAuth 2.0 Bearer token with the `eats.order` scope. For more information, see [Authentication](/docs/eats/guides/authentication).

##### Path Parameters

| Name | Type | Description |
| --- | --- | --- |
| `order_id` | `string` | Unique identifying string for an order on Uber Eats. Typically referred to as the “Order UUID”. Provide this id when inquiring about a specific order. |

#### Request Body Parameters

All parameters are **required** unless stated otherwise.

##### Request Body Parameters - Fulfillment Issues

**Root-level Array of fulfillment issues that indicate which items that could not be fulfilled and what actions were taken to address.**

| Name | Type | Description |
| --- | --- | --- |
| `fulfillment_issues` | [FulfillmentIssue](#request-body-parameters-fulfillmentissue) \[\] | Array of fulfillment issues that indicate which items that could not be fulfilled and what actions were taken to address. |

##### Request Body Parameters - FulfillmentIssue

**Indicates an item was partially or completely out of stock and the action taken to resolve the issue.**

| Name | Type | Description |
| --- | --- | --- |
| `fulfillment_issue_type` | string(**enum**) | Indicates the type of fulfillmentIssue.  
  
**ALLOWED VALUES**:
-   `OUT_OF_ITEM`
Requested item was not found at all-   `PARTIAL_AVAILABILITY`
Requested item was found, but not in quantity enough to fulfill the order-   `FOUND_ITEM`
Item was found and in enough quantity to fulfill the order

 |
| `fulfillment_action_type` | string(**enum**) | Indicates the action being taken to resolve the fulfillment issue if fulfillment\_issue\_type is **OUT\_OF\_ITEM**. The value must match the eater preference specified on the item (however, if the eater has specified **REPLACE\_FOR\_ME** or **SUBSTITUTE\_ME** then **REMOVE\_ITEM** is also a valid action).  
  
**ALLOWED VALUES**:

-   `REMOVE_ITEM`
Remove item if it’s unavailable.-   `REPLACE_FOR_ME`
Choose replacement for shopper.-   `ADJUST_ITEM`
Adjust the quantity of the root item, only used with **FOUND\_ITEM** fulfillment issue type.

 |
| `root_item` | [Item](#request-body-parameters-item) | The root item for which the issue exists. |
| `item_substitute` | [ItemSubstitute](#request-body-parameters-item-substitute) | The item substitute, required in case of fulfillment\_action\_type: **REPLACE\_FOR\_ME**. |
| `item_availability_info` | [ItemAvailabilityInfo](#request-body-parameters-item-availability-info) | The availability of the replacement item. |
| `item_adjustment` | [ItemSubstitute](#request-body-parameters-item-substitute)) | Adjustments in quantity for the root\_item, required for the ADJUST\_ITEM fulfillment action type. |

##### Request Body Parameters - Item

**References an item within an order’s shopping cart.**

| Name | Type | Description |
| --- | --- | --- |
| `instance_id` | string | Unique identifying string for the shopping cart item, provided by Uber |

##### Request Body Parameters - Item Substitute

**References the item for replacement, required in case of fulfillment\_action\_type: REPLACE\_FOR\_ME.**

| Name | Type | Description |
| --- | --- | --- |
| `id` | string | Unique identifying string for the item substitute, provided by the store |
| `quantity` | int | Quantity of the item substitute. |
| `selected_modifier_groups` | [ModifierGroup](#request-body-parameters-modifier-group) | List of modifier groups selected for this item. |
| `item_quantity_by_unit` | [ItemQuantity](#request-body-parameters-item-quantity) | Item quantity information associated with sellable and priceable units. If present, the quantity field will be ignored. |

##### Request Body Parameters - Modifier Group

**References a modifier for a replacement, required only if the replacement has mandatory modifiers**

| Name | Type | Description |
| --- | --- | --- |
| `id` | string | Unique identifying string for the modifier group, provided by the store |
| `selected_items` | [ModifierGroupOption](#request-body-parameters-modifier-group-option) | List of modifier groups options (child items) selected for this modifier group. |

##### Request Body Parameters - Modifier Group Option

**References a selected option for a replacement’s modifier group, required only if the replacement has mandatory modifiers**

| Name | Type | Description |
| --- | --- | --- |
| `id` | string | Unique identifying string for the modifier group option, provided by the store |
| `quantity` | int | Quantity of the selected modifier group optiom for the item substitute. |

##### Request Body Parameters - Item Quantity

**Detailed description of the different quantities of an item, both the ones displayed to the customer and the ones measured at the store.**

| Name | Type | Description |
| --- | --- | --- |
| `in_sellable_unit` | [Quantity](#request-body-parameters-quantity) | Represents the quantity of a cart item in the units that were already presented to the customer.  
  
**Example:** the customer bought `3` apples, the sellable unit is `COUNT` with a quantity value of `3`. If the customer added `1.5 kg` of peanuts, the unit is `WEIGHT` in `KILOGRAMS` and the quantity value is `1.5` |
| `in_priceable_unit` | [Quantity](#request-body-parameters-quantity) | Represents the quantity of a cart item in the priceable unit at the store. Not necessarily the same as what the customer added.  
  
**Example:** the customer added `3` apples, but those are priced by weight at the store, the unit is `WEIGHT` in `KG` or `LB`, and the quantity value is whatever those `3` apples weighted, `0.7` kg for example. |

##### Request Body Parameters - Quantity

**Detailed description of the different quantities of an item, both the ones displayed to the customer and the ones measured at the store.**

| Name | Type | Description |
| --- | --- | --- |
| `amount_e5` | int | Numeric value of the quantity. It is based on the measurement unit and it is in E5 format. Eg: for 2.1 lb of an item, the amount would be 21000 in E5, based on the formula `X * 10^5` |
| `measurement_unit` | [MeasurementUnit](#request-body-parameters-measurement-unit) | Unit in which the quantity is measured with. `"Kg", "Lb", "Un", "Meter", etc.` |

##### Request Body Parameters - Measurement Unit

**The type of unit used for the item. It includes a measurement type field and different entries for unit type. The field to fulfill depends on the measurement type. Only one of those should be present.**

| Name | Type | Description |
| --- | --- | --- |
| `measurement_type` | string | The type of measurement type, which can be a physical dimension (weight), or whole number based system. Accepted values are:-   COUNT
-   WEIGHT |
| `weight` | [Weight(optional)](#request-body-parameters-weight) | Description of the weight of the item, if the measurement type is `WEIGHT` |

##### Request Body Parameters - Weight

**Only needed if the measurement\_type is WEIGHT.**

| Name | Type | Description |
| --- | --- | --- |
| `unit_type` | string | The weight unit type that is being used for the item. Accepted values are:-   METRIC\_KILOGRAM
-   METRIC\_GRAM
-   IMPERIAL\_POUND
-   IMPERIAL\_OUNCE |

#### Request Body Example

-   Remove an item

```
{
   "fulfillment_issues":[
      {
         "fulfillment_issue_type":"OUT_OF_ITEM",
         "fulfillment_action_type":"REMOVE_ITEM",
         "root_item":{
            "instance_id":"DC8C6CFC-1712-4547-A632-7EAB71A98B76",
         },
      }
   ]
}
```

-   Replace an item, with a substitute without modifier groups

```
{
	"fulfillment_issues": [{
		"fulfillment_issue_type": "OUT_OF_ITEM",
        "fulfillment_action_type": "REPLACE_FOR_ME",
		"root_item": {
          "instance_id": "3668730c-ee60-4ec7-aca9-8bdbbc6c616e"
        },
        "item_substitute": {
          "id": "d50b0687-3502-4991-aaf9-ec022f8ef55b",
          "quantity": 1
        }
	}]
}
```

-   Replace an item, with a substitute with modifier groups (this feature is not widely available, so it has to be requested).

```
{
	"fulfillment_issues": [{
		"fulfillment_issue_type": "OUT_OF_ITEM",
        "fulfillment_action_type": "REPLACE_FOR_ME",
		"root_item": {
          "instance_id": "3668730c-ee60-4ec7-aca9-8bdbbc6c616e"
        },
        "item_substitute": {
          "id": "d50b0687-3502-4991-aaf9-ec022f8ef55b",
          "quantity": 1,
          "selected_modifier_groups": [
            {
              "id": "0e1fcaeb-0588-45f0-948d-f11746e83c8f",
              "selected_items": [
                {
                  "id": "41be8b20-fec0-4780-840f-713901475f32",
                  "quantity": 1,
                },
                {
                  "id": "2bb5d0ae-6a4e-461e-b74b-455e59420778",
                  "quantity": 1,
                },
              ]
            },
            {
              "id": "a97dfc2b-8d91-4fb0-929c-8f48be0e4208",
              "selected_items": [
                {
                  "id": "64b6cc0c-64a1-480f-bd6c-13ce12bcaad3",
                  "quantity": 2,
                }
              ]
            },
          ]
        }
	}]
}
```

-   Replace an item priced by weight, and sold by count or weight, with an item priced by weight and sold by weight. Example shows an item weighing 5 kilograms.

```
{
    "fulfillment_issues": [
        {
            "fulfillment_issue_type": "OUT_OF_ITEM",
            "fulfillment_action_type": "REPLACE_FOR_ME",
            "root_item": {
                "instance_id": "DC8C6CFC-1712-4547-A632-7EAB71A98B76"
            },
            "item_substitute": {
                "id": "41be8b20-fec0-4780-840f-713901475f32",
                "item_quantity_v2": {
                    "in_sellable_unit": {
                        "amount_e5": 500000,
                        "measurement_unit": {
                            "measurement_type": "WEIGHT",
                            "weight": {
                                "unit_type": "METRIC_KILOGRAM"
                            }
                        }
                    }
                }
            }
        }
    ]
}
```

-   Adjust the weight of an item priced by weight, and sold by count or weight. The item\_adjustment object describes changes to the same root\_item. This feature is under testing and has to be explicity requested. Example is about an item which sells 3 units, weighing 1.55 kilograms.

```
{
    "fulfillment_issues": [
        {
            "fulfillment_issue_type": "FOUND_ITEM",
            "fulfillment_action_type": "ADJUST_ITEM",
            "root_item": {
                "instance_id": "DC8C6CFC-1712-4547-A632-7EAB71A98B76"
            },
            "item_adjustment": {
                "item_quantity_by_unit": {
                    "in_sellable_unit": {
                        "amount_e5": 300000,
                        "measurement_unit": {
                            "measurement_type": "COUNT"
                        }
                    },
                    "in_priceable_unit": {
                        "amount_e5": 155000,
                        "measurement_unit": {
                            "measurement_type": "WEIGHT",
                            "weight": {
                                "unit_type": "METRIC_KILOGRAM"
                            }
                        }
                    }
                }
            }
        }
    ]
}
```

-   Reduce the quantity of an item

```
{
   "fulfillment_issues":[
      {
         "fulfillment_issue_type":"PARTIAL_AVAILABILITY",
         "root_item":{
            "instance_id":"DC8C6CFC-1712-4547-A632-7EAB71A98B76",
         },
         "item_availability_info":{
            "items_available":1
         }
      }
   ]
}
```

#### Response

`Status-Code: 204 No Content`

This endpoint returns an empty response body.

#### FAQ

-   If you substitute an item with an item marked as out of stock in the current menu, would the patch/cart call fail? Any validation rules on the item availability?
    
    -   Yes, there will be validation on the item availability
-   In which cases would the Patch/cart request be rejected?
    
    -   Invalid or missing root\_item instance\_id
    -   Invalid or missing item\_substitute id, in case of fulfillment\_action\_type: **REPLACE\_FOR\_ME**
    -   Missing or non-positive item substitute quantity, in case of fulfillment\_action\_type: **REPLACE\_FOR\_ME**
    -   The total price of item substitute is higher than total price of root item, including the price of any selected modifier group option of both.
    -   The fulfillment\_action\_type does not match the eater preference specified on the item (however, if the eater has specified **REPLACE\_FOR\_ME** or **SUBSTITUTE\_ME** then **REMOVE\_ITEM** is also a valid action).
    -   The selected modifiers groups and/or modifier group options do not match the requirements of the item substitute for minimum/maximum quantity.
    -   The selected modifiers groups and/or modifier group options do not belong to the requested item substitute.
-   Could the item substitute quantity larger than root item quantity?
    
    -   Yes, as long as the total price is less or equal than original price
-   Could merchants call the Patch/cart endpoint several times, up until the order has been picked up by the courier?
    
    -   Yes
-   Would the “PATCH CART API” also work on the child item level, in the cart(Items inside a modifier group)
    
    -   Only the specification of modifier groups for replacement is supported. If you need to change only one modifier option for one item, you have to send the whole item with the updated selection of modifier groups and options.

[

Authorization

](#authorization)[

Path Parameters

](#path-parameters)[

Request Body Parameters

](#request-body-parameters)[

Request Body Parameters - Fulfillment Issues

](#request-body-parameters-fulfillment-issues)[

Request Body Parameters - FulfillmentIssue

](#request-body-parameters-fulfillmentissue)[

Request Body Parameters - Item

](#request-body-parameters-item)[

Request Body Parameters - Item Substitute

](#request-body-parameters-item-substitute)[

Request Body Parameters - Modifier Group

](#request-body-parameters-modifier-group)[

Request Body Parameters - Modifier Group Option

](#request-body-parameters-modifier-group-option)[

Request Body Parameters - Item Quantity

](#request-body-parameters-item-quantity)[

Request Body Parameters - Quantity

](#request-body-parameters-quantity)[

Request Body Parameters - Measurement Unit

](#request-body-parameters-measurement-unit)[

Request Body Parameters - Weight

](#request-body-parameters-weight)[

Request Body Example

](#request-body-example)[

Response

](#response)[

FAQ

](#faq)
