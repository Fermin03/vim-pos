<!-- id=1912 path=Authorization API > Get Authorization Web Page -->
## Get Authorization Web Page

`POST`  [https://openapi.didi-food.com/v1/auth/authorizationpage/getUrl](https://openapi.didi-food.com/v1/auth/authorizationpage/getUrl)

The **Get Authorization Web Page** endpoint provides the developer the ability to get DiDi's bind store self-service web page. This is useful specially to POS partners to bind/unbind the stores without having to contact DiDi's team and send the store agreement contract.

This endpoint will return an URL you can send so store managers can authorize the binding or unbinding of a store to your app. After binding a store is important to check it's status (**Store API > Set Store Status**) and it's order confirmation method (**Store API > Set Store Order Confirmation Method**). You can do these 2 configurations using our store management tool too (**Tools Introduction > Store Management**).

> **NOTE:**
> You can send this URL to a store that is bound to another partner. If so, when the store manager logs in, they will receive the disclaimer that they will disconect from the old app to bind to yours. If they agree, the binding process is completed.

### Self-Service Binding and Unbinding Process

Follow these steps to use the self-service model to bind/unbind new stores to your app:

1.Call the **Get Authorization Web Page** endpoint and retrieve the URL as specified below.

2.Send this URL to the store. Only users with manager or superadmin permissions for that store in DiDi’s system will be able to follow the steps below.

3.After the store manager/superadmin login in the URL, they will see all the stores they have access to DiDi’s system (as shown in the image below) and choose one to bind to the same store in your system by clicking in **Authorize**. It is important to guide the store manager that if they choose the wrong store, the mapping in DiDi and POS systems will not be done correctly.

4.After binding, you can call any other API to configure the store, menus and orders and receive orders of the store.

**To unbind**, follow the first 3 steps. On the page, the store manager/superadmin will choose to **Deauthorize** the app integration.

![Store binding self-service web page](https://img0.didiglobal.com/static/gstar/img/hlJLcgS9wI1611233020117.png)

> **NOTE:**
> You might want to check the **Store API > Bind/Unbind Store** endpoint documentation too. For binding stores in batches, check the steps in **Tools Introduction > Store Management**.

### Resources

You can send these tutorials for the store to follow the steps and authorize the binding. The guides are available in [Spanish](https://img0.didiglobal.com/static/starfile/node20211001/895f1e95e30aba5dd56d6f2ccf768b57/GjuZcuMihj1633020386458.zip) and [Portuguese](https://img0.didiglobal.com/static/starfile/node20211001/895f1e95e30aba5dd56d6f2ccf768b57/CGuu5BGyL01633020386097.zip).

### Request Parameters

| **Field Name** | **Field Type** | **Description** | **Mandatory** | **Sample** |
| --- | --- | --- | --- | --- |
| `app_id` | long | The ID of an app in **our** system. | Yes | 3458764610605350993 |
| `app_shop_id` | string | The ID of a shop in **your** system. | Yes | "1234" |


### Response Example

```json
{
    "errno":0,
    "errmsg":"OK",
    "traceId":"22c1eb112fa67130",
    "data":{
        "url":"https://didi-food.com/en-US/store/ui-sdk/authorization?appId=5764607636157235207&appShopId=aaa"
    }
}
```