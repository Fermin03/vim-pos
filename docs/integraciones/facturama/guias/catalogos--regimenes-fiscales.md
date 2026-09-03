<!-- fuente: https://apisandbox.facturama.mx/guias/catalogos/regimenes-fiscales · capturado 2026-09-03 -->

# Catálogo de Regimenes Fiscales

            Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

    Catálogo con los regimenes fiscales que especifica el SAT, el valor colocado en el CFDI debe ser alguno de esta lista

        Se considera que **facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
lst_fiscal_regimens = facturama::catalog.fiscal_regimens
```

        Se considera que **$facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
$lstNameIds = $facturama->get('catalogs/FiscalRegimens'] );
```

        Se considera que **Facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
Facturama.Catalogs.FiscalRegimens(function (result) {

        console.log("Lista de regimenes fiscales: ", result );

    }, function (error) {
        if (error && error.responseJSON) {
            console.log("errores", error.responseJSON);
        }
    });
```

        Se considera que **facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
List lstFiscalRegimens = facturama.Catalogs().FiscalRegimens();
```

        En este ejemplo se considera que **facturama** es una instancia de Facturama API
        [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
var lstFiscalRegimens = facturama.Catalogs.FiscalRegimens;
```

#### Consulta

```
self.client._credentials = ('username', 'password')
    lst_fiscal_regimens = self.client.FiscalRegimensCatalog.query()
```
