<!-- fuente: https://apisandbox.facturama.mx/guias/api-web/cfdi/otros-tipos-cfdi · capturado 2026-09-03 -->

# Otros tipos de CFDIs

            Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

	La estructura básica de un CFDI de  [API Web](https://apisandbox.facturama.mx/guias/api-web/cfdi/factura) o de  [API Multiemisor](https://apisandbox.facturama.mx/guias/api-multi/cfdi/factura) es casi idéntica

	Tomando en cuenta la estructura base (Web o Multiemisor), es fácil hacer otro tipo de comprobantes, pues en general se agregan algunos **Atributos y/o Nodos**

- [Nota de Credito](https://apisandbox.facturama.mx/guias/api-web/cfdi/otros-tipos-cfdi#nota-credito)

- [Impuestos de retención](https://apisandbox.facturama.mx/guias/api-web/cfdi/otros-tipos-cfdi#impuestos-retencion)

- [IVA Exento](https://apisandbox.facturama.mx/guias/api-web/cfdi/otros-tipos-cfdi#iva-exento)

- [Impuestos locales](https://apisandbox.facturama.mx/guias/api-web/cfdi/otros-tipos-cfdi#impuestos-locales)

## Nota de Credito

Tiene las variantes:

		**"NameId": "2"** Nombre "Nota de crédito" de acuerdo al [Catálogo de nombres del CFDI](https://apisandbox.facturama.mx/guias/catalogos/nombres-cfdi)

		**"CfdiType": "E"** Este campo adquiere el valor de **E** (Egreso)

		**"Relations"** Se puede agregar opcionalmente el Nodo **Relations** para referenciar a un CFDI

#### Datos generales

```
"NameId": "2",
		"CfdiType": Facturama::CfdiType::EGRESO,
    "ExpeditionPlace": "78116",
    "PaymentForm": "03",
    "PaymentMethod": "PUE",
```

#### Nodo "Relations"

```
"Relations": {
        "Type": "01",
        "Cfdis": [{ "Uuid": "27568D31-7E57-442F-BA77-798CBF30BD7D" }]
    },
```

#### Datos generales

```
"NameId" => "2",
		"CfdiType" => "E",
    "ExpeditionPlace" => "78116",
    "PaymentForm" => "03",
    "PaymentMethod" => "PUE",
    "Currency" => "MXN",
```

#### Datos generales

```
"NameId": "2",
		"CfdiType": "E",
    "ExpeditionPlace": "78116",
    "PaymentForm": "03",
    "PaymentMethod": "PUE",
```

#### Nodo "Relations"

```
"Relations": {
        "Type": "01",
        "Cfdis": [{ "Uuid": "27568D31-7E57-442F-BA77-798CBF30BD7D" }]
    },
```

#### Datos generales

```
cfdi.setNameId(2);
		cfdi.setCfdiType( CfdiType.Egreso.getValue() );
    cfdi.setExpeditionPlace("78216");
    cfdi.setPaymentForm(facturama.Catalogs().PaymentForms().get(3).getValue());
    cfdi.setPaymentMethod("PUE");
    cfdi.setCurrency(currency.getValue());
```

#### Nodo "Relations"

```
CfdiRelations cfdiRel = new CfdiRelations();
    cfdiRel.setUuid("27568D31-7E57-442F-BA77-798CBF30BD7D")
    List lstCfdis = new new ArrayList<>();
    lstCfdis.add(cfdiRel);

    CfdiRelation relation = new CfdiRelation();
    relation.setType("01");
    relation.setCfdis(lstCfdis);

    cfdi.setRelations(relation);
```

#### Datos generales

```
NameId = "2",
		CfdiType = CfdiType.Egreso,
    ExpeditionPlace = "78116",
    PaymentForm = "03",
    PaymentMethod = "PUE",
    Currency = "MXN",
```

#### Nodo "Relations"

```
Relations = new CfdiRelations
    {
        Type = "01",
        Cfdis = new List {
            new CfdiRelation {
                Uuid = "27568D31-7E57-442F-BA77-798CBF30BD7D"
            }
        }
    },
```

#### Datos generales

```
"NameId": "2",
		"CfdiType": "E",
    "ExpeditionPlace": "78116",
    "PaymentForm": "03",
    "PaymentMethod": "PUE",
```

#### Nodo "Relations"

```
"Relations": {
        "Type": "01",
        "Cfdis": [{ "Uuid": "27568D31-7E57-442F-BA77-798CBF30BD7D" }]
    },
```

###

## Impuestos de retención

En el concepto o conceptos de la factura lleva los impuestos de:

		**"IVA RET" y "ISR"** Ambos marcados como retención (IsRetention = true)

		**Nota: los impuestos de retencion se restan y los de traslado se suman**

#### Datos generales

```
"NameId": "3",
    "CfdiType": Facturama::CfdiType::INGRESO,
    "ExpeditionPlace": "78116",
    "PaymentForm": "03",
    "PaymentMethod": "PUE",
```

#### Nodo de "Taxes" del concepto

```
"Taxes": [{
            "Name": "IVA",
            "Rate": "0",
            "Total": "0",
            "Base": "100",
            "IsRetention": "false"
        },
		{
            "Name": "IVA RET",
            "Rate": "0",
            "Total": "0",
            "Base": "100",
            "IsRetention": "true"
        },
        {
            "Name": "ISR",
            "Rate": "0.1",
            "Total": "10",
            "Base": "100",
            "IsRetention": "true"
        }],
```

#### Datos generales

```
"NameId" => "3",
    "CfdiType" => "I",
    "ExpeditionPlace" => "78116",
    "PaymentForm" => "03",
    "PaymentMethod" => "PUE",
    "Currency" => "MXN",
    "Decimals" => "2",
```

#### Nodo de "Taxes" del concepto

```
"Taxes" => [{
            "Name" => "IVA",
            "Rate" => "0",
            "Total" => "0",
            "Base" => "100",
            "IsRetention" => "false"
        },
		{
            "Name" => "IVA RET",
            "Rate" => "0",
            "Total" => "0",
            "Base" => "100",
            "IsRetention" => "true"
        },
        {
            "Name" => "ISR",
            "Rate" => "0.1",
            "Total" => "10",
            "Base" => "100",
            "IsRetention" => "true"
        }],
```

#### Datos generales

```
"NameId": "3",
    "CfdiType": "I",
    "ExpeditionPlace": "78116",
    "PaymentForm": "03",
    "PaymentMethod": "PUE",
```

#### Nodo de "Taxes" del concepto

```
"Taxes": [{
            "Name": "IVA",
            "Rate": "0",
            "Total": "0",
            "Base": "100",
            "IsRetention": "false"
        },
		{
            "Name": "IVA RET",
            "Rate": "0",
            "Total": "0",
            "Base": "100",
            "IsRetention": "true"
        },
        {
            "Name": "ISR",
            "Rate": "0.1",
            "Total": "10",
            "Base": "100",
            "IsRetention": "true"
        }],
```

#### Datos generales

```
cfdi.setNameId(3);
    cfdi.setCfdiType( CfdiType.Ingreso.getValue() );
    cfdi.setExpeditionPlace("78216");
    cfdi.setPaymentForm(facturama.Catalogs().PaymentForms().get(3).getValue());
    cfdi.setPaymentMethod("PUE");
    cfdi.setCurrency(currency.getValue());
```

#### Nodo de "Taxes" del concepto

```
List lstTaxes = new ArrayList<>();

    Tax tax = new Tax();

    tax.setName("IVA");
    tax.setIsQuota(false);
    tax.setIsRetention(false);
    tax.setRate(0.16);
    tax.setBase(5550.00);
    tax.setTotal(888.00);

    lstTaxes.add(tax);

		Tax tax2 = new Tax();

    tax2.setName("IVA RET");
    tax2.setIsQuota(false);
    tax2.setIsRetention(true);
    tax2.setRate(0.106667);
    tax2.setBase(5550.00);
    tax2.setTotal(592.00);

    lstTaxes.add(tax2);

    Tax tax3 = new Tax();

    tax3.setName("ISR");
    tax3.setIsQuota(false);
    tax3.setIsRetention(true);
    tax3.setRate(0.01);
    tax3.setBase(5550.00);
    tax3.setTotal(555.00);

    lstTaxes.add(tax3);

    item.setTaxes(lstTaxes);
```

#### Datos generales

```
NameId = "3",
    CfdiType = CfdiType.Ingreso,
    ExpeditionPlace = "78116",
    PaymentForm = "03",
    PaymentMethod = "PUE",
    Currency = "MXN",
```

#### Nodo de "Taxes" del concepto

```
Taxes = new List {
        new Tax {
            Name = "IVA",
            Rate = 0.00m,
            Total = 0.00m,
            Base = 100.00m,
            IsRetention = false
        },
		new Tax {
            Name = "IVA RET",
            Rate = 0.00m,
            Total = 0.00m,
            Base = 100.00m,
            IsRetention = true
        },
        new Tax {
            Name = "ISR",
            Rate = 0.1m,
            Total = 10.00m,
            Base = 100.00m,
            IsRetention = true
        }
    },
```

#### Datos generales

```
"NameId": "3",
    "CfdiType": "I",
    "ExpeditionPlace": "78116",
    "PaymentForm": "03",
    "PaymentMethod": "PUE",
```

#### Nodo de "Taxes" del concepto

```
"Taxes": [{
            "Name": "IVA",
            "Rate": "0",
            "Total": "0",
            "Base": "100",
            "IsRetention": "false"
        },
		{
            "Name": "IVA RET",
            "Rate": "0",
            "Total": "0",
            "Base": "100",
            "IsRetention": "true"
        },
        {
            "Name": "ISR",
            "Rate": "0.1",
            "Total": "10",
            "Base": "100",
            "IsRetention": "true"
        }],
```

## IVA Exento

En el caso de que el bien o servicio goce de **IVA Exento**, lo puedes expresar de la siguiente manera:

#### Nodo de impuestos

```
"Taxes": [{
		"Name": "IVA Exento",
		"Rate": "0",
		"Total": "0",
		"Base": "100",
		"IsRetention": "false",
		"IsFederalTax": "true"
	}]
```

## Impuestos locales

		Se considera impuesto local a cualquier impuesto que no sea de los conocidos (IVA, IVA RET, IEPS, ISR, etc).

		Los impuestos locales, pueden llevar cualquier nombre por ejemplo:

- CEDULAR

- RET ICIC

- RET COL PROF

		Se aplican por ejemplo para: **Honorarios por impartir clases; Honorarios por Arrendamiento; Factura relacionada a la construcción, etc.**

		En general para quien requiera impuestos locales

En la sección de impuestos **Taxes**, se colocan los nodos necesarios de **impuestos locales**, tal como se agregaría cualquier otro tipo de impuesto (IVA, IVA RET, etc)

#### Nodo de "Taxes" del concepto

```
"Taxes": [{
            "Name": "IVA",
            "Rate": "0",
            "Total": "0",
            "Base": "100",
            "IsRetention": "false"
        },
		{
            "Name": "CEDULAR",
            "Rate": "0.01",
            "Total": "55.5",
            "Base": "5550",
            "IsRetention": "true",
        }],
```

#### Datos generales

```
"Taxes" => [{
	    "Name" => "IVA",
	    "Rate" => "0",
	    "Total" => "0",
	    "Base" => "100",
	    "IsRetention" => "false"
	    },
		{
	    "Name" => "CEDULAR",
	    "Rate" => "0.01",
	    "Total" => "55.5",
	    "Base" => "5550",
	    "IsRetention" => "true",
	}],
```

#### Nodo de "Taxes" del concepto

```
"Taxes": [{
            "Name": "IVA",
            "Rate": "0",
            "Total": "0",
            "Base": "100",
            "IsRetention": "false"
        },
		{
            "Name": "CEDULAR",
            "Rate": "0.01",
            "Total": "55.5",
            "Base": "5550",
            "IsRetention": "true",
        }],
```

#### Nodo de "Taxes" del concepto

```
List lstTaxes = new ArrayList<>();

    Tax tax = new Tax();

    tax.setName("IVA");
    tax.setIsQuota(false);
    tax.setIsRetention(false);
    tax.setRate(0.16);
    tax.setBase(5550.00);
    tax.setTotal(888.00);

    lstTaxes.add(tax);

    Tax localTax = new Tax();

    localTax.setName("CEDULAR");
    localTax.setIsQuota(false);
    localTax.setIsRetention(true);
    localTax.setRate(0.01);
    localTax.setBase(5550.00);
    localTax.setTotal(55.50);

    lstTaxes.add(localTax);

    item.setTaxes(lstTaxes);
```

#### Nodo de "Taxes" del concepto

```
Taxes = new List {
        new Tax {
            Name = "IVA",
            Rate = 0.00m,
            Total = 0.00m,
            Base = 100.00m,
            IsRetention = false
        },
		new Tax {
            Name = "CEDULAR",
            Rate = 0.01m,
            Total = 55.5m,
            Base = 5550.00m,
            IsRetention = true,
        }
    },
```

#### Nodo de "Taxes" del concepto

```
"Taxes": [{
            "Name": "IVA",
            "Rate": "0",
            "Total": "0",
            "Base": "100",
            "IsRetention": "false"
        },
		{
            "Name": "CEDULAR",
            "Rate": "0.01",
            "Total": "55.5",
            "Base": "5550",
            "IsRetention": "true",
        }],
```
