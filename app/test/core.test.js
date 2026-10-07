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

test('splitFixedVariable i variableAverage', () => {
  const entries = [
    ex('rec-n1-2026-05', '2026-05-01', 1200, 'Zabava', 'Netflix'),
    ex('k1', '2026-05-03', 40000, 'Stanovanje', 'Kirija'),
    ex('m1', '2026-05-04', 8800, 'Hrana', 'Maxi'),
    ex('m2', '2026-05-05', 500, 'Hrana', 'Maxi', { paid: false }),
    ex('a1', '2026-03-04', 6000, 'Hrana', 'Maxi'), ex('a2', '2026-04-04', 10000, 'Hrana', 'Maxi'),
    ex('rec-n1-2026-04', '2026-04-01', 1200, 'Zabava', 'Netflix')
  ];
  assert.deepEqual(C.splitFixedVariable(entries, '2026-05', ['Stanovanje']), { fixed: 41200, variable: 8800, total: 50000, fixedPct: 82 });
  assert.deepEqual(C.splitFixedVariable([], '2026-05', []), { fixed: 0, variable: 0, total: 0, fixedPct: 0 });
  assert.equal(C.variableAverage(entries, '2026-05', 6, ['Stanovanje']), 8000); // (6000 + 10000) / 2
});

test('subscriptionsYearly: godisnji trosak i poskupljenje > 10% (bar 3 placanja)', () => {
  const recurring = [
    { id: 'n', desc: 'Netflix', amount: 1400, category: 'Zabava', type: 'expense', frequency: 'monthly' },
    { id: 'o', desc: 'Osiguranje', amount: 24000, category: 'Ostalo', type: 'expense', frequency: 'yearly' },
    { id: 's', desc: 'Spotify', amount: 600, category: 'Zabava', type: 'expense', frequency: 'monthly' },
    { id: 'p', desc: 'Plata', amount: 100000, category: 'Plata', type: 'income', frequency: 'monthly' }
  ];
  const entries = [
    ex('rec-n-2026-01', '2026-01-05', 1200, 'Zabava', 'Netflix'), ex('rec-n-2026-02', '2026-02-05', 1300, 'Zabava', 'Netflix'),
    ex('rec-n-2026-03', '2026-03-05', 1400, 'Zabava', 'Netflix'),                        // +16,7% -> poskupelo
    ex('rec-s-2026-01', '2026-01-05', 600, 'Zabava', 'Spotify'), ex('rec-s-2026-02', '2026-02-05', 660, 'Zabava', 'Spotify'),
    ex('rec-s-2026-03', '2026-03-05', 660, 'Zabava', 'Spotify'),                          // tacno +10% -> NE
    ex('rec-o-2025-01', '2025-01-05', 20000, 'Ostalo', 'Osiguranje'), ex('rec-o-2026-01', '2026-01-05', 24000, 'Ostalo', 'Osiguranje') // samo 2 -> NE
  ];
  const res = C.subscriptionsYearly(recurring, entries);
  assert.deepEqual(res.map(r => [r.id, r.yearly, r.creep, r.creepPct]), [
    ['o', 24000, false, null], ['n', 16800, true, 17], ['s', 7200, false, null]
  ]);
  assert.deepEqual([res[1].first, res[1].last], [1200, 1400]);
  assert.deepEqual(C.subscriptionsYearly([], entries), []);
});

test('whatIf: usteda i cilj N meseci ranije', () => {
  const today = new Date(2026, 8, 28); // 28.09.2026.
  const goals = [
    { id: 'g1', name: 'More', target: 130000, current: 10000, deadline: '2027-09-28' }, // 12 meseci, tempo 10.000
    { id: 'g2', name: 'Auto', target: 900000, current: 0, deadline: '2029-01-01' },
    { id: 'g3', name: 'Gotov', target: 5000, current: 5000, deadline: '2026-12-01' },
    { id: 'g4', name: 'Bez roka', target: 50000, current: 0, deadline: '' },
    { id: 'g5', name: 'Prosao', target: 50000, current: 0, deadline: '2026-01-01' }
  ];
  const r = C.whatIf(20000, 10, goals, today); // 2.000 mesecno
  assert.deepEqual([r.pct, r.monthly, r.yearly], [10, 2000, 24000]);
  assert.deepEqual(r.goal, { id: 'g1', name: 'More', monthsLeft: 12, newMonths: 10, sooner: 2 }); // 120000 / 12000 = 10
  assert.equal(C.whatIf(20000, 0, goals, today).goal, null);
  assert.equal(C.whatIf(20000, 80, [], today).pct, 50);     // klizac najvise 50%
  assert.equal(C.whatIf(20000, 10, goals.slice(2), today).goal, null); // samo gotov / bez roka / prosao
  assert.equal(C.whatIf(20000, 1, [goals[0]], today).goal, null); // 200/mes ne skracuje ni za ceo mesec -> null
  assert.equal(C.monthsUntil(today, '2026-10-01'), 1);
});

test('savingsSummary: isti rezultat za Pregled i Analizu', () => {
  const entries = [ex('v1', '2026-03-05', 3000, 'Prevoz', 'b'), ex('v2', '2026-04-05', 3000, 'Prevoz', 'b'), ex('v3', '2026-05-05', 5000, 'Prevoz', 'b')];
  const s = C.savingsSummary(entries, [], [], '2026-05', 6);
  assert.equal(s.enough, true);
  assert.deepEqual(s.above.map(r => r.cat), ['Prevoz']);
  assert.equal(s.aboveTotal, 2000);
  assert.deepEqual([s.small, s.smallMonthly, s.subscriptions], [[], 0, []]);
  assert.equal(s.breakdown.rows.length, 1);
});

// ---------- Nabavka ----------
test('parseShoppingInput: naziv, kolicina sa jedinicom, cena na kraju', () => {
  assert.deepEqual(C.parseShoppingInput('Mleko 2 kom 150'), { name: 'Mleko', qty: '2 kom', price: 150 });
  assert.deepEqual(C.parseShoppingInput('Jaja 10 kom'), { name: 'Jaja', qty: '10 kom', price: null });
  assert.deepEqual(C.parseShoppingInput('Hleb'), { name: 'Hleb', qty: '', price: null });
  assert.deepEqual(C.parseShoppingInput('Jaja 10'), { name: 'Jaja', qty: '', price: 10 });
  assert.deepEqual(C.parseShoppingInput('Jabuke 1,5 kg 200'), { name: 'Jabuke', qty: '1,5 kg', price: 200 });
  assert.deepEqual(C.parseShoppingInput('Sir  1.250'), { name: 'Sir', qty: '', price: 1250 });
  assert.deepEqual(C.parseShoppingInput('Mleko 2,8% 150'), { name: 'Mleko 2,8%', qty: '', price: 150 });
  assert.deepEqual(C.parseShoppingInput('Voda 6KOM'), { name: 'Voda', qty: '6 kom', price: null });
  assert.deepEqual(C.parseShoppingInput('150'), { name: '', qty: '', price: 150 });
  assert.deepEqual(C.parseShoppingInput('   '), { name: '', qty: '', price: null });
  assert.deepEqual(C.parseShoppingInput(undefined), { name: '', qty: '', price: null });
});

test('findShoppingItem: bez obzira na velika/mala slova i razmake', () => {
  const items = [{ id: 'a', name: 'Mleko 2,8%' }, { id: 'b', name: 'Hleb' }];
  assert.equal(C.findShoppingItem(items, '  mleko   2,8% ').id, 'a');
  assert.equal(C.findShoppingItem(items, 'HLEB').id, 'b');
  assert.equal(C.findShoppingItem(items, 'Jaja'), undefined);
  assert.equal(C.normShoppingName('  Mleko   X '), 'mleko x');
});

test('purchaseItemLabel i mostCommonStore', () => {
  assert.equal(C.purchaseItemLabel({ name: 'Mleko', qty: '2 kom' }), 'Mleko (2 kom)');
  assert.equal(C.purchaseItemLabel({ name: 'Hleb', qty: '' }), 'Hleb');
  assert.equal(C.mostCommonStore([{ store: 'Maxi' }, { store: 'Lidl' }, { store: 'Maxi' }, { store: '' }]), 'Maxi');
  assert.equal(C.mostCommonStore([{ store: 'Maxi' }, { store: 'Lidl' }]), 'Lidl'); // nereseno -> prva po abecedi
  assert.equal(C.mostCommonStore([{ store: '' }, {}]), '');
});

test('itemsToCell / cellToItems', () => {
  assert.equal(C.itemsToCell(['Mleko (2 kom)', 'Hleb']), 'Mleko (2 kom); Hleb');
  assert.equal(C.itemsToCell(undefined), '');
  assert.deepEqual(C.cellToItems('Mleko (2 kom); Hleb ;; '), ['Mleko (2 kom)', 'Hleb']);
  assert.deepEqual(C.cellToItems(''), []);
  assert.deepEqual(C.cellToItems(undefined), []);
  // zarez u kolicini/nazivu prezivljava put kroz Excel
  const withComma = [C.purchaseItemLabel({ name: 'Jabuke', qty: '1,5 kg' }), 'Mleko 2,8%'];
  assert.deepEqual(C.cellToItems(C.itemsToCell(withComma)), withComma);
});

test('normalizeShopping: podrazumevano, neispravni podaci, Ostalo uvek postoji', () => {
  let n = 0; const makeId = () => 'id' + (++n);
  const empty = C.normalizeShopping(null, makeId);
  assert.deepEqual(empty.items, []);
  assert.deepEqual(empty.sections, C.SHOPPING_SECTIONS);
  assert.equal(C.SHOPPING_SECTIONS[C.SHOPPING_SECTIONS.length - 1], 'Ostalo');
  assert.deepEqual(C.normalizeShopping('smece', makeId).items, []);
  const r = C.normalizeShopping({
    sections: ['Mlečni', 'Mlečni', '', 5, 'Pekara'],
    items: [
      { id: 'x', name: ' Mleko ', section: 'Mlečni', store: ' Maxi ', category: 'Hrana', price: '150', qty: 2, needed: 1, checked: 0 },
      { name: 'Hleb', section: 'Nepostojeci', price: -5 },
      { name: '   ' }, null, 'x',
      { id: 'y', name: 'mleko' } // duplikat naziva -> izbacuje se
    ]
  }, makeId);
  assert.deepEqual(r.sections, ['Mlečni', 'Pekara', 'Ostalo']);
  assert.equal(r.items.length, 2);
  assert.deepEqual(r.items[0], { id: 'x', name: 'Mleko', section: 'Mlečni', store: 'Maxi', category: 'Hrana', price: 150, qty: '2', needed: true, checked: false });
  assert.deepEqual(r.items[1], { id: 'id1', name: 'Hleb', section: 'Ostalo', store: '', category: '', price: null, qty: '', needed: false, checked: false });
});

test('groupShoppingItems: redosled delova, abecedno, grupe "Bez ..."', () => {
  const items = [
    { name: 'Sir', section: 'Mlečni', store: 'Maxi', category: 'Hrana' },
    { name: 'Hleb', section: 'Pekara', store: '', category: 'Hrana' },
    { name: 'Mleko', section: 'Mlečni', store: 'Lidl', category: 'Hrana' },
    { name: 'Šampon', section: 'Higijena', store: 'dm', category: 'Kozmetika' },
    { name: 'Baterije', section: 'Ostalo', store: 'Maxi', category: 'Obrisana' }
  ];
  const opts = { sections: ['Pekara', 'Mlečni', 'Higijena', 'Ostalo'], categories: ['Hrana', 'Kozmetika'] };
  const bySec = C.groupShoppingItems(items, 'section', opts);
  assert.deepEqual(bySec.map(g => g.label), ['Pekara', 'Mlečni', 'Higijena', 'Ostalo']);
  assert.deepEqual(bySec[1].items.map(i => i.name), ['Mleko', 'Sir']);
  const byStore = C.groupShoppingItems(items, 'store', opts);
  assert.deepEqual(byStore.map(g => [g.key, g.label]), [['dm', 'dm'], ['Lidl', 'Lidl'], ['Maxi', 'Maxi'], ['', 'Bez prodavnice']]);
  const byCat = C.groupShoppingItems(items, 'category', opts);
  assert.deepEqual(byCat.map(g => [g.key, g.label, g.items.length]), [['Hrana', 'Hrana', 3], ['Kozmetika', 'Kozmetika', 1], ['', 'Bez kategorije', 1]]);
  assert.deepEqual(C.groupShoppingItems([], 'section', opts), []);
});

test('shoppingEstimate: samo "treba", stavke bez cene, zbir po kategoriji', () => {
  const items = [
    { name: 'A', needed: true, price: 150, category: 'Hrana' },
    { name: 'B', needed: true, price: null, category: 'Hrana' },
    { name: 'C', needed: true, price: 400, category: 'Kozmetika' },
    { name: 'D', needed: false, price: 999, category: 'Hrana' }
  ];
  assert.deepEqual(C.shoppingEstimate(items), { count: 3, total: 550, unpriced: 1, byCategory: { Hrana: 150, Kozmetika: 400 } });
  assert.deepEqual(C.shoppingEstimate([]), { count: 0, total: 0, unpriced: 0, byCategory: {} });
});

test('splitPurchase: jedna kategorija, srazmerno, bez cene, zaokruzivanje', () => {
  const one = C.splitPurchase([{ name: 'A', category: 'Hrana', price: 100 }, { name: 'B', category: 'Hrana', price: null }], 1234);
  assert.deepEqual(one.map(r => [r.category, r.amount, r.items.length]), [['Hrana', 1234, 2]]);
  // Hrana 300+100 = 400, Kozmetika 200 -> 666,67 -> 667 / ostatak 333
  const prop = C.splitPurchase([
    { name: 'A', category: 'Hrana', price: 300 }, { name: 'B', category: 'Hrana', price: 100 }, { name: 'C', category: 'Kozmetika', price: 200 }
  ], 1000);
  assert.deepEqual(prop.map(r => [r.category, r.amount]), [['Hrana', 667], ['Kozmetika', 333]]);
  // bez cene -> prosek cena (300): 300 / 300
  const avg = C.splitPurchase([{ name: 'A', category: 'Hrana', price: 300 }, { name: 'B', category: 'Kozmetika', price: null }], 1000);
  assert.deepEqual(avg.map(r => [r.category, r.amount]), [['Hrana', 500], ['Kozmetika', 500]]);
  // nijedna cena -> po broju stavki: 3:1
  const cnt = C.splitPurchase([
    { name: 'A', category: 'Hrana' }, { name: 'B', category: 'Hrana' }, { name: 'C', category: 'Hrana' }, { name: 'D', category: 'Kozmetika' }
  ], 1000);
  assert.deepEqual(cnt.map(r => [r.category, r.amount]), [['Hrana', 750], ['Kozmetika', 250]]);
  // 100 na tri jednake -> 33, 33, 34 (zbir tacan); jednake tezine -> abecedno
  const three = C.splitPurchase([{ name: 'A', category: 'C' }, { name: 'B', category: 'A' }, { name: 'D', category: 'B' }], 100);
  assert.deepEqual(three.map(r => [r.category, r.amount]), [['A', 33], ['B', 33], ['C', 34]]);
  assert.equal(three.reduce((s, r) => s + r.amount, 0), 100);
  assert.deepEqual(C.splitPurchase([], 500), []);
  // nikad negativno: 2 RSD na 4 jednake kategorije -> 0, 0, 1, 1
  const tiny = C.splitPurchase([{ name: 'A', category: 'A' }, { name: 'B', category: 'B' }, { name: 'C', category: 'C' }, { name: 'D', category: 'D' }], 2);
  assert.deepEqual(tiny.map(r => r.amount), [0, 0, 1, 1]);
  for(let n = 2; n <= 6; n++) for(let tot = 1; tot <= 60; tot++){
    const rs = C.splitPurchase(Array.from({ length: n }, (_, k) => ({ name: 'x' + k, category: 'c' + k })), tot);
    assert.ok(rs.every(r => r.amount >= 0), `n=${n} tot=${tot}`);
    assert.equal(rs.reduce((s, r) => s + r.amount, 0), tot);
  }
  // decimale sa racuna idu na poslednji red, ostali su celi dinari
  const dec = C.splitPurchase([{ name: 'A', category: 'A' }, { name: 'B', category: 'B' }, { name: 'C', category: 'C' }], 1000.5);
  assert.deepEqual(dec.map(r => r.amount), [333, 333, 334.5]);
});

// ---------- Mesec i ponavljajuce ----------
test('monthTotals: prihodi, placeni rashodi, raspodela, zaokruzivanje na pare', () => {
  const entries = [
    { id: 'i', type: 'income', date: '2026-09-05', amount: 100000.1, category: 'Plata' },
    { id: 'a', type: 'expense', date: '2026-09-06', amount: 0.1, category: 'Hrana' },
    { id: 'b', type: 'expense', date: '2026-09-07', amount: 0.2, category: 'Hrana' },
    { id: 'c', type: 'expense', date: '2026-09-08', amount: 500, category: 'Prevoz', paid: false },
    { id: 'd', type: 'expense', date: '2026-08-10', amount: 3000, category: 'Stan', spreadMonths: 3, spreadStart: '2026-08' },
    { id: 't', type: 'transfer', date: '2026-09-09', amount: 999, fromAccount: 'x', toAccount: 'y' }
  ];
  const m = C.monthTotals(entries, '2026-09');
  assert.equal(m.income, 100000.1);
  assert.equal(m.expense, 1000.3);   // 0,1 + 0,2 + 1000 (deo raspodele), tacno na pare
  assert.equal(m.net, 98999.8);
  assert.deepEqual(m.byCat, { Hrana: 0.3, Stan: 1000 });
  assert.deepEqual(m.catEntries.map(x => x[0]), ['Stan', 'Hrana']);
  assert.deepEqual(C.monthTotals([], '2026-09'), { income: 0, expense: 0, net: 0, byCat: {}, catEntries: [] });
  assert.equal(C.round2(0.1 + 0.2), 0.3);
});

test('pendingRecurringItems: nije placeno, preskoceno ni upisano; prosli mesec prazan', () => {
  const recurring = [
    { id: 'k', desc: 'Kirija', amount: 18000, type: 'expense', frequency: 'monthly' },
    { id: 'n', desc: 'Netflix', amount: 1292, type: 'expense', frequency: 'monthly' },
    { id: 'p', desc: 'Porez', amount: 8000, type: 'expense', frequency: 'monthly' },
    { id: 'o', desc: 'Osiguranje', amount: 24000, type: 'expense', frequency: 'yearly', anchorMonth: 3 },
    { id: 's', desc: 'Plata', amount: 100000, type: 'income', frequency: 'monthly' }
  ];
  const entries = [{ id: 'rec-p-2026-10', type: 'expense', date: '2026-10-01', amount: 8000 }];
  const applied = { '2026-10': ['k'] }, skipped = { '2026-10': ['n'] };
  assert.deepEqual(C.pendingRecurringItems(recurring, entries, applied, skipped, '2026-10', '2026-09').map(r => r.id), ['s']);
  assert.deepEqual(C.pendingRecurringItems(recurring, entries, applied, skipped, '2026-11', '2026-09').map(r => r.id), ['k', 'n', 'p', 's']);
  assert.deepEqual(C.pendingRecurringItems(recurring, entries, applied, skipped, '2026-08', '2026-09'), []);
  assert.equal(C.isRecurringPaid(applied, { id: 'k' }, '2026-10'), true);
  assert.equal(C.isRecurringSkipped(skipped, { id: 'k' }, '2026-10'), false);
  assert.equal(C.recurringEntryId({ id: 'k' }, '2026-10'), 'rec-k-2026-10');
});

test('monthsToProcess: bez kljuca, propusteni meseci, prelaz godine, ogranicenje', () => {
  assert.deepEqual(C.monthsToProcess(null, '2026-09', 24), ['2026-09']);
  assert.deepEqual(C.monthsToProcess('smece', '2026-09', 24), ['2026-09']);
  assert.deepEqual(C.monthsToProcess('2026-09', '2026-09', 24), ['2026-09']);
  assert.deepEqual(C.monthsToProcess('2026-08', '2026-09', 24), ['2026-08', '2026-09']);
  assert.deepEqual(C.monthsToProcess('2026-11', '2027-02', 24), ['2026-11', '2026-12', '2027-01', '2027-02']);
  assert.deepEqual(C.monthsToProcess('2027-05', '2026-09', 24), ['2026-09']); // sat unazad
  const long = C.monthsToProcess('2020-01', '2026-09', 24);
  assert.equal(long.length, 24);
  assert.equal(long[0], '2024-10');
  assert.equal(long[23], '2026-09');
});

test('autoPayDue: samo autoPay, dospelo, nije placeno/preskoceno/iskljuceno, dan za tekuci mesec', () => {
  const recurring = [
    { id: 'a', autoPay: true, day: 5, frequency: 'monthly' },
    { id: 'b', autoPay: true, day: 20, frequency: 'monthly' },
    { id: 'c', autoPay: false, day: 1, frequency: 'monthly' },
    { id: 'd', autoPay: true, day: 1, frequency: 'monthly' },
    { id: 'e', autoPay: true, day: 1, frequency: 'monthly' },
    { id: 'f', autoPay: true, day: 1, frequency: 'monthly' },
    { id: 'g', autoPay: true, day: 1, frequency: 'quarterly', anchorMonth: 1 }
  ];
  const state = { applied: { '2026-08': ['d'] }, skipped: { '2026-08': ['e'] }, optOut: { '2026-08': ['f'] } };
  assert.deepEqual(C.autoPayDue(recurring, state, '2026-08', null).map(r => r.id), ['a', 'b']);   // prosli mesec: bez obzira na dan; avgust nije kvartal od januara
  assert.deepEqual(C.autoPayDue(recurring, state, '2026-10', 10).map(r => r.id), ['a', 'd', 'e', 'f', 'g']); // tekuci: dan <= 10
  assert.deepEqual(C.autoPayDue(recurring, state, '2026-10', 31).map(r => r.id), ['a', 'b', 'd', 'e', 'f', 'g']);
  assert.deepEqual(C.autoPayDue([], state, '2026-10', 31), []);
  assert.deepEqual(C.autoPayDue(recurring, undefined, '2026-08', null).map(r => r.id), ['a', 'b', 'd', 'e', 'f']);
});

test('checkWorkbookShape: listovi i kolone, prazan list Stavke prolazi', () => {
  const full = ['ID', 'Datum', 'Opis', 'Kategorija', 'Tip', 'Iznos', 'Placeno'];
  assert.deepEqual(C.checkWorkbookShape(['Stavke', 'Kategorije', 'Ciljevi'], full), { ok: true, missing: [] });
  assert.deepEqual(C.checkWorkbookShape(['Stavke', 'Kategorije'], []), { ok: true, missing: [] });   // izvoz bez ijedne stavke
  assert.deepEqual(C.checkWorkbookShape(['Sheet1'], ['Datum', 'Opis', 'Iznos']), { ok: false, missing: ['Stavke', 'Kategorije'] });
  assert.deepEqual(C.checkWorkbookShape(['Stavke', 'Kategorije'], ['Datum', 'Opis', 'Iznos']), { ok: false, missing: ['Stavke: Tip'] });
  assert.equal(C.checkWorkbookShape(undefined, undefined).ok, false);
});

