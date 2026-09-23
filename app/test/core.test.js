// Testovi za budzet-core.js — pokretanje: npm test (u folderu app)
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../budzet-core.js');

test('parseAmount: srpski, engleski i mesoviti zapisi', () => {
  const cases = [
    ['1.234,56', 1234.56], ['1,234.56', 1234.56], ['1234,56', 1234.56], ['1234.56', 1234.56],
    ['1.234', 1234], ['1.234.567', 1234567], ['12.5', 12.5], ['1,234', 1234], ['12,5', 12.5],
    ['-1.234,00', -1234], ['(1.234,00)', -1234], ['1.234,56 RSD', 1234.56], ['RSD -350', -350],
    ['1 234,56', 1234.56], ['1 234,56', 1234.56], ['350-', -350], ['−1.500', -1500],
    [350, 350], ['', NaN], ['abc', NaN], [null, NaN]
  ];
  for(const [input, want] of cases){
    const got = C.parseAmount(input);
    if(Number.isNaN(want)) assert.ok(Number.isNaN(got), `${input} -> NaN, dobijeno ${got}`);
    else assert.equal(got, want, `${JSON.stringify(input)}`);
  }
});

test('parseQuickAmount: iznos iz opisa', () => {
  assert.deepEqual(C.parseQuickAmount('Kafa 350', NaN), { desc: 'Kafa', amount: 350 });
  assert.deepEqual(C.parseQuickAmount('Kafa 1.500', NaN), { desc: 'Kafa', amount: 1500 });
  assert.deepEqual(C.parseQuickAmount('Kafa', 200), { desc: 'Kafa', amount: 200 });
});

test('parseFlexibleDate', () => {
  assert.equal(C.parseFlexibleDate('23.09.2026'), '2026-09-23');
  assert.equal(C.parseFlexibleDate('23.09.2026.'), '2026-09-23');
  assert.equal(C.parseFlexibleDate('3.9.26'), '2026-09-03');
  assert.equal(C.parseFlexibleDate('2026-09-23'), '2026-09-23');
  assert.equal(C.parseFlexibleDate('23/09/2026 14:33'), '2026-09-23');
  assert.equal(C.parseFlexibleDate('20260923'), '2026-09-23');
  assert.equal(C.parseFlexibleDate('31.02.2026'), null);
  assert.equal(C.parseFlexibleDate('nije datum'), null);
});

test('meseci i dan dospeca', () => {
  assert.equal(C.addMonths('2026-01', -1), '2025-12');
  assert.equal(C.addMonths('2026-11', 3), '2027-02');
  assert.equal(C.daysInMonth('2028-02'), 29);
  assert.equal(C.effectiveDay(31, '2026-02'), 28);
  assert.equal(C.effectiveDay(31, '2026-04'), 30);
  assert.equal(C.effectiveDay(15, '2026-04'), 15);
  assert.equal(C.dueDateFor({ day: 31 }, '2026-06'), '2026-06-30');
  assert.deepEqual(C.monthRange('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']);
});

test('isDueInMonth: kvartalno i godisnje', () => {
  const q = { frequency: 'quarterly', anchorMonth: 11 };
  assert.ok(C.isDueInMonth(q, '2026-11'));
  assert.ok(C.isDueInMonth(q, '2027-02'));
  assert.ok(!C.isDueInMonth(q, '2026-12'));
  assert.ok(C.isDueInMonth({ frequency: 'yearly', anchorMonth: 3 }, '2027-03'));
  assert.ok(!C.isDueInMonth({ frequency: 'yearly', anchorMonth: 3 }, '2027-04'));
  assert.ok(C.isDueInMonth({}, '2027-04'));
});

test('CSV: tacka-zarez, srpski brojevi, kolone Isplata/Uplata', () => {
  const csv = '﻿Izvod za racun 123\n' +
    'Datum;Opis;Isplata;Uplata\n' +
    '01.09.2026;"Maxi; Novi Sad";1.234,56;\n' +
    '02.09.2026;Plata;;85.000,00\n' +
    '03.09.2026;Prazan red;;\n';
  const table = C.parseCsv(csv);
  assert.equal(C.detectDelimiter(csv), ';');
  const r = C.tableToImportRows(table);
  assert.equal(r.error, null);
  assert.equal(r.rows.length, 2);
  assert.equal(r.skipped, 1);
  assert.deepEqual([r.rows[0].date, r.rows[0].desc, r.rows[0].amount, r.rows[0].type], ['2026-09-01', 'Maxi; Novi Sad', 1234.56, 'expense']);
  assert.deepEqual([r.rows[1].amount, r.rows[1].type], [85000, 'income']);
});

test('CSV: izvoz ove aplikacije (Tip, Placeno, Oznake)', () => {
  const csv = '"Datum","Opis","Kategorija","Tip","Iznos","Plaćeno","Oznake"\n' +
    '"2026-09-01","Kafa","Hrana","expense","350","ne","posao, grad"\n' +
    '"2026-09-02","Plata","Plata","income","85000","",""\n';
  const r = C.tableToImportRows(C.parseCsv(csv));
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.rows[0], { date: '2026-09-01', amount: 350, type: 'expense', desc: 'Kafa', category: 'Hrana', paid: false, tags: ['posao', 'grad'] });
  assert.equal(r.rows[1].type, 'income');
});

