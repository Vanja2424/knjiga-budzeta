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
