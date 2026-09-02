<!-- id=1900 path=Integration Guide > Our Orders API Module -->
## Our Orders API Module

This is the API that handles all the orders. To avoid any omission, it is suggested to integrate all the order status.

### What can be done with orders module

- **Receive orders information:** Receive the order status pushed by DiDi’s webhooks with the information of new orders and canceled orders. All order information will be synchronized in real time.
- **Send confirmation**: Send a confirmation that the store accepted and is preparing the order.
- **Send cancellation:** If the store has any problem completing the order, it’s possible to send the cancellation through API.
- **Manage cancellation and refunds:** Set how to respond to our webhooks when an order cancellation is placed by the customer.

### DiDi’s and POS responsibilities in the order processing

The below process chart shows each role's task during an order process in case of confirmation or cancellation:

![Order processing: order rejection](https://pt-starimg.didistatic.com/static/starimg/img/Nb0zs84GHP1648641431035.png)
![Order processing: complete self delivery](https://pt-starimg.didistatic.com/static/starimg/img/hItbWQHaOK1648641446712.png)
![Order processing: complete didi delivery](https://pt-starimg.didistatic.com/static/starimg/img/dJQEilnnRE1648641462062.png)
![Order processing: order cancellation](https://pt-starimg.didistatic.com/static/starimg/img/xbCKGqer6j1648641253628.png)
![Order processing: orderPartial Cancel](https://s3-us01.didiglobal.com/silver-bullet-img/2023-03-29/OZAwff/image2023-2-23_17-49-28.png)

### APIs and Callbacks

| **Name**                  | **Type** | **Function**                                                       |
|---------------------------|----------|--------------------------------------------------------------------|
| `/order/order/detail/`    | Endpoint | Get a single order complete information                            |
| `/order/order/confirm/`   | Endpoint | API to confirm an order                                            |
| `/order/order/cancel/`    | Endpoint | API to cancel an order                                             |
| `/order/apply/cancel/`    | Endpoint | API to agree or refuse a cancellation request done by the customer |
| `/order/apply/refund/`    | Endpoint | API to agree or refuse a refund request done by the customer       |
| `/order/order/ready/`     | Endpoint | API to indicate the meal is prepared                               |
| `/order/order/delivered/` | Endpoint | API to indicate the delivery has been completed                    |
| `orderNew`                | Callback | Notify a new order                                                 |
| `orderCancel`             | Callback | Notify when the order has been canceled                            |
| `orderFinish`             | Callback | Notify when the order is completed                                 |
| `deliveryStatus`          | Callback | Notify when delivery status of an order has changed                |
| `orderCancelApply`        | Callback | Notify to approve a customer's order cancellation                  |
| `orderRefundApply`        | Callback | Notify to approve an order refund                                  |
| `orderPartialCancel`      | Callback | Notify when the order is partial canceled                                 |
