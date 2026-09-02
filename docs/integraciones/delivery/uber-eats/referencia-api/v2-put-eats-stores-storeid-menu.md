<!-- fuente: https://developer.uber.com/docs/eats/references/api/v2/put-eats-stores-storeid-menu -->
## Upload Menu

`PUThttps://api.uber.com/v2/eats/stores/{store_id}/menus`

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

This _Upload Menu_ endpoint allows a developer to create or override the entire menu for a specific store.

#### Authorization

OAuth 2.0 Bearer token with the `eats.store` scope. For more information, see [Authentication](/docs/eats/guides/authentication).

##### Encoding

The request payload for this endpoint may be very large. We highly recommend the use of a standard HTTP compression algorithm to optimise bandwidth usage and processing time. To opt-in, please add **both** the following headers:

| Header | Description |
| --- | --- |
| `Content-Encoding` | Contains the compression algorithm used to compress the request payload. Compression algorithms currently supported: `gzip`. |
| `Content-Type` | Contains the content type of the decompressed request payload, and must be set to `application/json`. |

#### Path Parameters

| Name | Type | Description |
| --- | --- | --- |
| `store_id` | `string` | Unique identifying string for a restaurant on Uber Eats, provided by Uber. |

#### Field Behavior / Validation Rules

##### Alcoholic Product Classification

Once a product is marked as alcoholic (by setting `alcoholic_items` to a value greater than 0 in the `classifications` object), it will remain alcoholic even if you attempt to explicitly set it as non-alcoholic in future API updates. This behavior is intentional to ensure compliance and consistency across Uber systems.

If a product was incorrectly marked as alcoholic and must be reverted, please contact Uber Eats Support to request a manual correction.