test('checkDataFileShape: poznati kljucevi ispravnog tipa, JSON string ili vrednost', () => {
  assert.deepEqual(C.checkDataFileShape({ 'budzet-stavke-v2': [], 'budzet-limiti-v1': {} }), { ok: true, problems: [] });
  assert.deepEqual(C.checkDataFileShape({ 'budzet-stavke-v2': '[{"id":"a"}]', 'budzet-primenjeno-v1': '{}' }), { ok: true, problems: [] });
  assert.deepEqual(C.checkDataFileShape({ 'budzet-tema-v1': 'dark' }), { ok: true, problems: [] }); // bez stavki, ali nas fajl
  assert.deepEqual(C.checkDataFileShape({ 'budzet-stavke-v2': '{"x":1}' }), { ok: false, problems: ['budzet-stavke-v2'] });
  assert.deepEqual(C.checkDataFileShape({ 'budzet-stavke-v2': [], 'budzet-limiti-v1': [] }), { ok: false, problems: ['budzet-limiti-v1'] });
  assert.deepEqual(C.checkDataFileShape({ 'budzet-dugovi-v1': 'nije json' }), { ok: false, problems: ['budzet-dugovi-v1'] });
  assert.deepEqual(C.checkDataFileShape({ nesto: 1 }), { ok: false, problems: ['nema podataka Knjige budžeta'] });
  assert.equal(C.checkDataFileShape(null).ok, false);
  assert.equal(C.checkDataFileShape([]).ok, false);
});

// ---------- Placanje i podsetnici ----------
test('isDueInMonth: until zavrsava ponavljajucu stavku', () => {
  assert.equal(C.isDueInMonth({ frequency: 'monthly', until: '2026-10' }, '2026-10'), true);
  assert.equal(C.isDueInMonth({ frequency: 'monthly', until: '2026-10' }, '2026-11'), false);
  assert.equal(C.isDueInMonth({ frequency: 'monthly' }, '2030-01'), true);
  assert.equal(C.isDueInMonth({ frequency: 'yearly', anchorMonth: 3, until: '2026-12' }, '2027-03'), false);
});

test('overdueRecurring: samo rashodi, dan < danas, nije placeno ni preskoceno', () => {
  const recurring = [
    { id: 'k', type: 'expense', day: 1, frequency: 'monthly' },
    { id: 'd', type: 'expense', day: 29, frequency: 'monthly' },   // dospeva danas (29.) -> nije kasno
    { id: 'p', type: 'expense', day: 5, frequency: 'monthly' },    // placeno
    { id: 's', type: 'expense', day: 5, frequency: 'monthly' },    // preskoceno
    { id: 'i', type: 'income', day: 1, frequency: 'monthly' },     // prihod
    { id: 'q', type: 'expense', day: 1, frequency: 'quarterly', anchorMonth: 1 }, // septembar nije kvartal od januara
    { id: 'u', type: 'expense', day: 1, frequency: 'monthly', until: '2026-08' },
    { id: 'x', day: 2, frequency: 'monthly' }                      // bez type -> rashod
  ];
  const applied = { '2026-09': ['p'] }, skipped = { '2026-09': ['s'] };
  assert.deepEqual(C.overdueRecurring(recurring, applied, skipped, '2026-09', 29).map(r => r.id), ['k', 'x']);
  assert.deepEqual(C.overdueRecurring(recurring, applied, skipped, '2026-09', 1), []);
  assert.deepEqual(C.overdueRecurring([], applied, skipped, '2026-09', 29), []);
});

test('debtPaid: rucne uplate + placene rate tog duga', () => {
  const d = { id: 'd1', amount: 10000, paidAmount: 1500 };
  const entries = [
    { id: 'rec-r1-2026-08', type: 'expense', amount: 2000, debtId: 'd1' },
    { id: 'rec-r1-2026-09', type: 'expense', amount: 2000, debtId: 'd1', paid: false }, // neplaceno
    { id: 'z', type: 'expense', amount: 700, debtId: 'd2' },                              // drugi dug
    { id: 'w', type: 'expense', amount: 900 }
  ];
  assert.equal(C.debtPaid(d, entries), 3500);
  assert.equal(C.debtPaid({ id: 'd3', amount: 5 }, entries), 0);
  assert.equal(C.debtPaid({ id: 'd1', amount: 5, paidAmount: 0.1 }, [{ type: 'expense', amount: 0.2, debtId: 'd1' }]), 0.3);
});

// ---------- Kupljene stvari ----------
test('purchasedItemName / purchasedItemKey', () => {
  assert.equal(C.purchasedItemName('Mleko (2 kom)'), 'Mleko');
  assert.equal(C.purchasedItemName('  Hleb '), 'Hleb');
  assert.equal(C.purchasedItemName('Mleko 2,8% (1 l)'), 'Mleko 2,8%');
  assert.equal(C.purchasedItemName('Sok (narandža) (1 l)'), 'Sok (narandža)');
  assert.equal(C.purchasedItemName('Hleb (crni)'), 'Hleb (crni)');           // zagrada bez kolicine je deo naziva
  assert.equal(C.purchasedItemKey('Hleb (crni) (1 kom)'), C.purchasedItemKey('Hleb (crni)'));
  assert.equal(C.purchasedItemKey('MLEKO  (2 kom)'), 'mleko');
  assert.equal(C.purchasedItemKey(undefined), '');
});

test('purchasedItemStats: srazmerno cenama, bez cene = prosek, bez cena = samo broj', () => {
  const ex2 = (id, date, amount, category, items, itemPrices, extra = {}) => ({ id, type: 'expense', date, amount, category, desc: 'x', items, itemPrices, ...extra });
  const entries = [
    ex2('e1', '2026-09-05', 1000, 'Hrana', ['Mleko (2 kom)', 'Hleb'], [300, 100]),   // 750 / 250
    ex2('e2', '2026-09-12', 500, 'Hrana', ['mleko', 'Jaja'], [200, null]),           // 250 / 250
    ex2('e3', '2026-09-20', 800, 'Hrana', ['Hleb', 'Kafa'], undefined),               // samo broj
    ex2('e4', '2026-09-21', 999, 'Hrana', ['Mleko'], [100], { paid: false }),          // neplaceno
    ex2('e5', '2026-08-30', 120, 'Hrana', ['Mleko'], [100]),                           // drugi mesec
    ex2('e6', '2026-09-22', 400, 'Kozmetika', ['Sapun'], [400])
  ];
  const s = C.purchasedItemStats(entries, ['2026-09'], 'Hrana');
  assert.deepEqual(s.map(x => [x.name, x.count, x.amount, x.withAmount]), [
    ['Mleko', 2, 1000, 2], ['Hleb', 2, 250, 1], ['Jaja', 1, 250, 1], ['Kafa', 1, null, 0]
  ]);
  assert.deepEqual(C.purchasedItemStats(entries, ['2026-09']).map(x => x.name), ['Mleko', 'Sapun', 'Hleb', 'Jaja', 'Kafa']);
  const all = C.purchasedItemStats(entries).find(x => x.key === 'mleko');
  assert.deepEqual([all.count, all.amount, all.withAmount], [3, 1120, 3]);
  assert.deepEqual(C.purchasedItemStats([], ['2026-09']), []);
  // itemPrices pogresne duzine se ignorise (samo broj)
  assert.deepEqual(C.purchasedItemStats([ex2('b', '2026-09-01', 100, 'Hrana', ['A', 'B'], [10])]).map(x => x.amount), [null, null]);
});

