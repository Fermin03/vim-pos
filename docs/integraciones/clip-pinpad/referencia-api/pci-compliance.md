<!-- fuente: https://developer.clip.mx/reference/pci-compliance · capturado 2026-10-08 -->

---
updatedAt: 2025-09-29T20:13:58.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# PCI Compliance

El Estándar de seguridad de datos de la industria de tarjetas de pago (PCI DSS) es un conjunto de estándares de seguridad diseñados para garantizar que todas las empresas que aceptan, procesan, almacenan o transmiten información de tarjetas de crédito mantengan un entorno seguro.

<br />

## ¿Quién debe cumplir con PCI?

Si aceptas tarjetas de crédito de tus clientes, debes cumplir con PCI.

Algunas pasarelas de pago y soluciones de procesamiento de pagos en línea pueden afirmar que su solución para cobro de tarjeta de crédito te excluye de preocuparte por el cumplimiento de PCI. Esto no es verdad. Incluso si utilizas un servicio de terceros para manejar la obtención, el procesamiento y el almacenamiento de los datos protegidos del titular de la tarjeta, aún así debes de seguir el proceso de certificación necesario.

Las soluciones de terceros te permiten cumplir con los estándares PCI de una forma más sencilla que si estuvieras procesando y almacenando los datos de la tarjeta directamente, pero aún así te debes certificar cada año. Si bien es de gran ayuda contar con una solución ágil y segura como Clip, aún así es tu responsabilidad cumplir con esta certificación.

<br />

## Prueba de cumplimiento de PCI

Lo que necesitas para demostrar tu cumplimiento con PCI depende de tu banco adquirente, y pueden influir varios factores, incluida la cantidad de transacciones que procesas anualmente. Si procesas menos de 6 millones de transacciones por esquema (Visa, MasterCard) por año, podrás realizar una autoevaluación completando uno de los Cuestionarios de autoevaluación (SAQ) de PCI DSS; Se trata de una herramienta de autoevaluación para evaluar la seguridad de los datos de los titulares de tarjetas.

<br />

## ¿Cómo me autoevalúo?

Realizar una autoevaluación de cumplimiento de los estándares PCI requiere que completes un cuestionario y, dependiendo de la categoría de autoevaluación en la que te encuentres, un análisis de seguridad trimestral de tus sistemas realizado por un proveedor externo.

Actualmente existen ocho categorías de autoevaluación, pero no todas son aplicables a los comercios en línea. Tu nivel de PCI dependerá en última instancia de cómo captures y trabajes con los datos de la tarjeta de crédito. Al utilizar un servicio de terceros deberás completar un SAQ A o SAQ D. Consulta la siguiente tabla para obtener más información:

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

  .c16 { text-align: left; }

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

<table class="c27">
  
  
  <tr class="c30">
    <td class="c29 c11" colspan="1" rowspan="1">
      <p class="c16"><span class="c14 c17">SI TU SISTEMA...</span></p>
    </td>
    <td class="c2 c11" colspan="1" rowspan="1">
      <p class="c16"><span class="c14 c17">ENTONCES USA...</span></p>
    </td>
    <td class="c21 c11" colspan="1" rowspan="1">
      <p class="c16"><span class="c14 c17">COMPLEJIDAD</span></p>
    </td>
  </tr>
  
  
  
  <tr class="c25">
    <td class="c29" colspan="1" rowspan="1">
      <p class="c16"><span class="c3">No toca, procesa, ni almacena datos del titular de la tarjeta, y no tiene ningún formulario de recolección de datos de tarjetas (como en la  <a href="https://developer.clip.mx/reference/generatecardtoken">API de card token</a>, por ejemplo)</span></p>
    </td>
    <td class="c2" colspan="1" rowspan="1">
      <p class="c7"><span class="c3">SAQ A</span></p>
    </td>
    <td class="c24" colspan="1" rowspan="1">
      <p class="c7"><span class="c3">Baja</span></p>
    </td>
  </tr>
  <tr class="c25">
    <td class="c29" colspan="1" rowspan="1">
      <p class="c16"><span class="c3">Toca, procesa o almacena datos de titulares de tarjetas</span></p>
    </td>
    <td class="c2" colspan="1" rowspan="1">
      <p class="c7"><span class="c3">SAQ D</span></p>
    </td>
    <td class="c24" colspan="1" rowspan="1">
      <p class="c7"><span class="c3">Alta</span></p>
    </td>
  </tr>
  
