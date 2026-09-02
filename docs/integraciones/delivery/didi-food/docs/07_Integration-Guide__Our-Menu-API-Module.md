<!-- id=1898 path=Integration Guide > Our Menu API Module -->
## Our Menu API Module

Our **Menu API Module** gives our partners a way to synchronize and manage the menu in our platform. For that, it is essential to understand the menu definition and how to use it, so that the DiDi Food platform's menu can be mapped easily to the partner's system.

The main benefits of this API is to **decrease the time** to upload and change the menu that, otherwise, has to be handled manually in our B-App.

### What can be done with menu module

With this module, partners will be able to:

* **Get or update menu details:** Get all the items of the store or create a menu with categories and items async.
* **Update items details:** Update a single item of the menu and its availability.
* **Update modifier groups:** Update the modifier groups and the items in it.

### Sample of the menu model

![Sample of the menu model](https://pt-starimg.didistatic.com/static/starimg/img/Gl70l6H7hR1648641037642.jpeg)

### APIs and Callbacks

| **Name**                                   | **Type** | **Function**                                                                   |
|--------------------------------------------|----------|--------------------------------------------------------------------------------|
| `/item/item/list/`                         | Endpoint | Get a store's menu                                                             |
| `/item/item/upload/`                       | Endpoint | Upload an entire menu to a store                                               |
| `/item/item/getMenuTaskInfo/`              | Endpoint | Get a detailed error info for the uploading menu task                          |
| `/item/item/updateItem/`                   | Endpoint | Update a single item's information                                             |
| `/item/item/updateItemStatus/`             | Endpoint | Update the availability of an item                                             |
| `/item/item/updateModifierGroup/`          | Endpoint | Update a modifier group and its items                                          |
| `/image/image/uploadImage/`                | Endpoint | Upload image to our storage service                                            |
| `/image/image/getImageUploadInfoPageList/` | Endpoint | Get the image urls on our storage services                                     |
| `uploadMenuTaskStatus`                     | Callback | Notify when the status of a upload menu task changes with detailed information |
| `imageAuditStatus`                         | Callback | Notify the result of uploading menu images                                     |
