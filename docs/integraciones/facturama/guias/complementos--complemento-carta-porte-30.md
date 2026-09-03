<!-- fuente: https://apisandbox.facturama.mx/guias/complementos/complemento-carta-porte-30 · capturado 2026-09-03 -->

# Complemento carta porte 3.0

    **¡IMPORTANTE!**

    El complemento Carta Porte versión 3.0, se publicó en el Portal del SAT en el mes de septiembre de 2023.

    El complemento Carta Porte versión 3.0, debe ser utilizado a partir del 25 de noviembre de 2023, sin embargo, de acuerdo con lo establecido en el Segundo Transitorio de la Octava Resolución de Modificaciones a la Resolución Miscelánea Fiscal para 2023 se cuenta con un periodo de convivencia con la versión 2.0 del complemento, hasta el 31 de diciembre de 2023.

    Se define como periodo de transición para emitir correctamente el complemento Carta Porte en su versión 2.0, sin que se apliquen multas ni sanciones.En el caso de la versión 3.0 el periodo dentro del cual se otorga dicha facilidad comprende del 25 de noviembre al 31 de diciembre de 2023.

    En operaciones de comercio exterior, la factura con complemento Carta Porte será exigible a partir del 01 de enero de 2024.

	El complemento Carta Porte se incorpora al CFDI de tipo Traslado para acreditar la posesión de las mercancías, brindando información sobre la procedencia y los destinos de las mercancías que se trasladan a través de los distintos medios de transporte.

	Los contribuyentes que brindan servicios de traslado de mercancías por los distintos medios de transporte, podrán emitir un CFDI de tipo Ingreso incorporando el complemento Carta Porte, con el que se podrá amparar la legal posesión de las mercancías.

	[Ver preguntas frecuentes de carta porte del SAT](http://omawww.sat.gob.mx/tramitesyservicios/Paginas/documentos/Preguntas_frecuentes_CartaPorte.pdf)

## Nombre del CFDI

La carta porte 3.0 debe llevar en el campo: ** NameId** el valor **35** en la sección  "Datos genearales del CFDI" [ver en la guía](https://apisandbox.facturama.mx/guias/api-web/cfdi/factura)

#### Nombre del CFDI

```
"CfdiType": "I",
    "NameId": "35",
    "ExpeditionPlace": "78240",
    "PaymentForm" : "03",
    "PaymentMethod" : "PUE",
```

## Nodo Complemento CartaPorte

        Sección para incorporar al Comprobante Fiscal Digital por Internet (CFDI),
        la información relacionada a los bienes o mercancías, ubicaciones de
        origen, puntos intermedios y destino, así como lo referente al medio por el
        que se transportan; ya sea por vía terrestre (carretera federal o líneas
        férreas), aérea, marítima o fluvial; además de incluir el traslado de
        Hidrocarburos y Petrolíferos.

        Para emplear el nodo Carta Porte el CFDI debe ser del tipo "I" (ingreso) ó "T" (traslado)

        **TranspInternac: ** Campo requerido para registrar si los bienes o mercancías que son transportadas, ingresan o salen del territorio nacional. Solo se pueden registrar los valores "Si" o "No"

        **Ubicaciones (nodo): ** Sección requerida para registrar las distintas ubicaciones que sirven para reflejar el domicilio del origen y/o destino que tienen los bienes o mercancías que se trasladan por distintos medios de transporte.

        **Mercancias (nodo): ** Sección requerida para registrar la información de los bienes o mercancías que se trasladan en los distintos medios de transporte.

        **FiguraTransporte (nodo): ** Sección requerida para registrar los datos de la figura del transporte que interviene en el traslado de los bienes o mercancías, cuando el dueño del medio de transporte es diferente del emisor del comprobante con el complemento Carta Porte.

#### Nodo "Complemento"

```
"Complemento": {
        "CartaPorte30": {
            "TranspInternac": "No",
            "Ubicaciones": [
            ],
            "Mercancias": {
            },
            "FiguraTransporte": {
            }
        }
    }
```

## Nodo "Ubicaciones"

Complemento > CartaPorte > Ubicaciones

	Arreglo donde para cada "Ubicación"

	Sección requerida para registrar la ubicación que sirve para reflejar el domicilio del origen y/o destino parcial o final que tienen los bienes o mercancías que se trasladan por distintos medios de transporte.

	En esta sección se especifica el domicilio, mismo que puede corresponder a Origen y Destino, cuando éste es un punto intermedio en la ruta del traslado de las mercancías. Cuando el Origen y Destino tienen diferentes domicilios se debe registrar una sección Ubicación para cada uno de ellos con su correspondiente domicilio.

	En el caso de las secciones AutotransporteFederal, TransporteMaritimo y TransporteAereo de la sección Mercancias, al menos deben existir 2 secciones Ubicación, para el registro de la sección Origen y Destino, respectivamente.

#### Nodo "Ubicaciones"

```
"Ubicaciones": [
                {
                    "TipoUbicacion": "Origen",
                    "IDUbicacion": "OR101010",
                    "FechaHoraSalidaLlegada": "2022-05-16 15:15",
                    "RFCRemitenteDestinatario": "EKU9003173C9",
                    "Domicilio": {
                        "Pais": "MEX",
                        "CodigoPostal": "78000",
                        "Estado": "SLP",
                        "Municipio": "028",
                        "Localidad": "05"
                    }
                },
                {
                    "TipoUbicacion": "Destino",
                    "IDUbicacion": "DE202020",
                    "FechaHoraSalidaLlegada": "2022-05-16 15:14",
                    "DistanciaRecorrida": "1",
                    "RFCRemitenteDestinatario": "XAXX010101000",
                    "Domicilio": {
                        "Pais": "MEX",
                        "CodigoPostal": "78000",
                        "Estado": "SLP",
                        "Municipio": "028",
                        "Localidad": "05"
                    }
                }
            ],
```

## Nodo "Mercancias"

Complemento > CartaPorte > Mercancias

	Sección requerida para registrar la información de los bienes o mercancías que se trasladan en los distintos medios de transporte.

	Se debe validar que al menos se registre una sección AutortransporteFederal, TransporteMaritimo, TransporteAereo o TransporteFerroviario en esta sección

#### Nodo "Mercancias"

```
"Mercancias":
            {
                "UnidadPeso": "KGM",
                "LogisticaInversaRecoleccionDevolucion":"Sí",
                "Mercancia":
                [
                    {
                        "FraccionArancelaria": "6309000100",
                        "FolioImpoVUCEM": "1",
                        "PermisoImportacion": "2",
                        "SectorCOFEPRIS": "01",
                        "TipoMateria": "05",
                        "DescripcionMateria": "otramateria",
                        "BienesTransp": "11121900",
                        "Descripcion": "Accesorios de equipo de telefonía",
                        "Cantidad": "1.0",
                        "ClaveUnidad": "XBX",
                        "MaterialPeligroso": "No",
                        "PesoEnKg": "1",
                        "DenominacionGenericaProd": "DenominacionGenericaProd1",
                        "DenominacionDistintivaProd": "DenominacionDistintivaProd1",
                        "Fabricante": "Fabricante1",
                        "FechaCaducidad": "2003-04-02",
                        "LoteMedicamento": "LoteMedic1",
                        "FormaFarmaceutica": "01",
                        "CondicionesEspTransp": "01",
                        "RegistroSanitarioFolioAutorizacion": "RegistroSanita1",
                        "DocumentacionAduanera": [
                            {
                                "TipoDocumento": "01",
                                "NumPedimento": "23  43  0472  8000448",
                                "RFCImpo": "EKU9003173C9"
                            }
                        ],
                        "CantidadTransporta": [
                            {
                                "Cantidad": "1",
                                "IDOrigen": "OR101010",
                                "IDDestino": "DE202020"
                            }
                        ]
                    }
                ],
                "Autotransporte":
                {
                    "PermSCT": "TPAF01",
                    "NumPermisoSCT": "NumPermisoSCT1",
                    "IdentificacionVehicular":
                    {
                        "ConfigVehicular": "VL",
                        "PesoBrutoVehicular": "1",
                        "PlacaVM": "plac892",
                        "AnioModeloVM": "2020"
                    },
                    "Seguros":
                    {
                        "AseguraRespCivil": "AseguraRespCivil",
                        "PolizaRespCivil": "123456789"
                    },
                    "Remolques":
                    [
                        {
                            "SubTipoRem": "CTR004",
                            "Placa": "VL45K98"
                        }
                    ]
                }
            },
```

## Nodo "FiguraTransporte"

Complemento > CartaPorte > FiguraTransporte

    Nodo condicional para indicar los datos de la(s) figura(s) del transporte que interviene(n) en el traslado de los bienes y/o mercancías realizado a través de los distintos medios de transporte dentro del territorio nacional, cuando el dueño de dicho medio sea diferente del emisor del comprobante con el complemento Carta Porte.

    **TipoFigura: ** Atributo requerido para registrar la clave de la figura de transporte que interviene en el traslado de los bienes y/o mercancías.,
    *Los campos marcados con asterisco son obligatorios.
    c_FiguraTransporte, publicado en el portal del SAT, que identifica el medio por el cual se transportan los bienes o mercancías.

    **NombreFigura: ** Atributo requerido para registrar el nombre de la figura de transporte que interviene en el traslado de los bienes y/o mercancías.

#### Nodo "FiguraTransporte"

```
"FiguraTransporte":
            [
                {
                    "TipoFigura": "01",
                    "RFCFigura": "EKU9003173C9",
                    "NumLicencia": "NumLicencia1",
                    "NombreFigura": "NombreFigura1",
                    "Domicilio": {
                        "Calle": "Calle1",
                        "NumeroExterior": "NumeroExterior1",
                        "NumeroInterior": "NumeroInterior1",
                        "Colonia": "Colonia1",
                        "Localidad": "Localidad1",
                        "Referencia": "Referencia1",
                        "Municipio": "Municipio1",
                        "Estado": "Estado1",
                        "Pais": "AFG",
                        "CodigoPostal": "CodigoPosta1"
                    }
                }
            ]
```

## La forma completa del ejemplo es

#### Carta porte - traslado - autotransporte federal

```
{
    "Receiver": {
        "Name": "ESCUELA KEMPER URGATE",
        "CfdiUse": "S01",
        "Rfc": "EKU9003173C9",
        "FiscalRegime": "601",
        "TaxZipCode": "42501"
    },
    "CfdiType": "T",
    "NameId": "35",
    "ExpeditionPlace": "78000",
    "Exportation": "01",
    "Items": [
        {
            "Quantity": "1",
            "ProductCode": "50201706",
            "UnitCode": "KGM",
            "Unit": "Kilogramo",
            "Description": "Cafe molido",
            "IdentificationNumber": "cafemol",
            "UnitPrice": "20.00",
            "Subtotal": "20.00",
            "TaxObject": "01",
            "Total": "20.00"
        },
        {
            "CuentaPredial": "122",
            "Quantity": "1",
            "ProductCode": "50201712",
            "UnitCode": "KGM",
            "Unit": "Kilogramo",
            "Description": "Bebidas de té",
            "IdentificationNumber": "bebidate",
            "UnitPrice": "30.00",
            "Subtotal": "30.00",
            "TaxObject": "01",
            "Total": "30.00"
        }
    ],
    "Complemento": {
        "CartaPorte30": {
            "ViaEntradaSalida": "01",
            "TranspInternac": "Sí",
            "RegimenAduanero": "IMD",
            "EntradaSalidaMerc": "Entrada",
            "PaisOrigenDestino": "AFG",
            "RegistroISTMO":"Sí",
            "UbicacionPoloOrigen":"01",
            "UbicacionPoloDestino":"01",
            "Ubicaciones": [
                {
                    "TipoUbicacion": "Origen",
                    "IDUbicacion": "OR101010",
                    "FechaHoraSalidaLlegada": "2022-05-16 15:15",
                    "RFCRemitenteDestinatario": "EKU9003173C9",
                    "Domicilio": {
                        "Pais": "MEX",
                        "CodigoPostal": "78000",
                        "Estado": "SLP",
                        "Municipio": "028",
                        "Localidad": "05"
                    }
                },
                {
                    "TipoUbicacion": "Destino",
                    "IDUbicacion": "DE202020",
                    "FechaHoraSalidaLlegada": "2022-05-16 15:14",
                    "DistanciaRecorrida": "1",
                    "RFCRemitenteDestinatario": "XAXX010101000",
                    "Domicilio": {
                        "Pais": "MEX",
                        "CodigoPostal": "78000",
                        "Estado": "SLP",
                        "Municipio": "028",
                        "Localidad": "05"
                    }
                }
            ],
            "Mercancias":
            {
                "UnidadPeso": "KGM",
                "LogisticaInversaRecoleccionDevolucion":"Sí",
                "Mercancia":
                [
                    {
                        "FraccionArancelaria": "6309000100",
                        "FolioImpoVUCEM": "1",
                        "PermisoImportacion": "2",
                        "SectorCOFEPRIS": "01",
                        "TipoMateria": "05",
                        "DescripcionMateria": "otramateria",
                        "BienesTransp": "11121900",
                        "Descripcion": "Accesorios de equipo de telefonía",
                        "Cantidad": "1.0",
                        "ClaveUnidad": "XBX",
                        "MaterialPeligroso": "No",
                        "PesoEnKg": "1",
                        "DenominacionGenericaProd": "DenominacionGenericaProd1",
                        "DenominacionDistintivaProd": "DenominacionDistintivaProd1",
                        "Fabricante": "Fabricante1",
                        "FechaCaducidad": "2003-04-02",
                        "LoteMedicamento": "LoteMedic1",
                        "FormaFarmaceutica": "01",
                        "CondicionesEspTransp": "01",
                        "RegistroSanitarioFolioAutorizacion": "RegistroSanita1",
                        "DocumentacionAduanera": [
                            {
                                "TipoDocumento": "01",
                                "NumPedimento": "23  43  0472  8000448",
                                "RFCImpo": "EKU9003173C9"
                            }
                        ],
                        "CantidadTransporta": [
                            {
                                "Cantidad": "1",
                                "IDOrigen": "OR101010",
                                "IDDestino": "DE202020"
                            }
                        ]
                    }
                ],
                "Autotransporte":
                {
                    "PermSCT": "TPAF01",
                    "NumPermisoSCT": "NumPermisoSCT1",
                    "IdentificacionVehicular":
                    {
                        "ConfigVehicular": "VL",
                        "PesoBrutoVehicular": "1",
                        "PlacaVM": "plac892",
                        "AnioModeloVM": "2020"
                    },
                    "Seguros":
                    {
                        "AseguraRespCivil": "AseguraRespCivil",
                        "PolizaRespCivil": "123456789"
                    },
                    "Remolques":
                    [
                        {
                            "SubTipoRem": "CTR004",
                            "Placa": "VL45K98"
                        }
                    ]
                }
            },
            "FiguraTransporte":
            [
                {
                    "TipoFigura": "01",
                    "RFCFigura": "EKU9003173C9",
                    "NumLicencia": "NumLicencia1",
                    "NombreFigura": "NombreFigura1",
                    "Domicilio": {
                        "Calle": "Calle1",
                        "NumeroExterior": "NumeroExterior1",
                        "NumeroInterior": "NumeroInterior1",
                        "Colonia": "Colonia1",
                        "Localidad": "Localidad1",
                        "Referencia": "Referencia1",
                        "Municipio": "Municipio1",
                        "Estado": "Estado1",
                        "Pais": "AFG",
                        "CodigoPostal": "CodigoPosta1"
                    }
                }
            ]
        }
    },
}
```
