<!-- fuente: https://apisandbox.facturama.mx/guias/catalogos/monedas · capturado 2026-09-03 -->

# Catálogo de monedas

            Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

    La moneda en el CFDI debe de ser alguna de este catálogo establecido por el SAT

        **facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### >Consulta

```
lst_currencies = facturama::catalog.currencies
    currency = lst_currencies.select {|currency| currency["Value"] == "MXN" }.first
```

    Nota: Se recomienda hacer las busquedas, remplazando el valor **"MXN"** por el de la moneda deseada

        **$facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### >Consulta

```
$lstNameIds = $facturama->get('catalogs/currencies');
```

        **Facturama**es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### >Consulta

```
Facturama.Catalogs.Currencies(function (result) {

        console.log("Lista de códigos monedas: ", result );

    }, function (error) {
        if (error && error.responseJSON) {
            console.log("errores", error.responseJSON);
        }
    });
```

        **facturama**es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### >Consulta

```
List
 lstCurrencies = facturama.Catalogs().Currencies();
```

        **facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### >Consulta

```
var currency = facturama.Catalogs.Currencies.First(m => m.Value == "MXN");
```

#### >Consulta

```
self.client._credentials = ('username', 'password')
    lst_currencies = self.client.CurrenciesCatalog.query()
```
