<!-- fuente: https://developer.uber.com/docs/eats/references/api/v2/post-eats-stores-storeid-menus-items-itemid -->
## Update Item

`POSThttps://api.uber.com/v2/eats/stores/{store_id}/menus/items/{item_id}`

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

**Disclaimer:** If you have not used upload menu endpoint before, you might receive a 404 error while using update item endpoint. To avoid it, please use the _upload menu_ endpoint once before using _update item_.

* * *

This _Update Item_ endpoint updates an individual item within a menu. This allows you to make smaller edits without needing to send the entire menu. This endpoint performs sparse updates, meaning that it will only update a field if it is specified.

#### Authorization

OAuth 2.0 Bearer token with the `eats.store` scope. For more information, see [Authentication](/docs/eats/guides/authentication).

#### Path Parameters

| Name | Type | Description |
| --- | --- | --- |
| `store_id` | `string` | Unique identifier representing a store. |
| `item_id` | `string` | Unique identifier representing an item. |

#### Field Behavior / Validation Rules

##### Alcoholic Product Classification

Once a product is marked as alcoholic (by setting `alcoholic_items` to a value greater than 0 in the `classifications` object), it will remain alcoholic even if you attempt to explicitly set it as non-alcoholic in future API updates. This behavior is intentional to ensure compliance and consistency across Uber systems.

If a product was incorrectly marked as alcoholic and must be reverted, please contact Uber Eats Support to request a manual correction.

