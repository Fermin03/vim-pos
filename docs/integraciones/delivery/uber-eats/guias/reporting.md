<!-- fuente: https://developer.uber.com/docs/eats/guides/reporting -->
## Reporting Guide

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

## Overview

The Reporting API Suite provides programmatic access to Uber Eats merchant reports in CSV format for **long-term historical analysis and batch processing**. These reports contain operational, financial, and historical data and are designed to support:

-   Merchant payout reconciliation
-   Operational analytics
-   Aggregated menu and fulfillment performance analytics
-   Compliance, accounting, and audit workflows
-   Large-scale platform partner ingestion across thousands of stores

**Important:** This API is **not designed for real-time or near real-time monitoring**. For real-time order data and operational monitoring, use the [Orders API](/docs/eats/references/api/order_suite) instead.

## Recommended Best Practices

##### Implementation Tips

-   Batch your requests–Up to 50 stores can be included in each request. Use the list of storeUUIDs in lieu of a groupUUID.
-   If you are pulling reports for stores across multiple countries, you must make a request for each country up to the batch limit (of 50).
-   Use [GetStores](/docs/eats/references/api/store_suite#tag/GetStores) / [GetStoreDetails](/docs/eats/references/api/store_suite#tag/GetStoreDetails) to confirm the reporting app is installed for each store.
-   Rate limit: 60 requests per minute → One call per second with 50-store batches can process ~20,000 stores in ~6.6 minutes per report type.
-   Both currency and date/times are local, the latter based on when the order was placed.

##### Financial Reconciliation Tips

-   Mark real-time (Orders API) metrics as provisional.
-   Persist every order’s unique identifiers for reconciliation.
-   Poll reporting API daily, ideally overnight.
-   Reconcile daily using the Reporting API, overwriting provisional data when settled data arrives.
-   Expect late-appearing adjustments in the CSVs. Reporting data may take up to 72 hours to settle. and disputes may appear after 30 days.
-   Promo-applied sales (Orders API) ≈ Orders & Items (Reporting) for the same settled day.
-   POS systems can use pre-promo vs post-promo values depending on tax/royalty requirements.
-   Net Payout in your system should match Payment Details Report total.
-   Refunds/chargebacks appear only in Reporting—not Orders API.
-   Tips appear as separate lines and are included in payout, if collected.

##### Retry Policy

-   Retry only for safe, transient failures–`429 Too Many Requests`, `408 Request Timeout`, `500`, `502`, `503`, `504` and Network timeouts / connection resets. Do not retry for 4xx Bad Request until you have corrected the request payload.
-   Total attempts: 4 (initial + 3 retries)
-   Exponential backoff with jitter `sleep = baseDelay * (2^attempt) + random_jitter`

##### Handling Changes

Adding columns to CSV reports is not considered a breaking change. The report formats can vary between countries, and new columns may be added at any time to improve clarity, add new features, or reflect regulatory changes.

To avoid ingestion issues:

1.  **Parse by header name**
    
    Never depend on column order or fixed indices.
    
2.  **Tolerate unknown columns**
    
    Always ignore extra fields instead of failing.
    
3.  **Process missing columns gracefully**
    
    -   Use null/defaults for optional fields
    -   Log missing required fields for investigation, but do not break ingestion flows
4.  **Fail loudly in logs—not in production**
    
    -   Alert your internal engineers when required fields are missing.
    -   Continue processing where possible.
5.  **Version-friendly ingestion**
    
    -   Write ingestion that works even as column count changes.
    -   Avoid strict schema validation on ingestion; validate at the processing layer instead.

**NOTE:** If you do not consume new columns, your reconciliation calculations may be impacted. Investigate whether this is the cause of any mismatches before contacting your Uber POC for further investigation.

For API reference documentation, please visit [Reporting API Reference](/references/api/reporting_suite.yaml)

[

Overview

](#overview)[

Recommended Best Practices

](#recommended-best-practices)[

Implementation Tips

](#implementation-tips)[

Financial Reconciliation Tips

](#financial-reconciliation-tips)[

Retry Policy

](#retry-policy)[

Handling Changes

](#handling-changes)
