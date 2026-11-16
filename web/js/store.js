// Persistencia ligera en el dispositivo (localStorage). Todo es opcional:
// si el navegador la bloquea, la app sigue funcionando sin recordar nada.

const PREFIX = 'ws:';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* sin almacenamiento: se ignora */
  }
}

export const store = {
  /** Movimientos ya subidos: id -> { walletId, at } */
  uploaded: () => read('uploaded', {}),
  markUploaded(id, walletId) {
    const u = read('uploaded', {});
    u[id] = { walletId, at: new Date().toISOString() };
    write('uploaded', u);
  },

  /** Lo aprendido de tus elecciones: claveComercio -> { categoryId, labelIds } */
  learned: () => read('learned', {}),
  learn(key, value) {
    if (!key) return;
    const l = read('learned', {});
    l[key] = value;
    write('learned', l);
  },

  /** Cuenta elegida por banco (para recordarla). */
  accountFor: (bank) => read('account:' + bank, null),
  setAccountFor: (bank, id) => write('account:' + bank, id),

  /** Índice del historial (clave -> {categoria: n}) con fecha de carga. */
  history: () => read('history', null),
  setHistory: (entries) => write('history', { at: Date.now(), entries }),
};
