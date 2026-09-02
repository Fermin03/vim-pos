<!-- id=2052 path=Integration Guide > Our Stock API Module -->
## Our Stock API Module

Our **Stock API Module** gives our partners a way to synchronize and manage the item stock in our platform.
> **ATTENTION:**
> This is function is ***only available for Grocery Stores*** (such as conveniance stores, supermarket, etc) and **NOT** available for restaurants. If you are using this StockAPI, please communicate with

The **Stock API** endpoint gives you the ability to update the stock available for a certain item in a certain store. By using this function, DiDiFood will set the maximum purchase quantity within the available stock of a certain item in the store, **reducing the amount of order cancellations from the store due to unavailable stock** and **decrease the time** to upload and change the stock that, otherwise, has to be handled manually in our B-App.

### What can be done with stock module

With this module, partners will be able to:

* Get and update the stock of all the items of a certain store that meets with our Grocery criteria.
* Display SOLD OUT labels on items to avoid selling items that are already out of stock.

### Stock Synchronization Process

![](https://img-hxy021.didistatic.com/static/starimg/img/bDihXqsiC21663139846937.png)

### APIs and Callbacks

| **Name**                                   | **Type** | **Function**                    |
|--------------------------------------------|----------|---------------------------------|
| `/v1/item/item/setStock`                   | Endpoint | Update a store's item stock     |