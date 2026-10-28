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

     Si se queda vacía el formulario NO se rompe: cae al correo con los datos
     ya escritos. Un formulario que falla en silencio pierde el lead; uno que
     abre el correo lo entrega igual, solo que por otro camino.

     6/09/2026 — la salida de emergencia era WhatsApp y ahora es el correo. El
     número era personal y salió del sitio entero; el mecanismo es el mismo. */
  var API = "https://pbiaxzvmssjsxdwqrumb.supabase.co";
  var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBiaWF4enZtc3Nqc3hkd3FydW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTMyMzIsImV4cCI6MjA5NTgyOTIzMn0.OsfFcqw-jrj-qZtFkUPQCrLgYtnDmsOxC93iLJShpKs";
  var CORREO = "hola@vimpos.com.mx";

  /* ---- Medición -----------------------------------------------------------
     Cada evento se manda a DOS sitios, y no es duplicar por duplicar:

       · Vercel Web Analytics, que se sirve desde este mismo dominio y no pone
         cookies. Es el que responde «cuánta gente entró y qué hizo» sin
         depender de nadie más. Su cola guarda lo que ocurra antes de que
         cargue el script; él la vacía al arrancar.
       · Google Tag Manager, que a su vez alimenta Google Analytics y, el día
         que se anuncie, la etiqueta de Google Ads. Es el que hace falta para
         que una campaña sepa qué clic acabó en demostración. Su cola es
         `dataLayer` y funciona igual: si GTM no ha cargado, o no cargó nunca,
         los eventos se quedan en el array y no se rompe nada.

     Los mismos cuatro eventos que dicen si el sitio vende: clic en el correo,
     demo enviada, cambio a precio anual y qué pregunta se abre. El nombre del
     evento viaja idéntico a los dos lados para que los informes se puedan
     comparar sin traducir nada.

     Un aviso para quien configure GTM: lo que llega a `dataLayer` es un evento
     con `event: <nombre>` y las propiedades sueltas al lado, NO anidadas. El
     activador correcto es «Evento personalizado» con ese nombre exacto. */
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  window.dataLayer = window.dataLayer || [];
  function medir(nombre, datos) {
    try { window.va("event", { name: nombre, data: datos || {} }); } catch (e) { /* nunca estorba */ }
    try {
      var carga = { event: nombre };
      for (var k in datos || {}) if (Object.prototype.hasOwnProperty.call(datos, k)) carga[k] = datos[k];
      window.dataLayer.push(carga);
    } catch (e) { /* nunca estorba */ }
  }

  /* El evento conserva el nombre `whatsapp` a propósito aunque el canal ya sea
     el correo: renombrarlo partiría la serie histórica en Vercel en dos, y una
     métrica que se corta cada vez que cambia el canal no sirve para comparar
     nada. Mide lo mismo que medía: cuánta gente pide hablar con alguien. */
  document.querySelectorAll('a[href^="mailto:"]').forEach(function (a) {
    a.addEventListener("click", function () {
      medir("whatsapp", { pagina: location.pathname });
    });
  });

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
  /* ---- Pantallas del menú -------------------------------------------------
     Un botón con `data-ir` lleva a la pantalla de ese nombre dentro del mismo
     contenedor y `data-volver` regresa a la anterior. Las que no se ven van
     inertes, para que el foco no se meta en ellas. El foco pasa a la pantalla
     nueva ANTES de marcar inerte la vieja: si no, el panel de la PC lo pierde,
     cree que te saliste y se cierra. Con teclado el foco va a la primera
     entrada; con un toque, a la pantalla misma, para no pintar el aro.

     En el panel de la PC no hay deslizamiento: la lista de la izquierda se
     queda y la pantalla del grupo bajo el cursor (o con el foco) se asoma a
     su derecha. Al abrir se asoma la del primero, para que no quede vacío. */
  function asomar(cont, ir) {
    Array.prototype.forEach.call(cont.querySelectorAll("[data-ir]"), function (b) {
      var p = cont.querySelector('[data-pantalla="' + b.getAttribute("data-ir") + '"]');
      var este = b === ir;
      b.toggleAttribute("data-activo", este);
      if (este) p.removeAttribute("data-lado"); else p.setAttribute("data-lado", "despues");
      p.inert = !este;
    });
  }

  function reiniciarPantallas(cont) {
    if (!cont) return;
    cont.pila = [];
    cont.setAttribute("data-instante", "");
    Array.prototype.forEach.call(cont.children, function (p, i) {
      if (i) p.setAttribute("data-lado", "despues"); else p.removeAttribute("data-lado");
      p.inert = i > 0;
      p.tabIndex = -1;
    });
    var primero = cont.querySelector("[data-ir]");
    if (cont.closest(".nav-panel") && primero) asomar(cont, primero);
    void cont.offsetHeight;
    cont.removeAttribute("data-instante");
  }

  function mostrarPantalla(cont, destino, lado, teclado, foco) {
    var actual = cont.querySelector(":scope > .nav-pantalla:not([data-lado])");
    destino.removeAttribute("data-lado");
    destino.inert = false;
    (teclado ? foco || destino.querySelector("a, button") : destino).focus();
    actual.setAttribute("data-lado", lado);
    actual.inert = true;
  }

  document.querySelectorAll("[data-pantallas]").forEach(function (cont) {
    cont.setAttribute("data-js", "");
    reiniciarPantallas(cont);

    if (cont.closest(".nav-panel")) {
      /* Con el cursor, el cambio espera 100 ms y se cancela si antes llega a
         la lista de la derecha: así, bajar en diagonal de «Alimentos» a «Food
         trucks» no cambia la lista al cruzar «Tienda» y «Belleza». */
      var pendiente = null;
      cont.addEventListener("mouseover", function (e) {
        clearTimeout(pendiente);
        var ir = e.target.closest("[data-ir]");
        if (ir) pendiente = setTimeout(function () { asomar(cont, ir); }, 100);
      });
      cont.addEventListener("focusin", function (e) {
        var ir = e.target.closest("[data-ir]");
        if (ir) asomar(cont, ir);
      });
      /* Un clic (o Enter) también asoma; con teclado, además, entra a la lista. */
      cont.addEventListener("click", function (e) {
        var ir = e.target.closest("[data-ir]");
        if (!ir) return;
        asomar(cont, ir);
        if (e.detail === 0) cont.querySelector('[data-pantalla="' + ir.getAttribute("data-ir") + '"] a').focus();
      });
      return;
    }

    cont.addEventListener("click", function (e) {
      var ir = e.target.closest("[data-ir]");
      if (ir) {
        cont.pila.push(ir);
        mostrarPantalla(cont, cont.querySelector('[data-pantalla="' + ir.getAttribute("data-ir") + '"]'), "antes", e.detail === 0);
      } else if (e.target.closest("[data-volver]") && cont.pila.length) {
        var de = cont.pila.pop();
        mostrarPantalla(cont, de.closest(".nav-pantalla"), "despues", e.detail === 0, de);
      }
    });
  });

  var boton = document.querySelector("[data-menu-boton]");
  var menu = document.querySelector("[data-menu]");
  var botonCerrar = document.querySelector("[data-menu-cerrar]");

  if (boton && menu) {
    var FOCABLES = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

    /* Con un toque, el foco va al cajón mismo (sin aro); el aro azul solo
       aparece cuando se abre con el teclado. Safari en el iPhone pinta el aro
       a todo `focus()` hecho por código, aunque lo haya pedido un dedo. */
    menu.tabIndex = -1;

    function abrir(teclado) {
      menu.setAttribute("data-abierto", "true");
      /* `inert` y no `aria-hidden`: aria-hidden lo esconde del lector de
         pantalla pero deja sus enlaces en el orden de tabulación, así que se
         podía tabular hasta contenido invisible y el foco desaparecía de la
         pantalla. `inert` quita las dos cosas de una vez. */
      menu.removeAttribute("inert");
      boton.setAttribute("aria-expanded", "true");
      document.body.setAttribute("data-menu-abierto", "true");

      /* Siempre abre en la primera pantalla, y el foco va a su primera
         entrada, no al botón de cerrar: quien abre el menú quiere ir a algún
         sitio, no cerrarlo. */
      reiniciarPantallas(menu.querySelector("[data-pantallas]"));
      var primero = menu.querySelector(".nav-pantalla:not([data-lado]) :is(a, button)");
      if (teclado && primero) primero.focus(); else menu.focus();
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

    /* `e.detail === 0` es un clic hecho con el teclado (Enter o espacio). */
    boton.addEventListener("click", function (e) {
      if (abierto()) cerrar(e.detail === 0); else abrir(e.detail === 0);
    });

    if (botonCerrar) botonCerrar.addEventListener("click", function (e) { cerrar(e.detail === 0); });

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
      var f = Array.prototype.slice.call(menu.querySelectorAll(FOCABLES))
        .filter(function (el) { return !el.closest("[inert]"); });
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

  /* ---- Paneles del menú de escritorio --------------------------------------
     Sin este bloque abren igual, con el mouse encima o el foco dentro (CSS). Lo
     que se añade es lo que CSS no puede: abrir con un toque en una tableta,
     cerrar con Escape y decirle al lector de pantalla si está abierto.

     Con mouse el panel se abre al pasar por encima, así que el clic NO lo
     alterna: lo abriría el paso y lo cerraría el clic de quien venía a
     abrirlo. `e.detail === 0` es un clic hecho con el teclado, y ése sí
     alterna. */
  var enlaces = document.querySelector(".nav-enlaces");
  var grupos = document.querySelectorAll("[data-nav-grupo]");

  if (enlaces && grupos.length) {
    var fino = window.matchMedia("(hover: hover) and (pointer: fine)");
    var cierrePendiente = null;

    var grupoAbierto = function () { return enlaces.querySelector('[data-nav-grupo][data-abierto="true"]'); };

    /* `null` los cierra todos. */
    var ponerPanel = function (grupo) {
      clearTimeout(cierrePendiente);
      var previo = grupoAbierto();
      if (previo === grupo) return;
      /* De un panel al de al lado no hay animación: ya había uno abierto. */
      enlaces.toggleAttribute("data-instante", !!(previo && grupo));
      if (grupo) reiniciarPantallas(grupo.querySelector("[data-pantallas]"));
      grupos.forEach(function (g) {
        g.setAttribute("data-abierto", String(g === grupo));
        g.querySelector("button").setAttribute("aria-expanded", String(g === grupo));
      });
    };

    enlaces.setAttribute("data-js", "");

    grupos.forEach(function (g) {
      g.querySelector("button").addEventListener("click", function (e) {
        var abierto = g.getAttribute("data-abierto") === "true";
        ponerPanel(fino.matches && e.detail !== 0 ? g : (abierto ? null : g));
      });
      g.addEventListener("mouseenter", function () { if (fino.matches) ponerPanel(g); });
      /* 120 ms de gracia: salirse un pixel camino al panel no lo cierra. */
      g.addEventListener("mouseleave", function () {
        if (fino.matches) cierrePendiente = setTimeout(function () { ponerPanel(null); }, 120);
      });
      g.addEventListener("focusout", function (e) {
        if (!g.contains(e.relatedTarget)) ponerPanel(null);
      });
    });

    document.addEventListener("click", function (e) {
      var g = grupoAbierto();
      if (g && !g.contains(e.target)) ponerPanel(null);
    });

    document.addEventListener("keydown", function (e) {
      var g = grupoAbierto();
      if (e.key !== "Escape" || !g) return;
      ponerPanel(null);
      g.querySelector("button").focus();
    });
  }

  /* ---- Acordeón: giros y preguntas frecuentes ------------------------------
     Mismo mecanismo que el menú y por la misma razón: `height: auto` no
     interpola, así que el alto se mide y se escribe.

     Se abre uno a la vez. No es capricho: con varios abiertos la página crece
     debajo de donde estás leyendo y pierdes el sitio. */
  var items = document.querySelectorAll("[data-acordeon-item]");

  /* Cerrar va en dos pasos. Un panel que llega abierto desde el HTML mide
     `auto`, y de `auto` a 0 no hay transición: primero se le escribe su alto
     en pixeles, se obliga al navegador a aplicarlo y entonces se baja a 0. */
  function plegar(panel) {
    panel.style.height = panel.scrollHeight + "px";
    void panel.offsetHeight;
    panel.style.height = "0px";
    panel.inert = true;
  }

  /* Un panel cerrado mide 0 px pero sus enlaces seguían en el orden de tabulación: el foco se
     metía en texto invisible. `inert` lo saca del foco y del lector de pantalla mientras está
     cerrado. */
  items.forEach(function (item) {
    var boton = item.querySelector("[data-acordeon-boton]");
    var panel = item.querySelector("[data-acordeon-panel]");
    if (!boton || !panel) return;
    if (item.getAttribute("data-abierto") !== "true") panel.inert = true;

    /* `data-acordeon-siempre` marca un grupo aparte (las cuatro funciones de
       la portada): siempre tiene una fila abierta —de ella sale la captura de
       al lado— y abrir una pregunta más abajo no se la cierra. Los demás
       acordeones de la página siguen siendo un solo grupo. */
    var grupo = item.closest("[data-acordeon-siempre]");

    boton.addEventListener("click", function () {
      var abierto = item.getAttribute("data-abierto") === "true";
      if (abierto && grupo) return;

      /* Cerrar el resto antes de abrir éste. */
      if (!abierto) {
        items.forEach(function (otro) {
          if (otro === item || otro.getAttribute("data-abierto") !== "true") return;
          if (otro.closest("[data-acordeon-siempre]") !== grupo) return;
          plegar(otro.querySelector("[data-acordeon-panel]"));
          otro.setAttribute("data-abierto", "false");
          otro.querySelector("[data-acordeon-boton]").setAttribute("aria-expanded", "false");
        });
      }

      if (abierto) plegar(panel);
      else { panel.style.height = panel.scrollHeight + "px"; panel.inert = false; }
      item.setAttribute("data-abierto", String(!abierto));
      boton.setAttribute("aria-expanded", String(!abierto));
      if (!abierto) medir("acordeon", { titulo: boton.textContent.trim().slice(0, 80), pagina: location.pathname });
    });
  });

  /* ---- El diagrama de arquitectura ----------------------------------------
     El botón corta la línea con la nube. Es la única animación de la página que
     no responde a una acción de navegación: existe porque ES el argumento —
     enseñar que al caerse el internet el local sigue entero explica el producto
     mejor que tres párrafos. */
  /* Hay dos dibujos del mismo diagrama —el ancho y uno vertical para el teléfono, donde el
     ancho quedaba con letra de 5 px— y el CSS enseña uno. El botón corta los dos. */
  var diagramas = document.querySelectorAll("[data-diagrama]");
  var interruptor = document.querySelector("[data-diagrama-boton]");

  if (diagramas.length && interruptor) {
    var cortar = function (caido) {
      diagramas.forEach(function (d) { d.classList.toggle("sin-red", caido); });
      interruptor.setAttribute("aria-pressed", String(caido));
      interruptor.textContent = caido ? "Devolver el internet" : "Cortar el internet";
    };

    /* Se enseña solo UNA vez, al entrar en pantalla: se corta, se ve que el
       local sigue entero y vuelve. Es el argumento del sitio y dependía de que
       alguien encontrara el botón. Dura tres segundos y no se repite; con
       movimiento reducido no arranca, y un clic en el botón lo cancela. */
    var demostracion = null;
    var vigia = null;

    interruptor.addEventListener("click", function () {
      clearTimeout(demostracion);
      if (vigia) vigia.disconnect();
      cortar(interruptor.getAttribute("aria-pressed") !== "true");
    });

    if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      vigia = new IntersectionObserver(function (entradas) {
        if (!entradas.some(function (e) { return e.isIntersecting; })) return;
        vigia.disconnect();
        demostracion = setTimeout(function () {
          cortar(true);
          demostracion = setTimeout(function () { cortar(false); }, 2400);
        }, 700);
      }, { threshold: 0.6 });
      diagramas.forEach(function (d) { vigia.observe(d); });
    }
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

        if (anual) medir("precio_anual");
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
    /* `botonEnviar`, no `boton`: este archivo es UNA función y `var` no hace ámbito por
       bloque, así que `boton` es la MISMA variable que la hamburguesa del menú de arriba. En
       la única página con formulario (/demo) esta línea la pisaba, y desde entonces el menú
       ponía aria-expanded y el foco en el botón de enviar. */
    var botonEnviar = form.querySelector("[data-form-enviar]");
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

    /* Si no hay a dónde mandar el formulario, se entrega por correo con todo
       escrito. La persona solo le da a enviar.

       El WhatsApp del visitante viaja en el cuerpo y no en el asunto: es el
       dato con el que se le contesta, y un asunto largo se corta en casi todos
       los clientes de correo. */
    function porCorreo(d) {
      var lineas = [
        "Hola, quiero una demo de VIM POS.",
        "",
        "Nombre: " + d.nombre,
        "WhatsApp: " + d.whatsapp,
        "Negocio: " + d.negocio,
        "Cajas: " + d.cajas,
        "Sucursales: " + d.sucursales,
      ];
      if (d.usa_hoy) lineas.push("Uso hoy: " + d.usa_hoy);
      var texto = lineas.join("\n");
      window.location.href =
        "mailto:" + CORREO +
        "?subject=" + encodeURIComponent("Demo de VIM POS") +
        "&body=" + encodeURIComponent(texto);
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

      if (!ANON) { porCorreo(datos); return; }

      botonEnviar.setAttribute("aria-busy", "true");
      botonEnviar.textContent = "Enviando…";

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
          medir("demo_enviada");
        })
        .catch(function (err) {
          /* El error no deja al visitante sin salida: se le ofrece el correo,
             que es a donde iba a acabar de todos modos. */
          botonEnviar.removeAttribute("aria-busy");
          botonEnviar.textContent = "Pide una demo";
          cajaError.hidden = false;
          cajaError.textContent =
            (err.message || "No se pudo enviar.") +
            " Escríbenos a hola@vimpos.com.mx y lo resolvemos ahí.";
        });
    });
  }

  /* ---- Puntos de los carruseles -------------------------------------------
     El carrusel es CSS puro (scroll-snap): esto solo le añade los puntos y no
     lo hace funcionar. Si este archivo falla en cargar, la tira se sigue
     deslizando — que es la razón de haberlo hecho con scroll nativo y no con
     un widget de JavaScript.

     Ver abajo la nota sobre por qué el punto activo se calcula del scroll y no
     con IntersectionObserver. */
  var CORTES = { tira: 759, tres: 799, dos: 799 };

  document.querySelectorAll(".tres, .dos, .tira").forEach(function (pista) {
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
  function ruta(p) { return p.replace(/\.html$/, "").replace(/\/+$/, "").replace(/^\/?index$/, "") || "/"; }
  var aqui = ruta(location.pathname);
  document.querySelectorAll(".nav-enlace, .nav-panel a, .nav-movil a").forEach(function (a) {
    var destino = a.getAttribute("href");
    if (!destino || destino.charAt(0) !== "/" || ruta(destino) !== aqui) return;
    a.setAttribute("aria-current", "page");
    /* Si la página vive dentro de un panel o de un grupo del cajón, se nota
       desde fuera: la entrada del menú queda en tinta y el grupo, abierto. */
    var grupo = a.closest("[data-nav-grupo]");
    if (grupo) grupo.setAttribute("data-actual", "");
    var plegado = a.closest("details");
    if (plegado) plegado.open = true;
  });

  /* ---- Entrada al bajar ----------------------------------------------------
     Cada bloque de una sección aparece una vez al entrar en pantalla; el cómo
     está en vim.css. Aquí se decide a QUÉ: solo a lo que al cargar queda por
     debajo de la pantalla. Lo que ya se ve no se esconde para volver a
     enseñarlo, y si este archivo no carga no se esconde nada.

     Las rejillas de tarjetas se marcan como grupo para que entren escalonadas.
     Se observa la rejilla y no cada tarjeta: en el teléfono es un carrusel, y
     las tarjetas que quedan a la derecha no «entrarían» nunca. */
  if ("IntersectionObserver" in window) {
    var entrada = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (!e.isIntersecting) return;
        var bloque = e.target;
        entrada.unobserve(bloque);
        bloque.classList.add("entro");
        /* Fuera las clases al terminar (240 ms + 300 del último escalón): si
           se quedan, su `transition` le gana al de cada tarjeta. */
        setTimeout(function () { bloque.classList.remove("por-entrar", "por-entrar-grupo", "entro"); }, 700);
      });
    }, { rootMargin: "0px 0px -8% 0px" });

    document.querySelectorAll(".seccion > .contenedor > *").forEach(function (bloque) {
      if (bloque.getBoundingClientRect().top < window.innerHeight) return;
      bloque.classList.add(bloque.matches(".tres, .dos, .tira, .planes, .cuatro, .giro-tira") ? "por-entrar-grupo" : "por-entrar");
      entrada.observe(bloque);
    });
  }

  /* ---- Páginas por giro: la imagen que acompaña a cada rasgo -----------------
     En la PC la columna de la imagen se queda quieta y muestra la del rasgo que
     cruza la mitad de la pantalla. La línea de disparo es una franja delgada en
     el centro (rootMargin −50 %), así que solo un rasgo la toca a la vez. */
  var rasgos = document.querySelectorAll("[data-rasgo]");
  var medios = document.querySelectorAll("[data-rasgo-media]");
  if (rasgos.length && medios.length && "IntersectionObserver" in window) {
    var verRasgo = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (!e.isIntersecting) return;
        var n = e.target.getAttribute("data-rasgo");
        medios.forEach(function (m) { m.toggleAttribute("data-activo", m.getAttribute("data-rasgo-media") === n); });
      });
    }, { rootMargin: "-50% 0px -50% 0px" });
    rasgos.forEach(function (r) { verRasgo.observe(r); });
  }

  /* ---- Barra fija de acciones (teléfono) ------------------------------------
     Sale cuando el hero ya no se ve y se va cuando aparece el cierre, que trae
     los mismos botones. */
  var barra = document.querySelector("[data-barra-accion]");
  var heroGiro = document.querySelector(".giro-hero, .inicio-hero");
  var cierreGiro = document.querySelector(".cierre");
  if (barra && heroGiro && "IntersectionObserver" in window) {
    var heroVisible = true, cierreVisible = false;
    var pintarBarra = function () { barra.toggleAttribute("data-visible", !heroVisible && !cierreVisible); };
    var verBarra = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (e.target === heroGiro) heroVisible = e.isIntersecting; else cierreVisible = e.isIntersecting;
      });
      pintarBarra();
    });
    verBarra.observe(heroGiro);
    if (cierreGiro) verBarra.observe(cierreGiro);
  }

  /* ---- Videos de las tarjetas ----------------------------------------------
     Con «reducir movimiento» se quedan en su portada, que es un cuadro con los
     datos completos. */
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.querySelectorAll("video[autoplay]").forEach(function (v) { v.removeAttribute("autoplay"); v.pause(); });
  }

  /* En «Todo tu negocio» el video de la fila que se abre arranca desde el
     principio: el que estaba oculto venía corriendo y entraba a la mitad. */
  document.querySelectorAll(".cosas").forEach(function (cosas) {
    var capturas = cosas.querySelectorAll(".cosas-capturas > *");
    cosas.querySelectorAll("[data-acordeon-boton]").forEach(function (boton, i) {
      boton.addEventListener("click", function () {
        var v = capturas[i] && capturas[i].querySelector("video");
        if (v && v.autoplay) { v.currentTime = 0; v.play(); }
      });
    });
  });
})();
