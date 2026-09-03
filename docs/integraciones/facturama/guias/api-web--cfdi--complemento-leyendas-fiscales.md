<!-- fuente: https://apisandbox.facturama.mx/guias/api-web/cfdi/complemento-leyendas-fiscales · capturado 2026-09-03 -->

Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

# Complemento de Leyendas fiscales

	El complemento permite incluir en la factura leyendas que son consideradas en las disposiciones fiscales, distintas a las que se mencionan en el estándar técnico del comprobante.

	La creación de un CFDI con el **Complemento de leyendas fiscales** es muy similar a los CFDI básicos:

-  Para API Web [ver en la guía](https://apisandbox.facturama.mx/guias/api-web/cfdi/factura)

-  Para API Multiemisor [ver en la guía](https://apisandbox.facturama.mx/guias/api-multi/cfdi/factura)

	Solo se diferencían en:

-
			La implementación del nodo opcional:

			Para incluir leyendas previstas en disposiciones fiscales, distintas a
			las contenidas en el estándar de Comprobante Fiscal Digital (CFD) o Comprobante
			Fiscal Digital a través de Internet (CFDI).

### Nodo de leyendas fiscales

	**Forma parte del nodo de complementos.**

	**"TaxProvision"** Disposicion Fiscal Atributo opcional para especificar la Ley, Resolución o Disposición fiscal que regula la leyenda, deberá expresarse en siglas de mayúsculas y sin puntuación (p. ej: ISR).

	**"Norm"** Norma Atributo opcional para especificar el número de Artículo o en su caso Regla que regula la obligación de la leyenda.

	**"Text"** Texto Leyenda Atributo requerido para especificar la leyenda fiscal.

	**Nota:** Puedes colcoar más de 1 leyenda fiscal

#### Nodo "TaxLegends"

```
"Complemento": {
		"TaxLegends": {
			"Legends": [{
				"TaxProvision": "F0000001",
				"Norm": "F2654",
				"Text": "EXPORTADOR #####"
			}]
		}
	}
```

## La forma completa del ejemplo en JSON es

#### CFDI Factura

```
{
	"ExpeditionPlace": "78116",
	"Folio": "101",
	"CfdiType": "I",
	"PaymentForm": "01",
	"PaymentMethod": "PUE",
	"Issuer": {
		"FiscalRegime": "601",
		"Rfc": "EKU9003173C9",
		"Name": "Empresa emisora SA de CV"
	},
	"Receiver": {
		"Rfc": "CACX7605101P8",
		"Name": "Púbicio en general",
		"CfdiUse": "P01"
	},
	"Items": [{
		"IdProduct": null,
		"ProductCode": "20102001",
		"IdentificationNumber": "12131312333234234",
		"Description": "(1) Contratación Paquete de facturas  ",
		"Unit": "NO APLICA",
		"UnitCode": "E48",
		"UnitPrice": 129.31,
		"Quantity": 1.0,
		"Subtotal": 129.31,
		"Discount": 64.66,
		"Taxes": [{
			"Total": 10.34,
			"Name": "IVA",
			"Base": 64.65,
			"Rate": 0.160000,
			"IsRetention": false,
			"IsQuota": false
		}],
		"CuentaPredial": null,
		"Total": 74.99
	}],
	"Complemento": {
		"TaxLegends": {
			"Legends": [{
				"TaxProvision": "F0000001",
				"Norm": "F2654",
				"Text": "EXPORTADOR #####"
			}]
		}
	}
}
```
