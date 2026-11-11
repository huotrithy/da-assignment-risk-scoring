// Helpers for reading the raw Berka (PKDD'99) files: dates, birth numbers, Czech codes.

// '930705' -> '1993-07-05' (all Berka dates are 19xx)
function parseDate(yymmdd) {
  const s = String(yymmdd).trim().slice(0, 6);
  return `19${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 6)}`;
}

// Birth number YYMMDD; women have 50 added to the month.
function parseBirthNumber(bn) {
  const s = String(bn).trim();
  let mm = +s.slice(2, 4);
  let gender = 'M';
  if (mm > 50) { mm -= 50; gender = 'F'; }
  return { birth_date: `19${s.slice(0, 2)}-${String(mm).padStart(2, '0')}-${s.slice(4, 6)}`, gender };
}

const MAPS = {
  frequency: {
    'POPLATEK MESICNE': 'monthly',
    'POPLATEK TYDNE': 'weekly',
    'POPLATEK PO OBRATU': 'after_transaction',
  },
  type: { PRIJEM: 'credit', VYDAJ: 'withdrawal', VYBER: 'withdrawal' },
  operation: {
    VKLAD: 'cash_deposit',
    'PREVOD Z UCTU': 'transfer_in',
    VYBER: 'cash_withdrawal',
    'VYBER KARTOU': 'card_withdrawal',
    'PREVOD NA UCET': 'transfer_out',
  },
  k_symbol: {
    POJISTNE: 'insurance',
    SLUZBY: 'statement_fee',
    UROK: 'interest',
    'SANKC. UROK': 'penalty_interest',
    SIPO: 'household',
    DUCHOD: 'pension',
    UVER: 'loan_payment',
  },
};

// Czech code -> English label. Blank -> null. Unknown codes are kept as-is.
function translate(field, code) {
  if (code == null) return null;
  const c = String(code).trim();
  if (c === '') return null;
  const map = MAPS[field];
  return map && c in map ? map[c] : c;
}

module.exports = { parseDate, parseBirthNumber, translate, MAPS };
