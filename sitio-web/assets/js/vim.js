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

  /* ---- La página actual se marca sola -------------------------------------
     Evita tener que acordarse de poner aria-current a mano en cada archivo, que
     es exactamente el tipo de cosa que se olvida en la quinta página. */
  var aqui = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-enlace, .nav-movil-lista a").forEach(function (a) {
    var destino = a.getAttribute("href");
    if (destino === aqui) a.setAttribute("aria-current", "page");
  });
})();
