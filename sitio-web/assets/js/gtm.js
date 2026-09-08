/* VIM POS — carga de Google Tag Manager (contenedor GTM-PRTJDNQ2).

   Por qué este archivo existe en lugar del fragmento que da Google
   ─────────────────────────────────────────────────────────────────
   Google entrega su código como un <script> EN LÍNEA para pegar en el <head>.
   Aquí no se puede: la política de seguridad del sitio dice `script-src 'self'`
   y NO incluye 'unsafe-inline'. Un script en línea quedaría bloqueado por el
   navegador sin decir nada — la analítica parecería instalada y no mediría.

   Las tres salidas eran: abrir la política a 'unsafe-inline' (tirar la
   protección entera por una etiqueta), poner el hash SHA-256 del fragmento en
   la política (obliga a recalcularlo cada vez que se toque una coma, en tres
   archivos distintos), o mover el fragmento a un archivo propio servido desde
   este mismo dominio. Es lo que hace este archivo: 'self' ya lo permite y la
   política solo tuvo que abrirse para googletagmanager.com, que es de donde
   GTM se descarga a sí mismo.

   Qué NO lleva
   ────────────
   El <noscript> con el iframe de Google que acompaña al fragmento original.
   Solo sirve para quien navega con JavaScript apagado, y a ese visitante no se
   le puede medir nada de todos modos: los eventos del sitio (WhatsApp, demo,
   precio anual, acordeón) los manda vim.js, que tampoco correría. A cambio,
   habría que abrir `frame-src` a Google en la política. No compensa.

   La cola `dataLayer` se crea aquí y también en vim.js, a propósito: así los
   eventos que ocurran antes de que GTM cargue no se pierden, y si este archivo
   fallara en descargar, vim.js sigue funcionando y solo mide en Vercel. */

(function (w, d, s, l, i) {
  w[l] = w[l] || [];
  w[l].push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
  var f = d.getElementsByTagName(s)[0];
  var j = d.createElement(s);
  j.async = true;
  j.src = "https://www.googletagmanager.com/gtm.js?id=" + i + (l !== "dataLayer" ? "&l=" + l : "");
  f.parentNode.insertBefore(j, f);
})(window, document, "script", "dataLayer", "GTM-PRTJDNQ2");
