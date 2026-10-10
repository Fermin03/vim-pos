<!-- fuente: https://developer.clip.mx/docs/api-de-pinpad · capturado 2026-10-08 -->

---
updatedAt: 2026-02-18T23:08:38.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# API de PinPad

La API de PinPad de Clip permite que aplicaciones que no corren en Android inicien y gestionen cobros desde un backend.

Cuando tu sistema crea un intento de pago, el dispositivo Clip POS despierta, procesa la transacción y envía el resultado de vuelta mediante un webhook.

## Casos de uso principales

* Comercios con sistemas de backend que necesitan comenzar cobros en terminales físicas.
* Escenarios desatendidos o de autoservicio (modo kiosco).
* Negocios que requieren dividir un pago en varias tarjetas o incluir propinas personalizadas.
* Evitar errores humanos al insertar datos de pago y automatización del flujo de pago.

<Image align="center" src="https://files.readme.io/690a3b955003f90770cddb1b35b7ae078ea07b39fd462db351083f1b2d72c92b-Captura_de_pantalla_2026-02-18_a_las_5.07.57_p.m..png" />

## Características importantes

* **Multiplataforma:** Adecuado para cualquier plataforma.
* **Integración con el Backend:** Las transacciones se inician y gestionan a través de sistemas de backend.
* **Comunicación Inalámbrica:** No se necesita conexión física entre el backend y el dispositivo Clip.
* **Notificaciones en Tiempo Real:** Las actualizaciones de transacciones se envían instantáneamente a través de webhooks.
* **Integración Sencilla:** Integra fácilmente el procesamiento de pagos de Clip en tu aplicación con un esfuerzo mínimo.
* **Transacciones Seguras:** Todas las transacciones están protegidas con cifrado estándar de la industria y cumplen con los requisitos de PCI DSS.
* **Contar con red una WiFi estable mínimo 10MB/s**