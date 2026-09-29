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
    buy('m4', '2026-09-22', ['Mleko', 'Hleb']), buy('m5', '2026-09-22', ['Mleko']),       // isti dan se broji jednom
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
