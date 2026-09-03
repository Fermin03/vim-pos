<!-- fuente: https://apisandbox.facturama.mx/docs/api/GET-Catalogs-Currencies_keyword · capturado 2026-09-03 -->

-

# Catalogo de monedas

### Parámetros URI

keyword  **(
string
 )**

Palabra clave (opcional)

**
**

  Default value is

### Atributos de la petición

La petición no tiene atributos

### Argumentos de respuesta

        Atributos de
[CurrencyCatalog](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=CurrencyCatalog)

Decimals  **(
decimal number
 )**

**
**

PrecisionRate  **(
decimal number
 )**

**
**

Name  **(
string
 )**

Nombre de la propiedad

**
**

Value  **(
string
 )**

Valor de la propiedad

**
**

#### http method:

#### GET

**https://apisandbox.facturama.mx/Catalogs/Currencies?keyword={keyword}**

## Ejemplo de Respuesta

#### application/json, text/json

                **Ejemplo:**

```
[
  {
    "Decimals": 2.0,
    "PrecisionRate": 35.0,
    "Name": "Peso Mexicano",
    "Value": "MXN"
  },
  {
    "Decimals": 0.0,
    "PrecisionRate": 35.0,
    "Name": "Peso Uruguay en Unidades Indexadas (URUIURUI)",
    "Value": "UYI"
  }
]
```