test('CSV: jedna kolona Iznos sa znakom, novi red u navodnicima', () => {
  const csv = 'Date,Description,Amount\n2026-09-05,"Two\nlines",-1,500.00\n';
  // "-1,500.00" nije u navodnicima pa ga zarez deli — banka bi ga stavila u navodnike:
  const ok = 'Date,Description,Amount\n2026-09-05,"Two\nlines","-1,500.00"\n';
  const r = C.tableToImportRows(C.parseCsv(ok));
  assert.equal(r.rows.length, 1);
  assert.deepEqual([r.rows[0].amount, r.rows[0].type, r.rows[0].desc], [1500, 'expense', 'Two lines']);
  assert.ok(C.parseCsv(csv).length >= 1);
});

test('duplikati pri uvozu', () => {
  const existing = [{ type: 'expense', date: '2026-09-01', amount: 350, desc: 'Kafa' }];
  const rows = [
    { type: 'expense', date: '2026-09-01', amount: 350, desc: ' kafa ' },
    { type: 'expense', date: '2026-09-01', amount: 350, desc: 'Kafa' },
    { type: 'expense', date: '2026-09-02', amount: 350, desc: 'Kafa' }
  ];
  const { fresh, dups } = C.splitDuplicates(rows, existing);
  assert.equal(dups.length, 1);
  assert.equal(fresh.length, 2);
});

test('pravila: duza kljucna rec ima prednost', () => {
  const rules = [{ keyword: 'wolt', category: 'Restorani' }, { keyword: 'wolt market', category: 'Hrana' }];
  assert.equal(C.categoryFromRules(rules, 'WOLT MARKET BEOGRAD'), 'Hrana');
  assert.equal(C.categoryFromRules(rules, 'Wolt narudzba'), 'Restorani');
  assert.equal(C.categoryFromRules(rules, 'Maxi'), null);
});

test('OFX i QIF', () => {
  const ofx = '<OFX><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260901120000<TRNAMT>-350.00<NAME>Kafa</STMTTRN><STMTTRN><DTPOSTED>20260902<TRNAMT>1000<NAME>Uplata</STMTTRN></BANKTRANLIST></OFX>';
  const o = C.parseOFX(ofx);
  assert.equal(o.length, 2);
  assert.deepEqual([o[0].date, o[0].amount, o[0].type], ['2026-09-01', 350, 'expense']);
  const qif = '!Type:Bank\nD09/03/2026\nT-1,250.00\nPMaxi\nLHrana\n^\nD09/04\'26\nT500\nPPoklon\n^\n';
  const q = C.parseQIF(qif);
  assert.equal(q.length, 2);
  assert.deepEqual([q[0].date, q[0].amount, q[0].type, q[0].category], ['2026-09-03', 1250, 'expense', 'Hrana']);
  assert.equal(q[1].date, '2026-09-04');
});

test('stanja racuna sa prenosima', () => {
  const accounts = [{ id: 'a', openingBalance: 1000 }, { id: 'b', openingBalance: 0 }];
  const entries = [
    { type: 'income', amount: 500, accountId: 'a', date: '2026-09-01' },
    { type: 'expense', amount: 200, accountId: 'b', date: '2026-09-02' },
    { type: 'expense', amount: 100, date: '2026-09-02', paid: false },
    { type: 'expense', amount: 50, date: '2026-09-03' },
    { type: 'transfer', amount: 300, fromAccount: 'a', toAccount: 'b', date: '2026-09-04' }
  ];
  const paid = e => e.paid !== false;
  assert.deepEqual(C.accountBalances(accounts, entries, paid), { a: 1000 + 500 - 50 - 300, b: -200 + 300 });
  assert.deepEqual(C.accountBalances(accounts, entries, paid, '2026-09-02'), { a: 1500, b: -200 });
});

test('raspodela na vise meseci', () => {
  const plata = { amount: 240000, date: '2026-07-05', spreadMonths: 3 };
  assert.equal(C.shareInMonth(plata, '2026-06'), 0);
  assert.equal(C.shareInMonth(plata, '2026-07'), 80000);
  assert.equal(C.shareInMonth(plata, '2026-09'), 80000);
  assert.equal(C.shareInMonth(plata, '2026-10'), 0);
  // unazad: uplaceno u oktobru za jul–sep
  const zaProslo = { amount: 90000, date: '2026-10-02', spreadMonths: 3, spreadStart: '2026-07' };
  assert.equal(C.shareInMonth(zaProslo, '2026-10'), 0);
  assert.equal(C.shareInMonth(zaProslo, '2026-08'), 30000);
  // preko granice godine
  const god = { amount: 12000, date: '2026-11-10', spreadMonths: 12 };
  assert.equal(C.shareInMonth(god, '2027-10'), 1000);
  assert.equal(C.shareInMonth(god, '2027-11'), 0);
  assert.equal(C.shareInMonths(god, C.monthRange('2027-01', '2027-12')), 10000);
  // obicna stavka
  assert.equal(C.shareInMonth({ amount: 500, date: '2026-07-31' }, '2026-07'), 500);
  assert.equal(C.shareInMonth({ amount: 500, date: '2026-07-31', spreadMonths: 1, spreadStart: '2026-01' }, '2026-01'), 0);
});

test('valute i plan otplate', () => {
  assert.equal(C.convertToRsd(100, 'EUR', { EUR: 117.2 }), 11720);
  assert.equal(C.convertToRsd(100, 'RSD', {}), 100);
  assert.ok(Number.isNaN(C.convertToRsd(100, 'USD', { EUR: 117 })));
  const plan = C.debtPayoffPlan([{ id: 'x', person: 'A', remaining: 300 }, { id: 'y', person: 'B', remaining: 100 }], 150);
  assert.equal(plan.months, 3);
  assert.deepEqual(plan.payoffMonth, { y: 1, x: 3 });
  assert.equal(C.linearRegressionForecast([100, 200, 300]), 400);
});
