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
  var ANON = "";
  var WHATSAPP = "524761273020";

  /* ---- Menú móvil ----------------------------------------------------------
     El botón alterna un atributo; la transición la hace el CSS, que corre fuera
     del hilo principal y sigue siendo interrumpible —se puede cerrar a media
     apertura sin saltos—.
     
     Lo único que hace falta de JS es la altura, porque `height: auto` no
     interpola. Ver la nota en vim.css sobre por qué se mide en vez de usar el
     truco de `grid-template-rows`. */
  var boton = document.querySelector("[data-menu-boton]");
  var menu = document.querySelector("[data-menu]");

  /* El alto real se mide justo antes de abrir y se escribe en el propio
     elemento. Medir en cada apertura, y no una vez al cargar, es lo que hace
     que siga siendo correcto si cambia el ancho de la ventana o el contenido.

     La variable va en el elemento y no en un ancestro: cambiarla en un padre
     recalcularía el estilo de todos sus hijos. */
  function abrir() {
    menu.style.height = menu.scrollHeight + "px";
    menu.setAttribute("data-abierto", "true");
    boton.setAttribute("aria-expanded", "true");
    boton.setAttribute("aria-label", "Cerrar menú");
  }

  function cerrar(devolverFoco) {
    menu.style.height = "0px";
    menu.setAttribute("data-abierto", "false");
    boton.setAttribute("aria-expanded", "false");
    boton.setAttribute("aria-label", "Abrir menú");
    if (devolverFoco) boton.focus();
  }

  if (boton && menu) {
    boton.addEventListener("click", function () {
      if (menu.getAttribute("data-abierto") === "true") cerrar(false);
      else abrir();
    });

    /* Escape cierra, como cualquier cosa que se despliega. Que no lo haga es de
       esos detalles que nadie agradece y todos notan cuando falta. */
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (menu.getAttribute("data-abierto") !== "true") return;
      cerrar(true);
    });

    /* Al navegar dentro de la página, el menú se cierra solo. */
    menu.addEventListener("click", function (e) {
      if (!e.target.closest("a")) return;
      cerrar(false);
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

  /* ---- La página actual se marca sola -------------------------------------
     Evita tener que acordarse de poner aria-current a mano en cada archivo, que
     es exactamente el tipo de cosa que se olvida en la quinta página. */
  var aqui = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-enlace, .nav-movil-lista a").forEach(function (a) {
    var destino = a.getAttribute("href");
    if (destino === aqui) a.setAttribute("aria-current", "page");
  });
})();