For more details, see the [`alcoholic_items`](#request-body-parameters-classifications) field in the Classifications section.

#### Request Body Parameters

##### Request Body Parameters - UpdateItemConfiguration

**A configuration specifying how to update an item**

| Name | Type | Description |
| --- | --- | --- |
| `price_info` | [PriceRules](#request-body-parameters-pricerules) | (_optional_) Specifies the price to charge for ordering the item. Allows overrides dependant on the ordered item’s context |
| `suspension_info` | [SuspensionRules](#request-body-parameters-suspensionrules) | (_optional_) Suspends the item from sale, e.g. when out of stock, until a specified time. Allows overrides dependent on context |
| `menu_type` | string (**enum**) | (_optional_) Menu type to update, menus must be split by PUT api before using. Currently we only support item price and item availability differentiation.  
  
**ALLOWED VALUES**:
-   `MENU_TYPE_FULFILLMENT_DELIVERY`
-   `MENU_TYPE_FULFILLMENT_PICK_UP`
-   `MENU_TYPE_FULFILLMENT_DINE_IN`

Defaults to `MENU_TYPE_FULFILLMENT_DELIVERY` if not provided. NOTE: `MENU_TYPE_FULFILLMENT_DINE_IN` is enabled in Australia and NZ only |
| `product_info` | [ProductInfo](#request-body-parameters-productinfo) | (_optional_) Product identification information i.e. GTIN/UPC codes |
| `classifications` | [Classifications](#request-body-parameters-classifications) | (_optional_) Classifications of an item for supplemental information |
| `beverage_info` | [BeverageInfo](#request-body-parameters-beverageinfo) | (_optional_) Additional information about food items. Such as caffeine amount |
| `physical_properties_info` | [PhysicalPropertiesInfo](#request-body-parameters-physicalpropertiesinfo) | (_optional_) Additional product information related to products’ physical properties. ie. storage instructions, reusable packaging |
| `medication_info` | [MedicationInfo](#request-body-parameters-medicationinfo) | (_optional_) Additional information about medications |
| `nutritional_info` | [NutritionalInfo](#request-body-parameters-nutritionalinfo) | (_optional_) Specifies the nutritional info for an item |
| `selling_info` | [SellingInfo](#request-body-parameters-sellinginfo) | (_optional_) Defines the selling information for an item |

##### Request Body Parameters - PriceRules

**Specifies the price to charge for ordering the item.**

| Name | Type | Description |
| --- | --- | --- |
| `price` | int | Price of the item in the lowest local currency denomination, e.g. cents.  
  
Note: Make sure the item price doesn’t exceed the maximum allowed value |
| `core_price` | int | (_optional_) The intrinsic value of the item, in the lowest local currency denomination, e.g. cents.  
  
Used for refunds if the item is reported missing and in other cases where the intrinsic value of the item is needed.  
  
Must be >= price.  
  
Example Usage: A medium drink may be free (price=0) as part of a combo, but if reported missing the intrinsic value (corePrice) should be refunded to the customer.  
  
Can be set for Items and Modifier Options but currently only used for determining value of Modifier Options. |
| `container_deposit` | int | (_optional_) Metadata on the amount of deposit charged for returnable bottles/containers, in the lowest local currency denomination, e.g. cents. Only for metadata, does not affect price when ordering. |
| `overrides` | [PriceOverride](#request-body-parameters-priceoverride)\[\] | (_optional_) Overrides for the price in different contexts. |
| `priced_by_unit` | [MeasurementUnit](#request-body-parameters-measurementunit) | (_optional_) “per measurement” unit the item price is based on. |

**Example Price Change Request**

```
{
  "price_info": {
    "price": 1300, // price in cents
    "overrides": [],
    "container_deposit": 100 // container deposit in cents
  }
}
```

**Response**

```
Status-Code: 204 No Content
```

##### Request Body Parameters - PriceOverride

**Overrides the item price in a specified context**

| Name | Type | Description |
| --- | --- | --- |
| `context_type` | string (**enum**) | Type of the context in which to override.  
  
**ALLOWED VALUES**:
-   `“MENU”`
-   `“ITEM”`
-   `“MODIFIER_GROUP”`

 |
| `context_value` | string | Identifying string (id) for the specified context. |
| `price` | int | Price of the item in the lowest local currency denomination, e.g. cents. |

##### Request Body Parameters - SuspensionRules

**Suspends the item from sale for a specified period of time.**

| Name | Type | Description |
| --- | --- | --- |
| `suspension` | [Suspension](#request-body-parameters-suspension) | (_optional_) Any active suspension for the item. |
| `overrides` | [SupensionOverride](#request-body-parameters-suspensionoverride)\[\] | (_optional_) Overrides for the suspension in different contexts. |

##### Request Body Parameters - Suspension

**Describes why, and until when, an item is suspended from sale.**

| Name | Type | Description |
| --- | --- | --- |
| `suspend_until` | int | (**optional**) The time at which the item will return to being available for sale, specified as a Unix timestamp in seconds since Jan 1, 1970. A `null` value, or time in the past, indicates that an item is available - otherwise it will be shown as `“Sold Out”` and unavailable to order. |
| `reason` | string | (**optional**) Describes the reason for the suspension. |

##### Request Body Parameters - SuspensionOverride

**Overrides an item’s suspension in a specified context.**

| Name | Type | Description |
| --- | --- | --- |
| `context_type` | string (**enum**) | Type of the context in which to override.  
  
**ALLOWED VALUES**:
-   `“MENU”`
-   `“ITEM”`
-   `“MODIFIER_GROUP”`

 |
| `context_value` | string | Identifying string (id) for the specified context. |
| `suspension` | [Suspension](#request-body-parameters-suspension) | Suspension settings for the item in the context. |

##### Request Body Parameters - ProductInfo

**Product identification information i.e. UPC code**

| Name | Type | Description |
| --- | --- | --- |
| `target_market` | string | (_optional_) Target market for the product. ISO 3166 2-letter code: [https://en.wikipedia.org/wiki/ISO\_3166-1](https://en.wikipedia.org/wiki/ISO_3166-1). In addition, values “ALL” (all markets) and “EU” (European Union) are also supported. |
| `gtin` | string | (_optional_) GTIN for product, which could be UPC/EAN code. |
| `plu` | string | (_optional_) If the product is fresh produce, it can be identified using PLU code. [https://www.ifpsglobal.com/PLU-Codes](https://www.ifpsglobal.com/PLU-Codes) |
| `merchant_id` | string | (_optional_) If product doesn’t have gtin or plu, item can be identified using merchant’s internal id. |
| `product_type` | string | (_optional_) The product type associated with the item. Can be set along with GITN/PLU/MerchantID. [See list of product types](/docs/eats/v2/product-types) |
| `product_traits` | \[\]string | (_optional_) A list of the product traits associated with the item. Can be set along with GITN/PLU/MerchantID. [See list of product traits](/docs/eats/v2/product-types). |
| `countries_of_origin` | \[\]string | (_optional_) The countries of origin of the product |

##### Request Body Parameters - Classifications

**Specifies the classifications for an item.**

| Name | Type | Description |
| --- | --- | --- |
| `can_serve_alone` | boolean | (_optional_) Indicates whether the item can be served on its own.  
  
It is required on certain markets where alcohol must be sold with an entree (it cannot be sold alone). See the [Required Metadata Regulations](/docs/eats/references/api/v2/required-metadata-regulations) page for the list of applicable markets and cities. In that case, we want to know whether each item can qualify as an entree.  
  
Alcoholic items that also qualify as entrees (e.g. beer braised chicken) can be sold alone.  
  
If an item is not alcoholic, we still want to know if it’s considered an entree so we can determine if, for example, the eater can buy a non-entree alcohol item and combine it with this one. |
| `is_vegetarian` | boolean | (_optional_) Not used anymore. Please use [DietaryLabelInfo](#request-body-parameters-dietarylabelinfo) instead. |
| `alcoholic_items` | int | (_optional_) Indicates if an item is alcoholic, and if so, how much alcohol content there is. For example, an item “six-pack beer” should have alcoholic\_items set to 6.  
  
A value of null or 0 indicates that the item is non-alcoholic. This field is only used in whitelisted alcohol markets.  
  
**IMPORTANT**: Once a product is marked as alcoholic (by setting `alcoholic_items` to a value greater than 0), it will remain alcoholic even if you attempt to explicitly set it as non-alcoholic in future API updates. This behavior is intentional to ensure compliance and consistency across Uber systems. If a product was incorrectly marked as alcoholic and must be reverted, please contact Uber Eats Support to request a manual correction. |
| `dietary_label_info` | [DietaryLabelInfo](#request-body-parameters-dietarylabelinfo) | (_optional_) Contains dietary labels. |
| `instructions_for_use` | string | (_optional_) Instructions for use/prepare the product (max 200 characters) |
| `ingredients` | \[\]string | (_optional_) ingredients of the product (max 50 ingredients) |
| `additives` | \[\]string | (_optional_) List of additives in the product |
| `preparation_type` | string | (_optional_) Information on how the dish is prepared. Must be PREPACKAGED or empty. |
| `food_business_operator` | [FoodBusinessOperator](#request-body-parameters-foodbusinessoperator) | (_optional_) Specifies the food business operator of the product. |
| `is_high_fat_salt_sugar` | boolean | (_optional_) Indicates whether the item contains high fat/salt/sugar. |

##### Request Body Parameters - FoodBusinessOperator

| Name | Type | Description |
| --- | --- | --- |
| `name` | string | Name of the food business operator. |
| `address` | string | Address of the food business operator. |

##### Request Body Parameters - PhysicalPropertiesInfo

**Additional product information related to products’ physical properties.**

| Name | Type | Description |
| --- | --- | --- |
| `reusable_packaging` | boolean | (_optional_) Indicates if the product comes in reusable packaging. |
| `storage_instructions` | string | (_optional_) Instructions for storage. (max 200 characters) |

##### Request Body Parameters - BeverageInfo

**Additional information about food items. Such as caffeine amount.**

| Name | Type | Description |
| --- | --- | --- |
| `caffeine_amount` | integer | (_optional_) Amount of caffeine in the beverage in milligrams (mg). |
| `alcohol_by_volume` | int | (_optional_) Percentage of alcohol in E2 format. ie. 1275 is 12.75% |
| `coffee_info` | [CoffeeInfo](#request-body-parameters-coffeeinfo) | (_optional_) Specifies additional coffee info |

##### Request Body Parameters - CoffeeInfo

| Name | Type | Description |
| --- | --- | --- |
| `coffee_bean_origin` | \[\]string | (_optional_) List of countries of the coffee bean origin |

##### Request Body Parameters - MedicationInfo

| Name | Type | Description |
| --- | --- | --- |
| `medical_prescription_required` | boolean | (_optional_) Specifies if prescription is required for the medication. |

##### Request Body Parameters - NutritionalInfo

**Specifies the nutritional info for an item.**

| Name | Type | Description |
| --- | --- | --- |
| `calories` | [EnergyInfo](#request-body-parameters-energyinfo) | (_optional_) Net energy content of the item, in calories |
| `kilojoules` | [EnergyInfo](#request-body-parameters-energyinfo) | (_optional_) Net energy content of the item, in kilojoules |
| `serving_size` | [MeasurementInterval](#request-body-parameters-measurementinterval) | (_optional_) The amount per 1 serving size for a product. Ie. 100g per serving in a bag of chips |
| `number_of_servings` | int | (_optional_) The number of servings in the product ie. 3 servings for a 300g bag of chips with 100g per serving |
| `number_of_servings_interval` | Interval | (_optional_) The number of people the product serves (ie. serves 2-4 people) |
| `net_quantity` | [MeasurementInterval](#request-body-parameters-measurementinterval) | (_optional_) The net quantity of the product. Ie. 300g for a bag of chips |
| `calories_per_serving` | [EnergyInfo](#request-body-parameters-energyinfo) | (_optional_) Energy content of the item per serving, in calories |
| `kilojoules_per_serving` | [EnergyInfo](#request-body-parameters-energyinfo) | (_optional_) Energy content of the item per serving, in kilojoules |
| `fat` | [NutrientInfo](#request-body-parameters-nutrientinfo) | (_optional_) Information on the fat nutrient of the item |
| `saturated_fatty_acids` | [NutrientInfo](#request-body-parameters-nutrientinfo) | (_optional_) Information on the saturated fat nutrient of the item |
| `carbohydrates` | [NutrientInfo](#request-body-parameters-nutrientinfo) | (_optional_) Information on the carbohydrates nutrient of the item |
| `sugar` | [NutrientInfo](#request-body-parameters-nutrientinfo) | (_optional_) Information on the sugar nutrient of the item |
| `protein` | [NutrientInfo](#request-body-parameters-nutrientinfo) | (_optional_) Information on the protein nutrient of the item |
| `salt` | [NutrientInfo](#request-body-parameters-nutrientinfo) | (_optional_) Information on the salt nutrient of the item |
| `allergens` | \[\]string | (_optional_) List of allergens in the product |

##### Request Body Parameters - MeasurementInterval

| Name | Type | Description |
| --- | --- | --- |
| `measurement_type` | string | One of MEASUREMENT\_TYPE\_WEIGHT, MEASUREMENT\_TYPE\_VOLUME, MEASUREMENT\_TYPE\_COUNT - the measurement type of the interval |
| `weight_interval` | [WeightInterval](#request-body-parameters-weightinterval) | The weight interval for the measurement. Must be set if measurement\_type is MEASUREMENT\_TYPE\_WEIGHT |
| `volume_interval` | [VolumeInterval](#request-body-parameters-volumeinterval) | The volume interval for the measurement. Must be set if measurement\_type is MEASUREMENT\_TYPE\_VOLUME |
| `count_interval` | [CountInterval](#request-body-parameters-countinterval) | The count interval for the measurement. Must be set if measurement\_type is MEASUREMENT\_TYPE\_COUNT |

##### Request Body Parameters - Interval

**The interval can behave as a single value (not an interval) if lower is equal to upper.**

| Name | Type | Description |
| --- | --- | --- |
| `lower` | int | The lower value of the described closed interval. If undefined, the interval behaves as a left-unbounded/right-bounded closed interval. In E5 format ie. 123456 = 1.2345 |
| `upper` | int | (_optional_) The upper value of the described closed interval. If undefined, the interval behaves as a left-bounded/right-unbounded closed interval. In E5 format ie. 123456 = 1.2345 |

##### Request Body Parameters - NutrientInfo

| Name | Type | Description |
| --- | --- | --- |
| `amount` | [WeightInterval](#request-body-parameters-weightinterval) | Amount of the nutrient per serving |

##### Request Body Parameters - WeightInterval

**The interval can behave as a single value (not an interval) if lower is equal to upper.**

| Name | Type | Description |
| --- | --- | --- |
| `interval` | [Interval](#request-body-parameters-interval) | The lower value of the described closed interval. If undefined, the interval behaves as a left-unbounded/right-bounded closed interval. In E5 format ie. 123456 = 1.2345 |
| `weight` | [Weight](#request-body-parameters-weight) | The weight in the interval |

##### Request Body Parameters - VolumeInterval

**The interval can behave as a single value (not an interval) if lower is equal to upper.**

| Name | Type | Description |
| --- | --- | --- |
| `interval` | [Interval](#request-body-parameters-interval) | The lower value of the described closed interval. If undefined, the interval behaves as a left-unbounded/right-bounded closed interval. In E5 format ie. 123456 = 1.2345 |
| `volume` | [Volume](#request-body-parameters-volume) | The volume in the interval |

##### Request Body Parameters - CountInterval

**The interval can behave as a single value (not an interval) if lower is equal to upper.**

| Name | Type | Description |
| --- | --- | --- |
| `interval` | [Interval](#request-body-parameters-interval) | The lower value of the described closed interval. If undefined, the interval behaves as a left-unbounded/right-bounded closed interval. In E5 format ie. 123456 = 1.2345 |
| `count` | [Count](#request-body-parameters-count) | The count in the interval |

##### Request Body Parameters - Weight

| Name | Type | Description |
| --- | --- | --- |
| `unit_type` | string | One of WEIGHT\_UNIT\_TYPE\_METRIC\_GRAM, WEIGHT\_UNIT\_TYPE\_METRIC\_MICROGRAM, WEIGHT\_UNIT\_TYPE\_METRIC\_MILLIGRAM, WEIGHT\_UNIT\_TYPE\_METRIC\_KILOGRAM, WEIGHT\_UNIT\_TYPE\_METRIC\_TON, WEIGHT\_UNIT\_TYPE\_IMPERIAL\_AVOIRDUPOIS\_OUNCE, WEIGHT\_UNIT\_TYPE\_IMPERIAL\_AVOIRDUPOIS\_POUND. Must be set if unit\_type is WEIGHT |

##### Request Body Parameters - Volume

| Name | Type | Description |
| --- | --- | --- |
| `unit_type` | string | One of VOLUME\_UNIT\_TYPE\_METRIC\_LITER, VOLUME\_UNIT\_TYPE\_METRIC\_MILLILITER, VOLUME\_UNIT\_TYPE\_IMPERIAL\_FLUID\_OUNCE, VOLUME\_UNIT\_TYPE\_IMPERIAL\_PINT, VOLUME\_UNIT\_TYPE\_IMPERIAL\_GALLON, VOLUME\_UNIT\_TYPE\_IMPERIAL\_QUART, VOLUME\_UNIT\_TYPE\_IMPERIAL\_CUP, VOLUME\_UNIT\_TYPE\_IMPERIAL\_TABLESPOON, VOLUME\_UNIT\_TYPE\_IMPERIAL\_TEASPOON. Must be set if unit\_type is VOLUME |

##### Request Body Parameters - Count

| Name | Type | Description |
| --- | --- | --- |
| `unit_type` | string | One of COUNT\_UNIT\_TYPE\_CUSTOM, COUNT\_UNIT\_TYPE\_PIECE, COUNT\_UNIT\_TYPE\_SLICE, COUNT\_UNIT\_TYPE\_TABLET, COUNT\_UNIT\_TYPE\_CAPSULE. CUSTOM is for products that use a special unit like its own name as the count unit, e.g. 1 cookie, 1 candy bar. Must be set if unit\_type is COUNT |
| `custom_unit` | string | Name of the custom unit (ie. 1 cookie) if the unit\_type is CUSTOM |

##### Request Body Parameters - EnergyInfo

**Specifies the energy content of an item.**

| Name | Type | Description |
| --- | --- | --- |
| `energy_interval` | [Interval](#request-body-parameters-interval) | The lower value of the described closed interval. If undefined, the interval behaves as a left-unbounded/right-bounded closed interval. In E5 format ie. 123456 = 1.2345 |
| `lower_range` | int | (_deprecated_) The lower range of the energy content. This is used in various ways depending on the display\_type. |
| `upper_range` | int | (_deprecated_) The upper range of the energy content. This is used in various ways depending on the display\_type. |
| `display_type` | string |   
**ALLOWED VALUES**:
-   `“single_item”: takes the value of lower_range as is (e.g. “10”)`
-   `“double_items”: takes both lower_range and upper_range (e.g. “10/20”)`
-   `“additive_item”: takes the value of lower_range and prepends a plus (e.g. “+10”)`
-   `“multiple_items”: takes the value of lower_range and upper_range as a range (e.g. “10-20)`

 |

##### Request Body Parameters - SellingInfo

**Defines the selling information for an item.**

| Name | Type | Description |
| --- | --- | --- |
| `selling_options` | [SellingOption](#request-body-parameters-sellingoption)\[\] | List containing information about how an item can be sold by. |

##### Request Body Parameters - SellingOption

**Contains the information about how an item can be sold by.**

| Name | Type | Description |
| --- | --- | --- |
| `sold_by_unit` | [MeasurementUnit](#request-body-parameters-measurementunit) | (_optional_) Describes the measurement unit an item can be sold by. |
| `quantity_constraints` | [SellingQuantityConstraint](#request-body-parameters-sellingquantityconstraint) | (_optional_) Describes the constraints that an item has in a particular SellingOption. |
| `priced_by_to_sold_by_unit_conversion_info` | [PricedByToSoldByUnitConversionInfo](#request-body-parameters-pricedbytosoldbyunitconversioninfo) | (_optional_) Describes conversion info between “priced\_by” and “sold\_by” quantities. |

##### Request Body Parameters - MeasurementUnit

**Describes a measurement unit.**

| Name | Type | Description |
| --- | --- | --- |
| `measurement_type` | string (**enum**) | Describes the measurement unit an item can be sold by.  
  
**ALLOWED VALUES**:
-   `MEASUREMENT_TYPE_COUNT`
-   `MEASUREMENT_TYPE_WEIGHT`
-   `MEASUREMENT_TYPE_VOLUME`
-   `MEASUREMENT_TYPE_LENGTH`

Defaults to `MEASUREMENT_TYPE_INVALID` if not provided. |
| `length_unit` | string (**enum**) | (_optional_) Describe in which unit the type MEASUREMENT\_TYPE\_LENGTH is measured in. Must be set if MEASUREMENT\_TYPE\_LENGTH is set.  
  
**ALLOWED VALUES**:

-   `LENGTH_UNIT_TYPE_METRIC_METER`
-   `LENGTH_UNIT_TYPE_METRIC_MILLIMETER`
-   `LENGTH_UNIT_TYPE_METRIC_CENTIMETER`

 |
| `weight_unit` | string (**enum**) | (_optional_) Describe in which unit the type MEASUREMENT\_TYPE\_WEIGHT is measured in. Must be set if MEASUREMENT\_TYPE\_WEIGHT is set.  
  
**ALLOWED VALUES**:

-   `WEIGHT_UNIT_TYPE_METRIC_KILOGRAM`
-   `WEIGHT_UNIT_TYPE_METRIC_GRAM`
-   `WEIGHT_UNIT_TYPE_METRIC_MILLIGRAM`
-   `WEIGHT_UNIT_TYPE_IMPERIAL_POUND`
-   `WEIGHT_UNIT_TYPE_IMPERIAL_OUNCE`

 |
| `volume_unit` | string (**enum**) | (_optional_) Describe in which unit the type MEASUREMENT\_TYPE\_VOLUME is measured in. Must be set if MEASUREMENT\_TYPE\_VOLUME is set.  
  
**ALLOWED VALUES**:

-   `VOLUME_UNIT_TYPE_US_FLUID_OUNCE`
-   `VOLUME_UNIT_TYPE_METRIC_LITER`
-   `VOLUME_UNIT_TYPE_METRIC_MILLILITER`

 |

##### Request Body Parameters - SellingQuantityConstraint

**Describes the constraints that an item has in a particular SellingOption.**

| Name | Type | Description |
| --- | --- | --- |
| `min_permitted` | float | (_optional_) Minimum quantity of total items allowed (inclusive). Max precision: 5 decimal places after the decimal point (e.g 0.12345) |
| `max_permitted` | float | (_optional_) Maximum quantity of total items allowed (inclusive). Max precision: 5 decimal places after the decimal point (e.g 0.12345) |
| `increment` | float | (_optional_) Incremental quantity that is allowed on quantity adjustment. Max precision: 5 decimal places after the decimal point (e.g 0.12345) |
| `default_quantity` | float | (_optional_) Default quantity that would be pre-selected. Max precision: 5 decimal places after the decimal point (e.g 0.12345) |

##### Request Body Parameters - PricedByToSoldByUnitConversionInfo

**Describes conversion info between “priced\_by” and “sold\_by” quantities.**

| Name | Type | Description |
| --- | --- | --- |
| `conversion_rate` | float | (_optional_) The conversion ratio. Usage: “priced\_by” quantity = “sold\_by” quantity \* conversionRate. Max precision: 5 decimal places after the decimal point (e.g 0.12345) |

#### Request Body Example

`POST /v2/eats/stores/{store_id}/menus/items/{item_id}`

```
{
  "suspension_info": {
    "suspension": null,
    "overrides": [
      {
        "context_type": "MODIFIER_GROUP",
        "context_value": "size",
        "suspension": {
          "suspend_until": 8640000000,
          "reason": null
        }
      }
    ]
  },
  "product_info": {
    "target_market": "EU",
    "gtin": "1354435445"
  }
}
```

#### Response

```
Status-Code: 204 No Content
```

This endpoint returns an empty response body.

[

Authorization

](#authorization)[

Path Parameters

](#path-parameters)[

Field Behavior / Validation Rules

](#field-behavior-/-validation-rules)[

Alcoholic Product Classification

](#alcoholic-product-classification)[

Request Body Parameters

](#request-body-parameters)[

Request Body Parameters - UpdateItemConfiguration

](#request-body-parameters-updateitemconfiguration)[

Request Body Parameters - PriceRules

](#request-body-parameters-pricerules)[

Request Body Parameters - PriceOverride

](#request-body-parameters-priceoverride)[

Request Body Parameters - SuspensionRules

](#request-body-parameters-suspensionrules)[

Request Body Parameters - Suspension

](#request-body-parameters-suspension)[

Request Body Parameters - SuspensionOverride

](#request-body-parameters-suspensionoverride)[

Request Body Parameters - ProductInfo

](#request-body-parameters-productinfo)[

Request Body Parameters - Classifications

](#request-body-parameters-classifications)[

Request Body Parameters - FoodBusinessOperator

](#request-body-parameters-foodbusinessoperator)[

Request Body Parameters - PhysicalPropertiesInfo

](#request-body-parameters-physicalpropertiesinfo)[

Request Body Parameters - BeverageInfo

](#request-body-parameters-beverageinfo)[

Request Body Parameters - CoffeeInfo

](#request-body-parameters-coffeeinfo)[

Request Body Parameters - MedicationInfo

](#request-body-parameters-medicationinfo)[

Request Body Parameters - NutritionalInfo

](#request-body-parameters-nutritionalinfo)[

Request Body Parameters - MeasurementInterval

](#request-body-parameters-measurementinterval)[

Request Body Parameters - Interval

](#request-body-parameters-interval)[

Request Body Parameters - NutrientInfo

](#request-body-parameters-nutrientinfo)[

Request Body Parameters - WeightInterval

](#request-body-parameters-weightinterval)[

Request Body Parameters - VolumeInterval

](#request-body-parameters-volumeinterval)[

Request Body Parameters - CountInterval

](#request-body-parameters-countinterval)[

Request Body Parameters - Weight

](#request-body-parameters-weight)[

Request Body Parameters - Volume

](#request-body-parameters-volume)[

Request Body Parameters - Count

](#request-body-parameters-count)[

Request Body Parameters - EnergyInfo

](#request-body-parameters-energyinfo)[

Request Body Parameters - SellingInfo

](#request-body-parameters-sellinginfo)[

Request Body Parameters - SellingOption

](#request-body-parameters-sellingoption)[

Request Body Parameters - MeasurementUnit

](#request-body-parameters-measurementunit)[

Request Body Parameters - SellingQuantityConstraint

](#request-body-parameters-sellingquantityconstraint)[

Request Body Parameters - PricedByToSoldByUnitConversionInfo

](#request-body-parameters-pricedbytosoldbyunitconversioninfo)[

Request Body Example

](#request-body-example)[

Response

](#response)
