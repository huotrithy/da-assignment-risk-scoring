const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDate, parseBirthNumber, translate } = require('../scripts/berka/lib/parse');

test('parseDate converts YYMMDD to ISO 19xx date', () => {
  assert.equal(parseDate('930705'), '1993-07-05');
});

test('parseBirthNumber decodes female (month + 50)', () => {
  assert.deepEqual(parseBirthNumber('706213'), { birth_date: '1970-12-13', gender: 'F' });
});

test('parseBirthNumber decodes male', () => {
  assert.deepEqual(parseBirthNumber('450204'), { birth_date: '1945-02-04', gender: 'M' });
});

test('translate maps Czech k_symbol to English', () => {
  assert.equal(translate('k_symbol', 'SANKC. UROK'), 'penalty_interest');
});

test('translate maps blank k_symbol to null', () => {
  assert.equal(translate('k_symbol', ' '), null);
});
