<!-- fuente: https://apisandbox.facturama.mx/guias · capturado 2026-09-03 -->

# Generalidades

La API de facturama permite la creación de CFDIs 4.0 de acuerdo a la normativa del SAT.

- [Tipos de comprobantes soportados](https://apisandbox.facturama.mx/guias#api-comprobantes-soportados)

- [Entornos de la API](https://apisandbox.facturama.mx/guias#api-entornos)

- [Modalidades de la API](https://apisandbox.facturama.mx/guias#api-modalidades)

## Tipos de comprobantes soportados

Un CFDI es un "Comprobante Fiscal Digital por Internet" nuestra API soporta los siguientes tipos:

- Factura

- Nota de Credito

- Honorarios

- Complemento de Pago

- Complemento de impuestos locales (Constructoras, Hospedaje, etc)

- Complemento de donativos

- Complemento de comercio exterior

## Entornos de la API

Los cuales pueden ser consumidas en 2 entornos:

- **Sandbox:** Modo de pruebas, facturas apócrifas

- **Producción:** Modo de timbrado válido ante el SAT

*Las cuentas son independientes entre los entornos, por lo que: **una cuenta creada en el entorno de pruebas, no funcionará en el entorno de producción.**

**Cuenta de Sandbox**

    Una cuenta creada en el entorno "sandbox" puede emplear cualquiera de las 2 modalidades (Web y Multiemisor) sin ningún tipo de trámite, es decir que:

    Puedes observar las virtudes de cada una de las modalidades y crear las facturas necesarias, para probar e implementar en tu sistema.

	[Crea tu cuenta en sandbox aquí](https://dev.facturama.mx/api/registro)

**Cuenta de Producción**

	Una vez que haz realizado la implementación el ambiente sandbox, para poder crear facturas "reales" es decir **con valor fiscal,**

	debes crear tu cuenta en el ambiente productivo y deberás activar la **suscripción de API**.

    En la misma cuenta de API puedes tener activas las 2 modalidades (API Web y API Multiemisor).

	[Crea tu cuenta en productivo aquí](https://app.facturama.mx/web/registro)

## Modalidades de la API

La API de Facturama tiene 2 modalidades:

-
			Facturama ** API Web**

			Con la API web solo tienes un RFC emisor y puedes ver las facturas en la plataforma de facturama

			por ejemplo si tienes una tienda o un solo negocio de que quieres facturar desde la API.

-
			Facturama **API Multiemisor**

			Con la API Multiemisor puedes emitir de varios RFC siempre y cuando tengas "los sellos digitales" pero no puedes ver las facturas generadas en la plataforma
			Por ejemplo si tienes varios negocios (con diferente RFC) de los que requieres facturar mediante la API.

			* Todos los tipos de CFDI y complementos que maneja facturama pueden ser procesados en cualquiera de las modalidades de la API

			(excepto el "Complemento de comercio exterior" que solo está disponible en "API Web").

			** La misma suscripción API  te da acceso a las 2 modalidades de API.

#### Características comunes

- Timbrar - Sellar los CFDI

- Consultar / Cancelar facturas

#### Características de API Web

- Creación de CFDIs con un único emisor, (el propietario de la cuenta, cuyo perfil fiscal se tiene configurado)

- Actualizar información fiscal

- Almacenar tus catálogos de: Productos, Clientes y Sucursales

- Descargar XML y PDF

- Enviar CFDI por correo

- Los catálogos y la información fiscal son visibles y editables mediante la web de Facturama

- Los CFDIs realizados, son visibles mediante la web de Facturama

#### Características de API Multiemisor

- Administrar los Sellos Digitales (CSD) de múltiples RFC

- Creación de CFDIs especificando el emisor, al momento de la creación. (Siempre y cuando previamente sean cargados los certificados correspondientes)

- Descargar XML y PDF

- Enviar CFDI por correo

- Los catálogos y la información fiscal **no** se guarda en Facturama

- Los  CFDIs realizados **no** son visibles mediante la web de Facturama
