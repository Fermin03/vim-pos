/* VIM POS — el único JavaScript del sitio.
   Sin framework y sin build: seis páginas estáticas no lo justifican.

   Aquí solo vive lo que no se puede hacer con CSS. Todo lo que sea apariencia o
   transición está en vim.css, que corre fuera del hilo principal y no se cae si
   este archivo falla en cargar. */

(function () {
  "use strict";

  /* ---- Lo único configurable del sitio -------------------------------------
     La `ANON` es pública por diseño —viaja en el bundle de cualquier app de
     Supabase— así que va aquí sin problema. Lo que NO puede estar aquí es la
     `service_role`: ésa entra solo del lado servidor, en la Edge Function.

     Se saca de: Supabase → Project Settings → API → anon public.
     Es la misma que ya está en Vercel como NEXT_PUBLIC_SUPABASE_ANON_KEY.

     Si se queda vacía el formulario NO se rompe: cae a WhatsApp con los datos
     ya escritos. Un formulario que falla en silencio pierde el lead; uno que
     abre WhatsApp lo entrega igual, solo que por otro camino. */
  var API = "https://pbiaxzvmssjsxdwqrumb.supabase.co";
  var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBiaWF4enZtc3Nqc3hkd3FydW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTMyMzIsImV4cCI6MjA5NTgyOTIzMn0.OsfFcqw-jrj-qZtFkUPQCrLgYtnDmsOxC93iLJShpKs";
  var WHATSAPP = "524761273020";

  /* ---- Menú móvil: cajón lateral ------------------------------------------
     La animación es CSS puro (`translateX`), así que aquí no se mide ni se
     escribe ningún alto — eso era la versión anterior, que se desplegaba hacia
     abajo empujando la página.

     Lo que queda es lo que CSS no puede hacer y que un cajón necesita para no
     ser una trampa:

       · Atrapar el foco. Sin esto, tabular desde el último enlace del menú
         lleva al contenido de detrás, que está tapado por el velo: el foco
         desaparece de la pantalla y quien navega con teclado se queda perdido.
       · Bloquear el scroll de fondo. Sin esto, deslizar sobre el velo mueve la
         página de debajo y al cerrar el menú ya no estás donde estabas.
       · Devolver el foco a la hamburguesa al cerrar. */
  var boton = document.querySelector("[data-menu-boton]");
  var menu = document.querySelector("[data-menu]");
  var botonCerrar = document.querySelector("[data-menu-cerrar]");

  if (boton && menu) {
    var FOCABLES = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

    function abrir() {
      menu.setAttribute("data-abierto", "true");
      /* `inert` y no `aria-hidden`: aria-hidden lo esconde del lector de
         pantalla pero deja sus enlaces en el orden de tabulación, así que se
         podía tabular hasta contenido invisible y el foco desaparecía de la
         pantalla. `inert` quita las dos cosas de una vez. */
      menu.removeAttribute("inert");
      boton.setAttribute("aria-expanded", "true");
      document.body.setAttribute("data-menu-abierto", "true");

      /* Al primer enlace, no al botón de cerrar: quien abre el menú quiere ir
         a algún sitio, no cerrarlo. */
      var primero = menu.querySelector(".nav-movil-lista a");
      if (primero) primero.focus();
    }

    function cerrar(devolverFoco) {
      menu.setAttribute("data-abierto", "false");
      /* Al marcarlo inerte, el navegador saca el foco de dentro y lo manda al
         body. Por eso justo después se lleva a la hamburguesa —que está FUERA
         del cajón— y no se queda perdido en ninguna parte. */
      menu.setAttribute("inert", "");
      boton.setAttribute("aria-expanded", "false");
      document.body.removeAttribute("data-menu-abierto");
      if (devolverFoco) boton.focus();
    }

    var abierto = function () { return menu.getAttribute("data-abierto") === "true"; };

    boton.addEventListener("click", function () {
      if (abierto()) cerrar(true); else abrir();
    });

    if (botonCerrar) botonCerrar.addEventListener("click", function () { cerrar(true); });

    /* Navegar cierra el cajón. */
    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) cerrar(false);
    });

    /* Tocar fuera cierra. Se escucha en el documento porque el velo es un
       pseudo-elemento del body: no puede tener su propio listener, y un toque
       sobre él llega con `target` = body. Se excluye la hamburguesa para que su
       propio manejador no lo vuelva a abrir en el mismo clic. */
    document.addEventListener("click", function (e) {
      if (!abierto()) return;
      if (menu.contains(e.target) || boton.contains(e.target)) return;
      cerrar(false);
    });

    document.addEventListener("keydown", function (e) {
      if (!abierto()) return;

      if (e.key === "Escape") { cerrar(true); return; }

      if (e.key !== "Tab") return;

      /* El aro del foco: del último se salta al primero y al revés. */
      var f = Array.prototype.slice.call(menu.querySelectorAll(FOCABLES));
      if (!f.length) return;
      var primero = f[0], ultimo = f[f.length - 1];

      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault(); ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault(); primero.focus();
      } else if (!menu.contains(document.activeElement)) {
        e.preventDefault(); primero.focus();
      }
    });

    /* Si la ventana se ensancha hasta que el cajón deja de existir, hay que
       cerrarlo: si no, el body se queda con el scroll bloqueado y la página
       no se mueve, sin nada en pantalla que explique por qué. */
    window.addEventListener("resize", function () {
      if (abierto() && window.innerWidth >= 900) cerrar(false);
    });
  }

  /* ---- Acordeón: giros y preguntas frecuentes ------------------------------
     Mismo mecanismo que el menú y por la misma razón: `height: auto` no
     interpola, así que el alto se mide y se escribe.

     Se abre uno a la vez. No es capricho: con varios abiertos la página crece
     debajo de donde estás leyendo y pierdes el sitio. */
  var items = document.querySelectorAll("[data-acordeon-item]");

  items.forEach(function (item) {
    var boton = item.querySelector("[data-acordeon-boton]");
    var panel = item.querySelector("[data-acordeon-panel]");
    if (!boton || !panel) return;

    boton.addEventListener("click", function () {
      var abierto = item.getAttribute("data-abierto") === "true";

      /* Cerrar el resto antes de abrir éste. */
      if (!abierto) {
        items.forEach(function (otro) {
          if (otro === item || otro.getAttribute("data-abierto") !== "true") return;
          var p = otro.querySelector("[data-acordeon-panel]");
          var b = otro.querySelector("[data-acordeon-boton]");
          p.style.height = "0px";
          otro.setAttribute("data-abierto", "false");
          b.setAttribute("aria-expanded", "false");
        });
      }

      panel.style.height = abierto ? "0px" : panel.scrollHeight + "px";
      item.setAttribute("data-abierto", String(!abierto));
      boton.setAttribute("aria-expanded", String(!abierto));
    });
  });

  /* ---- El diagrama de arquitectura ----------------------------------------
     El botón corta la línea con la nube. Es la única animación de la página que
     no responde a una acción de navegación: existe porque ES el argumento —
     enseñar que al caerse el internet el local sigue entero explica el producto
     mejor que tres párrafos. */
  var diagrama = document.querySelector("[data-diagrama]");
  var interruptor = document.querySelector("[data-diagrama-boton]");

  if (diagrama && interruptor) {
    interruptor.addEventListener("click", function () {
      var caido = diagrama.classList.toggle("sin-red");
      interruptor.setAttribute("aria-pressed", String(caido));
      interruptor.textContent = caido ? "Devolver el internet" : "Cortar el internet";
    });
  }

  /* ---- Mensual / anual en la página de precios ----------------------------
     El descuento anual es del 17 %, que nadie calcula de cabeza. En vez de
     pedirle al lector que lo haga, los dos precios ya están escritos en el
     HTML y el botón solo elige cuál se enseña: así la página sigue diciendo la
     verdad aunque este archivo no cargue.

     Sin animación a propósito. Un número que se desvanece y vuelve tarda más
     en poder leerse que en cambiar, y aquí el lector está comparando cifras. */
  var periodos = document.querySelectorAll("[data-periodo]");

  if (periodos.length) {
    periodos.forEach(function (b) {
      b.addEventListener("click", function () {
        var anual = b.getAttribute("data-periodo") === "anual";

        periodos.forEach(function (otro) {
          otro.setAttribute("aria-pressed", String(otro === b));
        });

        document.querySelectorAll("[data-precio]").forEach(function (p) {
          p.textContent = p.getAttribute(anual ? "data-anual" : "data-mensual");
        });

        document.querySelectorAll("[data-nota-periodo]").forEach(function (n) {
          n.textContent = anual ? "al mes, pagando el año, más IVA" : "al mes, más IVA";
        });
      });
    });
  }

  /* ---- El formulario de demo ----------------------------------------------
     Un `fetch` a la Edge Function `solicitar-demo`. El sitio sigue siendo HTML
     estático: no hay PHP, ni build, ni servidor propio.

     El formulario lleva `novalidate` a propósito. La validación del navegador
     enseña globos que no se pueden estilar, salen en el idioma del sistema
     —no del sitio— y desaparecen al primer clic. Se valida aquí para poder
     decir el error debajo del campo, en español, y que se quede ahí. */
  var form = document.querySelector("[data-form]");

  if (form) {
    var abiertoEn = Date.now();
    var boton = form.querySelector("[data-form-enviar]");
    var cajaError = form.querySelector("[data-form-error]");
    var listo = document.querySelector("[data-form-listo]");

    var REGLAS = {
      nombre:     function (v) { return v.trim().length >= 2 || "Dinos cómo te decimos."; },
      whatsapp:   function (v) {
        var d = v.replace(/\D/g, "");
        return (d.length >= 10 && d.length <= 13) || "Necesitamos 10 dígitos para escribirte.";
      },
      negocio:    function (v) { return v.trim().length >= 2 || "¿Cómo se llama tu negocio?"; },
      cajas:      function (v) { return (+v >= 1 && +v <= 99) || "Entre 1 y 99."; },
      sucursales: function (v) { return (+v >= 1 && +v <= 99) || "Entre 1 y 99."; },
    };

    function marcar(campo, mensaje) {
      var contenedor = campo.closest(".campo");
      var previo = contenedor.querySelector(".campo-error");
      if (previo) previo.remove();

      if (!mensaje) {
        contenedor.removeAttribute("data-mal");
        campo.removeAttribute("aria-invalid");
        return;
      }
      contenedor.setAttribute("data-mal", "");
      campo.setAttribute("aria-invalid", "true");

      var p = document.createElement("p");
      p.className = "campo-error";
      p.textContent = mensaje;
      contenedor.appendChild(p);
    }

    function revisar(campo) {
      var regla = REGLAS[campo.name];
      if (!regla) return true;
      var r = regla(campo.value);
      marcar(campo, r === true ? "" : r);
      return r === true;
    }

    /* Al SALIR del campo, no al escribir. Regañar a la tercera letra del
       nombre es corregir a quien todavía no termina. Una vez marcado mal, sí
       se revisa al escribir: ahí el aviso ya está en pantalla y verlo
       desaparecer al corregir es la respuesta que el usuario espera. */
    Object.keys(REGLAS).forEach(function (nombre) {
      var campo = form.elements[nombre];
      if (!campo) return;
      campo.addEventListener("blur", function () { revisar(campo); });
      campo.addEventListener("input", function () {
        if (campo.closest(".campo").hasAttribute("data-mal")) revisar(campo);
      });
    });

    /* Si no hay a dónde mandar el formulario, se entrega por WhatsApp con todo
       escrito. La persona solo le da a enviar. */
    function porWhatsapp(d) {
      var lineas = [
        "Hola, quiero una demo de VIM POS.",
        "",
        "Nombre: " + d.nombre,
        "Negocio: " + d.negocio,
        "Cajas: " + d.cajas,
        "Sucursales: " + d.sucursales,
      ];
      if (d.usa_hoy) lineas.push("Uso hoy: " + d.usa_hoy);
      var texto = lineas.join("\n");
      window.location.href = "https://wa.me/" + WHATSAPP + "?text=" + encodeURIComponent(texto);
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      cajaError.hidden = true;

      var datos = Object.fromEntries(new FormData(form).entries());

      /* Todos los campos, no solo el primero que falla: quien llenó mal dos
         cosas debe verlas juntas y no descubrir la segunda tras reenviar. */
      var malos = Object.keys(REGLAS).filter(function (n) {
        return form.elements[n] && !revisar(form.elements[n]);
      });
      if (malos.length) {
        form.elements[malos[0]].focus();
        return;
      }

      if (!ANON) { porWhatsapp(datos); return; }

      boton.setAttribute("aria-busy", "true");
      boton.textContent = "Enviando…";

      datos.abierto_en = abiertoEn;
      datos.origen = "sitio-web";
      var params = new URLSearchParams(location.search);
      if (params.get("utm_source")) datos.utm_source = params.get("utm_source");
      if (params.get("utm_campaign")) datos.utm_campaign = params.get("utm_campaign");

      fetch(API + "/functions/v1/solicitar-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ANON, Authorization: "Bearer " + ANON },
        body: JSON.stringify(datos),
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.j && res.j.detalle ? res.j.detalle : "");
          form.hidden = true;
          listo.hidden = false;
          listo.querySelector("h2").focus();
        })
        .catch(function (err) {
          /* El error no deja al visitante sin salida: se le ofrece WhatsApp,
             que es a donde iba a acabar de todos modos. */
          boton.removeAttribute("aria-busy");
          boton.textContent = "Pide una demo";
          cajaError.hidden = false;
          cajaError.textContent =
            (err.message || "No se pudo enviar.") +
            " Escríbenos por WhatsApp al 476 127 3020 y lo resolvemos ahí.";
        });
    });
  }

  /* ---- Marquesina de la franja de hechos ----------------------------------
     Los cuatro hechos se duplican para que el bucle cierre sin salto (ver la
     nota en vim.css). Las copias van con `aria-hidden`: para quien usa lector
     de pantalla son la misma información dos veces, y oírla repetida no es un
     detalle menor sino ruido que hay que atravesar.

     Se hace aquí y no en el HTML porque duplicar cuatro nodos a mano es
     contenido repetido en el archivo, que es peor de mantener y peor para
     quien lea el código. Si el JS no carga, la franja se queda como una
     rejilla normal — que es exactamente lo que era antes. */
  var hechos = document.querySelector(".hechos");

  if (hechos && !hechos.parentElement.classList.contains("hechos-marco")) {
    var marco = document.createElement("div");
    marco.className = "hechos-marco";
    hechos.parentElement.insertBefore(marco, hechos);
    marco.appendChild(hechos);

    Array.prototype.slice.call(hechos.children).forEach(function (h) {
      var copia = h.cloneNode(true);
      copia.setAttribute("aria-hidden", "true");
      hechos.appendChild(copia);
    });
  }

  /* ---- Puntos de los carruseles -------------------------------------------
     El carrusel es CSS puro (scroll-snap): esto solo le añade los puntos y no
     lo hace funcionar. Si este archivo falla en cargar, la tira se sigue
     deslizando — que es la razón de haberlo hecho con scroll nativo y no con
     un widget de JavaScript.

     Ver abajo la nota sobre por qué el punto activo se calcula del scroll y no
     con IntersectionObserver. */
  var CORTES = { tira: 759, tres: 799, dos: 799, planes: 859 };

  document.querySelectorAll(".tres, .dos, .planes, .tira").forEach(function (pista) {
    var tarjetas = Array.prototype.slice.call(pista.children);
    if (tarjetas.length < 2) return;

    var hasta = null;
    Object.keys(CORTES).forEach(function (c) {
      if (pista.classList.contains(c)) hasta = CORTES[c];
    });
    if (!hasta) return;

    var tira = document.createElement("div");
    tira.className = "puntos";
    tira.setAttribute("data-hasta", String(hasta));
    /* `tablist` sería mentir: esto no son pestañas y un lector de pantalla
       anunciaría controles que no se comportan como tales. Es un grupo de
       botones que llevan a un sitio. */
    tira.setAttribute("role", "group");
    tira.setAttribute("aria-label", "Ir a una tarjeta");

    var puntos = tarjetas.map(function (tarjeta, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "punto";
      b.setAttribute("aria-label", "Tarjeta " + (i + 1) + " de " + tarjetas.length);
      b.setAttribute("aria-current", i === 0 ? "true" : "false");
      b.addEventListener("click", function () {
        /* `scrollIntoView` con `block: nearest` para que llevar el carrusel de
           lado no arrastre también la página en vertical. */
        tarjeta.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
      });
      tira.appendChild(b);
      return b;
    });

    pista.insertAdjacentElement("afterend", tira);

    /* El punto activo se calcula del `scrollLeft`, no con IntersectionObserver.
       El observador es más elegante y era la primera versión, pero su callback
       se entrega en el ciclo de render del navegador: en cualquier contexto
       donde ese ciclo esté suspendido —una pestaña en segundo plano, un panel
       oculto— los puntos se quedan congelados en el primero mientras la tira
       sí se desliza. Un indicador que miente es peor que no tenerlo.

       Esto lee dos números y no toca el layout, así que el evento `scroll` sale
       barato aunque dispare seguido. */
    function marcarActivo() {
      var ancho = tarjetas[0].offsetWidth + parseFloat(getComputedStyle(pista).columnGap || 0);
      var i = ancho > 0 ? Math.round(pista.scrollLeft / ancho) : 0;
      if (i < 0) i = 0;
      if (i > tarjetas.length - 1) i = tarjetas.length - 1;
      puntos.forEach(function (b, j) {
        b.setAttribute("aria-current", j === i ? "true" : "false");
      });
    }

    pista.addEventListener("scroll", marcarActivo, { passive: true });
    marcarActivo();
  });

  /* ---- La página actual se marca sola -------------------------------------
     Evita tener que acordarse de poner aria-current a mano en cada archivo, que
     es exactamente el tipo de cosa que se olvida en la quinta página. */
  var aqui = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-enlace, .nav-movil-lista a").forEach(function (a) {
    var destino = a.getAttribute("href");
    if (destino === aqui) a.setAttribute("aria-current", "page");
  });
})();
