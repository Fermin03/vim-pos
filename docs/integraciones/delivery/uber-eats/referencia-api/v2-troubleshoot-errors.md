<!-- fuente: https://developer.uber.com/docs/eats/references/api/v2/troubleshoot-errors -->
## Troubleshooting Errors from the Menu API

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

#### No Menus Errors

All catalog’s must have menus to be a valid catalog. This must be done by having one or more menus in the `menus` field. See the [empty menu](/docs/eats/api/example-menu-payloads#empty-menu) and [simple menu](/docs/eats/api/example-menu-payloads#simple-example-menu) example payloads to see how you can add these.

\*\*If you are trying to temporarily pause your store please use the [Set Restaurant Status](/docs/eats/api/v1/post-eats-store-storeid-status) endpoint.

#### No Hours Errors

All catalog’s must have hours on some day during the week to be a valid catalog. This must be done by having a `service_availability` on some day during the week.

\*\*If you are trying to temporarily pause your store please use the [Set Restaurant Status](/docs/eats/api/v1/post-eats-store-storeid-status) endpoint.

#### Short Hours Errors

We require catalogs to have all `service_availability` intervals to be greater than 60 minutes to safeguard the customer experience. The `start_time` and `end_time` of a catalog is inclusive.

Case 1: Invalid Hours – this catalog is _INVALID_ because it’s only open for 1 minute on Monday. Because the `short_hours_threshold` is greater than 1 minute, we will deny this catalog.

```
"service_availability": [
          {
            "day_of_week": "monday",
            "time_periods": [
              {"start_time": "00:00", "end_time": "00:00"} // this is only open for 1-minute
            ]
          }
        ],
```

Case 2: Valid Hours – this catalog is open for 24-hour’s on Monday.

```
"service_availability": [
          {
            "day_of_week": "monday",
            "time_periods": [
              {"start_time": "00:00", "end_time": "23:59"} // this is open for 24-hours
            ]
          }
        ],
```

Case 3: Valid Overnight Hours – this catalog is open past midnight on Monday from Monday at 11:30PM to Tuesday at 12:30AM. This is a valid upsert if the `short_hours_threshold` is set to 60 minutes because the interval here is 60 consecutive minutes exactly.

```
"service_availability": [
          {
            "day_of_week": "monday",
            "time_periods": [
              {"start_time": "23:30", "end_time": "23:59"}
            ]
          },
          {
            "day_of_week": "tuesday",
            "time_periods": [
              {"start_time": "00:00", "end_time": "00:30"}
            ]
          }
        ],
```

#### OrgUUID Invalid Errors

> Error Message: orgUUID must be a valid UUID

The `store_id` in the request is not linked to a valid org. See the [Get Menu](/docs/eats/api/v2/get-eats-stores-storeid-menus) endpoint to confirm whether a menu for this `store_id` exists.

#### Nil Item Errors

> Error Message: nil item

The `item_id` in the request is malformed or does not exist. See the [Get Menu](/docs/eats/api/v2/get-eats-stores-storeid-menus) endpoint to confirm whether the `item_id` exists on this menu.

#### Invalid UUID Errors

> Error Message: invalid uuid

The request path contains a malformed or undefined value for `store_id`. Double check the request URL and confirm that it matches the format for the respective endpoints. See the [Get Menu](/docs/eats/api/v2/get-eats-stores-storeid-menus) endpoint to confirm whether a menu for this `store_id` exists.

#### Invalid Visibility Errors

> Error Message: invalid item {item\_id} in menu {store\_id}: invalid visibility: time ranges: xx:xx - xx:xx and xx:xx - xx:xx overlap\\

The item being updated has an invalid visibility where two or more time ranges overlap. The example below overlaps between the hours of 07:00 and 10:00. See the VisibilityHours section of the [Upload Menu](/docs/eats/api/v2/put-eats-stores-storeid-menus#request-body-parameters-visibilityhours) endpoint to fix this.

Before

```
"hoursList": [
          {
            "daysBitArray": [
              true,
              false,
              false,
              false,
              false,
              false,
              false
            ],
            "startTime": "07:00",
            "endTime": "23:59"
          },
          {
            "daysBitArray": [
              true,
              false,
              false,
              false,
              false,
              false,
              false
            ],
            "startTime": "00:00",
            "endTime": "10:00"
          },
        ],
```

After

```
"hoursList": [
          {
            "daysBitArray": [
              true,
              false,
              false,
              false,
              false,
              false,
              false
            ],
            "startTime": "00:00",
            "endTime": "23:59"
          }
        ],
```

#### Invalid Price Info Errors

The price of an item exceeds the maximum allowed value \[e.g. $375\]. See the PriceRules field of the [Update Item](/docs/eats/references/api/v2/post-eats-stores-storeid-menus-items-itemid#request-body-parameters-pricerules) endpoint to fix this. If you offer items priced above this limit, please contact your business representative to request an update to the pricing rules.

#### Cannot Change Alcoholic Classification

**Problem**: You previously marked an item as alcoholic by setting `alcoholic_items` to a value greater than 0, and now you are trying to change it back to non-alcoholic (by setting `alcoholic_items` to 0 or null), but the item remains alcoholic.

**Explanation**: Once a product is marked as alcoholic through the menu APIs, it will remain alcoholic even if you attempt to set it as non-alcoholic in future API calls. This behavior is intentional to ensure compliance and consistency across Uber systems.

**Solution**: If a product was incorrectly marked as alcoholic and must be reverted, please contact Uber Eats Support to request a manual correction.

For more information, see the Field Behavior / Validation Rules section in the [Upload Menu](/docs/eats/api/v2/put-eats-stores-storeid-menu#field-behavior--validation-rules) or [Update Item](/docs/eats/api/v2/post-eats-stores-storeid-menus-items-itemid#field-behavior--validation-rules) documentation.

[

No Menus Errors

](#no-menus-errors)[

No Hours Errors

](#no-hours-errors)[

Short Hours Errors

](#short-hours-errors)[

OrgUUID Invalid Errors

](#orguuid-invalid-errors)[

Nil Item Errors

](#nil-item-errors)[

Invalid UUID Errors

](#invalid-uuid-errors)[

Invalid Visibility Errors

](#invalid-visibility-errors)[

Invalid Price Info Errors

](#invalid-price-info-errors)[

Cannot Change Alcoholic Classification

](#cannot-change-alcoholic-classification)
