/* VIM POS — consentimiento de cookies y Consent Mode v2.

   Este archivo tiene que cargarse ANTES que gtm.js, y por eso su etiqueta va
   primero en el <head> de cada página. Los dos llevan `defer`, y `defer`
   garantiza el orden del documento: aquí se fija el estado de consentimiento
   por defecto y sólo después gtm.js pide el contenedor a Google. Al revés no
   sirve de nada — Consent Mode ignora un `default` que llega tarde, y GA
   habría medido ya con los ajustes de fábrica.

   Por qué la analítica arranca CONCEDIDA y la publicidad DENEGADA
   ───────────────────────────────────────────────────────────────
   Este sitio se dirige a México y la ley que le aplica es la LFPDPPP, que para
   una cookie de medición pide dos cosas: informar antes y dejar oponerse. No
   pide permiso previo. Bloquear GA hasta que alguien pulse un botón es el
   estándar europeo (RGPD + ePrivacy) y aquí sólo costaría datos: entre un 30%
   y un 60% de las visitas nunca tocan el banner.

   Así que `analytics_storage` empieza en `granted` y el banner informa y ofrece
   rechazar en un clic. Lo de publicidad —`ad_storage`, `ad_user_data`,
   `ad_personalization`— empieza y se queda en `denied`, porque hoy no hay
   ninguna etiqueta de anuncios en el contenedor. El día que se anuncie en
   Google Ads, ESE es el consentimiento que habrá que pedir de verdad, y este
   archivo es donde se pide: hay que darle su propio botón al banner, no
   colarlo dentro del «Entendido» actual.

   Qué se guarda
   ─────────────
   Una sola clave en localStorage, `vim-cookies`, con la decisión y la fecha.
   No es una cookie a propósito: no viaja al servidor en cada petición y no
   necesita anunciarse a sí misma. Si el navegador no deja escribir (modo
   privado de Safari, almacenamiento bloqueado) todo sigue funcionando; sólo
   que el banner vuelve a salir en la siguiente visita, que es el fallo en la
   dirección correcta. */

