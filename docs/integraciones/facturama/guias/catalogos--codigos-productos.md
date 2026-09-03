<!-- fuente: https://apisandbox.facturama.mx/guias/catalogos/codigos-productos · capturado 2026-09-03 -->

# Catálogo de códigos de productos y servicios

            Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

    Los códigos de productos y servicios son especificados por el SAT,

    se emplean para concer el giro o contexto y por lo tanto se debe de colocar uno que sea acorde al concepto.

Se considera que **facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

    **facturama.catalog.products_or_services("desarrollo")**   obtiene un arreglo de los conceptos del catálogo, afines a "desarrollo"

    En el ejemplo se selecciona el primero de los conceptos afines

#### Consulta

```
prod_code = facturama.catalog.products_or_services("desarrollo").first
```

#### Respuesta (ejemplo JSON)

```
[
        {
            "Complement": "",
            "Name": "Sistemas de exploración y desarrollo",
            "Value": "20102000"
        },
        {
            "Complement": "",
            "Name": "Jumbos neumáticos de desarrollo horizontal",
            "Value": "20102005"
        },
        ...
    ]
```

        Se considera que **$facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
$lstNameIds = $facturama->get('catalogs/ProductsOrServices', ['keyword' => 'desarrollo'] );
```

        Se considera que **Facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
Facturama.Catalogs.ProductsOrServices("desarrollo", function (result) {

        console.log("Lista de códigos de producto: ", result );

    }, function (error) {
        if (error && error.responseJSON) {
            console.log("errores", error.responseJSON);
        }
    });
```

        Se considera que **facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

        **facturama.catalog.products_or_services("desarrollo")**   obtiene un arreglo de los conceptos del catálogo, afines a "desarrollo"

        En el ejemplo se selecciona el primero de los conceptos afines

#### Consulta

```
ProductServices prod = facturama.Catalogs().ProductsOrServices("desarrollo").get(0);
```

        En este ejemplo se considera que **facturama** es una instancia de Facturama API
        [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
var prod = facturama.Catalogs.ProductsOrServices("desarrollo")[0];
```

#### Consulta

```
self.client._credentials = ('username', 'password')
    prod_or_srv = self.client.ProductsServicesCatalog.query({'keyword': 'desarrollo'})
```
