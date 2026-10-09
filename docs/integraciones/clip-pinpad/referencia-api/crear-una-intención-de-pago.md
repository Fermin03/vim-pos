<!-- fuente: https://developer.clip.mx/reference/crear-una-intención-de-pago · capturado 2026-10-08 -->

---
updatedAt: 2025-10-31T00:31:59.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Crear una Intención de Pago

Una vez que hayas instanciado el cliente y configurado el manejador de pagos, puedes iniciar el proceso de pago. El método de inicio de pago requiere dos parámetros: el monto a cobrar y un mensaje descriptivo sobre el pago.

## Pasos para Iniciar un Pago

1. Asegúrate de que el Cliente y el Manejador de Pagos estén Inicializados
   * Confirma que el cliente y el manejador de pagos hayan sido configurados correctamente como se describe en la sección [Configuración del Cliente](https://developer.clip.mx/reference/configuraci%C3%B3n-del-cliente)
2. Llama al Lanzador de Pagos
   * Utiliza el manejador de pagos para comenzar el proceso de pago proporcionando los parámetros necesarios.
     ```
     scope.launch {
         client.start(
           reference = REFERENCE,
     			amount = AMOUNT,
         )
     }
     ```

## Creando tu primer pago en Terminales Clip con sistema operativo Android

> 🚧 Importante
>
> Los Lectores Clip con sistema operativo Android son:
>
> * [Clip Pro 2](https://shop.clip.mx/products/clip-pro-2)
> * [Clip Total 2](https://shop.clip.mx/products/clip-total-2)

1. Iniciando el flujo de pago de Clip desde tu aplicación, podemos invocar al lanzador con el monto y un mensaje.

<Image align="center" border={false} src="https://files.readme.io/63ba2a585e4d51052450c242abb3e56904e6b3059792b2a0c4a0336151d9738b-Captura_de_pantalla_2025-10-14_a_las_1.08.08_p.m..png" />

2. Continuamos con un ejemplo de propinas para el flujo actual de ventas.

<Image align="center" border={false} src="https://files.readme.io/d56de3949a24cb24a7c7307e3650de850a13e89a87ddfcba7052b33d6a7afc37-Captura_de_pantalla_2025-10-14_a_las_1.10.55_p.m..png" />

3. Seguido, con el proceso de pago con tarjeta mediante método de contacto sin contacto o banda.

<Image align="center" border={false} src="https://files.readme.io/d8eb4b5c7bf7dc783a94b8f4cc8e13a9470cc8ef2c57d62a5e4d2f5a59e4bfe8-Captura_de_pantalla_2025-10-14_a_las_1.11.51_p.m..png" />

Si el proceso de pago es mediante una tarjeta con chip, procedemos con la solicitud del NIP

<Image align="center" border={false} width="390px" src="https://files.readme.io/f6cbb586a505817b7c01c62c0f0783549bd0e44b32020d03bb59abdfbac3bca1-Captura_de_pantalla_2025-10-14_a_las_1.13.30_p.m..png" />

4. A continuación, procesamos el pago para continuar con el resultado del mismo.

<Image align="center" border={false} width="390px" src="https://files.readme.io/905fc1ee95dd975d48f61d27ec1f578a51f65951dd51f4a751e27425946c4fb8-Captura_de_pantalla_2025-10-14_a_las_1.16.34_p.m..png" />

## Creando tu primer pago en Terminales Clip sin sistema operativo Android

> 🚧 Importante
>
> El Lector Clip sin sistema operativo Android es:
>
> * [Clip Plus 2](https://shop.clip.mx/products/clip-plus-2)

1. Iniciando el flujo de pago de Clip desde tu aplicación en el dispositivo Android preparado para trabajar.

<Image align="center" border={false} width="390px" src="https://files.readme.io/05dd9effc0e3f50c6811cdaf7b23bbc8703a0586e9e9b8f4149fa6789e7ae2de-Captura_de_pantalla_2025-10-14_a_las_1.27.25_p.m..png" />

> 📘 Para solicitar la app de PinPad, contactanos al correo <sdk@payclip.com>

2. Inicia sesión en la aplicación de PinPad con tu correo previamente registrado en Clip.mx y tu contraseña, poder consumir el SDK necesitas verificar tu identidad con Clip. Puedes encontrar más información sobre cómo verificar tu identidad [aquí](https://developer.clip.mx/reference/kyc#/).

<Image align="center" border={false} src="https://files.readme.io/2248e7c6db40341ed51cf23e3730c69945131c34d9e4c1210cba0370c2460b6e-Captura_de_pantalla_2025-10-14_a_las_1.28.44_p.m..png" />

3. Una vez envida la solicitud de cobro, conecta tu Clip Plus 2 para concretar la venta

<Image align="center" border={false} src="https://files.readme.io/f4319816bc08cf2ec89360c93bef451eba7ff9136f053fb2c8d3a42b75f0ba7b-Captura_de_pantalla_2025-10-14_a_las_1.38.26_p.m..png" />

<br />

> 📘 ¿Necesitas Ayuda?
>
> Si lo que buscas no está documentado, contáctanos por el siguiente medio:
>
> * Envía un correo electrónico a la dirección <sdk@payclip.com>.

<br />