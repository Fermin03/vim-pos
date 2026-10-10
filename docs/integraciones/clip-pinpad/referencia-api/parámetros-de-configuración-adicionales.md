<!-- fuente: https://developer.clip.mx/reference/parámetros-de-configuración-adicionales · capturado 2026-10-08 -->

---
updatedAt: 2025-10-31T00:32:43.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Parámetros de Configuración Adicionales

Nuestro SDK de pago ofrece varios parámetros de configuración adicionales para personalizar tu experiencia de integración. A continuación, se presentan explicaciones de cada parámetro y ejemplos de cómo utilizarlos:

* **isAutoReturnEnabled:**

Este parámetro establece el modo de retorno para el terminal después de una transacción. Cuando se establece en true, el terminal regresa automáticamente a su aplicación después de completar la transacción o al encontrar un error durante el proceso. Si se establece en false, el terminal muestra su propia pantalla detallada explicando la situación. Por defecto, está configurado en false.Este parámetro establece el modo de retorno para el terminal después de una transacción. Cuando se establece en true, el terminal regresa automáticamente a tu aplicación después de completar o encontrar un error durante el proceso de transacción. Si se establece en false, el terminal muestra su propia pantalla detallada explicando la situación. El valor predeterminado es false.

```java
ClipPayment.Builder()
	.isAutoReturnEnabled(isAutoReturnEnabled: Boolean)
```

* **isRetryEnabled:**

Este parámetro establece si se permiten reintentos en el terminal después de una transacción. Cuando se establece en true, el terminal permite reintentar el pago en caso de fallo. Si se establece en false, el terminal solo mostrará la opción de “cancelar” en caso de fallo.Este parámetro determina si se mostrará la pantalla de propinas cuando comience el proceso de pago. Por defecto, está establecido en false, y la pantalla de propinas no se mostrará.

```java
ClipPayment.Builder()
	.isRetryEnabled(isRetryEnabled: Boolean)
```

* **isShareEnabled:**

Este parámetro determina si los botones para compartir están disponibles al completar la transacción con éxito. Cuando se establece en verdadero, el terminal mostrará opciones para compartir en caso de éxito. Si se establece en falso, el terminal no mostrará opciones para compartir en caso de éxito.

```java
ClipPayment.Builder()
	.isShareEnabled(isShareEnabled: Boolean)
```

* **addListener:**

Por medio de este parámetro, puedes registrar un “escuchador” para recibir los resultados de la transacción. Esto te permite manejar el resultado de la transacción dentro de tu aplicación.Este parámetro te permite registrar una escucha para recibir los resultados de la transacción. Esto te permite manejar el resultado de la transacción dentro de tu aplicación.

```java
ClipPayment.Builder()
	.addListener(listener: PaymentListener)
```

* **setLoginCredentials:**

Este parámetro **opcional**  permite definir un usuario y contraseña  para realizar un pago desde la app de Pinpad. Si Pinpad detecta que la solicitud de pago contiene credenciales evitará que se muestre la UI para realizar el login manualmente y comenzará a transaccionar inmediatamente. Si se definen las credenciales es recomendable utilizar el addLoginListener para saber si las credenciales ingresadas fueron correctas.

```java
ClipPayment.Builder()
	.setLoginCredentials(loginCredentials: ClipPaymentLogin)
```

* **addLoginListener:**

Agregando este parámetro, registras un “escuchador” que detona Pinpad en caso de que las credenciales que fueron definidas en tu app vía el SDK son correctas o incorrectas.

```java
ClipPayment.Builder()
    .addLoginListener(listener: LoginListener)
```

* **setPaymentPreferences:**
  * **isMSIEnabled:** Este parámetro determina si se habilitarán las cuotas mensuales sin intereses. Por defecto, está en falso, desactivando las cuotas mensuales sin intereses.
  * **isMCIEnabled:** Este parámetro determina si se habilitarán las cuotas mensuales. Por defecto, está en verdadero, activando las cuotas mensuales.
  * **isDCCEnabled:** Este parámetro determina si se habilitará la conversión dinámica de moneda. Por defecto, está en verdadero, activando la conversión dinámica de moneda.
  * **isTipEnabled:** Este parámetro determina si se mostrará la pantalla de propina al iniciar el proceso de pago o no. Por defecto, está en falso, y la pantalla de propina no se mostrará.
  * **isAutoPrintReceiptEnabled:** Cuando concluye la transacción, se imprime el ticket automáticamente
    ```java
    ClipPayment.Builder()
            .setPaymentPreferences(preferences: PaymentPreferences)
    ```

## Example Configuration

Aquí tienes un ejemplo de cómo configurar el SDK con todos los parámetros:

```java
// Import necessary libraries
import com.payclip.blaze.pinpad.sdk.domain.builder.payment.ClipPayment
import com.payclip.blaze.pinpad.sdk.domain.listener.payment.PaymentListener
import kotlinx.coroutines.flow.MutableStateFlow;

public class PaymentActivity extends Activity {
    private ClipPayment clipPayment;
 private MutableStateFlow<Boolean> loadingState = new MutableStateFlow<>(false);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_payment);

        // Configure ClipPayment with additional parameters
        clipPayment = new ClipPayment.Builder()
            .isAutoReturnEnabled(true) // Enable auto return to app
            .isTipEnabled(true) // Show tip screen
            .addListener(new PaymentListener() {
                @Override
                public void onSuccess(Payment result) {
                    // Handle payment success
                }

                @Override
                public void onCancelled() {
                    // Handle payment cancelled
                }

                @Override
                public void onFailure(String error) {
                    // Handle payment failure
                }
            })
          .build();
      clipPayment.setPaymentHanlder(this@MainActivity)

    }

    private void launchPayment() {
        // Amount to charge
        double amount = 100.00f;

        // Descriptive message about the payment
        String description = "Order1234";

        // Launch the payment process
        clipPayment.start(description,amount);
    }
}
```

```kotlin
// Import necessary libraries
import com.payclip.blaze.pinpad.sdk.domain.builder.payment.ClipPayment
import com.payclip.blaze.pinpad.sdk.domain.listener.payment.PaymentListener
import kotlinx.coroutines.flow.MutableStateFlow
import android.app.Activity
import android.os.Bundle

class PaymentActivity : Activity() {

    private lateinit var clipPayment: ClipPayment
    private val loadingState = MutableStateFlow(false) // Manage loading state

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_payment)

        // Configure ClipPayment with additional parameters
        clipPayment = ClipPayment.Builder()
            .isAutoReturnEnabled(true) // Enable auto return to app
            .isTipEnabled(true) // Show tip screen
            .addListener(object : PaymentListener {
                override fun onSuccess(result: PaymentResult) {
                    // Handle payment success
                }

                override fun onCancelled() {
                    // Handle payment cancelled
                }

                override fun onFailure(code: String) {
                    // Handle payment failure
                }
            })
        .build()
	clipPayment.setPaymentHanlder(this@MainActivity)


    }
private fun launchPayment() {
        // Amount to charge
        val amount = 100.00f

        // Descriptive message about the payment
        val description = "Order1234"

        // Launch the payment process
        clipPayment.start(description,amount)
    }
}
```

## Compose

```kotlin
@Composable
private fun PayButton(
   viewModel: PaymentViewModel,
   isAutoReturnEnabled: Boolean,
   isRetryEnabled: Boolean,
   isShareEnabled: Boolean,
   isMSIEnabled: Boolean,
   isMCIEnabled: Boolean,
   isDCCEnabled: Boolean,
   isTipEnabled: Boolean,
   isAutoPrintReceiptEnabled: Boolean,
   isSplitPaymentEnabled: Boolean,
   clipUserAccount: String,
   clipPasswordAccount: String
) {
   val client = remember {
       ClipPayment.Builder()
           .isAutoReturnEnabled(isAutoReturnEnabled)
           .isRetryEnabled(isRetryEnabled)
           .isShareEnabled(isShareEnabled)
           .setPaymentPreferences(
             RequestPaymentPreferences(
						 isMSIEnabled = isMSIEnabled,
                   isMCIEnabled = isMCIEnabled,
                   isDCCEnabled = isDCCEnabled,
                   isTipEnabled = isTipEnabled,
                   isAutoPrintReceiptEnabled = isAutoPrintReceiptEnabled,
                   isSplitPaymentEnabled = isSplitPaymentEnabled
               )
           )
           .setLoginCredentials(
               ClipPaymentLogin(
                   userAccount = clipUserAccount,
                   passwordAccount = clipPasswordAccount
               )
           )
           .addListener(viewModel.getPaymentListener())
           .addLoginListener(viewModel.getLoginListener())
           .build()
   }

   client.setPaymentHandler()

   Button(
       onClick = {
           client.start(
               reference = UUID.randomUUID().toString().substring(0, 11),
               amount = viewModel.getAmountDouble()
           )
       }
   ) {
       //...
   }
}

```

Al utilizar estos parámetros de configuración, puedes personalizar el comportamiento del SDK de Clip para que se adapte mejor a las necesidades de tu aplicación y brindar una experiencia de pago fluida para tus usuarios.

> 🚧 Importante
>
> Al utilizar estos parámetros de configuración, puedes personalizar el comportamiento del SDK de Clip para que se adapte mejor a las necesidades de tu aplicación y brindar una experiencia de pago fluida para tus usuarios.

> 📘 ¿Necesitas Ayuda?
>
> Si lo que buscas no está documentado, contáctanos por el siguiente medio:
>
> * Envía un correo electrónico a la dirección <sdk@payclip.com>.