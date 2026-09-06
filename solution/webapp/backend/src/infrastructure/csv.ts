/**
 * Минимальный парсер CSV по RFC 4180: кавычки, экранированные кавычки,
 * запятые и переводы строк внутри значений. Без зависимостей — в наборе
 * данных 6800 из 10000 строк содержат запятые внутри полей, поэтому
 * разбиение по split() здесь неприменимо.
 */
export function parseCsv(text: string): string[][] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let started = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];

    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
      started = true;
      continue;
    }

    if (char === ',') {
      row.push(field);
      field = '';
      started = true;
      continue;
    }

    if (char === '\r') continue;

    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      started = false;
      continue;
    }

    field += char;
    started = true;
  }

  if (started || field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** Разбирает CSV в объекты по заголовку первой строки. */
export function parseCsvRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  const header = rows[0];
  if (header === undefined) return [];

  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    header.forEach((name, index) => {
      record[name] = row[index] ?? '';
    });
    return record;
  });
}
