<!-- fuente: https://developer.uber.com/docs/eats/faq -->
## FAQ

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

###### How are multiple tax rates handled?

You are able to set the tax rate per item per store. For more information, please check out our docs on the [PUT /eats/stores/{store\_id}/menu](api/v1/put-eats-stores-storeid-menu) endpoint. Consult with your local city operations team to understand how tax rates are represented in Eats currently - they may not be the same as they are represented in your POS.

###### What specs do the menu item images need to follow for successful image processing?

Menu items images must follow the following specs:

-   File size < 25MB
-   JPG, WEBP or PNG format
-   320px ≤ Width ≤ 6000px
-   320px ≤ Height ≤ 6000px

[

How are multiple tax rates handled?

](#how-are-multiple-tax-rates-handled?)[

What specs do the menu item images need to follow for successful image processing?

](#what-specs-do-the-menu-item-images-need-to-follow-for-successful-image-processing?)