For more details, see the [`alcoholic_items`](#request-body-parameters-classifications) field in the Classifications section.

#### Request Body Parameters

All parameters are **required** unless stated otherwise.

##### Request Body Parameters - MenuConfiguration

**Root-level menu configuration for a restaurant.**

| Name | Type | Description |
| --- | --- | --- |
| `menus` | [Menu](#request-body-parameters-menu)\[\] | List of the store’s menus. |
| `categories` | [Category](#request-body-parameters-category)\[\] | List of the store’s menu categories. |
| `items` | [Item](#request-body-parameters-item)\[\] | List of the store’s items. |
| `modifier_groups` | [ModifierGroup](#request-body-parameters-modifiergroup)\[\] | List of the store’s modifier groups. |
| `menu_type` | string (**enum**) | (optional) Menu type to update. Use only if menu needs to be different across different menu types (ie. delivery menu & pickup menu are different). Currently we only support item price and item availability differentiation.  
  
**NOTE**: Delivery menu must be upserted first. Menus are forever split and must be managed separately after the first call with a `menu_type` that is not `MENU_TYPE_FULFILLMENT_DELIVERY`.  
  
**ALLOWED VALUES**:
-   `MENU_TYPE_FULFILLMENT_DELIVERY`
-   `MENU_TYPE_FULFILLMENT_PICK_UP`
-   `MENU_TYPE_FULFILLMENT_DINE_IN`

Defaults to `MENU_TYPE_FULFILLMENT_DELIVERY` if not provided. NOTE: `MENU_TYPE_FULFILLMENT_DINE_IN` is enabled in Australia and NZ only. |

##### Request Body Parameters - Menu

**A collection of items available for sale from a restaurant at specified times.**

| Name | Type | Description |
| --- | --- | --- |
| `id` | string | A unique identifying string for the menu, provided by the restaurant. |
| `title` | [MultiLanguageText](#request-body-parameters-multilanguagetext) | The name of the menu to be displayed. |
| `subtitle` | [MultiLanguageText](#request-body-parameters-multilanguagetext) | An optional subtitle for the menu. |
| `service_availability` | [ServiceAvailability](#request-body-parameters-service-availability)\[\] | The days and times of the day at which this menu should be made available. |
| `category_ids` | string\[\] | All of the IDs for the menu categories that will be made available while this menu is active. |

##### Request Body Parameters - MultiLanguageText

**Provides content for a string displayed to users in multiple languages.**

| Name | Type | Description |
| --- | --- | --- |
| `translations` | Object (`key` string: `value` string) | A mapping from a locale code to the translated text in that locale. Only one translation should be provided and will be displayed to all users. The locale code should specify both language and country code, e.g. `en_us`. |

##### Request Body Parameters - Service Availability

**Specifies menu availability on a specified day of the week.**

All parameters are **required** for the day of the week your menu is available. If your menu is not available on a certain day, you do not need to create an array object for that day.

| Name | Type | Description |
| --- | --- | --- |
| `day_of_week` | string (**enum**) | The day of the week on which these hours will be applied.  
  
**ALLOWED VALUES**:
-   `“monday”`
-   `“tuesday”`
-   `“wednesday”`
-   `“thursday”`
-   `“friday”`
-   `“saturday”`
-   `“sunday”`

 |
| `time_periods` | [TimePeriod](#request-body-parameters-timeperiod)\[\] | The continuous time spans during which the menu is available. |

##### Request Body Parameters - TimePeriod

**Continuous time span on an individual day (finishes at 23:59).**

| Name | Type | Description |
| --- | --- | --- |
| `start_time` | string | The time at which the menu becomes available, in 24-hour **HH:MM** format, e.g. “08:30”, “23:00” |
| `end_time` | string | The time at which the menu ceases to be available, in 24-hour **HH:MM** format, e.g. “08:30”, “23:00” |

##### Request Body Parameters - Category

**A grouping that allows related items to be displayed in proximity to each other on a menu.**

| Name | Type | Description |
| --- | --- | --- |
| `id` | string | A unique identifying string for the category, provided by the restaurant. |
| `title` | [MultiLanguageText](#request-body-parameters-multilanguagetext) | The displayed name for the category. |
| `subtitle` | [MultiLanguageText](#request-body-parameters-multilanguagetext) | (_optional_) A subtitle for the category. |
| `entities` | [MenuEntity](#request-body-parameters-menuentity)\[\] | The top-level menu items available for sale within the category - all entities must be of type `“ITEM”`. |

##### Request Body Parameters - MenuEntity

**Allows for specifying entities of different types from the menu, e.g. items and modifier groups.**

| Name | Type | Description |
| --- | --- | --- |
| `id` | string | The unique identifying string (id) for the item or modifier group being specified |
| `type` | string (**enum**) | The type of the entity being specified.  
  
**ALLOWED VALUES**:
-   `“ITEM”`
-   `“MODIFIER_GROUP”`

 |

##### Request Body Parameters - Item

**An individual object that can be ordered - either by itself or, when used within a modifier group, as a component of another item.**

| Name | Type | Description |
| --- | --- | --- |
| `id` | string | A unique identifying string for the item, provided by the restaurant.  
  
**NOTE**: Avoid using special characters such as / (forward slash) or ; (semi-colon) which could disrupt the APIs that utilize item\_id as the path parameter. |
| `external_data` | string | (_optional_) Free-form text field reserved for the restaurant’s use, e.g. for POS integrations. (max 1024 characters) |
| `title` | [MultiLanguageText](#request-body-parameters-multilanguagetext) | The name of the item. |
| `description` | [MultiLanguageText](#request-body-parameters-multilanguagetext) | (_optional_) Supplementary information describing the item. |
| `image_url` | string | (_optional_) URL pointing to an image of the item.  
Image requirements:
-   File size < 25MB
-   JPG, WEBP or PNG format
-   320px ≤ Width ≤ 6000px
-   320px ≤ Height ≤ 6000px

 |
| `price_info` | [PriceRules](#request-body-parameters-pricerules) | Specifies the price to charge for ordering the item. Allows overrides dependent on the ordered item’s context.  
  
Price should always be integer value (never decimals) because the price is set in the percent of local currency denomination (e.g., cents for US currency, not dollars).  
  
Price should always be set even if price is 0. |
| `quantity_info` | [QuantityConstraintRules](#request-body-parameters-quantityconstraintrules) | (_optional_) Constrains the quantities in which the item can be ordered. Only applies to items used within a modifier group. Allows overrides dependent on the ordered item’s context. |
| `suspension_info` | [SuspensionRules](#request-body-parameters-suspensionrules) | (_optional_) Suspends the item from sale, e.g. when out of stock, until a specified time. Allows overrides dependent on context. |
| `modifier_group_ids` | [ModifierGroupsRules](#request-body-parameters-modifiergroupsrules) | (_optional_) Specifies the modifier groups to be associated with the item, allowing the user to make choices or bundle extras with their purchase. Allows overrides dependent on context. |
| `tax_info` | [TaxInfo](#request-body-parameters-taxinfo) | Specifies the taxes applicable to the item. |
| `nutritional_info` | [NutritionalInfo](#request-body-parameters-nutritionalinfo) | (_optional_) Specifies the nutritional info for an item |
| `dish_info` | [DishInfo](#request-body-parameters-dishinfo) | (_optional_) Defines the classifications for an item |
| `visibility_info` | [VisibilityInfo](#request-body-parameters-visibilityinfo) | (_optional_) Defines when an item is visible to the user |
| `tax_label_info` | [TaxLabelsRuleSet](#request-body-parameters-taxlabelsruleset) | (_optional_) The labels used to generate tax values |
| `product_info` | [ProductInfo](#request-body-parameters-productinfo) | (_optional_) Product identification information i.e. GTIN/UPC codes |
| `bundled_items` | \[\][BundledItems](#request-body-parameters-bundleditems) | (_optional_) The list of items that are bundled or always included as part of this item, but not shown/customizable by customers. (ie. Fries as part of a burger combo). These items are shown to customers when they are requesting a support/refund and not shown during initial purchase. |
| `beverage_info` | [BeverageInfo](#request-body-parameters-beverageinfo) | (_optional_) Additional information about food items. Such as caffeine amount |
| `physical_properities_info` | [PhysicalPropertiesInfo](#request-body-parameters-physicalpropertiesinfo) | (_optional_) Additional product information related to products’ physical properties. ie. storage instructions, reusable packaging |
| `medication_info` | [PhysicalPropertiesInfo](#request-body-parameters-physicalpropertiesinfo) | (_optional_) Additional product information related to products’ physical properties. ie. storage instructions, reusable packaging |
| `selling_info` | [SellingInfo](#request-body-parameters-sellinginfo) | (_optional_) Defines the selling information for an item |

##### Request Body Parameters - PriceRules

**Specifies the price to charge for ordering the item.**

| Name | Type | Description |
| --- | --- | --- |
| `price` | int | Price of the item in the percent of local currency denomination, e.g. cents and 1/100 for yen. |
| `in_store_price` | int | Item price merchant charges for in-store purchases, excluding any additional merchant discounts. |
| `in_store_discounted_price` | int | Item price merchant charges for in-store purchases, including any additional merchant discounts. |
| `core_price` | int | (_optional_) The intrinsic value of the item, in the percent of local currency denomination, e.g. cents.  
  
Used for refunds if the item is reported missing and in other cases where the intrinsic value of the item is needed.  
  
Must be >= price.  
  
Example Usage: A medium drink may be free (price=0) as part of a combo, but if reported missing the intrinsic value (corePrice) should be refunded to the customer.  
  
Can be set for Items and Modifier Options but currently only used for determining value of Modifier Options. |
| `container_deposit` | int | (_optional_) Metadata on the amount of deposit charged for returnable bottles/containers, in the percent of local currency denomination, e.g. cents. Only for metadata, does not affect price when ordering. |
| `overrides` | [PriceOverride](#request-body-parameters-priceoverride)\[\] | (_optional_) Overrides for the price in different contexts. |
| `priced_by_unit` | [MeasurementUnit](#request-body-parameters-measurementunit) | (_optional_) “per measurement” unit the item price is based on. |

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
| `price` | int | Price of the item in the percent of local currency denomination, e.g. cents and 1/100 for yen. |
| `core_price` | int | (_optional_) The intrinsic value of the item, in the percent of local currency denomination, e.g. cents.  
  
Used for refunds if the item is reported missing and in other cases where the intrinsic value of the item is needed.  
  
Must be >= price.  
  
Example Usage: A medium drink may be free (price=0) as part of a combo, but if reported missing the intrinsic value (corePrice) should be refunded to the customer.  
  
Can be set for Items and Modifier Options but currently only used for determining value of Modifier Options. |

##### Request Body Parameters - QuantityConstraintRules

**Applies constraints to the quantity in which an item can be ordered.**

| Name | Type | Description |
| --- | --- | --- |
| `quantity` | [QuantityConstraint](#request-body-parameters-quantityconstraint) | Default quantity constraints for the item. |
| `overrides` | [QuantityConstraintOverride](#request-body-parameters-quantityconstraintoverride)\[\] | (_optional_) Overrides for the quantity constraints in different contexts. |

##### Request Body Parameters - QuantityConstraint

**A set of rules imposed upon the quantity values selectable by the user.**

| Name | Type | Description |
| --- | --- | --- |
| `min_permitted` | int | (_optional_) Minimum quantity allowed (**inclusive**).  
  
Cannot be negative.  
  
Note: When used in a modifier option, customers will be required to purchase the min\_permitted quantity of this modifier option (i.e. customer will need to select this modifier option to purchase the item). If you want to set min\_permitted to only apply if the customer chooses to add this modifier option, then set is\_min\_permitted\_optional to TRUE. By doing so, the customer will have the choice to select this modifier option if they wish. If they do select it, only then they will be required to purchase at least the min\_permitted quantity of this modifier option to purchase the item.  
  
\*\*If the sum of all required modifier options min\_permitted values are greater than the max\_permitted value for a modifier group, the item will be unorderable. |
| `max_permitted` | int | (_optional_) Maximum quantity allowed (**inclusive**).  
  
`max_permitted` cannot be less than `min_permitted`. |
| `is_min_permitted_optional` | bool | (_optional_) If the modifier option selection is optional. . Should only be used in a modifier option.  
  
When set to FALSE, customers will be required to purchase the min\_permitted quantity of this modifier option (i.e. customer will need to select this modifier option to purchase the item).  
  
When set to TRUE, customers will have the choice to select this modifier option if they wish. If they do select it, only then they will be required to purchase at least the min\_permitted quantity of this modifier option to purchase the item.  
  
Default value is FALSE |
| `default_quantity` | int | (_optional_) Default quantity that will be pre-selected.  
  
`default_quantity` must be between `min_permitted` and `max_permitted` (**inclusive**) |
| `charge_above` | int | (_optional_) When provided, the item price will only be charged per quantity unit in excess of this amount. Can either be applied to an individual item or an entire modifier group.
-   `charge_above` and `refund_under` must either both be `null` or both be non-`null`.
-   Cannot be negative.
-   Cannot be greater than `max_permitted`.
-   Cannot be less than `default_quantity`.
-   Cannot be less than `refund_under`.

 |
| `refund_under` | int | (_optional_) When provided, the item price will be refunded per quantity unit chosen below this amount. Can either be applied to an individual item or an entire modifier group.

-   `charge_above` and `refund_under` must either both be `null` or both be non-`null`.
-   Cannot be negative.
-   Cannot be greater than `max_permitted`.
-   Cannot be greater than `default_quantity`.
-   Cannot be greater than `charge_above`.

 |
| `min_permitted_unique` | int | (_optional_) Minimum quantity of unique customization selections allowed (**inclusive**)  
  
Cannot be negative. Can only be applied to modifier groups; cannot be used for individual modifier options. |
| `max_permitted_unique` | int | (_optional_) Maximum quantity of unique customization selections allowed (**inclusive**)  
  
Cannot be less than `min_permitted_unique`. Can only be applied to modifier groups; cannot be used for individual modifier options. |

##### Request Body Parameters - QuantityConstraintOverride

**Overrides the quantity constraints in a specified context.**

| Name | Type | Description |
| --- | --- | --- |
| `context_type` | string (**enum**) | Type of the context in which to override.  
  
**ALLOWED VALUES**:
-   `“MENU”`
-   `“ITEM”`
-   `“MODIFIER_GROUP”`

 |
| `context_value` | string | Identifying string (id) for the specified context. |
| `quantity` | [QuantityConstraint](#request-body-parameters-quantityconstraint) | Quantity constraints for the item in this context. |

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

##### Request Body Parameters - ModifierGroupsRules

**Specifies the modifier groups to be associated with the item, allowing the user to make choices or bundle extras with their purchase.**

| Name | Type | Description |
| --- | --- | --- |
| ids | string\[\] | A list of the identifying strings (ids) of all modifier groups associated with the item. |
| overrides | [ModifierGroupsOverride](#request-body-parameters-modifiergroupsoverride)\[\] | (_optional_) Overrides for the list of modifier groups in different contexts. |

##### Request Body Parameters - ModifierGroupsOverride

**Overrides the modifier groups associated with an item in a specified context.**

| Name | Type | Description |
| --- | --- | --- |
| `context_type` | string (**enum**) | Type of the context in which to override.  
  
**ALLOWED VALUES**:
-   `“MENU”`
-   `“ITEM”`
-   `“MODIFIER_GROUP”`

 |
| `context_value` | string | Identifying string (id) for the specified context. |
| `ids` | string\[\] | A list of the identifying strings (ids) of all modifier groups associated with the item in this context. |

##### Request Body Parameters - TaxInfo

Specifies how taxes are calculated from the menu item’s `price`. We support both _tax-inclusive_ (`vat_rate_percentage`) and _tax-exclusive_ (`tax_rate`) pricing models. Choose the one that is consistent with each store’s tax locality.

| Name | Type | Description |
| --- | --- | --- |
| `tax_rate` | 0.0 ≤ `float` ≤ 100.0 | (_optional_) The tax rate, to be charged on top of the provided menu item price. You would typically use this option if your menu item’s `price` **does not** include tax but needs to be charged on top of the order’s sub-total.  
Note: This tax rate only applies to the first-level items within the order. |
| `vat_rate_percentage` | 0.0 ≤ `float` ≤ 100.0 | (_optional_) Value-added tax rate for the item. This is the amount of tax **already included** in the menu item’s `price`. This tax rate will not be additionally charged. |
| `mx_ieps_rate` | 0.0 ≤ `float` ≤ 200.0 | (_optional_) IEPS tax rate for the item. This represents the IEPS amount already included in the menu item’s `price`. The system will use this rate to derive the IEPS portion from the total price. This tax will not be additionally charged. |

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

##### Request Body Parameters - DishInfo

**Defines the classifications for an item.**

| Name | Type | Description |
| --- | --- | --- |
| `classifications` | [Classifications](#request-body-parameters-classifications) | (_optional_) Classifications of an item for supplemental information |

##### Request Body Parameters - VisibilityInfo

**Specifies when an item is visible to the user**

| Name | Type | Description |
| --- | --- | --- |
| `hours` | [VisibilityHours](#request-body-parameters-visibilityhours) | (_required_) List of time periods when an item should be visible to the eater |

##### Request Body Parameters - visibilityHours

**Specifies when an item is visible to the user**

| Name | Type | Description |
| --- | --- | --- |
| `start_date` | string | (_optional_) An ISO 8601 formatted date string specifying the start of the period when an item should be visible. For example 2019-12-29. Omitting this value means current day. |
| `end_date` | string | (_optional_) An ISO 8601 formatted date string specifying the end of the period when an item should be visible. For example 2019-12-30. Omitting this value means end of time. |
| `hours_of_week` | [HoursOfWeek](#request-body-parameters-hoursofweek) | (_required_) List of time of day and day of week when an item should be visible when it is between the start date and end date. At least one entry is required. |

##### Request Body Parameters - HoursOfWeek

**Specifies the time of day and day of week when an item is visible to the user**

| Name | Type | Description |
| --- | --- | --- |
| `day_of_week` | string (**enum**) | The day of the week on which these hours will be applied.  
  
**ALLOWED VALUES**:
-   `“monday”`
-   `“tuesday”`
-   `“wednesday”`
-   `“thursday”`
-   `“friday”`
-   `“saturday”`
-   `“sunday”`

 |
| `time_periods` | [TimePeriod](#response-body-parameters-timeperiod)\[\] | The continuous time spans during which the item is visible. |

##### Request Body Parameters - Classifications

**Specifies the classifications for an item.**

| Name | Type | Description |
| --- | --- | --- |
| `can_serve_alone` | boolean | (_optional_) Indicates whether the item can be served on its own.  
  
This has implications in alcohol markets because in certain cases, alcohol must be sold with an entree (it cannot be sold alone). In that case, we want to know whether each item can qualify as an entree.  
  
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

##### Request Body Parameters - DietaryLabelInfo

**Dietary labels visible to the user.**

| Name | Type | Description |
| --- | --- | --- |
| `labels` | string\[\] ([DietaryLabels](#request-body-parameters-dietarylabels)) | (_required_) A list of strings from the allowed [DietaryLabels](#request-body-parameters-dietarylabels) table below which are applicable for the item/modifier option. This field must be set if _dietary\_label\_info_ is set.  
  
**Note: Sending an empty array will delete existing labels.** |

##### Request Body Parameters - DietaryLabels

**The possible dietary labels.**

| Dietary Label | Description |
| --- | --- |
| VEGAN | Item does not contain animal products. Vegan items are also vegetarian by definition. |
| VEGETARIAN | Item does not contain meat. |
| GLUTEN\_FREE | Item does not contain gluten. |

##### Request Body Parameters - ModifierGroup

**A grouping of items that can be selected as part of the purchase of a parent item, allowing the user to customize the item by making choices or bundling extras with their order.**

| Name | Type | Description |
| --- | --- | --- |
| `id` | string | A unique identifying string for the modifier group, provided by the restaurant. |
| `external_data` | string | (_optional_) Free-form text field reserved for the restaurant’s use, e.g. for POS integrations. (max 1024 characters) |
| `title` | [MultiLanguageText](#request-body-parameters-multilanguagetext) | The displayed name of the modifier group. |
| `quantity_info` | [QuantityConstraintRules](#request-body-parameters-quantityconstraintrules) | (_optional_) Constrains the quantities in which all items within the modifier group can be ordered. Allows overrides dependent on the ordered item’s context. |
| `modifier_options` | [MenuEntity](#request-body-parameters-menuentity)\[\] | A list of menu entity objects representing available item options for the modifier group - all entities must be of type `“ITEM”`. |
| `display_type` | string (**enum**) | (_optional_) Describes how this modifier group should be initially displayed - whether fully expanded (the default setting if this field is not provided), or collapsed.  
  
**ALLOWED VALUES**:
-   `“expanded”`
-   `“collapsed”`

 |

##### Request Body Parameters - TaxLabelsRuleSet

**The labels used to generate tax values.**

| Name | Type | Description |
| --- | --- | --- |
| `default_value` | [TaxLabelsInfo](#request-body-parameters-taxlabelsinfo) | The default value used. |

##### Request Body Parameters - TaxLabelsInfo

**The labels and source data for an item.**

| Name | Type | Description |
| --- | --- | --- |
| `labels` | string\[\] (**enum**) | A list of strings from the allowed [enums](#request-body-parameters-taxlabels). Allowed enums available in the TaxLabels table below. Category and Temperature Labels required.  
  
For example, if you have an item with Tax Classifcation “Pre-Packaged Snack” that is unheated then you would send a list containing:  
  
\[“CAT\_PREPACKAGED\_FOOD”, “CAT\_SNACK”, “TEMP\_UNHEATED”\] |
| `source` | string (**enum**) | Must be set to “MANUAL”. |

##### Request Body Parameters - TaxLabels

**The possible labels. Need to concat the value from “Category Labels” and “Temperature Labels”**

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
| Combo Meals or Gift Baskets | Combos or bundles that have different taxability when items are sold combined or bundled. | CAT\_COMBOS\_BUNDLES | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Cannabis | The product contains cannabis. | CAT\_CANNABIS | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Books | Books (not like Magazines or Newspaper). | CAT\_BOOK | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Child/Baby Car Seats | Car seats for children or babies. | CAT\_CHILD\_CAR\_SEAT | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Child/Baby Clothing | Clothing for children/ babies, up to young teens. Excludes older teens and up. Excludes costumes and protective garments/accessories like sports equipment/gear. | CAT\_CHILD\_CLOTHING | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |
| Sustainable Packaging | Take out boxes for food that are green or sustainable. | CAT\_SUSTAINABLE\_PACKAGING | Optional, can be empty. If provided, TEMP\_HEATED or TEMP\_UNHEATED or TEMP\_COLD |

##### Request Body Parameters - ProductInfo

**Product identification information i.e. UPC code**

| Name | Type | Description |
| --- | --- | --- |
| `target_market` | integer | (_optional_) Target market for the product. Values could be ISO 3166 Numeric code: [https://en.wikipedia.org/wiki/ISO\_3166-1](https://en.wikipedia.org/wiki/ISO_3166-1). In addition value `1` for Global and `97` for European Union. |
| `gtin` | string | (_optional_) GTIN for product, which could be UPC/EAN code. |
| `plu` | string | (_optional_) If the product is fresh produce, it can be identified using PLU code. [https://www.ifpsglobal.com/plu-codes](https://www.ifpsglobal.com/plu-codes) |
| `merchant_id` | string | (_optional_) If product doesn’t have gtin or plu, item can be identified using merchant’s internal id. |
| `product_type` | string | (_optional_) The product type associated with the item. Can be set along with GITN/PLU/MerchantID. [See list of product types](/docs/eats/references/api/v2/product-types) |
| `product_traits` | \[\]string | (_optional_) A list of the product traits associated with the item. Can be set along with GITN/PLU/MerchantID. [See list of product traits](/docs/eats/references/api/v2/product-types). |
| `countries_of_origin` | \[\]string | (_optional_) The countries of origin of the product |

##### Request Body Parameters - BundledItems

**These items are always included as part of other items and not shown & customizable to Eaters.**

| Name | Type | Description |
| --- | --- | --- |
| `item_id` | string | Reference to the existing item ID. |
| `core_price` | int | The intrinsic value of this bundled item. |
| `included_quantity` | int | The quantity of this item that is included. |

##### Request Body Parameters - PhysicalPropertiesInfo

**Additional product information related to products’ physical properties.**

| Name | Type | Description |
| --- | --- | --- |
| `reusable_packaging` | boolean | Indicates if the product comes in reusable packaging. |
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

A variety of example menu payloads are provided here: [Example Menu Payloads](../example-menu-payloads)

#### Response

`Status-Code: 204 No Content`

This endpoint returns an empty response body. To get full menu information for a store, use the [Get Menu API](get-eats-stores-storeid-menu).

[

Authorization

](#authorization)[

Encoding

](#encoding)[

Path Parameters

](#path-parameters)[

Field Behavior / Validation Rules

](#field-behavior-/-validation-rules)[

Alcoholic Product Classification

](#alcoholic-product-classification)[

Request Body Parameters

](#request-body-parameters)[

Request Body Parameters - MenuConfiguration

](#request-body-parameters-menuconfiguration)[

Request Body Parameters - Menu

](#request-body-parameters-menu)[

Request Body Parameters - MultiLanguageText

](#request-body-parameters-multilanguagetext)[

Request Body Parameters - Service Availability

](#request-body-parameters-service-availability)[

Request Body Parameters - TimePeriod

](#request-body-parameters-timeperiod)[

Request Body Parameters - Category

](#request-body-parameters-category)[

Request Body Parameters - MenuEntity

](#request-body-parameters-menuentity)[

Request Body Parameters - Item

](#request-body-parameters-item)[

Request Body Parameters - PriceRules

](#request-body-parameters-pricerules)[

Request Body Parameters - PriceOverride

](#request-body-parameters-priceoverride)[

Request Body Parameters - QuantityConstraintRules

](#request-body-parameters-quantityconstraintrules)[

Request Body Parameters - QuantityConstraint

](#request-body-parameters-quantityconstraint)[

Request Body Parameters - QuantityConstraintOverride

](#request-body-parameters-quantityconstraintoverride)[

Request Body Parameters - SuspensionRules

](#request-body-parameters-suspensionrules)[

Request Body Parameters - Suspension

](#request-body-parameters-suspension)[

Request Body Parameters - SuspensionOverride

](#request-body-parameters-suspensionoverride)[

Request Body Parameters - ModifierGroupsRules

](#request-body-parameters-modifiergroupsrules)[

Request Body Parameters - ModifierGroupsOverride

](#request-body-parameters-modifiergroupsoverride)[

Request Body Parameters - TaxInfo

](#request-body-parameters-taxinfo)[

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

Request Body Parameters - DishInfo

](#request-body-parameters-dishinfo)[

Request Body Parameters - VisibilityInfo

](#request-body-parameters-visibilityinfo)[

Request Body Parameters - visibilityHours

](#request-body-parameters-visibilityhours)[

Request Body Parameters - HoursOfWeek

](#request-body-parameters-hoursofweek)[

Request Body Parameters - Classifications

](#request-body-parameters-classifications)[

Request Body Parameters - FoodBusinessOperator

](#request-body-parameters-foodbusinessoperator)[

Request Body Parameters - DietaryLabelInfo

](#request-body-parameters-dietarylabelinfo)[

Request Body Parameters - DietaryLabels

](#request-body-parameters-dietarylabels)[

Request Body Parameters - ModifierGroup

](#request-body-parameters-modifiergroup)[

Request Body Parameters - TaxLabelsRuleSet

](#request-body-parameters-taxlabelsruleset)[

Request Body Parameters - TaxLabelsInfo

](#request-body-parameters-taxlabelsinfo)[

Request Body Parameters - TaxLabels

](#request-body-parameters-taxlabels)[

Request Body Parameters - ProductInfo

](#request-body-parameters-productinfo)[

Request Body Parameters - BundledItems

](#request-body-parameters-bundleditems)[

Request Body Parameters - PhysicalPropertiesInfo

](#request-body-parameters-physicalpropertiesinfo)[

Request Body Parameters - BeverageInfo

](#request-body-parameters-beverageinfo)[

Request Body Parameters - CoffeeInfo

](#request-body-parameters-coffeeinfo)[

Request Body Parameters - MedicationInfo

](#request-body-parameters-medicationinfo)[

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
