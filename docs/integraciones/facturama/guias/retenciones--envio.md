<!-- fuente: https://apisandbox.facturama.mx/guias/retenciones/envio · capturado 2026-09-03 -->

# Envío de retención por correo

Aplica para: Factura de retención y Complemento de Servicios para Plataformas Tecnologicas

            Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

**La referencia de esta llamada es:**

-
		[Envia una retencion por Email](https://apisandbox.facturama.mx/docs/api/POST-retenciones-envia_id_email)

#### Enviar una retención por correo

#### POST

```
https://apisandbox.facturama.mx/retenciones/envia?id={id}&email={email}

    Ejemplo:
    https://apisandbox.facturama.mx/retenciones/envia?id=hbPAmkJYETg98XHpq4dASw2&email=chucho@facturama.mx
```

		**{id}**:  Id de la retención, obtenido al momento de [crearla](https://apisandbox.facturama.mx/guias/retenciones) o en el [listado](guias/retenciones/filtrar)

		**{email}**:   Correo del destinatario
