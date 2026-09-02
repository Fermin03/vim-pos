<!-- id=2058 path=Integration Guide > Our Grocery Menu API Module -->
## Our Grocery Menu API Module
* **Object**: to automatically update categories and items, which will save time between Circle K and Didi in order to confirm which items need to be updated 
* **What to do**:DiDi provides a new Menu API interface especially for Grocery, and Circle K need to insert and provides the fields needed
* **The reason why we give up the current API from Food business:**
That API interface lack of some important fields, such as item stock and the level2 category. Besides, it has many fields which are no need for grocery business, for example modifier_group or id_sold_separately 
### Sample of the menu model
> **ATTENTION:**
> Subcategories and items which are directly bound to the parent-category cannot exist at the same time. In other words, items cannot be directly bound to a category when the category has its subcategory.

![Sample of the menu model](https://img-hxy021.didistatic.com/static/starimg/img/vAZFbj8I8w1663681520044.png)
### Difference from takeout menu
![](https://img-hxy021.didistatic.com/static/starimg/img/hU6Rdi2eQW1663680259611.png)
### Multi level Categories example
![](https://img-hxy021.didistatic.com/static/starimg/img/zpROb75dCG1663676525258.png)

### APIs and Callbacks
| **Name**                                   | **Type** | **Function**                                                                   |
|--------------------------------------------|----------|--------------------------------------------------------------------------------|
| `/v3/item/item/uploadGrocery`              | Endpoint | Upload  Grocery Menu                                    |
| `/v3/item/item/getGroceryMenuTaskInfo`     | Endpoint | Get a detailed error info for the uploading Grocery task   |
| `uploadGroceryMenuTaskStatus`              | Callback | Notify when the status of a upload menu task changes with detailed information  |