<!-- id=2038 path=Order API > Order Webhooks(recommend) -->
## Order Webhooks(recommend)

### Event1:orderNew

This callback will be triggered when a consumer has created and paid successfully for an order. After receiving it, you need to **confirm the order** in less than 5 minutes calling our **order/order/confirm endpoint** or the order will be **automatically canceled**. Read the documentation for it in **Confirm Order**.

> **IMPORTANT:** 
> If you want to use `expected_cook_eta`, `expected_arrived_eta`, please first confirm the order and then get these information from **order/order/detail**. Read the documentation for it in **Get Order Details**.

> **NOTE:** 
> If you can't get `promotions` information in the production environment, please contact us. We have a whitelist control and your app may need authorization. For more details, please check **Promotion Support**.

Our _orderNew_ webhook data structure follows the same structure as our **/order/order/detail** endpoint. Check the complete documentation for it in **Get Order Details**. There, you'll better understand the different models and fileds for `price` and `receive_address` that we have.

#### Request Body Example

```json
{
  "app_id": 5764607584567296012,
  "app_shop_id": "7093",
  "timestamp": 1615432308,
  "type": "orderNew",
  "data": {
    "order_id": 1152921547153933576,
    "order_info": {
      "order_id": 1152921547153933576,
      "status": 100,
      "order_index": 2,
      "remark": "",
      "city_id": 55000116,
      "country": "BR",
      "timezone": "America\\/Sao_Paulo",
      "pay_type": 1,
      "delivery_type": 2,
      "expected_cook_eta": 1615432434,
      "expected_arrived_eta": 1615434234,
      "create_time": 1602832474,
      "pay_time": 1602832477,
      "complete_time": 1602832780,
      "cancel_time": 1602832780,
      "shop_confirm_time": 1615432255,
      "price": {
        "order_price": 2000,
        "real_price": 2500,
        "real_pay_price": 2500,
        "delivery_price": 500,
        "refund_price": 2500,
        "items_discount": 0,
        "delivery_discount": 0,
        "others_fees": {
          "small_order_price": 0,
          "total_tip_money": 0,
          "service_price": 0,
          "coupon_discount": 0
        },
        "customer_need_paying_money": 2500
      },
      "shop": {
        "shop_id": 5764607688097661019,
        "app_shop_id": "7093",
        "shop_addr": "R. Congonhas, 405 - Santo Ant\\u00f4nio, Belo Horizonte - MG, 30330-100, Brasil",
        "shop_name": "allinone_BR_haojing_zipeisong",
        "shop_phone": [
          {
            "calling_code": 52,
            "phone": 12345678902,
            "type": "0"
          }
        ]
      },
      "receive_address": {
        "uid": 299070223744111,
        "name": "",
        "first_name": "",
        "last_name": "",
        "calling_code": "+81",
        "phone": "00016004812",
        "city": "Belo Horizonte",
        "country_code": "BR",
        "poi_address": "R. Congonhas, 405 - Santo Ant\\u00f4nio, Belo Horizonte - MG, 30330-100, Brasil",
        "house_number": "",
        "poi_lat": -19.9440597,
        "poi_lng": -43.9392454,
        "coordinate_type": "wgs84",
        "poi_display_name": "R. Congonhas, 405"
      },
      "order_items": [
        {
          "app_item_id": "110003_2_1",
          "app_external_id": "",
          "name": "King Jr. Hamburguesa de Pollo",
          "total_price": 7500,
          "sku_price": 7500,
          "amount": 1,
          "remark": "",
          "sub_item_list": [
            {
              "app_item_id": "110001_1_main",
              "app_external_id": "",
              "name": "Amiguito Pollo",
              "total_price": 0,
              "sku_price": 0,
              "amount": 1,
              "app_content_id": "110003_0",
              "content_app_external_id": "",
              "sub_item_list": [
                 
              ]
            },
            {
              "app_item_id": "110134_2_side",
              "app_external_id": "",
              "name": "Papas Chicas",
              "total_price": 0,
              "sku_price": 0,
              "amount": 1,
              "app_content_id": "110003_1",
              "content_app_external_id": "",
              "sub_item_list": [
                 
              ]
            },
            {
              "app_item_id": "110028_2_side",
              "app_external_id": "",
              "name": "Pepsi Black",
              "total_price": 0,
              "sku_price": 0,
              "amount": 1,
              "app_content_id": "110003_2",
              "content_app_external_id": "",
              "sub_item_list": [
                 
              ]
            }
          ],
          "real_price": 6000,
          "promo_type": 2,
          "promotion_detail": {
            "promo_type": 2,
            "promo_discount": 1500,
            "shop_subside_price": 1500
          },
          "promo_list": [
            {
              "promo_type": 2,
              "promo_discount": 1500,
              "shop_subside_price": 1500
            }
          ]
        },
        {
          "app_item_id": "110004_2_1",
          "app_external_id": "",
          "name": "King Jr. Hamburguesa de Queso",
          "total_price": 15000,
          "sku_price": 7500,
          "amount": 2,
          "remark": "",
          "sub_item_list": [
            {
              "app_item_id": "110007_1_main",
              "app_external_id": "",
              "name": "Hamburguesa con queso",
              "total_price": 0,
              "sku_price": 0,
              "amount": 1,
              "app_content_id": "110004_0",
              "content_app_external_id": "",
              "sub_item_list": [
                 
              ]
            },
            {
              "app_item_id": "110134_2_side",
              "app_external_id": "",
              "name": "Papas Chicas",
              "total_price": 0,
              "sku_price": 0,
              "amount": 1,
              "app_content_id": "110004_1",
              "content_app_external_id": "",
              "sub_item_list": [
                 
              ]
            },
            {
              "app_item_id": "16001_2_side",
              "app_external_id": "",
              "name": "AMI TOY VIGENTE",
              "total_price": 0,
              "sku_price": 0,
              "amount": 1,
              "app_content_id": "110004_3",
              "content_app_external_id": "",
              "sub_item_list": [
                 
              ]
            },
            {
              "app_item_id": "110028_2_side",
              "app_external_id": "",
              "name": "Pepsi Black",
              "total_price": 0,
              "sku_price": 0,
              "amount": 1,
              "app_content_id": "110004_2",
              "content_app_external_id": "",
              "sub_item_list": [
                 
              ]
            }
          ],
          "real_price": 15000,
          "promo_type": 0
        },
        {
          "app_item_id": "110004_2_1",
          "app_external_id": "",
          "name": "King Jr. Hamburguesa de Queso",
          "total_price": 7500,
          "sku_price": 7500,
          "amount": 1,
          "remark": "",
          "sub_item_list": [
            {
              "app_item_id": "110007_1_main",
              "app_external_id": "",
              "name": "Hamburguesa con queso",
              "total_price": 0,
              "sku_price": 0,
              "amount": 1,
              "app_content_id": "110004_0",
              "content_app_external_id": "",
              "sub_item_list": [
                 
              ]
            },
            {
              "app_item_id": "110134_2_side",
              "app_external_id": "",
              "name": "Papas Chicas",
              "total_price": 0,
              "sku_price": 0,
              "amount": 1,
              "app_content_id": "110004_1",
              "content_app_external_id": "",
              "sub_item_list": [
                 
              ]
            },
            {
              "app_item_id": "16001_2_side",
              "app_external_id": "",
              "name": "AMI TOY VIGENTE",
              "total_price": 0,
              "sku_price": 0,
              "amount": 1,
              "app_content_id": "110004_3",
              "content_app_external_id": "",
              "sub_item_list": [
                 
              ]
            },
            {
              "app_item_id": "110028_2_side",
              "app_external_id": "",
              "name": "Pepsi Black",
              "total_price": 0,
              "sku_price": 0,
              "amount": 1,
              "app_content_id": "110004_2",
              "content_app_external_id": "",
              "sub_item_list": [
                 
              ]
            }
          ],
          "real_price": 0,
          "promo_type": 4,
          "promotion_detail": {
            "promo_type": 4,
            "promo_discount": 7500,
            "shop_subside_price": 3750
          },
          "promo_list": [
            {
              "promo_type": 4,
              "promo_discount": 7500,
              "shop_subside_price": 3750
            }
          ]
        }
      ],
      "promotions": [
        {
          "promo_type": 4,
          "promo_discount": 7500,
          "shop_subside_price": 3750
        },
        {
          "promo_type": 2,
          "promo_discount": 1500,
          "shop_subside_price": 1500
        },
        {
          "promo_type": 11,
          "promo_discount": 1000,
          "shop_subside_price": 900
        }
      ]
    }
  }
}
```