test('restockSuggestions: medijan intervala, prag, needed, dismissed, najvise 5', () => {
  const buy = (id, date, items) => ({ id, type: 'expense', date, amount: 100, category: 'Hrana', desc: 'x', items });
  const entries = [
    buy('m1', '2026-09-01', ['Mleko (1 l)']), buy('m2', '2026-09-08', ['mleko']), buy('m3', '2026-09-15', ['Mleko']),
    buy('m4', '2026-09-22', ['Mleko', 'Jogurt']), buy('m5', '2026-09-22', ['Mleko']),     // isti dan se broji jednom; kupovina sa vise stvari se broji
    buy('h1', '2026-09-10', ['Hleb']), buy('h2', '2026-09-20', ['Hleb']), buy('h3', '2026-09-25', ['Hleb']),
    buy('j1', '2026-09-01', ['Jaja']), buy('j2', '2026-09-10', ['Jaja']),
    buy('k1', '2026-08-01', ['Kafa']), buy('k2', '2026-08-15', ['Kafa']), buy('k3', '2026-08-29', ['Kafa']),
    buy('s1', '2026-09-01', ['Sir']), buy('s2', '2026-09-08', ['Sir']), buy('s3', '2026-09-15', ['Sir']),
    buy('o1', '2026-09-01', ['Sok']), buy('o2', '2026-09-08', ['Sok']), buy('o3', '2026-09-15', ['Sok']),
    Object.assign(buy('x1', '2026-09-26', ['Mleko']), { paid: false })                        // neplaceno se ne broji
  ];
  const shopping = { items: [{ id: 'm', name: 'Mleko', needed: false }, { id: 's', name: 'Sir', needed: true }], dismissed: { sok: '2026-09-15' } };
  const r = C.restockSuggestions(entries, shopping, '2026-09-29');
  assert.deepEqual(r, [
    { name: 'Kafa', key: 'kafa', intervalDays: 14, daysSince: 31, itemId: null },
    { name: 'Mleko', key: 'mleko', intervalDays: 7, daysSince: 7, itemId: 'm' }
  ]);
  // sakriveno se vraca posle novije kupovine
  const r2 = C.restockSuggestions(entries.concat([buy('o4', '2026-09-20', ['Sok'])]), shopping, '2026-10-10');
  assert.ok(r2.some(x => x.key === 'sok'));
  // najvise 5
  const many = [];
  ['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach((n, i) => ['2026-08-01', '2026-08-08', '2026-08-15'].forEach((d, j) => many.push(buy(n + j, d, [n]))));
  assert.equal(C.restockSuggestions(many, { items: [] }, '2026-09-29').length, 5);
  assert.deepEqual(C.restockSuggestions([], null, '2026-09-29'), []);
});

test('normalizeShopping cuva dismissed (samo kljuc -> datum)', () => {
  const n = C.normalizeShopping({ items: [], dismissed: { mleko: '2026-09-22', los: 5, 'x': 'nije datum' } }, () => 'id');
  assert.deepEqual(n.dismissed, { mleko: '2026-09-22' });
  assert.deepEqual(C.normalizeShopping(null, () => 'id').dismissed, {});
});

// ---------- Paket 4: mesecna uplata u cilj, mesecni pregled ----------
test('goalPlanDue: meseci od since / last+1, tekuci tek posle dana, ostatak do cilja', () => {
  const g = { target: 100000, current: 10000, monthly: { amount: 5000, day: 15, since: '2026-07' } };
  assert.deepEqual(C.goalPlanDue(g, '2026-09', 14).map(x => [x.mKey, x.amount, x.day]), [['2026-07', 5000, 15], ['2026-08', 5000, 15]]);
  assert.deepEqual(C.goalPlanDue(g, '2026-09', 15).map(x => x.mKey), ['2026-07', '2026-08', '2026-09']);
  const withLast = { ...g, monthly: { ...g.monthly, last: '2026-08' } };
  assert.deepEqual(C.goalPlanDue(withLast, '2026-09', 20).map(x => x.mKey), ['2026-09']);
  assert.deepEqual(C.goalPlanDue(withLast, '2026-09', 10), []);
  // poslednja uplata = ostatak, pa nista
  const near = { target: 20000, current: 12000, monthly: { amount: 5000, day: 1, since: '2026-07' } };
  assert.deepEqual(C.goalPlanDue(near, '2026-09', 30).map(x => x.amount), [5000, 3000]);
  assert.deepEqual(C.goalPlanDue({ ...near, current: 20000 }, '2026-09', 30), []);
  // buduci since, bez plana, nevazeci iznos
  assert.deepEqual(C.goalPlanDue({ ...g, monthly: { ...g.monthly, since: '2026-10' } }, '2026-09', 30), []);
  assert.deepEqual(C.goalPlanDue({ target: 1, current: 0 }, '2026-09', 30), []);
  assert.deepEqual(C.goalPlanDue({ ...g, monthly: { ...g.monthly, amount: 0 } }, '2026-09', 30), []);
  // najvise 24 meseca unazad
  const old = { target: 1e9, current: 0, monthly: { amount: 100, day: 1, since: '2020-01' } };
  const due = C.goalPlanDue(old, '2026-09', 30);
  assert.equal(due.length, 24);
  assert.equal(due[0].mKey, '2024-10');
  // dan 31 u februaru -> 28
  const feb = { target: 1e6, current: 0, monthly: { amount: 100, day: 31, since: '2026-02' } };
  assert.deepEqual(C.goalPlanDue(feb, '2026-02', 28).map(x => x.day), [28]);
  assert.deepEqual(C.goalPlanDue(feb, '2026-02', 27), []);
});

test('planAmount: zaokruzeno na 100, najmanje 100', () => {
  assert.equal(C.planAmount(2349), 2300);
  assert.equal(C.planAmount(2350), 2400);
  assert.equal(C.planAmount(30), 100);
  assert.equal(C.planAmount(0), 0);
  assert.equal(C.planAmount(-5), 0);
});

test('monthReviewMonth: prvih 10 dana, prethodni mesec, osim ako je zatvoren', () => {
  assert.equal(C.monthReviewMonth('2026-10-01', null), '2026-09');
  assert.equal(C.monthReviewMonth('2026-10-10', ''), '2026-09');
  assert.equal(C.monthReviewMonth('2026-10-11', null), null);
  assert.equal(C.monthReviewMonth('2026-10-03', '2026-09'), null);
  assert.equal(C.monthReviewMonth('2026-10-03', '2026-08'), '2026-09');
  assert.equal(C.monthReviewMonth('2027-01-05', null), '2026-12');
});

test('monthReview: zbirovi, stopa, iznad proseka, pad, limiti, neplaceno', () => {
  const inc = (id, date, amount) => ({ id, type: 'income', date, amount, category: 'Plata', desc: 'Plata' });
  const entries = [];
  ['2026-06', '2026-07', '2026-08'].forEach((m, i) => {
    entries.push(inc('i' + i, m + '-01', 100000));
    entries.push(ex('h' + i, m + '-05', 20000, 'Hrana', 'Market'));
    entries.push(ex('z' + i, m + '-06', 10000, 'Zabava', 'Bioskop'));
  });
  entries.push(inc('i9', '2026-09-01', 100000));
  entries.push(ex('h9', '2026-09-05', 30000, 'Hrana', 'Market'));      // +10.000 (50%) -> iznad proseka
  entries.push(ex('z9', '2026-09-06', 2000, 'Zabava', 'Bioskop'));      // -8.000 -> najveci pad
  entries.push(ex('u9', '2026-09-20', 5000, 'Racuni', 'Struja', { paid: false }));
  const recurring = [
    { id: 'r1', type: 'expense', desc: 'Internet', amount: 2500, category: 'Racuni', day: 10 },
    { id: 'r2', type: 'expense', desc: 'Teretana', amount: 3000, category: 'Zabava', day: 12 },
    { id: 'r3', type: 'expense', desc: 'Kirija', amount: 30000, category: 'Stan', day: 1 },
    { id: 'r4', type: 'income', desc: 'Honorar', amount: 9000, category: 'Plata', day: 1 },
    { id: 'r5', type: 'expense', desc: 'Novo', amount: 700, category: 'Racuni', day: 1 } // nikad placena ranije -> verovatno dodata kasnije
  ];
  const state = { recurring, applied: { '2026-08': ['r1', 'r3', 'r4'], '2026-09': ['r3'], '2026-10': ['r5'] }, skipped: { '2026-09': ['r2'] }, limits: { Hrana: 25000, Zabava: 5000, Stan: 0 } };
  const r = C.monthReview(entries, state, '2026-09', 6);
  assert.deepEqual([r.month, r.income, r.expense, r.net, r.savingsRate], ['2026-09', 100000, 32000, 68000, 68]);
  assert.equal(r.enough, true);
  assert.equal(r.avgExpense, 30000);
  assert.equal(r.expensePct, 7);
  assert.deepEqual(r.up.map(x => [x.cat, x.diff]), [['Hrana', 10000]]);
  assert.deepEqual(r.down && [r.down.cat, r.down.diff], ['Zabava', -8000]);
  assert.deepEqual(r.overBudget, [{ cat: 'Hrana', spent: 30000, limit: 25000 }]);
  assert.deepEqual(r.unpaidEntries.map(e => e.id), ['u9']);
  assert.deepEqual(r.unpaidRecurring.map(x => x.id), ['r1']); // r2 preskocen, r3 placen, r4 prihod
  assert.equal(r.unpaidTotal, 7500);
  // bez prihoda -> stopa null; malo podataka -> nema poredjenja
  const lone = C.monthReview([ex('a', '2026-09-02', 1000, 'Hrana', 'x')], {}, '2026-09', 6);
  assert.deepEqual([lone.savingsRate, lone.enough, lone.avgExpense, lone.expensePct, lone.down], [null, false, null, null, null]);
  assert.deepEqual(lone.up, []);
});

// ---------- Paket 6: uvoz istorije ----------
test('findNearDuplicates: isti iznos i tip, datum +-3 dana, drugaciji opis; svaki postojeci jednom', () => {
  const existing = [
    { id: 'e1', type: 'expense', date: '2026-03-05', amount: 30000, desc: 'Kirija' },
    { id: 'e2', type: 'expense', date: '2026-03-10', amount: 1200, desc: 'Netflix' },
    { id: 'e3', type: 'income', date: '2026-03-01', amount: 100000, desc: 'Plata' }
  ];
  const rows = [
    { type: 'expense', date: '2026-03-06', amount: 30000, desc: 'TRAJNI NALOG 123' },   // ~ e1
    { type: 'expense', date: '2026-03-07', amount: 30000, desc: 'TRAJNI NALOG 124' },   // e1 vec uparen -> cist
    { type: 'expense', date: '2026-03-14', amount: 1200, desc: 'NETFLIX.COM' },        // 4 dana -> cist
    { type: 'expense', date: '2026-03-01', amount: 100000, desc: 'x' },                // drugi tip -> cist
    { type: 'income', date: '2026-02-27', amount: 100000.4, desc: 'ZARADA' }           // ~ e3 (preko meseca, iznos zaokruzen)
  ];
  const r = C.findNearDuplicates(rows, existing, 3);
  assert.deepEqual(r.near.map(n => [n.row.desc, n.match.id]), [['TRAJNI NALOG 123', 'e1'], ['ZARADA', 'e3']]);
  assert.deepEqual(r.clean.map(x => x.desc), ['TRAJNI NALOG 124', 'NETFLIX.COM', 'x']);
  assert.deepEqual(C.findNearDuplicates([], existing).near, []);
});

test('monthCoverage: po mesecu broj, prihodi, rashodi', () => {
  const rows = [
    { type: 'expense', date: '2026-02-03', amount: 100 }, { type: 'income', date: '2026-02-01', amount: 1000 },
    { type: 'expense', date: '2025-12-31', amount: 50.25 }, { type: 'expense', date: '2026-02-20', amount: 0.75 }
  ];
  assert.deepEqual(C.monthCoverage(rows), [
    { month: '2025-12', count: 1, income: 0, expense: 50.25 },
    { month: '2026-02', count: 3, income: 1000, expense: 100.75 }
  ]);
});

test('mergeImportBatches: preklopljeni izvodi ne dupliraju, ponavljanje u jednom fajlu ostaje', () => {
  const kafa = { type: 'expense', date: '2026-03-31', amount: 200, desc: 'Kafa' };
  const a = [kafa, { ...kafa }, { type: 'expense', date: '2026-03-02', amount: 50, desc: 'x' }];
  const b = [{ ...kafa }, { type: 'expense', date: '2026-04-01', amount: 70, desc: 'y' }];
  const m = C.mergeImportBatches([a, b]);
  assert.equal(m.filter(r => r.desc === 'Kafa').length, 2);
  assert.deepEqual(m.map(r => r.desc).sort(), ['Kafa', 'Kafa', 'x', 'y']);
  assert.deepEqual(C.mergeImportBatches([]), []);
});

// ---------- IPS QR ----------
test('racun primaoca: skraceni zapis, 18 cifara, kontrolni broj', () => {
  assert.equal(C.normalizeAccount('845-4048-49'), '845000000000404849');
  assert.equal(C.normalizeAccount('845000000040484987'), '845000000040484987');
  assert.equal(C.normalizeAccount('845 0000000404849 87'), '845000000040484987');
  assert.equal(C.normalizeAccount('12345'), '');
  assert.equal(C.normalizeAccount('abc-1-22'), '');
  assert.equal(C.validAccount('845000000040484987'), true);   // primer iz NBS dokumentacije
  assert.equal(C.validAccount('845000000040484988'), false);
  assert.equal(C.formatAccount('845000000040484987'), '845-0000000404849-87');
});
test('poziv na broj model 97', () => {
  assert.equal(C.validReference97('163220000111111111000'), true); // NBS primer
  assert.equal(C.validReference97('163220000111111111001'), false);
  assert.equal(C.validReference97('16-3220000-111111111000'), true);
  assert.equal(C.validReference97(''), false);
});
test('ipsQrString: NBS primer se dobija tacno', () => {
  const s = C.ipsQrString({ account: '845-0000000404849-87', name: 'JP EPS BEOGRAD', amount: 3596.13, code: '189', purpose: 'Uplata po racunu', model: '97', reference: '163220000111111111000' });
  assert.equal(s, 'K:PR|V:01|C:1|R:845000000040484987|N:JP EPS BEOGRAD|I:RSD3596,13|SF:189|S:Uplata po racunu|RO:97163220000111111111000');
  // bez svrhe i poziva; uspravna crta iz teksta se uklanja; iznos uvek sa dve decimale
  assert.equal(C.ipsQrString({ account: '845000000040484987', name: 'A|B', amount: 1500.5 }), 'K:PR|V:01|C:1|R:845000000040484987|N:A B|I:RSD1500,50|SF:189');
  assert.equal(C.ipsQrString({ account: '845000000040484987', name: 'A', amount: 10, reference: '123' }).endsWith('|RO:00123'), true);
});
test('parseIpsQr i ipsProblems', () => {
  const p = C.parseIpsQr('K:PR|V:01|C:1|R:845000000040484987|N:JP EPS BEOGRAD\nBalkanska 13|I:RSD3596,13|SF:189|S:Uplata po racunu|RO:97163220000111111111000');
  assert.deepEqual(p, { account: '845000000040484987', name: 'JP EPS BEOGRAD, Balkanska 13', amount: 3596.13, currency: 'RSD', code: '189', purpose: 'Uplata po racunu', model: '97', reference: '163220000111111111000' });
  assert.equal(C.parseIpsQr('K:PT|V:01|R:1'), null);
  assert.equal(C.parseIpsQr('nesto drugo'), null);
  assert.deepEqual(C.ipsProblems(p), []);
  assert.equal(C.ipsProblems({ ...p, account: '845000000040484988' }).length, 1);
  assert.equal(C.ipsProblems({ ...p, code: '389', amount: 0, name: '' }).length, 3);
  assert.equal(C.ipsProblems({ ...p, reference: '163220000111111111001' }).length, 1);
});

test('ipsQrString: cirilica u latinicu, nedozvoljeni znakovi se menjaju', () => {
  const s = C.ipsQrString({ account: '845000000040484987', name: 'Инфостан Београд — Љубе Ђ.', amount: 1, purpose: 'Račun é№€ za struju' });
  assert.equal(s, 'K:PR|V:01|C:1|R:845000000040484987|N:Infostan Beograd - Ljube Đ.|I:RSD1,00|SF:189|S:Račun e za struju');
});

test('kucni racuni: podrazumevane vrste i ciscenje', () => {
  let n = 0; const id = () => 'id' + (++n);
  const types = C.defaultBillTypes('L1', 'Stanovanje', id);
  assert.deepEqual(types.map(t => t.name), ['Struja', 'Plin', 'Voda', 'Internet']);
  assert.deepEqual(types[0].metrics, [{ key: 'm1', name: 'Skupa', unit: 'kWh' }, { key: 'm2', name: 'Jeftina', unit: 'kWh' }]);
  assert.deepEqual(types[1].metrics, [{ key: 'm1', name: 'Potrošnja', unit: 'm³' }]);
  assert.deepEqual(types[3].metrics, []);
  assert.ok(types.every(t => t.locationId === 'L1' && t.category === 'Stanovanje' && t.id));

  const locs = C.cleanLocations([{ id: 'L1', name: ' Stan ', currency: 'RSD' }, { id: 'L2', name: 'Drvar', currency: 'XYZ' }, { name: '' }, null], ['RSD', 'BAM']);
  assert.deepEqual(locs, [{ id: 'L1', name: 'Stan', currency: 'RSD' }, { id: 'L2', name: 'Drvar', currency: 'RSD' }]);

  const bt = C.cleanBillTypes([{ id: 'T1', locationId: 'L1', name: 'Struja', category: 'Stanovanje', metrics: [{ key: 'm1', name: 'Skupa', unit: 'kWh' }, { key: '', name: 'x' }] }, { id: 'T2', locationId: 'NEMA', name: 'Plin' }], ['L1']);
  assert.equal(bt.length, 1);
  assert.deepEqual(bt[0].metrics, [{ key: 'm1', name: 'Skupa', unit: 'kWh' }]);

  const bills = C.cleanBills([
    { id: 'B1', billTypeId: 'T1', month: '2025-01', amount: '4456.16', currency: 'RSD', values: { m1: 215, m2: 'x' }, file: 'a.pdf', source: 'ai', entryId: 'e1' },
    { id: 'B2', billTypeId: 'T9', month: '2025-01', amount: 1 },
    { id: 'B3', billTypeId: 'T1', month: '2025-13', amount: 1 }
  ], ['T1']);
  assert.equal(bills.length, 1);
  assert.equal(bills[0].amount, 4456.16);
  assert.deepEqual(bills[0].values, { m1: 215 });
  assert.equal(bills[0].file, 'a.pdf');
  assert.equal(C.foldText('Čćžšđ Struja'), 'cczsdj struja');
});

test('kucni racuni: provera oblika fajla kopije pozna nove kljuceve', () => {
  assert.equal(C.checkDataFileShape({ 'budzet-stavke-v2': [], 'budzet-kucni-racuni-v1': [] }).ok, true);
  assert.deepEqual(C.checkDataFileShape({ 'budzet-stavke-v2': [], 'budzet-lokacije-v1': {} }).problems, ['budzet-lokacije-v1']);
});

const BILL_CTX = {
  locations: [{ id: 'L1', name: 'Stan', currency: 'RSD' }, { id: 'L2', name: 'Drvar', currency: 'BAM' }],
  billTypes: [
    { id: 'T1', locationId: 'L1', name: 'Struja', category: 'Stanovanje', metrics: [{ key: 'm1', name: 'Skupa', unit: 'kWh' }, { key: 'm2', name: 'Jeftina', unit: 'kWh' }] },
    { id: 'T2', locationId: 'L2', name: 'Struja', category: 'Stanovanje', metrics: [{ key: 'm1', name: 'Skupa', unit: 'kWh' }] }
  ],
  currencies: ['RSD', 'BAM', 'EUR']
};

test('billsPrompt: spisak lokacija, vrsta i merenja sa id-jevima', () => {
  const p = C.billsPrompt(BILL_CTX.locations, BILL_CTX.billTypes);
  assert.match(p, /"Stan" \(id: L1, valuta RSD\)/);
  assert.match(p, /Struja \(id: T1; merenja: m1 = Skupa \[kWh\], m2 = Jeftina \[kWh\]\)/);
  assert.match(p, /"confidence"/);
});

test('cleanBillReading: JSON u bloku, zarez, nepoznat id, mesec iz perioda, low', () => {
  const raw = 'Evo:\n```json\n{"locationId":"L1","billTypeId":"T1","month":"","periodFrom":"01.01.2025","periodTo":"2025-01-31","amount":"4.456,16","currency":"rsd","dueDate":"2025-02-15","values":{"m1":"215","m2":154,"m9":3},"payee":{"name":"EPS","account":"160-5100000000001-11","reference":"123"},"confidence":{"amount":"high","m2":"low"}}\n```';
  const r = C.cleanBillReading(raw, BILL_CTX);
  assert.equal(r.billTypeId, 'T1');
  assert.equal(r.month, '2025-01');
  assert.equal(r.periodFrom, '2025-01-01');
  assert.equal(r.amount, 4456.16);
  assert.equal(r.currency, 'RSD');
  assert.deepEqual(r.values, { m1: 215, m2: 154 });
  assert.deepEqual(r.low, ['m2']);
  assert.equal(r.payee.name, 'EPS');

  const bad = C.cleanBillReading({ locationId: 'L1', billTypeId: 'T2', amount: null, currency: 'XYZ' }, BILL_CTX);
  assert.equal(bad.billTypeId, '');            // T2 je u drugoj lokaciji
  assert.equal(bad.currency, 'RSD');           // valuta lokacije
  assert.deepEqual(bad.low.sort(), ['amount', 'billTypeId', 'month']);

  const byType = C.cleanBillReading({ billTypeId: 'T2', month: '2025-03', amount: 9.99 }, BILL_CTX);
  assert.equal(byType.locationId, 'L2');       // lokacija iz vrste
  assert.equal(byType.currency, 'BAM');
  assert.equal(C.cleanBillReading('nema json-a', BILL_CTX), null);
});

test('mergeBillQr: QR ima prednost za iznos i primaoca, razlika -> low', () => {
  const r = C.cleanBillReading({ locationId: 'L1', billTypeId: 'T1', month: '2025-01', amount: 4400 }, BILL_CTX);
  const qr = { account: '160000000000000111', name: 'JP EPS', amount: 4456.16, currency: 'RSD', code: '189', purpose: 'Struja', model: '97', reference: '1234' };
  const m = C.mergeBillQr(r, qr, BILL_CTX);
  assert.equal(m.amount, 4456.16);
  assert.ok(m.low.includes('amount'));
  assert.equal(m.payee.account, '160000000000000111');
  assert.equal(m.payee.code, '189');
  const onlyQr = C.mergeBillQr(null, qr, BILL_CTX);
  assert.equal(onlyQr.amount, 4456.16);
  assert.equal(onlyQr.billTypeId, '');
  assert.equal(C.mergeBillQr(r, null, BILL_CTX).amount, 4400);
});

test('findBillDuplicate i findRecurringForBill', () => {
  const bills = [{ id: 'B1', billTypeId: 'T1', month: '2025-01' }];
  assert.equal(C.findBillDuplicate(bills, 'T1', '2025-01').id, 'B1');
  assert.equal(C.findBillDuplicate(bills, 'T1', '2025-01', 'B1'), null);
  assert.equal(C.findBillDuplicate(bills, 'T1', '2025-02'), null);

  const type = { id: 'T1', name: 'Struja', category: 'Stanovanje' };
  const recurring = [
    { id: 'r1', desc: 'Internet', category: 'Stanovanje', type: 'expense', day: 10 },
    { id: 'r2', desc: 'EPS – STRUJA', category: 'Stanovanje', type: 'expense', day: 15 },
    { id: 'r3', desc: 'Struja plata', category: 'Stanovanje', type: 'income', day: 1 }
  ];
  const st = { applied: {}, skipped: {}, entries: [] };
  assert.equal(C.findRecurringForBill(recurring, type, '2025-01', st).id, 'r2');
  assert.equal(C.findRecurringForBill(recurring, type, '2025-01', { ...st, applied: { '2025-01': ['r2'] } }), null);
  assert.equal(C.findRecurringForBill(recurring, type, '2025-01', { ...st, entries: [{ id: 'rec-r2-2025-01' }] }), null);
  assert.equal(C.findRecurringForBill(recurring, { ...type, category: 'Drugo' }, '2025-01', st), null);
});

test('billsTable: dve lokacije, merenja, zbirovi, "fali"', () => {
  const locations = [{ id: 'L1', name: 'Stan', currency: 'RSD' }, { id: 'L2', name: 'Drvar', currency: 'BAM' }];
  const billTypes = [
    { id: 'T1', locationId: 'L1', name: 'Struja', metrics: [{ key: 'm1', name: 'Skupa', unit: 'kWh' }, { key: 'm2', name: 'Jeftina', unit: 'kWh' }] },
    { id: 'T2', locationId: 'L1', name: 'Plin', metrics: [{ key: 'm1', name: 'Potrošnja', unit: 'm³' }] },
    { id: 'T3', locationId: 'L1', name: 'Internet', metrics: [] },
    { id: 'T4', locationId: 'L2', name: 'Struja', metrics: [{ key: 'm1', name: 'Skupa', unit: 'kWh' }] }
  ];
  const bills = [
    { id: 'a', billTypeId: 'T1', month: '2025-01', amount: 4456.16, values: { m1: 215, m2: 154 } },
    { id: 'b', billTypeId: 'T1', month: '2025-03', amount: 3110.39, values: { m1: 134 } },
    { id: 'c', billTypeId: 'T2', month: '2025-01', amount: 100, values: { m1: 352 } },
    { id: 'c2', billTypeId: 'T2', month: '2025-01', amount: 50, values: { m1: 8 } },
    { id: 'd', billTypeId: 'T4', month: '2025-01', amount: 9.99, values: { m1: 0 } },
    { id: 'x', billTypeId: 'T1', month: '2024-12', amount: 1, values: {} }
  ];
  const tb = C.billsTable(bills, billTypes, locations, 2025, '2025-04');
  const stan = tb.locations[0];
  assert.equal(stan.rows.length, 3);
  assert.equal(stan.rows[0].cells[0], 4456.16);
  assert.equal(stan.rows[0].cells[1], null);
  assert.deepEqual(stan.rows[0].missing.slice(0, 4), [false, true, false, false]); // feb fali, apr je tekuci
  assert.equal(stan.rows[2].missing.some(Boolean), false);                         // Internet nema racuna te godine
  assert.equal(stan.rows[1].cells[0], 150);
  assert.deepEqual(stan.rows[1].billIds[0], ['c', 'c2']);
  assert.equal(stan.rows[0].total, 7566.55);
  assert.equal(stan.total, 7716.55);
  assert.deepEqual(stan.metricRows.map(m => m.label), ['Struja – Skupa', 'Struja – Jeftina', 'Plin']);
  assert.equal(stan.metricRows[0].total, 349);
  assert.equal(stan.metricRows[2].cells[0], 360);
  assert.equal(tb.locations[1].metricRows[0].cells[0], 0);
  assert.equal(tb.locations[1].currency, 'BAM');
  const past = C.billsTable(bills, billTypes, locations, 2025, '2026-02');
  assert.equal(past.locations[0].rows[0].missing[11], true);                        // prosla godina: svi meseci
});

const SHEET = [
  ['Računi 2025'],
  ['Mesec', '', '01. Januar', '02. Februar', '03. Mart', '2025'],
  ['Kategorija', 'Račun', 'Iznos', 'Iznos', 'Iznos', 'Iznos'],
  ['Kućni računi', 'Struja', '4456.16', '4434.72', 3110.39, 11999],
  ['', 'Plin', 21130.49, '', 12837.28, 1],
  ['', 'Internet', 2800, 2800, 2800, 8400],
  ['', '', '', '', '', 227294],
  ['Kućni računi (Drvar)', 'Struja', 9.99, 9.99, 8.2, 28],
  ['Kućni računi (potrošnja)', 'Struja - skupa', 215, 194, 134, 543],
  ['', 'Struja - jeftina', 154, 173, 104, 431],
  ['', 'Plin', 352, 295, 213, 860],
  ['Kućni računi (Drvar / potrošnja)', 'Struja - skupa', 0, 0, 38, 38]
];

test('parseBillsSheet: blokovi, lokacije, potrosnja, godina', () => {
  const p = C.parseBillsSheet(SHEET);
  assert.equal(p.year, 2025);
  assert.deepEqual(p.blocks.map(b => [b.location, b.consumption, b.rows.length]), [['', false, 3], ['Drvar', false, 1], ['', true, 3], ['Drvar', true, 1]]);
  assert.deepEqual(p.blocks[0].rows[1].values.slice(0, 3), [21130.49, null, 12837.28]);
  assert.equal(p.blocks[0].rows[0].values[0], 4456.16);
  assert.equal(p.blocks[0].rows[0].values.length, 12);
  assert.equal(C.parseBillsSheet([['nesto'], ['a', 'b']]), null);
});

test('billsFromSheet: spaja iznos i potrosnju, nove lokacije i vrste, duplikati', () => {
  let n = 0; const newId = () => 'n' + (++n);
  const ctx = {
    locations: [{ id: 'L1', name: 'Stan', currency: 'RSD' }],
    billTypes: C.defaultBillTypes('L1', 'Stanovanje', () => 'T' + (++n)),
    bills: [], primaryLocationId: 'L1', category: 'Stanovanje', newId, newLocationCurrency: { Drvar: 'BAM' }
  };
  ctx.bills = [{ id: 'old', billTypeId: ctx.billTypes[2].id, month: '2025-01' }]; // Voda jan vec postoji — ne smeta
  const r = C.billsFromSheet(C.parseBillsSheet(SHEET), ctx);
  assert.deepEqual(r.newLocations.map(l => [l.name, l.currency]), [['Drvar', 'BAM']]);
  assert.deepEqual(r.newTypes.map(t => t.name), ['Struja']);                  // Drvar Struja
  assert.deepEqual(r.newTypes[0].metrics.map(m => m.name), ['Skupa']);
  const stanStruja = ctx.billTypes[0].id;
  const jan = r.bills.find(b => b.billTypeId === stanStruja && b.month === '2025-01');
  assert.equal(jan.amount, 4456.16);
  assert.deepEqual(jan.values, { m1: 215, m2: 154 });
  assert.equal(jan.source, 'excel');
  const plinFeb = r.bills.find(b => b.billTypeId === ctx.billTypes[1].id && b.month === '2025-02');
  assert.equal(plinFeb.amount, 0);                                             // samo potrosnja
  assert.deepEqual(plinFeb.values, { m1: 295 });
  const drvar = r.bills.filter(b => b.billTypeId === r.newTypes[0].id);
  assert.equal(drvar.find(b => b.month === '2025-03').values.m1, 38);
  assert.equal(drvar[0].currency, 'BAM');
  const again = C.billsFromSheet(C.parseBillsSheet(SHEET), { ...ctx, bills: r.bills, locations: ctx.locations.concat(r.newLocations), billTypes: ctx.billTypes.concat(r.newTypes) });
  assert.equal(again.bills.length, 0);
  assert.equal(again.duplicates, r.bills.length);
});

test('nextMetricKey: ne ponavlja kljuc koji jos postoji u racunima (obrisano merenje)', () => {
  const type = { id: 'T1', metrics: [{ key: 'm1', name: 'Skupa', unit: 'kWh' }] };
  const bills = [{ billTypeId: 'T1', values: { m1: 1, m2: 154 } }, { billTypeId: 'T9', values: { m7: 1 } }];
  assert.equal(C.nextMetricKey(type, bills), 'm3');
  assert.equal(C.nextMetricKey({ id: 'T2', metrics: [] }, []), 'm1');
  // uvoz tabele: novo merenje ne sme da preuzme kljuc obrisanog merenja
  let n = 0; const newId = () => 'x' + (++n);
  const t1 = { id: 'T1', locationId: 'L1', name: 'Struja', category: 'Stanovanje', metrics: [{ key: 'm1', name: 'Skupa', unit: 'kWh' }] };
  const r = C.billsFromSheet({ year: 2025, blocks: [{ location: '', consumption: true, rows: [{ label: 'Struja - Noćna', values: [5, null, null, null, null, null, null, null, null, null, null, null] }] }] },
    { locations: [{ id: 'L1', name: 'Stan', currency: 'RSD' }], billTypes: [t1], bills, primaryLocationId: 'L1', category: 'Stanovanje', newId });
  assert.equal(r.changedTypes[0].metrics[1].key, 'm3');
});

test('kucni racuni: id-jevi i kljucevi merenja su bezbedni za HTML atribute', () => {
  const evil = '"><img src=x onerror=alert(1)>';
  assert.deepEqual(C.cleanLocations([{ id: evil, name: 'X', currency: 'RSD' }, { id: 'ok_1-a', name: 'Y', currency: 'RSD' }], ['RSD']).map(l => l.id), ['ok_1-a']);
  const bt = C.cleanBillTypes([{ id: 'T1', locationId: 'L1', name: 'S', metrics: [{ key: evil, name: 'a' }, { key: 'm2', name: 'b' }] }, { id: evil, locationId: 'L1', name: 'Z' }], ['L1']);
  assert.deepEqual(bt.map(x => x.id), ['T1']);
  assert.deepEqual(bt[0].metrics.map(m => m.key), ['m2']);
  const b = C.cleanBills([{ id: evil, billTypeId: 'T1', month: '2025-01' }, { id: 'B1', billTypeId: 'T1', month: '2025-01', entryId: evil, recurringId: 'r1', values: { [evil]: 1, m1: 2 } }], ['T1']);
  assert.deepEqual(b.map(x => x.id), ['B1']);
  assert.equal(b[0].entryId, undefined);
  assert.deepEqual(b[0].values, { m1: 2 });
  assert.equal(C.cleanBills([{ id: 'B2', billTypeId: 'T1', month: '2025-01', file: '..\\podaci.json' }], ['T1'])[0].file, undefined);
});

test('compactBillText: razmaci, prazni redovi, redovi bez slova, ogranicenje', () => {
  const raw = 'ЕПС   АД   Београд \n\n\n11000   Београд\n1500\n1250\n0   `   `   ` \nУтрошено   у   вишој   тарифи   136   kWh\n';
  assert.equal(C.compactBillText(raw, 1000), 'ЕПС АД Београд\n11000 Београд\nУтрошено у вишој тарифи 136 kWh');
  assert.equal(C.compactBillText('a'.repeat(50) + '\n' + 'b'.repeat(50), 60).length <= 60, true);
  assert.equal(C.compactBillText('', 100), '');
});

test('billsTable: "fali" tek posle prvog racuna te vrste; red bez podataka nema zbir', () => {
  const locations = [{ id: 'L1', name: 'Stan', currency: 'RSD' }];
  const billTypes = [{ id: 'T1', locationId: 'L1', name: 'Struja', metrics: [{ key: 'm1', name: 'Skupa', unit: 'kWh' }] }, { id: 'T2', locationId: 'L1', name: 'Plin', metrics: [{ key: 'm1', name: 'P', unit: 'm³' }] }];
  const bills = [{ id: 'a', billTypeId: 'T1', month: '2026-08', amount: 12181.14, values: { m1: 136 } }];
  const tb = C.billsTable(bills, billTypes, locations, 2026, '2026-11');
  const r = tb.locations[0].rows[0];
  assert.deepEqual(r.missing, [false, false, false, false, false, false, false, false, true, true, false, false]); // sep i okt (posle avg, pre nov)
  assert.equal(tb.locations[0].rows[1].total, null);
  assert.equal(tb.locations[0].metricRows[1].total, null);
  assert.equal(r.total, 12181.14);
  // prethodna godina: pre prvog racuna nista ne fali
  const prev = C.billsTable(bills, billTypes, locations, 2025, '2026-11');
  assert.equal(prev.locations[0].rows[0].missing.some(Boolean), false);
});

test('expenseDateFor: tekuci mesec -> danas; rok u mesecu -> rok; inace poslednji dan meseca', () => {
  assert.equal(C.expenseDateFor('2026-09', '', '2026-09-30'), '2026-09-30');
  assert.equal(C.expenseDateFor('2026-09', '2026-09-28', '2026-09-30'), '2026-09-30');
  assert.equal(C.expenseDateFor('2026-10', '2026-10-15', '2026-09-30'), '2026-10-15');
  assert.equal(C.expenseDateFor('2026-08', '2026-09-15', '2026-09-30'), '2026-08-31');
  assert.equal(C.expenseDateFor('2026-02', '', '2026-09-30'), '2026-02-28');
});

test('cleanBills cuva mesec rashoda', () => {
  const b = C.cleanBills([{ id: 'B1', billTypeId: 'T1', month: '2026-08', expenseMonth: '2026-09' }, { id: 'B2', billTypeId: 'T1', month: '2026-08', expenseMonth: 'x' }], ['T1']);
  assert.equal(b[0].expenseMonth, '2026-09');
  assert.equal(b[1].expenseMonth, undefined);
});

test('isAttachmentName i itemKey', () => {
  assert.equal(C.isAttachmentName('2026-09-30-racun-maxi-1.jpg'), true);
  assert.equal(C.isAttachmentName('x.bat'), false);
  assert.equal(C.isAttachmentName('..\\x.pdf'), false);
  assert.equal(C.isAttachmentName('.x.pdf'), false);
  assert.equal(C.itemKey('Mleko (2 kom)'), 'mleko');
  assert.equal(C.itemKey('Čokolada'), 'cokolada');
});

test('receiptPrompt i cleanReceiptReading', () => {
  const p = C.receiptPrompt(['Hrana', 'Higijena']);
  assert.match(p, /"Hrana", "Higijena"/);
  assert.match(p, /"discount"/);
  const raw = 'Evo:\n```json\n{"store":"Maxi","date":"30.09.2026","total":"1.234,50","items":[' +
    '{"raw":"MLEKO IMLEK 2,8% 1L","name":"Mleko","qty":"2","unit":"kom","price":"259,98","category":"Hrana"},' +
    '{"raw":"POPUST","name":"","price":-20,"discount":1},' +
    '{"raw":"SAPUN DOVE 100G","price":"199,00","category":"Kozmetika"},' +
    '{"raw":"","name":"","price":null}]}\n```';
  const r = C.cleanReceiptReading(raw, { categories: ['Hrana', 'Higijena'] });
  assert.equal(r.store, 'Maxi');
  assert.equal(r.date, '2026-09-30');
  assert.equal(r.total, 1234.5);
  assert.equal(r.items.length, 3);
  assert.deepEqual(r.items[0], { raw: 'MLEKO IMLEK 2,8% 1L', name: 'Mleko', qty: 2, unit: 'kom', price: 259.98, category: 'Hrana', discount: false });
  assert.equal(r.items[1].discount, true);
  assert.equal(r.items[1].price, -20);
  assert.equal(r.items[2].name, 'Sapun dove');
  assert.equal(r.items[2].category, '');
  assert.equal(C.cleanReceiptReading('nista', { categories: [] }), null);
  assert.deepEqual(C.cleanReceiptReading({ items: [] }, { categories: [] }).low.sort(), ['date', 'items', 'total']);
});

test('mergeReceiptParts: redosled, preklapanje do 3 reda, ukupno iz poslednjeg dela', () => {
  const it = (raw, price) => ({ raw, name: raw, qty: 1, unit: '', price, category: '', discount: false });
  const a = { store: 'Maxi', date: '2026-09-30', total: null, items: [it('A', 1), it('B', 2), it('C', 3)], low: ['total'] };
  const b = { store: '', date: '', total: 16, items: [it('B', 2), it('C', 3), it('D', 4), it('E', 6)], low: [] };
  const m = C.mergeReceiptParts([a, b]);
  assert.deepEqual(m.items.map(x => x.raw), ['A', 'B', 'C', 'D', 'E']);
  assert.equal(m.store, 'Maxi');
  assert.equal(m.total, 16);
  assert.ok(!m.low.includes('total'));
  const c = { store: '', date: '', total: null, items: [it('C', 9), it('F', 1)], low: [] };
  assert.deepEqual(C.mergeReceiptParts([a, c]).items.map(x => x.raw), ['A', 'B', 'C', 'C', 'F']);
  assert.equal(C.mergeReceiptParts([]), null);
});

test('applyReceiptDiscounts: popust na prethodnu stavku, veci popust srazmerno, popust na pocetku', () => {
  const it = (name, price, discount) => ({ raw: name, name, qty: 1, unit: '', price, category: '', discount: !!discount });
  const r1 = C.applyReceiptDiscounts([it('A', 100), it('B', 50), it('pop', -10, 1)]);
  assert.deepEqual(r1.map(x => [x.name, x.price]), [['A', 100], ['B', 40]]);
  const r2 = C.applyReceiptDiscounts([it('A', 100), it('B', 50), it('pop', -60, 1)]);
  assert.equal(r2.length, 2);
  assert.equal(Math.round((r2[0].price + r2[1].price) * 100), 9000);
  assert.ok(r2.every(x => x.price >= 0));
  const r3 = C.applyReceiptDiscounts([it('pop', -5, 1), it('A', 30), it('B', 20)]);
  assert.equal(Math.round((r3[0].price + r3[1].price) * 100), 4500);
  const r4 = C.applyReceiptDiscounts([it('A', null), it('B', 20)]);
  assert.equal(r4[0].price, null);
});

test('itemCategoryMemory: poslednji rashod pobedjuje, lista ima prednost', () => {
  const entries = [
    { type: 'expense', date: '2026-08-01', category: 'Hrana', items: ['Mleko (2 kom)', 'Sapun'] },
    { type: 'expense', date: '2026-09-01', category: 'Higijena', items: ['Sapun'] },
    { type: 'income', date: '2026-09-02', category: 'Plata', items: ['Mleko'] }
  ];
  const m = C.itemCategoryMemory(entries, [{ name: 'Čokolada', category: 'Slatkiši' }, { name: 'Bez', category: '' }]);
  assert.equal(m.get('mleko'), 'Hrana');
  assert.equal(m.get('sapun'), 'Higijena');
  assert.equal(m.get('cokolada'), 'Slatkiši');
  assert.equal(m.has('bez'), false);
});

test('matchReceiptToShopping: tacno, prefiks, dijakritike, svaka stavka jednom, samo trazene', () => {
  const items = [{ name: 'Mleko', raw: 'MLEKO IMLEK' }, { name: 'Hleb', raw: 'HLEB' }, { name: 'Hleb', raw: 'HLEB' }, { name: 'Čokolada milka', raw: 'COKOLADA MILKA 100G' }, { name: 'Jaja', raw: 'JAJA 10' }];
  const list = [{ id: 's1', name: 'hleb', needed: true }, { id: 's2', name: 'Cokolada', needed: true }, { id: 's3', name: 'Mleko', needed: true }, { id: 's4', name: 'Jaja', needed: false }, { id: 's5', name: 'Mlekar', needed: true }];
  const m = C.matchReceiptToShopping(items, list);
  assert.deepEqual(m.sort((a, b) => a.receiptIndex - b.receiptIndex), [{ receiptIndex: 0, shoppingId: 's3' }, { receiptIndex: 1, shoppingId: 's1' }, { receiptIndex: 3, shoppingId: 's2' }]);
});

test('receiptToExpenses: grupe po kategoriji, razlika do ukupnog na pare tacno', () => {
  const it = (name, price, category) => ({ raw: name, name, qty: 1, unit: '', price, category, discount: false });
  const rows = C.receiptToExpenses([it('A', 100, 'Hrana'), it('B', 33.33, 'Higijena'), it('C', 50, 'Hrana'), it('D', null, 'Hrana')], 183.34);
  assert.deepEqual(rows.map(r => r.category), ['Hrana', 'Higijena']);
  assert.equal(rows[0].items.length, 3);
  assert.deepEqual(rows[0].itemPrices, [100, 50, null]);
  assert.equal(Math.round((rows[0].amount + rows[1].amount) * 100), 18334);
  const noTotal = C.receiptToExpenses([it('A', 10.1, 'X'), it('B', 20.2, 'Y')], null);
  assert.equal(Math.round(noTotal.reduce((s, r) => s + r.amount, 0) * 100), 3030);
  const scaled = C.receiptToExpenses([it('A', 10, 'X'), it('B', 10, 'Y'), it('C', 10, 'Z')], 100);
  assert.equal(Math.round(scaled.reduce((s, r) => s + r.amount, 0) * 100), 10000);
  assert.deepEqual(C.receiptToExpenses([], 50), []);
});

test('findReceiptDuplicate', () => {
  const entries = [{ type: 'expense', date: '2026-09-30', amount: 100, receiptId: 'R1' }, { type: 'expense', date: '2026-09-30', amount: 83.34, receiptId: 'R1' }, { type: 'expense', date: '2026-09-30', amount: 183.34 }];
  assert.equal(C.findReceiptDuplicate(entries, '2026-09-30', 183.5), 'R1');
  assert.equal(C.findReceiptDuplicate(entries, '2026-09-29', 183.34), null);
  assert.equal(C.findReceiptDuplicate(entries, '2026-09-30', 200), null);
});

test('mergeReceiptParts: preklapanje i kad se red procita malo drugacije, do 8 redova, deo na stavci', () => {
  const it = (raw, price, name) => ({ raw, name: name || raw, qty: 1, unit: '', price, category: '', discount: false });
  const a = { store: 'M', date: '2026-09-30', total: null, items: [it('MLEKO 2,8%', 100, 'Mleko'), it('HLEB', 60)], low: [] };
  const b = { store: '', date: '', total: null, items: [it('MLEKO 2.8%', 100, 'Mleko'), it('HLEB', 60), it('JAJA', 30)], low: [] };
  const m = C.mergeReceiptParts([a, b]);
  assert.deepEqual(m.items.map(x => x.name), ['Mleko', 'HLEB', 'JAJA']);
  assert.deepEqual(m.items.map(x => x.part), [0, 0, 1]);
  const L = 'ABCDEFGH'.split('');
  const p1 = { items: ['X', ...L].map((r, i) => it(r, i + 1)), low: [] };
  const p2 = { items: [...L, 'Z'].map((r, i) => it(r, i + 2)), low: [] };
  assert.deepEqual(C.mergeReceiptParts([p1, p2]).items.map(x => x.raw).join(''), 'XABCDEFGHZ');
});

test('mergeReceiptParts: stvarno ponovljena stavka se vraca kad to uskladjuje zbir', () => {
  const it = (raw, price) => ({ raw, name: raw, qty: 1, unit: '', price, category: '', discount: false });
  const a = { items: [it('MLEKO', 100), it('HLEB', 60)], low: [] };
  const b = { total: 190, items: [it('HLEB', 60), it('JAJA', 30)], low: [] };  // 100+60+60+30 = 250? ne: ukupno 190 -> preklapanje
  assert.deepEqual(C.mergeReceiptParts([a, b]).items.map(x => x.raw), ['MLEKO', 'HLEB', 'JAJA']);
  const c = { total: 250, items: [it('HLEB', 60), it('JAJA', 30)], low: [] };  // 250 = dva hleba
  assert.deepEqual(C.mergeReceiptParts([a, c]).items.map(x => x.raw), ['MLEKO', 'HLEB', 'HLEB', 'JAJA']);
});

test('insertReceiptPart: novi deo na svoje mesto, izmene ostaju, preklapanje sa susedima', () => {
  const it = (raw, price, part, extra) => Object.assign({ raw, name: raw, qty: 1, unit: '', price, category: '', discount: false, part }, extra || {});
  const cur = [it('A', 1, 0, { category: 'Moja' }), it('B', 2, 0), it('E', 5, 2)];
  const out = C.insertReceiptPart(cur, 1, [it('B', 2), it('C', 3), it('D', 4), it('E', 5)]);
  assert.deepEqual(out.map(x => x.raw), ['A', 'B', 'C', 'D', 'E']);
  assert.equal(out[0].category, 'Moja');
  assert.deepEqual(out.map(x => x.part), [0, 0, 1, 1, 2]);
  const added = C.insertReceiptPart(cur.slice(0, 2), 1, [it('B', 2), it('X', 9)]);
  assert.deepEqual(added.map(x => x.raw), ['A', 'B', 'X']);
});

test('receiptToExpenses: kategorija bez ijedne cene ne pravi rashod od 0', () => {
  const it = (name, price, category) => ({ raw: name, name, qty: 1, unit: '', price, category, discount: false });
  const rows = C.receiptToExpenses([it('Mleko', 100, 'Hrana'), it('Kesa', null, 'Ostalo')], 105);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, 105);
  assert.deepEqual(rows[0].items.map(i => i.name), ['Mleko', 'Kesa']);
  assert.deepEqual(rows[0].itemPrices, [100, null]);
  assert.ok(C.receiptToExpenses([it('A', 0.004, 'X'), it('B', 50, 'Y')], 50).every(r => r.amount > 0));
});

