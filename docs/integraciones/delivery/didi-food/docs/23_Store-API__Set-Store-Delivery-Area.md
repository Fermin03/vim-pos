<!-- id=1930 path=Store API > Set Store Delivery Area -->
## Set Store Delivery Area

We have 4 endpoints in this page to **Add, Update, Delete and Get a Store Delivery Area**. All of them can be used to set different delivery areas, with different ETAs, on different times at day.

> **IMPORTANT:**
> These settings are available only for stores doing their own delivery and won't work for stores using DiDi's delivery services.


### Add a Delivery Area

`POST` [https://openapi.didi-food.com/v1/shop/deliveryArea/add](https://openapi.didi-food.com/v1/shop/deliveryArea/add)

The **Add a Delivery Area** endpoint adds a delivery area around the store address that can be set as a polygon or circle. It returns the IDs of the areas created that can be used to later update or delete them.

#### Request Body Parameters

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `auth_token` | string | The `auth_token` for the shop. | Yes | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU= |
| `area_type` | integer | The shape of the area drawn for the delivery area. 0: Circle; 1: Polygon with points. | Yes | 0   |
| `radius` | integer | The radius of a circle delivery area in kilometers. | No. Required when `area_type` is circle | 5   |
| `points` | list [ lat, lng ] | List of latitude and longitude for each point of a polygon delivery area. | No. Required when `area_type` is polygon. | [{"lat": 33.670702244105, "lng": 135.5216506}] |
| `avg_delivery_eta` | integer | The average delivery ETA in seconds. | Yes | 600 |
| `enable_time_list` | list [start, end] | The continuous time span for the current configuration. **Time format:** HH:mm. **Accepted values:** from 00:00 to 23:59. | Yes | [{"start": "10:00", "end": "12:00"}] |
| `price` | integer | The delivery price to be charged. **Note:** Price is always an integer value (never decimals) because the price is set in the lowest denomination (e.g. cents for MX currency, not Peso). | Yes | 500 |

#### Request Example - Area_type: Circle

```json
{
    "auth_token":"ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU=",
    "area_type":0,
    "avg_delivery_eta":300,
    "enable_time_list":[
        {
            "start":"00:50",
            "end":"05:00"
        },
        {
            "start":"06:50",
            "end":"10:00"
        }
    ],
    "price":500,
    "radius":5
}
```

#### Request Example - Area_type: Polygon

```json
{
    "auth_token":"ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU=",
    "area_type":0,
    "avg_delivery_eta":300,
    "enable_time_list":[
        {
            "start":"00:50",
            "end":"05:00"
        },
        {
            "start":"06:50",
            "end":"10:00"
        }
    ],
    "price":500,
    "points":[
        {
            "lat":33.670702244105,
            "lng":135.5216506
        },
        {
            "lat":33.670447501144,
            "lng":135.52397561119
        },
        {
            "lat":33.669700628224,
            "lng":135.5261421767
        }
    ]
}
```

#### Response Body Parameter

| **Name** | **Type** | **Description** | **Example** |
| --- | --- | --- | --- |
| `area_id_list` | list [integer] | The ID of the created delivery area. | [3458764698466584428, 3458764551917602680] |

#### Response Example

```json
{
    "errno":0,
    "errmsg":"ok",
    "requestId":"1e11bfda4f8e51d1",
    "time":1628498382,
    "data":{
        "area_id_list":[
            3458764754171136000,
            3458764704095340500
        ]
    }
}
```

### Update a Delivery Area

`POST` [https://openapi.didi-food.com/v1/shop/deliveryArea/update](https://openapi.didi-food.com/v1/shop/deliveryArea/update)

The **Update a Delivery Area** endpoint updates a delivery area already set for a store.

#### Request Body Parameters

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `auth_token` | string | The `auth_token` for the shop. | Yes | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU= |
| `area_id_list` | list [integer] | The ID of the created delivery area. | Yes | [3458764698466584428, 3458764551917602680] |
| `area_type` | integer | The shape of the area drawn for the delivery area. 0: Circle; 1: Polygon with points. | Yes | 0   |
| `radius` | integer | The radius of a circle delivery area in kilometers. | No. Required when `area_type` is circle | 5   |
| `points` | list [ lat, lng ] | List of latitude and longitude for each point of a polygon delivery area. | No. Required when `area_type` is polygon. | [{"lat": 33.670702244105, "lng": 135.5216506}] |
| `avg_delivery_eta` | integer | The average delivery ETA in seconds. | Yes | 600 |
| `enable_time_list` | list [start, end] | The continuous time span for the current configuration. **Time format:** HH:mm. **Accepted values:** from 00:00 to 23:59. | Yes | [{"start": "10:00", "end": "12:00"}] |
| `price` | integer | The delivery price to be charged. **Note:** Price is always an integer value (never decimals) because the price is set in the lowest denomination (e.g. cents for MX currency, not Peso). | Yes | 500 |

#### Request Example - Area_type: Circle

```json
{
    "auth_token":"ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU=",
    "area_id_list":[
        3458764754171136000,
        3458764704095340500
    ],
    "area_type":0,
    "avg_delivery_eta":300,
    "enable_time_list":[
        {
            "start":"00:50",
            "end":"05:00"
        },
        {
            "start":"06:50",
            "end":"10:00"
        }
    ],
    "price":500,
    "radius":5
}
```

#### Request Example - Area_type: Polygon

```json
{
    "auth_token":"ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU=",
    "area_id_list":[
        3458764754171136000,
        3458764704095340500
    ],
    "area_type":0,
    "avg_delivery_eta":300,
    "enable_time_list":[
        {
            "start":"00:50",
            "end":"05:00"
        },
        {
            "start":"06:50",
            "end":"10:00"
        }
    ],
    "price":500,
    "points":[
        {
            "lat":33.670702244105,
            "lng":135.5216506
        },
        {
            "lat":33.670447501144,
            "lng":135.52397561119
        },
        {
            "lat":33.669700628224,
            "lng":135.5261421767
        }
    ]
}
```

#### Response Example

```json
{
    "errno":0,
    "errmsg":"ok",
    "requestId":"1e11bfda4f8e51d1",
    "time":1628498382,
    "data":{

    }
}
```

### Delete a Delivery Area

`POST` [https://openapi.didi-food.com/v1/shop/deliveryArea/delete](https://openapi.didi-food.com/v1/shop/deliveryArea/delete)

The **Delete a Delivery Area** endpoint deletes one or more delivery areas set for a store.

#### Request Parameters

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `auth_token` | string | The `auth_token` for the shop. | Yes | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU= |
| `area_id_list` | list [integer] | The ID of the created delivery area. | Yes | [3458764698466584428, 3458764551917602680] |

#### Request Example

```json
{
    "auth_token":"ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU=",
    "area_id_list":[
        3458764754171136000,
        3458764704095340500
    ]
}
```

#### Response Example

```json
{
    "errno":0,
    "errmsg":"ok",
    "requestId":"1e11bfda4f8e51d1",
    "time":1628498382,
    "data":{

    }
}
```

### Get the Delivery Area

`GET` [https://openapi.didi-food.com/v1/shop/deliveryArea/list](https://openapi.didi-food.com/v1/shop/deliveryArea/list)

The **Get the Delivery Area** endpoint brings all the delivery area information set to a store.

#### Request Path Parameters

| **Name** | **Type** | **Description** | **Required** | **Example** |
| --- | --- | --- | --- | --- |
| `auth_token` | string | The `auth_token`for the shop. | Yes | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU= |

#### Response Example

```json
{
    "errno":0,
    "errmsg":"ok",
    "requestId":"1e1caf6773876fb2",
    "time":1628499064,
    "data":{
        "shopName":"allinone_mx_guacheng",
        "address":"",
        "lat":33.6632258,
        "lng":135.5216506,
        "areaGroup":[
            {
                "area_id_list":[
                    3458764548302113000
                ],
                "create_ts":1628164699,
                "area_index":0,
                "avg_delivery_eta":400,
                "enable_time_list":[
                    {
                        "start":"11:50",
                        "end":"12:00"
                    }
                ],
                "display_enable_times":"11:50-12:00",
                "points":[
                    {
                        "lat":33.670702244105,
                        "lng":135.5216506
                    },
                    {
                        "lat":33.670447501144,
                        "lng":135.52397561119
                    },
                    {
                        "lat":33.669700628224,
                        "lng":135.5261421767
                    }
                ],
                "price":1000,
                "radius":0,
                "area_type":1
            },
            {
                "area_id_list":[
                    3458764551917603000,
                    3458764698466584600
                ],
                "create_ts":1628478958,
                "area_index":0,
                "avg_delivery_eta":300,
                "enable_time_list":[
                    {
                        "start":"00:50",
                        "end":"05:00"
                    },
                    {
                        "start":"06:50",
                        "end":"10:00"
                    }
                ],
                "display_enable_times":"00:50-05:00  06:50-10:00",
                "points":[
                    {
                        "lat":33.70060152121,
                        "lng":135.5216506
                    },
                    {
                        "lat":33.699328241821,
                        "lng":135.53327565593
                    },
                    {
                        "lat":33.695595066774,
                        "lng":135.54410848351
                    },
                    {
                        "lat":33.68965610864,
                        "lng":135.55341084344
                    },
                    {
                        "lat":33.681915691752,
                        "lng":135.56054879527
                    },
                    {
                        "lat":33.672900906959,
                        "lng":135.56503589937
                    },
                    {
                        "lat":33.6632258,
                        "lng":135.56656636702
                    },
                    {
                        "lat":33.653549604848,
                        "lng":135.56503589937
                    },
                    {
                        "lat":33.64453184706,
                        "lng":135.56054879527
                    },
                    {
                        "lat":33.636787368984,
                        "lng":135.55341084344
                    },
                    {
                        "lat":33.630844349662,
                        "lng":135.54410848351
                    },
                    {
                        "lat":33.62710820162,
                        "lng":135.53327565593
                    },
                    {
                        "lat":33.625833834039,
                        "lng":135.5216506
                    },
                    {
                        "lat":33.62710820162,
                        "lng":135.51002554407
                    },
                    {
                        "lat":33.630844349662,
                        "lng":135.49919271649
                    },
                    {
                        "lat":33.636787368984,
                        "lng":135.48989035656
                    },
                    {
                        "lat":33.64453184706,
                        "lng":135.48275240473
                    },
                    {
                        "lat":33.653549604848,
                        "lng":135.47826530063
                    },
                    {
                        "lat":33.6632258,
                        "lng":135.47673483298
                    },
                    {
                        "lat":33.672900906959,
                        "lng":135.47826530063
                    },
                    {
                        "lat":33.681915691752,
                        "lng":135.48275240473
                    },
                    {
                        "lat":33.68965610864,
                        "lng":135.48989035656
                    },
                    {
                        "lat":33.695595066774,
                        "lng":135.49919271649
                    },
                    {
                        "lat":33.699328241821,
                        "lng":135.51002554407
                    },
                    {
                        "lat":33.70060152121,
                        "lng":135.5216506
                    }
                ],
                "price":500,
                "radius":5,
                "area_type":0
            },
            {
                "area_id_list":[
                    3458764704095340500,
                    3458764754171136000
                ],
                "create_ts":1628498382,
                "area_index":0,
                "avg_delivery_eta":300,
                "enable_time_list":[
                    {
                        "start":"00:50",
                        "end":"05:00"
                    },
                    {
                        "start":"06:50",
                        "end":"10:00"
                    }
                ],
                "display_enable_times":"00:50-05:00  06:50-10:00",
                "points":[
                    {
                        "lat":33.670702244105,
                        "lng":135.5216506
                    },
                    {
                        "lat":33.670447501144,
                        "lng":135.52397561119
                    },
                    {
                        "lat":33.669700628224,
                        "lng":135.5261421767
                    }
                ],
                "price":500,
                "radius":0,
                "area_type":1
            }
        ]
    }
}
```