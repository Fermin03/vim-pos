<!-- id=1960 path=Order API > Promotions -->
## Promotions

For now, you could get promotions information within *orderNew* Callback and **Get Order Details** endpoint. If you use our API to manage the store menu, we suggest to upgrade to v2 or v3 of **Upload Store Menu Details** endpoint that support promotions better. The promotions structures are **only available for production apps**. If you are not receiving it, please contact us.

> **IMPORTANT:**
> 
> Do **NOT** take `promo_type` as the tag to calculate which promotions shall apply to the store or not as in practise the Consumer can use any type of promotions that is applicable to them and get the benefits.
> 
> Promotions can only be created with the following methods:
> * B-App/DiDi's Store app (Fully subsidized by the store/brand)
> * DiDiFood's team through our internal system
> * Flagship or event registrations
> * Menu upload (Fully subsidized by the store/brand):
	> 		- **Food V3**: Please see https://developer.didi-food.com/en-US/openapi > Food Menu API > Upload Store Menu Details V3 (recommend) > `activity_price`
	>		- **Food V2**: Please see https://developer.didi-food.com/en-US/openapi > Old Endpoint Versions > Upload Store Menu Details V2 > `activity_price`
	> 		- **Grocery**: Please see https://developer.didi-food.com/en-US/openapi > Grocery Menu API > Upload Grocery Menu Details > `activity_price`

### Setting up a promotion in the testing store

You can create a promotion in your testing store directly in DiDi Store to ensure your integration is handeling the prices and promotions structure in the right way. In B-App, go the the menu **DiDi Academy** and look for the topics related to promotions. Will be able to create 4 different types of promotion directly in the menu **Promotions**. After this, follow the steps in **Testing and Debugging > Testing the Integration > Using a Test Store** to place an order to your test store and receive the promotion information in the order's JSON.

### Resources:

Stores and integrators can understand a little more about the promotion information [downloading this guide](https://img0.didiglobal.com/static/starfile/node20220507/895f1e95e30aba5dd56d6f2ccf768b57/aXwGURTRUs1651858294227.zip).


### Types of Promotions Supported

| **promo_type** | **Name** | **Description** |**Applicability** |
| --- | --- | --- |--- |
| 0 | - | No promotion, default value. |None|
| 1 | Minimum Order Discount | Encourage spending by offering discounts at different price points. |Order level, both Food and Groceries|
| 2 | Sale Item Promotion | Set a special discount price to certain items. |Item level, both Food and Groceries|
| 3 | Free Delivery Event | When the customer reaches a certain spending threshold, the store waives the delivery fee. |Order level, both Food and Groceries|
| 4 | Buy X Get Y Promotion | Allows you to configure sales promotions such as "Buy 1 Get 2" or "Buy 2 Get 3". Promotions help boost sales and orders without reducing average revenue per customer. |Item level, only Food|
| 5 | Buy More, Save More | Buy X, save Y%: Buy 2, save 20%; Buy X, save $ Y: Buy 3, save $10; Buy X for $ Y: Buy 3 for $100.| Item level, both Food and Groceries
| 10 | Overall Order Coupon | Coupon on overall total of the order (Items + delivery fee + service fee). |Order level, both Food and Groceries|
| 11 | Order Items Coupon | Coupon on the total of the items of the order. |Order level, only Food|
| 12 | Delivery Coupon | Coupon on the delivery fee. |Order level, both Food and Groceries|
| 20 | Delivery Member Discount | Delivery discount because the customer is a DiDi Member. |Order level, both Food and Groceries|
| 30 | Share Delivery Discount | Delivery discount because of different orders share the same courier. |Order level, both Food and Groceries|
| 34 | Didi Membership Discount | Didi membership discount for consumers that is part of Didi membership |Order level, both Food and Groceries|
| 100| New User Discount | Discounts provided to the new users of DidiFood|Either item or order level, both Food and Groceries|
| 101| Recurrent User Discount | Discounts provided to the users that have been buying recurrently in DidiFood|Either item or order level, both Food and Groceries|

### Important Information For Promotions in Order's Structures

### Response Body Parameters - Order items

|Name|Type|Description|
|--|--|--|
|`app_item_id`|string|The unique identification of an item in the Store / Integrator's system|
|`name`|string|The item name that is displayed in the menu of the Store|
|`sku_price`|integer|The price for each item/subItem. Note: Price is always an integer value and is set in the lowest denomination (e.g. cents for MXN, not Peso).|
|`total_price`|integer|The total price of the item without any promotion: and is calculated in accordance to this equation: [(sku_price of the main item + sku_price of the subitems) * amount of the main item]; Note: Price is always an integer value (never decimals) because the price is set in the lowest denomination (e.g. cents for MXN currency, not Peso).|
|`amount`|integer|Quantity of the item.|
|`submit_refund_amount`|integer|This field represents the number of items refunded: Amount − submit_refund_amount = Actual number of items currently in order.|
|`sub_item_list`|array|List of the selected subitems of the store's modifier groups. Note: The `amount` in the sub_item_list is the quantity of the sub_item for each main item, meaning that the real required quantity of subitems that needs to be served to the Consumer is [(`amount` under the main item) * (`amount` under the sub_item_list)]|
|`real_price`|integer|The actual amount paid by the Consumer for the item|
|`promotion_detail`|array|A json structure that contains all details related to the item. Check below for more details|
|`promo_list`|array|List of all promotion under the item|

### Response Body Parameters - Promotion Detail  (Item level)

>  DiDiFood allows the Consumers to apply different types of promotions to a **certain item** to maximize their experience in the sense of value for money, meaning that they can apply parallely coupons and price discount to the same item in the same order.

Promotion detail provides the **summary** of all promotions that are applicable to a **certain item**. 

|Name|Type|Description|
|--|--|--|
|`promo_type`|int|The type of the promotion that is applicable to the item. Please see more details in the table above. When the Consumer uses more than one type of promotion, DiDiFood will always display the value 2|
|`promo_discount`|int|The total promotion amount that is applicable to the item and perceived by the Consumer. If the same item is chosen more than once, to obtain the unit promotion amount perceived by the Consumer under the certain `promo_type`, this `promo_discount` must be divided into the `amount` of the main item|
|`shop_subside_price`|int|The total promotion amount that is applicable to the item and subsidized/invested by the Store. If the same item is chosen more than once, to obtain the unit promotion amount perceived by the Consumer under the certain `promo_type`, this `promo_discount` must be divided into the `amount` of the main item|

### Response Body Parameters - Promo List  (Item level)

>  DiDiFood allows the Consumers to apply different types of promotions to a **certain item** to maximize their experience in the sense of value for money, meaning that they can apply parallely coupons and price discount to the same item in the same order.
 
Promotion detail provides the **each** of the promotions that are applicable to a **certain item**. 

|Name|Type|Description|
|--|--|--|
|`promo_type`|int|The specific type of the promotion that is applicable to the item. Please see more details in the table above|
|`promo_discount`|int|The specific promotion amount that is applicable to the item and perceived by the Consumer. If the same item is chosen more than once, to obtain the unit promotion amount perceived by the Consumer under the certain `promo_type`, this `promo_discount` must be divided into the `amount` of the main item|
|`shop_subside_price`|int|The specific promotion amount that is applicable to the item and subsidized/invested by the Store. If the same item is chosen more than once, to obtain the unit promotion amount perceived by the Consumer under the certain `promo_type`, this `promo_discount` must be divided into the `amount` of the main item|

### Response Body Parameters - Promotion (Order level)

Promotion provides the **summary** of all promotions that are applicable to a **specific order**. It lists out all kinds of promotions in terms of item level, order level and delivery level. 

|Name|Type|Description|
|--|--|--|
|`promo_type`|int|The type of the promotion that is applicable to the order. Please see more details in the table above. When the Consumer uses more than one type of promotion in an item, DiDiFood will always display the value 2 for that item promo|
|`promo_discount`|int|The promotion amount that is applicable to that specific listed promotion and perceived by the Consumer|
|`shop_subside_price`|int|The promotion amount that is applicable to that specific listed promotion and subsidized/invested by the Store|
#### Didi Delivery sample order with different types of promotions

``` json
{
    "app_id":Test_DiDiFoodAPPID,
    "app_shop_id":"Test_DiDiFood",
    "type":"orderNew",
    "timestamp":1692910912,
    "data":{
        "order_id":TE5764625609393245013DD,
        "order_info":{
            "order_id":TE5764625609393245013DD,
            "status":100,
            "order_index":28,
            "remark":"",
            "country":"CO",
            "city_id":57010100,
            "timezone":"America\/test_didi",
            "pay_type":2,
            "pay_method":2,
            "pay_channel":153,
            "delivery_type":1,
            "delivery_eta":0,
            "expected_cook_eta":0,
            "expected_arrived_eta":1692912938,
            "create_time":1692910912,
            "pay_time":1692910912,
            "complete_time":0,
            "cancel_time":0,
            "shop_confirm_time":0,
            "price":{
                "order_price":5460000,
                "items_discount":2488000,
                "delivery_discount":400000,
                "shop_paid_money":0,
                "refund_price":0
            },
            "shop":{
                "shop_id":TE5764607526117835635DD,
                "app_shop_id":"Test_DiDiFood",
                "shop_addr":"Test_DiDiFood",
                "shop_name":"Test_DiDiFood (La Test_DiDiFood)",
                "shop_phone":[
                    {
                        "calling_code":00,
                        "phone":0000000000,
                        "type":"1"
                    }
                ]
            },
            "receive_address":{
                "uid":0,
                "name":"privacy protection",
                "first_name":"privacy protection",
                "last_name":"",
                "calling_code":"test_didi",
                "phone":"312***7823",
                "city":"test_didi",
                "country_code":"test_didi",
                "poi_address":"privacy protection",
                "house_number":"privacy protection",
                "poi_lat":0,
                "poi_lng":-00,
                "coordinate_type":"wgs84",
                "poi_display_name":"privacy protection"
            },
            "order_items":[
                {
                    "app_item_id":"Test_item_ID",
                    "app_external_id":"",
                    "name":"Test_main_dish,",
                    "total_price":5460000,
                    "sku_price":5460000,
                    "amount":1,
                    "remark":"",
                    "sub_item_list":[
                        {
                            "app_item_id":"Test_item_ID-0-test-50755-test-0",
                            "app_external_id":"",
                            "name":"Test_subitem1",
                            "total_price":0,
                            "sku_price":0,
                            "amount":1,
                            "app_content_id":"Test_item_ID-0",
                            "content_app_external_id":"",
                            "sub_item_list":[

                            ]
                        },
                        {
                            "app_item_id":"Test_item_ID-4-8051-53637-test-0",
                            "app_external_id":"",
                            "name":"Test_subitem2",
                            "total_price":0,
                            "sku_price":0,
                            "amount":1,
                            "app_content_id":"Test_item_ID-4",
                            "content_app_external_id":"",
                            "sub_item_list":[

                            ]
                        },
                        {
                            "app_item_id":"Test_item_ID-2-7816-50853-test-0",
                            "app_external_id":"",
                            "name":"Test_subitem3",
                            "total_price":0,
                            "sku_price":0,
                            "amount":1,
                            "app_content_id":"Test_item_ID-2",
                            "content_app_external_id":"",
                            "sub_item_list":[

                            ]
                        },
                        {
                            "app_item_id":"Test_item_ID-3-7817-50832-test-0",
                            "app_external_id":"",
                            "name":"Test_subitem4",
                            "total_price":0,
                            "sku_price":0,
                            "amount":1,
                            "app_content_id":"Test_item_ID-3",
                            "content_app_external_id":"",
                            "sub_item_list":[

                            ]
                        },
                        {
                            "app_item_id":"Test_item_ID-5-8052-53647-test-0",
                            "app_external_id":"",
                            "name":"Test_subitem2",
                            "total_price":0,
                            "sku_price":0,
                            "amount":1,
                            "app_content_id":"Test_item_ID-5",
                            "content_app_external_id":"",
                            "sub_item_list":[

                            ]
                        },
                        {
                            "app_item_id":"Test_item_ID-1-7815-50757-test-0",
                            "app_external_id":"",
                            "name":"Test_subitem5",
                            "total_price":0,
                            "sku_price":0,
                            "amount":1,
                            "app_content_id":"Test_item_ID-1",
                            "content_app_external_id":"",
                            "sub_item_list":[

                            ]
                        }
                    ],
                    "promo_type":2,
                    "real_price":3822000,
                    "promotion_detail":{
                        "promo_type":2,
                        "promo_discount":1638000,
                        "shop_subside_price":1470000
                    },
                    "promo_list":[
                        {
                            "promo_type":101,
                            "promo_discount":168000,
                            "shop_subside_price":0
                        },
                        {
                            "promo_type":2,
                            "promo_discount":1470000,
                            "shop_subside_price":1470000
                        }
                    ]
                }
            ],
            "promotions":[
                {
                    "promo_type":2,
                    "promo_discount":168000,
                    "shop_subside_price":0
                },
                {
                    "promo_type":2,
                    "promo_discount":1470000,
                    "shop_subside_price":1470000
                },
                {
                    "promo_type":3,
                    "promo_discount":400000,
                    "shop_subside_price":0
                },
                {
                    "promo_type":11,
                    "promo_discount":850000,
                    "shop_subside_price":0
                }
            ]
        }
    }
}
```