test('slipPrompt i cleanSlipReading: nalog za uplatu', () => {
  assert.match(C.slipPrompt(), /"reference"/);
  const r = C.cleanSlipReading('```json\n{"name":"JKP Infostan Tehnologije, Beograd","account":"845-0000000404849-87","code":"","amount":"3.456,00","currency":"rsd","purpose":"Komunalne usluge","model":"(97)","reference":"12 3456 78"}\n```');
  assert.equal(r.name, 'JKP Infostan Tehnologije, Beograd');
  assert.equal(r.account, '845000000040484987');
  assert.equal(r.code, '');
  assert.equal(r.amount, 3456);
  assert.equal(r.currency, 'RSD');
  assert.equal(r.model, '97');
  assert.equal(r.reference, '12345678');
  assert.equal(r.purpose, 'Komunalne usluge');
  const bad = C.cleanSlipReading({ name: 'X', account: '12', code: '1890', amount: null });
  assert.equal(bad.account, '12');          // ostaje za ispravku; provera (ipsProblems) ga ne pusti do QR-a
  assert.equal(bad.code, '');
  assert.equal(bad.amount, null);
  assert.equal(C.cleanSlipReading('nema'), null);
  assert.equal(C.cleanSlipReading({ purpose: 'samo svrha' }), null);  // bez primaoca i racuna nema smisla
});

test('cleanSlipReading: propusten model 97 se vraca kad poziv na broj prolazi proveru; slipWarnings', () => {
  let ref = null;
  for(let i = 0; i < 100 && !ref; i++){ const c = String(i).padStart(2, '0') + '12345678'; if(C.validReference97(c)) ref = c; }
  const r = C.cleanSlipReading({ name: 'Infostan', account: '845-0000000404849-87', model: '', reference: ref });
  assert.equal(r.model, '97');
  assert.deepEqual(C.slipWarnings(r), []);
  const bad = C.cleanSlipReading({ name: 'Infostan', account: '845-0000000404849-87', model: '', reference: '1234567' });
  assert.equal(bad.model, '');
  assert.equal(C.slipWarnings(bad).length, 1);
  assert.match(C.slipWarnings(bad)[0], /Poziv na broj nije proveren/);
  assert.deepEqual(C.slipWarnings(C.cleanSlipReading({ name: 'X', account: '845-0000000404849-87' })), []);
});