### Event2:orderCancel

This callback will be triggered when an order is canceled by DiDi or by a customer.
    
#### Request Body Example

```json
{
    "app_id":123,
    "app_shop_id":"xxx",
    "type":"orderCancel",
    "timestamp":1592970557,
    "data":{
        "order_id":5764607801871630353
    }
}
```

### Event3:orderPartialCancel

When part of the order is cancelled, the notification will be pushed via this API.	
    
#### Request Body Example

```json
{
    "app_id":123,
    "app_shop_id":"xxx",
    "type":"orderPartialCancel",
    "timestamp":1592970557,
    "data":{
        "order_id":5764607801871630353
    }
}
```
### Event4:orderFinish

This callback will be triggered when an order is completed.

#### Request Body Example

```json    
{
    "app_id":123,
    "app_shop_id":"xxx",
    "type":"orderFinish",
    "timestamp":1592970557,
    "data":{
        "order_id":5764607801871630353
    }
}
```

### Event5:deliveryStatus

This callback will be triggered when the delivery status of an order has changed. The different status can be:

| **delivery_status** | **Description** |
| --- | --- |
| 120 | ASSIGNED: Assigned a courier. |
| 130 | ARRIVED_AT_B: Courier has reached the store. |
| 140 | TAKEN: The courier has picked up food. |
| 150 | ARRIVED_AT_C: The courier has reached the destination. |
| 160 | FINISH: Delivered. Order completed. |
| 170 | CANCEL: The delivery has been canceled. |
| 180 | REASSIGNED: A riders has been reassigned. |
| 190 | ABORTED: The delivery has been aborted. |

