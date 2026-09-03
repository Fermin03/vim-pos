<!-- fuente: https://apisandbox.facturama.mx/guias/catalogos/metodos-pago · capturado 2026-09-03 -->

# Catálogo de métodos de pago

            Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

    Catálogo con los métodos que especifica el SAT, el valor colocado en el CFDI debe ser alguno de esta lista

        Se considera que **facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
payment_method = facturama.catalog.payment_methods.select {|method| method["Name"] == "Pago en una sola exhibición" }.first
```

    Puedes hacer la consulta solo hasta **facturama.catalog.payment_methods** para obtener el listado completo de los métodos de pago

        Se considera que **$facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
$lstNameIds = $facturama->get('catalogs/PaymentMethods');
```

        Se considera que **Facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
Facturama.Catalogs.PaymentMethods(function (result) {

        console.log("Lista de metodos de pago: ", result );

    }, function (error) {
        if (error && error.responseJSON) {
            console.log("errores", error.responseJSON);
        }
    });
```

        Se considera que **facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

        **paymentMethod** contiene un método de pago, que coincide con el nombre de "Pago en una sola exhibición"

#### Consulta

```
Catalog paymentForm = facturama.Catalogs().PaymentMethods().stream().
    filter(p -> p.getName().equals("Pago en una sola exhibición")).findFirst().get();
```

    Puedes hacer la consulta solo hasta **facturama.Catalogs().PaymentMethods()** para obtener el listado completo de los métodos de pago

        En este ejemplo se considera que **facturama** es una instancia de Facturama API
        [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
var paymentForm = facturama.Catalogs.PaymentMethods.First(p => p.Name == "Pago en una sola exhibición");
```

    Puedes hacer la consulta solo hasta **facturama.Catalogs.PaymentMethods** para obtener el listado completo de los métodos de pago

#### Consulta

```
self.client._credentials = ('username', 'password')
    lst_payment_methods = self.client.PaymentMethodsCatalog.query()
```
