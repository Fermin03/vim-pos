
# Introducción

Esta página explica cómo los desarrolladores pueden comenzar a usar las APIs de Rappi para la integración con restaurantes.

<aside class="notice">
    <p>NOTA</p>
    Estamos en proceso de mejorar nuestras APIs públicas, por lo que te pedimos que siempre estés atento a nuestra documentación oficial.
</aside>

## Requisitos de Integración

Dado que la integración con nuestra API requiere contacto directo con nuestro equipo, sigue estos pasos para comenzar.

### 1. Contacto Inicial

Para conocer los pasos para registrarte como aliado de Rappi, comunícate con tu principal punto de contacto en Rappi.

### 2. Creación de Credenciales

Una vez que tu solicitud sea aprobada, recibirás credenciales de acceso a nuestro entorno de pruebas.

### 3. Revisión de Documentación

Antes de comenzar el desarrollo, recomendamos revisar los siguientes recursos:

- [Documentación de referencia de la API](https://dev-portal.rappi.com/es/content)
- [Guía de autenticación](/es/api-reference/authentication)

### 4. Consideraciones para esta API

Esta documentación de referencia de la API está diseñada para ayudarte a comprender los endpoints disponibles, sus parámetros y cómo usarlos de manera efectiva. Incluye descripciones detalladas de cada endpoint, incluidos los formatos de solicitud y respuesta, parámetros requeridos y ejemplos.

También proporciona información sobre cómo autenticar tus solicitudes, manejar errores y gestionar la paginación.

### 4.1 Etiquetas de Endpoints

- `NEW`: Esta etiqueta indica que el endpoint es nuevo.
- `STABLE`: Esta etiqueta indica que el endpoint es estable y ha estado en uso durante mucho tiempo. Se recomienda utilizar endpoints estables en las integraciones.
- `DEPRECATED`: Esta etiqueta indica que el endpoint está obsoleto y puede eliminarse en futuras versiones de la API. Se recomienda evitar el uso de endpoints obsoletos en nuevas integraciones.

### 4.2 Deprecación de Endpoints

Los endpoints que están marcados como `DEPRECATED` seguirán funcionando durante un período de tiempo, pero pueden eliminarse en futuras versiones de la API. Recomendamos evitar el uso de endpoints obsoletos en nuevas integraciones y migrar a endpoints estables o nuevos lo antes posible.

### 5. Pruebas en el Entorno de Desarrollo

Después de registrarte como aliado integrado de Rappi, recibirás tus credenciales de Rappi, que consisten en lo siguiente:

- `client_id`
- `client_secret`

Usa estas credenciales de Rappi para crear tu Access Token con el endpoint [`POST token/login/integrations`](/es/api-reference/authentication/#post-login-de-integraciones).

Una vez que hayas generado tu Access Token, puedes comenzar a usar la API de Rappi.
