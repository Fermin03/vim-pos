<!-- fuente: https://developer.uber.com/docs/eats/references/api/v2/get-eats-order-orderid -->
## Get Order Details

`GEThttps://api.uber.com/v2/eats/order/{order_id}`

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

This endpoint retrieves all details for a single order on Uber Eats.

##### Authorization

OAuth 2.0 Bearer token with at least one of the `eats.order` or `eats.store.orders.read` scopes. For more information, see [Authentication](/docs/eats/guides/authentication).

##### Encoding

The response payload for this endpoint may be very large. We highly recommend the use of a standard HTTP compression algorithm to optimise bandwidth usage and processing time. To opt-in, please add the following header:

| Header | Description |
| --- | --- |
| `Accept-Encoding` | Contains the compression algorithm used to compress the request payload. Compression algorithms currently supported: `gzip`. |

##### Path Parameters

| Name | Type | Description |
| --- | --- | --- |
| `order_id` | `UUID` | Unique identifying string for an order on Uber Eats. Provide this id when inquiring about a specific order. |

##### Response

```
{
  "id": "f9f363d1-e1c2-4595-b477-c649845bc953",
  "display_id": "BC953",
  "external_reference_id": "Order-123",
  "current_state": "CREATED",
  "store": {
    "id": "c7f1dc2f-fabe-4997-845c-cad26fdcb894",
    "name": "Harry's Hamburgers",
    "external_reference_id": "HARRY_123",
    "integrator_store_id": "Store123456ABC",
    "integrator_brand_id": "Brand123",
    "merchant_store_id": "HARRY_123"
  },
  "eater": {
    "first_name": "Larry",
    "phone": "+1 555-555-5555",
    "phone_code": "555 55 555"
  },
  "eaters": [
    {
      "id": "63578c8b-9cd2-4c4f-91fc-315f575e6a78",
      "first_name": "Larry",
    }
  ],
  "cart": {
    "items": [
      {
        "id": "Muffin",
        "instance_id": "Muffin-Instance",
        "title": "Fresh-baked muffin",
        "external_data": "External data for muffin",
        "quantity": 1,
        "price": {
          "unit_price": {
            "amount": 350,
            "currency_code": "USD",
            "formatted_amount": "$3.50"
          },
          "total_price": {
            "amount": 350,
            "currency_code": "USD",
            "formatted_amount": "$3.50"
          },
          "base_unit_price": {
            "amount": 300,
            "currency_code": "USD",
            "formatted_amount": "$3.00"
          },
           "base_non_loyalty_unit_price": {
            "amount": 400,
            "currency_code": "USD",
            "formatted_amount": "$4.00"
          },
          "base_total_price": {
            "amount": 300,
            "currency_code": "USD",
            "formatted_amount": "$3.00"
          },
          "taxInfo": {
            "labels": [
              "TEMP_HEATED",
              "CAT_PREPARED_FOOD"
            ]
          }
        },
        "selected_modifier_groups": [
          {
            "id": "Choose-flavor",
            "title": "Choose flavor",
            "external_data": "External data for muffin flavor choice",
            "selected_items": [
              {
                "id": "Chocolate-deluxe",
                "title": "Chocolate deluxe",
                "external_data": "External data for chocolate deluxe flavor",
                "quantity": 1,
                "price": {
                  "unit_price": {
                    "amount": 50,
                    "currency_code": "USD",
                    "formatted_amount": "$0.50"
                  },
                  "total_price": {
                    "amount": 50,
                    "currency_code": "USD",
                    "formatted_amount": "$0.50"
                  },
                  "base_unit_price": {
                    "amount": 50,
                    "currency_code": "USD",
                    "formatted_amount": "$0.50"
                  },
                  "base_non_loyalty_unit_price": {
                    "amount": 60,
                    "currency_code": "USD",
                    "formatted_amount": "$0.60"
                  },
                  "base_total_price": {
                    "amount": 50,
                    "currency_code": "USD",
                    "formatted_amount": "$0.50"
                  }
                },
                "default_quantity": 0
              }
            ],
            "removed_items": null
          }
        ],
        "eater_id": "63578c8b-9cd2-4c4f-91fc-315f575e6a78"
      },
      {
        "id": "Coffee",
        "instance_id": "CoffeeInstance",
        "title": "Coffee",
        "external_data": "External data for coffee",
        "special_instructions": "make it iced please",
        "quantity": 1,
        "price": {
          "unit_price": {
            "amount": 300,
            "currency_code": "USD",
            "formatted_amount": "$3.00"
          },
          "total_price": {
            "amount": 300,
            "currency_code": "USD",
            "formatted_amount": "$3.00"
          },
          "base_unit_price": {
            "amount": 300,
            "currency_code": "USD",
            "formatted_amount": "$3.00"
          },
           "base_non_loyalty_unit_price": {
            "amount": 400,
            "currency_code": "USD",
            "formatted_amount": "$4.00"
          },
          "base_total_price": {
            "amount": 300,
            "currency_code": "USD",
            "formatted_amount": "$3.00"
          }
        },
        "taxInfo": {
          "labels": [
            "TEMP_COLD",
            "CAT_COFFEE"
          ]
        },
        "selected_modifier_groups": [
          {
            "id": "Add-milk",
            "title": "Add milk",
            "external_data": "External data for milk choice",
            "selected_items": [
              {
                "id": "Milk",
                "title": "Milk",
                "external_data": "External data for milk",
                "quantity": 1,
                "price": {
                  "unit_price": {
                    "amount": 0,
                    "currency_code": "USD",
                    "formatted_amount": "$0.00"
                  },
                  "total_price": {
                    "amount": 0,
                    "currency_code": "USD",
                    "formatted_amount": "$0.00"
                  },
                  "base_unit_price": {
                    "amount": 0,
                    "currency_code": "USD",
                    "formatted_amount": "$0.00"
                  },
                  "base_total_price": {
                    "amount": 0,
                    "currency_code": "USD",
                    "formatted_amount": "$0.00"
                  }
                },
                "default_quantity": 0
              }
            ],
            "removed_items": null
          },
          {
            "id": "Add-sugar",
            "title": "Add sugar",
            "external_data": "External data for sugar choice",
            "selected_items": null,
            "removed_items": [
              {
                "id": "Sugar",
                "title": "Sugar",
                "external_data": "External data for sugar",
                "quantity": 0,
                "price": {
                  "unit_price": {
                    "amount": 0,
                    "currency_code": "USD",
                    "formatted_amount": "$0.00"
                  },
                  "total_price": {
                    "amount": 0,
                    "currency_code": "USD",
                    "formatted_amount": "$0.00"
                  },
                  "base_unit_price": {
                    "amount": 0,
                    "currency_code": "USD",
                    "formatted_amount": "$0.00"
                  },
                  "base_total_price": {
                    "amount": 0,
                    "currency_code": "USD",
                    "formatted_amount": "$0.00"
                  }
                },
                "default_quantity": 2
              }
            ]
          }
        ],
        "eater_id": "63578c8b-9cd2-4c4f-91fc-315f575e6a78"
      },
      {
        "id": "Strawberry_Donut",
        "instance_id": "Strawberry-Donut-Instance",
        "title": "Strawberry Donut",
        "external_data": "External data for strawberry donut",
        "quantity": 1,
        "price": {
          "unit_price": {
            "amount": 250,
            "currency_code": "USD",
            "formatted_amount": "$2.50"
          },
          "total_price": {
            "amount": 250,
            "currency_code": "USD",
            "formatted_amount": "$2.50"
          },
          "base_unit_price": {
            "amount": 200,
            "currency_code": "USD",
            "formatted_amount": "$2.00"
          },
          "base_non_loyalty_unit_price": {
            "amount": 300,
            "currency_code": "USD",
            "formatted_amount": "$3.00"
          },
          "base_total_price": {
            "amount": 200,
            "currency_code": "USD",
            "formatted_amount": "$2.00"
          },
          "taxInfo": {
            "labels": [
              "TEMP_COLD",
              "CAT_PREPARED_FOOD"
            ]
          }
        },
        "selected_modifier_groups": null,
        "eater_id": "63578c8b-9cd2-4c4f-91fc-315f575e6a78"
      },
    ],
    "fulfillment_issues": [
      {
        "fulfillment_issue_type": "OUT_OF_ITEM",
        "fulfillment_action_type": "REMOVE_ITEM",
        "root_item": {
          "id": "Muffin",
          "instance_id": "Muffin-Instance",
          "title": "Fresh-baked muffin",
          "external_data": "External data for muffin",
          "quantity": 1,
          "fulfillment_action": {
            "fulfillment_action_type": "REMOVE_ITEM"
          }
        },
        "item_availability_info": {
          "items_requested": 1,
          "items_available": 0
        }
      },
      {
        "fulfillment_issue_type": "PARTIAL_AVAILABILITY",
        "root_item": {
          "id": "Coffee",
          "instance_id": "CoffeeInstance",
          "title": "Coffee",
          "external_data": "External data for coffee",
          "quantity": 1,
          "fulfillment_action": {
            "fulfillment_action_type": "REMOVE_ITEM"
          }
        },
        "item_availability_info": {
          "items_requested": 2,
          "items_available": 1
        }
      },
      {
        "fulfillment_issue_type": "OUT_OF_ITEM",
        "fulfillment_action_type": "REPLACE_FOR_ME",
        "root_item": {
          "id": "Chocolate Donut",
          "instance_id": "Chocolate-Donut-Instance",
          "title": "Fresh-baked chocolate donut",
          "external_data": "External data for chocolate donut",
          "quantity": 1,
          "fulfillment_action": {
            "fulfillment_action_type": "SUBSTITUTE_ME",

          }
        },
        "item_availability_info": {
          "items_requested": 1,
          "items_available": 0
        },
        "item_substitute": {
          "id": "Strawberry_Donut",
          "title": "Strawberry Donut",
          "external_data": "External data for strawberry donut",
          "quantity": 1,
          "price": {
            "unit_price": {
                "amount": 250,
                "currency_code": "USD",
                "formatted_amount": "$2.50"
            },
            "total_price": {
                "amount": 250,
                "currency_code": "USD",
                "formatted_amount": "$2.50"
            },
            "base_unit_price": {
                "amount": 200,
                "currency_code": "USD",
                "formatted_amount": "$2.00"
            },
            "base_total_price": {
                "amount": 200,
                "currency_code": "USD",
                "formatted_amount": "$2.00"
            }
          },
          "selected_modifier_groups": null,
          "special_instructions": "",
          "instance_id": "Strawberry-Donut-Instance"
        }
      },
    ]
  },
  "payment": {
    "charges": {
      "total": {
        "amount": 1399,
        "currency_code": "USD",
        "formatted_amount": "$13.99"
      },
      "sub_total": {
        "amount": 650,
        "currency_code": "USD",
        "formatted_amount": "$6.50"
      },
      "tax": {
        "amount": 52,
        "currency_code": "USD",
        "formatted_amount": "$0.52"
      },
      "total_fee": {
        "amount": 697,
        "currency_code": "USD",
        "formatted_amount": "$6.97"
      },
      "cash_amount_due": {
        "amount": 1399,
        "currency_code": "USD",
        "formatted_amount": "$13.99"
      }
    },
    "accounting": {
      "taxRemittance": {
        "tax": {
          "uber": [
            {
              "value": {
                "amount": 53,
                "currencyCode": "USD",
                "formattedAmount": "$0.53"
              }
            }
          ],
          "restaurant": null,
          "courier": null,
          "eater": null
        },
        "totalFeeTax": null,
        "deliveryFeeTax": null,
        "smallOrderFeeTax": null
      },
      "tax_reporting": {
        "breakdown": {
          "items": [
            {
              "description": "ITEM",
              "gross_amount": {
                "amount": 376,
                "currency_code": "USD",
                "formatted_amount": "$3.76"
              },
              "instance_id": "Muffin-Instance",
              "net_amount": {
                "amount": 350,
                "currency_code": "USD",
                "formatted_amount": "$3.50"
              },
              "taxes": [
                {
                  "calculated_tax": {
                    "amount": 26,
                    "currency_code": "USD",
                    "formatted_amount": "$0.26"
                  },
                  "imposition": {
                    "description": "General Sales and Use Tax",
                    "name": "Sales and Use Tax"
                  },
                  "is_inclusive": false,
                  "jurisdiction": {
                    "level": "STATE",
                    "name": "PENNSYLVANIA"
                  },
                  "rate": "0.06",
                  "tax_remittance": "UBER",
                  "taxable_amount": {
                    "amount": 350,
                    "currency_code": "USD",
                    "formatted_amount": "$3.50"
                  }
                }
              ],
              "total_tax": {
                "amount": 26,
                "currency_code": "USD",
                "formatted_amount": "$0.27"
              }
            },
            {
              "description": "ITEM",
              "gross_amount": {
                "amount": 3.27,
                "currency_code": "USD",
                "formatted_amount": "$3.27"
              },
              "instance_id": "CoffeeInstance",
              "net_amount": {
                "amount": 300,
                "currency_code": "USD",
                "formatted_amount": "$3.00"
              },
              "taxes": [
                {
                  "calculated_tax": {
                    "amount": 27,
                    "currency_code": "USD",
                    "formatted_amount": "$0.27"
                  },
                  "imposition": {
                    "description": "General Sales and Use Tax",
                    "name": "Sales and Use Tax"
                  },
                  "is_inclusive": false,
                  "jurisdiction": {
                    "level": "STATE",
                    "name": "PENNSYLVANIA"
                  },
                  "rate": "0.06",
                  "tax_remittance": "UBER",
                  "taxable_amount": {
                    "amount": 300,
                    "currency_code": "USD",
                    "formatted_amount": "$3.00"
                  }
                }
              ],
              "total_tax": {
                "amount": 27,
                "currency_code": "USD",
                "formatted_amount": "$0.27"
              }
            }
          ]
        },
        "destination": {
          "country_iso2": "US",
          "id": "390170000",
          "postal_code": "18966"
        },
        "origin": {
          "country_iso2": "US",
          "id": "390170000",
          "postal_code": "19053"
        }
      }
    }
  },
  "placed_at": "2019-05-14T15:16:54-05:00",
  "estimated_ready_for_pickup_at": "2019-05-14T15:36:54-05:00",
  "type": "DELIVERY_BY_UBER",
  "brand": "UBER_EATS",
  "order_manager_client_id": "_ZIpOrYABMOFy3-igFpdeREBos1DZ",
  "deliveries": [
    {
      "id": "65d700da-1e9d-41a7-a304-d0fdcd12b2e4",
      "first_name": "Bruce",
      "vehicle": {
        "make": "Uber",
        "model": "Bicycle",
        "license_plate": "BICYCLE"
      },
      "picture_url": "https://www.example.com/picture_url",
      "estimated_pickup_time": "2019-05-14T15:38:45-05:00",
      "current_state": "ARRIVED_AT_PICKUP",
      "phone": "+13127666835",
      "phone_code": "31023259"
    }
  ]
}
```

