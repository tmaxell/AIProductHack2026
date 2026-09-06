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

async function post(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
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

window.API = {
  ApiError,

  /** Черновик набора изменений. Ничего не изменяет. */
  createChangeSet: (records) => post('/change-sets', { records }),

  /** Применение только подтверждённых действий. */
  applyChangeSet: (records, sourceFingerprint, actionIds) =>
    post('/change-sets/apply', { records, sourceFingerprint, actionIds }),
};