test('uvoz + AI: kandidati, uputstvo, ciscenje predloga, pravila', () => {
  const rows = [
    { type: 'expense', desc: 'POS 4432 LIDL KRALJEVO', catSource: 'default' },
    { type: 'expense', desc: 'pos 4432  lidl kraljevo', catSource: 'default' },
    { type: 'expense', desc: 'WOLT *ORDER 123', catSource: 'default' },
    { type: 'expense', desc: 'MAXI 12', catSource: 'rule' },
    { type: 'income', desc: 'UPLATA', catSource: 'default' }
  ];
  const cands = C.importAiCandidates(rows);
  assert.deepEqual(cands.map(c => [c.desc, c.count]), [['POS 4432 LIDL KRALJEVO', 2], ['WOLT *ORDER 123', 1]]);
  const p = C.importCategoryPrompt(['Hrana', 'Restorani'], cands);
  assert.match(p, /"Hrana", "Restorani"/);
  assert.match(p, /0: POS # LIDL KRALJEVO/);   // broj kartice se ne salje
  assert.ok(!/4432\.|iznos/i.test(p.split('\n').slice(-2).join(' ')));
  const sug = C.cleanImportSuggestions('```json\n{"items":[{"i":0,"category":"hrana","keyword":"LIDL"},{"i":1,"category":"Kafane","keyword":"BURGER"},{"i":7,"category":"Hrana","keyword":"X"}]}\n```', ['Hrana', 'Restorani'], cands);
  assert.equal(sug.size, 2);
  assert.deepEqual(sug.get(cands[0].key), { category: 'Hrana', keyword: 'LIDL', strong: true });
  assert.equal(sug.get(cands[1].key).category, '');                 // nepoznata kategorija
  assert.equal(sug.get(cands[1].key).keyword, 'WOLT');              // BURGER nije u opisu -> rec iz opisa
  assert.equal(C.cleanImportSuggestions('nista', ['Hrana'], cands), null);
  const existing = [{ keyword: 'lidl', category: 'Hrana' }];
  const nr = C.rulesFromSuggestions([{ keyword: 'LIDL', category: 'Hrana', make: true }, { keyword: 'WOLT', category: 'Restorani', make: true }, { keyword: 'NIS', category: 'Gorivo', make: false }, { keyword: 'wolt', category: 'Restorani', make: true }, { keyword: '', category: 'X', make: true }], existing);
  assert.deepEqual(nr, [{ keyword: 'WOLT', category: 'Restorani' }]);
  assert.equal(C.suggestKeyword('POS 4432 NIS PETROL BG'), 'NIS');
  assert.equal(C.suggestKeyword('KUPOVINA 12 BEOGRAD'), '');
});

test('uvoz + AI posle pregleda: maskirane cifre, opste/numericke kljucne reci, provera na izvornom opisu, jacina', () => {
  const rows = [
    { type: 'expense', desc: 'POS 4432 1234 LIDL KRALJEVO', catSource: 'default' },
    { type: 'expense', desc: 'NIS  PETROL 123', catSource: 'default' },
    { type: 'expense', desc: 'PLACANJE KARTICOM MAXI 55', catSource: 'default' },
    { type: 'expense', desc: 'PRENOS NA 160-0000123-45 PETAR', catSource: 'default' }
  ];
  const cands = C.importAiCandidates(rows);
  assert.deepEqual(cands[1].raws, ['NIS  PETROL 123']);
  const p = C.importCategoryPrompt(['Hrana'], cands);
  assert.ok(!/4432|1234|0000123/.test(p), p);
  assert.match(p, /LIDL KRALJEVO/);
  const sug = C.cleanImportSuggestions(JSON.stringify({ items: [
    { i: 0, category: 'Hrana', keyword: '4432' },
    { i: 1, category: 'Hrana', keyword: 'NIS PETROL' },
    { i: 2, category: 'Hrana', keyword: 'PLACANJE KARTICOM' },
    { i: 3, category: 'Hrana', keyword: 'POS' }
  ] }), ['Hrana'], cands);
  assert.equal(sug.get(cands[0].key).keyword, 'LIDL');                // brojevi -> rec iz opisa
  assert.equal(sug.get(cands[1].key).keyword, 'NIS');                 // "NIS PETROL" nije u izvornom opisu (dva razmaka)
  assert.equal(sug.get(cands[1].key).strong, false);                  // kratka rec: pravilo nije podrazumevano
  assert.equal(sug.get(cands[2].key).keyword, 'MAXI');                // opste reci -> prodavac
  assert.equal(sug.get(cands[0].key).strong, true);
  assert.equal(sug.get(cands[3].key).keyword, 'PRENOS');
  assert.equal(C.suggestKeyword('PLACANJE KARTICOM 12'), '');
});

test('parseQuickSentence: iznos, valuta, datum, racun, opis', () => {
  const ctx = { today: '2026-09-30', currencies: ['EUR', 'USD', 'CHF', 'GBP', 'BAM'],
    accounts: [{ id: 'a1', name: 'Intesa tekući', type: 'tekuci' }, { id: 'a2', name: 'Novčanik', type: 'gotovina' }, { id: 'a3', name: 'Visa', type: 'kartica' }] };
  const p = s => C.parseQuickSentence(s, ctx);
  assert.deepEqual(p('kafa i kroasan 520 juče gotovinom'), { desc: 'kafa i kroasan', amount: 520, currency: null, date: '2026-09-29', accountId: 'a2' });
  assert.deepEqual(p('ručak 1.250,50 u ponedeljak'), { desc: 'ručak', amount: 1250.5, currency: null, date: '2026-09-28', accountId: null });
  assert.deepEqual(p('gorivo 20 eur 15.9.'), { desc: 'gorivo', amount: 20, currency: 'EUR', date: '2026-09-15', accountId: null });
  assert.deepEqual(p('kafa 2 kom 300'), { desc: 'kafa 2 kom', amount: 300, currency: null, date: null, accountId: null });
  assert.deepEqual(p('poklon za mamu'), { desc: 'poklon za mamu', amount: null, currency: null, date: null, accountId: null });
  assert.equal(p('karte 15.10.').date, '2025-10-15');          // buduci datum bez godine -> prosla godina
  assert.equal(p('u nedelju pica 900').date, '2026-09-27');
  assert.equal(p('u nedelju pica 900').desc, 'pica');
  assert.deepEqual(p('€15 knjiga'), { desc: 'knjiga', amount: 15, currency: 'EUR', date: null, accountId: null });
  assert.equal(p('taksi 600 prekjuce').date, '2026-09-28');
  assert.equal(p('struja 3000 sa intesa').accountId, 'a1');
  assert.equal(p('struja 3000 sa intesa').desc, 'struja');
  assert.equal(p('patike 8990 karticom').accountId, 'a3');
  assert.equal(p('danas pijaca 740').date, '2026-09-30');
  assert.equal(p('sreda 100').date, '2026-09-30');             // danas je sreda
  assert.equal(p('15 bam vožnja').currency, 'BAM');
  assert.equal(p('knjiga 12,5 dinara').amount, 12.5);
  assert.equal(p('knjiga 12,5 dinara').currency, null);
  assert.equal(p('').desc, '');
});

test('quickCategoryPrompt i cleanQuickCategory', () => {
  assert.match(C.quickCategoryPrompt(['Hrana', 'Prevoz'], 'kafa i kroasan'), /"Hrana", "Prevoz"/);
  assert.match(C.quickCategoryPrompt(['Hrana'], 'kafa i kroasan'), /kafa i kroasan/);
  assert.equal(C.cleanQuickCategory('```json\n{"category":"hrana"}\n```', ['Hrana', 'Prevoz']), 'Hrana');
  assert.equal(C.cleanQuickCategory('{"category":"Kafane"}', ['Hrana']), '');
  assert.equal(C.cleanQuickCategory('nista', ['Hrana']), '');
});

test('parseQuickSentence: predlozi u opisu ostaju kad nisu uz prepoznat deo', () => {
  const ctx = { today: '2026-09-30', currencies: [], accounts: [] };
  assert.equal(C.parseQuickSentence('Na pijaci 740', ctx).desc, 'Na pijaci');
  assert.equal(C.parseQuickSentence('Za mamu poklon 2000', ctx).desc, 'Za mamu poklon');
  assert.equal(C.parseQuickSentence('ručak u ponedeljak', ctx).desc, 'ručak');
});

test('importRulePlan: bez pravila za Ostalo, sukob kljucnih reci se prijavljuje', () => {
  const existing = [{ keyword: 'wolt', category: 'Restorani' }];
  const plan = C.importRulePlan([
    { keyword: 'LIDL', category: 'Hrana', make: true },
    { keyword: 'MAXI', category: 'Ostalo', make: true },          // pravilo za podrazumevanu kategoriju nema smisla
    { keyword: 'WOLT', category: 'Hrana', make: true },           // vec postoji pravilo za drugu kategoriju
    { keyword: 'wolt', category: 'Restorani', make: true },       // isto pravilo kao postojece -> tiho
    { keyword: 'lidl', category: 'Kućne potrepštine', make: true }, // ista rec dvaput u uvozu, druga kategorija
    { keyword: 'lidl', category: 'Hrana', make: true }            // isto kao vec izabrano -> tiho
  ], existing, 'Ostalo');
  assert.deepEqual(plan.rules, [{ keyword: 'LIDL', category: 'Hrana' }]);
  assert.deepEqual(plan.conflicts, [{ keyword: 'WOLT', category: 'Hrana', existing: 'Restorani' }, { keyword: 'lidl', category: 'Kućne potrepštine', existing: 'Hrana' }]);
  assert.deepEqual(C.rulesFromSuggestions([{ keyword: 'MAXI', category: 'Ostalo', make: true }], [], 'Ostalo'), []);
  assert.deepEqual(C.rulesFromSuggestions([{ keyword: 'MAXI', category: 'Ostalo', make: true }], []), []);   // podrazumevano 'Ostalo'
});

test('parseQuickSentence: "nedelju dana" nije nedelja, ime racuna kao obicna rec', () => {
  const ctx = { today: '2026-09-30', currencies: [], accounts: [{ id: 'a1', name: 'Intesa tekući', type: 'tekuci' }, { id: 'a3', name: 'Visa', type: 'kartica' }] };
  const p = s => C.parseQuickSentence(s, ctx);
  assert.deepEqual([p('parking nedelju dana 1500').date, p('parking nedelju dana 1500').desc, p('parking nedelju dana 1500').amount], [null, 'parking nedelju dana', 1500]);
  assert.equal(p('kurs nedelja dana 900').date, null);
  assert.equal(p('u nedelju pica 900').date, '2026-09-27');       // obicna nedelja i dalje radi
  assert.deepEqual([p('visa za Ameriku 16000').accountId, p('visa za Ameriku 16000').desc], [null, 'visa za Ameriku']);
  assert.deepEqual([p('taksa za vizu i visa obrazac 900').accountId, p('taksa za vizu i visa obrazac 900').desc], [null, 'taksa za vizu i visa obrazac']);
  assert.deepEqual([p('kafa 200 visa').accountId, p('kafa 200 visa').desc], ['a3', 'kafa']);   // na kraju = racun
  assert.deepEqual([p('kafa visa 200').accountId, p('kafa visa 200').desc], ['a3', 'kafa']);   // posle samo iznos = racun
  assert.deepEqual([p('kafa sa visa 200 juče').accountId, p('kafa sa visa 200 juče').desc], ['a3', 'kafa']);
  assert.equal(p('struja 3000 sa intesa').accountId, 'a1');
  assert.equal(p('Intesa banka provizija 300').accountId, null);
});

test('prozor za brzi unos: test kuke postoje samo u test okruzenju', () => {
  const fs = require('node:fs'), path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'quick-add.html'), 'utf8');
  const hookLines = html.split(/\r?\n/).filter(l => /window\.__\w+\s*=[^=]|defineProperty\(window,\s*'__/.test(l));
  assert.ok(hookLines.length >= 3, 'kuke nisu pronadjene');
  hookLines.forEach(l => assert.match(l, /\bIS_TEST\b/, l.trim()));
  assert.match(html, /const IS_TEST = !!\(window\.desktop && window\.desktop\.info && window\.desktop\.info\.test\)/);
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  assert.match(main, /'desktop:info'[\s\S]{0,300}test: !!process\.env\.KNJIGA_TEST/);
});

test('parseQuickSentence posle pregleda: broj u sredini nije iznos, km nije valuta, nemoguc datum, bez iznosa', () => {
  const ctx = { today: '2026-09-30', currencies: ['EUR', 'BAM'], accounts: [{ id: 'a2', name: 'Novčanik', type: 'gotovina' }] };
  const p = (s, o) => C.parseQuickSentence(s, Object.assign({}, ctx, o || {}));
  assert.equal(p('0641234567 dopuna').amount, null);
  assert.equal(p('Račun 2025 za struju').amount, null);
  assert.equal(p('Račun 2025 za struju').desc, 'Račun 2025 za struju');
  assert.equal(p('iPhone 15 maska').amount, null);
  assert.deepEqual([p('gorivo 3000 15.9').amount, p('gorivo 3000 15.9').date, p('gorivo 3000 15.9').desc], [3000, '2026-09-15', 'gorivo']);
  assert.equal(p('knjiga 12.5').amount, 12.5);
  assert.equal(p('dopuna 1234567').amount, null);                 // 7+ cifara nije iznos
  assert.deepEqual([p('taxi 15 km 800').amount, p('taxi 15 km 800').currency, p('taxi 15 km 800').desc], [800, null, 'taxi 15 km']);
  assert.equal(p('bus 20 bam').currency, 'BAM');
  assert.equal(p('karte 31.2.').date, null);                       // nemoguc datum se ne pretvara u mart
  assert.equal(p('karte 29.2.2025').date, null);
  const noAmt = p('iPhone 15 juče gotovinom', { noAmount: true });
  assert.deepEqual([noAmt.desc, noAmt.amount, noAmt.date, noAmt.accountId], ['iPhone 15', null, '2026-09-29', 'a2']);
  assert.equal(p('kafa 20 eur', { noAmount: true }).desc, 'kafa 20 eur');
});

test('dokumenti: rok, stanje, podsetnici, obnova', () => {
  assert.equal(C.addMonthsToDate('2026-01-31', 1), '2026-02-28');
  assert.equal(C.addMonthsToDate('2028-02-29', 12), '2029-02-28');
  assert.equal(C.addMonthsToDate('2026-09-30', 24), '2028-09-30');
  assert.equal(C.documentExpiry({ issued: '2026-01-15', warrantyMonths: 24 }), '2028-01-15');
  assert.equal(C.documentExpiry({ expires: '2027-05-01', issued: '2026-01-15', warrantyMonths: 24 }), '2027-05-01');
  assert.equal(C.documentExpiry({ issued: '2026-01-15' }), '');
  const st = (expires, rd) => C.documentStatus({ expires, remindDays: rd == null ? 30 : rd }, '2026-10-01');
  assert.deepEqual(st('2026-10-01'), { state: 'soon', days: 0 });
  assert.deepEqual(st('2026-10-31'), { state: 'soon', days: 30 });
  assert.deepEqual(st('2026-11-01'), { state: 'ok', days: 31 });
  assert.deepEqual(st('2026-09-30'), { state: 'expired', days: -1 });
  assert.deepEqual(C.documentStatus({}, '2026-10-01'), { state: 'none', days: null });
  const docs = [{ id: 'd1', title: 'A', expires: '2026-10-10', remindDays: 30 }, { id: 'd2', title: 'B', expires: '2026-10-01', remindDays: 30 }, { id: 'd3', title: 'C', expires: '2027-01-01', remindDays: 30 }, { id: 'd4', title: 'D', expires: '2026-08-01', remindDays: 30 }, { id: 'd5', title: 'E' }];
  const rem = C.documentReminders(docs, '2026-10-01');
  assert.deepEqual(rem.map(r => [r.doc.id, r.notifyKey]), [['d2', 'doc-d2-2026-10-01-day'], ['d1', 'doc-d1-2026-10-10-soon']]);
  assert.deepEqual(C.documentReminders(docs, '2026-10-01', { includeExpiredDays: 90 }).map(r => r.doc.id), ['d4', 'd2', 'd1']);
  const ren = C.renewDocument({ id: 'd1', expires: '2026-10-10', renewal: { months: 12 } }, '2026-10-01');
  assert.equal(ren.expires, '2027-10-10');
  assert.deepEqual(ren.history, [{ expires: '2026-10-10', renewedAt: '2026-10-01' }]);
  assert.equal(C.renewDocument({ id: 'd4', expires: '2025-09-01' }, '2026-10-01').expires, '2027-10-01');   // istekao davno -> od danas
  assert.equal(C.renewDocument({ id: 'd6', expires: '2026-09-01' }, '2026-10-01', 6).expires, '2027-03-01'); // istekao skoro -> od starog roka
});

test('dokumenti: ciscenje zapisa i AI odgovora', () => {
  const evil = '"><img onerror=1>';
  const c = C.cleanDocuments([
    { id: 'd1', kind: 'garancija', title: ' Frižider ', group: 'Tehnika', issued: '2026-01-15', warrantyMonths: '24', files: ['a.pdf', '..\\x.pdf', 'b.bat'], remindDays: 'x', renewal: { amount: '25.000', category: 'Prevoz', months: 12 } },
    { id: evil, title: 'X' }, { id: 'd3', title: '' }, null
  ]);
  assert.equal(c.length, 1);
  assert.deepEqual(c[0].files, ['a.pdf']);
  assert.equal(c[0].title, 'Frižider');
  assert.equal(c[0].warrantyMonths, 24);
  assert.equal(c[0].remindDays, 30);
  assert.equal(c[0].renewal.amount, 25000);
  assert.equal(c[0].kind, 'garancija');
  assert.match(C.documentPrompt(['Tehnika', 'Auto']), /"Tehnika", "Auto"/);
  const r = C.cleanDocumentReading('```json\n{"kind":"garancija","title":"Gorenje frižider","group":"tehnika","issued":"15.01.2026","expires":"","warrantyMonths":"24","vendor":"Tehnomanija","confidence":{"issued":"low"}}\n```', ['Tehnika', 'Auto']);
  assert.deepEqual([r.kind, r.title, r.group, r.issued, r.expires, r.warrantyMonths, r.vendor], ['garancija', 'Gorenje frižider', 'Tehnika', '2026-01-15', '', 24, 'Tehnomanija']);
  assert.deepEqual(r.low, ['issued']);
  assert.equal(C.cleanDocumentReading({ kind: 'nesto', title: 'X', group: 'Nepoznata' }, ['Tehnika']).kind, 'dokument');
  assert.equal(C.cleanDocumentReading({ kind: 'nesto', title: 'X', group: 'Nepoznata' }, ['Tehnika']).group, '');
  assert.equal(C.cleanDocumentReading('nista', []), null);
});

test('pitaj: alati nad stavkama (raspodela, neplaceno), plan, uputstva', () => {
  const entries = [
    { id: '1', type: 'income', amount: 100000, date: '2026-08-05', category: 'Plata', desc: 'Plata' },
    { id: '2', type: 'expense', amount: 30000, date: '2026-08-10', category: 'Hrana', desc: 'Maxi' },
    { id: '3', type: 'expense', amount: 9000, date: '2026-08-01', category: 'Osiguranje', desc: 'Kasko', spreadMonths: 3 },
    { id: '4', type: 'expense', amount: 5000, date: '2026-09-02', category: 'Hrana', desc: 'Lidl', paid: false },
    { id: '5', type: 'expense', amount: 42000, date: '2026-09-03', category: 'Hrana', desc: 'Nabavka velika' },
    { id: '6', type: 'expense', amount: 1200, date: '2026-09-04', category: 'Zabava', desc: 'Bioskop' }
  ];
  const recurring = [{ id: 'r1', type: 'expense', desc: 'Netflix', amount: 1200, category: 'Zabava', frequency: 'monthly' }, { id: 'r2', type: 'income', desc: 'Plata', amount: 100000, frequency: 'monthly' }];
  const run = calls => C.runAskTools(calls, { entries, recurring });
  const ms = run([{ tool: 'monthSummary', months: ['2026-08', '2026-09', '2026-10'] }])[0].result;
  assert.deepEqual(ms.map(m => [m.month, m.income, m.expense]), [['2026-08', 100000, 33000], ['2026-09', 0, 46200], ['2026-10', 0, 3000]]);
  const bc = run([{ tool: 'byCategory', months: ['2026-09'] }])[0].result;
  assert.deepEqual(bc.map(r => [r.category, r.total]), [['Hrana', 42000], ['Osiguranje', 3000], ['Zabava', 1200]]);
  const cmp = run([{ tool: 'compare', months: ['2026-08'], monthsB: ['2026-09'] }])[0].result;
  assert.deepEqual([cmp.ranije, cmp.kasnije], [['2026-08'], ['2026-09']]);
  assert.deepEqual(cmp.rows[0], { category: 'Hrana', ranije: 30000, kasnije: 42000, razlika: 12000, procenat: 40 });
  const cmpRev = run([{ tool: 'compare', months: ['2026-09'], monthsB: ['2026-08'] }])[0].result;   // obrnut redosled -> isto: ranije je avgust
  assert.deepEqual(cmpRev.rows[0], cmp.rows[0]);
  const top = run([{ tool: 'top', months: ['2026-08', '2026-09'], n: 2 }])[0].result;
  assert.deepEqual(top, [{ desc: 'Nabavka velika', amount: 42000, uPeriodu: 42000, category: 'Hrana', month: '2026-09' }, { desc: 'Maxi', amount: 30000, uPeriodu: 30000, category: 'Hrana', month: '2026-08' }]);
  assert.deepEqual(run([{ tool: 'average', months: ['2026-08', '2026-09'], category: 'Hrana' }])[0].result, [{ category: 'Hrana', avgPerMonth: 36000 }]);
  const rec = run([{ tool: 'recurring' }])[0].result;
  assert.deepEqual([rec.monthly, rec.yearly, rec.items.length], [1200, 14400, 1]);
  assert.deepEqual(run([{ tool: 'monthSummary', months: ['2026-07'] }])[0].result, [{ month: '2026-07', income: 0, expense: 0, net: 0 }]);

  const ctx = { first: '2026-08', last: '2026-10', categories: ['Hrana', 'Zabava', 'Osiguranje', 'Plata'] };
  const plan = C.cleanAskPlan('```json\n{"calls":[{"tool":"byCategory","months":["2026-09","2025-01","x"]},{"tool":"hack"},{"tool":"top","months":["2026-09"],"n":50,"category":"hrana"},{"tool":"compare","months":["2026-08"],"monthsB":["2026-09"]},{"tool":"average","months":["2026-08"]},{"tool":"recurring"}],"offTopic":false}\n```', ctx);
  assert.equal(plan.calls.length, 4);
  assert.deepEqual(plan.calls[0], { tool: 'byCategory', months: ['2026-09'], type: 'expense' });
  assert.deepEqual(plan.calls[1], { tool: 'top', months: ['2026-09'], n: 10, category: 'Hrana' });
  assert.ok(plan.notes.length >= 2);
  assert.equal(C.cleanAskPlan('{"calls":[],"offTopic":true}', ctx).offTopic, true);
  assert.equal(C.cleanAskPlan('nista', ctx), null);
  const long = C.cleanAskPlan(JSON.stringify({ calls: [{ tool: 'monthSummary', months: Array.from({ length: 40 }, (_, i) => C.addMonths('2024-01', i)) }] }), { first: '2024-01', last: '2027-12', categories: [] });
  assert.equal(long.calls[0].months.length, 24);

  const pp = C.askPlanPrompt({ question: 'zasto je septembar skuplji?', today: '2026-10-01', first: '2026-08', last: '2026-10', expenseCats: ['Hrana'], incomeCats: ['Plata'] });
  assert.match(pp, /zasto je septembar skuplji/);
  assert.match(pp, /monthSummary/);
  assert.ok(!/42000|30000|Maxi/.test(pp));
  const ap = C.askAnswerPrompt({ question: 'q', today: '2026-10-01', results: [{ tool: 'byCategory', args: {}, result: bc }] });
  assert.match(ap, /42000/);
  assert.match(ap, /ne izmišljaj/i);
});

test('pitaj: odgovor iz JSON-a (bills.read trazi JSON) i obican tekst', () => {
  assert.equal(C.cleanAskAnswer('{\n "odgovor": "Septembar je skuplji zbog Prevoza."\n}'), 'Septembar je skuplji zbog Prevoza.');
  assert.equal(C.cleanAskAnswer('```json\n{"answer":"Ok."}\n```'), 'Ok.');
  assert.equal(C.cleanAskAnswer('Samo tekst.'), 'Samo tekst.');
  assert.equal(C.cleanAskAnswer('{"nesto":1}'), '{"nesto":1}');
  assert.match(C.askAnswerPrompt({ question: 'q', today: '2026-10-01', results: [] }), /"odgovor"/);
});

test('pitaj posle pregleda: top i raspodela, zavrsene ponavljajuce, perMonth za duge periode, nepoznata kategorija', () => {
  const entries = [
    { id: 'k', type: 'expense', amount: 12000, date: '2026-09-01', category: 'Osiguranje', desc: 'Kasko', spreadMonths: 12 },
    { id: 'm', type: 'expense', amount: 5000, date: '2026-10-03', category: 'Hrana', desc: 'Maxi' }
  ];
  const recurring = [
    { id: 'r1', type: 'expense', desc: 'Netflix', amount: 1200, category: 'Zabava', frequency: 'monthly' },
    { id: 'r2', type: 'expense', desc: 'Rata', amount: 5000, category: 'Dug', frequency: 'monthly', until: '2025-01' },
    { id: 'r3', type: 'expense', desc: 'Osiguranje', amount: 12000, category: 'Osiguranje', frequency: 'yearly' },
    { id: 'r4', type: 'expense', desc: 'Grejanje', amount: 3000, category: 'Stanovanje', frequency: 'quarterly' }
  ];
  const run = calls => C.runAskTools(calls, { entries, recurring, today: '2026-10-01' });
  const top = run([{ tool: 'top', months: ['2026-10'], n: 5 }])[0].result;
  assert.deepEqual(top.map(t => [t.desc, t.uPeriodu]), [['Maxi', 5000], ['Kasko', 1000]]);
  assert.equal(top[1].amount, 12000);
  assert.equal(top[1].spreadMonths, 12);
  const rec = run([{ tool: 'recurring' }])[0].result;
  assert.deepEqual([rec.monthly, rec.items.length], [1200 + 1000 + 1000, 3]);   // rata zavrsena; godisnje/12, kvartalno/3
  const long = run([{ tool: 'byCategory', months: C.monthRange('2025-11', '2026-10') }])[0].result;
  assert.equal(long[0].perMonth, undefined);
  assert.ok(run([{ tool: 'byCategory', months: ['2026-09', '2026-10'] }])[0].result[0].perMonth);
  const plan = C.cleanAskPlan(JSON.stringify({ calls: [{ tool: 'top', months: ['2026-10'], category: 'hrana i piće' }, { tool: 'average', months: ['2026-10'], category: 'Hrana' }] }), { first: '2026-01', last: '2026-10', categories: ['Hrana'] });
  assert.equal(plan.calls.length, 1);
  assert.ok(plan.notes.some(n => /hrana i piće/.test(n)));
  assert.match(C.askPlanPrompt({ question: 'q', today: '2026-10-01', first: '2026-01', last: '2026-10', expenseCats: [], incomeCats: [] }), /prosek rashoda/);
  assert.match(C.askAnswerPrompt({ question: 'q', today: '2026-10-01', results: [] }), /uPeriodu/);
});

test('cene: decimalni zarez u kolicini i jedinice sa racuna (KG, KOM.)', () => {
  assert.deepEqual(C.parseItemQty('Banane (1,234 kg)'), { qty: 1.234, unit: 'kg' });
  assert.deepEqual(C.parseItemQty('Sir (0,250 kg)'), { qty: 0.25, unit: 'kg' });
  const hist = C.priceHistory([{ id: 'a', type: 'expense', receiptId: 'r1', date: '2026-09-01', desc: 'Maxi', items: ['Banane'], itemPrices: [160], itemQty: [{ qty: 1, unit: 'kg' }] }]);
  assert.equal(C.estimateShoppingItem({ name: 'Banane', qty: '1,250 kg' }, hist, '').amount, 200);
  assert.equal(C.estimateShoppingItem({ name: 'Banane', qty: '0,250 kg' }, hist, '').amount, 40);
  assert.equal(C.normUnit('KG'), 'kg');
  assert.equal(C.normUnit('KOM.'), 'kom');
  assert.equal(C.normUnit(' Lit '), 'l');
  assert.equal(C.normUnit('kutija'), '');
  const obs = C.priceObservations([{ id: 'b', type: 'expense', receiptId: 'r2', date: '2026-09-02', desc: 'Lidl', items: ['Banane', 'Jaja'], itemPrices: [200, 100], itemQty: [{ qty: 1.25, unit: 'KG' }, { qty: 2, unit: '<b>' }] }]);
  assert.deepEqual(obs.map(o => o.unit + ':' + o.unitPrice), ['kg:160', 'kom:100']);
  const rd = C.cleanReceiptReading(JSON.stringify({ store: 'X', date: '2026-09-02', total: 200, items: [{ name: 'Banane', qty: '1,234', unit: 'KG', price: 200 }] }), { categories: ['Hrana'] });
  assert.equal(rd.items[0].unit, 'kg'); assert.equal(rd.items[0].qty, 1.234);
});

test('cene: kolicina, opazanja, promena, najjeftinije, procena', () => {
  assert.deepEqual(C.parseItemQty('Mleko (2 kom)'), { qty: 2, unit: 'kom' });
  assert.deepEqual(C.parseItemQty('Banane (1,5 kg)'), { qty: 1.5, unit: 'kg' });
  assert.deepEqual(C.parseItemQty('Sir (500 g)'), { qty: 0.5, unit: 'kg' });
  assert.deepEqual(C.parseItemQty('Sok (750 ml)'), { qty: 0.75, unit: 'l' });
  assert.deepEqual(C.parseItemQty('Hleb'), { qty: 1, unit: 'kom' });
  const R = (id, date, store, items, prices, qty) => ({ id, type: 'expense', receiptId: 'R' + id, date, desc: store, amount: 1, category: 'Hrana', items, itemPrices: prices, ...(qty ? { itemQty: qty } : {}) });
  const entries = [
    R('1', '2026-07-01', 'Maxi', ['Mleko (2 kom)', 'Sir (500 g)', 'Razlika do ukupnog'], [238, 400, 12]),
    R('2', '2026-09-10', 'Lidl', ['Mleko'], [115], [{ qty: 1, unit: 'kom' }]),
    R('3', '2026-09-25', 'Maxi', ['Mleko (2 kom)', 'Sir (1 kg)', 'Hleb'], [258, 760, null]),
    { id: '4', type: 'expense', date: '2026-09-26', desc: 'Maxi', items: ['Mleko'], itemPrices: [999], amount: 999, category: 'Hrana' }   // bez receiptId -> ne racuna se
  ];
  const obs = C.priceObservations(entries);
  assert.deepEqual(obs.filter(o => o.key === 'mleko').map(o => [o.store, o.unitPrice]), [['Maxi', 119], ['Lidl', 115], ['Maxi', 129]]);
  assert.ok(!obs.some(o => /razlika/i.test(o.name) || o.name === 'Hleb'));
  assert.deepEqual(obs.filter(o => o.key === 'sir').map(o => [o.unit, o.unitPrice]), [['kg', 800], ['kg', 760]]);
  const hist = C.priceHistory(entries);
  const milk = C.priceInsight(hist.get('mleko'), '2026-10-01');
  assert.equal(milk.last.unitPrice, 129);
  assert.equal(milk.change.vs, 'store');
  assert.equal(milk.change.pct, 8);                    // 119 -> 129 u Maxiju
  assert.deepEqual([milk.cheapest.store, milk.cheapest.unitPrice], ['Lidl', 115]);
  const cheese = C.priceInsight(hist.get('sir'), '2026-10-01');
  assert.equal(cheese.change.pct, -5);
  assert.equal(cheese.cheapest, null);                 // jul je stariji od 90 dana
  const one = C.priceInsight(C.priceHistory([R('9', '2026-09-01', 'Maxi', ['Jaja'], [250])]).get('jaja'), '2026-10-01');
  assert.equal(one.change, null);
  assert.equal(one.cheapest, null);
  const small = C.priceInsight(C.priceHistory([R('a', '2026-09-01', 'Maxi', ['Jaja'], [250]), R('b', '2026-09-20', 'Maxi', ['Jaja'], [255])]).get('jaja'), '2026-10-01');
  assert.equal(small.change, null);                    // +2% je ispod praga
  // procena
  const est = it => C.estimateShoppingItem(it, hist, 'Maxi');
  assert.deepEqual(est({ name: 'Mleko', qty: '3 kom', store: 'Lidl' }), { amount: 345, source: 'store', unitPrice: 115, unit: 'kom' });
  assert.deepEqual(est({ name: 'Mleko', qty: '' }), { amount: 129, source: 'store', unitPrice: 129, unit: 'kom' });
  assert.deepEqual(est({ name: 'Sir', qty: '250 g' }), { amount: 190, source: 'store', unitPrice: 760, unit: 'kg' });
  assert.equal(est({ name: 'Sir', qty: '2 kom' }).amount, 760);   // jedinice se ne slazu -> cena reda
  assert.deepEqual(est({ name: 'Sapun', price: 150 }), { amount: 150, source: 'manual' });
  assert.deepEqual(est({ name: 'Nesto' }), { amount: 0, source: null });
  const e1 = C.shoppingEstimate([{ needed: true, price: 100, category: 'A' }]);
  assert.deepEqual([e1.total, e1.unpriced], [100, 0]);
  const e2 = C.shoppingEstimate([{ needed: true, name: 'Mleko', qty: '2 kom', category: 'A' }, { needed: true, name: 'X', category: 'A' }], { history: hist, preferredStore: 'Maxi' });
  assert.deepEqual([e2.total, e2.unpriced, e2.fromReceipts], [258, 1, 1]);
});
// ---- Ispravke D: dokumenti, Pitaj ----
test('cleanDocuments: remindDays null/prazno -> 30, 0 ostaje 0', () => {
  const base = { id: 'd1', title: 'X', kind: 'dokument' };
  assert.equal(C.cleanDocuments([Object.assign({}, base, { remindDays: null })])[0].remindDays, 30);
  assert.equal(C.cleanDocuments([Object.assign({}, base, { remindDays: '' })])[0].remindDays, 30);
  assert.equal(C.cleanDocuments([Object.assign({}, base, { remindDays: '  ' })])[0].remindDays, 30);
  assert.equal(C.cleanDocuments([Object.assign({}, base, { remindDays: false })])[0].remindDays, 30);
  assert.equal(C.cleanDocuments([base])[0].remindDays, 30);
  assert.equal(C.cleanDocuments([Object.assign({}, base, { remindDays: 0 })])[0].remindDays, 0);
  assert.equal(C.cleanDocuments([Object.assign({}, base, { remindDays: '7' })])[0].remindDays, 7);
});
test('checkDataFileShape: budzet-dokumenti-v1 mora biti niz', () => {
  assert.deepEqual(C.checkDataFileShape({ 'budzet-stavke-v2': [], 'budzet-dokumenti-v1': {} }).problems, ['budzet-dokumenti-v1']);
  assert.equal(C.checkDataFileShape({ 'budzet-stavke-v2': [], 'budzet-dokumenti-v1': '[]' }).ok, true);
});
test('askMonthRange: raspodeljene stavke sire opseg meseci', () => {
  const es = [
    ex('a', '2026-03-10', 100, 'A', 'x'),
    ex('b', '2026-05-01', 1200, 'A', 'osiguranje', { spreadMonths: 12 }),            // 2026-05 .. 2027-04
    ex('c', '2026-04-01', 300, 'A', 'plata unapred', { spreadMonths: 3, spreadStart: '2026-01' }), // 2026-01 .. 2026-03
    { id: 't', type: 'transfer', date: '2025-01-01', amount: 5 }
  ];
  assert.deepEqual(C.askMonthRange(es, '2026-10'), { first: '2026-01', last: '2027-04' });
  assert.deepEqual(C.askMonthRange([ex('a', '2026-03-10', 100, 'A', 'x')], '2026-10'), { first: '2026-03', last: '2026-10' });
  assert.deepEqual(C.askMonthRange([], '2026-10'), { first: '2026-10', last: '2026-10' });
});
test('askAnswerPrompt: jezik odgovora prati jezik aplikacije', () => {
  const sr = C.askAnswerPrompt({ question: 'q', today: '2026-10-01', results: [] });
  assert.match(sr, /na srpskom/);
  const en = C.askAnswerPrompt({ question: 'q', today: '2026-10-01', results: [], lang: 'en' });
  assert.match(en, /in English/);
  assert.doesNotMatch(en, /na srpskom/);
});
// ---------- Ispravke: racun iz prodavnice i pracenje cena ----------
test('cleanReceiptReading: popust sa pozitivnom cenom postaje negativan', () => {
  const r = C.cleanReceiptReading(JSON.stringify({ items: [{ name: 'Mleko', price: 100 }, { raw: 'POPUST', price: '15,00', discount: true }] }), { categories: [] });
  assert.equal(r.items[1].discount, true);
  assert.equal(r.items[1].price, -15);
  assert.deepEqual(C.applyReceiptDiscounts(r.items).map(x => [x.name, x.price]), [['Mleko', 85]]);
});
test('receiptToExpenses: negativna upisana cena je popust, ne ide u itemPrices', () => {
  const it = (name, price, category) => ({ name, qty: 1, unit: '', price, category, discount: false });
  const rows = C.receiptToExpenses([it('A', 100, 'Hrana'), it('Popust', -20, 'Hrana'), it('B', 50, 'Hrana')], null);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, 130);
  assert.deepEqual(rows[0].itemPrices, [80, 50]);
  assert.deepEqual(rows[0].items.map(i => i.name), ['A', 'B']);
});
test('canonicalItemName: red razlike se cuva na srpskom', () => {
  assert.equal(C.canonicalItemName('Difference to total'), 'Razlika do ukupnog');
  assert.equal(C.canonicalItemName('  razlika do ukupnog '), 'Razlika do ukupnog');
  assert.equal(C.canonicalItemName('Mleko'), 'Mleko');
});
test('estimateShoppingItem vraca jedinicu posmatranja koje je koristio', () => {
  const R = (id, date, store, items, prices, qty) => ({ id, type: 'expense', receiptId: 'r' + id, date, desc: store, amount: 1, category: 'Hrana', items, itemPrices: prices, itemQty: qty });
  const hist = C.priceHistory([R('1', '2026-09-01', 'Maxi', ['Sir'], [800], [{ qty: 1, unit: 'kg' }]), R('2', '2026-09-20', 'Lidl', ['Sir'], [300], [{ qty: 1, unit: 'kom' }])]);
  const e = C.estimateShoppingItem({ name: 'Sir', store: 'Maxi' }, hist, '');
  assert.equal(e.unit, 'kg');
  assert.equal(e.unitPrice, 800);
  assert.equal(C.estimateShoppingItem({ name: 'Sir' }, hist, '').unit, 'kom');
});
test('itemKey / purchasedItemName skidaju sve zagrade sa kolicinom na kraju', () => {
  assert.equal(C.itemKey('Mleko (2 kom) (2 kom)'), 'mleko');
  assert.equal(C.purchasedItemName('Mleko (2 kom) (1 l)'), 'Mleko');
  assert.equal(C.purchasedItemName('Hleb (crni) (2 kom)'), 'Hleb (crni)');
});
test('preimenovana stavka liste zadrzava istoriju kupovina (aliases)', () => {
  const buy = (id, date, items) => ({ id, type: 'expense', date, amount: 100, category: 'Hrana', desc: 'x', items, itemPrices: items.map(() => 100) });
  const entries = [buy('1', '2026-09-01', ['Mleko']), buy('2', '2026-09-08', ['Mleko (2 kom)']), buy('3', '2026-09-15', ['Mleko 2,8%'])];
  const shopping = { items: [{ id: 'm', name: 'Mleko 2,8%', aliases: ['Mleko'], needed: false }] };
  const r = C.restockSuggestions(entries, shopping, '2026-09-29');
  assert.deepEqual(r, [{ name: 'Mleko 2,8%', key: 'mleko 2,8%', intervalDays: 7, daysSince: 14, itemId: 'm' }]);
  const s = C.purchasedItemStats(entries, null, null, shopping.items);
  assert.deepEqual(s.map(x => [x.name, x.count]), [['Mleko 2,8%', 3]]);
  // nova stavka sa starim imenom ima prednost nad aliasom
  const two = { items: shopping.items.concat([{ id: 'n', name: 'Mleko', needed: false }]) };
  assert.equal(C.purchasedItemStats(entries, null, null, two.items).length, 2);
  // procena po ceni sa racuna i za staro ime
  const R = (id, date, items, prices) => ({ id, type: 'expense', receiptId: 'r' + id, date, desc: 'Maxi', amount: 1, category: 'Hrana', items, itemPrices: prices });
  const hist = C.priceHistory([R('a', '2026-09-01', ['Mleko'], [120])]);
  assert.equal(C.estimateShoppingItem(shopping.items[0], hist, '').amount, 120);
  assert.equal(C.itemPriceHistory(shopping.items[0], hist).obs.length, 1);
  // kopija cuva aliase
  const n = C.normalizeShopping({ items: [{ id: 'm', name: 'Mleko 2,8%', aliases: ['Mleko', 'mleko', '', 5, 'Mleko 2,8%'] }] }, () => 'x');
  assert.deepEqual(n.items[0].aliases, ['Mleko']);
  assert.equal('aliases' in C.normalizeShopping({ items: [{ id: 'z', name: 'Z' }] }, () => 'x').items[0], false);
});
test('Cene: preimenovana stavka liste spaja istoriju cena starog i novog imena', () => {
  const R = (id, date, items, prices) => ({ id, type: 'expense', receiptId: 'r' + id, date, desc: 'Maxi', amount: 1, category: 'Hrana', items, itemPrices: prices });
  const hist = C.priceHistory([R('a', '2026-09-01', ['Mleko'], [120]), R('b', '2026-09-10', ['Mleko 2,8%'], [130]), R('c', '2026-09-12', ['Hleb'], [80])]);
  assert.equal(hist.size, 3);
  const items = [{ id: 'm', name: 'Mleko 2,8%', aliases: ['Mleko'] }];
  const merged = C.mergePriceHistoryAliases(hist, items);
  assert.deepEqual([...merged.keys()].sort(), ['hleb', 'mleko 2,8%']);
  const m = merged.get('mleko 2,8%');
  assert.equal(m.name, 'Mleko 2,8%');
  assert.deepEqual(m.obs.map(o => o.total), [120, 130]);
  assert.equal(hist.size, 3, 'ulazna mapa se ne menja');
  // samo staro ime ima cene -> prikazuje se pod novim imenom
  const old = C.mergePriceHistoryAliases(C.priceHistory([R('a', '2026-09-01', ['Mleko'], [120])]), items);
  assert.deepEqual([...old.keys()], ['mleko 2,8%']);
  assert.equal(old.get('mleko 2,8%').name, 'Mleko 2,8%');
  // stavka koja se bas tako zove ima prednost nad aliasom
  const two = C.mergePriceHistoryAliases(hist, items.concat([{ id: 'n', name: 'Mleko' }]));
  assert.deepEqual([...two.keys()].sort(), ['hleb', 'mleko', 'mleko 2,8%']);
  assert.equal(two.get('mleko 2,8%').obs.length, 1);
  // bez stavki liste: ista mapa
  assert.equal(C.mergePriceHistoryAliases(hist, []).size, 3);
});
test('pruneDismissed: izbacuje sakrivanja posle novije kupovine i za stvari koje vise nisu kupljene', () => {
  const buy = (id, date, items) => ({ id, type: 'expense', date, amount: 100, category: 'Hrana', desc: 'x', items });
  const entries = [buy('1', '2026-09-01', ['Sok']), buy('2', '2026-09-10', ['Hleb']), buy('3', '2026-09-20', ['Hleb'])];
  const shopping = { items: [], dismissed: { sok: '2026-09-01', hleb: '2026-09-10', kafa: '2026-08-01' } };
  assert.deepEqual(C.pruneDismissed(entries, shopping), { sok: '2026-09-01' });
  assert.equal(C.lastPurchaseDates(entries, shopping).get('hleb'), '2026-09-20');
});
test('i18n: jedinice i "danas" na engleskom', () => {
  const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
  const ctx = { localStorage: { getItem: () => 'en' } };
  ctx.self = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../i18n.js'), 'utf8'), ctx);
  const t = ctx.I18N.t;
  assert.equal(t('kom'), 'pcs');
  assert.equal(t('pak'), 'pack');
  assert.equal(t('najjeftinije: {0} {1} (danas)', 'Lidl', '10 RSD/pcs'), 'cheapest: Lidl 10 RSD/pcs (today)');
});
test('i18n: svaki kljuc recnika se koristi u izvornom kodu', () => {
  const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
  const ROOT = path.join(__dirname, '../..');
  const ctx = { localStorage: { getItem: () => 'sr' } };
  ctx.self = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8'), ctx);
  const files = ['budzet-tracker.html', 'app/quick-add.html', 'budzet-core.js', 'app/main.js', 'app/bills.js', 'app/telegram.js', 'app/preload.js'];
  const src = files.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  const norm = s => s.replace(/\s+/g, ' ');
  const decode = s => s.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, '\u00a0').replace(/&amp;/g, '&')
    .replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
  const hay = [src, norm(src), decode(src), norm(decode(src))];
  const unused = Object.keys(ctx.I18N.EN).filter(k => !hay.some(h => h.includes(k) || h.includes(norm(k).trim())));
  assert.deepEqual(unused, []);
});
test('billCurrencyMismatch: valuta procitana sa racuna (AI ili QR) razlicita od valute lokacije', () => {
  const eur = C.cleanBillReading({ locationId: 'L1', billTypeId: 'T1', month: '2025-01', amount: 40, currency: 'eur' }, BILL_CTX);
  assert.equal(C.billCurrencyMismatch(eur, 'RSD'), 'EUR');
  assert.equal(C.billCurrencyMismatch(eur, 'EUR'), '');
  // AI nije procitao valutu -> uzeta je valuta lokacije, nema upozorenja
  const none = C.cleanBillReading({ locationId: 'L2', billTypeId: 'T2', month: '2025-01', amount: 40 }, BILL_CTX);
  assert.equal(none.currency, 'BAM');
  assert.equal(C.billCurrencyMismatch(none, 'RSD'), '');
  // QR sa iznosom u RSD za lokaciju u BAM
  const qr = { account: '160000000000000111', name: 'JP EPS', amount: 100, currency: 'RSD', code: '189' };
  assert.equal(C.billCurrencyMismatch(C.mergeBillQr(none, qr), 'BAM'), 'RSD');
  assert.equal(C.billCurrencyMismatch(C.mergeBillQr(null, null), 'BAM'), '');
  assert.equal(C.billCurrencyMismatch(null, 'RSD'), '');
});

