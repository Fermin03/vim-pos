<!-- fuente: https://apisandbox.facturama.mx/guias/nominas/catalogos/typesofjourney · capturado 2026-09-03 -->

# Catálogo de Tipos de Jornada

            Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

### Url de petición

#### http method:

#### GET

**https://apisandbox.facturama.mx/catalogs/typesofjourney**

### Mediante SDK

        Se considera que **facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
payment_method = facturama.catalog.types_of_journey
```

    Puedes hacer la consulta solo hasta **facturama.catalog.payment_methods** para obtener el listado completo de los métodos de pago

        Se considera que **$facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
$lstNameIds = $facturama->get('catalogs/TypesOfJourney');
```

        Se considera que **Facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
Facturama.Catalogs.TypesOfJourney(function (result) {

        console.log("Catálogo: ", result );

    }, function (error) {
        if (error && error.responseJSON) {
            console.log("errores", error.responseJSON);
        }
    });
```

        Se considera que **facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
List paymentForm = facturama.Catalogs().TypesOfJourney();
```

        En este ejemplo se considera que **facturama** es una instancia de Facturama API
        [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
var paymentForm = facturama.Catalogs.TypesOfJourney;
```

#### Consulta

```
self.client._credentials = ('username', 'password')
    lst_payment_methods = self.client.TypesOfJourney.query()
```
