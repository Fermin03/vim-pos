<!-- id=1988 path=Tools Introduction > Store Management -->
## Store Management

In the section [Store Management](https://developer.didi-food.com/en-US/app/store/statistical) we provide you with a tool to batch bind stores to your app and another to batch manage stores already integrated to your app. Developers can give access to the app to the operations team use these tools and speed up the binding and configuration of the stores process. Check more about it in **Tools Introduction > Permissions Management**.

### Store Binding

With this tool, you can generate an URL so store administrators can authorize the binding of more than one store at once. After the authorization is done, you need to finish the binding process. This is the best method if you are working with a restaurant chain or restaurants with more than one store. 

> **NOTE:**
> You might want to check the **Autorization API > Get Authorization Web Page** and **Store API > Bind/Unbind Store** endpoints documentation too if you want to bind one store at a time.

Check below the step by step to generate the link and complete the binding:

![Limitations: B-App Versions Vs. Integration](http://img0.didiglobal.com/static/soda_public/do1_RtyM8zyIDtMuFPKAkz6b)

> **NOTE:**
> After completing the binding, is important to check it's status (**Store API > Set Store Status**) and it's order confirmation method (**Store API > Set Store Order Confirmation Method**). You can do these 2 configurations using our [Batch Store Management tool](https://developer.didi-food.com/en-US/app/store/batch) too.

#### Resources

You can send these tutorials for the store to follow the steps and complete the authorization. The guides are available in [Spanish](https://img0.didiglobal.com/static/starfile/node20211005/895f1e95e30aba5dd56d6f2ccf768b57/Q2raopbqvv1633365375987.zip) and [Portuguese](https://img0.didiglobal.com/static/starfile/node20211005/895f1e95e30aba5dd56d6f2ccf768b57/0EohTTjMEA1633365375708.zip).


### Batch Store Management

With the [Batch Store Management](https://developer.didi-food.com/en-US/app/store/batch) tool, you and your team will be able to change some basic configurations of the integrated stores without having to do it using the endpoints. Here are all the configurations that can be set/change with the tool:

**Operating Status:**
**Open** and **Close** the store to the consumer.

**Order Acceptance:**
Change how stores accept their orders: using **B-App** or **OpenAPI**. We suggest that the store be integrated first to the B-App method and after 2 days of the operation through the integration working, the method be changed to OpenAPI.

**Auto Online/Offline Method:**
These configurations only affect stores with the **OpenAPI order acceptance method**. With it, you can choose between the **auto-close store** (the store will close automatically using the time set to the store's configuration and has to be manually open) or **auto-open/close store** (if the open and closing will be done on the times set to the store). We suggest the latter for integrated stores.

> **NOTE:**
> You may want to check the following endpoints too: **Store API > Set Store Status** and **Store API > Set Store Order Confirmation Method**.

#### Resources

If you have members on your team that need to do these configurations without using the integration, you can send the following guides after giving access to them to the app. The files are available in [Spanish](https://img0.didiglobal.com/static/starfile/node20211006/895f1e95e30aba5dd56d6f2ccf768b57/hsZlxVdd8P1633454837687.zip) and [Portuguese](https://img0.didiglobal.com/static/starfile/node20211005/895f1e95e30aba5dd56d6f2ccf768b57/TQaxEpW60g1633444119209.zip).