#### Response Body

##### Response Body - Order

**An order placed on the Uber Eats platform.**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Required | Unique identifying string for an order on Uber Eats. Typically referred to as the “Order UUID”.  
  
Provide this id when inquiring about a specific order. |
| `display_id` | string | Required | 5-character display friendly ID, used by stores and delivery partners to identify the order.  
  
The 5 digits represent the last 5 characters of the Order UUID (`id` field). This is the order ID displayed on Uber Eats Orders (the Uber Eats in-store order management app, which is tablet, mobile and web accessible). |
| `external_reference_id` | string | Optional | If the order was accepted via API **and** an optional custom/3rd party order ID was supplied as an `external_reference_id` when programmatically posting order acceptance (see [Menu API - Accept Order Request Parameters](/docs/eats/references/api/v1/eats-order-order_id-accept_pos_order-post#request-parameters)), the optional ID will be returned here. |
| `current_state` | string (**enum**) | Required | The current state of the order. For details on each state see [Guides - Order State](/docs/eats/guides/order-states).  
  
**ALLOWED VALUES**:
-   `CREATED`
-   `ACCEPTED`
-   `DENIED`
-   `FINISHED`
-   `CANCELED`
-   `UNKNOWN`

 |
| `type` | string (**enum**) | Required | The dining type of the order.  
  
By default, merchants on Uber Eats only have the option for the delivery to be fulfilled by Uber (`DELIVERY_BY_UBER`).  
  
All other order types can only be enabled by Uber Eats. Reach out to your Uber Eats Account Manager to enable.  
  
**ALLOWED VALUES**:

-   `PICK_UP`: Self Pickup by Customers
-   `DINE_IN`: Dining in-store
-   `DELIVERY_BY_UBER`: Uber provided delivery.
-   `DELIVERY_BY_RESTAURANT`: Merchant provided delivery.

  
For `DELIVERY_BY_RESTAURANT` orders, additional order details (e.g. `tip`) will be provided. These fields are marked on this reference page as **(Merchant delivery only)**.  
  
**NOTE:** For orders that will be fulfilled by Uber or Postmates, the `type` will be `DELIVERY_BY_UBER`. If you would like to distinguish orders between brands, use the `brand` field. |
| `brand` | string (**enum**) | Required | The brand under which the order was placed.  
  
**ALLOWED VALUES**:

-   `UBER_EATS`
-   `POSTMATES`

 |
| `store` | [Store](#response-body-store) | Optional | Details of the Store for which the order was placed. |
| `eater` | [Eater](#response-body-eater) | Required | Details of the customer that placed the order. |
| `eaters` | [Eater\[\]](#response-body-eater) | Optional | The list of customers participating in the order. Useful to associate Eaters to a cart item in a group order. |
| `cart` | [Cart](#response-body-cart) | Required | The shopping cart associated with an order. |
| `payment` | [Payment](#response-body-payment) | Required | Payment information related to an order. |
| `packaging` | [Packaging](#response-body-packaging) | Optional | Packaging information related to an order. |
| `placed_at` | string | Optional | The time at which the order was placed, represented in ISO\_8601 with the local timezone fixed offset. The expected format is `yyyy-mm-dd'T'HH:mm:ss+offset`. For example, the timezone offset for New York on standard, non-daylight savings time would be “−05:00” (UTC-05:00).  
  
**EXAMPLE** “2019-05-14T15:16:54-05:00” |
| `estimated_ready_for_pickup_at` | string | Optional | The time Uber predicts food will be ready for pick-up, represented in ISO\_8601 with the local timezone fixed offset. The expected format is `yyyy-mm-dd'T'HH:mm:ss+offset`. For example, the timezone offset for New York on standard, non-daylight savings time would be “−05:00” (UTC-05:00).  
  
This is a predicted time and may fluctuate depending on various historical and real-time factors.  
  
**EXAMPLE** “2019-05-14T15:36:54-05:00” |
| `deliveries` | [EatsDelivery\[\]](#response-body-eats-delivery) | Required | A list of Uber Eats-provided delivery details for the order. This list will be populated for merchants once one or more Uber Eats-provided delivery partner(s) are scheduled for the order. |
| `order_manager_client_id` | string | Optional | The client ID acting as _Order Manager_ for the store.  
  
**NOTE:** This may be redacted or masked. Compare this against the client ID in the response headers to find out if that is this integration. |

##### Response Body - Store

**Details for the Store for which the order was placed.**

| Name | Type | Description |
| --- | --- | --- |
| `id` | string | Unique identifier for the store, provided by Uber Eats. Typically referred to as the store UUID. |
| `name` | string | Name of the store. |
| `integrator_store_id` | string | External store identifier, leveraged by the integration |
| `integrator_brand_id` | string | External brand identifier, regrouping a set of stores (ex: a chain), leveraged by the integration |
| `merchant_store_id`  
~`external_reference_id`~ | `string` | The store ID provided to Uber for merchant mapping and reporting purposes. This field will be omitted if a mapping has not been set up. To update the `merchant_store_id` for a given store, the merchant should contact their Uber account team. Each integration partner can store and update their own IDs via [`PATCH /pos_data`](/docs/eats/api/v1/patch-eats-stores-storeid-posdata). |

##### Response Body - Eater

**Details for the Eater that placed the order.**

| Name | Type | Description |
| --- | --- | --- |
| `first_name` | string | The first name of the Eater. |
| `last_name` | string | The last name initial of the Eater. This is only available when returned in the eater field. |
| `phone` | string | The anonymized phone number of the Eater. This is only available when returned in the eater field. |
| `phone_code` | string | The phone code to access the phone number above. This is only available when returned in the eater field. |
| `id` | string | Eater’s unique identifier for the order, useful to associate items to each group order’s participant. This is only available when returned as part of the eaters array. |
| `corporate_tax_id_taiwan` | string | **(Taiwan market only)** Business ID number. |
| `tax_profile` | [TaxProfile](#response-body-taxprofile) | Eater’s tax profile information. |
| `delivery` | [Delivery](#response-body-delivery) | **(Merchant delivery only)** Details for a delivery to be fulfilled by a merchant-provided courier. For Uber-coordinated delivery, the delivery object is omitted. This is only available when returned in the eater field. |

##### Response Body - TaxProfile

**Tax profile of the eater.**

| Name | Type | Description |
| --- | --- | --- |
| `tax_profile_metadata` | [TaxProfileMetadata](#response-body-taxprofilemetadata) | Details of the eater’s tax profile information. |

##### Response Body - TaxProfileMetadata

**Details of the eater’s tax profile.**

| Name | Type | Description |
| --- | --- | --- |
| `mobile_barcode` | string | **(Taiwan market only)** Mobile barcode. |
| `digital_certificate_code` | string | **(Taiwan market only)** Citizen digital certificate. |
| `donation_code` | string | **(Taiwan market only)** Donation code. |

##### Response Body - Delivery

**Details for a delivery to be fulfilled by a merchant-provided courier. For all other fulfillment types including Uber-coordinated delivery, the delivery object is omitted.**

| Name | Type | Description |
| --- | --- | --- |
| `location` | [Location](#response-body-location) | **(Merchant delivery only)** The physical location for the delivery. |
| `type` | string **(enum)** | **(Merchant delivery only)** The kind of dropoff requested by the Eater.  
  
**ALLOWED VALUES:**
-   DELIVER\_TO\_DOOR
-   CURBSIDE
-   LEAVE\_AT\_DOOR

 |
| `notes` | string | **(Merchant delivery only)** Eater-provided instructions for delivery. These should be provided to the courier. |

##### Response Body - Eats Delivery

**Details for a delivery to be fulfilled by an Uber Eats-provided delivery partner.**

| Name | Type | Description |
| --- | --- | --- |
| `id` | string | The specific identifier of a delivery associated with the order. |
| `first_name` | string | The first name of the delivery partner. This is only provided during active orders once a delivery partner is en route to pickup an order. |
| `vehicle` | [Vehicle](#response-body-vehicle) | Details for the vehicle used by the delivery partner. This is only provided during active orders once a delivery partner is en route to pickup an order. |
| `picture_url` | string | The picture url of a delivery partner associated with the order. This is only provided during active orders once a delivery partner is en route to pickup an order. |
| `estimated_pickup_time` | string | The estimated time that a delivery partner will come pickup an order, represented in ISO\_8601 with the local timezone fixed offset. The expected format is `yyyy-mm-dd'T'HH:mm:ss+offset`. For example, the timezone offset for New York on standard, non-daylight savings time would be “−05:00” (UTC-05:00).  
  
**EXAMPLE** “2021-02-12T15:16:54-05:00”  
  
This is only provided for active orders once a delivery partner is being scheduled to pickup an order. |
| `current_state` | string **(enum)** | The current state of the delivery associated with the order.  
  
**ALLOWED VALUES:**
-   SCHEDULED
-   EN\_ROUTE\_TO\_PICKUP
-   ARRIVED\_AT\_PICKUP
-   EN\_ROUTE\_TO\_DROPOFF
-   COMPLETED
-   FAILED

 |
| `phone` | string | If available, this is the anonymized phone number of the assigned delivery partner. It will have to be used with the `phone_code` to connect the call. |
| `phone_code` | string | If an anonymized phone number is available, this code is used alongside the phone number to make calls to the assigned delivery partner. |

##### Response Body - Vehicle

**Details of the vehicle used by an Uber Eats-provided delivery partner.**

| Name | Type | Description |
| --- | --- | --- |
| `make` | string | The make of a delivery partner’s vehicle. |
| `model` | string | The model of a delivery partner’s vehicle. This field will also indicate whether a delivery partner is using a bicycle or walking. |
| `color` | string | The color of a delivery partner’s vehicle. This field is not available for all vehicles. |
| `license_plate` | string | The license plate of a delivery partner’s vehicle. This field will also indicate whether a delivery partner is using a bicycle or walking. |
| `is_autonomous` | boolean | Indicates whether a delivery partner is using an autonomous vehicle. |
| `handoff_instructions` | string | Instructions for how to handoff an order to a delivery partner. This field is only available for orders that are being delivered by an autonomous vehicle. |
| `passcode` | string | The passcode to unlock an autonomous vehicle. This field is only available for orders that are being delivered by a autonomous vehicle. |

##### Response Body - Location

**Details relating to the physical location for a delivery to be fulfilled by a merchant-provided courier. For all other fulfillment types including Uber-coordinated delivery, the location object is omitted.**

| Name | Type | Description |
| --- | --- | --- |
| `type` | string **(enum)** | **(Merchant delivery only)** Indicates which location field will be provided.  
  
**ALLOWED VALUES:**
-   STREET\_ADDRESS
-   GOOGLE\_PLACE

 |
| `street_address` | string | **(Merchant delivery only)** The full street address as a single-line formatted string. Will only be provided when type = STREET\_ADDRESS |
| `latitude` | number | **(Merchant delivery only)** The latitude for the location. Will only be provided when type = STREET\_ADDRESS |
| `longitude` | number | **(Merchant delivery only)** The longitude for the location. Will only be provided when type = STREET\_ADDRESS |
| `google_place_id` | string | **(Merchant delivery only)** A unique identifier for the location in the Google Places database. Will only be provided when type = GOOGLE\_PLACE |
| `unit_number` | string | **(Merchant delivery only)** The apartment number or suite, if provided. |
| `business_name` | string | **(Merchant delivery only)** Name of the building or business, if provided. |
| `title` | string | **(Merchant delivery only)** The first line address entered by the eater, if provided. |

##### Response Body - Payment

**Payment related to an order.**

| Name | Type | Description |
| --- | --- | --- |
| `charges` | [Charges](#response-body-charges) | The various charges that compose the payment for an order. |
| `accounting` | [Accounting](#response-body-accounting) | Contains the accounting level details associated with order |
| `promotions` | [Promotions](#response-body-promotions) | Contains the promotions associated with the order. If the order does not have a promotion applied, this field will be null.  
  
**CONFIGURATION ONLY BY UBER EATS**: The promotions data is currently blacklisted for active Uber developers who have used the _Get Order Details_ endpoint in 2020 to ensure changes do not have any adverse effects on production integrations. If you wish to receive the promotions data in _Get Order Details_, please request it from the Uber technical teams with whom you have direct correspondence from when you began your integration. If the promotions data is not enabled for your application, you will not receive these fields in _Get Order Details_ |

##### Response Body - Accounting

**Accounting contains the elements related to accounting of the order.**

**Note:** The `accounting` object will only appear in order payloads where the store is in a Marketplace Facilitator state. For more information on Marketplace Facilitator legislation, please visit [this article](https://merchants.ubereats.com/us/en/resources/learning-center/marketplace-facilitator/).

| Name | Type | Description |
| --- | --- | --- |
| `tax_remittance` | [TaxRemittance](#response-body-tax-remittance) | Its one element of order contains the tax remittance details. |
| `tax_reporting` | [TaxReporting](#response-body-tax-reporting) | Provides a granular view of taxes in the order, broken down for line items and fees.
**CONFIGURATION ONLY BY UBER EATS:** The tax reporting data is currently restricted to active Uber developers who have requested to receive this breakdown. If you wish to receive the tax reporting breakdown in _Get Order Details_, please contact the Uber technical team to have this field enabled. |

##### Response Body - Tax Remittance

**Contains the details of tax line items**

| Name | Type | Description |
| --- | --- | --- |
| `tax` | [RemittanceInfo](#response-body-remittance-info) | Entity wise tax breakdown |
| `total_fee_tax` | [RemittanceInfo](#response-body-remittance-info) | Entity wise tax breakdown |
| `delivery_fee_tax` | [RemittanceInfo](#response-body-remittance-info) | Entity wise tax breakdown |
| `small_order_fee_tax` | [RemittanceInfo](#response-body-remittance-info) | Entity wise tax breakdown |

##### Response Body - Remittance Info

**Contains the tax breakdown of each tax line item**

| Name | Type | Description |
| --- | --- | --- |
| `uber` | [PayeeDetail\[\]](#response-body-payee-detail) | Contains the Payee details this entity need to remit |
| `restaurant` | [PayeeDetail\[\]](#response-body-payee-detail) | Contains the Payee details this entity need to remit |
| `courier` | [PayeeDetail\[\]](#response-body-payee-detail) | Contains the Payee details this entity need to remit |
| `eater` | [PayeeDetail\[\]](#response-body-payee-detail) | Contains the Payee details this entity need to remit |

##### Response Body - Payee Detail

**Contain information about Payee and amount needed to pay.**

| Name | Type | Description |
| --- | --- | --- |
| `value` | [Money](#response-body-money) | The cost this entity needs to remit. |

##### Response Body - Tax Reporting

**Contains detailed information about the tax charges calculated on the order.**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `breakdown` | [TaxBreakdown](#response-body-tax-breakdown) | Optional | A breakdown of taxes on the order. |
| `origin` | [TaxLocation](#response-body-tax-location) | Optional | The tax location information for the orders origin. |
| `destination` | [TaxLocation](#response-body-tax-location) | Optional | The tax location information for the orders destination. |

##### Response Body - Tax Breakdown

**Contains a breakdown of tax charges in the order.**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `items` | [TaxInfo\[\]](#response-body-tax-info) | Optional | A list of tax items, where each entry provides details of the taxes calculated for a given `instance_id` or `type`. |
| `fees` | [TaxInfo\[\]](#response-body-tax-info) | Optional | A list of tax items, where each entry provides details of the taxes calculated on fees that are associated with a given `instance_id` or `type`. |
| `promotions` | [TaxInfo\[\]](#response-body-tax-info) | Optional | A list of tax items, where each entry provides details of the taxes calculated on promotions that are associated with a given `instance_id` or `type`. |

##### Response Body - Tax Info

**Represents a single tax item. Its intent is to provide a granular view of the tax charges related to an `instance_id` or `type`.**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `instance_id` | string | Optional | The UUID of the [**Cart Item**](#response-body-item) that this charge references.
When provided, this indicates an association between this tax charge and a cart item.

Outside of US/CAN, this is used to associate fees to food items (i.e. the proportional cost of the delivery fee to deliver an item).

If empty, it indicates that the charge is not associated with a specific cart item.

 |
| `type` | string | Optional | An identifier that outlines the type of charge (i.e. Delivery Fee, Promotion, etc).

When `instance_id` is empty, the `type` can be used to identify what the type of tax charge.

**Valid Types:**

-   `DELIVERY_FEE`
-   `SERVICE_FEE`
-   `SMALL_ORDER_FEE`
-   `DELIVERY_FEE_CORRECTION`
-   `MERCHANT_SERVICE_FEE`
-   `PICK_AND_PACK_FEE`
-   `PRIORITY_DELIVERY_FEE`
-   `UPDATE_DROPOFF_LOCATION`
-   `DELIVERY_FEE_CORRECTION`
-   `DELIVERY_FEE_PROMOTION`
-   `ITEM_PROMOTION`
-   `ITEM`

 |
| `gross_amount` | [Money](#response-body-money) | Optional | The total amount of the charge including taxes for this item. |
| `net_amount` | [Money](#response-body-money) | Optional | The total amount of the charge less any taxes applicable to the item. |
| `total_tax` | [Money](#response-body-money) | Optional | The total amount of tax calculated.

**NOTE:** Regardless of whether the region follows tax inclusive or tax exclusive pricing, if there is tax calculated on the item, this field is expected to be non-zero. |
| `taxes` | [Tax\[\]](#response-body-taxes) | Optional | A list of the individual taxes calculated that form `total_tax`. |

##### Response Body - Tax

**Contains information about a single calculated tax.**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `rate` | string | Required | The rate that was used to calculate tax. |
| `tax_amount` | [Money](#response-body-money) | Required | The amount of tax that was calculated. |
| `is_inclusive` | boolean | Required | Identifies if the tax amount is included into a given charge amount or is applied in addition to.
**Example:**

Charge Amount: $1.00  
Tax Rate: 10%

`is_inclusive = true`  
`gross_amount = $1.00`  
`net_amount = $0.91`  
`tax_amount = $0.09`

`is_inclusive = false`  
`gross_amount = $1.10`  
`net_amount = $1.00`  
`tax_amount = $0.10`

 |
| `jurisdiction` | [Jurisdiction](#response-body-jurisdiction) | Optional | Details on the tax jurisdiction that is collecting the tax. |
| `imposition` | [Imposition](#response-body-imposition) | Optional | Details the tax being imposed. |
| `tax_remittance` | string(enum) | Optional | Identifies the entity that is responsible for remitting the tax.

**Allowable Values:**  

-   `UBER`
-   `MERCHANT`

 |

##### Response Body - Jurisdiction

**Provides details as to the tax authority that is responsible for collecting the calculated tax.**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `level` | string | Optional | The subdivision level that is applying the tax.
**Possible Values:**

-   `CITY`
-   `STATE`
-   `COUNTY`
-   `DISTRICT`

 |
| `name` | string | Optional | The name of the jurisdiction collecting tax. |

##### Response Body - Imposition

**Provides details as to the type of tax that was imposed or enforced.**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `description` | string | Optional | The type of imposition on a given tax. |
| `name` | string | Optional | The name of the imposition. |

##### Response Body - Tax Location

**Contains the tax location information for a given entity.**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Optional | The location as identified by Uber Tax. |
| `country_iso2` | string | Optional | The ISO2 country code. |
| `postal_code` | string | Optional | The postal or zip code. |

##### Response Body - Promotions

**Contains the promotions applied to the order.**

| Name | Type | Description |
| --- | --- | --- |
| `promotions` | [Promotion\[\]](#response-body-promotion) | A list of promotions applied to the order. |

##### Response Body - Promotion

**Contains information about the Promotion.**

| Name | Type | Description |
| --- | --- | --- |
| `external_promotion_id` | string | This is the external partner’s promotion id. |
| `promo_type` | string (**enum**) | The type of promotion.  
  
**ALLOWED VALUES**:
-   `FLATOFF`
-   `PERCENTOFF`
-   `FREEITEM_MINBASKET`
-   `CATEGORY_DISCOUNT`
-   `BOGO`
-   `FREEDELIVERY`
-   `MENU_ITEM_DISCOUNT`

 |
| `promo_discount_value` | integer | This is the discount value as part of the promo, represented as an integer in the smallest denomination of the currency.  
  
**EXAMPLE** An amount of 50 and a currency code of USD represents 50 pennies, since a penny is the smallest unit of currency in USD. |
| `promo_discount_percentage` | integer | This is the discount percentage as part of the promo, represented as an integer. If the promo was calculatd using percentage instead of saved values, this field will be populated.  
  
**EXAMPLE** A free delivery promo would also indicate what percentage of the delivery fee is covered by the promotion i.e. 100%. A category item discount is calculated based on menu item price and will only return the promotion discount value. |
| `promo_delivery_fee_value` | integer | This indicates the delivery fee value applied from the promotion. |
| `discount_items` | [DiscountItem\[\]](#response-body-discount-item) | This is a list of cart items with a discount applied. |
| `promotion_uuid` | string | This is the unique promotion uuid associated with promotion. |
| `promo_funding_splits` | [PromoFundingSplit\[\]](#response-body-promo-funding-split) | This is a array of funding splits which tells which fund provider paid how much. |

##### Response Body - Promo Funding Split

**Contains the details of fund provider and amount paid.**

| Name | Type | Description |
| --- | --- | --- |
| `funding_source` | string | This indicates who was the fund provider (uber/organization). |
| `amount_paid` | [Money](#response-body-money) | This indicates the amount paid by the above fund provider for this promotion. |

##### Response Body - Discount Item

**Contains the discount details for an item.**

| Name | Type | Description |
| --- | --- | --- |
| `external_id` | string | This is the external partner’s id for an item. |
| `discounted_quantity` | integer | This is the quantity of the item with a promo applied |
| `discount_amount_applied` | integer | This is the breakdown saving amount for the certain items with the corresponding disconted\_quantity.  
  
**EXAMPLE** EXAMPLE: “-5000” means the order saves 50 in local currency for the target items.
**CONFIGURATION ONLY BY UBER EATS:** The item-level discount amount is currently restricted to active Uber developers who have requested to receive this breakdown. If you wish to receive this item-level discount breakdown in _Get Order Details_, please contact the Uber technical team to have this field enabled. |

##### Response Body - Packaging

**Details related to the packaging of the order.**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `disposable_items` | [DisposableItems](#response-body-disposable-items) | optional | Details related to the disposable items packaged with the order. |

##### Response Body - Disposable Items

**Details related to the disposable items packaged with the order.**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `should_include` | boolean | optional | Whether the Merchant should include disposable items with the order.
**Note:** In the case where this field is **null**, it indicates that no selection has been made and it is at the Merchants discretion to include disposable items.

 |

##### Response Body - Cart

**The shopping cart associated with an order.**

| Name | Type | Description |
| --- | --- | --- |
| `items` | [Item](#response-body-item)\[\] | All of the line items contained within the shopping cart. |
| `special_instructions` | string | **Order-level instructions** from an Eater pertaining to the preparation of this order.  
  
**CONFIGURATION ONLY BY UBER EATS**: There are two types of special instructions, item-level (see [**Response Body - Item**](#response-body-item)) and order-level. Unlike item-level special instructions, order-level instructions are **not configurable** by API. By default order-level instructions are disabled for POS-integrated stores. When this feature is disabled customers cannot enter order-level instructions when checking out on Uber Eats. Order-level instructions can be enabled by Uber Eats once this capability has been verified for your integration. |
| `fulfillment_issues` | [FulfillmentIssue](#response-body-fulfillmentissue) | List of fulfillment issues with an order, which is an array of FulfillmentIssue. |

##### Response Body - Charges

**The various charges that compose the payment for an order.**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `total` | [Money](#response-body-money) | optional | The cost of the entire order, including taxes and fees that will be paid out to the Merchant excluding Marketplace Fees.
**Note**: For regions in which [Marketplace Facilitator](https://merchants.ubereats.com/us/en/resources/learning-center/marketplace-facilitator/) is applicable, the total **will not include** the taxes in which Uber has remittance obligations. |
| `sub_total` | [Money](#response-body-money) | optional | The total cost of each line item in the cart. |
| `tax` | [Money](#response-body-money) | optional | The sum of all taxes calculated on `sub_total`. |
| `total_fee` | [Money](#response-body-money) | optional | The total of the fees charged on the order that will be paid out to the Merchant.

**Note:** Fees vary per region, and not all fees charged to Eaters are expected to be remitted to the Merchant (i.e. Uber Service Fees). |
| `total_fee_tax` | [Money](#response-body-money) | optional | The total tax charged on `total fee`. |
| `bag_fee` | [Money](#response-body-money) | optional | The fee charged to the Eater to provide a bag(s) for the order. |
| `total_promo_applied` | [Money](#response-body-money) | optional | The cost of the entire order, including taxes, fees and any Merchant Funded Promotion. For orders in which no such promotions were applied, this field will be null.  
  
**CONFIGURATION ONLY BY UBER EATS**: The promotions data is currently blacklisted for active Uber developers who have used the _Get Order Details_ endpoint in 2020 to ensure changes do not have any adverse effects on production integrations. If you wish to receive the promotions data in _Get Order Details_, please request it from the Uber technical teams with whom you have direct correspondence from when you began your integration. If the promotions data is not enabled for your application, you will not receive these fields in _Get Order Details_

**Note**: For regions in which [Marketplace Facilitator](https://merchants.ubereats.com/us/en/resources/learning-center/marketplace-facilitator/) is applicable, the total **will not include** the taxes in which Uber has remittance obligations. |
| `sub_total_promo_applied` | [Money](#response-body-money) | optional | The total cost of each line item in the cart with Merchant Funded Promotions applied. For orders in which no such promotions were applied, this field will be null.  
  
**CONFIGURATION ONLY BY UBER EATS**: The promotions data is currently blacklisted for active Uber developers who have used the _Get Order Details_ endpoint in 2020 to ensure changes do not have any adverse effects on production integrations. If you wish to receive the promotions data in _Get Order Details_, please request it from the Uber technical teams with whom you have direct correspondence from when you began your integration. If the promotions data is not enabled for your application, you will not receive these fields in _Get Order Details_ |
| `tax_promo_applied` | [Money](#response-body-money) | optional | The sum of all taxes calculated on `sub_total_promo_applied`. For orders in which no such promotions were applied, this field will be null.  
  
**CONFIGURATION ONLY BY UBER EATS**: The promotions data is currently blacklisted for active Uber developers who have used the _Get Order Details_ endpoint in 2020 to ensure changes do not have any adverse effects on production integrations. If you wish to receive the promotions data in _Get Order Details_, please request it from the Uber technical teams with whom you have direct correspondence from when you began your integration. If the promotions data is not enabled for your application, you will not receive these fields in _Get Order Details_ |
| `pick_and_pack_fee` | [Money](#response-body-money) | optional | The fee charged to the Eater for fulfilling (picking and packing) the order. |
| `delivery_fee` | [Money](#response-body-money) | optional | **(Merchant Delivery Only)** The fee charged to the Eater and paid to the Merchant to deliver the order

**Note** This fee is returned when charged for Merchants that are contractually responsible for delivery. |
| `delivery_fee_tax` | [Money](#response-body-money) | optional | **(Merchant Delivery Only)** Tax charged on the `delivery_fee`. |
| `small_order_fee` | [Money](#response-body-money) | optional | **(Merchant delivery only)** The fee charged to the Eater and paid to the Merchant for orders that are below a defined threshold

**Note** This fee is returned when charged for Merchants that are contractually responsible for delivery. |
| `small_order_fee_tax` | [Money](#response-body-money) | optional | **(Merchant delivery only)** Tax charged on the `small_order_fee`. |
| `tip` | [Money](#response-body-money) | optional | **(Merchant delivery only)** The tip amount (additional service gratuity) that the Eater has set for the delivery provider. |
| `cash_amount_due` | [Money](#response-body-money) | optional | **(Merchant delivery only)** The amount of cash to be collected from the Eater for this order.  
  
Please note that the cash amount to collect may not equal the `total` as Eater credits, Uber Funded Promotions and additional Eater charges may impact the order total that the Eater is responsible for, which may differ from the order `total` that the Merchant is expected to receive. |
| `marketplace_fee_due_to_uber` | [Money](#response-body-money) | optional | **(Merchant delivery only)** The marketplace fee applies ONLY to orders that stores deliver on their own. This fee is charged by Uber to the Eater. \[For cash orders, this fee will be collected by merchants’ delivery staff on behalf of Uber.\] |

##### Response Body - Item

**An item within an order’s shopping cart.**

| Name | Type | Description |
| --- | --- | --- |
| `id` | string | Unique identifying string for the item, provided by the store. |
| `instance_id` | string | Unique identifying string for the shopping cart item, provided by Uber. |
| `title` | string | The menu title for the item. |
| `external_data` | string | Free-form text field reserved for metadata supplied by the store. |
| `quantity` | integer | Quantity of the item. |
| `price` | [ItemPrice](#response-body-itemprice) | Price information for an item. |
| `selected_modifier_groups` | [ModifierGroup](#response-body-modifiergroup)\[\] | Any modifier groups for this item. |
| `special_requests` | [SpecialRequests](#response-body-special-requests)\[\] | Special requests for this item. |
| `default_quantity` | integer | Default quantity of the item. |
| `special_instructions` | string | **Item-level** instructions from an Eater pertaining to the preparation of this item, configurable via API (see [Upload Menu - Request Body Parameters DisplayOptions](/eats-stores-store_id-menu-put#request-body-parameters-displayoptions)).  
  
**IMPORTANT:** Eaters may utilize this field to provide allergy information. If your integration is **not** able to accept item-level instructions, set disable\_item\_instructions to true when uploading your menu. If disable\_item\_instructions is set to false, this feature will be enabled and Eaters will have the ability to provide item-level instructions at checkout.  
  
In addition to item-level instructions, there are also order-level special instructions (see [**Response Body - Cart**](#response-body-cart)). |
| `fulfillment_action` | [FulfillmentAction](#response-body-fulfillmentaction) | Shopper preferences in case the item is OOI (out-of-item). |
| `eater_id` | string | Item’s eater id, this property indicates the eater that ordered this item, this is useful for group orders, to map items with participants. |
| `tax_info` | [TaxInfo](#response-body-taxinfo) | Tax information for a cart item. |

##### Response Body - FulfillmentIssue

**Provides the details of the substitution applied by the merchant or picker in case the original item was unavailable.**

| Name | Type | Description |
| --- | --- | --- |
| `fulfillment_issue_type` | string(**enum**) | The type of fulfillmentIssue.  
  
**ALLOWED VALUES**:
-   `OUT_OF_ITEM`
-   `PARTIAL_AVAILABILITY`

 |
| `fulfillment_action_type` | string(**enum**) | The action selected taken by the merchant to address the fulfillment issue if the fulfillment\_issue\_type is OUT\_OF\_ITEM.  
  
**ALLOWED VALUES**:

-   `REPLACE_FOR_ME`
Choose replacement for shopper.-   `SUBSTITUTE_ME`
Only an item in item\_substitutes can be used as replacement.-   `CANCEL`
Cancel the order if the item is unavailable.-   `REMOVE_ITEM`
Remove item if it’s unavailable.

 |
| `root_item` | [Item](#response-body-item) | The root item for which the issue exists. |
| `item_availability_info` | [ItemAvailabilityInfo](#response-body-item-availability-info) | The availability of the replacement item. |
| `item_substitute` | [Item](#response-body-item) | The item that was used as substitute. |

##### Response Body - Item Availability Info

**Provides the preferences selected by shopper incase the item is unavailable.**

| Name | Type | Description |
| --- | --- | --- |
| `items_requested` | int | The number of items requested. This should be equal to the quantity of the item on the original order. |
| `items_available` | int | The number of items available. This should be either:-   the item\_substitute availability in case of fulfillment\_action\_type: **REPLACE\_FOR\_ME** or **SUBTITUTE\_ME**
-   the root\_item availability in case of fulfillment\_issue\_type: **PARTIAL\_AVAILABILITY**. |

##### Response Body - Special Requests

**Details for special requests related to an item.**

| Name | Type | Description |
| --- | --- | --- |
| `allergy` | [Allergy](#response-body-allergy) | Special requests for an item related to allergies specified by the eater. The item should be prepared taking into account these restrictions.  
  
**CONFIGURATION ONLY BY UBER EATS**: The allergy requests product is disabled by default for POS integrated stores, and can only be enabled by Uber Eats once the capability to ingest this information has been built and verified for your integration. When this feature is enabled, Eaters will see an “Allergy Requests” field when adding an item to their cart. This takes them to a screen where they can select from a list of common allergens and/or specify using freeform text.  
  
**NOTE**: Even if allergy requests are disabled, Eaters may choose to relay allergy requests in item-level or order-level special instructions if enabeld. |

##### Response Body - Allergy

**Details for allergies specified by the eater.**

| Name | Type | Description |
| --- | --- | --- |
| `allergens_to_exclude` | [Allergen](#response-body-allergen)\[\] | Array of allergens that should be taken into account when preparing this item. |
| `allergy_instructions` | string | Instructions from the eater related to allergies. |

##### Response Body - Allergen

**Details for the allergen.**

| Name | Type | Description |
| --- | --- | --- |
| `type` | string (**enum**) | The type of allergen. An allergen of type OTHER is one that is not yet supported via the API. In the case of type OTHER, rely on the freeform\_text field.  
  
**ALLOWED VALUES**:
-   `DAIRY`
-   `EGGS`
-   `FISH`
-   `SHELLFISH`
-   `TREENUTS`
-   `PEANUTS`
-   `GLUTEN`
-   `SOY`
-   `OTHER`

 |
| `freeform_text` | string | This field is only populated for OTHER type allergens. An allergen of type OTHER is one that is not yet supported via the API. In the case of type OTHER, rely on this field to discern the allergen. |

##### Response Body - ModifierGroup

**A grouping of items that can be selected as part of the purchase of a parent item, allowing the user to customize the item by making choices or bundling extras with their order.**

| Name | Type | Description |
| --- | --- | --- |
| `id` | string | Unique identifying string for the modifier group, provided by the store. |
| `title` | string | Modifier group title. |
| `external_data` | string | Free-form text field reserved for metadata supplied by the store. |
| `selected_items` | [Item](#response-body-item)\[\] | Array of items that were selected as options for this modifier group.  
  
**EXAMPLE** A menu might have a choose your toppings selection where lettuce, tomato, and bacon were selected as the three toppings for this order. We represent that here as a “choose your toppings” `modifier_group` with a “lettuce” item, a “tomato” item, and a “bacon” item placed in this `selected_items` array. |
| `removed_items` | [Item](#response-body-item)\[\] | Array of items that were removed as options for this modifier group.  
  
**EXAMPLE** A menu might have a choose your toppings selection where lettuce, tomato, and bacon are pre-selected by default, however, the eater wishes to have no toppings and de-selects them for this order. We represent that as a “choose your toppings” `modifier_group` with a “lettuce” item, a “tomato” item, and a “bacon” item placed in this `removed_items` array. |

##### Response Body - FulfillmentAction

**Provides the preferences selected by the consumer in case the item is unavailable.**

| Name | Type | Description |
| --- | --- | --- |
| `fulfillment_action_type` | string(**enum**) | Indicates the user preferred action.  
  
**ALLOWED VALUES**:
-   `REPLACE_FOR_ME`
Choose replacement for shopper-   `SUBSTITUTE_ME`
Only an item in item\_substitutes can be used as replacement-   `CANCEL`
Cancel the order if the item is unavailable-   `REMOVE_ITEM`
Remove item if it’s unavailable

 |
| `item_substitutes` | [Item](#response-body-item)\[\] | Array of items chosen as substitute. **Only for the SUBSTITUTE\_ME option.** Currently, it brings one item at most. |

##### Response Body - TaxInfo

**Provides tax metadata for the given item.**

| Name | Type | Optional | Description |
| --- | --- | --- | --- |
| `labels` | string\[\](**enum**) | Optional | A list of tax strings that define the item for tax calculation purposes.  
The list of available [enums](#request-body-parameters-taxlabels) is below.
**CONFIGURATION ONLY BY UBER EATS:** The label data is currently restricted to active Uber developers who have requested to receive these labels. If you wish to receive the tax labels in _Get Order Details_, please contact the Uber technical team to have this field enabled. |

##### Request Body Parameters - TaxLabels

**The possible labels and their definition.**

| Tax Classification | Description | Category Labels | Temperature Labels |
| --- | --- | --- | --- |
| Unheated Prepared Food | Items served at or below room temperature.  
  
Examples: Fresh salads, sashimi, ceviche | CAT\_PREPARED\_FOOD | TEMP\_UNHEATED |
| Unheated Deli Platter | Food items served together on a plate or tray. Usually from grocery stores.  
  
Examples: Fruit platters, meat and cheese plates, cold sandwich trays | CAT\_DELI\_PLATTER | TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Unheated Food Sold by Weight/Volume | Food that’s measured or weighed and sold in a container.  
  
Examples: Sliced deli meats and cheeses, cold deli salads | CAT\_FOOD\_BY\_WT\_VOL | TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Unheated Sandwich/Wrap | A combination of meat, vegetables, spreads and more. Sandwiches are served between 2 pieces of bread, wraps are served in a tortilla or flatbread.  
  
NOTE: Only use this category for premade sandwiches and wraps sold in containers. Use “restaurant food” for sandwiches or wraps prepared fresh and served in a restaurant.  
  
Examples: Tuna salad sandwich, chicken salad sandwich, veggie wraps | CAT\_SANDWICH | TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Ice Cream (hand scooped) | A cold, sweet foods made from milk or yogurt.  
  
Examples: Homemade ice cream cones, milkshakes | CAT\_ICECREAM | TEMP\_COLD |
| Pre-Packaged Food | Foods made in advance that usually are bought in containers.  
  
Examples: Frozen meats, granola bars, canned vegetables | CAT\_PREPACKAGED\_FOOD | TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Pre-Packaged Ice Cream | Ice cream or frozen yogurt bought in a container typically greater than 1 pint.  
  
Examples: Store-bought ice cream pints, pre-packaged frozen yogurt | CAT\_PREPACKAGED\_FOOD, CAT\_ICECREAM | TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Pre-Packaged Snack | Snacks that come prepackaged from a manufacturer.  
  
Examples: Potato chips, peanuts, pretzels | CAT\_PREPACKAGED\_FOOD, CAT\_SNACK | TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Candy | A sweet food that comes packaged from a manufacturer.  
  
Examples: Gummy bears, jelly beans, gum, chocolate bars, | CAT\_CANDY | TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Candy Flour | Candy Flour | CAT\_CANDY, TRAIT\_FLOUR | TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Alcohol | Beverages containing alcohol.  
  
Examples: Beer, wine, liquor | CAT\_ALCOHOL | TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| 100% Juice | Beverages that contain 100% juice with no additional ingredients other than water.  
  
Examples: Orange juice, tomato juice, apple juice | CAT\_JUICE, TRAIT\_PCT\_100 | TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| 70% - 99% Juice | Beverages that contain 70%-99% juice with no additional ingredients other than water. | CAT\_JUICE, TRAIT\_PCT\_70TO99 | TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| 50% - 69% Juice | Beverages that contain 50%-69% juice with no additional ingredients other than water. | CAT\_JUICE, TRAIT\_PCT\_50TO69 | TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| 25% - 49% Juice | Beverages that contain 25%-49% juice with no additional ingredients other than water. | CAT\_JUICE, TRAIT\_PCT\_25TO49 | TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| 5% - 24% Juice | Beverages that contain 5%-24% juice with no additional ingredients other than water. | CAT\_JUICE, TRAIT\_PCT\_5TO24 | TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| 1% - 4% Juice | Beverages that contain 1%-4% juice with no additional ingredients other than water. | CAT\_JUICE, TRAIT\_PCT\_1TO4 | TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Noncarbonated, unflavored/unsweetened water | Non-carbonated water with no flavoring or sweetners.  
  
Examples: Aquafina, Dasani, Evian, Fiji | CAT\_WATER, TRAIT\_NONCARB, TRAIT\_UNFLV\_UNSWT, CONTAINER\_BOTTLED | TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Noncarbonated, flavored/sweetened water | Noncarbonated drinks that contain a mix of fruit juices and other ingredients.  
  
Examples: Vitamin water, Sobe, Fruit drinks | CAT\_WATER, TRAIT\_NONCARB, TRAIT\_FLV\_SWT, CONTAINER\_BOTTLED | TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Carbonated, unflavored/unsweetened water | Carbonated water with no flavoring or sweetners. | CAT\_WATER, TRAIT\_CARB, TRAIT\_UNFLV\_UNSWT, CONTAINER\_BOTTLED | TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Carbonated, flavored/sweetened water | Carbonated drinks that contain a mix of fruit juices and other ingredients. | CAT\_WATER, TRAIT\_CARB, TRAIT\_FLV\_SWT, CONTAINER\_BOTTLED | TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Soft drink, bottled | Soft drink, bottled | CAT\_SOFT\_DRINK, CONTAINER\_BOTTLED | TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Soft drink, noncarbonated and bottled | Noncarbonated bottled softdrink | CAT\_SOFT\_DRINK, TRAIT\_NONCARB, CONTAINER\_BOTTLED | TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Powdered bottled drink | Powdered drink Mix | CAT\_POWDERED\_DRINK, CONTAINER\_BOTTLED | TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Energy bottled drink | Energy bottled drink | CAT\_ENERGY\_DRINK, CONTAINER\_BOTTLED | TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Prepared drink | Prepared drink | CAT\_PREPARED\_DRINK | TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Bottled tea | Bottled tea | CAT\_TEA, CONTAINER\_BOTTLED | TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Bottled coffee | Bottled coffee | CAT\_COFFEE, CONTAINER\_BOTTLED | TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Bottled milk cocoa | Bottled milk cocoa | CAT\_MILK\_COCOA, CONTAINER\_BOTTLED | TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Sporting Activities Clothing/Equipment | Generally taxable items; athletic uniforms and clothing don’t follow same exemptions as other clothing.  
  
Examples: bike jerseys, tennis rackets, etc. | CAT\_SPORTING\_CLOTHING | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Bathing Suits | Have different taxability than regular clothing items.  
  
Examples: swim trunks, bikinis, etc. | CAT\_BATHING\_SUITS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Other Clothing | Exempt in some states as well as has Sales Tax Holiday implications.  
  
Examples: Tshirts, sweatshirts, pants, etc. | CAT\_CLOTHING | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Costumes | Have different taxability than regular clothing items.  
  
Examples: Halloween costumes, masks, etc. | CAT\_COSTUMES | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Disposable Glove | Exemptions in some states that differ from both clothing and TPP.  
  
Examples: rubber gloves, disposable PPE gloves, etc. | CAT\_DISPOSABLE\_GLOVES | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Protective/Safety Clothing | Exemptions in some states that differ from both clothing and TPP.  
  
Examples: Hard hats, protective gloves, etc. | CAT\_PROTECTIVE\_CLOTHING | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Footwear and Accessories | Examples: Sandals, sneakers, etc. | CAT\_FOOTWEAR | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Computer Hardware | Examples: Laptops, Monitors, etc. | CAT\_COMP\_HARDWARE | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Batteries | Examples: AA batteries, AAA batteries, etc. | CAT\_BATTERIES | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Office/School Supplies | Examples: Notebooks, etc. | CAT\_SCHOOL\_SUPPLIES | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Infant Diapers | N/A | CAT\_DIAPERS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Baby Wipes | N/A | CAT\_BABY\_WIPES | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Pacifiers | N/A | CAT\_PACIFIERS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Baby Formula | N/A | CAT\_BABY\_FORMULA | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Condoms | N/A | CAT\_CONDOMS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Personal Lubricants | N/A | CAT\_PERSONAL\_LUBRICANTS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Pregnancy Tests | N/A | CAT\_PREGNANCY\_TEST | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Miscellaneous Equipment, Devices Sold Under Prescription | Examples: Inhalers, etc. | CAT\_PRESCRIPTION\_DEVICES | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Prescription Drugs | Any item requiring a prescription to be sold. | CAT\_PRESCRIPTION\_DRUGS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| OTC Medications | Examples: Advil, Tylenol, Zyrtec, etc. | CAT\_OTC\_MEDICATION | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| First Aid Kits | N/A | CAT\_FIRST\_AID\_KITS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Bandages | N/A | CAT\_BANDAGES | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Petroleum Jelly | N/A | CAT\_PETROLEUM\_JELLY | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Medicated Items | Grooming or hygiene products with an added medicine component, such as medicated lip balm, etc. | CAT\_MEDICATED\_ITEMS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Pet Food | All pet food, including treats. | CAT\_PET\_FOOD | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Printing-Postage | Examples: Stamps, envelopes, etc. | CAT\_POSTAGE | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Nontaxable/Tax Exempt | Any item that is nontaxable or tax-exempt. | CAT\_NON\_TAXABLE | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Gift Cards | N/A | CAT\_GIFT\_CARDS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Storm Preparedness Items | Examples: Flashlights, fire extinguishers, portable radios, etc. | CAT\_STORM\_PREP\_ITEMS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| TPP / Goods | Please select this tax category for all generally taxable items for which a separate category is not available. | CAT\_TPP | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Milk Substitutes | Examples: Almond milk, oat milk, etc. | CAT\_MILK\_SUBS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Beer | N/A | CAT\_BEER | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Wine | N/A | CAT\_WINE | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Liquor | N/A | CAT\_LIQUOR | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Non Alcoholic Beer or Mocktails | N/A | CAT\_NON\_ALCOHOLIC\_BEER | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Juice (Non Carbonated/Under 100%) | Examples: Gatorade, Vitamin Water, etc. | CAT\_JUICE\_NON\_CARBONATED | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Newspaper | N/A | CAT\_NEWSPAPERS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Magazines | N/A | CAT\_MAGAZINES | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Toilet Tissue | N/A | CAT\_TOILET\_PAPER | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Disposable Paper Products | Examples: Kleenex, paper towels, etc. | CAT\_PAPER\_PRODUCTS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Vitamins and Supplements | Examples: Vitamins, health supplements, or anything with a “Supplement” label rather than “Nutritional Facts” (5 Hour Energy, etc.) | CAT\_SUPPLEMENTS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Contact Solution | N/A | CAT\_CONTACT\_LENS\_SOLUTION | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Feminine Hygiene Products | N/A | CAT\_FEMININE\_HYGIENE\_PRODUCTS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Hand Sanitizer | N/A | CAT\_HAND\_SANITIZER | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Lip Balm | Any non-medicated lip balm. | CAT\_LIP\_BALM | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Sunscreen | N/A | CAT\_SUNSCREEN | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Toothpaste | N/A | CAT\_TOOTHPASTE | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Toothbrush | N/A | CAT\_TOOTHBRUSH | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Insecticides, Herbicides, Fungicides | N/A | CAT\_INSECTICIDES | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Fertilizer | N/A | CAT\_FERTILIZER | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Vegetable/Fruit Plants | Any plants or trees that will bear fruits or vegetables. | CAT\_FRUIT\_VEG\_PLANTS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Firewood | N/A | CAT\_FIREWOOD | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Lighter Fluid | N/A | CAT\_LIGHTER\_FLUID | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Charcoal Briquettes | N/A | CAT\_CHARCOAL\_BRIQUETTES | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Propane | N/A | CAT\_PROPANE | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Seeds (Human Consumption) | Examples: Sunflower seeds, chia seeds, and other seeds meant for human consumption. | CAT\_SEEDS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Bakery Item (Grocery Stores) | Any packaged item sold in the “bakery” section of a grocery store. Examples: Boxed cupcakes, loaves of bread, etc. | CAT\_BAKERY\_ITEM\_GROCERY\_STORE | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Candy-coated nuts | Candy coated nuts.  
  
Examples: Chocolate Covered Almonds, Candied Pecans, Jordan Almonds. | CAT\_CANDY\_COATED\_NUTS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Chewing Gum | Chewing Gum. | CAT\_GUM | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Chocolate or Chocolate Substitute Candy | Chocolate without flour.  
  
Examples: Hershey Kisses, Chocolate Bars. | CAT\_CHOCOLATE | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Confectionary products | Confectionary products that are not candy.  
  
Examples: Macaroons, Bakalva | CAT\_CONFECTIONARY | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| 50-25% Juice | Pure Juice Content - 25% to 50%. | CAT\_JUICE\_NON\_CARBONATED\_50TO25 | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| 99-51% Juice | Pure Juice Content - 51% or More. | CAT\_JUICE\_NON\_CARBONATED\_99TO51 | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Cider or perry | Hard Cider. | CAT\_CIDER | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Fortified wine | Fortified wine. | CAT\_FORTIFIED\_WINE | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Ice for Consumption - More Than 10 lbs | Ice for Consumption - More Than 10 lbs. | CAT\_ICE\_MORE\_THAN\_10LBS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Meal Replacement | Meal Replacement. | CAT\_MEAL\_REPLACEMENT | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Nutritional Shakes | Nutritional Shakes. | CAT\_NUTRITIONAL\_SHAKES | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Sparkling wine | Sparkling wine. | CAT\_SPARKLING\_WINE | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Butter | Butter. | CAT\_PREPACKAGED\_FOOD\_BUTTER | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Cakes and pies and pastries | Cakes and pies and pastries. | CAT\_PREPACKAGED\_FOOD\_CAKES | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Canned or jarred beans | Canned or jarred beans. | CAT\_PREPACKAGED\_FOOD\_CANNED\_BEANS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Canned or jarred fruit | Canned or jarred fruit. | CAT\_PREPACKAGED\_FOOD\_CANNED\_FRUIT | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Canned or jarred vegetables | Canned or jarred vegetables. | CAT\_PREPACKAGED\_FOOD\_CANNED\_VEGETABLES | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Cereals | Cereals.  
  
Examples: Fruit Loops, Cheerios, etc. | CAT\_PREPACKAGED\_FOOD\_CEREALS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Cheese | Packaged Cheese. | CAT\_PREPACKAGED\_FOOD\_CHEESE. | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Crackers | Crackers.  
  
Examples: Ritz. | CAT\_PREPACKAGED\_FOOD\_CRACKERS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Desserts and dessert toppings | Desserts and dessert toppings. | CAT\_PREPACKAGED\_FOOD\_DESSERTS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Edible ice cream cups or cones | Edible ice cream cups or cones. | CAT\_PREPACKAGED\_FOOD\_ICE\_CREAM\_CONE | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Edible oils and fats | Edible oils and fats. | CAT\_PREPACKAGED\_FOOD\_EDIBLE\_OILS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Eggs and egg substitutes | Eggs and egg substitutes. | CAT\_PREPACKAGED\_FOOD\_EGGS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Fresh bread | Fresh bread. | CAT\_PREPACKAGED\_FOOD\_FRESH\_BREAD | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Health or Breakfast Bars | Health or Breakfast Bars. | CAT\_PREPACKAGED\_FOOD\_SNACK\_HEALTH\_BARS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Honey | Honey. | CAT\_PREPACKAGED\_FOOD\_HONEY | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Infant Foods | Infant Foods. | CAT\_PREPACKAGED\_FOOD\_INFANT\_FOOD | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Instant Coffee | Instant Coffee. | CAT\_PREPACKAGED\_FOOD\_INSTANT\_COFFEE | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Jams or jellies or fruit preserves | Jams or jellies or fruit preserves. | CAT\_PREPACKAGED\_FOOD\_JAMS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Nut or mixed spreads | Nut or mixed spreads. | CAT\_PREPACKAGED\_FOOD\_NUT\_SPREADS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Pickles and relish and olives | Pickles and relish and olives. | CAT\_PREPACKAGED\_FOOD\_PICKLES | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Plain pasta and noodles | Plain pasta and noodles. | CAT\_PREPACKAGED\_FOOD\_PASTA | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Popcorn - Plain | Popcorn - Plain. | CAT\_PREPACKAGED\_FOOD\_POPCORN | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Salt preserved seafoods | Salt preserved seafoods. | CAT\_PREPACKAGED\_FOOD\_SALT\_PRESERVED\_SEA\_FOOD | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Sauces and spreads and condiments | Sauces and spreads and condiments. | CAT\_PREPACKAGED\_FOOD\_CONDIMENTS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Seasonings and preservatives | Seasonings and preservatives. | CAT\_PREPACKAGED\_FOOD\_SEASONING | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Shelf stable milk | Shelf stable milk. | CAT\_PREPACKAGED\_FOOD\_SHELF\_STABLE\_MILK | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Shelf Stable Prepared Potatoes or Rice or Pasta or Stuffing | Shelf Stable Prepared Potatoes or Rice or Pasta or Stuffing. | CAT\_PREPACKAGED\_FOOD\_SHELF\_STABLE\_POTATOES | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Shelf stable prepared soups or stews | Shelf stable prepared soups or stews. | CAT\_PREPACKAGED\_FOOD\_SHELF\_STABLE\_SOUP | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Tomato purees | Tomato purees. | CAT\_PREPACKAGED\_FOOD\_TOMATO\_PUREE | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Crisps or Chips or Pretzels or Mixes | Crisps or Chips or Pretzels or Mixes. | CAT\_PREPACKAGED\_FOOD\_SNACK\_CHIPS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Nuts or Dried Fruits | Nuts or Dried Fruits. | CAT\_PREPACKAGED\_FOOD\_SNACK\_NUTS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Snack Bars | Snack Bars. | CAT\_PREPACKAGED\_FOOD\_SNACK\_SNACK\_BARS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Sweet Biscuits or Cookies | Sweet Biscuits or Cookies. | CAT\_PREPACKAGED\_FOOD\_SNACK\_COOKIES | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Prepared salads | Prepared salads. | CAT\_PREPARED\_FOOD\_PREPARED\_SALADS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Prepared Side Dishes | Prepared Side Dishes.  
  
Examples: Mashed Potatoes, fries, etc. | CAT\_PREPARED\_FOOD\_PREPARED\_SIDE\_DISHES | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Fresh fruits | Fresh fruits. | CAT\_PREPACKAGED\_FOOD\_FRESH\_FRUITS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Facial Tissues | Facial Tissues. | CAT\_PAPER\_PRODUCTS\_FACIAL\_TISSUES | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Paper napkins or serviettes | Paper napkins or serviettes. | CAT\_PAPER\_PRODUCTS\_PAPER\_NAPKINS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Paper Towels | Paper Towels. | CAT\_PAPER\_PRODUCTS\_PAPER\_TOWELS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Markers | Markers. | CAT\_SCHOOL\_SUPPLIES\_MARKERS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Paper Pads or Notebooks | Paper Pads or Notebooks. | CAT\_SCHOOL\_SUPPLIES\_NOTEBOOKS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Pencils | Pencils. | CAT\_SCHOOL\_SUPPLIES\_PENCILS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Pens | Pens. | CAT\_SCHOOL\_SUPPLIES\_PENS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Antacids and antiflatulents | Antacids and antiflatulents.  
  
Examples: Tums, Pepto Bismol, Alka-Seltzer. | CAT\_OTC\_MEDICATION\_ANTACIDS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Antidiarrheals | Antidiarrheals.  
  
Examples: Imodium | CAT\_OTC\_MEDICATION\_ANTIDIARRHEALS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Antihistamines or H1 blockers | Allergy medications.  
  
Examples: Claritin, Zyrtec, Allegra, Benadryl | CAT\_OTC\_MEDICATION\_ANTIHISTAMINES | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Combination cold remedies | Combination cold remedies.  
  
Examples: Dayquil, Nyquil | CAT\_OTC\_MEDICATION\_COLD\_REMEDIES | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Decongestants, expectorants, and mucolytics | Decongestants, expectorants, and mucolytics. | CAT\_OTC\_MEDICATION\_DECONGESTANTS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Estrogens and progestins and internal contraceptives | Estrogens and progestins and internal contraceptives. | CAT\_OTC\_MEDICATION\_ESTROGENS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Ibuprofen | Ibuprofen. | CAT\_OTC\_MEDICATION\_IBUPROFEN | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Laxatives | Laxatives. | CAT\_OTC\_MEDICATION\_LAXATIVES | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Nasal Decongestants | Nasal Decongestants. | CAT\_OTC\_MEDICATION\_NASAL\_DECONGESTANTS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Nutritional supplements | Nutritional supplements. | CAT\_NUTRITION\_SUPPLEMENT | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Stimulants and Anorexiants | Stimulants and Anorexiants. | CAT\_OTC\_MEDICATION\_STIMULANTS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Air Freshener | Air Freshener. | CAT\_TPP\_AIR\_FRESHENER | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Antifreeze | Antifreeze. | CAT\_ANTI\_FREEZE | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Astringents | Astringents.  
  
Examples: Clean and Clear deep cleaning astringent | CAT\_OTC\_MEDICATION\_ASTRINGENTS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Bath Gels | Bath Gels. | CAT\_TPP\_BATH\_GELS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Bleaches | Bleaches. | CAT\_TPP\_BLEACHES | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Brake oil | Brake oil. | CAT\_OIL | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Camping and outdoor equipment | Camping and outdoor equipment.  
  
Examples: Tents, campfire grill | CAT\_TPP\_CAMPING\_EQUIPMENT | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Candle | Candles. | CAT\_TPP\_CANDLE | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Cigarette lighters or flints | Cigarette lighters or flints. | CAT\_TPP\_CIGARETTE\_LIGHTERS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Cleaning Equipment and Supplies | Cleaning Equipment and Supplies. | CAT\_TPP\_CLEANING\_EQUIPMENT | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Cosmetics | Cosmetics. | CAT\_TPP\_COSMETICS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Dental Floss | Dental Floss. | CAT\_TPP\_DENTAL\_FLOSS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Deodorants | Deodorants. | CAT\_TPP\_DEODORANTS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Dishwashing Products | Dishwashing Products. | CAT\_TPP\_DISH\_WASHING\_PRODUCTS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Disposable Personal Wipes | Disposable Personal Wipes. | CAT\_PAPER\_PRODUCTS\_PERSONAL\_WIPES | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Disposable drinking straws | Disposable drinking straws. | CAT\_PAPER\_PRODUCTS\_DISPOSABLE\_STRAWS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Disposable Kitchenware | Disposable plates, disposable utensils, disposable cups. | CAT\_PAPER\_PRODUCTS\_DISPOSABLE\_KITCHENWARE | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Drinkware | Drinkware. Examples: Glasses, Mugs, Cups | CAT\_TPP\_DRINK\_WARE | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Food Storage Containers | Food Storage containers, Tupperware, etc | CAT\_TPP\_CONTAINERS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Kitchen Tools and Utensils | Any kitchen tools and utensils. Examples: Forks, Knives, ladles, spatulas, can opener, etc. | CAT\_TPP\_UTENSILS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Drain cleaner | Drain cleaner. | CAT\_TPP\_DRAIN\_CLEANER | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Engine Oil | Engine Oil. | CAT\_ENGINE\_OIL | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Flashlight | Flashlight. | CAT\_FLASHLIGHT | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Gloves, Mittens | Gloves, Mittens. | CAT\_GLOVES | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Hair Combs or Brushes | Hair Combs or Brushes. | CAT\_TPP\_COMBS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Hand or Body Lotion or Oil | Hand or Body Lotion or Oil. | CAT\_TPP\_BODY\_LOTION | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Hand Tools | Hand Tools. | CAT\_TPP\_HAND\_TOOLS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Headphones | Headphones. | CAT\_TPP\_HEADPHONES | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Insect Repellant | Insect Repellant. | CAT\_TPP\_INSECT\_REPELLENT | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Laundry Products | Laundry Products. | CAT\_TPP\_LAUNDRY\_PRODUCTS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Masks or accessories | Masks or accessories. | CAT\_TPP\_MASKS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Medical Thermometers and Accessories | Medical Thermometers and Accessories. | CAT\_THERMOMETERS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Mouthwash | Mouthwash. | CAT\_TPP\_MOUTH\_WASH | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Nail Clippers | Nail Clippers. | CAT\_TPP\_NAIL\_CLIPPERS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Nail Polish Remover | Nail Polish Remover. | CAT\_TPP\_NAIL\_POLISH\_REMOVER | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Perfumes or Colognes or Fragrances | Perfumes or Colognes or Fragrances. | CAT\_TPP\_PERFUMES | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Playing Cards | Playing Cards. | CAT\_TPP\_PLAYING\_CARDS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Razors | Razors. | CAT\_TPP\_RAZORS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Scouring pads | Scouring pads. | CAT\_TPP\_SCOURING\_PADS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Shampoos | Shampoos. | CAT\_TPP\_SHAMPOOS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Shaving Creams | Shaving Creams. | CAT\_TPP\_SHAVING\_CREAMS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Skin Care Products | Skin Care Products. Examples: Face moisturizer, Aveeno | CAT\_TPP\_SKIN\_CARE\_PRODUCTS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Sponges | Sponges. | CAT\_TPP\_SPONGES | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Standard envelopes | Standard envelopes. | CAT\_TPP\_ENVELOPES | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Tape | Tape. | CAT\_TPP\_TAPE | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Toys and Games | Toys and Games. | CAT\_TPP\_TOYS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Trash bags | Trash bags. | CAT\_TPP\_TRASH\_BAGS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Umbrellas | Umbrellas. | CAT\_TPP\_UMBRELLAS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Ice Cream (Larger than Pint) | Ice Cream (Larger than Pint) | CAT\_ICE\_CREAM\_PINTS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |

##### Response Body - ItemPrice

**Price information for an item.**

| Name | Type | Description |
| --- | --- | --- |
| `unit_price` | [Money](#response-body-money) | Price for one unit of the item, including any selected options. |
| `total_price` | [Money](#response-body-money) | The total cost for the specified quantity of the item, including any selected options. |
| `base_unit_price` | [Money](#response-body-money) | Price for one unit of the item, excluding any selected options. |
| `base_non_loyalty_unit_price` | [Money](#response-body-money) | Price of a single unit of the item before any loyalty discounts are applied. |
| `base_total_price` | [Money](#response-body-money) | The total cost for the specified quantity of the item, excluding any selected options. |

##### Response Body - Money

**An amount of money in a specified currency**

| Name | Type | Description |
| --- | --- | --- |
| `amount` | integer | The quantity of money, represented as an integer in the smallest denomination of the currency.  
  
**EXAMPLE** An amount of 50 and a currency code of USD represents 50 pennies, since a penny is the smallest unit of currency in USD. |
| `currency_code` | string | ISO 4217 code for the currency of the monetary amount. |
| `formatted_amount` | string | A display-friendly formatted string representation of the price including currency code. |

[

Authorization

](#authorization)[

Encoding

](#encoding)[

Path Parameters

](#path-parameters)[

Response

](#response)[

Response Body

](#response-body)[

Response Body - Order

](#response-body-order)[

Response Body - Store

](#response-body-store)[

Response Body - Eater

](#response-body-eater)[

Response Body - TaxProfile

](#response-body-taxprofile)[

Response Body - TaxProfileMetadata

](#response-body-taxprofilemetadata)[

Response Body - Delivery

](#response-body-delivery)[

Response Body - Eats Delivery

](#response-body-eats-delivery)[

Response Body - Vehicle

](#response-body-vehicle)[

Response Body - Location

](#response-body-location)[

Response Body - Payment

](#response-body-payment)[

Response Body - Accounting

](#response-body-accounting)[

Response Body - Tax Remittance

](#response-body-tax-remittance)[

Response Body - Remittance Info

](#response-body-remittance-info)[

Response Body - Payee Detail

](#response-body-payee-detail)[

Response Body - Tax Reporting

](#response-body-tax-reporting)[

Response Body - Tax Breakdown

](#response-body-tax-breakdown)[

Response Body - Tax Info

](#response-body-tax-info)[

Response Body - Tax

](#response-body-tax)[

Response Body - Jurisdiction

](#response-body-jurisdiction)[

Response Body - Imposition

](#response-body-imposition)[

Response Body - Tax Location

](#response-body-tax-location)[

Response Body - Promotions

](#response-body-promotions)[

Response Body - Promotion

](#response-body-promotion)[

Response Body - Promo Funding Split

](#response-body-promo-funding-split)[

Response Body - Discount Item

](#response-body-discount-item)[

Response Body - Packaging

](#response-body-packaging)[

Response Body - Disposable Items

](#response-body-disposable-items)[

Response Body - Cart

](#response-body-cart)[

Response Body - Charges

](#response-body-charges)[

Response Body - Item

](#response-body-item)[

Response Body - FulfillmentIssue

](#response-body-fulfillmentissue)[

Response Body - Item Availability Info

](#response-body-item-availability-info)[

Response Body - Special Requests

](#response-body-special-requests)[

Response Body - Allergy

](#response-body-allergy)[

Response Body - Allergen

](#response-body-allergen)[

Response Body - ModifierGroup

](#response-body-modifiergroup)[

Response Body - FulfillmentAction

](#response-body-fulfillmentaction)[

Response Body - TaxInfo

](#response-body-taxinfo)[

Request Body Parameters - TaxLabels

](#request-body-parameters-taxlabels)[

Response Body - ItemPrice

](#response-body-itemprice)[

Response Body - Money

](#response-body-money)
