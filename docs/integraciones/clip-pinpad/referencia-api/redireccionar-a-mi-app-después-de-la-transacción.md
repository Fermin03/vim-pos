<!-- fuente: https://developer.clip.mx/reference/redireccionar-a-mi-app-después-de-la-transacción · capturado 2026-10-08 -->

---
updatedAt: 2025-11-06T21:55:54.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Redireccionar a mi App Después de la Transacción

Al realizar una solicitud de cobro puedes utilizar el **preference redirect\_package\_name**\
para que al finalizar la transacción pin pad app pueda abrir la aplicación antes definida que se encuentre dentro de la terminal.

Cuando define en el POST la siguiente preference:

```json
"preferences": {
       // ...   
       "redirect_package_name": "com.myCompany.myAppInPOS"
   }


```

La terminal tomará el valor de esta preferencia e independientemente del estatus de la transacción al finalizarse abrirá la app definida por el packageName solicitado.

<Image align="center" border={false} src="https://files.readme.io/108076680ad5114bf339ec53483a44bed41ba06f28c5111d10cc25cf51141a00-Captura_de_pantalla_2025-09-09_a_las_5.18.13_p.m..png" />

## Prerrequisitos:

* Tener una app instalada dentro de la terminal Clip que coincida con el packageName al que quieres redirigir.

## Descripción de flujo

1. Desde tu sistema o desde la app se realiza una petición POST con el preference **redirect\_package\_name**.
   1. En caso de que la petición la realices desde tu app puedes abrir la app de Pin Pad sin necesidad de utilizar el SDK utilizando solo un intent básico hacia el package “com.payclip.blaze.pinpad” . (Para más información,  visita la [documentación de android](https://developer.android.com/guide/components/intents-filters?hl=es-419#ExampleSend))
2. Pin Pad app recibirá la solicitud de cobro y comenzará a transaccionar de manera normal.
3. En caso de que la solicitud contenga el **preference redirect\_package\_name** lanzará la app definida al terminar la transacción, de lo contrario regresará a la vista inicial de Clip Pin Pad.

<br />

> 📘 ¿Necesitas Ayuda?
>
> Si lo que buscas no está documentado, contáctanos por el siguiente medio:
>
> * Envía un correo electrónico a la dirección <sdk@payclip.com>.

<br />