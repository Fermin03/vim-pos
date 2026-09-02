<!-- fuente: https://developer.uber.com/docs/eats/guides/menu-integration -->
## Menu Integration

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

##### Overview

Create, update and retrieve menus using the Menu API endpoints. Every store location on the Uber Eats marketplace has its own individually-configurable menu and store hours. It’s constructed from four main entity types:

-   `Item`  
    Represents everything that a user might tangibly select from a marketplace (e.g. an appetizer; a can of soda; a dessert; a pizza topping; a condiment).
-   `Modifier Group`  
    Groups items together to be selected as a customization under a parent item (e.g. “Pizza Toppings” modifier group might have “Mushroom” and “Peppers” items as options within it). Different modifier groups can optionally leverage the same items.
-   `Category`  
    Groups one or more top-level item(s) together into a logical menu section (e.g. “Appetizers”; “Main Courses”; “Soft Drinks”).
-   `Menu`  
    Groups one or more categor(ies) together into a single view with corresponding menu hours (e.g. “Brunch Menu”, “Late Night Menu”). A store can have individual menus for different fulfillment types (delivery, pick-up), or the same menu can be utilized by all.

Store hours are calculated as the union of `service_availability` across all menus. For example, a store that has both a breakfast menu from 9am to 1pm and lunch menu from 12pm to 3pm, will have store hours of 9am to 3pm.

##### Components

-   **Retrieve Menu**  
    Retrieve a store’s menu via the [`GET /menus`](/docs/eats/references/api/v2/get-eats-stores-storeid-menus) endpoint.
-   **Upload Menu**  
    Push new menus to a store using [`PUT /menus`](/docs/eats/references/api/v2/put-eats-stores-storeid-menus). A call to this endpoint overwrites any existing menus.
-   **Update Item**  
    Developers can make updates to individual items on a store menu via the [`POST /menus/items`](/docs/eats/references/api/v2/post-eats-stores-storeid-menus-items-itemid) endpoint. Use this to endpoint to mark items as out-of-stock/back-in-stock or to update item pricing. Note that this endpoint can only be used when the original menu was uploaded via the API, even if an item ID was configured elsewhere and provided here.

##### Constructing Menus

Use your Uber Eats test store to create and update your menu details via the Menu API in your test environment. You can use the Uber Eats Postman Collection (provided in the Resources section) to help you with testing. If you need additional test stores created and whitelisted for your account, please submit a technical support request and our team members will assist you.

##### Menu Setup

To help with your menu setup, [sample menu payloads](/docs/eats/references/api/v2/example-menu-payloads) are provided within the Menu API reference section. We can also copy the menus of your Merchants’ live stores that are on Uber Eats currently to your test stores. Please submit a tech support request with the name and address of the store that you would like to copy the menu from.

##### Testing the API

To make a request to any of the Eats Menu API endpoints, you will need to [authenticate](authentication) using an app access-token generated with at least the `eats.store` _Client Credentials_ scope. You can find code samples and responses for each of the endpoints in our API reference pages.

Once you have created your menus for your stores, you can use your test account to log in to Uber Eats where only you as the developer will be able to see your test store and its associated menu items. Updates to menus are reflected immediately, though you will need to refresh your browser or app if uploading a new menu while viewing. Images are the only components of menus that may take up to a few hours to be processed.

##### Avoiding Manual Updates

To prevent data sync issues, partners who manage their store menus via the API should not also make updates via Menu Maker. When going live in a production environment, work with your internal contacts and Uber Eats partner manager to ensure menu integrated stores are excluded from manual menu update processes. In case you encounter issues caused by a manual menu update, overwrite the menu by uploading a new menu via the API. If the issue persists, submit a technical support request for help.

##### FAQ

**What specifications do menu item images need to adhere to for successful processing?**

-   File size < 25MB
-   JPG, WEBP or PNG format
-   320px ≤ Width ≤ 6000px
-   320px ≤ Height ≤ 6000px

**Can I add alcoholic items to my menu?**

Check with your Uber Eats partner manger to see if your stores are in alcohol-enabled markets. If you are wanting to offer alcoholic menu items in enabled markets, you **must** populate `dish_info.classifications`’s `can_serve_alone` and `alcoholic_items` fields for all menu items.

**Can I define specific availability hours for categories, items, or modifiers?**

Availability hours can be set at the item level by using the `visibility_info` fields defined in our menu reference. However, these rules only apply when an item is used as a parent item and not when an item is used as a modifier option. Modifiers inherit the visibility data of the parent item. While availability hours cannot be defined at the category level, you can define the same `visibility_info` for all items within a category.

**Tips for improving the support experience for customers?**

We ask that all merchants start populating the `core_price` and `bundled_items` fields when configuring their menus. These fields allow you to provide a signal to Uber Eats on how to best support a customers when problems arise with their orders. The `core_price` field represents the intrinsic value of a modifier option (note that this field is ignored when set at the parent item level). This value can be equal or greater than the price of the the modifier option. The `bundled_items` helps you specify items that are always included as part of a combo, but not shown to or customizable by customers (i.e. fries as part of a burger combo). When set, the `bundled_items` are shown to customers when they are requesting support/refund (the initial purchase experience remains unchanged). You can reuse existing items when specify the `bundled_items` (e.g. reuse the fries items you already sell on the menu).

##### Next steps

Once your menu is fully set up, see the [Order Integration guide](order-integration) for steps to test your webhook URL, programmatically retrieve order details and accept/deny orders.

[

Overview

](#overview)[

Components

](#components)[

Constructing Menus

](#constructing-menus)[

Menu Setup

](#menu-setup)[

Testing the API

](#testing-the-api)[

Avoiding Manual Updates

](#avoiding-manual-updates)[

FAQ

](#faq)[

Next steps

](#next-steps)
