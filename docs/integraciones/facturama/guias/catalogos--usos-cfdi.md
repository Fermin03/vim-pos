<!-- fuente: https://apisandbox.facturama.mx/guias/catalogos/usos-cfdi · capturado 2026-09-03 -->

# Catálogo de usos del CFDI

            Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

    Catálogo con los usos del CFDI que especifica el SAT, el valor colocado en el CFDI debe ser alguno de esta lista.

    La consulta de usos del cfdi, requiere un RFC pues los usos varían de acuerdo a si es persona física o moral

    El uso de CFDI suele ir en el campo **CfdiUse** en el nodo de Receiver

        **facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
lst_cfdi_uses = facturama.catalog.cfdi_uses("POAJ870619123")
```

        **$facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
$lstNameIds = $facturama->get('catalogs/CfdiUses', ['keyword' => 'POAJ870619123'] );
```

        **Facturama**es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
Facturama.Catalogs.CfdiUses("POAJ870619123", function (result) {

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
List lstCfdiUses = facturama.Catalogs().CfdiUses("POAJ870619123");
```

        **facturama** es una instancia de FacturamaAPI [ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Consulta

```
var lstCfdiUses = facturama.Catalogs.CfdiUses("POAJ870619123");
```

#### Consulta

```
self.client._credentials = ('username', 'password')
    lst_payment_methods = self.client.CfdiUsesCatalog.query("POAJ870619123")
```
