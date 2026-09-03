<!-- fuente: https://apisandbox.facturama.mx/guias/clientes · capturado 2026-09-03 -->

# Catálogo de Clientes

            Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

El catálogo de clientes aplica únicamente para la modalidad API Web

	El llenado y uso de éste catálogo es opcional, ya que puedes especificar los datos del cliente / receptor al momento de generar el CFDI

	Usar este catálogo es recomendable para tener los datos de tus clientes dados de alta en nuestra Plataforma Facturama en el caso de que decidas crear alguna factura manual (desde la plataforma)

- [Dar de alta un cliente](https://apisandbox.facturama.mx/guias/clientes#add-client)

- [Editar un cliente](https://apisandbox.facturama.mx/guias/clientes#update-client)

- [Consultar clientes](https://apisandbox.facturama.mx/guias/clientes#list-clients)

## Dar de alta un cliente

#### URL para la petición

#### POST

```
https://apisandbox.facturama.mx/client
```

				En este ejemplo se considera que **facturama** es una instancia de Facturama API
				[ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Agregar cliente

```
cliente = facturama.clients.create(Facturama::Models::Client.new({
        Email: "info@pedroperez.net",
        Rfc: "RODJ899315654",
        CfdiUse: "P01",
        Name: "Pedro Perez Development Environment",

        Address: {  Country: "MEXICO",
                    ExteriorNumber: "1230",
                    InteriorNumber: "B",
                    Locality: "San Luis",
                    Municipality: "San Luis Potosí",
                    Neighborhood: "Lomas 4ta",
                    State: "San Luis Potosí",
                    Street: "Cañada de Gomez",
                    ZipCode: "78220"
        }
    }))
```

		En este ejemplo se considera que **$facturama** es una instancia de Facturama API
		[ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Agregar cliente

```
$params = [
      'Address' => [
        'Street' => 'St One ',
        'ExteriorNumber' => '15',
        'InteriorNumber' => '12',
        'Neighborhood' => 'Lower Manhattan, ',
        'ZipCode' => 'sample string 5',
        'Locality' => 'sample string 6',
        'Municipality' => 'sample string 7',
        'State' => 'sample string 8',
        'Country' => 'MX',
      ],
        "Rfc": "XAMA620210DQ5",
        "Name": "ALBA XKARAJAM MENDEZ",
        "CfdiUse": "G03",
        "TaxZipCode": "83410",
        "FiscalRegime":"626"
        "Email" => "test@facturma.com"
    ];
    $cliente = $facturama->post('Client', $params);
```

		En este ejemplo se considera que **Facturama** es una instancia de Facturama API
		[ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Agregar cliente

```
var newClient = {
        "Email": "pruebas@gmail.com",
        "Address": {
            "Street": "Av Seguridad Soc",
            "ExteriorNumber": "123",
            "InteriorNumber": "",
            "Neighborhood": "Fidel Velazquez",
            "ZipCode": "78436",
            "Locality": "",
            "Municipality": "Soledad de Graciano Sánchez",
            "State": "San Luis Potosí",
            "Country": "Mex"
        },
        "Rfc": "XAMA620210DQ5",
        "Name": "ALBA XKARAJAM MENDEZ",
        "CfdiUse": "G03",
        "TaxZipCode": "83410",
        "FiscalRegime":"626"
    };

    Facturama.Clients.Create(newClient, function(result){
        client = result;
        console.log("creacion",result);
    });
```

		En este ejemplo se considera que **facturama** es una instancia de Facturama API
		[ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Referencias

```
Client cliente = new Client();

    Address clientAddress = new Address();
    clientAddress.setCountry("MEXICO");
    clientAddress.setExteriorNumber("1230");
    clientAddress.setInteriorNumber("B");
    clientAddress.setLocality("San Luis");
    clientAddress.setMunicipality("San Luis Potosí");
    clientAddress.setNeighborhood("Lomas 4ta");
    clientAddress.setState("San Luis Potosí");
    clientAddress.setStreet("Cañada de Gomez");
    clientAddress.setZipCode("78220");

    cliente.setAddress(clientAddress);
    cliente.setCfdiUse("P01");
    cliente.setRfc("ESO1202108R2");
    cliente.setEmail("diego@facturama.com.mx");
    cliente.setName("Expresion en Software");

   cliente = facturama.Clients().Create(cliente);
```

		En este ejemplo se considera que **facturama** es una instancia de Facturama API
		[ver en la guía](https://apisandbox.facturama.mx/guias/primeros-pasos)

#### Referencia

```
var cliente = facturama.Clients.Create(new Client
        {
            Address = new Address
            {
                Country = "MEXICO",
                ExteriorNumber = "1230",
                InteriorNumber = "B",
                Locality = "San Luis",
                Municipality = "San Luis Potosí",
                Neighborhood = "Lomas 4ta",
                State = "San Luis Potosí",
                Street = "Cañada de Gomez",
                ZipCode = "78220"
            },
            CfdiUse = "P01",
            Email = "diego@facturama.com.mx",
            Rfc = "ESO1202108R2",
            Name = "Expresion en Software"
        });
```

#### Referencia

```
customer_object = {
        "Id": "1111000",
        "Email": "test@test.com",
        "Address": {
            "Street": "Fenix One",
            "ExteriorNumber": "1",
            "InteriorNumber": "0",
            "Neighborhood": "Call me",
            "ZipCode": "59510",
            "Locality": "Xiquilpan",
            "Municipality": "Jiquilpan",y
            "State": "MICHOACAN DE OCAMPO",
            "Country": "MX"
        },
        "Rfc": "GARR900630G98",
        "Name": "Pollitux",
        "CfdiUse": "P01",
        "TaxResidence": "",
        "NumRegIdTrib": ""
    }

    cliente = facturama.Client.create(customer_object)
```

## Editar un cliente

	Para editar un cliente, se requiere conocer el ID y colocarlo como parte de la URL

	Los datos enviados en la petición son los mismos que al momento de crearlo.

#### URL para la petición

#### PUT

```
https://apisandbox.facturama.mx/client/{IdDelCliente}

Ejemplo: https://apisandbox.facturama.mx/client/czqFfZ9-7Z4chG8-_rHsYw2
```

#### Ejemplo en JSON de los datos del cliente

```
{
        "Email": "pruebas@gmail.com",
        "Address": {
            "Street": "Av Seguridad Soc",
            "ExteriorNumber": "123",
            "InteriorNumber": "",
            "Neighborhood": "Fidel Velazquez",
            "ZipCode": "78436",
            "Locality": "",
            "Municipality": "Soledad de Graciano Sánchez",
            "State": "San Luis Potosí",
            "Country": "Mex"
        },
        "Rfc": "ROAM861021459",
        "Name": "Manuel Romero Alva",
        "CfdiUse": "P01",
    }
```

## Consultar listado de clientes

**page**: Número página   (parámetro obligatorio)

	El listado de clientes está paginado, esto quiere decir que:

	Unicamente se muestran 100 elementos por cada respuesta de la API.

	Para cambiar (o especificar) la página se emplea el atributo **page**

Ejemplo:

- **page=0** =  Representa los primeros 100 elementos (del 1 al 100)

- **page=1** = Representa los segundos 100 elementos (del 101 al 200)

- etc.

#### URL para la petición

#### GET

```
https://apisandbox.facturama.mx/client?page=0
```

#### Ejemplo en JSON de una lista de clientes

```
[
    {
        "Id": "ZWvBN3RZLP_IVg9M7uuAqA2",
        "Address": {
            "ZipCode": "78251",
            "Locality": "",
            "Country": "MEXICO"
        },
        "Rfc": "EKU9003173C9",
        "Name": "CLIENTE DE PRUEBA PAGOS",
        "FiscalRegime": "603",
        "Email": "pruebatn2@yahoo.com",
        "CfdiUse": "CP01",
        "TaxResidence": "",
        "NumRegIdTrib": "",
        "TaxZipCode": "78251"
    },
    {
        "Id": "iDgRW9QQ5qADrnA-B39qVw2",
        "Address": {
            "Street": "JAN",
            "Neighborhood": "Santo Amaro",
            "ZipCode": "35801",
            "Locality": "Santo Amaro",
            "Municipality": "Cali",
            "Country": "MEXICO"
        },
        "Rfc": "XEXX010101000",
        "Name": "Cliente Extranjero",
        "FiscalRegime": "616",
        "Email": "chucho@facturama.mx",
        "CfdiUse": "S01",
        "TaxResidence": "USA",
        "NumRegIdTrib": "820573334",
        "TaxZipCode": "35801"
    }
]
```
