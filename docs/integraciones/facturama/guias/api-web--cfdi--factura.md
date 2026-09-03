<!-- fuente: https://apisandbox.facturama.mx/guias/api-web/cfdi/factura · capturado 2026-09-03 -->

# Crear CFDIs 4.0 mediante API Web

            Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

	En un **Comprobante Fiscal Digital por Internet (CFDI)**, recuerda que:

	los datos del emisor son los que fueron cargados en la sección de **perfil fiscal** [ver en la guía](https://apisandbox.facturama.mx/guias/perfil-fiscal)

	La factura es el CFDI más común, pero hay varios de ellos.

	Y cuentan con una estructura base común y de acuerdo al tipo, algunos elementos que lo forman cambian, o se agregan

#### URL para la petición

#### POST

```
https://apisandbox.facturama.mx/3/cfdis
```

#### Datos generales

	NameId:  Nombre que se mostrará en el PDF, tiene finalidad ilustrativa, para que rápidamente el receptor conozca a lo que se refiere el comprobante.
	[ver en la guía](https://apisandbox.facturama.mx/guias/catalogos/nombres-cfdi)

	CfdiType:  El efecto del comprobante fiscal para el contribuyente emisor: ingreso, egreso, traslado, nota de credito, pago; Representados por los valores: (I|E|T|N|P)

	Dependiendo del lenguaje del SDK se tiene una enumeración que permite colocar el valor

	PaymentForm:  Forma de pago (Efectivo, Tarjeta, Por definir, etc), algún valor válido del catálogo.
	[ver en la guía](https://apisandbox.facturama.mx/guias/catalogos/formas-pago)

	PaymentMethod:  Método de pago (PUE = Una sola exhibición, PPD = Parcialidades)
	[ver en la guía](https://apisandbox.facturama.mx/guias/catalogos/metodos-pago)

	Currency:  La moneda puede ser cualquiera del catálogo, por ejemplo el peso mexicano es MXN
	[ver en la guía](https://apisandbox.facturama.mx/guias/catalogos/monedas)

	Decimals:  Cantidad de decimales, que se contemplarán en las operacioónes.
En el caso de que la moneda sea MXN, se toma un valor decimal de 2, sin importar que se especifique en este campo (esto es por disposición del SAT) [ver en la guía](https://apisandbox.facturama.mx/guias/catalogos/monedas)

	**Exportation **(opcional) Permite registrar la clave con la que se identifica si el comprobante ampara una operación de exportación, las distintas claves vigentes se encuentran incluidas en el catálogo.

	Cuando **no** se especifica  el dato, se considera por defecto **"01" - No aplica**

	Cuando se registre el valor "02", se debe incluir el "Complemento para Comercio Exterior".

-  01 - No aplica

-  02 - Definitiva con clave A1

-  03 - Temporal

-  04 - Definitiva con clave distinta a A1 o cuando no existe enajenación en términos del CFF

	**Date ** (opcional) Es la fecha y hora de expedición del comprobante fiscal.

	Se expresa en la forma  AAAA-MM-DDThh:mm:ss  y debe corresponder con la hora local donde se expide el comprobante. (basado en el código postal)

	Ejemplo: 2023-03-02 12:00:00

		Nota: en caso de mandar el campo nulo Facturama asigna la fecha y hora actual (del código postal de emisión)

	ExpeditionPlace:  Lugar de expedición, es representado por un Código Postal, que pertenece a una sucursal, pero toma en cuenta que:

- Debes tener dada de alta en tu cuenta, una sucursal con ese código postal [ver como agregar sucursal](https://apisandbox.facturama.mx/guias/perfil-fiscal)

- El código postal debe pertenecer al catálogo del SAT [ver catálogo](https://apisandbox.facturama.mx/guias/catalogos/codigos-postales)

	Folio:  Opcional, se puede especificar el Folio (atributo para control interno).

	Puede ser conceptualmente:

- Numérico (de 1 a 10 caracteres): Contiene exclusivamente números,
 ejemplo: "238746"

- Alfanumérico (de 1 a 40 caracteres) : Formado por letras y números conjuntamente, no puede contener el caracter "pipe" (|),
 ejemplo: "vLDZ-Ve1RBy_SAuej5ofCA2"

	En ambos casos se colocan en éste atributo, la diferencia está en que:

	Para hacer uso de las [consultas de CFDI por intervalo de folios](https://apisandbox.facturama.mx/guias/api-web/cfdi/consultar#folio-intervals) será necesario que el folio sea numérico, ya que los alfanuméricos no serán considerados.

		Nota: en el caso de que el Folio sea null, Facturama asignará uno automáticamente y lo irá incrementando.

#### Datos generales

```
"CfdiType": "I",
    "NameId": "1",
    "ExpeditionPlace": "26015",
    "Serie": null,
    "Folio": "V8",
    "PaymentForm": "01",
    "PaymentMethod": "PUE",
    "Exportation": "01",
```

#### Receptor

	Es a quien va dirigido el CFDI. En la estructura es representado por un nodo que se coloca en el atributo **Receiver**

	puedes [ver en la documentación de la API](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=ReceiverBindingModel)

	**Rfc ** Clave del Registro Federal de Contribuyentes

	**Name ** El nombre del receptor ahora se debe registrar en mayusculas y sin el régimen societario

	Debe registrarse **tal y como se encuentra** en la **Cédula de Identificación Fiscal y Constancia de Situación Fiscal**,
	respetando números, espacios y signos de puntuación

	Ejemplo:

-
			Nombre o Razón Social:  Empresa Receptora S.A. DE C.V

			Debe colocarse: EMPRESA RECEPTORA

			[Estos datos los puedes obtener en la CSF](https://facturama.mx/blog/receptos-cambios-factura-4-0-sat/)

			 Nota: Esto aplica tanto para personas físicas como morales

	**FiscalRegime ** Régimen fiscal, tal como está dado de alta en el SAT  Nuevo

	**CfdiUse **Debe ser de acuerdo al régimen fiscal del receptor y desaparece el P01 (Por definir)

	[conocer más del uso del CFDI](https://facturama.mx/blog/que-significa/uso-de-cfdi/)

	**TaxZipCode ** Código postal del receptor  Nuevo

#### Datos del receptor

```
"Receiver": {
        "Name": "UNIVERSIDAD ROBOTICA ESPAÑOLA",
        "CfdiUse": "G03",
        "Rfc": "URE180429TM6",
        "FiscalRegime": "601",
        "TaxZipCode": "65000"
    },
```

#### Conceptos

	Son el conjunto de productos y servicio que cubre el comprobante, especificando la cantidad, montos e impuestos en cada uno de los conceptos.

	En la estructura es representado por un nodo que se coloca en el atributo **Items**
	puedes [ver en la documentación de la API](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=ItemFullBindingModel)

	**TaxObject ** Objeto de impuesto   Nuevo

	Se debe registrar la clave correspondiente para indicar si la operación comercial es objeto o no de impuesto.

- **01** - No objeto de impuesto

- **02** - (Sí objeto de impuesto), se deben desglosar los Impuestos a nivel de Concepto.

- **03** - (Sí objeto del impuesto y no obligado al desglose) no se desglosan impuestos a nivel Concepto.

- **04** - (Sí Objeto de impuesto y no causa impuesto)

	Description:  Descripción del concepto (1000 caracteres alfanuméricos)

	Discount:  Monto del descuento

	IdentificationNumber:  Opcional, para especificar el número de serie de un producto

	ProductCode:  Clave del producto o servicio segun las claves del catalogo  [ver en la guía](https://apisandbox.facturama.mx/guias/catalogos/codigos-productos)

	UnitCode:  Atributo requerido para precisar la unidad de medida aplicable al producto  [ver catálogo en SAT](http://200.57.3.89/PyS/catUnidades.aspx)

	Quantity:  Número de artículos del concepto, aplicables al CFDI

	Taxes:  Conjunto de impuestos aplicables al concepto

#### Conceptos

```
"Items": [
        {
            "Quantity": "1",
            "ProductCode": "10111302",
            "UnitCode": "H87",
            "Unit": "Pieza",
            "Description": "producto prueba cfdi4.0",
            "IdentificationNumber": "papc40",
            "UnitPrice": "1.00",
            "Subtotal": "1.00",
            "TaxObject": "02",
            "Taxes": [
                {
                    "Name": "IVA",
                    "Rate": "0.16",
                    "Total": "0.16",
                    "Base": "1",
                    "IsRetention": "false",
                    "IsFederalTax": "true"
                }
            ],
            "Total": "1.16"
        }
    ]
```

#### Impuestos

	Los hay de 2 tipos, Impuestos federales  e Impuestos locales pero en general tienen la misma estructura.
	En la estructura es representado por un nodo que se coloca en el atributo **Taxes** de un **Item**
	puedes [ver en la documentación de la API](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=TaxBindingModel)

	Base:  Moto base al que se le aplica el impuesto

	IsRetention:  Especfica si es una retención

	IsQuota:  Especifica si es el impuesto es Cuota, si no se toma como Tasa
 (solo se puede marcar como "true" cuando el impuesto es IEPS
	*El IEPS puede tener impuesto por Cuota y por Tasa)

	Name:  Nombre del impuesto (IVA|ISR|IEPS|IVA RET|IVA Exento).

	O en el caso de los impuestos locales, se le puede colocar el nombre que el cliente especifique

	Rate:  Porcentaje de impuesto

	Total:  Monto total del impuesto

#### Impuestos

```
"Taxes": [
        {
            "Name": "IVA",
            "Rate": "0.16",
            "Total": "0.16",
            "Base": "1",
            "IsRetention": "false",
            "IsFederalTax": "true"
        }, ...
    ],
```

## La forma completa del ejemplo es

#### CFDI Factura

```
{
    "Receiver": {
        "Name": "UNIVERSIDAD ROBOTICA ESPAÑOLA",
        "CfdiUse": "G03",
        "Rfc": "URE180429TM6",
        "FiscalRegime": "601",
        "TaxZipCode": "65000"
    },
    "CfdiType": "I",
    "NameId": "1",
    "ExpeditionPlace": "26015",
    "Serie": null,
    "Folio": "V8",
    "PaymentForm": "01",
    "PaymentMethod": "PUE",
    "Exportation": "01",
    "Items": [
        {
            "Quantity": "1",
            "ProductCode": "10111302",
            "UnitCode": "H87",
            "Unit": "Pieza",
            "Description": "producto prueba cfdi4.0",
            "IdentificationNumber": "papc40",
            "UnitPrice": "1.00",
            "Subtotal": "1.00",
            "TaxObject": "02",
            "Taxes": [
                {
                    "Name": "IVA",
                    "Rate": "0.16",
                    "Total": "0.16",
                    "Base": "1",
                    "IsRetention": "false",
                    "IsFederalTax": "true"
                }
            ],
            "Total": "1.16"
        }
    ]
}
```
