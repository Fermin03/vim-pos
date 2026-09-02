<!-- id=2044 path=Reports API > Payment Reconciliation Report -->

## Financial data list interface

`GET` [https://openapi.didi-food.com/v1/finance/finance/getBillList](https://openapi.didi-food.com/v1/finance/finance/getBillList)
> **Attention:** 
>
> 1 - In order to get access to the bill list, the party that is interested in using this endpoint shall be enlisted to an internal whitelist, therefore, please contact us to get access to this part. We will only provide access of this endpoint only to the parties that has signed a cooperation contract with DiDiFood. 
>
> 2- This is a pilot version for reference only. During the pilot version, you may somehow not match the report downloaded from the DiDiStore APP. If you find any difference, please use the data from report donwloaded from the DiDiStore APP as the correct one.

This Get Bill List endpoint allow developers to extract detailed weekly payment reconciliation information (financial report) of a certain store.

This report only allows pulling data as of three (3) months before the requesting date (From May 2022 on), and is provided each Wednesday.

It is important to highlight that since these reports are for payment reconciliation purposes, we will provide the information based on the full week from Monday to Sunday (even that the request is on a day in the mid of the week) to enable the user of the report to perform reconciliation with the payments received in their banks.

In additional to the other endpoints, the Integrators/POS that wants to make use of this endpoint shall request an access to DiDiFood integration department to proceed.

Since the auth_token is a crucial part for confirming the order, we recommend establishing a process for automatically refresh the auth_token if necessary, as described in Get Authtoken.

### Request Body Parameters

| **Name** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| `auth_token` | string | Yes | The auth_token for the shop. | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU= |
| `start_date` | string | Yes | Start date (Maximum data within 3 months) | 20220201 |
| `end_date` | string | Yes | End date (Maximum time span of 1 month) | 20220301 |
| `page_no` | int | Yes | Page number | 1 |
| `page_size` | int | Yes | Page Size(Max 200) | 100 |

### Response Body Parameters

| **Name** | **Type** | **Description** | **Example** |
| --- | --- | --- | --- |
| `data` | array | Data |

### Response Body Parameters - Data
| **Name** | **Type** | **Description** | **Example** |
| --- | --- | --- | --- |
| `total_num` | int | Total number of data |
| `total_page` | int | Total number of page |
| `page_size` | int | Page Size |
| `page_no` | int | Page number |
| `list` | array | List | [] |

### Response Body Parameters - List
#### Main Fields ####

> Note: The fields with "*" are the ones newly added since December 2022.

| **Name** | **Type** | **Description** | **Example** |
| --- | --- | --- | --- |
| `shop_id` | int64 | Store Id |
| `shop_name` | string | Store Name |
| `city_id` | int64 | City ID |
| `city_name` | string | City Name |
| `order_id` | string | Order Id |
| `order_index` | string | Take meal number |
| `order_type` | int | Document type: 1 Order revenue; 2 Order refund; 3 Partial refund during sale; 4 After sales partial refund; 5 Non accompanying order|
| `sub_order_type` *  | int | Please see below -- sub_order_type params list for reference |  |
| `delivery_type` | int | Delivery type 1 Platform delivery ;2 Store delivery ;3 DaDa|
| `business_ts` | int | Order placed time (after payment from users) |
| `timezone` * | int  | Timezone where the order was placed and executed| America/Sao_Paulo|
| `meal_original_amount` | int64 | Original price of items |
| `shop_activity_outcome` | int64 | Preferential expenditure for items |
| `shop_activity_subsidy` | int64 | Preferential subsidies for items |
| `shop_delivery_amount` | int64 | Self distribution and delivery fee |
| `free_delivery_outcome` | int64 | Expenditure of free allocation activities |
| `free_delivery_subsidy` | int64 | Subsidy for distribution activities|
| `commission_base_amount` | int64 | Commission base |
| `commission_rate` | int64 | Commission rate |
| `commission_amount` | int64 | Commission |
| `commission_subsidy_amount` | int64 | Commission subsidy |
| `order_amount` | int64 | Order revenue |
| `meal_loss_deduct_amount` * | int64 | Meal loss deduction amount |
| `shop_pre_tips` | int64 | Front tip |
| `payment_method` | int | payment method 1 online ;2 offline;-1 refund |
| `cash_balance` | int64 | Cash collection |
| `settlement_amount` | int64 | Settlement amount |
| `expect_settle_ts` | int | pay time |
| `settle_start_date` | string | Billing start time | 20220101
| `settle_end_date` | string | Billing end time | 20220107
| `contractor_id` | int64 | Contractor Id |
| `contractor_name` | string | Contractor name |
| `tax_id` | string | Tax Id|
| `country` | string | country|

#### sub_order_type List ####
| sub_order_type | Description |
|--|--|
|1|Order revenue|
|2|Order refund|
|3|Partial refund during sale|
|4|After sales partial refund|
|188|Order target bonus|
|189|Order fulfillment bonus|
|190|Courier drive bonus|
|191|Other - Bonuses|
|192|Anti-fraud reimbursement|
|193|Anti-fraud deduction|
|194|Adjustment to payment (Reimbursement)|
|195|Adjustment to payment (Deduction)|
|196|Service control reimbursement|
|197|Service control deduction|
|220|Anti-fraud penalty|
|221|Service control penalty|
|222|Freeze Account|
|236|Connectivity bonus|
|237|Orde loss reimbursement|
|240|Non-promotional activity bonus reimbursement|
|241|Non-promotional activity bonus deduction|
|242|Commission reimbursement|
|243|Other - Deductions|
|244|Delivery promotion deductions|
|20001|Payment|
|20003|Settlement|
|20101|Return of funds due to failed payment|
|40006|Refund of leased equipment|
|40007|Cost of leased equipment|
|40008|Activation Fee|
|40150|VAT|
|40151|VAT reimbursement|
|40154|VAT manual deduction|
|40160|ISR - retained (Persona fisica Mexico)|
|40164|VAT - retained (Persona fisica Mexico)|
|40168|ISR - retained (Cedular)|
|40171|Donations|
|71001|Credit payment|
|99903|New store bonus|




### Response Example

```json
{
  "errno": 0,
  "errmsg": "ok",
  "requestId": "s1211211623c3d8318086a1f0993ae02",
  "time": 1648115075,
  "data": {
    "total_num": 1156,
    "total_page": 116,
    "page_size": 10,
    "page_no": 1,
    "list": [
      {
        "shop_id": 5764607525450942388,
        "shop_name": "test_1643093129_LDBIiKriIJGlUijIgZI",
        "city_id": 52140500,
        "city_name": "Guanajuato",
        "order_id": "11122",
        "order_index": "1",
        "order_type": 2,
        "sub_order_type": 2,
        "delivery_type": 1,
        "business_ts": 1646114390,
        "meal_original_amount": 10,
        "meal_loss_deduct_amount": 0,
        "shop_activity_outcome": 10,
        "shop_activity_subsidy": 10,
        "shop_delivery_amount": 10,
        "free_delivery_outcome": 10,
        "free_delivery_subsidy": 10,
        "commission_base_amount": 10,
        "commission_rate": 12,
        "commission_amount": 10,
        "commission_subsidy_amount": 10,
        "order_amount": 10,
        "shop_pre_tips": 10,
        "payment_method": 1,
        "cash_balance": 10,
        "settlement_amount": 10,
        "expect_settle_ts": 1647592497,
        "settle_start_date": "20220213",
        "settle_end_date": "20220220",
        "contractor_id": 5764607525597743028,
        "contractor_name": "Testing_Store_Signatory",
        "tax_id": "1231",
        "country": "MX",
        "timezone": "es-MX"
      },
      {
        "shop_id": 5764607525450942388,
        "shop_name": "test_1643093129_LDBIiKriIJGlUijIgZI",
        "city_id": 52140500,
        "city_name": "Guanajuato",
        "order_id": "11123",
        "order_index": "1",
        "order_type": 2,
        "sub_order_type": 2,
        "delivery_type": 1,
        "business_ts": 1646114390,
        "meal_original_amount": 10,
        "meal_loss_deduct_amount": 0,
        "shop_activity_outcome": 10,
        "shop_activity_subsidy": 10,
        "shop_delivery_amount": 10,
        "free_delivery_outcome": 10,
        "free_delivery_subsidy": 10,
        "commission_base_amount": 10,
        "commission_rate": 12,
        "commission_amount": 10,
        "commission_subsidy_amount": 10,
        "order_amount": 10,
        "shop_pre_tips": 10,
        "payment_method": 1,
        "cash_balance": 10,
        "settlement_amount": 10,
        "expect_settle_ts": 1647592497,
        "settle_start_date": "20220213",
        "settle_end_date": "20220220",
        "contractor_id": 5764607525597743028,
        "contractor_name": "Testing_Store_Signatory",
        "tax_id": "1232",
        "country": "MX",
        "timezone": "es-MX"
      },
      {
        "shop_id": 5764607525450942388,
        "shop_name": "test_1643093129_LDBIiKriIJGlUijIgZI",
        "city_id": 52140500,
        "city_name": "Guanajuato",
        "order_id": "11124",
        "order_index": "1",
        "order_type": 2,
        "sub_order_type": 2,
        "delivery_type": 1,
        "business_ts": 1646114390,
        "meal_original_amount": 10,
        "meal_loss_deduct_amount": 0,
        "shop_activity_outcome": 10,
        "shop_activity_subsidy": 10,
        "shop_delivery_amount": 10,
        "free_delivery_outcome": 10,
        "free_delivery_subsidy": 10,
        "commission_base_amount": 10,
        "commission_rate": 12,
        "commission_amount": 10,
        "commission_subsidy_amount": 10,
        "order_amount": 10,
        "shop_pre_tips": 10,
        "payment_method": 1,
        "cash_balance": 10,
        "settlement_amount": 10,
        "expect_settle_ts": 1647592497,
        "settle_start_date": "20220213",
        "settle_end_date": "20220220",
        "contractor_id": 5764607525597743028,
        "contractor_name": "Testing_Store_Signatory",
        "tax_id": "1233",
        "country": "MX",
        "timezone": "es-MX"
      },
      {
        "shop_id": 5764607525450942388,
        "shop_name": "test_1643093129_LDBIiKriIJGlUijIgZI",
        "city_id": 52140500,
        "city_name": "Guanajuato",
        "order_id": "11125",
        "order_index": "1",
        "order_type": 2,
        "sub_order_type": 2,
        "delivery_type": 1,
        "business_ts": 1646114390,
        "meal_original_amount": 10,
        "meal_loss_deduct_amount": 0,
        "shop_activity_outcome": 10,
        "shop_activity_subsidy": 10,
        "shop_delivery_amount": 10,
        "free_delivery_outcome": 10,
        "free_delivery_subsidy": 10,
        "commission_base_amount": 10,
        "commission_rate": 12,
        "commission_amount": 10,
        "commission_subsidy_amount": 10,
        "order_amount": 10,
        "shop_pre_tips": 10,
        "payment_method": 1,
        "cash_balance": 10,
        "settlement_amount": 10,
        "expect_settle_ts": 1647592497,
        "settle_start_date": "20220213",
        "settle_end_date": "20220220",
        "contractor_id": 5764607525597743028,
        "contractor_name": "Testing_Store_Signatory",
        "tax_id": "1234",
        "country": "MX",
        "timezone": "es-MX"
      },
      {
        "shop_id": 5764607525450942388,
        "shop_name": "test_1643093129_LDBIiKriIJGlUijIgZI",
        "city_id": 52140500,
        "city_name": "Guanajuato",
        "order_id": "11126",
        "order_index": "1",
        "order_type": 2,
        "sub_order_type": 2,
        "delivery_type": 1,
        "business_ts": 1646114390,
        "meal_original_amount": 10,
        "meal_loss_deduct_amount": 0,
        "shop_activity_outcome": 10,
        "shop_activity_subsidy": 10,
        "shop_delivery_amount": 10,
        "free_delivery_outcome": 10,
        "free_delivery_subsidy": 10,
        "commission_base_amount": 10,
        "commission_rate": 12,
        "commission_amount": 10,
        "commission_subsidy_amount": 10,
        "order_amount": 10,
        "shop_pre_tips": 10,
        "payment_method": 1,
        "cash_balance": 10,
        "settlement_amount": 10,
        "expect_settle_ts": 1647592497,
        "settle_start_date": "20220213",
        "settle_end_date": "20220220",
        "contractor_id": 5764607525597743028,
        "contractor_name": "Testing_Store_Signatory",
        "tax_id": "1235",
        "country": "MX",
        "timezone": "es-MX"
      },
      {
        "shop_id": 5764607525450942388,
        "shop_name": "test_1643093129_LDBIiKriIJGlUijIgZI",
        "city_id": 52140500,
        "city_name": "Guanajuato",
        "order_id": "11127",
        "order_index": "1",
        "order_type": 2,
        "sub_order_type": 2,
        "delivery_type": 1,
        "business_ts": 1646114390,
        "meal_original_amount": 10,
        "meal_loss_deduct_amount": 0,
        "shop_activity_outcome": 10,
        "shop_activity_subsidy": 10,
        "shop_delivery_amount": 10,
        "free_delivery_outcome": 10,
        "free_delivery_subsidy": 10,
        "commission_base_amount": 10,
        "commission_rate": 12,
        "commission_amount": 10,
        "commission_subsidy_amount": 10,
        "order_amount": 10,
        "shop_pre_tips": 10,
        "payment_method": 1,
        "cash_balance": 10,
        "settlement_amount": 10,
        "expect_settle_ts": 1647592497,
        "settle_start_date": "20220213",
        "settle_end_date": "20220220",
        "contractor_id": 5764607525597743028,
        "contractor_name": "Testing_Store_Signatory",
        "tax_id": "1236",
        "country": "MX",
        "timezone": "es-MX"
      },
      {
        "shop_id": 5764607525450942388,
        "shop_name": "test_1643093129_LDBIiKriIJGlUijIgZI",
        "city_id": 52140500,
        "city_name": "Guanajuato",
        "order_id": "11128",
        "order_index": "1",
        "order_type": 2,
        "sub_order_type": 2,
        "delivery_type": 1,
        "business_ts": 1646114390,
        "meal_original_amount": 10,
        "meal_loss_deduct_amount": 0,
        "shop_activity_outcome": 10,
        "shop_activity_subsidy": 10,
        "shop_delivery_amount": 10,
        "free_delivery_outcome": 10,
        "free_delivery_subsidy": 10,
        "commission_base_amount": 10,
        "commission_rate": 12,
        "commission_amount": 10,
        "commission_subsidy_amount": 10,
        "order_amount": 10,
        "shop_pre_tips": 10,
        "payment_method": 1,
        "cash_balance": 10,
        "settlement_amount": 10,
        "expect_settle_ts": 1647592497,
        "settle_start_date": "20220213",
        "settle_end_date": "20220220",
        "contractor_id": 5764607525597743028,
        "contractor_name": "Testing_Store_Signatory",
        "tax_id": "1237",
        "country": "MX",
        "timezone": "es-MX"
      },
      {
        "shop_id": 5764607525450942388,
        "shop_name": "test_1643093129_LDBIiKriIJGlUijIgZI",
        "city_id": 52140500,
        "city_name": "Guanajuato",
        "order_id": "11129",
        "order_index": "1",
        "order_type": 2,
        "sub_order_type": 2,
        "delivery_type": 1,
        "business_ts": 1646114390,
        "meal_original_amount": 10,
        "meal_loss_deduct_amount": 0,
        "shop_activity_outcome": 10,
        "shop_activity_subsidy": 10,
        "shop_delivery_amount": 10,
        "free_delivery_outcome": 10,
        "free_delivery_subsidy": 10,
        "commission_base_amount": 10,
        "commission_rate": 12,
        "commission_amount": 10,
        "commission_subsidy_amount": 10,
        "order_amount": 10,
        "shop_pre_tips": 10,
        "payment_method": 1,
        "cash_balance": 10,
        "settlement_amount": 10,
        "expect_settle_ts": 1647592497,
        "settle_start_date": "20220213",
        "settle_end_date": "20220220",
        "contractor_id": 5764607525597743028,
        "contractor_name": "Testing_Store_Signatory",
        "tax_id": "1238",
        "country": "MX",
        "timezone": "es-MX"
      },
      {
        "shop_id": 5764607525450942388,
        "shop_name": "test_1643093129_LDBIiKriIJGlUijIgZI",
        "city_id": 52140500,
        "city_name": "Guanajuato",
        "order_id": "11130",
        "order_index": "1",
        "order_type": 2,
        "sub_order_type": 2,
        "delivery_type": 1,
        "business_ts": 1646114390,
        "meal_original_amount": 10,
        "meal_loss_deduct_amount": 0,
        "shop_activity_outcome": 10,
        "shop_activity_subsidy": 10,
        "shop_delivery_amount": 10,
        "free_delivery_outcome": 10,
        "free_delivery_subsidy": 10,
        "commission_base_amount": 10,
        "commission_rate": 12,
        "commission_amount": 10,
        "commission_subsidy_amount": 10,
        "order_amount": 10,
        "shop_pre_tips": 10,
        "payment_method": 1,
        "cash_balance": 10,
        "settlement_amount": 10,
        "expect_settle_ts": 1647592497,
        "settle_start_date": "20220213",
        "settle_end_date": "20220220",
        "contractor_id": 5764607525597743028,
        "contractor_name": "Testing_Store_Signatory",
        "tax_id": "1239",
        "country": "MX",
        "timezone": "es-MX"
      },
      {
        "shop_id": 5764607525450942388,
        "shop_name": "test_1643093129_LDBIiKriIJGlUijIgZI",
        "city_id": 52140500,
        "city_name": "Guanajuato",
        "order_id": "11131",
        "order_index": "1",
        "order_type": 2,
        "sub_order_type": 2,
        "delivery_type": 1,
        "business_ts": 1646114390,
        "meal_original_amount": 10,
        "meal_loss_deduct_amount": 0,
        "shop_activity_outcome": 10,
        "shop_activity_subsidy": 10,
        "shop_delivery_amount": 10,
        "free_delivery_outcome": 10,
        "free_delivery_subsidy": 10,
        "commission_base_amount": 10,
        "commission_rate": 12,
        "commission_amount": 10,
        "commission_subsidy_amount": 10,
        "order_amount": 10,
        "shop_pre_tips": 10,
        "payment_method": 1,
        "cash_balance": 10,
        "settlement_amount": 10,
        "expect_settle_ts": 1647592497,
        "settle_start_date": "20220213",
        "settle_end_date": "20220220",
        "contractor_id": 5764607525597743028,
        "contractor_name": "Testing_Store_Signatory",
        "tax_id": "1240",
        "country": "MX",
        "timezone": "es-MX"
      }
    ]
  }
}  
```