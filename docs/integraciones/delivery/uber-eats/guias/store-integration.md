<!-- fuente: https://developer.uber.com/docs/eats/guides/store-integration -->
## Store Integration

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

##### Overview

The Store API provides developers with the ability to manage stores and retrieve store information. Use the store endpoints to enable/disable POS integration and set date-specific store override hours.

##### Components

-   **Retrieve Store Data**  
    Developers can retrieve store information such as store address and name on an individual location basis via [`GET /store/{store_id}`](/docs/eats/references/api/store_suite#tag/getStoreDetails).
-   **Retrieve Stores**  
    To see all stores provisioned to your developer account, use the [`GET /stores`](/docs/eats/references/api/store_suite#tag/getStores) endpoint.
-   **Set & Retrieve Restaurant Status**  
    Developers can set stores as online or offline (‘paused’) via the [`POST /status`](/docs/eats/references/api/store_suite#tag/SetStoreStatus/operation/Update%20Store%20Status) endpoint. When set to online, stores will be searchable and available to customers on the Uber Eats platform during store hours. When set to offline, stores will show as “currently unavailable”.
-   **Set & Retrieve Date-Specific Hours**  
    Set and retrieve holiday hours via the [`POST /holiday_hours`](/docs/eats/references/api/v1/post-eats-stores-storeid-holidayhours) and [`GET /holiday_hours`](/docs/eats/references/api/v1/get-eats-stores-storeid-holidayhours) endpoints.

##### Syncing Store Availability

Support of the [`POST /status`](/docs/eats/references/api/store_suite#tag/SetStoreStatus/operation/Update%20Store%20Status) endpoint is strongly recommended. To ensure a great Eater experience, stores should be set offline using this endpoint when they are unable to fulfill orders during store hours (e.g. while experiencing connectivity issues or undergoing maintenance).

##### Setting Holiday Hours

Regular store hours are determined by menu hours set through the Menu API. However, date-specific exceptions to the normal operating hours of a restaurant should be set through the Holiday Hours endpoint. Holiday hours override store hours on the specified date(s) and can be set far in advance.

##### Testing with Uber Eats Orders

In an incognito Chrome browser, navigate to [Uber Eats Orders](https://restaurant-dashboard.uber.com). Log in as a store using your test store credentials.

Call the [`POST /status`](/docs/eats/references/api/store_suite#tag/SetStoreStatus/operation/Update%20Store%20Status) endpoint to pause the store (set it offline). Refresh the Uber Eats Orders page. You should see the display message change to “New orders paused”. Now click on the top button with the three lines (“Menu” on hover) in the left-hand navigation bar. Click “Resume new orders” on the bottom of the sidebar and click “Confirm” in the following prompt. Now use [`GET /status`](/docs/eats/references/api/store_suite#tag/GetStores/paths/~1v1~1delivery~1stores/get) to retrieve the store’s status. The status should now read as “ONLINE”.

You can also use Uber Eats Orders to test holiday hours. Set holiday hours via the [`POST /holiday_hours`](/docs/eats/references/api/v1/post-eats-stores-storeid-holidayhours) endpoint. Refresh your Uber Eats Orders window. Click again on “Menu” in the left-hand navigation bar. In the Menu sidebar, click “Hours” and then “Holiday Hours”. You should see your newly-set holiday hours reflected.

##### Next Steps

See the [Menu Integration guide](menu-integration) for steps to construct your menu.

[

Overview

](#overview)[

Components

](#components)[

Syncing Store Availability

](#syncing-store-availability)[

Setting Holiday Hours

](#setting-holiday-hours)[

Testing with Uber Eats Orders

](#testing-with-uber-eats-orders)[

Next Steps

](#next-steps)
