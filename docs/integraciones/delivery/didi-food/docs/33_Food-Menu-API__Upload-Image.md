<!-- id=2030 path=Food Menu API > Upload Image -->
## Upload Image

`POST`  [https://openapi.didi-food.com/v3/image/image/uploadImage](https://openapi.didi-food.com/v3/image/image/uploadImage)

The **Upload Image** endpoint provides the ability to upload image to our storage services, which could improve the efficiency by reducing the number of times while uploading image. And this is the way to resolve the problem that couldn't update head image by image url.

### Request Body Parameters

The field of `Content-Type` in http request header should be `multipart/form-data`. And you have to fill in either `image_file` or `image_url` while sending the request.

| **Name** | **Type** | **Description**                                                                                                                                                                                                                                                                | **Required** | **Example**                                  |
| --- | --- |--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------| --- |----------------------------------------------|
| `auth_token` | string | The `auth_token` for the shop.                                                                                                                                                                                                                                                 | Yes | ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU= |
| `image_file` | file | The original image file.  **Note:**  1. The format of image should be `jpeg`, `jpg` or `png`.   2. The size of file should less than `10MB`.  3. Min. width and height: 150px; Max. width and height: 3000px. | No |                                              |
| `image_url`  | string   | The url of image file.  **Note:** The requirement is the same to `image_file`                                                                                                                                                                                             | No           |                                                              |
| `ext` | string | The description or remark which can help you to differentiate the image.   **Note:** You can use this field to find image with fuzzy search. The maximum character length of this field is `255`.                                                                         | No | {{`shop_id`}}-{{`app_item_id`}}, such as: 1152921645439779073-drink_cola_mid |

### Response Body Parameters

| **Name**     | **Type** | **Description**                                              | **Example**                                                  |
| ------------ | -------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| `giftKey`    | string   | The unique identification of image.                          | 45faf923776bc47448d537048d7d5780                             |
| `giftUrl`    | string   | The url of image on our storage services.  **Note:** You can replace your image url with this field while updating the head image of item or shop. | Please refer to the field of `giftUrl` in the response example. |
| `imageSize`  | int      | Size of the image, and the unit is `KB`.                     | 35                                                           |
| `ext`        | string   | The description or remark which you fill in while uploading the image. | 1152921645439779073-vegetable_salad_mid                      |
| `createTime` | int      | The timestamp of uploading operation firstly.                | 1642067358                                                   |
| `updateTime` | int      | The timestamp of updating `ext` operation recently.          | 1642067358                                                   |

### Request Example

**curl:**

```shell
curl -L -X POST 'https://openapi.didi-food.com/v3/image/image/uploadImage' \
-F 'auth_token="ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU="' \
-F 'image_file=@"/Users/didi/Desktop/imageUploadTest/image_normal.jpeg"' \
-F 'ext="1152921645439779073-drink_cola_mid"'
```

**http:**

```http
POST /v3/image/image/uploadImage HTTP/1.1
Host: openapi.didi-food.com
Content-Length: 360
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW

----WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="auth_token"

ZGQ5ZjVlZGUyYmFhNDM2ZmE0ZDA5OTE5ZjI1YzBhNjU=
----WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="image_file"; filename="image_normal.jpeg"
Content-Type: image/jpeg

(data)
----WebKitFormBoundary7MA4YWxkTrZu0gW
----WebKitFormBoundary7MA4YWxkTrZu0gW

```

### Response Example

```json
{
    "errno":0,
    "errmsg":"ok",
    "requestId":"cdf94cac4e1d631e",
    "time":1642067358,
    "data":{
        "giftKey":"20d753636d0a36364e6b43507389b58c",
        "giftUrl":"http://10.14.128.20:8002/static/soda_public/img_20d753636d0a36364e6b43507389b58c.jpg",
        "imageSize":35,
        "ext":"1152921645439779073-vegetable_salad_mid",
        "createTime":1642067358,
        "updateTime":1642067358
    }
}
```