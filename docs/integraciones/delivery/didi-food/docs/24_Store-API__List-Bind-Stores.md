<!-- id=1932 path=Store API > List Bind Stores -->
## List Bind Stores

`POST` [https://openapi.didi-food.com/v1/shop/shop/list](https://openapi.didi-food.com/v1/shop/shop/list) 

The **List All Stores** endpoint retrieves the stores binded to your application. The response you'll bring a list with `app_id`, `shop_id`, `app_shop_id`, `city_id`, `token_expiration_time`. For this endpoint, you’ll need to provide a signature, so read below how to do this.

### Signature Algorithm

**Filter and Sort:**

Obtain all the request parameters, but does not include byte type parameters such as file, byte stream. Delete signature parameters with empty value and then sort the key of the ASCII code in accordance to the first character from A to Z. If the first character is the same, then it shall be sorted from the second character from A to Z and so on.

**Splice:**

After sorting the parameters and their corresponding values, create the format "parameter=parameter value" and connect the parameters with the character "&". After splicing the parameters, add "{$app_secret}" in the string end. This created format or sting shall be herein referred to as "signature string".


#### PhP Example to Generate a Sign

```php
$params = [
    'app_id' => 3458764573578035295,
    'page_size' => 30,
    "page_no" => 1,
    'timestamp' => time(),
];
$app_secret = '87b69bab1a1548c1516189a5fb75e705';
ksort($params);

$signArr = [];
foreach ($params as $k => $v) {
    $signArr[] = $k . '=' . $v;
}
$toSign = implode('&', $signArr) . $app_secret;
$sign = md5($toSign);

print_r($params["timestamp"] . "\n"); 
// 1623814795
print_r("toSign: " . $toSign . "\n"); 
// toSign: app_id=3458764573578035295&page_no=1&page_size=30&timestamp=162381479587b69bab1a1548c1516189a5fb75e705
print_r("sign: " . $sign . "\n");
// sign: d471c1f850ab312a703ac9611bdee25a
```

#### Request Body Parameters

| **Field Name** | **Field Type** | **Description** | **Mandatory** | **Sample** |
| --- | --- | --- | --- | --- |
| `app_id` | long | The ID of an app in **our** system. | Yes | 3458764610605350993 |
| `timestamp` | int | Timestamp of the request | Yes | 1600334446 |
| `sign` | string | Signature generated as explained above | Yes | "23a3170ae0104c7d1cc3061b29f1138f" |
| `page_no` | int | Page number | No  | 1   |
| `page_size` | int | Page size. Max: 100 | No  | 30  |

#### Response Example

```json
{
    "errno":0,
    "errmsg":"ok",
    "requestId":"2281991a24d4db23",
    "time":1649230331,
    "data":{
        "page_no":1,
        "page_size":20,
        "total_page":1,
        "total_cnt":2,
        "shops":[
            {
                "shop_id":1152921673202184100,
                "app_shop_id":"1234",
                "shop_name":"test_shop",
                "bound_flag":1,
                "shop_phone":[
                    {
                        "type":1,
                        "phone":"07012345678",
                        "callingCode":"+506"
                    }
                ]
            },
            {
                "shop_id":3458764614711902464,
                "app_shop_id":"123",
                "shop_name":"test_shop1",
                "bound_flag":0,
                "shop_phone":[
                    {
                        "type":0,
                        "phone":"07012345678",
                        "callingCode":"+52"
                    }
                ]
            }
        ]
    }
}
```
