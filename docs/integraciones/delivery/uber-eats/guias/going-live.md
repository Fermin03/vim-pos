<!-- fuente: https://developer.uber.com/docs/eats/guides/going-live -->
## Going Live

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

##### Go Live Overview

Now that your development and internal testing have been completed, it’s time to prepare to go live with stores in a production environment. The high level steps are:

1.  Verify your integration with Uber
2.  Set up your production developer application(s)
3.  Provision and launch pilot store(s)
4.  Continue provisioning and launching stores

##### Verifying Your Integration with Uber

Once you have completed development and internal testing, submit a tech support request to schedule integration verification with Uber Eats. We will jointly run through full end-to-end testing to ensure everything has been configured correctly. Once we confirm, you will be able to create a production account which is the account your stores will launch with. The steps for creating a production account are listed below.

##### Setting Up a Production Application

Navigate to [Developer Dashboard](/dashboard) and create a new production app for your production environment by logging in with a separate **production** Uber account. You should **not** be using any test accounts generated for you by Uber Eats. If needed, you can create a new Uber account at [uber.com](https://uber.com) by clicking on “Sign Up to Ride”.

Once your production application is created, submit a tech support request with your new app’s client\_id to request to whitelist the appropriate Eats API scopes to your production app. Uber will provide confirmation once this has been completed.

After confirmation log back in to [Developer Dashboard](/dashboard) to enable the scopes (remember they must be checked and saved) and set up your webhook URL for your production application. Note that if your integration is supporting brands/partners/stores that are using different webhook URLs, you will need to set up a new production developer account and app to support each unique URL.

##### Launching a Pilot Store

**Before Launch Day**

-   Identify the first store to launch along with a launch date. Please communicate these details to your Uber Eats partner manager at least one week prior to launch.
    
-   Ensure you’re using your **production** application for launching new stores. Double check that the webhook URL is correct and all required scopes have been successfully enabled for your production application.
    
-   Communicate operational changes to the store before launching (eg. no longer need to transcribe orders from tablet into POS and can’t adjust menus in Uber Eats Orders).
    
-   Provision the pilot store to your production developer user. Once the store has been associated to your new production account, you will be able to push a menu through the API. Depending on the store’s needs, you may choose to upload a menu programmatically before or on launch day.
    

**On Launch Day**

-   Upload a menu via the `PUT Upload Menu` endpoint (if not already done).
    
-   Enable order integration for the pilot store via the `PATCH Update POS Status` endpoint by setting pos\_integration\_enabled = true.
    

##### Continuing Launches

Once your pilot store has been successfully integrated for a minimum of three days with an injection success rate of 98% or higher, you are ready to launch additional locations on your integration. Review and finalize the list of all stores that will require POS integration. Work with your Uber partner manager to develop a rollout schedule for all stores.

Follow the checklist below to prepare for each store launch:

-   Communicate operational changes to all stores before turning on Order API (eg. no longer need to transcribe orders from tablet into POS).
    
-   Provision stores to your production developer user. Once the stores have been associated to your new production account, you will be able to post menus to each of your corresponding stores via the Menu creation endpoint.
    
-   If posting store menus via the Menu API prior to enabling order integration, discuss a rollout plan to turn on the Menu API for your stores. For each migration, you will also need to communicate to each store the new workflows associated with creating and updating the store’s menus via API updates versus the previous workflow using Excel files.
    
-   On launch day enable order integration for the pilot store via the `PATCH Update POS Status` endpoint by setting pos\_integration\_enabled = true.
    

[

Go Live Overview

](#go-live-overview)[

Verifying Your Integration with Uber

](#verifying-your-integration-with-uber)[

Setting Up a Production Application

](#setting-up-a-production-application)[

Launching a Pilot Store

](#launching-a-pilot-store)[

Continuing Launches

](#continuing-launches)
