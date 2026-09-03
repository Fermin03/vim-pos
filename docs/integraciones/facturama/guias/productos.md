<!-- fuente: https://apisandbox.facturama.mx/guias/productos · capturado 2026-09-03 -->

# Catálogo de Productos

El catálogo de productos aplica únicamente para la modalidad API Web

	El llenado y uso de éste catálogo es opcional, ya que puedes especificar los datos del producto al momento de generar el CFDI

	Usar este catálogo es recomendable para tener los datos de tus productos dados de alta en nuestra Plataforma Facturama en el caso de que decidas crear alguna factura manual (desde la plataforma)

- [Dar de alta un producto](https://apisandbox.facturama.mx/guias/productos#add-product)

- [Editar un producto](https://apisandbox.facturama.mx/guias/productos#update-product)

- [Consultar producto](https://apisandbox.facturama.mx/guias/productos#list-product)

## Dar de alta un producto

#### URL para la petición

#### POST

```
https://apisandbox.facturama.mx/product
```

#### Agregar producto

```
{
		"Unit": "Servicio",
		"UnitCode": "E48",
		"IdentificationNumber": "WEB003",
		"Name": "Sitio Web CMS",
		"Description": "Desarrollo e implementación de sitio web empleando un CMS",
		"Price": 6500.0,
		"CodeProdServ": "43232408",
		"CuentaPredial": "123",
		"Taxes": [{
			"Name": "IVA",
			"Rate": 0.16,
			"IsRetention": false,
			"IsFederalTax": true
		}]
	}
```

## Editar un producto

	Para editar un producto, se requiere conocer el ID y colocarlo como parte de la URL

	Los datos enviados en la petición son los mismos que al momento de crearlo.

#### URL para la petición

#### PUT

```
https://apisandbox.facturama.mx/product/{IdDelProducto}

Ejemplo: https://apisandbox.facturama.mx/product/rTRHF583IKUdi3yw2sYwrw2
```

#### Ejemplo en JSON de los datos del producto

```
{
  "Id": "rTRHF583IKUdi3yw2sYwrw2",
  "Unit": "Servicio",
  "UnitCode": "E48",
  "IdentificationNumber": "WEB003",
  "Name": "Sitio Web CMS",
  "Description": "Desarrollo de Sitio informativo, de una pagina",
  "Price": 6500,
  "CodeProdServ": "43232408",
  "CuentaPredial": "123",
  "Taxes": [
    {
      "Name": "IVA",
      "Rate": 0.16,
      "IsRetention": false,
      "IsFederalTax": true
    }
  ]
}
```

## Consultar listado de productos

**page**: Número página   (parámetro obligatorio)

	El listado de productos está paginado, esto quiere decir que:

	Unicamente se muestran 100 elementos por cada respuesta de la API.

	Para cambiar (o especificar) la página se emplea el atributo **page**

Ejemplo:

- **page=0** =  Representa los primeros 100 elementos (del 1 al 100)

- **page=1** = Representa los segundos 100 elementos (del 101 al 200)

- etc.

#### URL para la petición

#### GET

```
https://apisandbox.facturama.mx/product?page=0
```

#### Ejemplo en JSON de una lista de productos

```
[
    {
        "Id": "zziSc1h79BjiZUl91BuKGQ2",
        "UnitCode": "H87",
        "Unit": "PRODUCTOS",
        "IdentificationNumber": "gl-10",
        "Name": "AMPLIFICADOR PARA GUITARRA 10W",
        "Description": "DESCRIPCIÓN DE AMPLIFICADOR PARA GUITARRA 10W",
        "Category": "GENERAL",
        "Code": "gl-10",
        "Price": 0.0000,
        "CodeProdServ": "52161547",
        "NameCodeProdServ": "Amplificadores de audio",
        "CuentaPredial": "0",
        "CuentasPredial": [
            "0"
        ],
        "Taxes": [
            {
                "Name": "IVA",
                "Rate": 0.1600000,
                "IsRetention": false,
                "IsFederalTax": true,
                "Total": 0.00
            }
        ]
    },
    {
        "Id": "5E_vP9HDRMeFjMQvHPQE7g2",
        "UnitCode": "H87",
        "Unit": "PRODUCTOS",
        "IdentificationNumber": "gl-10",
        "Name": "AMPLIFICADOR PARA GUITARRA 10W",
        "Description": "DESCRIPCIÓN DE AMPLIFICADOR PARA GUITARRA 10W",
        "Category": "GENERAL",
        "Code": "gl-10",
        "Price": 0.0000,
        "CodeProdServ": "52161547",
        "NameCodeProdServ": "Amplificadores de audio",
        "CuentaPredial": "0",
        "CuentasPredial": [
            "0"
        ],
        "Taxes": [
            {
                "Name": "IVA",
                "Rate": 0.1600000,
                "IsRetention": false,
                "IsFederalTax": true,
                "Total": 0.00
            }
        ]
    }
]
```
