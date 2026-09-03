<!-- fuente: https://apisandbox.facturama.mx/guias/api-web/cfdi/complemento-exterior · capturado 2026-09-03 -->

Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

# Complemento de Comercio Exterior

    El complemento de comercio exterior para CFDI es un anexo a la factura electrónica que permite identificar a los exportadores e importadores, además de ampliar la descripción de las mercancías comercializadas. El objetivo es mejorar la seguridad y el control fiscal en las operaciones internacionales.

    Cuando se emita un comprobante fiscal por operaciones de comercio exterior de exportación definitiva de mercancías con clave de pedimento “A1”, se deberá de incorporar el  “Complemento para comercio exterior”.

#### Datos del receptor

```
var cfdi = {
        "Receiver": {
            "Name": " JOSE ALBERTO  LOPEZ CAMARILLO",
            "CfdiUse": "P01",
            "Rfc": "XEXX010101000",
            "TaxRegistrationNumber": "123456789",
            "TaxResidence": "USA"
         },
        "CfdiType": "I",
        "NameId": "26",
        "ExpeditionPlace": "78116",
        "PaymentForm": "01",
        "PaymentMethod": "PUE",
        "Items": [{
                "IdentificationNumber": "CX-000988",
      	        "Quantity": "1",
      	        "ProductCode": "41106300",
      	        "UnitCode": "EA",
                "Unit": "PIEZA",
                "Description": "ABACO",
                "UnitPrice": "100",
                "Subtotal": "100.00",
                "Taxes": [{
                        "Name": "IVA",
                        "Rate": "0.16",
                        "Total": "16",
                        "Base": "100",
                        "IsRetention": "false"
                    }
                ],
                "Total": "116.00"
            },
    	    {
                "Quantity": "1",
                "ProductCode": "41106300",
                "UnitCode": "EA",
                "Unit": "PIEZA",
                "Description": " ABACO",
                "UnitPrice": "100",
                "Subtotal": "100.00",
                "IdentificationNumber": "CX-000988",
                "Taxes": [{
                        "Name": "IVA",
                        "Rate": "0.16",
                        "Total": "16",
                        "Base": "100",
                        "IsRetention": "false"
                    }
                ],
                "Total": "116.00"
            }
        ],
        "Complemento": {
            "ForeignTrade": {
                "Issuer": {
                    "Address": {
                        "Street": "Cañada de Gomez",
                        "ExteriorNumber": "110",
                        "InteriorNumber": "A",
                        "Reference": "-",
                        "Municipality": "028",
                        "State": "SLP",
                        "Country": "MEX",
                        "ZipCode": "78216"
                    }
                },
                "Receiver": {
                    "Address": {
                        "Street": "Cañada de Gomez",
                        "ExteriorNumber": "110",
                        "InteriorNumber": "A",
                        "Neighborhood": "0939",
                        "Locality": null,
                        "Municipality": "028",
                        "State": "SLP",
                        "Country": "MEX",
                        "ZipCode": "78216"
                    }
                },
                "Commodity": [{
                        "SpecificDescriptions": [{
                                "Brand": "Volkswagen",
                                "Model": "Polo",
                                "SubModel": "GTI",
                                "SerialNumber": "4556789542156"
                            }
                        ],
                        "IdentificationNumber": "CX-000988",
                        "TariffFraction": "94059102",
                        "CustomsQuantity": "1",
                        "CustomsUnit": "01",
                        "CustomsUnitValue": "10.60"
                    }
                ],
                "OperationType": "2",
                "RequestCode": "A1",
                "OriginCertificate": "true",
                "Incoterm": "CFR",
                "Subdivision": 1,
                "ExchangeRateUSD": "18.78",
                "TotalUSD": "1",
                "OriginCertificateNumber": "20001000000300022817",
                "ReliableExporterNumber": null,
                "Observations": "sample string 8"
            }
        }
    }

    cfdi = facturama.cfdis.create(cfdi)
```

#### Datos del receptor

