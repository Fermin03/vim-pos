<!-- fuente: https://apisandbox.facturama.mx/guias/retenciones20 · capturado 2026-09-03 -->

# Comprobante de retenciones e información de pagos 2.0

	El contribuyente que emita comprobantes fiscales digitales a través de Internet que amparen retenciones e información de pagos

	**La estructura estándar de un comprobante de retenciones se muestra en esta sección**

#### URL para crear una retención 2.0

#### POST

```
https://apisandbox.facturama.mx/2/retenciones
```

### Generales

	FolioInt:  Folio interno

	Atributo opcional para control interno del contribuyente que expresa el folio del documento que ampara la retención e información de pagos.

	Permite números y/o letras.

	Puede ser conceptualmente:

- Numérico (de 1 a 10 caracteres): Contiene exclusivamente números,
 ejemplo: "238746"

- Alfanumérico (de 1 a 20 caracteres) : Formado por letras y números conjuntamente, no puede contener el caracter "pipe" (|),
 ejemplo: "vLDZ-Ve1RBy_SAuej5of"

	En ambos casos se colocan en éste atributo, la diferencia está en que:

	Para hacer uso de las [consultas de CFDI por intervalo de folios](https://apisandbox.facturama.mx/guias/retenciones/filtrar) será necesario que el folio sea numérico, ya que los alfanuméricos no serán considerados.

	FechaExp:  Fecha de expedición

	Atributo requerido para la expresión de la fecha y hora de expedición del documento de retención e información de pagos.

	Se expresa en la forma yyyy-mmddThh:mm:ssTZD-6, de acuerdo con la especificación ISO 8601.

	CveRetenc:  Clave de la retención

	Atributo requerido para expresar la clave de la retención e
	información de pagos de acuerdo al catálogo publicado en internet por el SAT.

		Puedes encontrar los catálogos de retenciones en:
		[éste enlace](http://omawww.sat.gob.mx/tramitesyservicios/Paginas/CFDI_retenciones.htm)

	LugarExpRetenc:  Codigo postal del lugar de expedición

	Se debe registrar el código postal del lugar de expedición del comprobante que ampara retenciones e información de pagos, debe corresponder con una clave de código postal vigente incluida en el catálogo de CFDI

	DescRetenc:  Descripción de la retención

	Se debe registrar la descripción por la que se hace la retención e información de pagos cuando en el campo CveRetenc se haya registrado la clave de retención "25" (otro tipo de retenciones), puede conformarse de 1 a 100 caracteres

#### Generales

```
"FolioInt": "A0001",
    "FechaExp": "2023-05-02T08:08:01",
    "CveRetenc": "01",
    "LugarExpRetenc": "26015",
```

### Emisor

	Nodo requerido para expresar la información del contribuyente emisor del documento electrónico de retenciones e información de pagos.

	RFCEmisor:

	Atributo requerido para incorporar la clave en el Registro Federal de Contribuyentes
 correspondiente al
	contribuyente emisor del documento de retención e información de pagos, sin guiones o espacios.

	NomDenRazSocE:  Nombre, denominación o razon social

	Se debe registrar el nombre, denominación o razón social del emisor inscrito en el RFC, del comprobante que ampara retenciones e información de pagos

	El Nombre debe corresponder a la clave de RFC registrado en el campo Rfc de este Nodo

	RegimenFiscalE:  Regimen fiscal del emisor

	Se debe registrar la clave vigente del régimen del contribuyente emisor

#### Datos del emisor

```
"Emisor": {
        "RFCEmisor": "EKU9003173C9",
        "NomDenRazSocE": "ESCUELA KEMPER URGATE",
        "RegimenFiscalE": "601"
    },
```

### Receptor

	Nodo requerido para expresar la información del contribuyente receptor.

	Nota: Solo lleva uno de los nodos (Nacional o Extranjero), de acuerdo a lo que se ha especificado en "Nacionalidad"

	Nacionalidad:

	[Nacional|Extranjero]

	Nacional:  Nodo requerido para expresar la información del contribuyente receptor en caso de que sea de nacionalidad mexicana

	RfcRecep:

	Atributo requerido para la clave del Registro Federal de Contribuyentes correspondiente al contribuyente receptor	del documento.

	NomDenRazSocR:

	Se debe registrar el(los) nombre(s), primer apellido, segundo apellido, según corresponda denominación o razón social del receptor del comprobante que ampara retenciones e información de pagos, puede conformarse de 1 a 254 caracteres

	DomicilioFiscalR:

	Se debe registrar el código postal del domicilio fiscal del receptor del comprobante.

	El código postal debe estar asociado a la clave de RFC registrado en el campo Rfc de este Nodo

	CURPR:

	Atributo opcional para la Clave Única del Registro Poblacional del contribuyente receptor del documento.

#### Receptor nacional

```
"Receptor": {
        "Nacionalidad": "Nacional",
        "Nacional": {
            "RFCRecep": "CACX7605101P8",
            "NomDenRazSocR": "XOCHILT CASAS CHAVEZ",
            "DomicilioFiscalR": "10740"
        }
    },
```

	Extranjero:  Nodo requerido para expresar la información del contribuyente receptor del documento cuando sea residente en el extranjero

	NumRegldTrib:

	Número de registro de identificación fiscal del receptor del CFDI, cuando este sea un residente en
	el extranjero, puede conformarse de 1 a 20 caracteres.

	NomDenRazSocR:

	Atributo opcional para el nombre, denominación o razón social del contribuyente receptor del documento.

#### Receptor extranjero

```
"Receptor": {
      "Nacionalidad": "Extranjero",
      "Extranjero": {
        "NumRegldTrib": "12356789123544",
        "NomDenRazSocR": "La Pallmmera extranjera S A de C V",
      }
```

### Ejemplo completo en JSON

#### Ejemplo completo en JSON

```
{
    "FolioInt": "0001",
    "FechaExp": "2022-06-13T08:08:01",
    "CveRetenc": "01",
    "LugarExpRetenc": "26015",
    "Emisor": {
        "RFCEmisor": "EKU9003173C9",
        "NomDenRazSocE": "ESCUELA KEMPER URGATE",
        "RegimenFiscalE": "601"
    },
    "Receptor": {
        "Nacionalidad": "Nacional",
        "Nacional": {
            "RFCRecep": "CACX7605101P8",
            "NomDenRazSocR": "XOCHILT CASAS CHAVEZ",
            "DomicilioFiscalR": "10740"
        }
    },
    "Periodo": {
        "MesIni": "01",
        "MesFin": "01",
        "Ejerc": "2021"
    },
    "Totales": {
        "montoTotOperacion": "1681.06",
        "montoTotGrav": "1681.06",
        "montoTotExent": "0.00",
        "montoTotRet": "151.29",
        "ImpRetenidos": [
            {
                "BaseRet": "1681.06",
                "Impuesto": "01",
                "MontoRet": "16.81",
                "TipoPagoRet": "04"
            },
            {
                "BaseRet": "268.96",
                "Impuesto": "02",
                "MontoRet": "134.48",
                "TipoPagoRet": "01"
            }
        ]
    }

}
```
