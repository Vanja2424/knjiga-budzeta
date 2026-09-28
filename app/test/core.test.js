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

// ---------- Analiza potrosnje ----------
const ex = (id, date, amount, category, desc, extra = {}) => ({ id, type: 'expense', date, amount, category, desc, ...extra });

test('normalizeDesc: velika/mala slova, brojevi i interpunkcija na kraju', () => {
  assert.equal(C.normalizeDesc('Maxi 123'), 'maxi');
  assert.equal(C.normalizeDesc('MAXI.'), 'maxi');
  assert.equal(C.normalizeDesc('  maxi  '), 'maxi');
  assert.equal(C.normalizeDesc('Kafa (2)'), 'kafa');
  assert.equal(C.normalizeDesc('Lidl  Novi   Sad 45/2'), 'lidl novi sad');
  assert.equal(C.normalizeDesc('123'), '(bez opisa)');
  assert.equal(C.normalizeDesc('--'), '(bez opisa)');
  assert.equal(C.normalizeDesc(''), '(bez opisa)');
  assert.equal(C.normalizeDesc(undefined), '(bez opisa)');
  assert.equal(C.cleanDesc('Maxi 123'), 'Maxi');
});

test('analysisPeriod: n meseci pre izabranog, rastuce', () => {
  assert.deepEqual(C.analysisPeriod('2026-03', 3), ['2025-12', '2026-01', '2026-02']);
  assert.equal(C.analysisPeriod('2026-09', 12).length, 12);
  assert.equal(C.analysisPeriod('2026-09', 12)[11], '2026-08');
});

test('firstExpenseMonth: najraniji placeni trosak (i pocetak raspodele)', () => {
  assert.equal(C.firstExpenseMonth([]), null);
  assert.equal(C.firstExpenseMonth([ex('a', '2026-05-10', 100, 'Hrana', 'x'), ex('b', '2026-03-02', 100, 'Hrana', 'y')]), '2026-03');
  assert.equal(C.firstExpenseMonth([ex('a', '2026-05-10', 100, 'Hrana', 'x', { spreadMonths: 3, spreadStart: '2026-01' })]), '2026-01');
  assert.equal(C.firstExpenseMonth([ex('a', '2026-01-10', 100, 'Hrana', 'x', { paid: false }), ex('b', '2026-04-02', 100, 'Hrana', 'y')]), '2026-04');
  assert.equal(C.firstExpenseMonth([{ id: 'i', type: 'income', date: '2025-01-01', amount: 5, category: 'Plata', desc: 'p' }]), null);
});

