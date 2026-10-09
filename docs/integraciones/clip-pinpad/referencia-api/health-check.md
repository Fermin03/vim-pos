<!-- fuente: https://developer.clip.mx/reference/health-check · capturado 2026-10-08 -->

---
updatedAt: 2026-02-12T18:58:50.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Health Check

Los Lectores Clip tienen la capacidad de aceptar o rechazar una intención de pago generada por él [POST/ Crear una Intención de Pago](https://developer.clip.mx/reference/post_payment-1), esta decisión se basa en que el Lector Clip pueda encontrarse en dos posibles estados: **Activo** o **Inactivo**.

## Será un Lector Clip Activo cuando

* La app se encuentra abierta esperando recibir una intención de pago.
* La app se encuentra abierta con una transacción finalizada (Ya sea cancelada, rechazada o exitosa).

## &#x20;Será un Lector Clip Inactivo cuando

* La app de PinPad se encuentra cerrada.
* El Lector Clip se encuentra apagado/bloqueado.
* El Lector Clip se encuentra en un proceso de cobro dentro de la app de PinPad (Desde la selección de propinas hasta el procesamiento de la tarjeta).

La generación de la intención de pago será exitosa siempre y cuando el Lector Clip se encuentre activo. Si el Lector Clip se encuentra inactivo y se solicita generar una nueva intención de cobro, él [POST/ Crear una Intención de Pago](https://developer.clip.mx/reference/post_payment-1) devolverá un error.

**Response:** `400 Bad request`

```json
{
   "code": "ERR10_04",
   "name": "STORING PAYMENT - DEVICE UNAVAILABLE",
   "message": "The Clip terminal is either offline, powered off, or the Pinpad    application is closed"
}
```

> 🚧 Importante
>
> Este Health Check es solo válido para la solicitud [POST/ Crear una Intención de Pago](https://developer.clip.mx/reference/post_payment-1)

<br />