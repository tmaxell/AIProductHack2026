import parsePhoneNumber from 'libphonenumber-js/max';
import { EMPTY, issue, readRaw, type NormalizationIssue, type NormalizationResult } from './types.js';

const PHONE_LABEL = /^(?:(?:тел(?:ефон)?\.?|tel)\s*:?\s*)/iu;
const EXTENSION = /\s*(?:доб(?:авочный)?\.?|ext\.?|extension|x)\s*:?\s*(\d+)$/iu;
const PHONE_CHARACTERS = /^\+?[\d\s().-]+$/u;

export function normalizePhone(raw: unknown): NormalizationResult {
  const source = readRaw(raw);
  if (source === null) return EMPTY;

  const issues: NormalizationIssue[] = [];
  const trimmed = source.trim();

  // Маска не содержит достаточно данных для безопасной нормализации или
  // сопоставления. Исходное значение сохраняется без изменений.
  if (trimmed.includes('*')) {
    issues.push(issue('warning', 'MASKED_PHONE', 'Номер маскирован символом *'));
    return { value: trimmed, changed: false, issues };
  }

  const withoutLabel = trimmed.replace(PHONE_LABEL, '').trim();
  const extension = EXTENSION.exec(withoutLabel);
  const numberPart = extension === null
    ? withoutLabel
    : withoutLabel.slice(0, extension.index).trim();

  // Не вырезаем произвольные буквы: иначе ИНН, комментарий или смешанная
  // строка могли незаметно превратиться в правдоподобный телефон.
  if (!PHONE_CHARACTERS.test(numberPart)) {
    issues.push(issue('error', 'BAD_PHONE', 'Телефон содержит недопустимые символы'));
    return { value: trimmed, changed: false, issues };
  }

  let parsed;
  try {
    // Номер без международного префикса трактуется как российский. extract:
    // false требует, чтобы вся строка была номером, а не содержала его внутри.
    parsed = parsePhoneNumber(numberPart, { defaultCountry: 'RU', extract: false });
  } catch {
    parsed = undefined;
  }

  if (parsed === undefined || !parsed.isPossible() || !parsed.isValid()) {
    issues.push(issue('error', 'BAD_PHONE', 'Номер не соответствует телефонному плану'));
    return { value: trimmed, changed: false, issues };
  }

  // Пока в модели нет отдельного поля для добавочного номера, автоматически
  // отбрасывать его нельзя. Валидный основной номер остаётся на ручной review.
  if (extension !== null) {
    issues.push(
      issue('warning', 'PHONE_EXTENSION_PRESENT', 'Найден добавочный номер; требуется отдельное поле'),
    );
    return { value: trimmed, changed: false, issues };
  }

  const value = parsed.number;
  return { value, changed: trimmed !== value, issues };
}
