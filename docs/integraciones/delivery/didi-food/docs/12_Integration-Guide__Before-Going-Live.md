<!-- id=1904 path=Integration Guide > Before Going Live -->
## Before Going Live

### Pre-Production Checkings

Before moving to a production app, we suggest the following checking to see if all mandatory functions have been integrated and are working properly:


| **Main Function** | **Sub-Function** | **Mandatory/Optional** |
| --- | --- |--- |
| Token | Get Authtoken | Mandatory| 
| Token | Refresh Authtoken | Mandatory | 
| Order | Order Injection (orderNew webhook)	 | Mandatory|
| Order | Order Cancel |Optional but highly recommended |
| Order | Cash Process (shop_paid_money in orders' structure) | Mandatory if the integrated stores accept cash payment|
| Order | Store Self-Delivery | Mandatory|
| Order | DiDi Delivery | Mandatory|
| Order | Promotions Support |Mandatory |
| Order | Logic to read prices | Mandatory|
| Webhooks | Response to all webhooks | Mandatory|