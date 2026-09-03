<!-- fuente: https://apisandbox.facturama.mx/guias/nominas/incapacidad · capturado 2026-09-03 -->

# Nomina de Incapacidad

            Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

    Los comprobantes fiscales deben emitirse por los actos o actividades que se realicen, por los ingresos que perciban
 o por las
    retenciones de contribuciones que efectúen los contribuyentes ya sean personas físicas o personas morales.

    La estructura básica de un CFDI de Nómina se muestra en esta sección

    Sin embargo el CFDI de nómina se puede aplicar a conceptos adicionales al sueldo

    Ejemplos de CFDI de Nómina adicionales

- [Nomina con subsidio](https://apisandbox.facturama.mx/guias/nominas/subsidio)

- [Nomina con horas extra](https://apisandbox.facturama.mx/guias/nominas/horas-extra)

- [Incapacidad](https://apisandbox.facturama.mx/guias/nominas/incapacidad)

- [Indemnización](https://apisandbox.facturama.mx/guias/nominas/indemnizacion)

- [Jubilación](https://apisandbox.facturama.mx/guias/nominas/jubilacion)

### Componentes de la Nómina

#### Percepciones

```
"Incapacities": [
        {
          "Days": 5,
          "Type": "02",
          "Amount": 1000
        }
      ]
```

#### Percepciones

```
"Incapacities": [
        {
          "Days": 5,
          "Type": "02",
          "Amount": 1000
        }
      ]
```

#### Percepciones

```
"Incapacities": [
        {
          "Days": 5,
          "Type": "02",
          "Amount": 1000
        }
      ]
```

#### Percepciones

```
"Incapacities": [
        {
          "Days": 5,
          "Type": "02",
          "Amount": 1000
        }
      ]
```

#### Percepciones

```
"Incapacities": [
        {
          "Days": 5,
          "Type": "02",
          "Amount": 1000
        }
      ]
```

#### Percepciones

```
"Incapacities": [
        {
          "Days": 5,
          "Type": "02",
          "Amount": 1000
        }
      ]
```

    Eneste nodo se debe expresar la información de las incapacidades

    Days:  Número de días enteros que el trabajador se incapacitó en el periodo

    Type:  Tipo de incapacidad [ver catálogo](https://apisandbox.facturama.mx/guias/nominas/catalogos/incapacities)

- 01 = Riesgo de trabajo

- 02 = Enfermedad en general

- 03 = Maternidad

    Amount:  Monto

Se puede registrar el monto del importe monetario de la incapacidad

#### Percepciones

```
"Perceptions": {
        "Details": [
          {
            "PerceptionType": "014",
            "Code": "Incapacidad",
            "Description": "Incapacidad por lesión",
            "TaxedAmount": 1000,
            "ExemptAmount": 0
          }
        ]
      }
```

#### Percepciones

```
"Perceptions": {
        "Details": [
          {
            "PerceptionType": "014",
            "Code": "Incapacidad",
            "Description": "Incapacidad por lesión",
            "TaxedAmount": 1000,
            "ExemptAmount": 0
          }
        ]
      }
```

#### Percepciones

```
"Perceptions": {
        "Details": [
          {
            "PerceptionType": "014",
            "Code": "Incapacidad",
            "Description": "Incapacidad por lesión",
            "TaxedAmount": 1000,
            "ExemptAmount": 0
          }
        ]
      }
```

#### Percepciones

```
"Perceptions": {
        "Details": [
          {
            "PerceptionType": "014",
            "Code": "Incapacidad",
            "Description": "Incapacidad por lesión",
            "TaxedAmount": 1000,
            "ExemptAmount": 0
          }
        ]
      }
```

#### Percepciones

```
"Perceptions": {
        "Details": [
          {
            "PerceptionType": "014",
            "Code": "Incapacidad",
            "Description": "Incapacidad por lesión",
            "TaxedAmount": 1000,
            "ExemptAmount": 0
          }
        ]
      }
```

#### Percepciones

```
"Perceptions": {
        "Details": [
          {
            "PerceptionType": "014",
            "Code": "Incapacidad",
            "Description": "Incapacidad por lesión",
            "TaxedAmount": 1000,
            "ExemptAmount": 0
          }
        ]
      }
```

    En este nodo se pueden expresar las percepciones aplicables.

    Se agrega un nodo del tipo apropiado para colocar las percepciones por incapacidad

    PerceptionType:  Tipo de percepción [ver catálogo](https://apisandbox.facturama.mx/guias/nominas/catalogos/perceptions)

    Se debe registrar la clave del tipo de percepción bajo la cual se clasifica cada una de las percepciones pagadas al trabajador

-
            014 = Subsidios por incapacidad

    Code:  Clave de control interno

    Se debe registrar la clave de control interno que asigna el patrón a cada percepción de
    nómina propia de su contabilidad, puede conformarse desde 3 hasta 15 caracteres

    Description:  Concepto

Se debe registrar la descripción de cada uno de los conceptos de percepción.

        Se ingresa el nombre o descripción específica que dé el patrón de cada uno de los
        conceptos de percepción pagado al trabador que corresponda, esta descripción puede
        o no coincidir con la descripción del catálogo [Tipo de percepción](https://apisandbox.facturama.mx/guias/nominas/catalogos/perceptions)

    TaxedAmount:  Importe gravado

    Se debe registrar el importe gravado por cada concepto de percepción

    ExemptAmount:  Importe exento

    Se debe registrar el importe exento por cada concepto de percepción

#### Deducciones

```
"Deductions": {
        "Details": [
          {
            "DeduccionType": "006",
            "Code": "002",
            "Description": "Descuento por incapacidad",
            "Amount": 100
          },
          {
            "DeduccionType": "002",
            "Code": "ISR",
            "Description": "Impuesto Sobre la Renta",
            "Amount": 20
          }
        ]
      }
```

#### Deducciones

```
"Deductions": {
        "Details": [
          {
            "DeduccionType": "006",
            "Code": "002",
            "Description": "Descuento por incapacidad",
            "Amount": 100
          },
          {
            "DeduccionType": "002",
            "Code": "ISR",
            "Description": "Impuesto Sobre la Renta",
            "Amount": 20
          }
        ]
      }
```

#### Deducciones

```
"Deductions": {
        "Details": [
          {
            "DeduccionType": "006",
            "Code": "002",
            "Description": "Descuento por incapacidad",
            "Amount": 100
          },
          {
            "DeduccionType": "002",
            "Code": "ISR",
            "Description": "Impuesto Sobre la Renta",
            "Amount": 20
          }
        ]
      }
```

#### Deducciones

```
"Deductions": {
        "Details": [
          {
            "DeduccionType": "006",
            "Code": "002",
            "Description": "Descuento por incapacidad",
            "Amount": 100
          },
          {
            "DeduccionType": "002",
            "Code": "ISR",
            "Description": "Impuesto Sobre la Renta",
            "Amount": 20
          }
        ]
      }
```

#### Deducciones

```
"Deductions": {
        "Details": [
          {
            "DeduccionType": "006",
            "Code": "002",
            "Description": "Descuento por incapacidad",
            "Amount": 100
          },
          {
            "DeduccionType": "002",
            "Code": "ISR",
            "Description": "Impuesto Sobre la Renta",
            "Amount": 20
          }
        ]
      }
```

#### Deducciones

```
"Deductions": {
        "Details": [
          {
            "DeduccionType": "006",
            "Code": "002",
            "Description": "Descuento por incapacidad",
            "Amount": 100
          },
          {
            "DeduccionType": "002",
            "Code": "ISR",
            "Description": "Impuesto Sobre la Renta",
            "Amount": 20
          }
        ]
      }
```

En este nodo se deben expresar las deducciones aplicables.

    Se agrega la Deduccón  por Incapacidad (en caso de que sea reuquerdo, y adicionalmente a las deducciones aplicables)

    DeduccionType:  Tipo de la deducción [ver catálogo](https://apisandbox.facturama.mx/guias/nominas/catalogos/deductions)

    Se debe registrar la clave agrupadora que clasifica cada una de las deducciones (descuentos) del trabajador

- 006 = Descuento por incapacidad

    Code:  Clave de control interno

    Se debe registrar la clave de control interno que asigna el patrón a cada deducción
    (descuento) de nómina propia de su contabilidad, puede conformarse desde 3 hasta 15
    caracteres

    Description:  Descripción del concepto de deducción
    Aunque la descripción no coincida textualmente
    con la descripción del [catálogo tipo de deducción](https://apisandbox.facturama.mx/guias/nominas/catalogos/deductions), se debe
    cuidar que el concepto utilizado si tenga relación y sea concordante con la descripción
    de dicho catálogo de la clave que corresponda.

    Amount:  Importe del concepto

    Se debe registrar el importe de un concepto de deducción (descuento) y debe ser mayor que cero

#### Ejemplo completo en JSON

```
{
  "NameId": 1,
  "ExpeditionPlace": "78220",
  "CfdiType": "N",
  "PaymentForm": "99",
  "PaymentMethod": "PUE",
  "Folio": 100,
  "Receiver": {
    "Rfc": "ROAJ850914837",
    "Name": "ULISES CUEVAS PEREZ",
    "CfdiUse": "P01"
  },
  "Complemento": {
    "Payroll": {
      "Type": "O",
      "PaymentDate": "2019-01-15T13:43:59.4011985-06:00",
      "InitialPaymentDate": "2019-01-15T13:43:59.4011985-06:00",
      "FinalPaymentDate": "2019-01-15T13:43:59.4011985-06:00",
      "DaysPaid": 5,
      "Issuer": {
        "EmployerRegistration": "B5510768108"
      },
      "Employee": {
        "Curp": "BADD110313HCMLNS09",
        "SocialSecurityNumber": "1234567890",
        "StartDateLaborRelations": "2019-01-15T13:43:59.3952019-06:00",
        "ContractType": "01",
        "RegimeType": "02",
        "Unionized": true,
        "TypeOfJourney": "01",
        "EmployeeNumber": "012345672ST",
        "Department": "Software and Deployments",
        "Position": "Developer",
        "PositionRisk": "1",
        "FrequencyPayment": "01",
        "Bank": "SANTANDER",
        "BankAccount": "1234567890",
        "BaseSalary": 1,
        "DailySalary": 1,
        "FederalEntityKey": "SLP"
      },

      "Incapacities": [
        {
          "Days": 5,
          "Type": "02",
          "Amount": 1000
        }
      ],

      "Perceptions": {
        "Details": [

          {
            "PerceptionType": "014",
            "Code": "Incapacidad",
            "Description": "Incapacidad por lesion en almacen",
            "TaxedAmount": 1000,
            "ExemptAmount": 0
          }

        ]
      },
      "Deductions": {
        "Details": [
          {
            "DeduccionType": "006",
            "Code": "002",
            "Description": "Descuento por incapacidad",
            "Amount": 100
          },
          {
            "DeduccionType": "002",
            "Code": "ISR",
            "Description": "Impuesto Sobre la Renta",
            "Amount": 20
          }
        ]
      }
    }
  }
}
```
