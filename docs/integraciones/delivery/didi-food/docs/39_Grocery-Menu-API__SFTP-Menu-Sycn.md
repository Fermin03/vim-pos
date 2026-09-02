<!-- id=2069 path=Grocery Menu API > SFTP Menu Sycn -->
## Groceries SFTP Menu/Catalogue Sycn

> **IMPORTANT:** 
> * This function is **only** for Store under the **Grocery** business mode.
> * The categories and subcategories are pre-set by DiDiFood. If you want the categories and subcategories as set by the Brand, please contact DiDiFood.


DiDiFood supports updating a menu/catalogue items, promo and prices through Secure File Transfer Protocol (SFTP). 

### SFTP Host Information

The SFTP host information can be provided by either the Integrator or by DiDiFood upon request.

### Syncronization Times

The menu/catalogue syncronization time must be agreed by the Integrator and DiDiFood and shall  include the following:

| Time | Definition |Example|
|--|--|--|
|Syncronization start time  | The local time that the menu/catalogue syncronization shall start |06:00|
|Syncronization end time  | The local time that the menu/catalogue syncronization shall end |23:00|
|Syncronization frequency  | The frequency in which the syncronization shall be performed and can't be less than 10 minutes each|Every 30 minutes|

### Syncronization File Format

> **IMPORTANT:** 
> * One (1) file per Store
> * The files are automatically eliminated from the host every fifteen (15) days
 - Format: csv
 - File name: preciosdidi_suc_AAAA_YYYYMMDD_S
	 Whereas:

|preciosdidi| _ |suc| _ |AAAA| _ |YYYY|MM|DD| _ |S|
|--|--|--|--|--|--|--|--|--|--|--|
|Fixed|Fixed|Fixed|Fixed|The unique ID of the store in the Integrator's system|Fixed|Year|Month|Date|Fixed|Secuence of the document starting from 1|
|preciosdidi| _ |suc| _ |14| _ |2023|1|12| _ |1|

### Syncronization File Content

> **IMPORTANT:** DiDiFood does **NOT** consider safety inventory, therefore if safety inventory should be considered, then it should be deducted from the actual inventory before creating the csv file.
> - Separation: "|" (Bar) 
> - Content
 
| ** Column** | **1** | **2** | **3** | **4** | **5** | **6** | **7** | **8** |
|--|--|--|--|--|--|--|--|--|
| Content | app_shop_id	 | upc | Sales Price | Price without Discount | Reference Price | Inventory | IVA | IEPS |
| Content definition | The unique ID of the store in the Store's system | The upc (barcode) of the item in the Store's system. Max 14 digits | Item price to be perceived by the consumer by only considering the discounts of the Store. Support until 2 decimals | Price without discount of the item. Support until 2 decimals | Reference price of the item. Support until 2 decimals | Rem. inventory of the items in the Store. Support until 2 decimals. If inventory > 0, an item is available; if inventory is 0, then the item is not available | Not required. Detailed IVA tax configuration for an item. It is a list of tax objects, each with a tax type and rate. must be 0 or 16 (16.00%)| Not required. Detailed IEPS tax configuration for an item. It is a list of tax objects, each with a tax type and rate. must be between 0 and 100 |
| Sample from image (item without discount) | 14 | 9560 | 70 | 70 | 0 | 11 | 16 | 75 |
| Sample from image (item with discount) | 14 | 8167 | 42.2 | 52.2 | 52.2 | 18 | 0 | 100 |