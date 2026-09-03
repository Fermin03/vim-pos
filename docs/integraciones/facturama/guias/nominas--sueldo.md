<!-- fuente: https://apisandbox.facturama.mx/guias/nominas/sueldo · capturado 2026-09-03 -->

# Nomina de sueldo

            Ruby

            PHP

            Javascript

            .Net >= 4.5

            Java

            Phyton

    Los comprobantes fiscales deben emitirse por los actos o actividades que se realicen, por los ingresos que perciban
 o por las
    retenciones de contribuciones que efectúen los contribuyentes ya sean personas físicas o personas morales.

    **La estructura básica de un CFDI de Nómina se muestra en esta sección**

    Sin embargo el CFDI de nómina se puede aplicar a conceptos adicionales al sueldo

    CFDIs de Nómina adicionales

- [Nomina con subsidio](https://apisandbox.facturama.mx/guias/nominas/subsidio)

- [Nomina con horas extra](https://apisandbox.facturama.mx/guias/nominas/horas-extra)

- [Incapacidad](https://apisandbox.facturama.mx/guias/nominas/incapacidad)

- [Indemnización](https://apisandbox.facturama.mx/guias/nominas/indemnizacion)

- [Jubilación](https://apisandbox.facturama.mx/guias/nominas/jubilacion)

### Componentes de la Nómina

#### Datos generales

```
"NameId": "16",
    "CfdiType": Facturama::CfdiType::NOMINA,
    "ExpeditionPlace": "78220",
    "PaymentForm": "99",
    "PaymentMethod": "PUE",
```

#### Datos generales

```
"NameId" => "16",
    "CfdiType" => "N",
    "ExpeditionPlace" => "78220",
    "PaymentForm" => "99",
    "PaymentMethod" => "PUE",
```

#### Datos generales

```
"NameId": "16",
    "CfdiType": "N",
    "ExpeditionPlace": "78220",
    "PaymentForm": "99",
    "PaymentMethod": "PUE",
```

#### Datos generales

```
cfdi.setNameId(facturama.Catalogs().NameIds().get(16).getValue());
    cfdi.setCfdiType( CfdiType.Nomina.getValue() );
    cfdi.setCurrency(currency.getValue());
    cfdi.setExpeditionPlace("78216");
    cfdi.setPaymentForm(facturama.Catalogs().PaymentForms().get(3).getValue());
    cfdi.setPaymentMethod("PUE");
```

#### Datos generales

```
NameId = "16",
    CfdiType = CfdiType.Nomina,
    ExpeditionPlace = "78220",
    PaymentForm = "99",
    PaymentMethod = "PUE",
```

#### Datos generales

```
"NameId": "16",
    "CfdiType": "N",
    "ExpeditionPlace": "78220",
    "PaymentForm": "99",
    "PaymentMethod": "PUE",
    "Folio": 100,
```

    NameId:  Valores: (16)  donde 16 = "Recibo de Nómina"
    [ver en la guía](https://apisandbox.facturama.mx/guias/catalogos/nombres-cfdi)

    CfdiType:  El efecto del comprobante fiscal para el contribuyente emisor: (N) donde N = Nómina

    Dependiendo del lenguaje del SDK se tiene una enumeración que permite colocar el valor

    Currency:  Moneda: [ver en la guía](https://apisandbox.facturama.mx/guias/catalogos/monedas)

- En el caso de que sea "MXN = Peso Mexicano" puede no asignarse, si es otra moneda el campo es obligatorio

    CurrencyExchangeRate:  Tasa de cambio de la moneda especificada:

- Solo se asigna cuando la moneda NO es "MXN = Peso Mexicano"

    PaymentForm:  Forma de pago (99 - Por definir), se debe registrar la clave de la **forma de pago "99"**.
    [ver en la guía](https://apisandbox.facturama.mx/guias/catalogos/formas-pago)

    PaymentMethod:  Método de pago   Valores: (PPD|PUE) donde PUE = Una sola exhibición y PPD = Parcialidades
    [ver en la guía](https://apisandbox.facturama.mx/guias/catalogos/metodos-pago)

    Currency:  La moneda puede ser cualquiera del catálogo, por ejemplo el peso mexicano es MXN
    [ver en la guía](https://apisandbox.facturama.mx/guias/catalogos/monedas)

    ExpeditionPlace:  Lugar de expedición, es representado por un Código Postal, que pertenece a una sucursal, pero toma en cuenta que:

- Debes tener dada de alta en tu cuenta, una sucursal con ese código postal [ver como agregar sucursal](https://apisandbox.facturama.mx/guias/perfil-fiscal)

- El código postal debe pertenecer al catálogo del SAT [ver catálogo](https://apisandbox.facturama.mx/guias/catalogos/codigos-postales)

    Folio:  Folio del CFDI

- En el caso de que no se especifique o sea nulo, Facturama asigna el consecutivo

#### Datos del receptor

```
"Receiver": {
            "CfdiUse": "P01",
            "Name": "ULISES CUEVAS PEREZ",
            "Rfc": "ROAJ850914837"
        },
```

#### Datos del receptor

```
"Receiver" => {
        "Name" => "ULISES CUEVAS PEREZ",
        "CfdiUse" => "P01",
        "Rfc" => "ROAJ850914837"
    },
```

#### Datos del receptor

```
"Receiver": {
        "Name": "ULISES CUEVAS PEREZ",
        "CfdiUse": "P01",
        "Rfc": "ROAJ850914837"
    },
```

#### Datos del receptor

```
Receiver  receiver = new Receiver();

    receiver.setName("ULISES CUEVAS PEREZ");
    receiver.setCfdiUse("P01");
    receiver.setRfc("ROAJ850914837");

    cfdi.setReceiver(receiver);
```

#### Datos del receptor

```
Receiver = new Receiver
    {
        Name = "ULISES CUEVAS PEREZ",
        CfdiUse = "P01",
        Rfc = "ROAJ850914837"
    },
```

#### Datos del receptor

```
"Receiver": {
            "CfdiUse": "P01",
            "Name": "ULISES CUEVAS PEREZ",
            "Rfc": "ROAJ850914837"
        },
```

    Debe ser una persona física.

    En la estructura es representado por un nodo que se coloca en el atributo **Receiver**

    puedes [ver en la documentación de la API](https://apisandbox.facturama.mx/docs/ResourceModel?modelName=ReceiverBindingModel)

    CfdiUse:  Expresar la clave del uso que dará a esta factura el receptor del CFDI.
    [ver en la guía](https://apisandbox.facturama.mx/guias/catalogos/usos-cfdi)

    Name:  Nombre del receptor

    Rfc:  Clave del Registro Federal de Contribuyentes

#### Complemento de Nómina

```
"Complemento": {
    "Payroll": {
      "Type": "O",
      "PaymentDate": "2019-01-15T13:43:59.4011985-06:00",
      "InitialPaymentDate": "2019-01-15T13:43:59.4011985-06:00",
      "FinalPaymentDate": "2019-01-15T13:43:59.4011985-06:00",
      "DaysPaid": 5,
      "Issuer": {
        "EmployerRegistration": "El registro del empleador",
        "FromEmployerRfc": "EKU9003173C9"
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
            "Code": "00500",
            "Description": "Salario Diario",
            "TaxedAmount": 4,
            "ExemptAmount": 5
          }
        ]
      },
      "Deductions": {
        "Details": [
          {
            "DeduccionType": "001",
            "Code": "IMSS",
            "Description": "Seguridad Social",
            "Amount": 4
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
      },
    "OtherPayments":[
      		{
	      		"OtherPaymentType":"002",
	      		"Code":"00101",
	      		"Description":"otro pago",
	      		"Amount":110,
	      		"EmploymentSubsidy":{
	      			"Amount":110
	      		}
      		}
  		]
    }
  }
```

#### Complemento de Nómina

```
"Complemento": {
    "Payroll": {
      "Type": "O",
      "PaymentDate": "2019-01-15T13:43:59.4011985-06:00",
      "InitialPaymentDate": "2019-01-15T13:43:59.4011985-06:00",
      "FinalPaymentDate": "2019-01-15T13:43:59.4011985-06:00",
      "DaysPaid": 5,
      "Issuer": {
        "EmployerRegistration": "El registro del empleador",
        "FromEmployerRfc": "EKU9003173C9"
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
            "Code": "00500",
            "Description": "Salario Diario",
            "TaxedAmount": 4,
            "ExemptAmount": 5
          }
        ]
      },
      "Deductions": {
        "Details": [
          {
            "DeduccionType": "001",
            "Code": "IMSS",
            "Description": "Seguridad Social",
            "Amount": 4
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
      },
    "OtherPayments":[
      		{
	      		"OtherPaymentType":"002",
	      		"Code":"00101",
	      		"Description":"otro pago",
	      		"Amount":110,
	      		"EmploymentSubsidy":{
	      			"Amount":110
	      		}
      		}
  		]
    }
  }
```

#### Complemento de Nómina

```
"Complemento": {
    "Payroll": {
      "Type": "O",
      "PaymentDate": "2019-01-15T13:43:59.4011985-06:00",
      "InitialPaymentDate": "2019-01-15T13:43:59.4011985-06:00",
      "FinalPaymentDate": "2019-01-15T13:43:59.4011985-06:00",
      "DaysPaid": 5,
      "Issuer": {
        "EmployerRegistration": "El registro del empleador",
        "FromEmployerRfc": "EKU9003173C9"
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
            "Code": "00500",
            "Description": "Salario Diario",
            "TaxedAmount": 4,
            "ExemptAmount": 5
          }
        ]
      },
      "Deductions": {
        "Details": [
          {
            "DeduccionType": "001",
            "Code": "IMSS",
            "Description": "Seguridad Social",
            "Amount": 4
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
      },
    "OtherPayments":[
      		{
	      		"OtherPaymentType":"002",
	      		"Code":"00101",
	      		"Description":"otro pago",
	      		"Amount":110,
	      		"EmploymentSubsidy":{
	      			"Amount":110
	      		}
      		}
  		]
    }
  }
```

#### Complemento de Nómina

```
"Complemento": {
    "Payroll": {
      "Type": "O",
      "PaymentDate": "2019-01-15T13:43:59.4011985-06:00",
      "InitialPaymentDate": "2019-01-15T13:43:59.4011985-06:00",
      "FinalPaymentDate": "2019-01-15T13:43:59.4011985-06:00",
      "DaysPaid": 5,
      "Issuer": {
        "EmployerRegistration": "El registro del empleador",
        "FromEmployerRfc": "EKU9003173C9"
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
            "Code": "00500",
            "Description": "Salario Diario",
            "TaxedAmount": 4,
            "ExemptAmount": 5
          }
        ]
      },
      "Deductions": {
        "Details": [
          {
            "DeduccionType": "001",
            "Code": "IMSS",
            "Description": "Seguridad Social",
            "Amount": 4
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
      },
    "OtherPayments":[
      		{
	      		"OtherPaymentType":"002",
	      		"Code":"00101",
	      		"Description":"otro pago",
	      		"Amount":110,
	      		"EmploymentSubsidy":{
	      			"Amount":110
	      		}
      		}
  		]
    }
  }
```

#### Datos generales

```
"Complemento": {
    "Payroll": {
      "Type": "O",
      "PaymentDate": "2019-01-15T13:43:59.4011985-06:00",
      "InitialPaymentDate": "2019-01-15T13:43:59.4011985-06:00",
      "FinalPaymentDate": "2019-01-15T13:43:59.4011985-06:00",
      "DaysPaid": 5,
      "Issuer": {
        "EmployerRegistration": "El registro del empleador",
        "FromEmployerRfc": "EKU9003173C9"
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
            "Code": "00500",
            "Description": "Salario Diario",
            "TaxedAmount": 4,
            "ExemptAmount": 5
          }
        ]
      },
      "Deductions": {
        "Details": [
          {
            "DeduccionType": "001",
            "Code": "IMSS",
            "Description": "Seguridad Social",
            "Amount": 4
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
      },
    "OtherPayments":[
      		{
	      		"OtherPaymentType":"002",
	      		"Code":"00101",
	      		"Description":"otro pago",
	      		"Amount":110,
	      		"EmploymentSubsidy":{
	      			"Amount":110
	      		}
      		}
  		]
    }
  }
```

#### Datos generales

```
"Complemento": {
    "Payroll": {
      "Type": "O",
      "PaymentDate": "2019-01-15T13:43:59.4011985-06:00",
      "InitialPaymentDate": "2019-01-15T13:43:59.4011985-06:00",
      "FinalPaymentDate": "2019-01-15T13:43:59.4011985-06:00",
      "DaysPaid": 5,
      "Issuer": {
        "EmployerRegistration": "El registro del empleador",
        "FromEmployerRfc": "EKU9003173C9"
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
            "Code": "00500",
            "Description": "Salario Diario",
            "TaxedAmount": 4,
            "ExemptAmount": 5
          }
        ]
      },
      "Deductions": {
        "Details": [
          {
            "DeduccionType": "001",
            "Code": "IMSS",
            "Description": "Seguridad Social",
            "Amount": 4
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
      },
    "OtherPayments":[
      		{
	      		"OtherPaymentType":"002",
	      		"Code":"00101",
	      		"Description":"otro pago",
	      		"Amount":110,
	      		"EmploymentSubsidy":{
	      			"Amount":110
	      		}
      		}
  		]
    }
  }
```

El Nodo **"Payroll"** que forma parte del Nodo "Complemento" es la esencia de Nómina

**Las secciones que lo conforman serán detalladas a continuación**

#### Datos generales de nómina

```
"Type": "O",
    "PaymentDate": "2019-01-15T13:43:59.4011985-06:00",
    "InitialPaymentDate": "2019-01-15T13:43:59.4011985-06:00",
    "FinalPaymentDate": "2019-01-15T13:43:59.4011985-06:00",
    "DaysPaid": 5,
```

#### Datos generales de nómina

```
"Type": "O",
    "PaymentDate": "2019-01-15T13:43:59.4011985-06:00",
    "InitialPaymentDate": "2019-01-15T13:43:59.4011985-06:00",
    "FinalPaymentDate": "2019-01-15T13:43:59.4011985-06:00",
    "DaysPaid": 5,
```

#### Datos generales de nómina

```
"Type": "O",
    "PaymentDate": "2019-01-15T13:43:59.4011985-06:00",
    "InitialPaymentDate": "2019-01-15T13:43:59.4011985-06:00",
    "FinalPaymentDate": "2019-01-15T13:43:59.4011985-06:00",
    "DaysPaid": 5,
```

#### Datos generales de nómina

```
"Type": "O",
    "PaymentDate": "2019-01-15T13:43:59.4011985-06:00",
    "InitialPaymentDate": "2019-01-15T13:43:59.4011985-06:00",
    "FinalPaymentDate": "2019-01-15T13:43:59.4011985-06:00",
    "DaysPaid": 5,
```

#### Datos generales de nómina

```
"Type": "O",
    "PaymentDate": "2019-01-15T13:43:59.4011985-06:00",
    "InitialPaymentDate": "2019-01-15T13:43:59.4011985-06:00",
    "FinalPaymentDate": "2019-01-15T13:43:59.4011985-06:00",
    "DaysPaid": 5,
```

#### Datos generales de nómina

```
"Type": "O",
    "PaymentDate": "2019-01-15T13:43:59.4011985-06:00",
    "InitialPaymentDate": "2019-01-15T13:43:59.4011985-06:00",
    "FinalPaymentDate": "2019-01-15T13:43:59.4011985-06:00",
    "DaysPaid": 5,
```

    Type:  Tipo de Nómina

-
            O = Nómina ordinaria
  se suele clasificar como ordinaria a la nómina que paga
            conceptos de manera periódica y, por ende, a la que le corresponde una periodicidad
            determinada, por ejemplo: Diaria, Semanal

-
            E = Nómina extraordinaria
aquella nómina que incluye conceptos que no son
            objeto de pago de manera periódica o habitual, por ejemplo pagos por separación,
            aguinaldos o bonos

    PaymentDate:  Fecha de pago

    la fecha en que efectivamente el empleador realizó el pago
    (erogación) de la nómina al trabajador

    InitialPaymentDate:  Fecha inicial del periodo de pago

    FinalPaymentDate:  Fecha final del periodo de pago

    DaysPaid:  Número de días y/o la fracción de días pagados al trabajador

    El valor debe ser mayor que cero, se pueden registrar hasta 36,160 días y no se incluyen los ceros a la izquierda.

#### Empleador

```
"Issuer": {
        "EmployerRegistration": "B5510768108"
      }
```

#### Empleador

```
"Issuer": {
        "EmployerRegistration": "B5510768108"
      }
```

#### Empleador

```
"Issuer": {
        "EmployerRegistration": "B5510768108"
      }
```

#### Empleador

```
"Issuer": {
        "EmployerRegistration": "B5510768108"
      }
```

#### Empleador

```
"Issuer": {
        "EmployerRegistration": "B5510768108"
      }
```

#### Empleador

```
"Issuer": {
        "EmployerRegistration": "B5510768108"
      }
```

    En este nodo se debe expresar la información adicional del contribuyente emisor del
    comprobante fiscal (Empleador).

    EmployerRegistration:  Registro patronal

    Se puede incorporar el registro patronal, clave de ramo - pagaduría o la que le asigne la
    institución de seguridad social al patrón.

    Se debe ingresar cuando se cuente con él o se
    esté obligado conforme a otras disposiciones aplicables.
    Puede conformarse desde 1 hasta 20 caracteres

#### Empleado

```
"Employee": {
    "Curp": "ROAJ850914837",
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
    }
```

#### Empleado

```
"Employee": {
    "Curp": "ROAJ850914837",
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
    }
```

#### Empleado

```
"Employee": {
    "Curp": "ROAJ850914837",
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
    }
```

#### Empleado

```
"Employee": {
    "Curp": "ROAJ850914837",
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
    }
```

#### Empleado

```
"Employee": {
    "Curp": "ROAJ850914837",
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
    }
```

#### Empleado

```
"Employee": {
    "Curp": "ROAJ850914837",
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
    }
```

    En este nodo se debe expresar la información del contribuyente receptor (trabajador
    asalariado o asimilado a salarios) del comprobante.

    Curp:  Clave única de registro de población

    Se debe registrar la CURP del trabajador asalariado o asimilado a sueldos (receptor) del
    comprobante de nómina.

    Las personas morales no pueden ser receptoras de un comprobante fiscal por concepto
    de nómina y por ende no son trabajadores, ni cuentan con CURP.

    SocialSecurityNumber:  Número de seguridad social del trabajador

    StartDateLaborRelations:  Fecha de inicio de la relación laboral entre el empleador y elempleado

    ContractType:  Clave del tipo de contrato laboral que tiene el trabajador con su empleador  [ver catálogo](https://apisandbox.facturama.mx/guias/nominas/catalogos/contracttypes)

- 01 = Contrato de trabajo por tiempo indeterminado.

    RegimeType:  Clave del régimen por la cual el empleador tiene contratado al trabajador  [ver catálogo](https://apisandbox.facturama.mx/guias/nominas/catalogos/regimentypes)

- 02 = Sueldos

    Unionized:  Sindicalizado

- Se debe registrar el valor **true** únicamente cuando el trabajador esté asociado a un sindicato dentro de la organización en la cual presta sus servicios

- Se debe registrar el valor **false** cuando el empleador realice el pago a contribuyentes asimilados a salarios, o a asalariados no sindicalizados

    TypeOfJourney:  Clave del tipo de jornada [ver catálogo](https://apisandbox.facturama.mx/guias/nominas/catalogos/typesofjourney)

- 01 = Diurna

    EmployeeNumber:  Numero de empleado

    Se debe registrar el número interno que le asigna el empleador a cada uno de sus
    empleados para su pronta identificación, puede conformarse desde 1 hasta 15
    caracteres

    Department:  Departamento

    Se puede registrar el nombre del departamento o área a la que pertenece el trabajador a la que esta asignado, es decir, en donde desarrolla sus funciones.

    Position:  Se puede asignar el nombre del puesto asignado al usuario

    PositionRisk:  Riesgo del puesto [ver catálogo](https://apisandbox.facturama.mx/guias/nominas/catalogos/positionrisks)

- 1 = Clase 1

- 99 = No aplica (para los que no están afiliados al IMSS)

    FrequencyPayment:  Periodicidad de pago [ver catálogo](https://apisandbox.facturama.mx/guias/nominas/catalogos/paymentfrequencies)

- 01 = Diario

	Bank:  Nombre clave del banco donde el empleador realiza el deposito

	obligatorio en el caso de que se use el campo "BankAccount" con un valor de menos de 18 posiciónes

	[ver catálogo](https://apisandbox.facturama.mx/guias/nominas/catalogos/banks)

    BankAccount:  Cuenta bancaria

    Se puede registrar el número de cuenta bancaria (11 posiciones), número de teléfono
    celular (10 posiciones), número de tarjeta de crédito, débito o de servicios (15 o 16
    posiciones), la CLABE (18 posiciones), o número de monedero electrónico, en donde el
    empleador realiza el depósito de la nómina al trabajador

    BaseSalary:  Salario base

    Se puede registrar el importe de la retribución otorgada al trabajador, que se integra
    por los pagos hechos en efectivo por cuota diaria, gratificaciones, percepciones,
    alimentación, habitación, primas, comisiones, prestaciones en especie y cualquiera otra
    cantidad o prestación que se entregue al trabajador por su trabajo

    DailySalary:  Salario diario integrado

    Se puede registrar el importe del salario que se integra con los pagos hechos en efectivo
    por cuota diaria, gratificaciones, percepciones, habitación, primas, comisiones,
    prestaciones en especie y cualquier otra cantidad o prestación que se entregue al
    trabajador por su trabajo, de conformidad con el Art. 84 de la Ley Federal del Trabajo.
    (Se utiliza para el cálculo de las indemnizaciones).

    FederalEntityKey:  Clave de la entidad federativa [ver catálogo](https://apisandbox.facturama.mx/docs/api/GET-catalogs-States_countryCode)

    Se debe registrar la clave de la entidad federativa, donde el trabajador prestó sus servicios al empleador

- SLP = San Luis Potosí

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
          }
        ]
      }
```

    En este nodo se pueden expresar las percepciones aplicables.

    La suma de los importes de los campos TotalSueldos más
    TotalSeparacionIndemnizacion más TotalJubilacionPensionRetiro debe ser igual a la
    suma de los importes de los campos TotalGravado más TotalExento

    PerceptionType:  Tipo de percepción [ver catálogo](https://apisandbox.facturama.mx/guias/nominas/catalogos/perceptions)

    Se debe registrar la clave del tipo de percepción bajo la cual se clasifica cada una de las percepciones pagadas al trabajador

-
            001 = Sueldos, Salarios Rayas y Jornales

    Code:  Clave de control interno

    Se debe registrar la clave de control interno que asigna el patrón a cada percepción de
    nómina propia de su contabilidad, puede conformarse desde 3 hasta 15 caracteres

    Description:  Concepto

Se debe registrar la descripción de cada uno de los conceptos de percepción.

        Se ingresa el nombre o descripción específica que dé el patrón de cada uno de los
        conceptos de percepción pagado al trabador que corresponda, esta descripción puede
        o no coincidir con la descripción del catálogo [Tipo de percepción](https://apisandbox.facturama.mx/guias/nominas/catalogos/perceptions)

- 001 = Sueldos, Salarios Rayas y Jornales

- 029 = Vales de despensa

- 010 = Premios por puntualidad

    TaxedAmount:  Importe gravado

    Se debe registrar el importe gravado por cada concepto de percepción

    ExemptAmount:  Importe exento

    Se debe registrar el importe exento por cada concepto de percepción

#### Deducciones

```
"Deductions": {
    "Details": [
        {
        "DeduccionType": "001",
        "Code": "IMSS",
        "Description": "Seguridad Social",
        "Amount": 4
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
```

#### Deducciones

```
"Deductions": {
    "Details": [
        {
        "DeduccionType": "001",
        "Code": "IMSS",
        "Description": "Seguridad Social",
        "Amount": 4
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
```

#### Deducciones

```
"Deductions": {
    "Details": [
        {
        "DeduccionType": "001",
        "Code": "IMSS",
        "Description": "Seguridad Social",
        "Amount": 4
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
```

#### Deducciones

```
"Deductions": {
    "Details": [
        {
        "DeduccionType": "001",
        "Code": "IMSS",
        "Description": "Seguridad Social",
        "Amount": 4
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
```

#### Deducciones

```
"Deductions": {
    "Details": [
        {
        "DeduccionType": "001",
        "Code": "IMSS",
        "Description": "Seguridad Social",
        "Amount": 4
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
```

#### Deducciones

```
"Deductions": {
    "Details": [
        {
        "DeduccionType": "001",
        "Code": "IMSS",
        "Description": "Seguridad Social",
        "Amount": 4
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
```

En este nodo se deben expresar las deducciones aplicables

    DeduccionType:  Tipo de la deducción [ver catálogo](https://apisandbox.facturama.mx/guias/nominas/catalogos/deductions)

    Se debe registrar la clave agrupadora que clasifica cada una de las deducciones (descuentos) del trabajador

- 001 = Seguridad social

- 019 = Cuotas sindicales

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
      "Perceptions": {
        "Details": [
          {
            "PerceptionType": "001",
            "Code": "00500",
            "Description": "Salario Diario",
            "TaxedAmount": 4,
            "ExemptAmount": 5
          }
        ]
      },
      "Deductions": {
            "Details": [
                {
                "DeduccionType": "001",
                "Code": "IMSS",
                "Description": "Seguridad Social",
                "Amount": 4
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
        },
    "OtherPayments":[
      		{
	      		"OtherPaymentType":"002",
	      		"Code":"00101",
	      		"Description":"otro pago",
	      		"Amount":110,
	      		"EmploymentSubsidy":{
	      			"Amount":110
	      		}
      		}
  		]
    }
  }
}
```
