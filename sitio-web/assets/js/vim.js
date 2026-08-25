/* VIM POS — el único JavaScript del sitio.
   Sin framework y sin build: seis páginas estáticas no lo justifican.

   Aquí solo vive lo que no se puede hacer con CSS. Todo lo que sea apariencia o
   transición está en vim.css, que corre fuera del hilo principal y no se cae si
   este archivo falla en cargar. */

(function () {
  "use strict";

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

  /* ---- La página actual se marca sola -------------------------------------
     Evita tener que acordarse de poner aria-current a mano en cada archivo, que
     es exactamente el tipo de cosa que se olvida en la quinta página. */
  var aqui = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-enlace, .nav-movil-lista a").forEach(function (a) {
    var destino = a.getAttribute("href");
    if (destino === aqui) a.setAttribute("aria-current", "page");
  });
})();
