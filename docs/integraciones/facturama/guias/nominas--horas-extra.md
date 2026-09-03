<!-- fuente: https://apisandbox.facturama.mx/guias/nominas/horas-extra · capturado 2026-09-03 -->

# Nomina con horas extra

            Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

    Los comprobantes fiscales deben emitirse por los actos o actividades que se realicen, por los ingresos que perciban
 o por las
    retenciones de contribuciones que efectúen los contribuyentes ya sean personas físicas o personas morales.

    Para conocer la estructura básica de un CFDI de Nómina, visita  [Guía de Nomina de sueldo](https://apisandbox.facturama.mx/guias/nominas/sueldo)

    Ya que la **Nómina con horas extra** es una ligera modificación a  la Nomina de Sueldos

    CFDIs de Nómina adicionales

- [Nomina de sueldo](https://apisandbox.facturama.mx/guias/nominas/sueldo)

- [Nomina con subsidio](https://apisandbox.facturama.mx/guias/nominas/subsidio)

- [Incapacidad](https://apisandbox.facturama.mx/guias/nominas/incapacidad)

- [Indemnización](https://apisandbox.facturama.mx/guias/nominas/indemnizacion)

- [Jubilación](https://apisandbox.facturama.mx/guias/nominas/jubilacion)

### Componentes para horas extra

#### Percepciones

```
"Perceptions": {
      "Details": [
            {
              "PerceptionType": "001",
              "Code": "00500",
              "Description": "Salario Diario",
              "TaxedAmount": 4,
              "ExemptAmount": 5
            },
        {
              "PerceptionType": "019",
              "Code": "06001",
              "Description": "Tiempo extra de fin de semana",
              "TaxedAmount": 4,
              "ExemptAmount": 5,
              "ExtraHours": [
                {
                  "Days": 2,
                  "HoursType": "02",
                  "ExtraHours": 3,
                  "PaidAmount": 4
                }
              ]
            }
      ]
    }
```

#### Percepciones

```
"Perceptions": {
      "Details": [
            {
              "PerceptionType": "001",
              "Code": "00500",
              "Description": "Salario Diario",
              "TaxedAmount": 4,
              "ExemptAmount": 5
            },
        {
              "PerceptionType": "019",
              "Code": "06001",
              "Description": "Tiempo extra de fin de semana",
              "TaxedAmount": 4,
              "ExemptAmount": 5,
              "ExtraHours": [
                {
                  "Days": 2,
                  "HoursType": "02",
                  "ExtraHours": 3,
                  "PaidAmount": 4
                }
              ]
            }
      ]
    }
```

#### Percepciones

```
"Perceptions": {
      "Details": [
            {
              "PerceptionType": "001",
              "Code": "00500",
              "Description": "Salario Diario",
              "TaxedAmount": 4,
              "ExemptAmount": 5
            },
        {
              "PerceptionType": "019",
              "Code": "06001",
              "Description": "Tiempo extra de fin de semana",
              "TaxedAmount": 4,
              "ExemptAmount": 5,
              "ExtraHours": [
                {
                  "Days": 2,
                  "HoursType": "02",
                  "ExtraHours": 3,
                  "PaidAmount": 4
                }
              ]
            }
      ]
    }
```

#### Percepciones

```
"Perceptions": {
      "Details": [
            {
              "PerceptionType": "001",
              "Code": "00500",
              "Description": "Salario Diario",
              "TaxedAmount": 4,
              "ExemptAmount": 5
            },
            {
              "PerceptionType": "019",
              "Code": "06001",
              "Description": "Tiempo extra de fin de semana",
              "TaxedAmount": 4,
              "ExemptAmount": 5,
              "ExtraHours": [
                {
                  "Days": 2,
                  "HoursType": "02",
                  "ExtraHours": 3,
                  "PaidAmount": 4
                }
              ]
            }
      ]
    }
```

#### Percepciones

```
"Perceptions": {
      "Details": [
            {
              "PerceptionType": "001",
              "Code": "00500",
              "Description": "Salario Diario",
              "TaxedAmount": 4,
              "ExemptAmount": 5
            },
                {
              "PerceptionType": "019",
              "Code": "06001",
              "Description": "Tiempo extra de fin de semana",
              "TaxedAmount": 4,
              "ExemptAmount": 5,
              "ExtraHours": [
                {
                  "Days": 2,
                  "HoursType": "02",
                  "ExtraHours": 3,
                  "PaidAmount": 4
                }
              ]
            }
      ]
    }
```

#### Percepciones

```
"Perceptions": {
      "Details": [
            {
              "PerceptionType": "001",
              "Code": "00500",
              "Description": "Salario Diario",
              "TaxedAmount": 4,
              "ExemptAmount": 5
            },
            {
              "PerceptionType": "019",
              "Code": "06001",
              "Description": "Tiempo extra de fin de semana",
              "TaxedAmount": 4,
              "ExemptAmount": 5,
              "ExtraHours": [
                {
                  "Days": 2,
                  "HoursType": "02",
                  "ExtraHours": 3,
                  "PaidAmount": 4
                }
              ]
            }
      ]
    }
```

    Las horas extra son una **percepción** y se colocan como elemento del arreglo de "Perceptions > Details"

    Esta percepción  de horas extra tiene las características

    PerceptionType:  Tipo de percepción [ver catálogo](https://apisandbox.facturama.mx/guias/nominas/catalogos/perceptions)

    Se debe registrar la clave del tipo de percepción, en el caso de "horas extra" el valor debe ser: **019**

-
            019 = Horas extra

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

    **Dentro de la percepción del tipo Horas extra se pueden agregar mas de un dato de hora extra**,

    es decir que se pueden por ejemplo pagar las horas extra de una semana o una quincena, pagando a diferentes montos

    Colocandolos en el arreglo del nodo "ExtraHours"

    Days:  Días

    Se debe registrar el número de días en que el trabajador laboró horas extra adicionales a su jornada normal de trabajo

    HoursType:  Tipo de horas [ver catálogo](https://apisandbox.facturama.mx/guias/nominas/catalogos/extrahours)

- 01 = Dobles

- 02 = Triples

- 03 = Simples

    ExtraHours:  Cantidad de horas extra

    Se debe registrar el número de horas extra que laboró el trabajador adicionales a su jornada normal de trabajo

    PaidAmount:  Importe pagado

    Se debe registrar el importe pagado por las horas extra que laboró el trabajador adicionales a su jornada normal de trabajo

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
				"Details": [{
						"PerceptionType": "001",
						"Code": "Salario",
						"Description": "Salario Quincenal",
						"TaxedAmount": 4,
						"ExemptAmount": 5
					},

                                        {
						"PerceptionType": "019",
						"Code": "06001",
						"Description": "Tiempo extra de fin de semana",
						"TaxedAmount": 4,
						"ExemptAmount": 5,
						"ExtraHours": [{
							"Days": 2,
							"HoursType": "02",
							"ExtraHours": 3,
							"PaidAmount": 4
						}]
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
                ]
              }
		}
	}
}
```
