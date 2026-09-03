<!-- fuente: https://apisandbox.facturama.mx/guias/validaciones/cfdi-status · capturado 2026-09-03 -->

# Verificar el estado de un CFDI (Vigente, pendiente, cancelado)

	Permite consultar el estado de un CFDI sin importar donde se ha generado el CFDI

	Es decir que no es necesario que sea generado en Facturama

	Cada una de las peticiones a este endpoint consume Folio

#### URL para la petición

#### GET

```
https://apisandbox.facturama.mx/cfdi/status
```

### Parámetros necesarios para la consulta:

* Todos los parámetros son obligatorios

	**uuid**:  ID del comprobante ante el SAT

	**issuerRfc**:  RFC del emisor

	**receiverRfc**:  RFC del receptor

	**total**:  Monto total del comprobante (Incluyendo impuestos)

#### Ejemplo de petición

#### GET

```
https://apisandbox.facturama.mx/cfdi/status?uuid=e3a077e1-1931-452e-b7b3-1e358fc85213&issuerRfc=ROAJ850914837&receiverRfc=XAXX010101000&total=348.00
```

### Datos de la respuesta:

	**Status**:  Estado ante el SAT

	**IsCancelable**:  Leyenda que indica si es cancelable y la condiciones en que sería cancelable

	**Uuid**:  Mismo UUID que se ha ingresado en la petición (corresponde al UUID del comprobante)

#### Ejemplo de respuesta (Vigente)

```
{
    "Status": "Vigente",
    "IsCancelable": "Cancelable sin aceptación",
    "Uuid": "e3a077e1-1931-452e-b7b3-1e358fc85213"
}
```

#### Ejemplo de respuesta (Vigente)

```
{
    "Status": "Vigente",
    "IsCancelable": "Cancelable con aceptación",
    "Uuid": "e3a077e1-1931-452e-b7b3-1e358fc85213"
}
```

#### Ejemplo de respuesta (Cancelado)

```
{
    "Status": "Cancelado",
    "IsCancelable": "Cancelable sin aceptación",
    "Uuid": "d41d89fe-bffc-4067-bda0-91f2ed10b8d3"
}
```

#### Ejemplo de respuesta (No encontrado)

```
{
    "Status": "No Encontrado",
    "IsCancelable": "",
    "Uuid": "e3a077e1-1931-452e-b7b3-1e358fc85213"
}
```
