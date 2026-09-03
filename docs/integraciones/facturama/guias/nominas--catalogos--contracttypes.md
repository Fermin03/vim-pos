<!-- fuente: https://apisandbox.facturama.mx/guias/nominas/catalogos/contracttypes · capturado 2026-09-03 -->

# Catálogo de Tipos de Contrato

            Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

    Obtiene el listado de bancos que pueden ser usados

### Url de petición

#### http method:

#### GET

**https://apisandbox.facturama.mx/catalogs/contracttypes**

### Mediante SDK

        Se considera que **facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
payment_method = facturama.catalog.contract_types
```

    Puedes hacer la consulta solo hasta **facturama.catalog.payment_methods** para obtener el listado completo de los métodos de pago

        Se considera que **$facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
$lstNameIds = $facturama->get('catalogs/ContractTypes');
```

        Se considera que **Facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
Facturama.Catalogs.ContractTypes(function (result) {

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
List paymentForm = facturama.Catalogs().ContractTypes();
```

        En este ejemplo se considera que **facturama** es una instancia de Facturama API
        [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
var paymentForm = facturama.Catalogs.ContractTypes;
```

#### Consulta

```
self.client._credentials = ('username', 'password')
    lst_payment_methods = self.client.ContractTypes.query()
```