test('payeeWithBillReference: poziv na broj sa racuna ovog meseca ide u IPS placanje', () => {
  const rec = { account: '160000000000000111', name: 'JP EPS', code: '189', purpose: 'Struja', model: '', reference: '' };
  const withRef = C.payeeWithBillReference(rec, { account: '160-0000000000001-11', name: 'EPS', model: '97', reference: '1234567890' });
  assert.deepEqual(withRef, Object.assign({}, rec, { model: '97', reference: '1234567890' }));
  // racun bez racuna primaoca (AI) — poziv na broj se i dalje koristi
  assert.equal(C.payeeWithBillReference(rec, { name: 'EPS', reference: '55' }).reference, '55');
  // drugi primalac -> ne mesa se
  assert.deepEqual(C.payeeWithBillReference(rec, { account: '845000000040484987', reference: '99' }), rec);
  // bez poziva na broj na racunu ostaje kako jeste
  assert.deepEqual(C.payeeWithBillReference(rec, { account: rec.account, reference: '' }), rec);
  assert.deepEqual(C.payeeWithBillReference(rec, null), rec);
  // AI ne cita model: model ponavljajuce stavke ostaje kad ga racun nema
  assert.equal(C.payeeWithBillReference(Object.assign({}, rec, { model: '97' }), { account: rec.account, reference: '12345' }).model, '97');
  assert.equal(C.payeeWithBillReference(null, { reference: '1' }), null);
});

test('findRecurringByPayee: postojeca ponavljajuca za istog primaoca (racun + naziv ili poziv na broj)', () => {
  const recurring = [
    { id: 'R1', type: 'expense', desc: 'Infostan', payee: { account: '845000000040484987', name: 'JKP Infostan, Beograd', reference: '111' } },
    { id: 'R2', type: 'expense', desc: 'Struja', payee: { account: '160000000000000111', name: 'JP EPS', reference: '' } },
    { id: 'R3', type: 'income', desc: 'X', payee: { account: '170000000000000222', name: 'Y' } }
  ];
  // isti naziv, ali oba imaju poziv na broj i on se razlikuje (npr. drugi stan) -> nije ista stavka
  assert.equal(C.findRecurringByPayee(recurring, { account: '845-0000000404849-87', name: 'jkp infostan, beograd', reference: '222' }), null);
  // isti naziv, a jedna strana nema poziv na broj -> ista stavka
  assert.equal(C.findRecurringByPayee(recurring, { account: '845-0000000404849-87', name: 'jkp infostan, beograd' }).id, 'R1');
  assert.equal(C.findRecurringByPayee(recurring, { account: '160000000000000111', name: 'JP EPS', reference: '555' }).id, 'R2');
  assert.equal(C.findRecurringByPayee(recurring, { account: '845000000040484987', name: 'Drugi naziv', reference: '111' }).id, 'R1');
  // isti racun primaoca (npr. zajednicki racun), drugi naziv i drugi poziv na broj -> nije ista stavka
  assert.equal(C.findRecurringByPayee(recurring, { account: '845000000040484987', name: 'Neko drugi', reference: '333' }), null);
  assert.equal(C.findRecurringByPayee(recurring, { account: '170000000000000222', name: 'Y' }), null); // samo rashodi
  assert.equal(C.findRecurringByPayee(recurring, null), null);
  assert.equal(C.findRecurringByPayee(recurring, { account: '', name: 'JP EPS' }), null);
});

test('telegram: namera, nacrt unosa (prihod, pravila, istorija), vrsta slike, dugme, cekanje', () => {
  assert.deepEqual(C.telegramIntent('/pomoc'), { kind: 'command', command: 'pomoc' });
  assert.deepEqual(C.telegramIntent('/start'), { kind: 'command', command: 'pomoc' });
  assert.deepEqual(C.telegramIntent('/ponisti@knjiga_bot'), { kind: 'command', command: 'ponisti' });
  assert.deepEqual(C.telegramIntent('/xyz'), { kind: 'command', command: 'nepoznata' });
  assert.deepEqual(C.telegramIntent('   '), { kind: 'empty' });
  assert.deepEqual(C.telegramIntent('kafa 250'), { kind: 'question' });
  assert.deepEqual(C.telegramIntent('/nov kafa 250'), { kind: 'command', command: 'nov', rest: 'kafa 250' });
  assert.deepEqual(C.telegramIntent('/nov@knjiga_bot +plata 1000'), { kind: 'command', command: 'nov', rest: '+plata 1000' });
  assert.deepEqual(C.telegramIntent('/nov'), { kind: 'command', command: 'nov', rest: '' });
  assert.deepEqual(C.parseTelegramCallback('c:abc123'), { action: 'c', id: 'abc123', arg: '' });
  assert.deepEqual(C.parseTelegramCallback('n:abc123'), { action: 'n', id: 'abc123', arg: '' });
  assert.deepEqual(C.parseTelegramCallback('h:abc123:2'), { action: 'h', id: 'abc123', arg: '2' });
  const ctx = { today: '2026-10-01', accounts: [{ id: 'a1', name: 'Visa', type: 'tekuci' }], currencies: ['EUR'],
    rules: [{ keyword: 'gorivo', category: 'Auto' }, { keyword: 'gor', category: 'Ostalo' }],
    history: [{ type: 'expense', desc: 'kafa', category: 'Kafići' }], expenseCats: ['Hrana', 'Auto', 'Kafići', 'Ostalo'], incomeCats: ['Plata', 'Ostali prihodi'] };
  assert.deepEqual(C.telegramEntryDraft('kafa 250', ctx), { type: 'expense', desc: 'kafa', amount: 250, currency: null, date: '2026-10-01', accountId: null, category: 'Kafići' });
  const g = C.telegramEntryDraft('gorivo 6000 juče', ctx);
  assert.deepEqual([g.category, g.date, g.amount], ['Auto', '2026-09-30', 6000]);
  assert.equal(C.telegramEntryDraft('plata 120000', ctx).type, 'income');
  assert.equal(C.telegramEntryDraft('+ honorar 30000', ctx).type, 'income');
  assert.equal(C.telegramEntryDraft('hleb 80', ctx).category, null);
  assert.deepEqual(C.telegramEntryDraft('kafa', ctx), { error: 'noamount' });
  assert.deepEqual(C.telegramEntryDraft('250', ctx), { error: 'nodesc' });
  assert.equal(C.photoKindFromCaption('Struja septembar'), 'bill');
  assert.equal(C.photoKindFromCaption('račun za infostan'), 'bill');
  assert.equal(C.photoKindFromCaption('uplatnica vrtić'), 'slip');
  assert.equal(C.photoKindFromCaption('MAXI'), 'receipt');
  assert.equal(C.photoKindFromCaption('Idea'), 'receipt');
  assert.equal(C.photoKindFromCaption('ideja za poklon'), null);
  assert.equal(C.photoKindFromCaption(''), null);
  assert.deepEqual(C.parseTelegramCallback('k:abc123:receipt'), { action: 'k', id: 'abc123', arg: 'receipt' });
  assert.deepEqual(C.parseTelegramCallback('s:abc123'), { action: 's', id: 'abc123', arg: '' });
  assert.equal(C.parseTelegramCallback('z:abc'), null);
  assert.equal(C.parseTelegramCallback('s:../x'), null);
  const day = 864e5, now = 30 * day;
  const r = C.cleanTelegramPending([{ id: 'a', created: now - 8 * day, kind: 'receipt' }, { id: 'b', created: now - day, kind: 'bill' }, null, { id: 'c' }], now);
  assert.deepEqual(r.keep.map(p => p.id), ['b']);
  assert.deepEqual(r.expired.map(p => p.id), ['a']);
});

