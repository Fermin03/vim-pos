<!-- fuente: https://developer.uber.com/docs/eats/references/api/v1/get-eats-stores-storeid-holidayhours -->
## Get Store Holiday Hours

`GEThttps://api.uber.com/v1/eats/stores/{store_id}/holiday-hours`

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

This endpoint allows a developer to retrieve the holiday hours for a given restaurant. Holiday hours are exceptions to the normal operating hours of a restaurant that are applied each day. Results are sorted by day, returned chronologically.

Note the developer account may only read from restaurants with which it is affiliated with in the restaurant’s “Users” list in Uber Eats Manager.

##### Authorization

OAuth 2.0 Bearer token with the `eats.store` scope. For more information, see [Authentication](/docs/eats/guides/authentication).

##### Path Parameters

| Name | Type | Description |
| --- | --- | --- |
| `store_id` | `string` | Unique identifying string for a restaurant on Uber Eats, provided by Uber. |

##### Request Parameters

No request body.

##### Response - Body

| Name | Type | Description |
| --- | --- | --- |
| holiday\_hours | [HolidayHour](#response-holiday-hour) | Map of holiday dates, each with optional `open_time_periods`. If a date does not have an open period specified, the restaurant will be closed for that date. |

##### Response - Holiday Hour

| Name | Type | Description |
| --- | --- | --- |
| open\_time\_periods | list<[OpenTimePeriod](#response-open-time-period)\> | Contains 1 or more `start_time`/`end_time` periods that the restaurant will be open on this closed holiday date |

##### Response - Open Time Period

| Name | Type | Description |
| --- | --- | --- |
| start\_time | string | Start time of override for the restaurant in local time in the format 09:00 |
| end\_time | string | End time of override for the restaurant in local time in the format 16:00 |

##### Request Example

```
curl -X GET \
  -H 'authorization: Bearer YOUR_TOKEN' \
  https://api.uber.com/v1/eats/stores/5e3d0095-1bf0-4896-af2e-f1a1182d16fc/holiday-hours
```

##### Response Example

```
HTTP/2 200
```
```
{
  "holiday_hours": {
    "2019-12-10": {
      "open_time_periods": [
        {
          "start_time": "00:00",
          "end_time": "16:00"
        },
        {
          "start_time": "18:00",
          "end_time": "23:30"
        }
      ]
    },
    "2019-12-11": {
      "open_time_periods": [
        {
          "start_time": "00:00",
          "end_time": "23:59"
        }
      ]
    }
  }
}
```

[

Authorization

](#authorization)[

Path Parameters

](#path-parameters)[

Request Parameters

](#request-parameters)[

Response - Body

](#response-body)[

Response - Holiday Hour

](#response-holiday-hour)[

Response - Open Time Period

](#response-open-time-period)[

Request Example

](#request-example)[

Response Example

](#response-example)
