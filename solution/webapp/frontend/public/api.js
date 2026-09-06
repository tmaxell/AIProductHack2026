/* ============================================================
   api.js — единственное место, где фронтенд знает про HTTP.
   Правила нормализации живут в backend и здесь не дублируются.
   ============================================================ */

const API_BASE = '/api/v1';
/* Запрос не должен висеть бесконечно: пользователь увидит ошибку, а не спиннер. */
const TIMEOUT_MS = 20000;

class ApiError extends Error {
  constructor(status, payload) {
    super((payload && payload.message) || 'Запрос завершился с кодом ' + status);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

const UNAVAILABLE = 'Сервис недоступен. Проверьте, что backend запущен.';

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(API_BASE + path, {
      method: options.method || 'GET',
      headers: options.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (cause) {
    throw new ApiError(0, {
      message: cause && cause.name === 'AbortError'
        ? 'Сервис не ответил вовремя. Попробуйте ещё раз.'
        : UNAVAILABLE,
    });
  } finally {
    clearTimeout(timer);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status >= 502 && response.status <= 504 && !payload) {
      throw new ApiError(response.status, { message: UNAVAILABLE });
    }
    throw new ApiError(response.status, payload);
  }
  return payload;
}

function post(path, body) { return request(path, { method: 'POST', body }); }
function patch(path, body) { return request(path, { method: 'PATCH', body }); }

window.API = {
  ApiError,

  /** Черновик набора изменений. Ничего не изменяет. */
  createChangeSet: (records, parentId) =>
    post('/change-sets', { records, ...(parentId ? { parentId } : {}) }),

  listChangeSets: (status) => request('/change-sets' + (status ? '?status=' + encodeURIComponent(status) : '')),

  getChangeSet: (id) => request('/change-sets/' + encodeURIComponent(id)),

  saveDecisions: (id, actions) =>
    patch('/change-sets/' + encodeURIComponent(id) + '/decisions', { actions }),

  compareChangeSets: (id, against) =>
    request('/change-sets/' + encodeURIComponent(id) + '/diff?against=' + encodeURIComponent(against)),

  getChangeSetHistory: (id) =>
    request('/change-sets/' + encodeURIComponent(id) + '/history'),

  publishChangeSet: (id, records) =>
    post('/change-sets/' + encodeURIComponent(id) + '/publish', { records }),

  createRollback: (id, records) =>
    post('/change-sets/' + encodeURIComponent(id) + '/rollback', { records }),

  discardChangeSet: (id) => post('/change-sets/' + encodeURIComponent(id) + '/discard'),

  /** Применение только подтверждённых действий. */
  applyChangeSet: (records, sourceFingerprint, actionIds) =>
    post('/change-sets/apply', { records, sourceFingerprint, actionIds }),
};