</table>
`}</HTMLBlock>

<br />

## Matriz de responsabilidad

Como se indica en la declaración de cumplimiento, Clip cumple con todos los requisitos de PCI DSS. Los comercios son responsables de su propio cumplimiento de PCI DSS.

Algunos requisitos de PCI DSS pueden cumplirse mediante el uso por parte del comercio del checkout transparente de Clip. Sin embargo, la mayoría de los requisitos son responsabilidades compartidas entre el comercio y Clip, o responsabilidad exclusiva del comercio. Las siguientes secciones describen las responsabilidades que Clip asume por los servicios ofrecidos y las responsabilidades del comercio al utilizar el servicio de checkout transparente.

<br />

### API

Antes de integrar la API de Card Token, si cuentas con la certificación PCI, debes conocer las siguientes responsabilidades entre Clip y tú como comercio:

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
  .c12 { width: 183pt;}
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

  .c16 { text-align: left; }

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
    <td class="c19 c11" colspan="1" rowspan="2">
      <p class="c16"><span class="c14">REQUERIMIENTO</span></p>
    </td>
    <td class="c11 c12" colspan="1" rowspan="2">
      <p class="c16"><span class="c14">ESTATUS DE CUMPLIMIENTO DE CLIP</span></p>
    </td>
    <td class="c13 c11" colspan="5" rowspan="1">
      <p class="c16"><center><span class="c14">RESUMEN DE RESPONSABILIDADES</span></center></p>
    </td>    
  </tr>
  <tr class="c30">
  	<td class="c13 c11" colspan="1" rowspan="1">
      <p class="c16"><span class="c14">CLIP</span></p>
    </td>
    <td class="c13 c11" colspan="1" rowspan="1">
      <p class="c16"><span class="c14">COMERCIO</span></p>
  	</td>
    <td class="c13 c11" colspan="1" rowspan="1">
      <p class="c16"><span class="c14">AMBOS</span></p>
  	</td>
    <td class="c13 c11" colspan="1" rowspan="1">
      <p class="c16"><span class="c14">RESPONSABILIDAD DE CLIP</span></p>
  	</td>
    <td class="c13 c11" colspan="1" rowspan="1">
      <p class="c16"><span class="c14">RESPONSABILIDAD DEL COMERCIO</span></p>
  	</td>
  </tr>

  
  
  <tr class="c25">
    <td class="c19"><p class="c7"><span class="c3">Requisito 1: Instalar y Mantener los Controles de Seguridad de la Red</span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">Cumple</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">&#9989;</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3">Clip cumple con todos los requisitos de implementación y gestión de controles de seguridad de red (NSC por sus siglas en inglés) para su entorno de datos de titulares de tarjetas.</span></p></td>
    <td class="c12"><p class="c7"><span class="c3">Los Merchants son responsables de aplicar y gestionar los controles de seguridad de la red (NSC por sus siglas en inglés) (como cortafuegos, gruops de seguridad, ACL, etc.), mantener diagramas de red y diagramas de flujo de datos para su entorno de datos de titulares de tarjetas (CDE). Los Merchants son responsables de garantizar que sus políticas y procedimientos estén documentados y sean conocidos por todas las partes afectadas.</span></p></td>
  </tr>
  
  
  
  <tr class="c25">
    <td class="c19"><p class="c7"><span class="c3">Requisito 2: Aplicar Configuraciones Seguras a Todos los Componentes del Sistema</span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">Cumple</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">&#9989;</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3">Clip desarrolla y mantiene configuraciones seguras y guías de hardening para su entorno de datos de titulares de tarjetas, el cual se encuentra alojado en la nube de AWS.</span></p></td>
    <td class="c12"><p class="c7"><span class="c3">Los Merchants son responsables de documentar las configuraciones seguras y guías de hardening para todos los sistemas dentro de su entorno de datos del titular de la tarjeta. Los Merchants son responsables de la gestión de sus redes, incluidas aquellas con conectividad inalámbrica. Los Merchants son responsables de garantizar que sus políticas y procedimientos estén documentados y sean conocidos por todas las partes afectadas.</span></p></td>
  </tr>
  
  
  
  <tr class="c25">
    <td class="c19"><p class="c7"><span class="c3">Requisito 3: Proteger los Datos de Tarjetahabientes Almacenados</span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">Cumple</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">&#9989;</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3">Clip cumple con todos los requisitos para la protección de los datos de los titulares de tarjetas aplicando el cifrado o truncado en todas las ubicaciones de almacenamiento y visualización aplicables. También gestionando la creación, el uso y la modificación de llaves de cifrado y controles de acceso al servicio de KMS de AWS.</span></p></td>
    <td class="c12"><p class="c7"><span class="c3">Los Merchants son responsables de mantener políticas y procedimientos adecuados para la retención de datos, implementar procesos de cifrado y de gestión de llaves para los datos de los titulares de tarjetas. Los Merchants son responsables de garantizar que sus políticas y procedimientos estén documentados y sean conocidos por todas las partes afectadas.</span></p></td>
  </tr>
  
  
  
  <tr class="c25">
    <td class="c19"><p class="c7"><span class="c3">Requisito 4: Proteger los Datos de Tarjetahabientes con Criptografía Robusta Durante la Transmisión a través de Redes Abiertas y Públicas</span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">Cumple</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">&#9989;</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3">Clip cumple con todos los requisitos de cifrado para todas las conexiones de redes internas y externas que se encuentran dentro de su entorno de datos de titulares de tarjetas.</span></p></td>
    <td class="c12"><p class="c7"><span class="c3">Los Merchants on responsables de aplicar el cifrado en todas las conexiones de red externas que sean aplicables. Los Merchants son responsables de garantizar que sus políticas y procedimientos estén documentados y sean conocidos por todas las partes afectadas.</span></p></td>
  </tr>
  
  
  
  <tr class="c25">
    <td class="c19"><p class="c7"><span class="c3">Requisito 5: Proteger Todos los Sistemas y Redes de Software Malicioso</span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">Cumple</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">&#9989;</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3">Clip cumple con todos los requisitos de implementación de antimalware en las instancias y estaciones de trabajo, que se encuentran dentro de su entorno de datos de titulares de tarjetas y que son administradas por Clip.</span></p></td>
    <td class="c12"><p class="c7"><span class="c3">Los Merchants son responsables de implementar antimalware en todos los sistemas aplicables.</span></p></td>
  </tr>
  
  
  
  
  <tr class="c25">
    <td class="c19"><p class="c7"><span class="c3">Requisito 6: Desarrollar y Mantener Sistemas y Softwares Seguros</span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">Cumple</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">&#9989;</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3">Clip gestiona y mantiene los parches de seguridad, el ciclo de desarrollo y gestiona el porceso de control de cambios de las aplicaciones que se encuentran dentro de su entorno de datos de titulares de tarjetas.</span></p></td>
    <td class="c12"><p class="c7"><span class="c3">Los Merchants son responsables de mantener un proceso de gestión de vulnerabilidades y parches de seguridad, implementar un proceso de control de cambios para todas las configuraciones y el código desarrollado a medida, proteger sus aplicaciones web de los exploits comunes. Si los Merchants desarrollan código personalizado que se utilice para transmitir, procesar o almacenar datos de tarjetas de pago, este debe cumplir con los requisitos para el desarrollo seguro y pruebas. Además, los Merchants son responsables de garantizar que sus políticas y procedimientos estén documentados y sean conocidos por todas las partes afectadas.</span></p></td>
  </tr>
  
  
  <tr class="c25">
    <td class="c19"><p class="c7"><span class="c3">Requisito 7: Restringir el Acceso a los Componentes del Sistema y a los Datos de Tarjetahabientes Según la Necesidad de Conocimiento de la Empresa</span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">Cumple</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">&#9989;</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3">Clip mantiene los controles de acceso hacia sus sistemas e infraestructura alojados en AWS, así como también hacia su entorno de datos de titulares de tarjetas.</span></p></td>
    <td class="c12"><p class="c7"><span class="c3">Los Merchants son responsables de gestionar el acceso a todos los servicios y aplicaciones incluidos en su entorno de datos de titulares de la tarjeta. Además, los Merchants son responsables de garantizar que sus políticas y procedimientos estén documentados y sean conocidos por todas las partes afectadas.</span></p></td>
  </tr>
  
  
  
  <tr class="c25">
    <td class="c19"><p class="c7"><span class="c3">Requisito 8: Identificar a los Usuarios y Autenticar el Acceso a los Componentes del Sistema</span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">Cumple</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">&#9989;</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3">Clip cumple con todos los requisitos proporcionando a cada usuario que puede acceder a su entorno de datos de titulares de tarjetas un identificador único, aplicando procesos de gestión de identidad y accesos, uso de MFA y concientización sobre el manejo correcto de las contraseñas.</span></p></td>
    <td class="c12"><p class="c7"><span class="c3">Los Merchants son responsables de los controles de acceso configurables en sus sistemas, la autenticación multifactor y la cocientización sobre credenciales dentro de su entorno de datos de titulares de la tarjeta. Además, los Merchants son responsables de garantizar que sus políticas y procedimientos estén documentados y sean conocidos por todas las partes afectadas.</span></p></td>
  </tr>
  
  
  
  <tr class="c25">
    <td class="c19"><p class="c7"><span class="c3">Requisito 9: Restringir el Acceso Físico a los Datos de Tarjetahabientes</span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">Cumple a través de AWS</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">&#9989;</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3">Clip cumple con todos los requisitos sobre controles de seguridad física y gestión de soportes de información para su entorno de datos de titulares de tarjetas a través del certificado de cumplimiento de AWS.</span></p></td>
    <td class="c12"><p class="c7"><span class="c3">Los requisitos de seguridad física son responsabilidad de los Merchants.</span></p></td>
  </tr>
  
  
  
  <tr class="c25">
    <td class="c19"><p class="c7"><span class="c3">Requisito 10: Registrar y Supervisar Todos los Accesos a los Componentes del Sistema y a los Datos de Tarjetahabientes</span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">Cumple</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">&#9989;</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3">Clip mantiene y supervisa los registros de auditoría de su entorno de datos de los titulares de tarjetas.</span></p></td>
    <td class="c12"><p class="c7"><span class="c3">Los Merchants son responsables de la configuración y la supervisión de los registros de eventos de seguridad dentro de su entorno de datos de titulares de la tarjeta. Además, los Merchants son responsables de garantizar que sus políticas y procedimientos estén documentados y sean conocidos por todas las partes afectadas.</span></p></td>
  </tr>
  
  
  <tr class="c25">
    <td class="c19"><p class="c7"><span class="c3">Requisito 11: Poner a Prueba Regularmente la Seguridad de los Sistemas y de las Redes</span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">Cumple</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">&#9989;</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3">Clip gestiona el manejo de vulnerabilidades detectadas a través de escaneos de vulnerabilidad y pruebas de penetración. También, gestiona la detección de intrusiones y la supervisión de la integridad de los archivos críticos para su entorno de datos de titulares de tarjetas.</span></p></td>
    <td class="c12"><p class="c7"><span class="c3">Los Merchants son responsables de implantar IPS/IDS, realizar escaneos internos, externos y pruebas de penetración en su entorno de datos de titulares de la tarjeta. Además, los Merchants son responsables de garantizar que sus políticas y procedimientos estén documentados y sean conocidos por todas las partes afectadas.</span></p></td>
  </tr>
  
  
  
  <tr class="c25">
    <td class="c19"><p class="c7"><span class="c3">Requisito 12: Respaldar la Seguridad de la Información con Políticas y Programas Organizacionales</span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">Cumple</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">&#9989;</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3">Clip mantiene políticas y procedimientos de seguridad de la información, concienciación en materia de seguridad de la información, plan de respuesta a incidentes de seguridad y procesos de recursos humanos que se ajustan a los requisitos de PCI DSS.</span></p></td>
    <td class="c12"><p class="c7"><span class="c3">Los Merchants son responsables de mantener políticas y procedimientos de seguridad de la información, brindar concienciación sobre seguridad de la información a su personal, desarrollar y probar un plan de respuesta a incidentes de seguridad y los procesos de recursos humanos que se ajusten a los requisitos de la PCI DSS.</span></p></td>
  </tr>
  
  
  
  <tr class="c25">
    <td class="c19"><p class="c7"><span class="c3">Anexo A1: Requisitos Adicionales de PCI DSS para Proveedores de Servicios Multiusuario</span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">No aplica</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3">No aplica. Clip no es un proveedor de servicios multi-tenant (múltiples usuarios).</span></p></td>
    <td class="c12"><p class="c7"><span class="c3">Si los Merchants son proveedores de servicios Multi-Tenant deben proteger y seperar todos los entornos y datos de los clientes y facilitan el registro y la respuesta a incidentes para todos los clientes.</span></p></td>
  </tr>
  
  
  
  <tr class="c25">
    <td class="c19"><p class="c7"><span class="c3">Anexo A2: Requisitos Adicionales de PCI DSS Para Entidades que Utilizan SSL/Primeras Versiones de TLS para Conexiones de Terminal POS POI Presencial con Tarjetas</span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">No aplica</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3">No aplica. Clip no utiliza SSL o versiones inseguras de TLS.</span></p></td>
    <td class="c12"><p class="c7"><span class="c3">Si los Merchants utilizan SSL o versiones inseguras de TLS para conexiones de terminales PoS deben confirmar que los dispositivos no son susceptibles a los exploit conocidos de SSL/TLS.</span></p></td>
  </tr>
  
  
  
  <tr class="c25">
    <td class="c19"><p class="c7"><span class="c3">Anexo A3: Validación Complementaria de Entidades Designadas (DESV)</span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">No aplica</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3">No aplica. Clip no es una entidad designada.</span></p></td>
    <td class="c12"><p class="c7"><span class="c3">Si los Merchants son entidades designadas deben implementar un programa de cumplimiento PCI DSS, documentar el alcance de datos de titulares de las tarjetas, incorporar actividades BAU, gestionar y controlar los accesos lógicos y responder a los eventos sospechoso identificados.</span></p></td>
  </tr>
  
  
 
</table>
`}</HTMLBlock>

