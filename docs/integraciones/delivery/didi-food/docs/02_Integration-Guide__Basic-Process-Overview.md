<!-- id=1890 path=Integration Guide > Basic Process Overview -->
## Basic Process Overview

> **IMPORTANT:**
> All information contained in this website, including links that are sharing any further documents are shared with you in strict confidential and is only for the daily integration and operation with our platform. All content herein is in continous improvement, therefore is subject to changes without any prior notification. Some content are restricted to people who can have access to our platform. Those credentials can't be shared to anyone.


The basic process to integrate to **DiDiFood** is shown as follows:

![Basic process to integrate](https://pt-starimg.didistatic.com/static/starimg/img/OzhNF2Jpmv1639644696614.png)

### Phase 1: Pre-Process and Partner's Account Creation

#### Step 1: First Contact and Business Negotiation

The first step to become a DiDi’s partner is to **get in touch with our team and do the business negotiation**. During this step, we want to understand better your business and requirements, so we'll check if you are a store partner or a POS, how many stores you have in operation and how many stores you are able to integrate to our platform, numbers of orders per day and your process to complete the integration. 

For more details and guidance to start the process, you can contact :

 - DiDi's BDM (Business Development Manager) or
 - KAM (Key Account Manager) or
 - API integration team 

#### Step 2: Signing of NDA

Before sharing all our API's information we need to **sign a NDA**. For that, we'll ask further information with regards your company and send the NDA through DocuSign, or any other electronic means, for you to sign.  This NDA must be signed by the owner or the company or by a person that has the POA (Power of Attorney) to enter into such agreements on behalf of the company.

#### Step 3: Register and Create the Partner's Account

After that all pertinent parts have signed the NDA, you are able to register in our portal and to obtain further benefits of this tool, you will need to submit information with regards to your company by filling the information required. After submitting this, your request will go through an audit process. Learn how to complete this step on **Tools Introduction > Qualifications Management** menu.

### Phase 2: Development in Test Enviroment and Testing

#### Steps 1 and 2: Create Testing Application and Create Testing Store

After having your qualification process approved, you will be able to **create applications and test stores** to start the development process by yourself. Learn how to create them in **Tools Introduction > Application Management**.

#### Step 3: Developing and QA phase

Now it’s time to **develop your integration and do some testing**! All information necessary to integrate using our API can be found in **this portal**. After reading the document carefully, we can set up a kickoff meeting with one of our specialists to explain some details of the documentation and testing process. Talk to your KAM, BDM or API Integration Specialist you are in contact with for that.

We can also create a WhatsApp group for quick communication. This group shall consist of technical, product and commercial (main contact) people from both sides as well as the team leaders for integration status update.

Check on the flowchart above some important check points when doing the QA. To test the stores, we have some important tools:

- **YAML file**: We provide you with a yaml file with our most recent OpenAPI Specification that you can use in apps like Swagger or Postman to test our API. Read more in **Testing and Debugging > API Reference**.
- **Sandbox Enviroment:** We have a sandbox enviroment where you can test order callbacks and the menu items (this is to check whether the menu items are correctly injected into your system). Read more in **Tools Introduction > Sandbox Enviroment**.
- **User's Test Credentials**: We can create a client's test account so you can simulate creating orders in the client's app to your test all the integrated endpoints and webhook callbacks. Learn how to do testing in  **Testing and Debugging > Testing the Integration**.

It is important to also read the section **Testing and Debugging > Error Handling and Solving Issues** to understand how to proceed in different situations.

> **ATTENTION:**
> We use long (64-bit integer) as IDs for app, orders and stores. So please pay attention when parsing those numbers. For example, in Node.js our `order_id` 5764607801871631353 will be parsed as 5764607801871631000 with lib "body-parser" or "JSON.parse()". Please use json-bigint to parse it: `var jsonBig = require('json-bigint'); jsonBig.parse(data)`.


### Phase 3: Pilot Phase

#### Step 1: Create Production Application

After completing all development and QA and confirming all steps stated in **Integration Guide > Before Going Live** were satisfied, you are able to **Create the Production Application** where real stores will be added, to operate using your integration. You can create the production app following the guidance in **Tools Introduction > Application Management**.

#### Step 2: Add Pilot Store to Application

We recommend **running a pilot phase** with one or two stores first to check all stages of the order in the production/live environment.

#### Steps 3 and 4: Monitor Performance and Operation and Check for Errors, Correct and Re-test

After that the pilot stores are set, it is time to monitor whether their operations are stable, check for errors, correct them and re-test. Some important resources for these steps can be seen in **Tools Introduction > Order Monitoring** and **Tools Introduction > API Monitoring**.

### Phase 4: Expansion and Monitoring

#### Step 1: Add New Stores to the Application

After confirming everything is working and the system is stable, is time to add more stores to your application. For this process, we have some options:

> **NOTE:**
> Each store can only be bound to one production app.

**1. Self-service mode (Recommended)**:
You can add new stores by yourself, using two different processes:

1. **Add new stores one by one:** To do so, you can send a request to a store, asking them to bind to your application (learn how to use this feature in **Authorization API > Get Authorization Web Page**), or you can use our binding endpoint (**Store API > Bind/Unbind Store**).
2. **Batch add stores:** You can add stores in batches using our application tool. Learn more in **Tools Introduction > Store Management**.

**2. DiDi's assisted mode**:
You can also ask our team to add a store to your application. To do so, send an e-mail to the API Specialist you are in contact with, telling that you want to bind (or unbind) a store, adding the `country` of your application, the `app_id` and the `shop_id` with the corresponding `app_shop_id` of each store. Our Integration Ops Team will integrate the store(s) and let you know when the task is done.

#### Step 2: Monitor the Application

We provide multiple types of statistical data such as applications, stores, orders and interfaces, that our partners can check. At the same time, online faults can be found through data monitoring.

For stores that have been bound, partners can change the store's order acceptance method, how the stores get online and offline, and unbind them through the **Open Platform Application Management**. You’ll learn more in the **Tools Introduction** section.

> **IMPORTANT:**
> Keep in mind that we are always improving and creating new features that can require further development. We publicize new features to all e-mails register in the applications. You can add new e-mails to your app edinting it. Learn how to do it in **Tools Introduction > Application Management**.