#### Request Body Example

```json
{
    "app_id":5764607618872501234,
    "app_shop_id":"001",
    "timestamp":1612455327,
    "type":"deliveryStatus",
    "data":{
        "order_id":5764608647577512345,
        "delivery_status":160,
        "rider_name":"xxx",
        "rider_phone":"15512345678"
        "rider_to_B_ETA": "1760034238"
    }
}
```

### Event6:orderCancelApply

This callback will be triggered for 6 times with 2 minutes interval each, when a customer requests the order is canceled. This function will only be trigger when the store agrees to receive order cancelations by the customer with **/shop/apply/set** endpoint (read more in **Set Store Cancelation/Refund**). When set to support, by default, we will  **refuse**  the request if the store don't handle it in time. To agree or not to the request, you need to send the information to the **/order/apply/cancel** endpoint (read more in **Order Cancel Apply**).

#### Request Body Example

```json
{
    "app_id":1152921654762997000,
    "app_shop_id":"0001",
    "type":"orderCancelApply",
    "timestamp":1592970557,
    "data":{
        "order_id":1152921654762996500,
        "apply_reason":"do not want",
        "apply_id":1152921654813328100,
        "reason_list":[
            {
                "reason":"preparing"
            },
            {
                "reason":"prepared"
            },
            {
                "reason":"courier arrived"
            },
            {
                "reason":"courier taken"
            }
        ]
    }
}
```

### Event7:orderRefundApply

This callback will be triggered for 25 times with 1 hour interval each when a customer applies for refund. This function will only be trigger when the store agrees to receive refunds with **/shop/apply/set** endpoint (read more in **Set Store Cancelation/Refund**). When set to support, by default, we will  **agree**  to refund if the store don't handle it in time. To agree or not to the request, you need to send the information to the **/order/apply/refund** endpoint (read more in **Order Refund Apply**).

#### Request Body Example

```json
{
    "app_id":1152921654762997000,
    "app_shop_id":"0001",
    "type":"orderRefundApply",
    "timestamp":1592970557,
    "data":{
        "order_id":1152921654762996500,
        "apply_reason":"missing items, I want to refund",
        "images":[
            "https://user/missing/items/image.jpng"
        ],
        "apply_id":1152921654813328100,
        "base_reason_list":[
            {
                "base_reason_id":"430001",
                "base_reason":"Communication with user redo a Delivery"
            },
            {
                "base_reason_id":"430002",
                "base_reason":"Communication with user replace with others"
            },
            {
                "base_reason_id":"430003",
                "base_reason":"The merchandise already give courier"
            },
            {
                "base_reason_id":"430004",
                "base_reason":"Courier sent miss"
            },
            {
                "base_reason_id":"430005",
                "base_reason":"User misunderstands"
            },
            {
                "base_reason_id":"430006",
                "base_reason":"I just want refund a part"
            },
            {
                "base_reason_id":"430007",
                "base_reason":"Missing user information"
            },
            {
                "base_reason_id":"430008",
                "base_reason":"Other"
            }
        ]
    }
}
```