```
$params = {
        "Receiver" => {
            "Name" => " JOSE ALBERTO  LOPEZ CAMARILLO",
            "CfdiUse" => "P01",
            "Rfc" => "XEXX010101000",
            "TaxRegistrationNumber" => "123456789",
            "TaxResidence" => "USA"
        },
        "CfdiType" => "I",
        "NameId" => "26",
        "ExpeditionPlace" => "78116",
        "PaymentForm" => "01",
        "PaymentMethod" => "PUE",
        "Items" => [{
            "IdentificationNumber" => "CX-000988",
      	    "Quantity" => "1",
      	    "ProductCode" => "41106300",
      	    "UnitCode" => "EA",
            "Unit" => "PIEZA",
            "Description" => "ABACO",
            "UnitPrice" => "100",
            "Subtotal" =>"100.00",
            "Taxes" => [{
                "Name" => "IVA",
                "Rate" => "0.16",
                "Total" => "16",
                "Base" => "100",
                "IsRetention" => "false"
            }],
            "Total" => "116.00"
        },
        {
            "Quantity" => "1",
            "ProductCode" => "41106300",
            "UnitCode" => "EA",
            "Unit" => "PIEZA",
            "Description" => " ABACO",
            "UnitPrice" => "100",
            "Subtotal" => "100.00",
            "IdentificationNumber" => "CX-000988",
            "Taxes" => [{
                "Name" => "IVA",
                "Rate" => "0.16",
                "Total" => "16",
                "Base" => "100",
                "IsRetention" => "false"
            }],
            "Total" => "116.00"
        }],
        "Complemento" => {
            "ForeignTrade" => {
                "Issuer" => {
                    "Address"=> {
                        "Street" => "Cañada de Gomez",
                        "ExteriorNumber" => "110",
                        "InteriorNumber" => "A",
                        "Reference" => "-",
                        "Municipality" => "028",
                        "State" => "SLP",
                        "Country" => "MEX",
                        "ZipCode" => "78216"
                    }
                },
                "Receiver" => {
                    "Address" => {
                        "Street" => "Cañada de Gomez",
                        "ExteriorNumber" => "110",
                        "InteriorNumber" => "A",
                        "Neighborhood" => "0939",
                        "Municipality" => "028",
                        "State" => "SLP",
                        "Country" => "MEX",
                        "ZipCode" => "78216"
                    }
                },
                "Commodity" => [{
                    "SpecificDescriptions" => [{
                        "Brand" => "Volkswagen",
                        "Model" => "Polo",
                        "SubModel" => "GTI",
                        "SerialNumber" => "4556789542156"
                    }],
                    "IdentificationNumber" => "CX-000988",
                    "TariffFraction" => "94059102",
                    "CustomsQuantity" => "1",
                    "CustomsUnit" => "01",
                    "CustomsUnitValue" => "10.60"
                }],
                "OperationType" => "2",
                "RequestCode" => "A1",
                "OriginCertificate" => true,
                "Incoterm" => "CFR",
                "Subdivision" => "1",
                "ExchangeRateUSD" => "18.78",
                "TotalUSD" => "1",
                "OriginCertificateNumber" => "20001000000300022817",
                "Observations" => "sample string 8"
            }
        }
    }
    $result = $facturama->post('2/cfdis', $params);
```

#### Datos del receptor

```
var newCfdi = {
        "Receiver": {
            "Name": " JOSE ALBERTO  LOPEZ CAMARILLO",
            "CfdiUse": "P01",
            "Rfc": "XEXX010101000",
            "TaxRegistrationNumber": "123456789",
            "TaxResidence": "USA"
         },
        "CfdiType": "I",
        "NameId": "26",
        "ExpeditionPlace": "78116",
        "PaymentForm": "01",
        "PaymentMethod": "PUE",
        "Items": [{
            "IdentificationNumber": "CX-000988",
      	    "Quantity": "1",
      	    "ProductCode": "41106300",
      	    "UnitCode": "EA",
            "Unit": "PIEZA",
            "Description": "ABACO",
            "UnitPrice": "100",
            "Subtotal": "100.00",
            "Taxes": [{
                "Name": "IVA",
                "Rate": "0.16",
                "Total": "16",
                "Base": "100",
                "IsRetention": "false"
            }],
            "Total": "116.00"
        },
    	{
            "Quantity": "1",
            "ProductCode": "41106300",
            "UnitCode": "EA",
            "Unit": "PIEZA",
            "Description": " ABACO",
            "UnitPrice": "100",
            "Subtotal": "100.00",
            "IdentificationNumber": "CX-000988",
            "Taxes": [{
                "Name": "IVA",
                "Rate": "0.16",
                "Total": "16",
                "Base": "100",
                "IsRetention": "false"
             }],
             "Total": "116.00"
        }],
        "Complemento": {
            "ForeignTrade": {
                "Issuer": {
                    "Address": {
                        "Street": "Cañada de Gomez",
                        "ExteriorNumber": "110",
                        "InteriorNumber": "A",
                        "Reference": "-",
                        "Municipality": "028",
                        "State": "SLP",
                        "Country": "MEX",
                        "ZipCode": "78216"
                    }
                },
                "Receiver": {
                    "Address": {
                        "Street": "Cañada de Gomez",
                        "ExteriorNumber": "110",
                        "InteriorNumber": "A",
                        "Neighborhood": "0939",
                        "Locality": null,
                        "Municipality": "028",
                        "State": "SLP",
                        "Country": "MEX",
                        "ZipCode": "78216"
                    }
                },
                "Commodity": [{
                    "SpecificDescriptions": [{
                        "Brand": "Volkswagen",
                         "Model": "Polo",
                         "SubModel": "GTI",
                         "SerialNumber": "4556789542156"
                    }],
                    "IdentificationNumber": "CX-000988",
                    "TariffFraction": "94059102",
                    "CustomsQuantity": "1",
                    "CustomsUnit": "01",
                    "CustomsUnitValue": "10.60"
                }],
                "OperationType": "2",
                "RequestCode": "A1",
                "OriginCertificate": "true",
                "Incoterm": "CFR",
                "Subdivision": 1,
                "ExchangeRateUSD": "18.78",
                "TotalUSD": "1",
                "OriginCertificateNumber": "20001000000300022817",
                "ReliableExporterNumber": null,
                "Observations": "sample string 8"
            }
        }
    };

    //llamada para la creacion
    Facturama.Cfdi.Create(newCfdi, function (result) {
        var cfdi = result;
        console.log("creacion de Complemento de pago", result);

    }, function (error) {
        if (error && error.responseJSON) {
            console.log("errores", error.responseJSON);
        }
    });
```

