<!-- fuente: https://apisandbox.facturama.mx/guias/nominas/subsidio · capturado 2026-09-03 -->

# Nomina con subsidio

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

- [Nomina con horas extra](https://apisandbox.facturama.mx/guias/nominas/horas-extra)

- [Incapacidad](https://apisandbox.facturama.mx/guias/nominas/incapacidad)

- [Indemnización](https://apisandbox.facturama.mx/guias/nominas/indemnizacion)

- [Jubilación](https://apisandbox.facturama.mx/guias/nominas/jubilacion)

### Componentes adicionales para Subsidio

#### Otros Pagos

```
"OtherPayments": [
        {
          "OtherPaymentType": "002",
          "Code": "00101",
          "Description": "Subsidio para el empleo",
          "Amount": 110,
          "EmploymentSubsidy": {
            "Amount": 110
          }
        }
      ]
```

#### Otros Pagos

```
"OtherPayments": [
        {
          "OtherPaymentType": "002",
          "Code": "00101",
          "Description": "Subsidio para el empleo",
          "Amount": 110,
          "EmploymentSubsidy": {
            "Amount": 110
          }
        }
      ]
```

#### Otros Pagos

```
"OtherPayments": [
        {
          "OtherPaymentType": "002",
          "Code": "00101",
          "Description": "Subsidio para el empleo",
          "Amount": 110,
          "EmploymentSubsidy": {
            "Amount": 110
          }
        }
      ]
```

#### Otros Pagos

```
"OtherPayments": [
        {
          "OtherPaymentType": "002",
          "Code": "00101",
          "Description": "Subsidio para el empleo",
          "Amount": 110,
          "EmploymentSubsidy": {
            "Amount": 110
          }
        }
      ]
```

#### Otros Pagos

```
"OtherPayments": [
        {
          "OtherPaymentType": "002",
          "Code": "00101",
          "Description": "Subsidio para el empleo",
          "Amount": 110,
          "EmploymentSubsidy": {
            "Amount": 110
          }
        }
      ]
```

#### Otros Pagos

```
"OtherPayments": [
        {
          "OtherPaymentType": "002",
          "Code": "00101",
          "Description": "Subsidio para el empleo",
          "Amount": 110,
          "EmploymentSubsidy": {
            "Amount": 110
          }
        }
      ]
```

En este nodo se debe expresar otros pagos aplicables

    OtherPaymentType:  clave agrupadora correspondiente a otras cantidades recibidas [ver catálogo](https://apisandbox.facturama.mx/guias/nominas/catalogos/otherpayments)

- 002 = Subsidio para el empleo (efectivamente entregado al trabajador)

    Code:  Clave de control interno

    Se debe registrar la clave de control interno que asigna el patrón a cada deducción
    (descuento) de nómina propia de su contabilidad, puede conformarse desde 3 hasta 15
    caracteres

    Description:  Descripción del concepto, aunque la descripción no coincida textualmente
    con la descripción del [catálogo tipo de otros pagos](https://apisandbox.facturama.mx/guias/nominas/catalogos/otherpayments), se debe
    cuidar que el concepto utilizado si tenga relación y sea concordante con la descripción
    de dicho catálogo de la clave que corresponda.

    Amount:  Importe del concepto

    Se debe registrar el importe de un concepto de deducción (descuento) y debe ser mayor que cero

    EmploymentSubsidy:  Nodo de "Subsidio para el empleo"

    Nodo adicional que contiene el Monto específico de este subsidio

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
            "PerceptionType": "001",
            "Code": "Salario",
            "Description": "Salario Quincenal",
            "TaxedAmount": 1000,
            "ExemptAmount": 200
          }
        ]
      },
      "Deductions": {
        "Details": [
          {
            "DeduccionType": "001",
            "Code": "IMSS",
            "Description": "Seguridad Social",
            "Amount": 1
          }
        ]
      },

      "OtherPayments": [
        {
          "OtherPaymentType": "002",
          "Code": "00101",
          "Description": "Subsidio para el empleo",
          "Amount": 110,
          "EmploymentSubsidy": {
            "Amount": 110
          }
        }
      ]

    }
  }
}
```
