<!-- fuente: https://apisandbox.facturama.mx/guias/catalogos/nombres-cfdi · capturado 2026-09-03 -->

# Catálogo de nombres del CFDI

            Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

    El catálogo de nombres del CFDI es un catálogo interno de Facturama y permite seleccionar el "nombre" descriptivo que tendrá el PDF,

    este nombre se muestra con letras rojas en la parte superior del comprobante.

        **facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
lst_name_ids = facturama.catalog.name_ids
```

     **$facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
$lstNameIds = $facturama->get('catalogs/NameIds');
```

        **Facturama**es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
Facturama.Catalogs.NameIds("POAJ870619123", function (result) {

        console.log("Lista de usos del cfdi: ", result );

    }, function (error) {
        if (error && error.responseJSON) {
            console.log("errores", error.responseJSON);
        }
    });
```

        **facturama**es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
List lstNameIds = facturama.Catalogs().NameIds();
```

        **facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
var lstNameIds = facturama.Catalogs.NameIds;
```

#### Consulta

```
self.client._credentials = ('username', 'password')
    lst_name_ids = self.client.NameIdsCatalog.query()
```
