<!-- fuente: https://www.mercadopago.com.mx/developers/es/docs/your-integrations/test/cards · capturado 2026-10-08 -->

# Tarjetas de prueba

Mercado Pago proporciona **tarjetas de prueba** que te permitirán probar pagos sin utilizar una tarjeta real.

Sus datos, como número, código de seguridad y fecha de caducidad, pueden ser combinados con los datos relativos al **titular de la tarjeta**, que te permitirán probar distintos escenarios de pago. Es decir, **puedes utilizar la información de cualquier tarjeta de prueba y probar resultados de pago diferentes a partir de los datos del titular**.

A continuación, puedes ver los datos de las **tarjetas de débito y crédito de prueba**. Selecciona aquella que quieras utilizar para probar tu integración.

| Tipo de tarjeta | Bandera | Número | Código de seguridad | Fecha de caducidad |
| --- | --- | --- | --- | --- |
| Tarjeta de crédito | Mastercard | 5474 9254 3267 0366 | 123 | 11/30 |
| Tarjeta de crédito | Visa | 4075 5957 1648 3764 | 123 | 11/30 |
| Tarjeta de crédito | American Express | 3711 803032 57522 | 1234 | 11/30 |
| Tarjeta de débito | Mastercard | 5579 0534 6148 2647 | 123 | 11/30 |
| Tarjeta de débito | Visa | 4189 1412 2126 7633 | 123 | 11/30 |

Luego, elige qué escenario de pago probar, y completa los campos del **titular de la tarjeta** (Nombre y apellido, Tipo y número de documento) según lo indica la tabla a continuación.

| Nombre y apellido del titular | Estado de pago |
| --- | --- |
| `APRO` | Pago aprobado |
| `OTHE` | Rechazado por error general |
| `CONT` | Pendiente de pago |
| `CALL` | Rechazado con validación para autorizar |
| `FUND` | Rechazado por importe insuficiente |
| `SECU` | Rechazado por código de seguridad inválido |
| `EXPI` | Rechazado debido a un problema de fecha de vencimiento |
| `FORM` | Rechazado debido a un error de formulario |
| `CARD` | Rechazado por falta de card\_number |
| `INST` | Rechazado por cuotas invalidas |
| `DUPL` | Rechazado por pago duplicado |
| `LOCK` | Rechazado por tarjeta deshabilitada |
| `CTNA` | Rechazado por tipo de tarjeta no permitida |
| `ATTE` | Rechazado debido a intentos excedidos del pin de la tarjeta |
| `BLAC` | Rechazado por estar en lista negra |
| `UNSU` | No soportado |
| `TEST` | Usado para aplicar regla de montos |
