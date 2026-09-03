<!-- fuente: https://apisandbox.facturama.mx/guias/catalogos/codigos-postales · capturado 2026-09-03 -->

# Catálogo de códigos postales

            Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

    El código postal es el elemento empleado como lugar de expedición, es el único valor obligatorio a emplear como domicilio fiscal del emisor.

    El código postal empleado en el CFDI debe ser algunos de los que incluye esta lista, de lo contrario, él CFDI será rechazado por el **PAC**

        Se considera que **facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
lst_postal_codes = facturama.catalog.postal_codes("7818")
```

        Se considera que **$facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
$lstNameIds = $facturama->get('catalogs/PostalCodes', ['keyword' => '7818'] );
```

        Se considera que **Facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
Facturama.Catalogs.PostalCodes("7818", function (result) {

        console.log("Lista de códigos postales: ", result );

    }, function (error) {
        if (error && error.responseJSON) {
            console.log("errores", error.responseJSON);
        }
    });
```

        Se considera que **facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
List
 lstPostalCodes = facturama.Catalogs().PostalCodes("7818");
```

        En este ejemplo se considera que **facturama** es una instancia de Facturama API
        [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
var lstPostalCodes = facturama.Catalogs.PostalCodes("7818");
```

#### Consulta

```
self.client._credentials = ('username', 'password')
    lst_postal_codes = self.client.PostalCodesCatalog.query({'keyword': '7818'})
```
