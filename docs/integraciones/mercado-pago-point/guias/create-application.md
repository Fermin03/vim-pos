<!-- fuente: https://www.mercadopago.com.mx/developers/es/docs/mp-point/create-application · capturado 2026-10-08 -->

# Crear aplicación

Las **aplicaciones** son entidades registradas en Mercado Pago que actúan como identificador único para gestionar la autenticación y autorización de tus integraciones. Representan el vínculo entre tu desarrollo y Mercado Pago y constituyen la primera etapa para llevar a cabo la integración.

Para crear una aplicación, tienes tres opciones disponibles: con un **agente de IA desde tu editor de código**, con el **Asistente de Mercado Pago Developers**, o **manualmente desde el** [Panel de integración](https://www.mercadopago.com.mx/developers/panel/app).

![Tres opciones para crear aplicación](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/images/snippets/create-application/new-create-app-onboarding-es.png)

Puedes utilizar nuestros recursos de IA para crear tu aplicación desde tu IDE o agente en 2 pasos. El agente se encargará de crear la aplicación en el panel de integración y guiarte en toda la configuración.

![Instalación del plugin Mercado Pago](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/images/snippets/create-application/new-create-app-ia-v2-es.png)

Para hacerlo, tienes dos opciones: instalando el [Plugin de Mercado Pago](https://www.mercadopago.com.mx/developers/es/docs/mp-plugin/overview), disponible para Claude Code y Codex, o configurando [Mercado Pago MCP Server](https://www.mercadopago.com.mx/developers/es/docs/mcp-server/overview), disponible para editores como VS Code y Cursor. Sigue las instrucciones según la opción que elijas.

## Plugin

### Claude Code

Ejecuta el siguiente comando para instalar el plugin de Mercado Pago para Claude Code.

```
claude plugin install mercadopago@claude-plugins-official
```

Una vez instalado, ejecuta el comando `/mp-connect` para autorizar el acceso del agente a tu cuenta de Mercado Pago.

### Codex

Ejecuta los siguientes comandos para instalar el plugin de Mercado Pago para Codex.

```
codex plugin marketplace add mercadopago/mercadopago-codex-marketplace
codex plugin add mercadopago@mercadopago-codex-marketplace
```

Una vez instalado, ejecuta el comando `/mp-connect` para autorizar el acceso del agente a tu cuenta de Mercado Pago.

## MCP

### VS Code

Agrega la siguiente configuración a tu archivo `mcp.json`.

```
{
  "mcp": {
    "servers": {
      "mercadopago-mcp-server": {
        "type": "http",
        "url": "https://mcp.mercadopago.com/mcp"
      }
    }
  }
}
```

### Cursor

Agrega la siguiente configuración a tu archivo `mcp.json`.

```
{
  "mcpServers": {
    "mercadopago-mcp-server": {
      "url": "https://mcp.mercadopago.com/mcp"
    }
  }
}
```

Por último, pídele al agente que cree tu aplicación en Mercado Pago. Si lo deseas, puedes copiar y pegar el siguiente _prompt_.

```
Quiero integrar con Mercado Pago. Recomienda la solución de pagos ideal para mi proyecto, crea la aplicación y guíame en la integración.
```

Puedes finalizar la integración con el apoyo de la IA. Si necesitas ayuda, consulta la [guía Integrar con IA](https://www.mercadopago.com.mx/developers/es/docs/ai-resources).

En [Tus integraciones](https://www.mercadopago.com.mx/developers/panel/app) podrás consultar el listado de todas tus aplicaciones creadas y acceder a los [Datos de integración](https://www.mercadopago.com.mx/developers/es/docs/mp-point/resources/application-details) de cada una de ellas.

Puedes editar o eliminar una aplicación. En este último caso, debes tener en cuenta que tu tienda perderá la capacidad de utilizar nuestros recursos o de recibir pagos a través de la integración con Mercado Pago asociada a esa aplicación. Para más información, consulta los [Datos de integración](https://www.mercadopago.com.mx/developers/es/docs/mp-point/resources/application-details).

## Acceder a las credenciales de prueba

Después de crear tu aplicación, se crearán automáticamente las credenciales de prueba, que deberás utilizar para realizar todas las configuraciones y validaciones necesarias en un entorno seguro de pruebas. Si, en cambio, estás utilizando una aplicación ya existente, será necesario [activar las credenciales de prueba](https://www.mercadopago.com.mx/developers/es/docs/mp-point/resources/credentials).

Al acceder a estas credenciales, se mostrarán las siguientes claves: Public Key y el Access Token de prueba. El _Access Token_ de prueba comienza con el prefijo `APP_USR`, al igual que tu _Access Token_ productivo.

![credenciales de test](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/images/qr-orders/credentials-test-panel-es-v1.png)

Para desarrollar tu integración con Mercado Pago Point, utiliza tu Access Token de prueba.

Si estás integrando el Mercado Pago Point en nombre de un tercero, se recomienda utilizar el **_Access Token_ de prueba** durante todo el desarrollo y pruebas de la integración. Antes de [salir a producción](https://www.mercadopago.com.mx/developers/es/docs/mp-point/go-to-production), será necesario obtener un _Access Token_ de producción mediante el protocolo OAuth (flujo [Authorization code](https://www.mercadopago.com.mx/developers/es/docs/security/oauth/creation#bookmark_authorization_code)) y reemplazarlo.

Una vez obtenidas las credenciales necesarias, podrás continuar con la configuración de los terminales.
