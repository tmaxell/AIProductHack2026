import { describe, expect, test } from 'vitest';
import {
  buildApplicationIndex,
  findDuplicate,
  type ApplicationSummary,
} from '../../../src/domain/matching/index.js';

const base: ApplicationSummary = {
  id: 'ROW-100',
  applicationId: 'APP-100',
  companyName: 'ООО «Орбита Логистика»',
  companyInn: '1308-807582',
  companyEmail: 'info@orbita.example',
  companyPhone: '+74951112233',
  projectName: 'API-контур партнёров / Орбита Логистика',
};

// Отличается регистром, пробелами и «ё» — ровно как в dev-выборке.
const twin: ApplicationSummary = {
  ...base,
  id: 'ROW-050',
  applicationId: 'APP-050',
  companyName: 'ооо «орбита логистика»',
  projectName: 'API-контур партнеров  /Орбита Логистика',
};

const otherCompany: ApplicationSummary = {
  ...base,
  id: 'ROW-200',
  applicationId: 'APP-200',
  companyName: 'ООО «Вектор Сеть»',
  companyInn: '7798765432',
  companyEmail: 'info@vektor.example',
  companyPhone: '+74957654321',
};

describe('findDuplicate', () => {
  test('находит дубль, отличающийся регистром, пробелами и ё', () => {
    const outcome = findDuplicate(base, buildApplicationIndex([base, twin]));

    expect(outcome).not.toBeNull();
    expect(outcome?.canonical.id).toBe('ROW-050');
    expect(outcome?.confidence).toBe('high');
    expect(outcome?.factors.map((f) => f.label)).toContain('название проекта');
  });

  test('канонической считается запись с наименьшим id', () => {
    const index = buildApplicationIndex([base, twin]);

    // У ROW-050 оригинал не предлагается: она сама и есть оригинал.
    expect(findDuplicate(twin, index)).toBeNull();
    expect(findDuplicate(base, index)?.canonical.id).toBe('ROW-050');
  });

  test('одинаковое название проекта у разной компании дублем не считается', () => {
    expect(findDuplicate(base, buildApplicationIndex([base, otherCompany]))).toBeNull();
  });

  test('не считает одинаковый невалидный телефон признаком дубля', () => {
    const first: ApplicationSummary = {
      ...base,
      companyName: 'Первая компания',
      companyInn: '',
      companyEmail: '',
      companyPhone: 'ИНН 1234567890',
    };
    const second: ApplicationSummary = {
      ...first,
      id: 'ROW-200',
      companyName: 'Вторая компания',
    };

    expect(findDuplicate(second, buildApplicationIndex([first, second]))).toBeNull();
  });

  test('совпадение только по контакту даёт среднюю уверенность', () => {
    const sameContact: ApplicationSummary = {
      ...otherCompany,
      id: 'ROW-010',
      companyEmail: base.companyEmail,
      companyInn: '',
    };
    const outcome = findDuplicate(base, buildApplicationIndex([base, sameContact]));

    expect(outcome?.confidence).toBe('medium');
  });

  test('запись не является дублем самой себя', () => {
    expect(findDuplicate(base, buildApplicationIndex([base]))).toBeNull();
  });

  test('пустое название проекта не даёт дублей', () => {
    const blank = { ...base, id: 'ROW-300', projectName: '' };
    expect(findDuplicate(blank, buildApplicationIndex([blank, base]))).toBeNull();
  });

  test('в группе больше двух указывается её размер', () => {
    const third: ApplicationSummary = { ...twin, id: 'ROW-070', applicationId: 'APP-070' };
    const outcome = findDuplicate(base, buildApplicationIndex([base, twin, third]));

    expect(outcome?.groupSize).toBe(3);
    expect(outcome?.canonical.id).toBe('ROW-050');
  });
});
