<!-- fuente: https://developer.clip.mx/reference/referencia-postback-webhook · capturado 2026-10-08 -->

---
updatedAt: 2025-09-29T20:20:18.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Postback Webhooks

# Prerrequisitos para las notificaciones Postback:

* Crear un URL del endpoint para recibir la notificación.
* Configurar las notificaciones de pago por Postback en el dashboard de la cuenta Clip.

# Configuración de las notificaciones de pago por Postback Webhooks

Para configurar las notificaciones de Postback Webhooks, realiza los siguientes pasos:

1. Ingresa al [Panel de Desarrollador](https://dashboard.developer.clip.mx/)

<Image title="Inicio de sesion.png" alt={591} align="center" width="smart" src="https://files.readme.io/e1e6a4d-Inicio_de_sesion.png">
  Pantalla de inicio de sesión del Panel de Desarrollador.
</Image>

2. Dirígete a la sección de Postback Webhook, en el menú lateral a la izquierda.

<Image title="Menu lateral-Postback.png" alt={261} align="center" width="smart" src="https://files.readme.io/710be5a-Menu_lateral-Postback.png">
  Menú lateral Postback Webhooks.
</Image>

3. Ingresa la URL del endpoint que recibirá las notificaciones y da click en el botón **Guardar**.

<Image title="URL-Postback.png" alt={721} align="center" width="smart" src="https://files.readme.io/cd5ff5e-URL-Postback.png">
  Ventana de Configuración de Postback Webhook.
</Image>

4. Desliza el botón en la parte inferior para **Activar recepción de notificaciones**.

<Image title="Activar-recepcion-notificaciones.png" alt={733} align="center" src="https://files.readme.io/8ea9ab5-Activar-recepcion-notificaciones.png">
  Ventana de Configuración de Postback Webhook.
</Image>

5. Puedes enviar una notificación de prueba para verificar que la configuración de las notificaciones ha quedado activada correctamente.

<Image title="Notificacion-prueba.png" alt={707} align="center" src="https://files.readme.io/6286eea-Notificacion-prueba.png">
  Sección de notificación de prueba habilitada después de configurar la URL.
</Image>

> 📘 Nota
>
> El contenido de la respuesta se envía en formato JSON. Consulta los tipos de notificaciones y sus respuestas en la secciones listadas en el apartado **Continuar leyendo**.