(function (w, d) {
  "use strict";

  var CLAVE = "vim-cookies";
  var VERSION = 1;               /* subir esto vuelve a preguntar a todos */
  var ESPERA = 700;              /* ms antes de asomar el banner; ver abajo */

  /* ---- Consent Mode v2 ---------------------------------------------------
     `gtag` no es más que un empujón a la misma cola `dataLayer` que usan
     gtm.js y vim.js. Tiene que usar `arguments` literalmente —sin tocarlo ni
     convertirlo a array— porque GTM lee ese objeto tal cual. */
  w.dataLayer = w.dataLayer || [];
  function gtag() { w.dataLayer.push(arguments); }

  var decision = leer();
  var mide = !(decision && decision.estado === "rechazado");

  gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: mide ? "granted" : "denied",
    functionality_storage: "granted",
    security_storage: "granted",
  });

  /* ---- La decisión guardada --------------------------------------------- */

  function leer() {
    try {
      var crudo = w.localStorage.getItem(CLAVE);
      if (!crudo) return null;
      var dato = JSON.parse(crudo);
      /* Una decisión de una versión anterior del aviso no vale: si cambió lo
         que se mide, lo que se aceptó ya no es lo que se hace. */
      if (!dato || dato.v !== VERSION) return null;
      return dato;
    } catch (e) {
      return null;
    }
  }

  function guardar(estado) {
    try {
      w.localStorage.setItem(CLAVE, JSON.stringify({
        v: VERSION,
        estado: estado,
        fecha: new Date().toISOString(),
      }));
    } catch (e) { /* almacenamiento bloqueado: se preguntará otra vez */ }
  }

  /* Borrar las cookies que GA ya hubiera puesto en visitas anteriores. Sin
     esto, rechazar dejaría de medir pero el identificador seguiría en el
     navegador, que es justo lo que la persona pidió que no pasara.

     Se prueban los dos ámbitos: el dominio a secas y con punto delante, que es
     como GA las escribe cuando hay subdominios. */
  function borrarGa() {
    var galletas = d.cookie ? d.cookie.split(";") : [];
    var host = w.location.hostname;
    var ambitos = ["", "; domain=" + host, "; domain=." + host];
    for (var i = 0; i < galletas.length; i++) {
      var nombre = galletas[i].split("=")[0].trim();
      if (nombre.indexOf("_ga") !== 0 && nombre.indexOf("_gid") !== 0) continue;
      for (var j = 0; j < ambitos.length; j++) {
        d.cookie = nombre + "=; max-age=0; path=/" + ambitos[j];
      }
    }
  }

  function decidir(estado) {
    guardar(estado);
    if (estado === "rechazado") {
      gtag("consent", "update", { analytics_storage: "denied" });
      borrarGa();
    } else {
      gtag("consent", "update", { analytics_storage: "granted" });
    }
    cerrar();
  }

  /* ---- El banner ---------------------------------------------------------
     Se construye desde JavaScript y no vive en el HTML de las trece páginas, y
     no es por ahorrar líneas: si este archivo no carga, GA tampoco mide (lo
     arranca gtm.js, que va detrás), así que un banner en el HTML estaría
     avisando de algo que no está pasando. Que aparezcan y desaparezcan juntos
     es la única forma de que el aviso nunca mienta. */

  var banner = null;

  function abrir() {
    if (banner) return;

    banner = d.createElement("aside");
    banner.className = "cookies";
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Aviso de cookies");
    banner.innerHTML =
      '<p class="cookies-texto">' +
        '<strong>Este sitio mide sus visitas.</strong> Usamos Google Analytics para saber ' +
        'qué páginas sirven y cuáles no. Guarda en tu navegador una cookie con un número ' +
        'aleatorio: no lleva tu nombre ni se cruza con lo que escribas aquí, y no ponemos ' +
        'cookies de publicidad. ' +
        '<a href="/aviso-privacidad#cookies">Cómo lo hacemos</a>.' +
      '</p>' +
      '<div class="cookies-acciones">' +
        '<button type="button" class="btn btn-primario" data-cookies="aceptado">Entendido</button>' +
        '<button type="button" class="btn btn-fantasma" data-cookies="rechazado">No me midas</button>' +
      '</div>';

    banner.addEventListener("click", function (ev) {
      var boton = ev.target.closest ? ev.target.closest("[data-cookies]") : null;
      if (boton) decidir(boton.getAttribute("data-cookies"));
    });

    d.body.appendChild(banner);
    /* Dos fotogramas antes de encender el estado visible: uno para que el
       navegador calcule los estilos de partida y otro para que la transición
       tenga de dónde salir. Con uno solo, Safari se salta la animación. */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { banner.dataset.visible = "si"; });
    });
  }

  function cerrar() {
    if (!banner) return;
    var yendose = banner;
    banner = null;
    yendose.dataset.visible = "no";
    /* La salida dura 180 ms en CSS; 260 da margen y no deja el nodo colgando
       si la transición no llega a dispararse. */
    w.setTimeout(function () {
      if (yendose.parentNode) yendose.parentNode.removeChild(yendose);
    }, 260);
  }

  /* ---- Arranque ----------------------------------------------------------
     El banner espera a que la página esté pintada y aún 700 ms más. Un aviso
     que aparece encima del titular antes de que se lea el titular es lo que
     hace que la gente pulse cualquier cosa por quitárselo de encima, y una
     decisión pulsada así no es una decisión. Además, entrar tarde lo saca del
     camino del LCP. */

  function arrancar() {
    /* El enlace del pie existe en el HTML pero llega oculto: sin este archivo
       no habría nada que abrir. */
    var enlaces = d.querySelectorAll("[data-cookies-abrir]");
    for (var i = 0; i < enlaces.length; i++) {
      enlaces[i].hidden = false;
      enlaces[i].addEventListener("click", function (ev) {
        ev.preventDefault();
        abrir();
      });
    }
    if (!leer()) w.setTimeout(abrir, ESPERA);
  }

  if (d.readyState === "loading") {
    d.addEventListener("DOMContentLoaded", arrancar);
  } else {
    arrancar();
  }

  /* Para la consola y para cualquier enlace que quiera reabrirlo. */
  w.vimCookies = { abrir: abrir, decidir: decidir, leer: leer };
})(window, document);
