<!-- id=1974 path=Testing and Debugging > Error Handling and Solving Issues -->
## Error Handling and Solving Issues

### Solving connectivity issues

If the store is not open for the customers in C-App, there are some variables to be taken into account before open a ticket with DiDi. Please go trough the flow below and check all possibilities:

![Solving connectivity issues flowchart](https://pt-starimg.didistatic.com/static/starimg/img/u8lI9g26O01639032863008.png)


### Store not receiving orders through API

First check the order acceptance method set to the store:

| **B-App** | **OpenAPI** | 
| --- | --- | 
| Ask the store to wait a moment (no more than 1 minute) before pressing to accept the order in B-App. If this solves the issue is because the system is going through a temporary delay and if the order is accepted in the app before send through integration, ot won't be injected. | Ask for the store to logout and re-login on B-App. If this solves the issue, the problem was being caused by cache. | 

If you follow those steps and the order still isn't being send to the integration, open a ticket to solve the issue.

### Error message: The store failed inspection, so it cannot go online

We have some items that needs to be configurated (either through API or using B-App) before a store goes online as listed below. You'll receive with the error message, which of them are still missing from the store:
- Have at least one item in the menu available  
- Have a contact number set to the store  
- Have set the opening/closing times  
- Have configured the delivery information  
- Have an image for the store  
- Have selected the main category  
- Have set the average produce time  

### Error message: Internal System Error

The **Internal System Error** message indicates that there's a syntax error in your request json. So please go back to the data and the documentation to find the error. If you don't find after that, open a ticket so one of our specilists can help.

