// Knjiga budzeta — cista logika (bez DOM-a): iznosi, datumi, uvoz izvoda, ponavljajuce stavke.
// Isti fajl koristi stranica (window.BudzetCore) i testovi (require). Ovde nema nikakvog stanja.
(function(root, factory){
  if(typeof module === 'object' && module.exports) module.exports = factory();
  else root.BudzetCore = factory();
})(typeof self !== 'undefined' ? self : this, function(){

  // ---------- Datumi i meseci ----------
  const pad2 = n => String(n).padStart(2, '0');
  function toISODate(d){ return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate()); }
  function monthKeyOf(d){ return d.getFullYear() + '-' + pad2(d.getMonth()+1); }
  // "2026-09" + n meseci (n moze biti negativno)
  function addMonths(mKey, n){
    const [y, m] = mKey.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return monthKeyOf(d);
  }
  function daysInMonth(mKey){
    const [y, m] = mKey.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  }
  // Niz mesecnih kljuceva od 'from' do 'to' (ukljucivo), rastuce.
  function monthRange(from, to){
    const out = [];
    let cur = from;
    for(let i = 0; i < 1200 && cur <= to; i++){ out.push(cur); cur = addMonths(cur, 1); }
    return out;
  }

  // ---------- Ponavljajuce stavke ----------
  // Dan dospeca u konkretnom mesecu: dan 31 u februaru postaje poslednji dan februara.
  function effectiveDay(day, mKey){
    const d = Math.max(1, Math.min(31, parseInt(day, 10) || 1));
    return Math.min(d, daysInMonth(mKey));
  }
  function dueDateFor(r, mKey){ return mKey + '-' + pad2(effectiveDay(r.day, mKey)); }
  function clampRecurringDay(day){ return Math.max(1, Math.min(31, parseInt(day, 10) || 1)); }
  // Mesecno je uvek "na redu"; kvartalno/godisnje prema anchorMonth (1-12).
  function isDueInMonth(r, mKey){
    if(!r.frequency || r.frequency === 'monthly') return true;
    const mo = parseInt(mKey.split('-')[1], 10);
    const anchor = r.anchorMonth || 1;
    if(r.frequency === 'yearly') return mo === anchor;
    if(r.frequency === 'quarterly'){ let diff = mo - anchor; if(diff < 0) diff += 12; return diff % 3 === 0; }
    return true;
  }

  // ---------- Iznosi ----------
  // Parsira iznos u bilo kom uobicajenom zapisu: "1.234,56" (srpski), "1,234.56" (engleski),
  // "1234,56", "1 234,56", "-1.234", "(1.234,00)", "1.234,56 RSD", "RSD -350". Vraca NaN ako nema broja.
  function parseAmount(input){
    if(typeof input === 'number') return input;
    if(input == null) return NaN;
    let s = String(input).trim();
    if(!s) return NaN;
    let negative = false;
    if(/^\(.*\)$/.test(s)){ negative = true; s = s.slice(1, -1); }
    s = s.replace(/[\s  ']/g, '');
    // Minus pre prve cifre ("-350", "RSD -350") ili na kraju ("350-", neki izvodi banaka).
    if(/^[^\d]*[-−]/.test(s) || /[-−]$/.test(s)) negative = true;
    s = s.replace(/[^\d.,]/g, '');
    if(!/\d/.test(s)) return NaN;
    const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
    let normalized;
    if(lastDot !== -1 && lastComma !== -1){
      const dec = lastDot > lastComma ? '.' : ',';
      const thou = dec === '.' ? ',' : '.';
      normalized = s.split(thou).join('').replace(dec, '.');
    } else if(lastComma !== -1){
      normalized = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(/,/g, (m, i) => i === lastComma ? '.' : '');
    } else if(lastDot !== -1){
      // Samo tacke: "1.234" i "1.234.567" su hiljade (srpski zapis), "12.5" je decimala.
      normalized = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s.replace(/\./g, (m, i) => i === lastDot ? '.' : '');
    } else normalized = s;
    const v = parseFloat(normalized);
    if(isNaN(v)) return NaN;
    return negative ? -v : v;
  }

  // Ako iznos nije unet, a opis se zavrsava brojem ("Kafa 350", "Kafa 1.500"), uzmi broj iz opisa.
  // Iznosi su celi RSD, pa su i tacka i zarez u broju iz opisa separatori hiljada.
  function parseQuickAmount(descRaw, amountRaw){
    let desc = (descRaw || '').trim();
    let amount = amountRaw;
    if(isNaN(amount) || amount <= 0){
      const m = desc.match(/^(.*\S)\s+([\d.,]*\d)$/);
      if(m){ desc = m[1].trim(); amount = parseFloat(m[2].replace(/[.,]/g, '')); }
    }
    return { desc, amount };
  }

  // ---------- Datumi iz izvoda ----------
  // DD.MM.YYYY (srpski), YYYY-MM-DD, DD/MM/YYYY, DD.MM.YY, "12.09.2026 14:33", YYYYMMDD
  function parseFlexibleDate(str){
    if(str == null) return null;
    if(str instanceof Date) return isNaN(str) ? null : toISODate(str);
    str = String(str).trim();
    let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if(m) return validDate(+m[1], +m[2], +m[3]);
    m = str.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})\.?(?:\s|$)/);
    if(m){ let y = +m[3]; if(y < 100) y += 2000; return validDate(y, +m[2], +m[1]); }
    m = str.match(/^(\d{4})(\d{2})(\d{2})$/);
    if(m) return validDate(+m[1], +m[2], +m[3]);
    return null;
  }
  function validDate(y, mo, d){
    if(mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
    const dt = new Date(y, mo - 1, d);
    if(dt.getMonth() !== mo - 1) return null;
    return toISODate(dt);
  }

  // ---------- CSV ----------
  function detectDelimiter(text){
    const firstLines = String(text).split(/\r?\n/).filter(l => l.trim()).slice(0, 5);
    const counts = { ';': 0, ',': 0, '\t': 0 };
    firstLines.forEach(line => {
      let inQ = false;
      for(const ch of line){
        if(ch === '"') inQ = !inQ;
        else if(!inQ && counts[ch] !== undefined) counts[ch]++;
      }
    });
    return Object.keys(counts).reduce((best, k) => counts[k] > counts[best] ? k : best, ',');
  }
  // Pun CSV parser: navodnici, "" unutar navodnika, novi redovi unutar navodnika.
  function parseCsv(text, delimiter){
    text = String(text).replace(/^﻿/, '');
    delimiter = delimiter || detectDelimiter(text);
    const rows = []; let row = []; let cur = ''; let inQ = false;
    for(let i = 0; i < text.length; i++){
      const ch = text[i];
      if(inQ){
        if(ch === '"'){ if(text[i+1] === '"'){ cur += '"'; i++; } else inQ = false; }
        else cur += ch;
      } else if(ch === '"') inQ = true;
      else if(ch === delimiter){ row.push(cur); cur = ''; }
      else if(ch === '\n' || ch === '\r'){
        if(ch === '\r' && text[i+1] === '\n') i++;
        row.push(cur); cur = '';
        if(row.some(c => c.trim() !== '')) rows.push(row);
        row = [];
      } else cur += ch;
    }
    row.push(cur);
    if(row.some(c => c.trim() !== '')) rows.push(row);
    return rows;
  }

  // Prepoznavanje kolona u izvodu banke ili CSV izvozu ove aplikacije.
  const COLUMN_PATTERNS = {
    date: /^(datum|date|datum knji[zž]enja|datum transakcije|datum valute|booking date|transaction date|valuta)/,
    desc: /(opis|description|naziv|svrha|primalac|platilac|prima[lo]ac|merchant|detalji|napomena|payee|partner)/,
    amount: /^(iznos|amount|suma)/,
    debit: /(isplat|zadu[zž]en|duguje|debit|rashod|odliv|withdraw)/,
    credit: /(uplat|odobren|potra[zž]uje|credit|prihod|priliv|deposit)/,
    cat: /(kategorij|category)/,
    type: /^(tip|type|vrsta)$/,
    paid: /(pla[cć]eno|paid)/,
    tags: /^(oznake?|tags?)$/,
    currency: /^(valuta|currency)$/
  };
  function findHeaderIndex(rows){
    for(let i = 0; i < Math.min(rows.length, 30); i++){
      const h = rows[i].map(c => String(c).trim().toLowerCase());
      const hasDate = h.some(c => COLUMN_PATTERNS.date.test(c));
      const hasAmount = h.some(c => COLUMN_PATTERNS.amount.test(c) || COLUMN_PATTERNS.debit.test(c) || COLUMN_PATTERNS.credit.test(c));
      if(hasDate && hasAmount) return i;
    }
    return -1;
  }
  function mapColumns(header){
    const h = header.map(c => String(c).trim().toLowerCase());
    const find = (re, exclude) => h.findIndex((c, i) => re.test(c) && !(exclude || []).includes(i));
    const idx = {};
    idx.date = find(COLUMN_PATTERNS.date);
    idx.debit = find(COLUMN_PATTERNS.debit);
    idx.credit = find(COLUMN_PATTERNS.credit, [idx.debit]);
    idx.amount = find(COLUMN_PATTERNS.amount, [idx.debit, idx.credit]);
    idx.desc = find(COLUMN_PATTERNS.desc, [idx.date]);
    idx.cat = find(COLUMN_PATTERNS.cat);
    idx.type = find(COLUMN_PATTERNS.type);
    idx.paid = find(COLUMN_PATTERNS.paid, [idx.debit, idx.credit]);
    idx.tags = find(COLUMN_PATTERNS.tags);
    return idx;
  }
  // Pretvara tabelu (niz redova, prvi smisleni red je zaglavlje) u stavke za uvoz.
  // Vraca { rows:[{date,desc,amount,type,category,paid,tags}], skipped, error }
  function tableToImportRows(table){
    const hi = findHeaderIndex(table);
    if(hi === -1) return { rows: [], skipped: 0, error: 'Nisu prepoznate kolone datuma i iznosa u fajlu.' };
    const idx = mapColumns(table[hi]);
    const out = []; let skipped = 0;
    for(let i = hi + 1; i < table.length; i++){
      const cols = table[i];
      const cell = k => idx[k] >= 0 ? (cols[idx[k]] == null ? '' : cols[idx[k]]) : '';
      const date = parseFlexibleDate(cell('date'));
      let amount = NaN, type = '';
      if(idx.amount >= 0 && String(cell('amount')).trim() !== ''){
        amount = parseAmount(cell('amount'));
        const t = String(cell('type')).trim().toLowerCase();
        if(t === 'income' || t === 'prihod') type = 'income';
        else if(t === 'expense' || t === 'rashod') type = 'expense';
        else type = amount < 0 ? 'expense' : 'income';
      } else {
        const d = parseAmount(cell('debit')), c = parseAmount(cell('credit'));
        if(!isNaN(d) && Math.abs(d) > 0){ amount = d; type = 'expense'; }
        else if(!isNaN(c) && Math.abs(c) > 0){ amount = c; type = 'income'; }
      }
      amount = Math.abs(amount);
      if(!date || isNaN(amount) || amount <= 0){ skipped++; continue; }
      const paidRaw = String(cell('paid')).trim().toLowerCase();
      out.push({
        date, amount, type,
        desc: String(cell('desc') || '').replace(/\s+/g, ' ').trim() || 'Uvezena stavka',
        category: String(cell('cat') || '').trim() || null,
        paid: paidRaw === '' ? true : /^(da|yes|true|1)$/.test(paidRaw),
        tags: String(cell('tags') || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
      });
    }
    return { rows: out, skipped, error: null };
  }

  // ---------- OFX / QIF ----------
  function parseOFX(text){
    const rows = [];
    const blockRe = /<STMTTRN>([\s\S]*?)(?=<STMTTRN>|<\/BANKTRANLIST>|$)/gi;
    let m;
    while((m = blockRe.exec(text))){
      const block = m[1];
      const get = (tag) => { const mm = block.match(new RegExp('<' + tag + '>([^<\\r\\n]*)', 'i')); return mm ? mm[1].trim() : ''; };
      const dt = get('DTPOSTED'), amtRaw = get('TRNAMT');
      if(!dt || !amtRaw) continue;
      const date = validDate(+dt.slice(0, 4), +dt.slice(4, 6), +dt.slice(6, 8));
      const amount = parseFloat(amtRaw.replace(',', '.'));
      if(!date || isNaN(amount) || amount === 0) continue;
      rows.push({ date, desc: get('NAME') || get('MEMO') || get('PAYEE') || 'Uvezena stavka', amount: Math.abs(amount), type: amount < 0 ? 'expense' : 'income', category: null, paid: true, tags: [] });
    }
    return rows;
  }
  // QIF datumi su skoro uvek US: MM/DD/YYYY ili MM/DD'YY.
  function parseQifDate(str){
    str = String(str).trim();
    const m = str.match(/^(\d{1,2})[.\/'-](\d{1,2})[.\/'-]\s*(\d{2,4})$/);
    if(m){ let y = +m[3]; if(y < 100) y += 2000; const r = validDate(y, +m[1], +m[2]); if(r) return r; }
    return parseFlexibleDate(str);
  }
  function parseQIF(text){
    const rows = []; let cur = {};
    String(text).split(/\r?\n/).forEach(line => {
      if(!line) return;
      const code = line[0], val = line.slice(1).trim();
      if(code === '^'){ if(cur.date && cur.amount != null && !isNaN(cur.amount)) rows.push(cur); cur = {}; return; }
      if(code === 'D') cur.date = parseQifDate(val);
      else if(code === 'T' || code === 'U') cur.amount = parseFloat(val.replace(/,/g, ''));
      else if(code === 'P') cur.desc = val;
      else if(code === 'M' && !cur.desc) cur.desc = val;
      else if(code === 'L') cur.category = val;
    });
    return rows.filter(r => r.amount !== 0).map(r => ({ date: r.date, desc: r.desc || 'Uvezena stavka', amount: Math.abs(r.amount), type: r.amount < 0 ? 'expense' : 'income', category: r.category || null, paid: true, tags: [] }));
  }

  // ---------- Duplikati ----------
  const dupKey = e => `${e.type}|${e.date}|${Math.round(e.amount)}|${String(e.desc || '').trim().toLowerCase().replace(/\s+/g, ' ')}`;
  // Iz novih redova izbaci one koji vec postoje (isti tip, datum, iznos, opis). Ako je u izvodu
  // ista kombinacija navedena dvaput (dve iste kafe istog dana), uvoze se obe — broji se koliko puta.
  function splitDuplicates(newRows, existing){
    const have = new Map();
    existing.forEach(e => { const k = dupKey(e); have.set(k, (have.get(k) || 0) + 1); });
    const fresh = [], dups = [];
    newRows.forEach(r => {
      const k = dupKey(r);
      const n = have.get(k) || 0;
      if(n > 0){ have.set(k, n - 1); dups.push(r); } else fresh.push(r);
    });
    return { fresh, dups };
  }

  // ---------- Pravila kategorizacije ----------
  function categoryFromRules(rules, desc){
    const lower = String(desc || '').toLowerCase();
    // Duze kljucne reci imaju prednost ("wolt market" pre "wolt").
    const sorted = (rules || []).filter(r => r && r.keyword).slice().sort((a, b) => b.keyword.length - a.keyword.length);
    const rule = sorted.find(r => lower.includes(r.keyword.toLowerCase()));
    return rule ? rule.category : null;
  }

  // ---------- Raspodela na vise meseci ----------
  // Stavka moze da "pokriva" vise meseci (npr. plata za jul–sep uplacena odjednom, ili godisnje
  // osiguranje): spreadMonths = broj meseci, spreadStart = prvi mesec ("YYYY-MM", podrazumevano
  // mesec datuma). U mesecnim zbirovima svaki od tih meseci dobija jednak deo; stanje na racunu
  // i dalje prati stvarni datum uplate.
  function spreadOf(e){
    const n = Math.max(1, Math.min(120, parseInt(e.spreadMonths, 10) || 1));
    const start = (n > 1 && /^\d{4}-\d{2}$/.test(e.spreadStart || '')) ? e.spreadStart : e.date.slice(0, 7);
    return { n, start, end: addMonths(start, n - 1) };
  }
  function shareInMonth(e, mKey){
    const { n, start, end } = spreadOf(e);
    if(n === 1) return e.date.slice(0, 7) === mKey ? e.amount : 0;
    return (mKey >= start && mKey <= end) ? e.amount / n : 0;
  }
  // Deo stavke u nizu meseci (npr. cela godina) — zbir delova po mesecima.
  function shareInMonths(e, months){ return months.reduce((s, m) => s + shareInMonth(e, m), 0); }

  // ---------- Racuni (nalozi) ----------
  // Stanje racuna = pocetno stanje + prihodi − placeni rashodi ± prenosi.
  function accountBalances(accounts, entries, isExpensePaid, upToDate){
    const bal = {};
    accounts.forEach(a => { bal[a.id] = Number(a.openingBalance) || 0; });
    const def = accounts[0] ? accounts[0].id : null;
    entries.forEach(e => {
      if(upToDate && e.date > upToDate) return;
      if(e.type === 'transfer'){
        if(bal[e.fromAccount] !== undefined) bal[e.fromAccount] -= e.amount;
        if(bal[e.toAccount] !== undefined) bal[e.toAccount] += e.amount;
        return;
      }
      const acc = bal[e.accountId] !== undefined ? e.accountId : def;
      if(acc == null) return;
      if(e.type === 'income') bal[acc] += e.amount;
      else if(e.type === 'expense' && isExpensePaid(e)) bal[acc] -= e.amount;
    });
    return bal;
  }

  // ---------- Valute ----------
  function convertToRsd(amount, currency, rates){
    if(!currency || currency === 'RSD') return amount;
    const rate = rates && rates[currency];
    return rate ? amount * rate : NaN;
  }

  // ---------- Analitika ----------
  function linearRegressionForecast(vals){
    const n = vals.length;
    if(n < 3) return null;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    vals.forEach((y, i) => { sumX += i; sumY += y; sumXY += i * y; sumX2 += i * i; });
    const denom = n * sumX2 - sumX * sumX;
    if(denom === 0) return null;
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    return Math.max(0, slope * n + intercept);
  }
  // Snowball: najmanji dug prvi; kad se otplati, njegov deo kapaciteta prelazi na sledeci.
  function debtPayoffPlan(debts, monthlyCapacity){
    const balances = debts.map(d => ({ id: d.id, person: d.person, remaining: d.remaining })).filter(d => d.remaining > 0).sort((a, b) => a.remaining - b.remaining);
    if(balances.length === 0 || monthlyCapacity <= 0) return { balances, months: 0, payoffMonth: {} };
    const payoffMonth = {}; let months = 0;
    while(balances.some(d => d.remaining > 0) && months < 600){
      months++;
      let cap = monthlyCapacity;
      for(const d of balances){
        if(d.remaining <= 0 || cap <= 0) continue;
        const pay = Math.min(cap, d.remaining);
        d.remaining -= pay; cap -= pay;
        if(d.remaining <= 0 && !payoffMonth[d.id]) payoffMonth[d.id] = months;
      }
    }
    return { balances, months, payoffMonth };
  }

  // ---------- Analiza potrosnje ----------
  // Racuna se samo placen rashod; raspodeljena stavka ulazi mesecnim delom (shareInMonth).
  const NO_DESC = '(bez opisa)';
  const isPaidExp = e => e.type === 'expense' && e.paid !== false;
  // "Maxi 123", "MAXI." i "maxi" su ista grupa: bez brojeva/interpunkcije na kraju, bez obzira na velika/mala slova.
  function cleanDesc(desc){
    return String(desc == null ? '' : desc).replace(/\s+/g, ' ').replace(/[\s\d.,;:!?#*+\-–—_/\\()'"]+$/u, '').trim();
  }
  function normalizeDesc(desc){ return cleanDesc(desc).toLowerCase() || NO_DESC; }
  // n punih meseci PRE mKey, rastuce ('2026-03', 3 -> ['2025-12','2026-01','2026-02']).
  function analysisPeriod(mKey, n){
    const out = [];
    for(let i = n; i >= 1; i--) out.push(addMonths(mKey, -i));
    return out;
  }
  function firstExpenseMonth(entries){
    let first = null;
    entries.forEach(e => { if(!isPaidExp(e)) return; const s = spreadOf(e).start; if(first === null || s < first) first = s; });
    return first;
  }
  function sumPaid(entries, mKey, pred){
    return entries.reduce((s, e) => (isPaidExp(e) && (!pred || pred(e))) ? s + shareInMonth(e, mKey) : s, 0);
  }
  // Mesecni zbirovi za period; prosek samo od prvog meseca sa podacima (raniji meseci nisu nula).
  function periodStats(entries, months, pred){
    const first = firstExpenseMonth(entries);
    const perMonth = months.map(m => sumPaid(entries, m, pred));
    const counted = first === null ? [] : months.filter(m => m >= first);
    const sum = months.reduce((s, m, i) => (first !== null && m >= first) ? s + perMonth[i] : s, 0);
    return { perMonth, counted, monthsWithData: counted.length, avg: counted.length ? sum / counted.length : 0, enough: counted.length >= 2 };
  }
  // Fiksno = generisano iz ponavljajuce stavke (id "rec-<id>-<YYYY-MM>") ili kategorija oznacena kao fiksna.
  function isFixedEntry(e, fixedCategories){
    return /^rec-/.test(e.id || '') || (fixedCategories || []).includes(e.category);
  }
  // Mesecni "ekvivalent" cene bez obzira na ucestalost (godisnja/12, kvartalna/3).
  function monthlyEquivalent(r){
    if(r.frequency === 'yearly') return r.amount / 12;
    if(r.frequency === 'quarterly') return r.amount / 3;
    return r.amount;
  }
  const ABOVE_PCT = 0.2, ABOVE_MIN = 1000, SMALL_MAX = 1500, SMALL_PER_MONTH = 4;
  // Grupe po opisu u datim mesecima: ukupno (mesecnim delom), broj kupovina, prosecna kupovina.
  function groupByDesc(entries, months, pred){
    const map = new Map();
    entries.forEach(e => {
      if(!isPaidExp(e) || (pred && !pred(e))) return;
      const amt = shareInMonths(e, months);
      if(amt <= 0) return;
      const key = normalizeDesc(e.desc);
      if(!map.has(key)) map.set(key, { key, label: cleanDesc(e.desc) || NO_DESC, total: 0, count: 0 });
      const g = map.get(key);
      g.total += amt; g.count++;
    });
    return [...map.values()].map(g => Object.assign(g, { avgPurchase: g.total / g.count })).sort((a, b) => b.total - a.total);
  }
  // Kategorije izabranog meseca naspram proseka perioda (n meseci pre njega).
  function categoryBreakdown(entries, mKey, n){
    const months = analysisPeriod(mKey, n);
    const overall = periodStats(entries, months);
    const enough = overall.enough;
    const cats = [...new Set(entries.filter(isPaidExp).map(e => e.category))];
    const rows = cats.map(cat => {
      const pred = e => e.category === cat;
      const total = sumPaid(entries, mKey, pred);
      if(!enough) return { cat, total, avg: null, diff: null, pct: null };
      const avg = periodStats(entries, months, pred).avg;
      return { cat, total, avg, diff: total - avg, pct: avg > 0 ? Math.round((total - avg) / avg * 100) : null };
    }).filter(r => r.total > 0).sort((a, b) => b.total - a.total);
    return { month: mKey, months, total: rows.reduce((s, r) => s + r.total, 0), avg: overall.avg, enough, rows };
  }
  // Iznad proseka: bar 20% I bar 1.000 RSD (vrednost tacno na pragu se racuna); nova kategorija (prosek 0) ne.
  function aboveAverage(breakdown){
    if(!breakdown.enough) return [];
    return breakdown.rows.filter(r => r.avg > 0 && r.diff >= ABOVE_MIN && r.total >= r.avg * (1 + ABOVE_PCT)).sort((a, b) => b.diff - a.diff);
  }
  // Sitni cesti promenljivi troskovi u periodu: prosecna kupovina <= 1.500 i >= 4 kupovine mesecno.
  function smallFrequent(entries, mKey, n, fixedCategories){
    const st = periodStats(entries, analysisPeriod(mKey, n));
    if(!st.enough) return [];
    const k = st.counted.length;
    return groupByDesc(entries, st.counted, e => !isFixedEntry(e, fixedCategories))
      .filter(g => g.avgPurchase <= SMALL_MAX && g.count / k >= SMALL_PER_MONTH)
      .map(g => Object.assign(g, { perMonth: g.count / k, monthly: g.total / k, yearly: g.total / k * 12 }));
  }

  function splitFixedVariable(entries, mKey, fixedCategories){
    const fixed = sumPaid(entries, mKey, e => isFixedEntry(e, fixedCategories));
    const total = sumPaid(entries, mKey);
    return { fixed, variable: total - fixed, total, fixedPct: total > 0 ? Math.round(fixed / total * 100) : 0 };
  }
  function variableAverage(entries, mKey, n, fixedCategories){
    return periodStats(entries, analysisPeriod(mKey, n), e => !isFixedEntry(e, fixedCategories)).avg;
  }
  // Ponavljajuci troskovi sa godisnjim troskom; "poskupelo" = poslednja naplata > 10% iznad prve (bar 3 naplate).
  const CREEP_PCT = 0.10;
  function subscriptionsYearly(recurring, entries){
    return (recurring || []).filter(r => r.type !== 'income').map(r => {
      const prefix = 'rec-' + r.id + '-';
      const hist = entries.filter(e => (e.id || '').startsWith(prefix)).sort((a, b) => a.date.localeCompare(b.date));
      const first = hist.length ? hist[0].amount : null;
      const last = hist.length ? hist[hist.length - 1].amount : null;
      const creep = hist.length >= 3 && first > 0 && last > first * (1 + CREEP_PCT);
      return { id: r.id, desc: r.desc, category: r.category, frequency: r.frequency || 'monthly', yearly: monthlyEquivalent(r) * 12,
        first, last, creep, creepPct: creep ? Math.round((last - first) / first * 100) : null };
    }).sort((a, b) => b.yearly - a.yearly);
  }
  // Broj meseci do roka, isto kao predlog kod ciljeva (najmanje 1).
  function monthsUntil(today, deadlineISO){
    const [y, m, d] = deadlineISO.split('-').map(Number);
    let months = (y - today.getFullYear()) * 12 + (m - 1 - today.getMonth());
    if(d < today.getDate()) months -= 1;
    return Math.max(1, months);
  }
  // "Sta ako smanjim promenljive troskove za pct%": usteda i koliko ranije stize cilj sa najblizim rokom.
  function whatIf(variableAvg, pct, goals, today){
    const p = Math.max(0, Math.min(50, Number(pct) || 0));
    const monthly = variableAvg * p / 100;
    const res = { pct: p, monthly, yearly: monthly * 12, goal: null };
    if(monthly <= 0) return res;
    const todayISO = toISODate(today);
    const active = (goals || []).filter(g => g.target > g.current && g.deadline && g.deadline > todayISO)
      .sort((a, b) => a.deadline.localeCompare(b.deadline));
    if(!active.length) return res;
    const g = active[0];
    const remaining = g.target - g.current;
    const monthsLeft = monthsUntil(today, g.deadline);
    const newMonths = Math.ceil(remaining / (remaining / monthsLeft + monthly));
    const sooner = monthsLeft - newMonths;
    if(sooner >= 1) res.goal = { id: g.id, name: g.name, monthsLeft, newMonths, sooner };
    return res;
  }
  // Jedan poziv za Pregled i Analizu — da brojke uvek budu iste.
  function savingsSummary(entries, recurring, fixedCategories, mKey, n){
    const breakdown = categoryBreakdown(entries, mKey, n);
    const above = aboveAverage(breakdown);
    const small = smallFrequent(entries, mKey, n, fixedCategories);
    return { month: mKey, n, enough: breakdown.enough, breakdown, above, aboveTotal: above.reduce((s, r) => s + r.diff, 0),
      small, smallMonthly: small.reduce((s, g) => s + g.monthly, 0), subscriptions: subscriptionsYearly(recurring, entries) };
  }

  return {
    pad2, toISODate, monthKeyOf, addMonths, daysInMonth, monthRange,
    effectiveDay, dueDateFor, clampRecurringDay, isDueInMonth,
    parseAmount, parseQuickAmount, parseFlexibleDate, validDate,
    detectDelimiter, parseCsv, findHeaderIndex, mapColumns, tableToImportRows,
    parseOFX, parseQIF, parseQifDate,
    dupKey, splitDuplicates, categoryFromRules,
    spreadOf, shareInMonth, shareInMonths,
    accountBalances, convertToRsd,
    linearRegressionForecast, debtPayoffPlan,
    NO_DESC, isPaidExp, cleanDesc, normalizeDesc, analysisPeriod, firstExpenseMonth, sumPaid, periodStats,
    isFixedEntry, monthlyEquivalent, ABOVE_PCT, ABOVE_MIN, SMALL_MAX, SMALL_PER_MONTH, groupByDesc, categoryBreakdown, aboveAverage, smallFrequent,
    splitFixedVariable, variableAverage, CREEP_PCT, subscriptionsYearly, monthsUntil, whatIf, savingsSummary
  };
});