test('periodStats: prosek samo od prvog meseca sa podacima, neplaceno se ne racuna', () => {
  const entries = [
    ex('a', '2026-04-05', 3000, 'Hrana', 'Maxi'),
    ex('b', '2026-05-05', 5000, 'Hrana', 'Maxi'),
    ex('c', '2026-05-06', 9999, 'Hrana', 'Maxi', { paid: false }),
    // jun bez troskova -> ulazi kao 0
  ];
  const st = C.periodStats(entries, ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']);
  assert.deepEqual(st.perMonth, [0, 0, 0, 3000, 5000, 0]);
  assert.deepEqual(st.counted, ['2026-04', '2026-05', '2026-06']);
  assert.equal(st.monthsWithData, 3);
  assert.equal(st.avg, 8000 / 3);
  assert.equal(st.enough, true);
  const onlyOne = C.periodStats(entries, ['2026-03', '2026-04']);
  assert.equal(onlyOne.monthsWithData, 1);
  assert.equal(onlyOne.enough, false);
  const none = C.periodStats([], ['2026-03', '2026-04']);
  assert.deepEqual(none, { perMonth: [0, 0], counted: [], monthsWithData: 0, avg: 0, enough: false });
  const hrana = C.periodStats(entries.concat([ex('d', '2026-05-07', 700, 'Prevoz', 'Bus')]), ['2026-04', '2026-05'], e => e.category === 'Prevoz');
  assert.deepEqual(hrana.perMonth, [0, 700]);
  assert.equal(hrana.avg, 350);
});

test('sumPaid i isFixedEntry', () => {
  const entries = [ex('a', '2026-05-05', 1000, 'Hrana', 'x'), ex('b', '2026-05-06', 400, 'Hrana', 'y', { paid: false }), ex('c', '2026-04-06', 200, 'Hrana', 'z')];
  assert.equal(C.sumPaid(entries, '2026-05'), 1000);
  assert.equal(C.sumPaid(entries, '2026-05', e => e.category === 'Prevoz'), 0);
  assert.equal(C.isFixedEntry(ex('rec-abc-2026-05', '2026-05-01', 1, 'Zabava', 'Netflix'), []), true);
  assert.equal(C.isFixedEntry(ex('x1', '2026-05-01', 1, 'Stanovanje', 'Kirija'), ['Stanovanje']), true);
  assert.equal(C.isFixedEntry(ex('x2', '2026-05-01', 1, 'Hrana', 'Maxi'), ['Stanovanje']), false);
});

test('monthlyEquivalent', () => {
  assert.equal(C.monthlyEquivalent({ amount: 1200, frequency: 'yearly' }), 100);
  assert.equal(C.monthlyEquivalent({ amount: 300, frequency: 'quarterly' }), 100);
  assert.equal(C.monthlyEquivalent({ amount: 100, frequency: 'monthly' }), 100);
  assert.equal(C.monthlyEquivalent({ amount: 100 }), 100);
});

test('groupByDesc: grupe po opisu, raspodeljeni trosak ulazi mesecnim delom', () => {
  const entries = [
    ex('a', '2026-05-02', 1000, 'Hrana', 'Maxi 12'),
    ex('b', '2026-05-09', 3000, 'Hrana', 'maxi.'),
    ex('c', '2026-05-10', 500, 'Hrana', 'Pekara'),
    ex('d', '2026-05-11', 700, 'Prevoz', 'Bus'),
    ex('e', '2026-04-11', 6000, 'Hrana', 'Nabavka', { spreadMonths: 3, spreadStart: '2026-04' }), // 2000/mes: apr, maj, jun
    ex('f', '2026-05-12', 9999, 'Hrana', 'Maxi', { paid: false })
  ];
  const g = C.groupByDesc(entries, ['2026-05'], e => e.category === 'Hrana');
  assert.deepEqual(g.map(x => [x.key, x.label, x.total, x.count]), [
    ['maxi', 'Maxi', 4000, 2], ['nabavka', 'Nabavka', 2000, 1], ['pekara', 'Pekara', 500, 1]
  ]);
  assert.equal(g[0].avgPurchase, 2000);
  const all = C.groupByDesc(entries, ['2026-05']);
  assert.equal(all.length, 4);
  const noDesc = C.groupByDesc([ex('z', '2026-05-01', 50, 'Hrana', '123')], ['2026-05']);
  assert.equal(noDesc[0].label, '(bez opisa)');
});

test('categoryBreakdown i aboveAverage: pragovi 20% i 1.000 RSD, tacno na pragu ulazi', () => {
  const entries = [];
  // Hrana: prosek 5000 (mar, apr), maj 6000 -> +1000 i +20% -> ulazi (tacno na pragu)
  entries.push(ex('h1', '2026-03-05', 5000, 'Hrana', 'x'), ex('h2', '2026-04-05', 5000, 'Hrana', 'x'), ex('h3', '2026-05-05', 6000, 'Hrana', 'x'));
  // Zabava: prosek 2000, maj 2900 -> +45% ali samo +900 -> ne ulazi
  entries.push(ex('z1', '2026-03-05', 2000, 'Zabava', 'y'), ex('z2', '2026-04-05', 2000, 'Zabava', 'y'), ex('z3', '2026-05-05', 2900, 'Zabava', 'y'));
  // Stanovanje: prosek 40000, maj 45000 -> +5000 ali +12,5% -> ne ulazi
  entries.push(ex('s1', '2026-03-05', 40000, 'Stanovanje', 'k'), ex('s2', '2026-04-05', 40000, 'Stanovanje', 'k'), ex('s3', '2026-05-05', 45000, 'Stanovanje', 'k'));
  // Pokloni: nova kategorija (prosek 0), maj 3000 -> ne ulazi u "iznad proseka"
  entries.push(ex('p1', '2026-05-05', 3000, 'Pokloni', 'p'));
  // Prevoz: prosek 3000, maj 5000 -> +2000, +66% -> ulazi, prvi po diff
  entries.push(ex('v1', '2026-03-05', 3000, 'Prevoz', 'b'), ex('v2', '2026-04-05', 3000, 'Prevoz', 'b'), ex('v3', '2026-05-05', 5000, 'Prevoz', 'b'));
  const b = C.categoryBreakdown(entries, '2026-05', 6);
  assert.equal(b.enough, true);
  assert.deepEqual(b.months, C.analysisPeriod('2026-05', 6));
  assert.deepEqual(b.rows.map(r => r.cat), ['Stanovanje', 'Hrana', 'Prevoz', 'Pokloni', 'Zabava']);
  assert.equal(b.total, 45000 + 6000 + 5000 + 3000 + 2900);
  const hrana = b.rows.find(r => r.cat === 'Hrana');
  assert.deepEqual([hrana.total, hrana.avg, hrana.diff, hrana.pct], [6000, 5000, 1000, 20]);
  assert.equal(b.rows.find(r => r.cat === 'Pokloni').pct, null);
  assert.deepEqual(C.aboveAverage(b).map(r => r.cat), ['Prevoz', 'Hrana']);
});

test('categoryBreakdown: premalo istorije -> bez poredjenja', () => {
  const entries = [ex('a', '2026-04-05', 5000, 'Hrana', 'x'), ex('b', '2026-05-05', 9000, 'Hrana', 'x')];
  const b = C.categoryBreakdown(entries, '2026-05', 6); // samo april pre maja
  assert.equal(b.enough, false);
  assert.deepEqual(b.rows.map(r => [r.cat, r.total, r.avg, r.diff, r.pct]), [['Hrana', 9000, null, null, null]]);
  assert.deepEqual(C.aboveAverage(b), []);
  const empty = C.categoryBreakdown([], '2026-05', 6);
  assert.deepEqual([empty.rows, empty.total, empty.enough], [[], 0, false]);
});

test('smallFrequent: <=1.500 prosecno i >=4 kupovine mesecno, samo promenljivo', () => {
  const entries = [];
  const months = ['2026-03', '2026-04'];
  months.forEach(m => {
    for(let i = 1; i <= 4; i++) entries.push(ex('k' + m + i, m + '-0' + i, 300, 'Hrana', 'Kafa ' + i)); // 4x/mes, 300
    for(let i = 1; i <= 3; i++) entries.push(ex('p' + m + i, m + '-1' + i, 200, 'Hrana', 'Pekara'));   // 3x/mes -> ne
    for(let i = 1; i <= 5; i++) entries.push(ex('t' + m + i, m + '-2' + i, 1600, 'Hrana', 'Taxi'));    // 1600 > 1500 -> ne
    for(let i = 1; i <= 4; i++) entries.push(ex('b' + m + i, m + '-0' + i, 1500, 'Prevoz', 'Bus'));    // tacno 1500 -> da
    for(let i = 1; i <= 5; i++) entries.push(ex('s' + m + i, m + '-0' + i, 100, 'Stanovanje', 'Voda'));// fiksna kat. -> ne
  });
  const res = C.smallFrequent(entries, '2026-05', 6, ['Stanovanje']);
  assert.deepEqual(res.map(g => g.key), ['bus', 'kafa']);
  const kafa = res.find(g => g.key === 'kafa');
  assert.deepEqual([kafa.count, kafa.perMonth, kafa.monthly, kafa.yearly], [8, 4, 1200, 14400]);
  assert.deepEqual(C.smallFrequent(entries.filter(e => e.date < '2026-04'), '2026-05', 6, []), []); // samo 1 mesec podataka
});
