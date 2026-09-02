<!-- fuente: https://developer.uber.com/docs/eats/references/api/v1/post-eats-stores-storeid-holidayhours -->
## Set Store Holiday Hours

`POSThttps://api.uber.com/v1/eats/stores/{store_id}/holiday-hours`

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

This endpoint allows a developer to set the holiday hours for a given restaurant. Holiday hours are exceptions to the normal operating hours of a restaurant that are applied each day.

Note that each call to this endpoint overwrites any existing holiday hours. For example, if yesterday you posted holiday hours for December 24 and now need to add holiday hours for December 25, you must include the time periods for both December 24 and December 25 when posting holiday hours again to reflect holiday hours for both dates.

##### Authorization

OAuth 2.0 Bearer token with the `eats.store` scope. For more information, see [Authentication](/docs/eats/guides/authentication).

##### Path Parameters

| Name | Type | Description |
| --- | --- | --- |
| `store_id` | `string` | Unique identifying string for a restaurant on Uber Eats, provided by Uber. |

##### Request - Body

| Name | Type | Description |
| --- | --- | --- |
| holiday\_hours | [HolidayHour](#request-holiday-hour) | Map of holiday dates, each with optional `open_time_periods`. |

##### Request - Holiday Hour

| Name | Type | Description |
| --- | --- | --- |
| open\_time\_periods | list<[OpenTimePeriod](#request-open-time-period)\> | Contains 1 or more `start_time`/`end_time` periods that the restaurant will be open on this date. If a restaurant is closed for the whole day, set the start\_time and end\_time to 00:00. |

##### Request - Open Time Period

| Name | Type | Description |
| --- | --- | --- |
| start\_time | string | Start time of override for the restaurant in local time in the format 09:00 |
| end\_time | string | End time of override for the restaurant in local time in the format 16:00 |

##### Request Example

```
{
    "holiday_hours": {
        "2020-12-23": {
            "open_time_periods": [
                {
                    "start_time": "9:00",
                    "end_time": "12:00"
                }
            ]
        },
        "2020-12-24": {
            "open_time_periods": [
                {
                    "start_time": "00:00",
                    "end_time": "00:00"
                }
            ]
        }
    }
}
```

##### Response Example

`Status-Code: 200 No Content`

This endpoint returns an empty response body.

[

Authorization

](#authorization)[

Path Parameters

](#path-parameters)[

Request - Body

](#request-body)[

Request - Holiday Hour

](#request-holiday-hour)[

Request - Open Time Period

](#request-open-time-period)[

Request Example

](#request-example)[

Response Example

](#response-example)
