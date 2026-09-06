import { EMPTY, readRaw, type NormalizationResult } from './types.js';

/**
 * Названию компании чинится только форма записи: лишние пробелы и разнобой
 * кавычек. Регистр не трогаем — «МТС» и «ИТ-Град» превратились бы в «Мтс» и
 * «Ит-Град». Организационно-правовая форма тоже остаётся: «ООО Ромашка» и
 * «АО Ромашка» — разные юридические лица, а справочник хранит полное и
 * короткое название отдельными полями.
 *
 * Снятие ОПФ используется только как ключ сравнения при сопоставлении,
 * см. domain/matching/company-index.ts.
 */
export function normalizeCompanyName(raw: unknown): NormalizationResult {
  const source = readRaw(raw);
  if (source === null) return EMPTY;

  const value = source
    .replace(/[«»"“”„]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/"\s*([^"]*?)\s*"/g, '«$1»');

  return { value, changed: source.trim() !== value, issues: [] };
}
