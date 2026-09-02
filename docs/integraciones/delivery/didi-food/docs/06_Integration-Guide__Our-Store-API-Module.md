<!-- id=1896 path=Integration Guide > Our Store API Module -->
## Our Store API Module

The **Store API Module** provides features for managing stores. We call a store or shop the establishment that offers dishes/products on DiDi’s platform.

### Store Integration and Authorization Process

![Store integration and authorization process](https://img0.didiglobal.com/static/gstar/img/jIVDJlsFGp1636544967637.png)


### What can be done with the store module

With this module, partners will be able to:

* **Get or update store details:** receive all store information set in our system like IDs, name, images and photos, address, status, open/close settings, avg. time to prepare food, operating dates and times and business category and update some of this information.
* **Set status:** set if the store is online/offline and how the status should switch.
* **Store binding:** offer the possibility bind or unbind stores to your app using an endpoint.
* **Set order confirmation method:** Set or change between the 2 methods we provide for integrated stores to confirm their orders. 
* **Delivery area:** Configure the store delivery areas used in the marketplace business model.
* **Cancellations and refunds:** Set if a store accepts or not cancellation and refunds.

> **IMPORTANT:**
> All new stores shall have passed DiDi's audit process and have the commercial and cooperation agreements in signed status to be able to be integrated.

### APIs and Callbacks

| **Name** | **Type** | **Function** |
| --- | --- | --- |
| `/shop/shop/unbind/` | Endpoint | Unbind a store from an app |
| `/shop/shop/setconfirmmethod/` | Endpoint | Set store's order confirmation method |
| `/shop/shop/detail/` | Endpoint | Get store's details |
| `/shop/shop/update/` | Endpoint | Update store's basic information |
| `/shop/shop/validCategories/` | Endpoint | Get valid categories for stores |
| `/shop/shop/setStatus/` | Endpoint | Change the status of a store |
| `/shop/apply/set/` | Endpoint | Configure if a store accepts cancellations and refunds |
| `/shop/deliveryArea/add/` | Endpoint | Add a delivery area for store's self delivery service |
| `/shop/deliveryArea/update/` | Endpoint | Update a delivery area for store's self delivery service |
| `/shop/deliveryArea/delete/` | Endpoint | Delete one or more delivery areas for a store |
| `/shop/deliveryArea/list/` | Endpoint | Get all delivery areas set to a store |
| `/shop/shop/list/` | Endpoint | List all stores binded to an app |
| `shopStatus` | Callback | Notify when the `biz_status` of a store changes |
| `imageAuditStatus` | Callback | Notify the result of uploading images to a store |
