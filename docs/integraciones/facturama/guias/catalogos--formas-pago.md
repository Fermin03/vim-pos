<!-- fuente: https://apisandbox.facturama.mx/guias/catalogos/formas-pago · capturado 2026-09-03 -->

# Catálogo de formas de pago

            Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

   Catálogo con las formas de pago que especifica el SAT, el valor colocado en el CFDI debe ser alguno de esta lista

        Se considera que **facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
lst_payment_forms = facturama::catalog.payment_forms
```

        Se considera que **$facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
$lstNameIds = $facturama->get('catalogs/PaymentForms');
```

        Se considera que **Facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
Facturama.Catalogs.PaymentForms(function (result) {

        console.log("Lista de formas de pago: ", result );

    }, function (error) {
        if (error && error.responseJSON) {
            console.log("errores", error.responseJSON);
        }
    });
```

        Se considera que **facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

        **paymentForm** contiene una forma de pago, que coincide con el nombre de "Efectivo"

#### Consulta

```
Catalog paymentForm = facturama.Catalogs().PaymentForms().stream().
    filter(p -> p.getName().equals("Efectivo")).findFirst().get();
```

    Puede hacer la consulta solo hasta **facturama.Catalogs().PaymentForms()** para obtener el listado completo de las formas de pago

        En este ejemplo se considera que **facturama** es una instancia de Facturama API
        [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
var paymentForm = facturama.Catalogs.PaymentForms.First(p => p.Name == "Efectivo");
```

#### Consulta

```
self.client._credentials = ('username', 'password')
    lst_payment_forms = self.client.PaymentFormsCatalog.query()
```