#### Datos del receptor

```
var newCfdi = {
        "Receiver": {
            "Name": " JOSE ALBERTO  LOPEZ CAMARILLO",
            "CfdiUse": "P01",
            "Rfc": "XEXX010101000",
            "TaxRegistrationNumber": "123456789",
            "TaxResidence": "USA"
         },
        "CfdiType": "I",
        "NameId": "26",
        "ExpeditionPlace": "78116",
        "PaymentForm": "01",
        "PaymentMethod": "PUE",
        "Items": [{
            "IdentificationNumber": "CX-000988",
      	    "Quantity": "1",
      	    "ProductCode": "41106300",
      	    "UnitCode": "EA",
            "Unit": "PIEZA",
            "Description": "ABACO",
            "UnitPrice": "100",
            "Subtotal": "100.00",
            "Taxes": [{
                "Name": "IVA",
                "Rate": "0.16",
                "Total": "16",
                "Base": "100",
                "IsRetention": "false"
            }],
            "Total": "116.00"
        },
    	{
            "Quantity": "1",
            "ProductCode": "41106300",
            "UnitCode": "EA",
            "Unit": "PIEZA",
            "Description": " ABACO",
            "UnitPrice": "100",
            "Subtotal": "100.00",
            "IdentificationNumber": "CX-000988",
            "Taxes": [{
                "Name": "IVA",
                "Rate": "0.16",
                "Total": "16",
                "Base": "100",
                "IsRetention": "false"
             }],
             "Total": "116.00"
        }],
        "Complemento": {
            "ForeignTrade": {
                "Issuer": {
                    "Address": {
                        "Street": "Cañada de Gomez",
                        "ExteriorNumber": "110",
                        "InteriorNumber": "A",
                        "Reference": "-",
                        "Municipality": "028",
                        "State": "SLP",
                        "Country": "MEX",
                        "ZipCode": "78216"
                    }
                },
                "Receiver": {
                    "Address": {
                        "Street": "Cañada de Gomez",
                        "ExteriorNumber": "110",
                        "InteriorNumber": "A",
                        "Neighborhood": "0939",
                        "Locality": null,
                        "Municipality": "028",
                        "State": "SLP",
                        "Country": "MEX",
                        "ZipCode": "78216"
                    }
                },
                "Commodity": [{
                    "SpecificDescriptions": [{
                        "Brand": "Volkswagen",
                         "Model": "Polo",
                         "SubModel": "GTI",
                         "SerialNumber": "4556789542156"
                    }],
                    "IdentificationNumber": "CX-000988",
                    "TariffFraction": "94059102",
                    "CustomsQuantity": "1",
                    "CustomsUnit": "01",
                    "CustomsUnitValue": "10.60"
                }],
                "OperationType": "2",
                "RequestCode": "A1",
                "OriginCertificate": "true",
                "Incoterm": "CFR",
                "Subdivision": 1,
                "ExchangeRateUSD": "18.78",
                "TotalUSD": "1",
                "OriginCertificateNumber": "20001000000300022817",
                "ReliableExporterNumber": null,
                "Observations": "sample string 8"
            }
        }
    };

    #llamada para la creacion
    try:
        cfdi = client.Cfdi.create(newCfdi.copy())
        print "se creo factura", cfdi
    except Exception, ex:
        print "Error al crear factura", ex
```

#### Datos del receptor