test('telegram: rec prihoda je prihod samo kad je opis ceo prihod (plata za majstora = rashod)', () => {
  const ctx = { today: '2026-10-01', accounts: [], currencies: ['EUR'], expenseCats: ['Hrana', 'Ostalo'], incomeCats: ['Plata', 'Ostali prihodi'] };
  const ty = s => C.telegramEntryDraft(s, ctx).type;
  assert.equal(ty('plata 120000'), 'income');
  assert.equal(ty('plata za majstora 5000'), 'expense');
  assert.equal(ty('+honorar 300'), 'income');
  assert.equal(ty('+plata za majstora 300'), 'income');             // + uvek znaci prihod
  assert.equal(ty('plata septembar 120000'), 'income');
  assert.equal(ty('plata za septembar 120000'), 'income');
  assert.equal(ty('Plata za oktobar 120000'), 'income');
  assert.equal(ty('honorar Marko 30000'), 'income');
  assert.equal(ty('honorar za račun 2000'), 'expense');
  assert.equal(ty('bonus za popravku 3000'), 'expense');
  assert.equal(ty('plata majstoru 4000'), 'expense');
  assert.equal(ty('kafa 250'), 'expense');
});

test('telegram: grupa — unos samo uz iznos od 2+ cifre i opis; obicno caskanje nije unos', () => {
  const ctx = { today: '2026-10-01', accounts: [], currencies: ['EUR'], expenseCats: ['Hrana'], incomeCats: ['Plata'] };
  const g = s => C.telegramEntryDraft(s, Object.assign({}, ctx, { group: true }));
  assert.equal(g('vidimo se u 8').error, 'chat');
  assert.equal(g('kafa 8').error, 'chat');
  assert.equal(g('? 50').error, 'chat');
  assert.ok(g('250').error);
  assert.deepEqual([g('kafa 250').type, g('kafa 250').amount], ['expense', 250]);
  assert.deepEqual([g('hleb 80').desc, g('hleb 80').amount], ['hleb', 80]);
  // privatni chat: kao ranije
  assert.equal(C.telegramEntryDraft('vidimo se u 8', ctx).amount, 8);
  assert.equal(C.telegramEntryDraft('kafa 8', ctx).amount, 8);
});

test('telegram: podesavanja jasno objasnjavaju 409 (isti bot na drugom racunaru), sa prevodom', () => {
  const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '../../budzet-tracker.html'), 'utf8');
  const m = /conflict: \(\)=> t\('([^']+)'\)/.exec(html);
  assert.ok(m, 'TG_STATE.conflict nije nadjen');
  assert.match(m[1], /^Isti bot radi na drugom računaru — ugasi ga tamo/);
  const ctx = { localStorage: { getItem: () => 'en' } };
  ctx.self = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../i18n.js'), 'utf8'), ctx);
  assert.notEqual(ctx.I18N.t(m[1]), m[1]);
});

test('cleanReceiptReading: ukupno manje od pola zbira stavki (procitan PDV) -> zbir stavki, oznaceno za proveru', () => {
  const items = [{ name: 'Kafa', price: 149.99 }, { name: 'Kafa', price: 149.99 }, { name: 'Kesa', price: 10 }, { name: 'Piletina', price: 271.8 }, { name: 'Sir', price: 1464.5 }];
  const r = C.cleanReceiptReading(JSON.stringify({ store: 'Borjak', date: '2026-10-03', total: 318.32, items }), { categories: ['Hrana'] });
  assert.equal(r.total, 2046.28);
  assert.ok(r.low.includes('total'));
  // popust od 30% ostaje: ukupno nije manje od pola zbira
  const d = C.cleanReceiptReading(JSON.stringify({ total: 700, items: [{ name: 'Jakna', price: 1000 }] }), { categories: [] });
  assert.equal(d.total, 700);
  assert.ok(!d.low.includes('total'));
  // deo dugackog racuna bez ukupnog ostaje bez ukupnog
  assert.equal(C.cleanReceiptReading(JSON.stringify({ total: null, items }), { categories: [] }).total, null);
  // uputstvo AI-ju: ukupno nije iznos poreza
  assert.match(C.receiptPrompt(['Hrana']), /poreza/);
});

test('cleanReceiptReading: redovi PDV rekapitulacije (stopa 10/20%, PDV, porez) nisu stavke', () => {
  const r = C.cleanReceiptReading(JSON.stringify({ store: 'Borjak', total: 318.32, items: [
    { raw: 'Ђ 10.00% 272.73 27.27', name: 'Porez', price: 27.27 },
    { raw: 'Е 20.00% 1455.23 291.05', name: 'Porez', price: 291.05 },
    { raw: 'PDV ukupno', name: 'PDV', price: 318.32 },
    { raw: 'MLEKO 2.8% 1L', name: 'Mleko 2.8%', price: 139.99 },
    { raw: 'JOGURT 20% MM', name: 'Jogurt', price: 99.99 }
  ] }), { categories: [] });
  assert.deepEqual(r.items.map(i => i.name), ['Mleko 2.8%', 'Jogurt']);
  assert.match(C.receiptPrompt([]), /20\.00%/);
});

// Izmisljen racun u obliku stranice Poreske uprave (suf.purs.gov.rs) — pravi racuni korisnika ne idu u repozitorijum
const SUF_HTML = [
  '<script>viewModel = new ViewModel(); ko.applyBindings(viewModel);',
  "viewModel.InvoiceNumber('ABCD1234-EFGH5678-100'); viewModel.Token('11111111-2222-3333-4444-555555555555');</script>",
  '<span id="shopFullNameLabel">1234567-PRODAVNICA PRIMER</span>',
  '<span id="addressLabel">&#x421;&#x420;&#x415;&#x40B;&#x41D;&#x410; 1</span>',
  '<span id="tinLabel">100000001</span>',
  '<span id="totalAmountLabel">\n   1.249,98\n</span>',
  '<span id="invoiceNumberLabel">\n ABCD1234-EFGH5678-100\n</span>',
  '<span id="sdcDateTimeLabel">\n 7.9.2026. 09:05:01\n</span>',
  '<pre style="font-family:monospace">============ ФИСКАЛНИ РАЧУН ============',
  'Артикли',
  '========================================',
  'Назив   Цена         Кол.         Укупно',
  'MLEKO SVEZE 2.8% 1L (Е)/kom (Е)        ',
  '       129,99          2          259,98',
  'SIR GAUDA NAREZAK (Ђ)/kg  (Ђ)          ',
  '     1.100,00      0,900          990,00',
  '----------------------------------------',
  'Укупан износ:                   1.249,98',
  '</pre>'
].join('\n');
const SUF_SPEC = { success: true, items: [
  { gtin: '', name: 'MLEKO SVEZE 2.8% 1L (\u0415)/kom', quantity: 2, total: 259.98, unitPrice: 129.99, label: '\u0415', labelRate: 10 },
  { gtin: '', name: 'SIR GAUDA NAREZAK (\u0402)/kg ', quantity: 0.9, total: 990, unitPrice: 1100, label: '\u0402', labelRate: 20 }
] };
test('fiskalni racun: link iz teksta, stranica, stavke iz JSON-a i iz zurnala, citanje kao od AI-ja', () => {
  const url = 'https://suf.purs.gov.rs/v/?vl=AzVIU1ZW%2BABC%3D';
  assert.equal(C.fiscalUrlFrom('evo racuna ' + url + ' hvala'), url);
  assert.equal(C.fiscalUrlFrom('http://suf.purs.gov.rs/v/?vl=X'), null);
  assert.equal(C.fiscalUrlFrom('https://suf.purs.gov.rs.evil.com/v/?vl=X'), null);
  assert.equal(C.fiscalUrlFrom('kafa 250'), null);
  const page = C.parseSufPage(SUF_HTML);
  assert.deepEqual({ store: page.store, date: page.date, total: page.total, invoiceNumber: page.invoiceNumber, token: page.token },
    { store: 'Prodavnica primer', date: '2026-09-07', total: 1249.98, invoiceNumber: 'ABCD1234-EFGH5678-100', token: '11111111-2222-3333-4444-555555555555' });
  const fromSpec = C.sufItems(SUF_SPEC);
  assert.deepEqual(fromSpec.map(i => [i.name, i.qty, i.unit, i.price]), [['Mleko sveze 2.8% 1l', 2, 'kom', 259.98], ['Sir gauda narezak', 0.9, 'kg', 990]]);
  const fromJournal = C.sufJournalItems(page.journal);
  assert.deepEqual(fromJournal.map(i => [i.name, i.qty, i.unit, i.price]), fromSpec.map(i => [i.name, i.qty, i.unit, i.price]));
  const r = C.sufReading(page, fromSpec);
  assert.equal(r.store, 'Prodavnica primer'); assert.equal(r.total, 1249.98); assert.equal(r.items.length, 2);
  assert.equal(r.items[0].category, ''); assert.deepEqual(r.low, []);
  assert.equal(r.source, 'fiscal');
  assert.equal(C.sufItems({ success: false }), null);
  // kategorije: AI dobija samo nazive
  const prompt = C.receiptCategoryPrompt(['Hrana', 'Higijena'], ['Mleko', 'Sapun']);
  assert.match(prompt, /Mleko/); assert.doesNotMatch(prompt, /259/);
  assert.deepEqual(C.cleanReceiptCategories('{"kategorije":["hrana","Nepostoji"]}', ['Hrana', 'Higijena'], 2), ['Hrana', '']);
  assert.deepEqual(C.cleanReceiptCategories('nije json', ['Hrana'], 2), ['', '']);
});

test('prognoza: stanje po danu, ponavljajuce (placeno/preskoceno/upisano), dospelo danas, kvartalno, cilj, plata, minus', () => {
  const rec = [
    { id: 'plata', type: 'income', desc: 'Plata', amount: 100000, day: 20 },
    { id: 'honorar', type: 'income', desc: 'Honorar', amount: 5000, day: 5 },
    { id: 'kirija', type: 'expense', desc: 'Kirija', amount: 40000, day: 1 },
    { id: 'struja', type: 'expense', desc: 'Struja', amount: 6000, day: 15 },
    { id: 'osig', type: 'expense', desc: 'Osiguranje', amount: 12000, day: 10, frequency: 'quarterly', anchorMonth: 1 },
    { id: 'god', type: 'expense', desc: 'Registracija', amount: 30000, day: 3, frequency: 'yearly', anchorMonth: 3 },
    { id: 'staro', type: 'expense', desc: 'Telefon', amount: 2000, day: 2, until: '2026-09' }
  ];
  const base = { today: '2026-10-04', days: 60, startBalance: 50000, recurring: rec, entries: [], applied: { '2026-10': ['kirija'] }, skipped: { '2026-11': ['struja'] }, goals: [], dailySpend: 0 };
  const f = C.cashForecast(base);
  assert.equal(f.points.length, 61);
  assert.deepEqual(f.points[0], { date: '2026-10-04', balance: 50000 });
  const ev = f.events.map(e => e.date + ' ' + e.desc + ' ' + e.amount);
  assert.ok(ev.includes('2026-10-05 Honorar 5000'));
  assert.ok(!ev.some(e => /2026-10-01 Kirija/.test(e)));          // placeno
  assert.ok(ev.includes('2026-11-01 Kirija -40000'));
  assert.ok(ev.includes('2026-10-15 Struja -6000'));
  assert.ok(!ev.some(e => /2026-11-15 Struja/.test(e)));          // preskoceno
  assert.ok(ev.includes('2026-10-10 Osiguranje -12000'));         // kvartalno: jan/apr/jul/okt
  assert.ok(!ev.some(e => /Registracija|Telefon/.test(e)));       // godisnje u martu; zavrseno
  assert.deepEqual(f.payday, { date: '2026-10-20', amount: 100000, source: 'recurring', desc: 'Plata' });
  assert.deepEqual(f.beforePayday, { date: '2026-10-19', balance: 37000 }); // 50000 + 5000 - 12000 - 6000
  assert.equal(f.daily, Math.round(37000 / 16 * 100) / 100);       // 16 dana: 4. do 19.
  // vec upisano: rec-<id>-<mesec> se ne racuna ponovo; neplacen upisan rashod iz proslosti ide danas
  const g = C.cashForecast(Object.assign({}, base, { entries: [
    { id: 'rec-struja-2026-10', type: 'expense', amount: 6000, date: '2026-10-15', paid: false },
    { id: 'x1', type: 'expense', desc: 'Servis', amount: 3000, date: '2026-09-28', paid: false },
    { id: 'x2', type: 'income', desc: 'Povracaj', amount: 700, date: '2026-10-12' },
    { id: 'x3', type: 'expense', desc: 'Kafa', amount: 200, date: '2026-10-03' }
  ] }));
  const gev = g.events.map(e => e.date + ' ' + e.desc + ' ' + e.amount);
  assert.ok(gev.includes('2026-10-04 Servis -3000'));
  assert.ok(gev.includes('2026-10-12 Povracaj 700'));
  assert.equal(gev.filter(e => /2026-10-15/.test(e)).length, 1);   // upisana struja, ne i ponavljajuca
  assert.ok(!gev.some(e => /Kafa/.test(e)));                       // placeno u proslosti je vec u stanju
  // svakodnevna potrosnja i prvi minus
  const m = C.cashForecast(Object.assign({}, base, { startBalance: 10000, dailySpend: 1000 }));
  assert.equal(m.points[1].balance, 14000);                        // 10000 + 5000 honorar - 1000
  assert.equal(m.firstNegative.date, '2026-10-10');                 // 14000 -1000*5 -12000 = -3000 na 10.
  assert.ok(m.lowest.balance <= m.firstNegative.balance);
  assert.equal(C.cashForecast(Object.assign({}, base, { startBalance: 1000, recurring: rec.filter(r => r.id !== 'honorar') })).daily, 0);
  // rucna plata: zamenjuje najveci ponavljajuci prihod do svog datuma (bez duplog racunanja)
  const r = C.cashForecast(Object.assign({}, base, { payday: { date: '2026-10-25', amount: 90000 } }));
  assert.deepEqual(r.payday, { date: '2026-10-25', amount: 90000, source: 'manual', desc: '' });
  assert.ok(!r.events.some(e => e.date === '2026-10-20'));
  assert.ok(r.events.some(e => e.date === '2026-11-20' && e.amount === 100000));
  assert.ok(r.events.some(e => e.date === '2026-10-25' && e.amount === 90000 && e.kind === 'payday'));
  // rucna plata koja je prosla se ne koristi
  assert.equal(C.cashForecast(Object.assign({}, base, { payday: { date: '2026-10-01', amount: 1 } })).payday.source, 'recurring');
  // cilj: mesecna uplata dok se ne ispuni
  const c = C.cashForecast(Object.assign({}, base, { recurring: [], goals: [{ id: 'g', target: 15000, current: 5000, monthly: { amount: 6000, day: 10, since: '2026-09', last: '2026-09' } }] }));
  assert.deepEqual(c.events.map(e => [e.date, e.amount, e.kind]), [['2026-10-10', -6000, 'goal'], ['2026-11-10', -4000, 'goal']]);
  // bez ponavljajucih i bez plate
  const e0 = C.cashForecast({ today: '2026-10-04', startBalance: 0, recurring: [], entries: [], goals: [] });
  assert.equal(e0.payday, null); assert.equal(e0.daily, null); assert.equal(e0.firstNegative, null); assert.equal(e0.points.length, 61);
});

test('prognoza: rashod sa buducim datumom ulazi i kad je oznacen kao placen', () => {
  const f = C.cashForecast({ today: '2026-10-04', startBalance: 1000, recurring: [], goals: [], entries: [{ id: 'a', type: 'expense', desc: 'Avans', amount: 300, date: '2026-10-20' }] });
  assert.ok(f.events.some(e => e.date === '2026-10-20' && e.amount === -300));
});

test('prognoza: ponavljajuci rashod vec upisan rucno u tekucem mesecu (isti naziv ili kategorija i iznos +-10%) se ne racuna ponovo', () => {
  const rec = [{ id: 'k', type: 'expense', desc: 'Kirija', amount: 45000, category: 'Stan', day: 1 }, { id: 's', type: 'expense', desc: 'Struja', amount: 7000, category: 'Režije', day: 2 },
    { id: 'i', type: 'expense', desc: 'Internet', amount: 3500, category: 'Režije', day: 3 }];
  const entries = [
    { id: 'a', type: 'expense', desc: 'kirija oktobar', amount: 45000, category: 'Stan', date: '2026-10-02' },  // isti naziv (pocetak)
    { id: 'b', type: 'expense', desc: 'EPS', amount: 7300, category: 'Režije', date: '2026-10-03' },            // ista kategorija, iznos +-10%
    { id: 'c', type: 'expense', desc: 'Kirija', amount: 45000, category: 'Stan', date: '2026-09-01' }           // prosli mesec ne vazi
  ];
  const f = C.cashForecast({ today: '2026-10-04', startBalance: 100000, recurring: rec, entries, goals: [] });
  const ev = f.events.map(e => e.date + ' ' + e.desc);
  assert.ok(!ev.includes('2026-10-04 Kirija'));
  assert.ok(!ev.includes('2026-10-04 Struja'));
  assert.ok(ev.includes('2026-10-04 Internet'));     // nije upisan
  assert.ok(ev.includes('2026-11-01 Kirija'));       // sledeci mesec ostaje
});

test('prognoza posle pregleda: uparivanje upisanih stavki sa ponavljajucim (prihodi, buduci meseci, jedna stavka = jedna pojava, datum blizu roka)', () => {
  const base = { today: '2026-10-04', startBalance: 100000, goals: [], applied: {}, skipped: {} };
  // A) plata stigla kao "Zarada" (iznos isti, kategorija ista) -> ne dodaje se ponovo danas
  const salary = { id: 'p', type: 'income', desc: 'Plata', amount: 100000, category: 'Plata', day: 1 };
  const a = C.cashForecast(Object.assign({}, base, { recurring: [salary], entries: [{ id: 'z', type: 'income', desc: 'Zarada', amount: 100000, category: 'Plata', date: '2026-10-01' }] }));
  assert.ok(!a.events.some(e => e.date === '2026-10-04' && e.amount === 100000), JSON.stringify(a.events));
  // B) unapred upisana novembarska kirija -> novembarska ponavljajuca se ne racuna
  const rent = { id: 'k', type: 'expense', desc: 'Kirija', amount: 40000, category: 'Stan', day: 28 };
  const b = C.cashForecast(Object.assign({}, base, { recurring: [rent], entries: [{ id: 'kn', type: 'expense', desc: 'Kirija', amount: 40000, category: 'Stan', date: '2026-11-27' }] }));
  assert.deepEqual(b.events.filter(e => e.desc === 'Kirija').map(e => e.date), ['2026-10-28', '2026-11-27']);
  // C) Infostan i Struja u istoj kategiji: placen Infostan ne sakriva Struju
  const rs = [{ id: 's', type: 'expense', desc: 'Struja', amount: 5000, category: 'Režije', day: 2 }, { id: 'i', type: 'expense', desc: 'Infostan', amount: 4800, category: 'Režije', day: 3 }];
  const c = C.cashForecast(Object.assign({}, base, { recurring: rs, entries: [{ id: 'x', type: 'expense', desc: 'Infostan', amount: 4800, category: 'Režije', date: '2026-10-03' }] }));
  assert.ok(c.events.some(e => e.desc === 'Struja' && e.date === '2026-10-04'));
  assert.ok(!c.events.some(e => e.desc === 'Infostan' && e.date === '2026-10-04'));
  // D) kirija za septembar placena kasno (1. oktobra) ne sakriva oktobarsku sa rokom 28.
  const d = C.cashForecast(Object.assign({}, base, { recurring: [rent], entries: [{ id: 'ks', type: 'expense', desc: 'Kirija septembar', amount: 40000, category: 'Stan', date: '2026-10-01' }] }));
  assert.ok(d.events.some(e => e.desc === 'Kirija' && e.date === '2026-10-28'));
  // E) placeno par dana ranije (pre roka) se uparuje
  const e5 = C.cashForecast(Object.assign({}, base, { recurring: [rent], entries: [{ id: 'kr', type: 'expense', desc: 'kirija', amount: 40000, category: 'Stan', date: '2026-10-02' }] , today: '2026-10-25' }));
  assert.ok(!e5.events.some(e => e.desc === 'Kirija' && e.date === '2026-10-28'));
});

test('prognoza posle pregleda: plata — rucna ranije u mesecu zamenjuje mesecnu; automatska samo aktivna mesecna; rucna posle 60 dana produzava prozor', () => {
  const base = { today: '2026-10-04', startBalance: 1000, goals: [], entries: [] };
  const sal = { id: 'p', type: 'income', desc: 'Plata', amount: 100000, day: 10 };
  const m = C.cashForecast(Object.assign({}, base, { recurring: [sal], payday: { date: '2026-10-07', amount: 100000 } }));
  assert.deepEqual(m.events.filter(e => e.amount === 100000).map(e => e.date), ['2026-10-07', '2026-11-10']);
  const old = { id: 'o', type: 'income', desc: 'Stara plata', amount: 150000, day: 5, until: '2026-06' };
  const bonus = { id: 'b', type: 'income', desc: 'Bonus', amount: 300000, day: 15, frequency: 'yearly', anchorMonth: 12 };
  const cur = { id: 'c', type: 'income', desc: 'Plata', amount: 120000, day: 20 };
  const a = C.cashForecast(Object.assign({}, base, { recurring: [old, bonus, cur] }));
  assert.deepEqual(a.payday, { date: '2026-10-20', amount: 120000, source: 'recurring', desc: 'Plata' });
  assert.equal(C.pickSalary([old, bonus, cur], '2026-10').id, 'c');
  const far = C.cashForecast(Object.assign({}, base, { recurring: [sal], payday: { date: '2026-12-20', amount: 90000 } }));
  assert.ok(far.points.length >= 78 && far.beforePayday && far.beforePayday.date === '2026-12-19');
});

test('prognoza posle pregleda: svakodnevna potrosnja bez rucno upisanih racuna koji su ponavljajuci', () => {
  const rec = [{ id: 'k', type: 'expense', desc: 'Kirija', amount: 40000, category: 'Stan', day: 28 }];
  const entries = [];
  ['2026-07', '2026-08', '2026-09'].forEach(m => {
    entries.push({ id: 'k' + m, type: 'expense', desc: 'Kirija', amount: 40000, category: 'Stan', date: m + '-28', paid: true });
    entries.push({ id: 'h' + m, type: 'expense', desc: 'Maxi', amount: 30400, category: 'Hrana', date: m + '-10', paid: true });
  });
  assert.equal(C.forecastDailySpend(entries, '2026-10', rec, []), 1000); // 30.400 / 30,4
});

