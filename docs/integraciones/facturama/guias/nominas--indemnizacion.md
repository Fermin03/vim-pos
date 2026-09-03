<!-- fuente: https://apisandbox.facturama.mx/guias/nominas/indemnizacion · capturado 2026-09-03 -->

# Nomina de Indemnización

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

- [Nomina de sueldo](https://apisandbox.facturama.mx/guias/nominas/sueldo)

- [Nomina con subsidio](https://apisandbox.facturama.mx/guias/nominas/subsidio)

- [Nomina con horas extra](https://apisandbox.facturama.mx/guias/nominas/horas-extra)

- [Incapacidad](https://apisandbox.facturama.mx/guias/nominas/incapacidad)

- [Jubilación](https://apisandbox.facturama.mx/guias/nominas/jubilacion)

### Componentes para Indemnización

#### Percepciones

```
"Perceptions": {
    "Details": [
          {
            "PerceptionType": "025",
            "Code": "Indemnizacion",
            "Description": "Indemnizacion por despido",
            "TaxedAmount": 4,
            "ExemptAmount": 5
           }
        ],
        "Indemnification": {
            "TotalPaid": 1,
            "YearsOfService": 2,
            "LastMonthlySalaryOrd": 3,
            "AccumulatedIncome": 4,
            "NonAccumulatedIncome": 5
        }
    }
```

#### Percepciones

```
"Perceptions": {
    "Details": [
          {
            "PerceptionType": "025",
            "Code": "Indemnizacion",
            "Description": "Indemnizacion por despido",
            "TaxedAmount": 4,
            "ExemptAmount": 5
           }
        ],
        "Indemnification": {
            "TotalPaid": 1,
            "YearsOfService": 2,
            "LastMonthlySalaryOrd": 3,
            "AccumulatedIncome": 4,
            "NonAccumulatedIncome": 5
        }
    }
```

#### Percepciones

```
"Perceptions": {
    "Details": [
          {
            "PerceptionType": "025",
            "Code": "Indemnizacion",
            "Description": "Indemnizacion por despido",
            "TaxedAmount": 4,
            "ExemptAmount": 5
           }
        ],
        "Indemnification": {
            "TotalPaid": 1,
            "YearsOfService": 2,
            "LastMonthlySalaryOrd": 3,
            "AccumulatedIncome": 4,
            "NonAccumulatedIncome": 5
        }
    }
```

#### Percepciones

```
"Perceptions": {
    "Details": [
          {
            "PerceptionType": "025",
            "Code": "Indemnizacion",
            "Description": "Indemnizacion por despido",
            "TaxedAmount": 4,
            "ExemptAmount": 5
           }
        ],
        "Indemnification": {
            "TotalPaid": 1,
            "YearsOfService": 2,
            "LastMonthlySalaryOrd": 3,
            "AccumulatedIncome": 4,
            "NonAccumulatedIncome": 5
        }
    }
```

#### Percepciones

```
"Perceptions": {
    "Details": [
          {
            "PerceptionType": "025",
            "Code": "Indemnizacion",
            "Description": "Indemnizacion por despido",
            "TaxedAmount": 4,
            "ExemptAmount": 5
           }
        ],
        "Indemnification": {
            "TotalPaid": 1,
            "YearsOfService": 2,
            "LastMonthlySalaryOrd": 3,
            "AccumulatedIncome": 4,
            "NonAccumulatedIncome": 5
        }
    }
```

#### Percepciones

```
"Perceptions": {
    "Details": [

          {
            "PerceptionType": "025",
            "Code": "Indemnizacion",
            "Description": "Indemnizacion por despido",
            "TaxedAmount": 4,
            "ExemptAmount": 5
           }

        ],

        "Indemnification": {
            "TotalPaid": 1,
            "YearsOfService": 2,
            "LastMonthlySalaryOrd": 3,
            "AccumulatedIncome": 4,
            "NonAccumulatedIncome": 5
        }

    }
```

    En el Nodo de percepciones se agregan 2 elementos:

- Una percepción en el Arreglo de "Details"

- Y el atributo "Indemnification" que es un Nodo con los detalles de la indemnización

    PerceptionType:  Tipo de percepción [ver catálogo](https://apisandbox.facturama.mx/guias/nominas/catalogos/perceptions)

    Se debe registrar la clave del tipo de percepción bajo la cual se clasifica cada una de las percepciones pagadas al trabajador

-
            025 = Indemnizaciones

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
      "Perceptions": {
        "Details": [
          {
            "PerceptionType": "025",
            "Code": "Indemnizacion",
            "Description": "Indemnizacion por despido",
            "TaxedAmount": 4,
            "ExemptAmount": 5
          }
        ],
        "Indemnification": {
          "TotalPaid": 1,
          "YearsOfService": 2,
          "LastMonthlySalaryOrd": 3,
          "AccumulatedIncome": 4,
          "NonAccumulatedIncome": 5
        }
      },
      "Deductions": {
        "Details": [
          {
            "DeduccionType": "001",
            "Code": "IMSS",
            "Description": "Seguridad Social",
            "Amount": 1
          },
          {
            "DeduccionType": "002",
            "Code": "ISR",
            "Description": "Impuesto Sobre la Renta",
            "Amount": 2
          },
          {
            "DeduccionType": "003",
            "Code": "RETIRO",
            "Description": "Aportacion a retiro",
            "Amount": 1
          }
        ],
        "TotalImpuestosRetenidos": 4
      }
    }
  }
}
```
