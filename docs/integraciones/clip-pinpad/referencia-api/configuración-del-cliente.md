<!-- fuente: https://developer.clip.mx/reference/configuración-del-cliente · capturado 2026-10-08 -->

---
updatedAt: 2025-10-31T00:30:49.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Configuración del Cliente

Nuestro SDK de pago está diseñado para ser increíblemente fácil de usar, lo que te permite configurar el cliente de acuerdo a tus necesidades específicas. A continuación, se muestra una implementación de ejemplo para un uso básico en una aplicación con **Compose** y **Activity**

## Compose

```java
@Composable
fun PaymentScreen() {
    val scope = rememberCoroutineScope()
    val client = remember {
        ClipPayment.Builder()
            .build()
    }

    client.setPaymentHandler()

    Button(
        onClick = {
            scope.launch {
                client.start(
                    amount = AMOUNT,
                    reference = REFERENCE
                )
            }
        }
    ) {
        ...
    }
}

```

## Activity

```
class MainActivity : ComponentActivity() {

    private val builder: ClipPayment by lazy {
        ClipPayment.Builder()
            .build()
    }

    init {
        builder.setPaymentHandler(this@MainActivity)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
      super.onCreate(savedInstanceState)	
			lifecycleScope.launch {
            builder.start(
                reference = REFERENCE,
                amount = AMOUNT
            )
        }
    }
}
```

Tomando el último ejemplo de código, obtendrás el siguiente paso desde una vista de pantalla de la interfaz de usuario del terminal del cliente.

En este ejemplo, hay tres componentes vitales para la configuración del cliente:

1. **Implementar Cliente**

Para comenzar a utilizar Clip en tu aplicación, necesitas inicializar el cliente. Esto implica crear una instancia del cliente con las credenciales necesarias.

* Pasos para instanciar el Cliente:

En el código de tu aplicación, crea una nueva instancia del cliente de Clip.

**Compose**

```java
val client = remember {
    ClipPayment.Builder().build()
}
```

**Activity**

```java
private val builder: ClipPayment by lazy {
    ClipPayment.Builder()
        .build()
}

```

2. **Inicialización del Manejador de Pagos**

Inicializar el manejador de pagos es crucial para que el cliente de Clip administre adecuadamente las actividades de pago y maneje los resultados. Esta configuración garantiza que el cliente conozca el contexto componible necesario para iniciar actividades y procesar sus resultados.

* Pasos para inicializar el manejador de pagos

Asegúrate de inicializar el manejador de pagos dentro de tu actividad.

* Llama al Manejador Antes del onCreate en el  Activity

Si estás utilizando un “Activity”, asegúrate de llamar al manejador antes del método onCreate.

**Compose**

```java
@Composable
fun PaymentScreen() {
    ...
    client.setPaymentHandler()
    ...
}

```

**Activity**

```java
init {
    builder.setPaymentHandler(this@MainActivity)
}

```

> 📘 ¿Necesitas Ayuda?
>
> Si lo que buscas no está documentado, contáctanos por el siguiente medio:
>
> * Envía un correo electrónico a la dirección <sdk@payclip.com>.