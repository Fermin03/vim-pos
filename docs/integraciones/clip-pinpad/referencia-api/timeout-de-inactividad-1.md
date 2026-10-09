<!-- fuente: https://developer.clip.mx/reference/timeout-de-inactividad-1 · capturado 2026-10-08 -->

---
updatedAt: 2026-07-16T00:36:27.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Timeout de inactividad

En algunos casos de uso es necesario que una orden que se encuentra en proceso de cobro dentro de la terminal pueda cancelarse automáticamente después de cierto lapso de tiempo. Para este tipo de situaciones se ha habilitado esta preferencia **timeout de inactividad**.

Al agregar esta preferencia ligada a una terminal dicho dispositivo tendrá la capacidad de cancelar automáticamente la orden después del tiempo que tiene definido Clip por default para una correcta operación (1 minuto). Es decir, si defines un timeout de 20 segundos la orden se cancelará 1 minuto y 20 segundos después de no detectar alguna actividad dentro de la transacción.<br />

El timeout de inactividad se ejecutará en pasos anteriores al insertarse/acercar una tarjeta. En pasos posteriores (vista de error o vistas de pago exitoso) la cancelación o continuación del flujo se debe realizar manualmente.

<Callout icon="🚧" theme="warn">
  ### Importante

  Esta preferencia solamente se activará en pagos que no sean cuentas divididas.
</Callout>

<Callout icon="📘" theme="info">
  ### ¿Necesitas Ayuda?

  Si lo que buscas no está documentado, contáctanos por el siguiente medio:

  - Envía un correo electrónico a la dirección [sdk@payclip.com](mailto:sdk@payclip.com).
</Callout>

<br />