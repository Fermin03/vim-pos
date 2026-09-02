<!-- id=2016 path=FAQ > Authorization and Testing -->
## Authorization and Testing

### Terminology and Meanings

**What is the callback address?**
When the application initiates a request, the passed callback address parameter will jump to the callback address after user authorization and the application obtains the code through the callback address.

**What is app_shop_id?**
The `app_shop_id` is the ID of the store in the POS system, which is used for mapping with `shopID`. Check other terms in our **Glossary**.


### Authtoken

**What is the validity period of the token and the refresh limit?**
The validity period is 30 days. Interface call limit once every 30 seconds.

**If there are multiple stores under the application, do you use the same token or one token for each store?**
Each authorized store corresponds to one token and each store needs to obtain their token.

**What happens if GET Token is used every single time?**
The **GET authtoken** is a read-only interface and will not generate a new token. There will be no side effects using **GET authtoken** when the token has not expired. After the token expires, accessing the  **GET authtoken** interface will result in the error 10102, indicating that the token has expired.


### Testing

**What is the frequency limit for placing test orders?**
5 times in 60 seconds.

**How to place an order for testing, do we need a customer's test account? Which terminals can be used for testing?**
Currently, orders must be placed using a customer's test account into the B-App. Read more about this process in **Testing and Debugging > Testing the Integration**.

**How to refund after placing a test order?**
Use a cash payment method to do test orders, this way you can cancel the order and don't need to pay for it. Following this process, there's no need for refunds.

**How to apply for a test shop?**
You can create your own test store. For that, you need to pass the qualification process (read in **Tools Introduction > Qualifications Management**) and then create your test app (more in **Tools Introduction > Application Management**).

**How do I find test stores of my own brand?**
You need to enter the accurate store address in the client app. Check the addresses available for each country in **Testing and Debugging > Testing the Integration**

**How to test delivery?**
Sorry, the current delivery does not support testing and the sandbox environment use self-delivery by default. Delivery can be tested in the pilot phase.




