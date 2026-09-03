<!-- fuente: https://apisandbox.facturama.mx/Docs-multi · capturado 2026-09-03 -->

-

#

# Guía de uso básico

            El objetivo de esta guía es explicar paso a paso como generar facturas sencillas.

## 1.- Registrarse en Facturama

                Deberás generar una cuenta en

                    [Facturama](https://dev.facturama.mx/api/registro)

                donde deberás completar la información solicitada es importante cargar correctamente tus certificados del sello digital (CSD)

## 2.- Generar token de autentificación

                Para realizar cualquier llamada a nuestra api deberá generar su token de
                [autentificación basic](https://es.wikipedia.org/wiki/Autenticaci%C3%B3n_de_acceso_b%C3%A1sica)
                a partir de su usuario y contraseña

                    "Authorization: Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ=="

## 3.- Carga tus certificados

- [Cargar un nuevo CSD](https://apisandbox.facturama.mx/docs-multi/api/POST-api-lite-csds)

## 4.- Crea tu primer cfdi

- [Emitir un CFDI](https://apisandbox.facturama.mx/docs-multi/api/POST-api-2-cfdis)

## 5.- Descargar el Xml ó el PDF

                    **format**: define el formato del cfdi puede ser "pdf", "html" ó "xml"

                    **type**: tipo de xml debe ser: "issuedLite"

                    **id**: identificador único de la factura

- [Descargar XML](https://apisandbox.facturama.mx/Docs/Api/GET-api-Cfdi-format-type-id)

                    Ejemplo:

                        https://api.facturama.mx/Cfdi/xml/issuedLite/qQfgX3B_t5pUKTBFN3_DTww

** [Ejemplos de CFDI 4.0](https://apisandbox.facturama.mx/docs/examples)**

** [Catálogos de control interno (aparte de los del SAT)](https://apisandbox.facturama.mx/docs/catalogs)**
