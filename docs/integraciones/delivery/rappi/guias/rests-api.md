
# Introducción

<a href="/es/api-reference/rests-api/" target="_blank" class="api">Referencia de API</a>

Nos complace informarte sobre una actualización en nuestros servicios API que involucra la implementación de nuevos dominios para ciertos endpoints específicos. A partir de ahora, algunos de nuestros servicios API estarán disponibles exclusivamente a través de estos nuevos dominios, mientras que otros seguirán funcionando normalmente con los dominios actuales.

Es importante destacar que los dominios anteriores permanecerán en funcionamiento y continuarán siendo la ruta de acceso para la gran mayoría de nuestros endpoints. Sin embargo, ciertos servicios y funcionalidades específicas requerirán el uso de los nuevos dominios para su acceso.

Rappi te recomienda familiarizarte con la terminología utilizada durante el proceso, los métodos de autenticación, y que conozcas los requisitos para una integración exitosa.

## Dominios por País

Al realizar solicitudes al API, el sistema requiere que especifiques el dominio de tu país.

La siguiente tabla contiene todos los dominios de los países que se utilizan para realizar solicitudes de API:

| País       | URL del Dominio            |
| ---------- | -------------------------- |
| Argentina  | `https://api.rappi.com.ar` |
| Brasil     | `https://api.rappi.com.br` |
| Chile      | `https://api.rappi.cl`     |
| Colombia   | `https://api.rappi.com.co` |
| Costa Rica | `https://api.rappi.co.cr`  |
| Ecuador    | `https://api.rappi.com.ec` |
| Mexico     | `https://api.rappi.com.mx` |
| Peru       | `https://api.rappi.pe`     |
| Uruguay    | `https://api.rappi.com.uy` |

Para propósitos de prueba, utiliza el dominio de desarrollador:

`https://api.dev.rappi.com`

## Reglas de uso para los nuevos Dominios

Para utilizar estos dominios, es importante seguir las siguientes reglas:

### Ruta base común

Todas las llamadas a las API comienzan con la ruta base `/restaurants/{Nombre del modulo}`. Por ejemplo:

- api.rappi.com.co/restaurants/`finance/v1`
- api.rappi.com.mx/restaurants/`finance/v1`

### Token de autenticación

!!! important
Leer información sobre audiencias, para tener un contexto mas amplio de lo que se mencionará <a href="/es/authentication-process/#audiencias" target="_blank">Leer Aquí</a>

!!! important
El marcador {Dominio del país} de la audiencia hace referencia a los siguientes dominios <a href="/es/api-reference/content/#dominios" target="_blank">Leer Aquí</a>

Con los nuevos dominios, aunque previamente se podían utilizar distintas audiencias para la autenticación, ahora se admite únicamente una única audiencia en el token generado. Esta audiencia debe ser exclusivamente `{Dominio del país}/api/v2/restaurants-integrations-public-api`.
