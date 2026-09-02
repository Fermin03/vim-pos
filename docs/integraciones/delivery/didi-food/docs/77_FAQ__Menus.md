<!-- id=2024 path=FAQ > Menus -->
## Menus

### Terminology and Meanings

**Is  app_item_id a unique id for you or is our SKU?**
The `app_item_id` is the ID for the item, provided by the restaurant or POS. Items have a unique id in DiDi and this field is used to enter the id in POS so both be mapped.

### Uploading Menus

**How long does it take for the new menu uploaded by the API be displayed in the app?**
It takes about 1 or 2 minutes.

**Can we add dish sizes as modifiers?**
Yes, we support modifier groups. You can check all the information about this in the documentation **Menu API > Upload Store Menu Details** under the section **Response Body Parameters - Content_with_sub_item**.

**How to set the selling time of dishes?**
You can use the `sold_info_intl` interface. Read **Menu API > Upload Store Menu Details** under **Request Body Parameters - Sold_info_intl** for all of the details.

**What are the character length limits for dishes, description, etc.?**
The limits are: `menu_name`: 50 characters; `category_name`: 100 characters; `item_name`: 50 characters; `short_desc`: 300 characters; `content_name`: 50 characters and `sub_item_name`: 50 characters.

**How to map dishes if the menu in POS has a different structure than DiDi's?**
Sometimes a dish in the merchant's POS system is distinguished by size or other attributes. In these cases, when uploading a dish to DiDiFood, it is necessary to map a dish to multiple dishes according to the size.

**Can we send the whole menu always without troubles even if it just has one or two changes?**
Yes, you can use the **Upload Store Menu Details** endpoint to upload an entire menu even with few changes or you can use the **Update One Item** endpoint to change only those specif items. 


### Sub-items

**Does the option that the consumer can choose the same item for multiple times only available in the app?**
No, you can use the field `buy_mode` in **Upload Store Menu Details** or **Update One Item** endpoints. With it, you can use the params 0: If the item can only be chosen one time or 1: If the customer can pick the same item multiple times.

**If only one specification of the item is unavailble, is the item on or off shelf?**
The shelf status is based on the product item dimension, so if one specification is  unavailble, the entire product is removed from the shelf.