test('godisnji troskovi: traka 12 meseci, sledeci put, meseci do tada, mesecno odvajanje, teski meseci', () => {
  const rec = [
    { id: 'reg', type: 'expense', desc: 'Registracija', amount: 38000, day: 20, frequency: 'yearly', anchorMonth: 11 },
    { id: 'osig', type: 'expense', desc: 'Osiguranje', amount: 24000, day: 5, frequency: 'yearly', anchorMonth: 3 },
    { id: 'kv', type: 'expense', desc: 'Komunalna', amount: 6000, day: 10, frequency: 'quarterly', anchorMonth: 1 },
    { id: 'porez', type: 'expense', desc: 'Porez', amount: 12000, day: 2, frequency: 'yearly', anchorMonth: 10 },
    { id: 'staro', type: 'expense', desc: 'Staro', amount: 9999, day: 1, frequency: 'yearly', anchorMonth: 12, until: '2026-06' },
    { id: 'mes', type: 'expense', desc: 'Kirija', amount: 40000, day: 1 },
    { id: 'pr', type: 'income', desc: 'Bonus', amount: 50000, day: 1, frequency: 'yearly', anchorMonth: 12 }
  ];
  const y = C.yearlyCosts(rec, '2026-10-05', { applied: { '2026-10': ['porez'] }, skipped: {} });
  assert.equal(y.months.length, 12);
  assert.equal(y.months[0].mKey, '2026-10');
  assert.deepEqual(y.items.map(i => i.id).sort(), ['kv', 'osig', 'porez', 'reg']);
  const byId = Object.fromEntries(y.items.map(i => [i.id, i]));
  assert.equal(byId.reg.next, '2026-11-20'); assert.equal(byId.reg.monthsLeft, 2); assert.equal(byId.reg.perMonth, 19000);
  assert.equal(byId.porez.next, '2027-10-02');                       // placen ovog meseca -> za godinu dana
  assert.equal(byId.kv.next, '2026-10-10'); assert.equal(byId.kv.monthsLeft, 1);
  assert.equal(byId.osig.next, '2027-03-05'); assert.equal(byId.osig.monthsLeft, 6);
  // kvartalna: okt, jan, apr, jul u 12 meseci
  assert.equal(y.months.reduce((n, m) => n + m.items.filter(i => i.id === 'kv').length, 0), 4);
  assert.equal(y.months.find(m => m.mKey === '2026-10').items.some(i => i.id === 'porez'), false);
  assert.equal(y.steady, Math.round((38000 / 12 + 24000 / 12 + 6000 / 3 + 12000 / 12) * 100) / 100);
  // catchUp: okt 6000 (1 mes) / nov 6000+38000 (2 mes) = 22000 ...
  assert.equal(y.catchUp, 22000);
  assert.equal(y.recommended, 22000);
  assert.deepEqual(y.heavy, ['2026-11', '2027-03']);
  // fond koji pokriva sve -> catchUp 0, preporuka = dugorocno (zaokruzeno navise na 100)
  const f = C.yearlyCosts(rec, '2026-10-05', { applied: {}, skipped: {}, fundBalance: 1000000 });
  assert.equal(f.catchUp, 0);
  assert.equal(f.recommended, Math.ceil(f.steady / 100) * 100);
  // bez godisnjih stavki
  const e = C.yearlyCosts([], '2026-10-05', {});
  assert.deepEqual([e.items.length, e.steady, e.catchUp, e.recommended, e.heavy.length], [0, 0, 0, 0, 0]);
});

test('godisnji troskovi: podsetnici 30 dana unapred (prag iznosa, placeno/preskoceno, dospelo ovog meseca)', () => {
  const rec = [
    { id: 'reg', type: 'expense', desc: 'Registracija', amount: 38000, day: 20, frequency: 'yearly', anchorMonth: 11 },
    { id: 'mali', type: 'expense', desc: 'Domen', amount: 1500, day: 15, frequency: 'yearly', anchorMonth: 10 },
    { id: 'kv', type: 'expense', desc: 'Komunalna', amount: 6000, day: 2, frequency: 'quarterly', anchorMonth: 1 },
    { id: 'pres', type: 'expense', desc: 'Pretplata', amount: 9000, day: 25, frequency: 'yearly', anchorMonth: 10 }
  ];
  const r = C.yearlyReminders(rec, '2026-10-25', { skipped: { '2026-10': ['pres'] }, applied: {} });
  assert.deepEqual(r.map(x => x.id + ' ' + x.date), ['kv 2026-10-02', 'reg 2026-11-20']);
});

test('prognoza sa fondom godisnjih troskova: pokriveno iz fonda, delimicno, fond raste uplatama', () => {
  const rec = [{ id: 'reg', type: 'expense', desc: 'Registracija', amount: 38000, day: 20, frequency: 'yearly', anchorMonth: 11 },
    { id: 'osig', type: 'expense', desc: 'Osiguranje', amount: 30000, day: 25, frequency: 'yearly', anchorMonth: 11 }];
  const goal = { id: 'g', name: 'Godišnji troškovi', target: 68000, current: 20000, yearlyFund: true, monthly: { amount: 10000, day: 1, since: '2026-10', last: '2026-10' } };
  const f = C.cashForecast({ today: '2026-10-05', startBalance: 100000, recurring: rec, entries: [], goals: [goal], fund: { goalId: 'g', current: 20000, itemIds: ['reg', 'osig'] } });
  const ev = f.events.map(e => e.date + ' ' + e.desc + ' ' + e.amount);
  assert.ok(ev.includes('2026-11-01 Godišnji troškovi -10000'));     // uplata u fond i dalje smanjuje raspolozivo
  assert.ok(ev.includes('2026-11-20 Registracija -8000'), JSON.stringify(ev));   // fond 20000 + 10000 pokriva 30000 od 38000
  assert.ok(ev.includes('2026-11-25 Osiguranje -30000'));                       // fond je potrosen
});

test('godisnji troskovi posle pregleda: zavrsena stavka bez preostale pojave se ne racuna; godisnji zbir za cilj fonda', () => {
  const rec = [
    { id: 'kraj', type: 'expense', desc: 'Osiguranje', amount: 24000, day: 5, frequency: 'yearly', anchorMonth: 3, until: '2026-12' },
    { id: 'plac', type: 'expense', desc: 'Porez', amount: 60000, day: 2, frequency: 'yearly', anchorMonth: 10 },
    { id: 'kv', type: 'expense', desc: 'Komunalna', amount: 3000, day: 10, frequency: 'quarterly', anchorMonth: 1 }
  ];
  const y = C.yearlyCosts(rec, '2026-10-05', { applied: { '2026-10': ['plac', 'kv'] }, skipped: {} });
  assert.deepEqual(y.items.map(i => i.id).sort(), ['kv', 'plac']);
  assert.equal(y.steady, Math.round((60000 / 12 + 3000 / 3) * 100) / 100);
  assert.equal(y.yearTotal, 72000);                                   // 60000 + 4 x 3000 (i kad je placen ovog meseca)
});

test('pendingForMonth: tekuci mesec — dospeli rashodi odvojeno od ostatka mojih dugova, rata se ne broji duplo', () => {
  const recurring = [
    { id: 'p', desc: 'Porez', amount: 8000, type: 'expense', frequency: 'monthly' },
    { id: 'y', desc: 'Yettel', amount: 9500, type: 'expense', frequency: 'monthly' },
    { id: 's', desc: 'Plata', amount: 100000, type: 'income', frequency: 'monthly' },
    { id: 'r', desc: 'Rata: Gabo', amount: 6000, type: 'expense', frequency: 'monthly', debtId: 'g' }
  ];
  const entries = [
    { id: 'a', type: 'expense', date: '2026-10-01', amount: 56160, paid: false },
    { id: 'b', type: 'expense', date: '2026-09-20', amount: 1000, paid: false },
    { id: 'c', type: 'expense', date: '2026-10-02', amount: 500 },
    { id: 'd', type: 'expense', date: '2026-11-02', amount: 700, paid: false },
    { id: 'e', type: 'expense', date: '2026-08-01', amount: 24000, debtId: 'g' }
  ];
  const debts = [
    { id: 'g', direction: 'i_owe', person: 'Gabo', amount: 48000 },
    { id: 'j', direction: 'i_owe', person: 'Jovica', amount: 12000 },
    { id: 'k', direction: 'i_owe', person: 'Kaca', amount: 6000, paidAmount: 6000 },
    { id: 'm', direction: 'owed_to_me', person: 'Mika', amount: 9000 }
  ];
  const p = C.pendingForMonth({ entries, recurring, applied: { '2026-10': ['y'] }, skipped: {}, debts, mKey: '2026-10', currentMonth: '2026-10' });
  // rashodi: 56160 + 1000 (zakasneo iz septembra) + Porez 8000 + rata 6000; Yettel placen, novembar ne
  assert.equal(p.expense, 71160);
  assert.equal(p.count, 4);
  assert.equal(p.income, 100000);
  // dugovi: Gabo 48000-24000-6000 (rata je vec gore) = 18000, Jovica 12000; Kaca vracen, Mika nije moj dug
  assert.equal(p.debt, 30000);
  assert.equal(p.debtCount, 2);
});

test('pendingForMonth: drugi meseci bez dugova; rata koja pokriva ceo ostatak ne ostavlja dug', () => {
  const recurring = [{ id: 'r', desc: 'Rata', amount: 5000, type: 'expense', frequency: 'monthly', debtId: 'g' }];
  const debts = [{ id: 'g', direction: 'i_owe', person: 'Gabo', amount: 3000 }];
  const entries = [{ id: 'a', type: 'expense', date: '2026-11-03', amount: 200, paid: false }, { id: 'b', type: 'expense', date: '2026-10-03', amount: 300, paid: false }];
  const next = C.pendingForMonth({ entries, recurring, applied: {}, skipped: {}, debts, mKey: '2026-11', currentMonth: '2026-10' });
  const pick = o => ({ expense: o.expense, income: o.income, count: o.count, debt: o.debt, debtCount: o.debtCount });
  assert.deepEqual(pick(next), { expense: 5200, income: 0, count: 2, debt: 0, debtCount: 0 });
  const past = C.pendingForMonth({ entries, recurring, applied: {}, skipped: {}, debts, mKey: '2026-09', currentMonth: '2026-10' });
  assert.deepEqual(pick(past), { expense: 0, income: 0, count: 0, debt: 0, debtCount: 0 });
  const cur = C.pendingForMonth({ entries, recurring, applied: {}, skipped: {}, debts, mKey: '2026-10', currentMonth: '2026-10' });
  assert.equal(cur.expense, 3300); // rata 5000 ogranicena na ostatak duga 3000
  assert.equal(cur.debt, 0);
  assert.equal(cur.debtCount, 0);
});

test('pendingForMonth: poslednja rata veca od ostatka duga racuna se samo do ostatka', () => {
  const recurring = [{ id: 'r', desc: 'Rata', amount: 1500, type: 'expense', frequency: 'monthly', debtId: 'g' }];
  const debts = [{ id: 'g', direction: 'i_owe', person: 'Gabo', amount: 3000, paidAmount: 2000 }];
  const cur = C.pendingForMonth({ entries: [], recurring, applied: {}, skipped: {}, debts, mKey: '2026-10', currentMonth: '2026-10' });
  assert.equal(cur.expense, 1000);
  assert.equal(cur.count, 1);
  assert.equal(cur.debt, 0);
});

test('matchActionTarget: padezi, dijakritike, celo ime pobedjuje, izbor, nista', () => {
  const debts = [{ id: 'r', name: 'Rale' }, { id: 'g', name: 'Gabo' }, { id: 'j', name: 'Jovica' }];
  assert.deepEqual(C.matchActionTarget('Raletu', debts), { match: { id: 'r', name: 'Rale' } });
  assert.deepEqual(C.matchActionTarget('Jovici', debts), { match: { id: 'j', name: 'Jovica' } });
  const goals = [{ id: 'l', name: 'Letovanje' }, { id: 'a', name: 'Auto' }];
  assert.deepEqual(C.matchActionTarget('letovanje', goals), { match: { id: 'l', name: 'Letovanje' } });
  const rec = [{ id: 'p', name: 'Porez' }, { id: 'y', name: 'Anđela - Yettel' }, { id: 'n', name: 'Nokti' }, { id: 'pi', name: 'Porez imovina' }];
  assert.deepEqual(C.matchActionTarget('porez', rec), { match: { id: 'p', name: 'Porez' } });
  assert.deepEqual(C.matchActionTarget('andjela', rec), { match: { id: 'y', name: 'Anđela - Yettel' } });
  assert.deepEqual(C.matchActionTarget('yettel', rec), { match: { id: 'y', name: 'Anđela - Yettel' } });
  const two = [{ id: 'k1', name: 'Kaca' }, { id: 'k2', name: 'Kaca' }];
  assert.deepEqual(C.matchActionTarget('Kaci', two), { choices: two });
  assert.deepEqual(C.matchActionTarget('struja', rec), { none: true });
  assert.deepEqual(C.matchActionTarget('', rec), { none: true });
});

test('pitaj iz bota: naredba, novi proracuni bez meseci, razgovor u promptu', () => {
  const p = C.askPlanPrompt({ question: 'a prošlog meseca?', today: '2026-10-06', first: '2026-01', last: '2026-10', expenseCats: ['Hrana'], incomeCats: ['Plata'],
    history: [{ q: 'koliko za hranu ovog meseca?', a: 'Potrošili ste 12.000 RSD.' }], actions: true });
  assert.match(p, /koliko za hranu ovog meseca/);
  assert.match(p, /toPay/); assert.match(p, /debtPay/);
  assert.doesNotMatch(C.askPlanPrompt({ question: 'x', today: '2026-10-06', first: '2026-01', last: '2026-10' }), /debtPay/);
  const ctx = { first: '2026-01', last: '2026-10', categories: ['Hrana'] };
  const plan = C.cleanAskPlan(JSON.stringify({ calls: [{ tool: 'toPay' }, { tool: 'forecast', months: ['1999-01'] }], action: null }), ctx);
  assert.deepEqual(plan.calls, [{ tool: 'toPay' }, { tool: 'forecast' }]);
  assert.equal(plan.action, null);
  const a = C.cleanAskPlan(JSON.stringify({ calls: [], action: { kind: 'debtPay', target: ' Raletu ', amount: '5000' } }), ctx).action;
  assert.deepEqual(a, { kind: 'debtPay', target: 'Raletu', amount: 5000, items: [] });
  assert.equal(C.cleanAskPlan(JSON.stringify({ action: { kind: 'rm -rf', target: 'x' } }), ctx).action, null);
  assert.equal(C.cleanAskPlan(JSON.stringify({ action: { kind: 'paid', target: '' } }), ctx).action, null);
  assert.equal(C.cleanAskPlan(JSON.stringify({ action: { kind: 'goalPay', target: 'auto', amount: 1e9 } }), ctx).action.amount, null);
  assert.deepEqual(C.cleanAskPlan(JSON.stringify({ action: { kind: 'shopAdd', items: ['mleko', ' hleb ', ''] } }), ctx).action.items, ['mleko', 'hleb']);
  assert.deepEqual(C.cleanAskPlan(JSON.stringify({ action: { kind: 'shopDone', target: 'mleko' } }), ctx).action.items, ['mleko']);
  assert.deepEqual(C.cleanAskPlan(JSON.stringify({ action: { kind: 'deleteLast' } }), ctx).action, { kind: 'deleteLast', target: '', amount: null, items: [] });
  const r = C.runAskTools([{ tool: 'toPay' }, { tool: 'goals' }], { entries: [], recurring: [], today: '2026-10-06', snapshot: { toPay: { total: 5 } } });
  assert.deepEqual(r.map(x => x.result), [{ total: 5 }, null]);
  const ans = C.askAnswerPrompt({ question: 'a prošlog?', today: '2026-10-06', results: [], history: [{ q: 'koliko za hranu?', a: '12.000' }] });
  assert.match(ans, /koliko za hranu\?/);
});

test('pendingForMonth: spisak stavki i dugova za bota', () => {
  const recurring = [{ id: 'p', desc: 'Porez', amount: 8000, type: 'expense', frequency: 'monthly', day: 1 }];
  const entries = [{ id: 'a', type: 'expense', desc: 'Drva', date: '2026-10-01', amount: 56160, paid: false }];
  const debts = [{ id: 'g', direction: 'i_owe', person: 'Gabo', amount: 1000 }];
  const p = C.pendingForMonth({ entries, recurring, applied: {}, skipped: {}, debts, mKey: '2026-10', currentMonth: '2026-10' });
  assert.deepEqual(p.items, [{ kind: 'expense', id: 'a', desc: 'Drva', amount: 56160, date: '2026-10-01' }, { kind: 'recurring', id: 'p', desc: 'Porez', amount: 8000, day: 1 }]);
  assert.deepEqual(p.debtItems, [{ id: 'g', person: 'Gabo', rest: 1000 }]);
});

test('matchActionTarget posle pregleda: kratke reci (na, za, u) se ne broje', () => {
  assert.deepEqual(C.matchActionTarget('porez na imovinu', [{ id: 'k', name: 'Kirija na Zlatiboru' }]), { none: true });
  assert.deepEqual(C.matchActionTarget('porez na imovinu', [{ id: 'k', name: 'Kirija na Zlatiboru' }, { id: 'p', name: 'Porez na imovinu' }]), { match: { id: 'p', name: 'Porez na imovinu' } });
});

test('askAnswerPrompt: izgled za Telegram (spisak, podebljan zbir) samo za bota', () => {
  const tg = C.askAnswerPrompt({ question: 'šta treba da platimo?', today: '2026-10-07', results: [], style: 'telegram' });
  assert.match(tg, /•/); assert.match(tg, /\*\*/); assert.match(tg, /jedna stavka po redu/);
  const app = C.askAnswerPrompt({ question: 'šta treba da platimo?', today: '2026-10-07', results: [] });
  assert.doesNotMatch(app, /\*\*/); assert.match(app, /do 8 rečenica/);
});

test('jutarnji podsetnik: vreme slanja (jednom dnevno, posle zadatog vremena)', () => {
  assert.equal(C.morningDue({ on: true, time: '09:00', last: '', now: '2026-10-07T08:59' }), false);
  assert.equal(C.morningDue({ on: true, time: '09:00', last: '', now: '2026-10-07T09:00' }), true);
  assert.equal(C.morningDue({ on: true, time: '09:00', last: '2026-10-07', now: '2026-10-07T15:00' }), false);
  assert.equal(C.morningDue({ on: true, time: '09:00', last: '2026-10-06', now: '2026-10-07T23:10' }), true);
  assert.equal(C.morningDue({ on: false, time: '09:00', last: '', now: '2026-10-07T10:00' }), false);
  assert.equal(C.morningDue({ on: true, time: 'xx', last: '', now: '2026-10-07T09:30' }), true);   // neispravno vreme -> 09:00
});

test('jutarnji podsetnik: danas, sutra, kasni (ponavljajuce i neplaceni rashodi), dokumenti, godisnji', () => {
  const recurring = [
    { id: 'p', desc: 'Porez', amount: 8000, type: 'expense', frequency: 'monthly', day: 7 },
    { id: 's', desc: 'Struja', amount: 4000, type: 'expense', frequency: 'monthly', day: 8 },
    { id: 'n', desc: 'Nokti', amount: 4000, type: 'expense', frequency: 'monthly', day: 4 },
    { id: 'k', desc: 'Kirija', amount: 30000, type: 'expense', frequency: 'monthly', day: 1 },
    { id: 'x', desc: 'Preskocena', amount: 100, type: 'expense', frequency: 'monthly', day: 7 },
    { id: 'pl', desc: 'Plata', amount: 100000, type: 'income', frequency: 'monthly', day: 7 },
    { id: 'o', desc: 'Osiguranje', amount: 24000, type: 'expense', frequency: 'yearly', anchorMonth: 11, day: 3 }
  ];
  const entries = [
    { id: 'd', type: 'expense', desc: 'Drva', amount: 56160, date: '2026-10-01', paid: false },
    { id: 'f', type: 'expense', desc: 'Frizer', amount: 2000, date: '2026-10-08', paid: false },
    { id: 'z', type: 'expense', desc: 'Placeno', amount: 1, date: '2026-10-01' }
  ];
  const documents = [{ id: 'lk', title: 'Lična karta', expires: '2026-10-19', remindDays: 30 }];
  const r = C.morningReminderItems({ recurring, entries, applied: { '2026-10': ['k'] }, skipped: { '2026-10': ['x'] }, documents, today: '2026-10-07' });
  assert.deepEqual(r.today.map(i => i.id), ['p']);
  assert.deepEqual(r.tomorrow.map(i => i.id), ['s', 'f']);
  assert.deepEqual(r.overdue.map(i => [i.id, i.days]), [['d', 6], ['n', 3]]);
  assert.equal(r.today[0].kind, 'recurring'); assert.equal(r.overdue[0].kind, 'expense');
  assert.deepEqual(r.docs.map(d => [d.title, d.days]), [['Lična karta', 12]]);
  assert.deepEqual(r.yearly.map(y => [y.id, y.date]), [['o', '2026-11-03']]);
  // kraj meseca: sutra je 1. u sledecem mesecu
  const r2 = C.morningReminderItems({ recurring, entries: [], applied: {}, skipped: {}, documents: [], today: '2026-10-31' });
  assert.deepEqual(r2.tomorrow.map(i => i.id), ['k']);
  assert.equal(r2.tomorrow[0].mKey, '2026-11');   // dugme placa novembar, ne oktobar
  assert.equal(r.today[0].mKey, '2026-10'); assert.equal(r.overdue.find(i => i.id === 'n').mKey, '2026-10');
  const empty = C.morningReminderItems({ recurring: [], entries: [], applied: {}, skipped: {}, documents: [], today: '2026-10-07' });
  assert.equal(C.morningHasItems(empty), false); assert.equal(C.morningHasItems(r), true);
});

test('mesecni rezime: prvog posle vremena podsetnika, kasnije do 10. u mesecu, jednom mesecno', () => {
  const o = (now, last, on = true) => C.monthlySummaryDue({ on, time: '09:00', last, now });
  assert.equal(o('2026-11-01T08:59', ''), null);
  assert.equal(o('2026-11-01T09:00', ''), '2026-10');
  assert.equal(o('2026-11-01T09:00', '2026-10'), null);
  assert.equal(o('2026-11-04T07:00', '2026-09'), '2026-10');   // racunar je 1. bio ugasen
  assert.equal(o('2026-11-11T12:00', ''), null);
  assert.equal(o('2026-01-01T10:00', ''), '2025-12');
  assert.equal(o('2026-11-01T10:00', '', false), null);
});
