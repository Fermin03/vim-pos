<!-- id=2020 path=FAQ > Orders -->
## Orders

### Receiving Orders

**In addition to the POS application, should DiDi's application be opened to receive orders?**
When using OpenAPI to receive orders, there is no need to keep DiDi's application online.

**Does Get Order Details endpoint necessary for new orders events? I can see that order detail is on the data event of *OrderNew* event.**
This isn't necessary. The **Get Order Details** endpoint is the same as a *newOrder* event.

**Can Get Order Details endpoint be used used for cancel and refund to see details?**
Yes. You can check the information for `cancel_time` to see when the order was canceled and `refund_price` to check how much was refunded.

**Is the `order_id` in the order globally unique?**
The `order_id` will not be repeated, it is globally unique.

**What is the difference between the order status 200, 400 and 500?**
200: Order accepted (The store sent confirmation), 400: The rider took the order for delivery, 500: The rider arrived at the customer’s location.

**Is it possible to receive through the API information like "picking up the order at the front door" or "leaving it at the front door" added in C-App?**
We currently only support order notes in the field `remarks`. For it to be used, the store needs to allow this field in B-App.


### Confirming Orders

**Does the Confirm Order endpoint only be called after we accept the order on our POS?**
The **Confirm Order** is the endpoint used to send confirmation of an order from the POS to us.


### Canceling Orders

**When an order is canceled using the Cancel Order endpoint, is there any possibility that the shop closes?**
No. The store is not punished for canceling an order neither the store closing after the cancellation is an expected behavior.

**After an order is accepted, is it possible to cancel it?**
Yes, you can use the **Cancel Order** endpoint for that.

**After an order is canceled, is it possible to accept it again?**
No, after the order is canceled by the shop, the order is completed and the customer has to place a new order to get it accepted.

**How does the user cancellation after the order is cofirmed is sent to the API.**
First the store has to set the configuration for cancellation and we'll send the information when the customer applies to cancel the order. Please read **Store API > Set Store Cancellation/Refund** and **Oder API > Handle Cancellation Requests** for more information.

**What does the base_reason_id means in Refunds?**
When handling refunds sent by _orderRefuseApply_ webhook, you need to pick one of reason ids below if the store refuse to the refund request.

| **Code** | **Description** |
| --- | --- |
| 1010 | Item sold out |
| 1020 | Store closed |
| 1030 | The shop is too busy to prepare a meal |
| 1040 | Unable to prepare a meal due to water or power outages |
| 1050 | Cancellation due to customer |
| 1060 | No rider for delivery |
| 1080 | Other reason |


### Prices

**What does the multiple prices in the order mean?**
Check what each price means in **Order API > Get Order Details** under the section **Response Body Parameters - Price**.

**Do I always have to divide the price values by 100 to get the exact number?**
Yes. Price is always an integer value (never decimals) because the price is set in the lowest denomination. So when treating the information sent, you can always divide by 100.


### Webhooks

**Every event (Orders, Cancellations, Refunds, etc) goes through the same WebHook? There are no special EndPoints for a specific event?**
Yes, every event goes through the same endpoint.


### Common Errors

**What does "Error retrieving the order" means when calling Order APIs?**
This means that the `order_id` is incorrect.

**How to solve order_id / shop_id/ app_id incorrect in *orderNew* and GET Order Details with Node.js?**
We use long (64-bit integer) as IDs for app, orders and stores. So please pay attention when parsing those numbers. For example, in Node.js our `order_id` 5764607801871631353 will be parsed as 5764607801871631000 with lib "body-parser" or "JSON.parse()". Please use json-bigint to parse it: `var jsonBig = require('json-bigint'); jsonBig.parse(data)`.

**What is the meaning of code 12007?**
This means that the confirmation for the order failed.


