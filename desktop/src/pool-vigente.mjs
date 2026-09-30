// Pool del Postgres local que sobrevive a los reinicios del backend (Auditoría integral 30/09/2026, D6).
//
// El espejo de delivery recibía `backend.pool` UNA vez, al crearse. El perro guardián
// (reiniciarBackend) y "Respaldar ahora" paran el backend —pool.end()— y levantan otro con un pool
// nuevo; el espejo se quedaba con el viejo y cada vuelta moría con "Cannot use a pool after calling
// end on the pool": los pedidos de Uber dejaban de entrar a la caja hasta reiniciar la aplicación.
//
// Esto resuelve el pool VIGENTE en cada llamada. Mientras el backend se está reiniciando no hay
// pool: la llamada falla con un error claro y el agente lo trata como cualquier vuelta fallida
// (reintenta con backoff).

/** poolVigente(() => backend?.pool) → objeto con query/connect que siempre usa el pool actual. */
export function poolVigente(obtener) {
  const actual = () => {
    const p = obtener();
    if (!p) throw new Error("el backend local se está reiniciando");
    return p;
  };
  return {
    // async: un backend a medio reiniciar se ve como promesa rechazada, también en `.catch()` encadenado.
    query: async (...args) => actual().query(...args),
    connect: async () => actual().connect(),
  };
}
