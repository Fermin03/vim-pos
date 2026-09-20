import { describe, expect, it, vi } from "vitest";
import { PilaEscape, capaVisible, type CapaEscape } from "../escape";

/**
 * Quién se queda con la tecla Escape.
 *
 * El POS tiene varias pantallas escuchando Escape a la vez: la lista de cuentas de Comedor, el
 * armazón de home-pos con sus modales, y las pantallas que se pintan ENCIMA (mapa de mesas,
 * reservaciones). Sin un árbitro, la de más abajo se quedaba con la tecla y mandaba al cajero al
 * inicio desde un diálogo que solo quería cerrarse.
 */

describe("capaVisible", () => {
  it("devuelve la acción de la primera capa visible, no de la siguiente", () => {
    const cerrarModal = vi.fn();
    const salir = vi.fn();
    const capas: CapaEscape[] = [
      [false, vi.fn()],
      [true, cerrarModal],
      [true, salir],
    ];
    capaVisible(capas)?.();
    expect(cerrarModal).toHaveBeenCalledOnce();
    expect(salir).not.toHaveBeenCalled();
  });

  it("sin ninguna capa visible no devuelve acción (la pantalla de abajo decide)", () => {
    expect(capaVisible([[false, vi.fn()]])).toBeNull();
    expect(capaVisible([])).toBeNull();
  });
});

describe("PilaEscape", () => {
  it("con nadie registrado, Escape no hace nada", () => {
    expect(new PilaEscape().disparar()).toBe(false);
  });

  it("gana la última pantalla registrada, no la primera", () => {
    const pila = new PilaEscape();
    const abajo = vi.fn();
    const arriba = vi.fn();
    pila.registrar(abajo);
    pila.registrar(arriba);

    expect(pila.disparar()).toBe(true);
    expect(arriba).toHaveBeenCalledOnce();
    expect(abajo).not.toHaveBeenCalled();
  });

  it("al desmontarse la de arriba, la tecla vuelve a la de abajo", () => {
    const pila = new PilaEscape();
    const abajo = vi.fn();
    const arriba = vi.fn();
    pila.registrar(abajo);
    const quitarArriba = pila.registrar(arriba);

    quitarArriba();
    pila.disparar();
    expect(abajo).toHaveBeenCalledOnce();
  });

  it("volver a registrarse sube a la pantalla arriba del todo", () => {
    // Es lo que hace que abrir un modal gane: al cambiar su acción de Escape, el armazón se da de
    // baja y se vuelve a registrar (lo que hace React con el efecto), y eso lo pone arriba.
    const pila = new PilaEscape();
    const armazonSinNada = vi.fn();
    const armazonConModal = vi.fn();
    const lista = vi.fn();
    let quitarArmazon = pila.registrar(armazonSinNada);
    pila.registrar(lista);

    quitarArmazon();
    quitarArmazon = pila.registrar(armazonConModal);

    pila.disparar();
    expect(armazonConModal).toHaveBeenCalledOnce();
    expect(lista).not.toHaveBeenCalled();
    expect(armazonSinNada).not.toHaveBeenCalled();
  });

  it("dos pantallas con la MISMA acción no se pisan al desmontarse una", () => {
    // `onSalir` viaja como prop: la misma función puede estar registrada dos veces.
    const pila = new PilaEscape();
    const salir = vi.fn();
    const quitarUna = pila.registrar(salir);
    pila.registrar(salir);

    quitarUna();
    expect(pila.disparar()).toBe(true);
    expect(salir).toHaveBeenCalledOnce();
  });

  it("desmontar una pantalla que ya no está en la pila no tumba a las demás", () => {
    const pila = new PilaEscape();
    const abajo = vi.fn();
    const quitar = pila.registrar(vi.fn());
    quitar();
    quitar();
    pila.registrar(abajo);

    pila.disparar();
    expect(abajo).toHaveBeenCalledOnce();
  });

  it("EL BUG: Escape en «Nueva reservación» cierra el diálogo, no manda al inicio", () => {
    // Comedor está montado debajo; Reservaciones se pinta encima y también escucha.
    const pila = new PilaEscape();
    const volverAlInicio = vi.fn();
    const cerrarDialogo = vi.fn();
    pila.registrar(volverAlInicio); // pantalla-cuentas-modo (Comedor), su última capa es salir
    const quitarReservaciones = pila.registrar(cerrarDialogo); // pantalla-reservaciones con el diálogo abierto

    pila.disparar();
    expect(cerrarDialogo).toHaveBeenCalledOnce();
    expect(volverAlInicio).not.toHaveBeenCalled();

    // Y cuando reservaciones se cierra del todo, Comedor recupera la tecla.
    quitarReservaciones();
    pila.disparar();
    expect(volverAlInicio).toHaveBeenCalledOnce();
  });
});
