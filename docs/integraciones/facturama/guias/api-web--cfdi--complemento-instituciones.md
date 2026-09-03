<!-- fuente: https://apisandbox.facturama.mx/guias/api-web/cfdi/complemento-instituciones · capturado 2026-09-03 -->

Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

# Instituciones Educativas(IEDU)

#### Datos del receptor

```
var cfdi = {
        "CfdiType":"I",
        "Currency":"MXN",
        "Date":"2018-09-11T10:00:52",
        "Decimals":"2",
        "ExpeditionPlace":"51873",
        "NameId":"1",
        "PaymentForm":"01",
        "PaymentMethod":"PUE",
        "Serie":"Nueva",
        "Receiver":{
            "CfdiUse":"G01",
            "Id":"czqFfZ9-7Z4chG8-_rHsYw2",
            "Name":"aaa 1 yisus",
            "Rfc":"XAXX010101000",
            "TaxResidence":"MEX"
        },
        "Items":[{
            "Complement":{
                "EducationalInstitution":{
                    "AutRvoe":"234",
                    "Curp":"EMPM881018HSPMLS05",
                    "EducationLevel":"Profesional técnico",
                    "StudentsName":"Emiliano Perez Moreno",
                    "PaymentRfc": " EMPM881018837"
                }
            },
            "Taxes":[{
                "Base":"100",
                "IsRetention":"false",
                "Name":"IVA",
                "Rate":"0.16",
                "Total":"16"
            }],
            "Description":"producto prueba complemento IEDU",
            "IdProduct":"lLro-ivFuvcTbH32gFSQ7w2",
            "ProductCode":"86121503",
            "Quantity":"1",
            "Subtotal":"100.00",
            "Total":"116.00",
            "Unit":"Unidad de servicio",
            "UnitCode":"E48",
            "UnitPrice":"100.00"
        }]
    };
    cfdi = facturama.cfdis.create(cfdi)
```

#### Datos del receptor

```
$params = {
        "Receiver" => {
            "CfdiUse" => "G01",
            "Id" => "czqFfZ9-7Z4chG8-_rHsYw2",
            "Name" => "aaa 1 yisus",
            "Rfc" => "XAXX010101000",
            "TaxResidence" => "MEX"
        },
        "CfdiType" => "I",
        "Currency" => "MXN",
        "Date" => "2018-09-11T10:00:52",
        "Decimals" => "2",
        "ExpeditionPlace" => "51873",
        "NameId" => "1",
        "PaymentForm" => "01",
        "PaymentMethod" => "PUE",
        "Serie" => "Nueva",
        "Items" => [{
            "Complement" => {
                "EducationalInstitution" => {
				    "AutRvoe" => "234",
					"Curp" => "ROAJ850914HSPMLS08",
					"EducationLevel" => "Profesional técnico",
					"StudentsName" => "Pruebas Complementos"
				}
			},
            "Description" => "producto prueba complemento IEDU",
            "IdProduct" => "lLro-ivFuvcTbH32gFSQ7w2",
            "ProductCode" => "86121503",
            "Quantity" => "1",
            "Subtotal" => "100.00",
            "Taxes" => [{
                "Base" => "100",
                "IsRetention" => "false",
                "Name" => "IVA",
                "Rate" => "0.16",
                "Total" => "16"
            }],
            "Total" => "116.00",
            "Unit" => "Unidad de servicio",
            "UnitCode" => "E48",
            "UnitPrice" => "100.00"
        }],
    };

    $result = $facturama->post('2/cfdis', $params);
```