<br />

<br />

### SDK

Si vas a consumir nuestro SDK de checkout transparente, y no cuentas con la certificación PCI, debes conocer las siguientes responsabilidades entre Clip y tú como comercio:

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
  .c12 { width: 183pt;}
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

  .c16 { text-align: left; }

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
    <td class="c19 c11" colspan="1" rowspan="2">
      <p class="c16"><span class="c14">REQUERIMIENTO</span></p>
    </td>
    <td class="c11 c12" colspan="1" rowspan="2">
      <p class="c16"><span class="c14">ESTATUS DE CUMPLIMIENTO DE CLIP</span></p>
    </td>
    <td class="c13 c11" colspan="5" rowspan="1">
      <p class="c16"><center><span class="c14">RESUMEN DE RESPONSABILIDADES</span></center></p>
    </td>    
  </tr>
  <tr class="c30">
  	<td class="c13 c11" colspan="1" rowspan="1">
      <p class="c16"><span class="c14">CLIP</span></p>
    </td>
    <td class="c13 c11" colspan="1" rowspan="1">
      <p class="c16"><span class="c14">COMERCIO</span></p>
  	</td>
    <td class="c13 c11" colspan="1" rowspan="1">
      <p class="c16"><span class="c14">AMBOS</span></p>
  	</td>
    <td class="c13 c11" colspan="1" rowspan="1">
      <p class="c16"><span class="c14">RESPONSABILIDAD DE CLIP</span></p>
  	</td>
    <td class="c13 c11" colspan="1" rowspan="1">
      <p class="c16"><span class="c14">RESPONSABILIDAD DEL COMERCIO</span></p>
  	</td>
  </tr>

  
  
  <tr class="c25">
    <td class="c19"><p class="c7"><span class="c3">Requisito 1: Instalar y Mantener los Controles de Seguridad de la Red</span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">Cumple</span></center></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">&#9989;</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>    
    <td class="c12"><p class="c7"><span class="c3">Clip cumple con todos los requisitos de implementación y gestión de controles de seguridad de red (NSC por sus siglas en inglés) para su entorno de datos de titulares de tarjetas.</span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
  </tr>
  
  
  
  <tr class="c25">
    <td class="c19"><p class="c7"><span class="c3">Requisito 2: Aplicar Configuraciones Seguras a Todos los Componentes del Sistema</span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">Cumple</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">&#9989;</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3">Clip desarrolla y mantiene configuraciones seguras y guías de hardening para su entorno de datos de titulares de tarjetas, el cual se encuentra alojado en la nube de AWS.</span></p></td>
    <td class="c12"><p class="c7"><span class="c3">Los Merchants son responsables de documentar las configuraciones seguras y guías de hardening para todos los sistemas dentro de su entorno de datos del titular de la tarjeta.</span></p></td>
  </tr>
  
  
  
  <tr class="c25">
    <td class="c19"><p class="c7"><span class="c3">Requisito 3: Proteger los Datos de Tarjetahabientes Almacenados</span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">Cumple</span></center></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">&#9989;</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>    
    <td class="c12"><p class="c7"><span class="c3">Clip cumple con todos los requisitos para la protección de los datos de los titulares de tarjetas aplicando el cifrado o truncado en todas las ubicaciones de almacenamiento y visualización aplicables. También gestionando la creación, el uso y la modificación de llaves de cifrado y controles de acceso al servicio de KMS de AWS.</span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
  </tr>
  
  
  
  <tr class="c25">
    <td class="c19"><p class="c7"><span class="c3">Requisito 4: Proteger los Datos de Tarjetahabientes con Criptografía Robusta Durante la Transmisión a través de Redes Abiertas y Públicas</span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">Cumple</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">&#9989;</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3">Clip cumple con todos los requisitos de cifrado para todas las conexiones de redes internas y externas que se encuentran dentro de su entorno de datos de titulares de tarjetas.</span></p></td>
    <td class="c12"><p class="c7"><span class="c3">Los Merchants on responsables de aplicar el cifrado en todas las conexiones de red externas que sean aplicables.</span></p></td>
  </tr>
  
  
  
  <tr class="c25">
    <td class="c19"><p class="c7"><span class="c3">Requisito 5: Proteger Todos los Sistemas y Redes de Software Malicioso</span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">Cumple</span></center></p></td>    
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">&#9989;</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3">Clip cumple con todos los requisitos de implementación de antimalware en las instancias y estaciones de trabajo, que se encuentran dentro de su entorno de datos de titulares de tarjetas y que son administradas por Clip.</span></p></td>
    <td class="c12"><p class="c7"><span class="c3">Los Merchants son responsables de implementar antimalware en todos los sistemas aplicables.</span></p></td>
  </tr>
  
  
  
  
  <tr class="c25">
    <td class="c19"><p class="c7"><span class="c3">Requisito 6: Desarrollar y Mantener Sistemas y Softwares Seguros</span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">Cumple</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">&#9989;</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3">Clip gestiona y mantiene los parches de seguridad, el ciclo de desarrollo y gestiona el porceso de control de cambios de las aplicaciones que se encuentran dentro de su entorno de datos de titulares de tarjetas.</span></p></td>
    <td class="c12"><p class="c7"><span class="c3">Los Merchant son responsables de supervisar las vulnerabilidades publicadas de los sistemas operativos y de las aplicaciones en uso, así como de aplicar los parches de seguridad en sus sistemas. Adicionalmente, los merchants que desarrollen código personalizado deben cumplir los requisitos de desarrollo seguro y pruebas.</span></p></td>
  </tr>
  
  
  <tr class="c25">
    <td class="c19"><p class="c7"><span class="c3">Requisito 7: Restringir el Acceso a los Componentes del Sistema y a los Datos de Tarjetahabientes Según la Necesidad de Conocimiento de la Empresa</span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">Cumple</span></center></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">&#9989;</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>    
    <td class="c12"><p class="c7"><span class="c3">Clip mantiene los controles de acceso hacia sus sistemas e infraestructura alojados en AWS, así como también hacia su entorno de datos de titulares de tarjetas.</span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
  </tr>
  
  
  
  <tr class="c25">
    <td class="c19"><p class="c7"><span class="c3">Requisito 8: Identificar a los Usuarios y Autenticar el Acceso a los Componentes del Sistema</span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">Cumple</span></center></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">&#9989;</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>    
    <td class="c12"><p class="c7"><span class="c3">Clip cumple con todos los requisitos proporcionando a cada usuario que puede acceder a su entorno de datos de titulares de tarjetas un identificador único, aplicando procesos de gestión de identidad y accesos, uso de MFA y concientización sobre el manejo correcto de las contraseñas.</span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
  </tr>
  
  
  
  <tr class="c25">
    <td class="c19"><p class="c7"><span class="c3">Requisito 9: Restringir el Acceso Físico a los Datos de Tarjetahabientes</span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">Cumple a través de AWS</span></center></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">&#9989;</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>    
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3">Clip cumple con todos los requisitos sobre controles de seguridad física y gestión de soportes de información para su entorno de datos de titulares de tarjetas a través del certificado de cumplimiento de AWS. </span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
  </tr>
  
  
  
  <tr class="c25">
    <td class="c19"><p class="c7"><span class="c3">Requisito 10: Registrar y Supervisar Todos los Accesos a los Componentes del Sistema y a los Datos de Tarjetahabientes</span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">Cumple</span></center></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">&#9989;</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>    
    <td class="c12"><p class="c7"><span class="c3">Clip mantiene y supervisa los registros de auditoría de su entorno de datos de los titulares de tarjetas.</span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
  </tr>
  
  
  <tr class="c25">
    <td class="c19"><p class="c7"><span class="c3">Requisito 11: Poner a Prueba Regularmente la Seguridad de los Sistemas y de las Redes</span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">Cumple</span></center></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">&#9989;</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>    
    <td class="c12"><p class="c7"><span class="c3">Clip gestiona el manejo de vulnerabilidades detectadas a través de escaneos de vulnerabilidad y pruebas de penetración. También, gestiona la detección de intrusiones y la supervisión de la integridad de los archivos críticos para su entorno de datos de titulares de tarjetas.</span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
  </tr>
  
  
  
  <tr class="c25">
    <td class="c19"><p class="c7"><span class="c3">Requisito 12: Respaldar la Seguridad de la Información con Políticas y Programas Organizacionales</span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">Cumple</span></center></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">&#9989;</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>    
    <td class="c12"><p class="c7"><span class="c3">Clip mantiene políticas y procedimientos de seguridad de la información, concienciación en materia de seguridad de la información, plan de respuesta a incidentes de seguridad y procesos de recursos humanos que se ajustan a los requisitos de PCI DSS.</span></p></td>
    <td class="c12"><p class="c7"><span class="c3">Los Merchants son responsables de mantener políticas y procedimientos de seguridad de la información, así como también, brindar concienciación sobre seguridad de la información a su personal.</span></p></td>
  </tr>
  
  
  
  <tr class="c25">
    <td class="c19"><p class="c7"><span class="c3">Anexo A1: Requisitos Adicionales de PCI DSS para Proveedores de Servicios Multiusuario</span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">No aplica</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3">No Aplica. Clip no es un proveedor de servicios Multi-Tenant.</span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
  </tr>
  
  
  
  <tr class="c25">
    <td class="c19"><p class="c7"><span class="c3">Anexo A2: Requisitos Adicionales de PCI DSS Para Entidades que Utilizan SSL/Primeras Versiones de TLS para Conexiones de Terminal POS POI Presencial con Tarjetas</span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">No aplica</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3">No aplica. Clip no utiliza SSL o versiones inseguras de TLS.</span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
  </tr>
  
  
  
  <tr class="c25">
    <td class="c19"><p class="c7"><span class="c3">Anexo A3: Validación Complementaria de Entidades Designadas (DESV)</span></p></td>
    <td class="c12"><p class="c7"><center><span class="c3">No aplica</span></center></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
    <td class="c12"><p class="c7"><span class="c3">No Aplica. Clip no es una entidad designada.</span></p></td>
    <td class="c12"><p class="c7"><span class="c3"></span></p></td>
  </tr>
  
  
 
</table>
`}</HTMLBlock>

<br />

<br />

## ¿Dónde puedo encontrar más información?

Para obtener información adicional, incluyendo copia de las pautas de cumplimiento de la regulación PCI, materiales de referencia con explicación, instrucciones y pautas generales, visita la [Biblioteca de documentos del PCI Security Standards Council](https://www.pcisecuritystandards.org/document_library).

Puedes encontrar la última versión de los formularios SAQ [aquí](https://www.pcisecuritystandards.org/document_library?category=saqs).