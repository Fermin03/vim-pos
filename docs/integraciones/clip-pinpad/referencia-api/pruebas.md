<!-- fuente: https://developer.clip.mx/reference/pruebas · capturado 2026-10-08 -->

---
updatedAt: 2026-07-17T18:59:24.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Pruebas / Sandbox

En Clip tienes la opción de crear unas credenciales de prueba, las cuáles te permiten probar algunos de nuestras APIs en un entorno seguro y sin datos reales, de tal manera que puedas realizar todo el flujo de pago sin necesidad de crear transacciones reales.

## APIs compatibles

Las APIs compatibles son las siguientes:

* [API de checkout transparente](https://developer.clip.mx/reference/introduccion-al-checkout-transparente), incluyendo los endpoints:
  * [Generar un card token](https://developer.clip.mx/reference/generatecardtoken)
  * [Realizar un pago](https://developer.clip.mx/reference/realizarpago)
  * [Obtener una lista de transacciones](https://developer.clip.mx/reference/obtenertransacciones)
  * [Obtener detalles de una transacción](https://developer.clip.mx/reference/obtenerdetalletransaccion)
  * [Obtener métodos de pago](https://developer.clip.mx/reference/obtenermetodosdepago)
  * [Obtener cuotas mensuales](https://developer.clip.mx/reference/obtenercuotasmensuales)
* [API de reembolsos](https://developer.clip.mx/reference/introduccion-api-de-reembolsos), incluyendo los endpoints
  * [Solicitar reembolsos](https://developer.clip.mx/reference/createrefund)
  * [Consultar la información de un reembolso](https://developer.clip.mx/reference/getrefund)
* [SDK de checkout transparente](https://developer.clip.mx/reference/introduccion-al-sdk-de-checkout-transparente)

<br />

Cualquier otra API que no se encuentre en esta lista no funcionará en el modo de prueba. Sin embargo te invitamos a seguir al pendiente ya que iremos se irá actualizando.

<br />

## Cómo generar las credenciales de prueba

Desde tu cuenta Clip ingresa al [panel de desarrolladores](https://dashboard.developer.clip.mx/applications)seleccionando la última opción del menú de la izquierda:

<Image src="https://files.readme.io/f387142-sandbox1.png" align="left" width="200px" border={true} wrap={true} />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

Una vez en el panel de desarrollador tendrás acceso a la sección de credenciales, en donde podrás crear tus credenciales tanto productivas como de prueba:

<Image src="https://files.readme.io/e24a852-sandbox2.png" align="center" border={true} />

<br />

Selecciona "Crear credencial":

<Image src="https://files.readme.io/9c582b6-sandbox3.png" align="left" border={true} wrap={true} />

<br />

<br />

<br />

<br />

<br />

<br />

Asígnale un nombre a esas credenciales y dale click en "Crear":

<Image src="https://files.readme.io/1a5b376-sandbox4.png" align="left" border={true} wrap={true} />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

<br />

¡Listo! Tus credenciales de prueba han sido creadas. En este caso únicamente necesitaras copiar la Clave API:

<Image src="https://files.readme.io/1e6e79d-sandbox5.png" align="center" border={true} />

<br />

<br />

Por último, agrega el prefijo "Bearer" al principio de esta forma:

```javascript
Bearer test_6e107925-dbe0-479e-a8b8-0d93ced3c502
```

<br />

<br />

<Callout icon="📘" theme="info">
  ### Puedes crear hasta un máximo de 6 credenciales de prueba y 6 credenciales de producción.
</Callout>

<br />

<br />

## Cómo usar las credenciales de prueba

En el header de Authorization donde normalmente pondrías tu token de autenticación, únicamente tienes que reemplazarlo por tus credenciales de prueba de esta forma:

```json
--header 'Authorization: Bearer test_6e107925-dbe0-479e-a8b8-0d93ced3c502'
```

El API de inmediato detectará que estas accediendo al ambiente de pruebas.

<Callout icon="🚧" theme="warn">
  ### Recuerda que las credenciales de prueba solo funcionan con las APIs mencionadas al principio de esta sección.
</Callout>

<br />

<br />

## Tarjetas de prueba

Para realizar pruebas con el endpoint de [POST /payments](https://developer.clip.mx/reference/realizarpago) deberás usar las tarjetas de prueba que se muestran abajo. Estas son tarjetas diseñadas para replicar distintos escenarios con distintos emisores y tipos de tarjeta.

El número de la tarjeta lo tienes que copiar tal cual se muestra, el CVV puede ser cualquier número inventado por ti, y para la fecha de expiración solo tienes que agregar cualquier fecha posterior al día en curso.

<br />

<Callout icon="📘" theme="info">
  ### Para poder probar con tarjetas internacionales, ya sean de sandbox o de tus clientes, recuerda que es necesario [verificar tu identidad](https://developer.clip.mx/reference/kyc) desde la aplicación.
</Callout>

<br />

<HTMLBlock>{`
 <style type="text/css">
  @import url('https://themes.googleusercontent.com/fonts/css?kit=bI_Gc1PWC8t0lAlDZHzCYto0Zrc4dKrZ3w3rWMnBg_xdW0rLHhFSksIhV-jPNnvG');

  table td, table th {
    padding: 0
  }

  .c1, .c6, .c12, .c13, .c19 {
    border-right-style: solid;
    padding: 5pt 5pt 5pt 5pt;
    border-bottom-color: #000000;
    border-top-width: 1pt;
    border-right-width: 1pt;
    border-left-color: #000000;
    vertical-align: middle;
    border-right-color: #000000;
    border-left-width: 1pt;
    border-top-style: solid;
    border-left-style: solid;
    border-bottom-width: 1pt;
    border-top-color: #000000;
    border-bottom-style: solid
  }

  .c1 { width: 13.4pt; }
  .c6 { width: 16.5pt; }
  .c12 { width: 183pt; }
  .c13 { width: 48pt; vertical-align: top; }
  .c19 { width: 114pt; }

  .c3 {
    color: #000000;
    font-weight: 400;
    text-decoration: none;
    vertical-align: baseline;
    font-size: 10pt;
    font-family: "Barlow";
    font-style: normal
  }

  .c7, .c16 {
    padding-top: 0pt;
    padding-bottom: 0pt;
    line-height: 1.0;
    text-align: left;
  }

  .c16 { text-align: center; }

  .c10, .c14 {
    font-size: 10pt;
    font-family: "Barlow";
    font-weight: 700;
  }

  .c11 { background-color: #d9d9d9; }
  .c18 { background-color: #ffffff; }

  .c25, .c30 {
    height: 21.8pt;
  }

  .c35 {
    margin-left: auto;
    border-spacing: 0;
    border-collapse: collapse;
    margin-right: auto
  }
</style>
<table class="c35">
  
  
   <tr class="c30">
    <td class="c19 c11" colspan="3" rowspan="1">
      <p class="c16"><span class="c14">PAN</span></p>
    </td>
    <td class="c11 c12" colspan="1" rowspan="1">
      <p class="c16"><span class="c14">Banco</span></p>
    </td>
    <td class="c13 c11" colspan="1" rowspan="1">
      <p class="c16"><span class="c14">Tipo</span></p>
    </td>
    <td class="c12 c11" colspan="1" rowspan="1">
      <p class="c16"><span class="c14">Bandera</span></p>
    </td>
    <td class="c13 c11" colspan="1" rowspan="1">
      <p class="c16"><span class="c14">País</span></p>
    </td>
    <td class="c13 c11" colspan="1" rowspan="1">
      <p class="c16"><span class="c14">Status</span></p>
    </td>
    <td class="c13 c11" colspan="1" rowspan="1">
      <p class="c16"><span class="c14">Reason</span></p>
    </td> 
  </tr>
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">377770358335399</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">AEB MEXICO SA-SERVE PLATFORM</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Debit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Amex</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Paid</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3"></span>
      </p>
    </td>  
  </tr>
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">377770541774520</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">AEB MEXICO SA-SERVE PLATFORM</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Debit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Amex</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Not sufficient funds</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">377770520127013</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">AEB MEXICO SA-SERVE PLATFORM</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Debit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Amex</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Do not honor</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">377770887509613</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">AEB MEXICO SA-SERVE PLATFORM</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Debit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Amex</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Restricted card</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">377770935123896</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">AEB MEXICO SA-SERVE PLATFORM</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Debit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Amex</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Exceeds withdrawal amount limit</span>
      </p>
    </td>  
  </tr>
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">349028833584288</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">AMERICAN EXPRESS COMPANY</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Debit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Amex</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">US</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Paid</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3"></span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">349028153670097</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">AMERICAN EXPRESS COMPANY</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Debit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Amex</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">US</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Not sufficient funds</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">349028915463054</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">AMERICAN EXPRESS COMPANY</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Debit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Amex</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">US</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Do not honor</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">349028444099841</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">AMERICAN EXPRESS COMPANY</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Debit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Amex</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">US</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Restricted card</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">349028694976300</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">AMERICAN EXPRESS COMPANY</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Debit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Amex</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">US</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Exceeds withdrawal amount limit</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">379907880667372</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">AMEXBANK</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Credit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Amex</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Paid</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3"></span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">379907148479842</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">AMEXBANK</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Credit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Amex</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Not sufficient funds</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">379907289747023</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">AMEXBANK</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Credit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Amex</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Do not honor</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">379907456170025</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">AMEXBANK</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Credit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Amex</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Restricted card</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">379907519095607</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">AMEXBANK</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Credit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Amex</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Exceeds withdrawal amount limit</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">349996347610601</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">AMERICAN EXPRESS COMPANY</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Credit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Amex</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">US</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Paid</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3"></span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">349996704195386</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">AMERICAN EXPRESS COMPANY</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Credit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Amex</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">US</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Not sufficient funds</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">349996210951538</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">AMERICAN EXPRESS COMPANY</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Credit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Amex</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">US</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Do not honor</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">349996436877459</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">AMERICAN EXPRESS COMPANY</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Credit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Amex</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">US</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Restricted card</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">349996943913540</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">AMERICAN EXPRESS COMPANY</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Credit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Amex</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">US</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Exceeds withdrawal amount limit</span>
      </p>
    </td>  
  </tr>
  
  


  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">4436968353241031</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">BANK OF THE WEST</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Debit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Visa</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">US</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Paid</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3"></span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">4436965656541760</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">BANK OF THE WEST</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Debit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Visa</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">US</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Not sufficient funds</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">4436968834203659</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">BANK OF THE WEST</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Debit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Visa</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">US</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Do not honor</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">4436969496650369</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">BANK OF THE WEST</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Debit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Visa</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">US</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Restricted card</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">4436965538616277</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">BANK OF THE WEST</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Debit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Visa</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">US</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Exceeds withdrawal amount limit</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">4746469153355902</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">CIBANCO PR</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Prepaid</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Visa</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Paid</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3"></span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">4746464772355300</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">CIBANCO PR</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Prepaid</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Visa</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Do not honor</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">4746467113246237</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">CIBANCO PR</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Prepaid</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Visa</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Restricted card</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">4746462229056935</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">CIBANCO PR</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Prepaid</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Visa</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Exceeds withdrawal amount limit</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">4555128482797669</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">BBVA BANCOMER SA</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Credit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Visa</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Paid</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3"></span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">4555126387272952</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">BBVA BANCOMER SA</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Credit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Visa</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Not sufficient funds</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">4555124951976546</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">BBVA BANCOMER SA</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Credit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Visa</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Do not honor</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">4555126464792591</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">BBVA BANCOMER SA</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Credit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Visa</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Restricted card</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">4555127277126233</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">BBVA BANCOMER SA</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Credit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Visa</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Exceeds withdrawal amount limit</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">4065503514846523</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">NEVADA STATE BANK</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Credit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Visa</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">US</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Paid</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3"></span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">4065507860853728</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">NEVADA STATE BANK</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Credit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Visa</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">US</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Not sufficient funds</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">4065508500608936</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">NEVADA STATE BANK</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Credit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Visa</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">US</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Do not honor</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">4065508992011896</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">NEVADA STATE BANK</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Credit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Visa</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">US</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Restricted card</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">4065505330411929</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">NEVADA STATE BANK</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Credit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Visa</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">US</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Exceeds withdrawal amount limit</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">5581168067405507</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">UNION BANK COMPANY THE</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Debit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">MasterCard</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">US</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Paid</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3"></span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">5581161719999118</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">UNION BANK COMPANY THE</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Debit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">MasterCard</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">US</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Not sufficient funds</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">5581162926959622</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">UNION BANK COMPANY THE</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Debit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">MasterCard</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">US</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Do not honor</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">5581165965928960</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">UNION BANK COMPANY THE</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Debit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">MasterCard</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">US</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Restricted card</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">5581166638502158</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">UNION BANK COMPANY THE</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Debit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">MasterCard</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">US</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Exceeds withdrawal amount limit</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">5241739156938129</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">SI VALE</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Prepaid</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">MasterCard</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Paid</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3"></span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">5241738495336110</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">SI VALE</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Prepaid</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">MasterCard</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Not sufficient funds</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">5241736984606092</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">SI VALE</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Prepaid</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">MasterCard</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Do not honor</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">5241732108979242</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">SI VALE</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Prepaid</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">MasterCard</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Restricted card</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">5241738955054229</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">SI VALE</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Prepaid</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">MasterCard</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Exceeds withdrawal amount limit</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">5177136199824515</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">SANTANDER MEXICO</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Credit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">MasterCard</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Paid</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3"></span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">5177134282349839</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">SANTANDER MEXICO</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Credit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">MasterCard</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Not sufficient funds</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">5177132762165477</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">SANTANDER MEXICO</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Credit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">MasterCard</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Do not honor</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">5177137336291766</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">SANTANDER MEXICO</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Credit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">MasterCard</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Restricted card</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">5177131151610598</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">SANTANDER MEXICO</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Credit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">MasterCard</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Exceeds withdrawal amount limit</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">5216509312757445</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">FIRST NATIONAL BANK OF OMAHA</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Credit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">MasterCard</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Paid</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3"></span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">5216505450131153</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">FIRST NATIONAL BANK OF OMAHA</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Credit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">MasterCard</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">US</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Not sufficient funds</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">5216506995049843</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">FIRST NATIONAL BANK OF OMAHA</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Credit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">MasterCard</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">US</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Do not honor</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">5216502876379557</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">FIRST NATIONAL BANK OF OMAHA</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Credit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">MasterCard</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">US</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Restricted card</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">5216507997638146</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">FIRST NATIONAL BANK OF OMAHA</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Credit</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">MasterCard</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">US</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Exceeds withdrawal amount limit</span>
      </p>
    </td>  
  </tr>
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">4208318689081956</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">TOKA INVESTMENT PR</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Debit (Valera)</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Visa</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Paid</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3"></span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">4208312218017433</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">TOKA INVESTMENT PR</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Debit (Valera)</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Visa</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Not sufficient funds</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">4208316178021657</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">TOKA INVESTMENT PR</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Debit (Valera)</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Visa</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Do not honor</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">4208316706262831</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">TOKA INVESTMENT PR</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Debit (Valera)</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Visa</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Restricted card</span>
      </p>
    </td>  
  </tr>
  
  
  
  
  
   <tr class="c25">
    <td class="c19" colspan="3" rowspan="1">
      <p class="c7">
        <span class="c14 c10">4208318842645341</span>
      </p>
    </td>
    <td class="c12" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">TOKA INVESTMENT PR</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Debit (Valera)</span>
      </p>
    </td>
    <td class="c13" colspan="1" rowspan="1">
      <p class="c16">
        <span class="c3">Visa</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">MX</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Rejected</span>
      </p>
    </td>
    <td class="c8" colspan="1" rowspan="1">
      <p class="c7">
        <span class="c3">Exceeds withdrawal amount limit</span>
      </p>
    </td>  
  </tr>
  
  
  
</table>
`}</HTMLBlock>

<br />