```
List lstCurrencies = facturama.Catalogs().Currencies();
    Currency currency = lstCurrencies.stream().
    filter(p -> p.getValue().equals("MXN")).findFirst().get();

    Catalog paymentMethod = facturama.Catalogs().PaymentMethods().stream().
    filter(p -> p.getName().equals("Pago en una sola exhibición")).findFirst().get();

    cfdi.setNameId("26");
    cfdi.setCfdiType( CfdiType.Ingreso.getValue() );
    cfdi.setExpeditionPlace("78116");
    cfdi.setPaymentForm("01");
    cfdi.setPaymentMethod("PUE");

    Receiver  receiver = new Receiver();

    receiver.setName(" JOSE ALBERTO  LOPEZ CAMARILLO");
    receiver.setCfdiUse("P01");
    receiver.setRfc("XEXX010101000");
    receiver.TaxRegistrationNumber("123456789");
    receiver.TaxResidence("USA");

    cfdi.setReceiver(receiver);

    List lstItems = new ArrayList();
    Item item = new Item();

    item.setIdentificationNumber("CX-000988");
    item.setQuantity("1");
    item.setProductCode("41106300");
    item.setUnitCode("EA");
    item.setUnit("PIEZA");
    item.setDescription("ABACO");
    item.setUnitPrice(100);
    item.setSubtotal(100.00);

    List lstTaxes = new ArrayList();
    Tax tax = new Tax();
    tax.setName("IVA");
    tax.setIsRetention("false");
    tax.setRate(0.16);
    tax.setBase(100);
    tax.setTotal(16);

    lstTaxes.add(tax);

    item.setTotal(116.00);

    lstItems.add(item);

    Item item2 = new Item();

    item2.setIdentificationNumber("CX-000988");
    item2.setQuantity("1");
    item2.setProductCode("41106300");
    item2.setUnitCode("EA");
    item2.setUnit("PIEZA");
    item2.setDescription("ABACO");
    item2.setUnitPrice(100);
    item2.setSubtotal(100.00);

    List lstTaxes2 = new ArrayList();
    Tax tax2 = new Tax();
    tax2.setName("IVA");
    tax2.setIsRetention(false);
    tax2.setRate(0.16);
    tax2.setBase(100);
    tax2.setTotal(16);

    lstTaxes2.add(tax2);

    item2.setTotal(116.00);

    lstItems.add(item2);

    cfdi.setItems(lstItems);

    Complements complement = new Complements();

    ForeingTrade foreingTrade = new ForeingTrade();

    Issuer issuer  = new Issuer();

    AdrressEmisor address = new AddressEmisor();

    address.setStreet("Cañada de Gomez");
    address.setExteriorNumber("110");
    address.setInteriorNumber("A");
    address.setZipCode("78216");

    issuer.setAddress(address);
    foreingTrade.setIssuer(issuer);

    Receiver receiver = New Receiver();

    Address addressReceiver = New Address();

    addressReceiver.setStreet("Cañada de Gomez");
    addressReceiver.setExteriorNumber("110");
    addressReceiver.setInteriorNumber("A");
    addressReceiver.setZipCode("78216");
    addressReceiver.setNeighborhood("0939");
    addressReceiver.setMunicipality("028");
    addressReceiver.setState("SLP");
    addressReceiver.setCountry("MEX");

    receiver.setAddress(addressReceiver);
    foreingTrade.setReceiver(receiver);

    List lstComodity = new ArrayList();

    Comodity comodity = new Comodity();

    List lstSpecificDescriptions = new ArrayList();
    SpecificDescriptions specificDescriptions = new SpecificDescriptions();

    specificDescriptions.setBrand("Volkswagen");
    specificDescriptions.setModel("Polo");
    specificDescriptions.setSubModel("GTI");
    specificDescriptions.setSerialNumber("4556789542156");

    lstSpecificDescriptions.add(specificDescriptions);
    comodity.setspecificDescriptions(lstSpecificDescriptions);

    comodity.setIdentificationNumber("CX-000988");
    comodity.setTariffFraction("94059102");
    comodity.setCustomsQuantity(1);
    comodity.setCustomsUnit("01");
    comodity.setCustomsUnitValue(10.60);

    lstComodity.add(comodity);
    foreingTrade.setComodity(lstComodity);

    foreingTrade.setOperationType("2");
    foreingTrade.setRequestCode("A1");
    foreingTrade.setOriginCertificate(true);
    foreingTrade.setIncoterm("CFR");
    foreingTrade.setSubdivision(true);
    foreingTrade.setExchangeRateUSD(18.78);
    foreingTrade.setTotalUSD(1.00);
    foreingTrade.setOriginCertificateNumber("20001000000300022817");
    foreingTrade.setObservations("sample string 8");

    complement.setForeingTrades(foreingtrade);

     cfdi.setComplements(complement)
```
