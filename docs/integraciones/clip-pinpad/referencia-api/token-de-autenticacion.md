<!-- fuente: https://developer.clip.mx/reference/token-de-autenticacion · capturado 2026-10-08 -->

---
updatedAt: 2026-09-18T23:11:58.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Token de autenticación

El *token de autenticación* te permite validar tu identidad y tener acceso a nuestras APIs. El token de autenticación debe ser ingresado en el campo **x-api-key** o **authorization** dependiendo de la API que estés consumiendo.

En este tutorial aprenderás a generar tu token de autenticación con base64. Para ello necesitas primero obtener tu *API key* y *clave secreta*.

Este es un ejemplo de cómo se verá tu token de autenticación al finalizar este tutorial:

```
Basic <TOKEN_DE_EJEMPLO_OMITIDO>

```

<br />

En las siguientes secciones describimos los pasos para la obtención de la API key y la clave secreta y después te ofrecemos tres métodos para generar tu token de autenticación.

<br />

## 1. Obtén tu API key y clave secreta

<br />

<Callout icon="🚧" theme="warn">
  ### Importante

  Puedes crear un máximo de 6 aplicaciones (Producción y Pruebas).<br />Cada aplicación cuenta con su propio par de API Key y Clave Secreta.
</Callout>

<br />

En esta sección te mostraremos cómo crear un nuevo set de API key y clave secreta.

1. Ingresa al [Panel de Desarrollador](https://dashboard.clip.mx/dashboard) dentro del Panel de Clip.

   <Image src="https://files.readme.io/2e591a6-sandbox1.png" align="center" />

2. Una vez en el panel de desarrollador tendrás acceso a la sección de credenciales, en donde podrás crear tus credenciales tanto productivas como de prueba:

   <Image src="https://files.readme.io/0c89390-sandbox2.png" align="center" />

3. Selecciona "Crear credencial":

   <Image src="https://files.readme.io/ea00aea-sandbox3.png" align="center" />

4. Asígnale un nombre a esas credenciales, sin espacios ni caracteres especiales:<br />

   <Image src="https://files.readme.io/759f975f718c31026af8af01345d98ddbf0ea6f937b3d0f17c7e07377ff23e3c-Captura_de_pantalla_2026-09-18_163708.png" align="center" />

5. &#x20;Selecciona el uso que le darás a esa credencial:<br />

   <Image src="https://files.readme.io/e91fe66a1e74ef543f3ba453a151d84254fc1c21e80b840e06d0a63af27def22-Captura_de_pantalla_2026-09-18_163953.png" align="center" />

6. Si seleccionaste e&#x6C;**&#x20;uso&#x20;**&#x70;ara **Tienda online**, no olvides colocar el **dominio público real de tu tienda**:<br />

   <Image src="https://files.readme.io/0ed73b6655c0bfdf24b925fe76e55712e0135739f1eaa0a71f55c6469cd6ef83-Captura_de_pantalla_2026-09-18_164748.png" align="center" />

7. Acepta los Términos y Condiciones, por último haz clic en "Crear":<br />

   <Image src="https://files.readme.io/84d3bd9018360db38d23efa39c9b05c5e5a70de41017e11445fae8996d24db97-Captura_de_pantalla_2026-09-18_165253.png" align="center" />

8. Copia y guarda tu Clave Api y Clave secreta en algún lugar seguro:<br /><br />

   <Image src="https://files.readme.io/54a44a4adb41bd694ffa921179805da9b35459d4a6249cf398410864bebb151a-Captura_de_pantalla_2026-09-18_165341.png" align="center" />

<Callout icon="🚧" theme="warn">
  ### Importante

  Por motivos de seguridad, la clave secreta sólo se puede consultar la primera vez que la obtienes. **Cópiala y guárdala en un lugar seguro**. Si pierdes acceso a tu clave secreta, deberá&#x73;**&#x20;generar una nueva**.

  Si necesitas obtener una **nueva API key**, deberás **eliminar la actual de la lista** y c**rear una nueva**.
</Callout>

<br />

## 2. Crea un token de autenticación con codificación Base64

Después de obtener  tu API key y clave secreta podrás generar tu token de autenticación. A continuación te mostraremos tres formas de generar tu token.

<br />

### 2.1 Generador de token de autenticación

Ingresa tu API key y clave secreta en este formulario:

<HTMLBlock>{`
<html>
	<head>
	<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
	<title>Clip Auth Token Generator</title>
	</head>
	<body class="container">		
		<form>
			<label class="form-label">API KEY: </label>
			<input type="text" id="api_key" name="api_key" class="form-control" placeholder="INGRESA TU API KEY"><br>
			<br>
			<label class="form-label">CLAVE SECRETA: </label>
			<input type="text" id="api_secret" name="api_secret" class="form-control" placeholder="INGRESA TU SECRET KEY"><br>
			<br>
			<label id="token_label" class="form-label">TOKEN</label>
			<input type="text" id="generated_token" name="generated_token" class="form-control" readonly="true" style="width: 400px"><br>
			<br>
			<button  onclick="generarToken()" id="create_token" type="button" class="btn btn-primary" 
              data-clipboard-target="#generated_token">
			Crear Token
			</button>     
     
      
		</form>		
	</body>
</html>
`}</HTMLBlock>

<br />

### 2.2 Línea de comando

1. Copia y pega la siguiente instrucción en una terminal:

```shell
echo -n Tu_API_Key:Tu_Clave_Secreta | base64
```

<br />

Este es un ejemplo de cómo se verá ejecutado en una terminal:

<Image src="https://files.readme.io/62532f7-terminal_example.png" alt="1454" align="center" width="smart" />

<br />

2. Copia la clave generada y agrega el prefijo *'Basic'*, seguido de un espacio como se muestra a continuación. Este es tu *token de autenticación*, guárdalo en un lugar seguro.

```
Basic <TOKEN_DE_EJEMPLO_OMITIDO>
```

<br />

### 2.3 Consola del navegador

Para crear tu token de autenticación desde la consola de tu navegador, utiliza el siguiente script:

```javascript
let api_key= "Tu_API_Key";
let api_secret= "Tu_Clave_secreta";
let b64 = btoa(unescape(encodeURIComponent(api_key + ":" + api_secret)));
console.log(`Basic ${b64}`)
```

<br />

El cual responde con tu token de autenticación

```
Basic <TOKEN_DE_EJEMPLO_OMITIDO>
```

<br />

A continuación te mostramos un ejemplo de este método:

<Image src="https://files.readme.io/116199a-Browser_console_example.png" alt="1104" align="center" width="smart" />