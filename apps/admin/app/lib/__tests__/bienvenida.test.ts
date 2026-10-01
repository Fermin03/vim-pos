import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `pedirBienvenida` se llama desde las pantallas de confirmación del dueño. Lo único que se le
 * exige es que NUNCA estorbe: sin sesión no llama, y un fallo de red o un 500 de la función no
 * llega a quien la invocó. Que el correo salga una sola vez lo decide el servidor (0146).
 */
const doble = vi.hoisted(() => ({ token: "tok-1" as string | null }));

vi.mock("../supabase", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: doble.token ? { access_token: doble.token } : null } })) } },
}));

import { pedirBienvenida } from "../bienvenida";

const fetchFalso = vi.fn();
beforeEach(() => {
  doble.token = "tok-1";
  fetchFalso.mockReset();
  vi.stubGlobal("fetch", fetchFalso);
});

describe("pedirBienvenida", () => {
  it("llama a la función con el token de la sesión y sin datos del cliente en el cuerpo", async () => {
    fetchFalso.mockResolvedValue({ ok: true });
    await pedirBienvenida();
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFalso.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:54321/functions/v1/correo-bienvenida");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
    expect(init.body).toBe("{}");
  });

  it("sin sesión no llama a nada", async () => {
    doble.token = null;
    await pedirBienvenida();
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("un fallo de red no llega a quien la llamó", async () => {
    fetchFalso.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(pedirBienvenida()).resolves.toBeUndefined();
  });

  it("un 500 o un 429 de la función tampoco", async () => {
    fetchFalso.mockResolvedValue({ ok: false, status: 500 });
    await expect(pedirBienvenida()).resolves.toBeUndefined();
  });
});
