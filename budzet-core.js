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
    if(r.until && mKey > r.until) return false;
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

  // Verovatni duplikati koje tacno poredjenje ne hvata (banka pise "TRAJNI NALOG", u knjizi "Kirija"):
  // isti tip, iznos na dinar, datum najvise `days` dana razlike, a postojeca stavka se upari samo jednom.
  function findNearDuplicates(rows, existing, days){
    const maxDays = days == null ? 3 : days;
    const dayNum = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
    const used = new Set();
    const clean = [], near = [];
    (rows || []).forEach(r => {
      const d = dayNum(r.date);
      const match = (existing || []).filter(e => !used.has(e) && e.type === r.type && Math.round(e.amount) === Math.round(r.amount)
          && typeof e.date === 'string' && Math.abs(dayNum(e.date) - d) <= maxDays)
        .sort((a, b) => Math.abs(dayNum(a.date) - d) - Math.abs(dayNum(b.date) - d))[0];
      if(match){ used.add(match); near.push({ row: r, match }); } else clean.push(r);
    });
    return { clean, near };
  }
  // Vise izvoda odjednom: ako se periodi preklapaju, ista stavka (tip, datum, iznos, opis) je u oba fajla.
  // Po kljucu se uzima najveci broj ponavljanja u jednom fajlu (dve iste kafe u istom izvodu ostaju dve).
  function mergeImportBatches(batches){
    const out = [], taken = new Map();
    (batches || []).forEach(rows => {
      const inFile = new Map();
      (rows || []).forEach(r => {
        const k = dupKey(r);
        const n = (inFile.get(k) || 0) + 1;
        inFile.set(k, n);
        if(n > (taken.get(k) || 0)){ taken.set(k, n); out.push(r); }
      });
    });
    return out;
  }
  // Pregled uvoza po mesecima: koliko stavki i koliki prihodi/rashodi po mesecu.
  function monthCoverage(rows){
    const map = new Map();
    (rows || []).forEach(r => {
      const m = r.date.slice(0, 7);
      if(!map.has(m)) map.set(m, { month: m, count: 0, income: 0, expense: 0 });
      const g = map.get(m);
      g.count++;
      if(r.type === 'income') g.income = Math.round((g.income + r.amount) * 100) / 100;
      else g.expense = Math.round((g.expense + r.amount) * 100) / 100;
    });
    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
  }

  // ---------- IPS QR (NBS standard, uplatnica "PR") ----------
  // Broj racuna: "160-12345-78" ili 18 cifara -> 18 cifara (srednji deo dopunjen nulama do 13); inace ''.
  function normalizeAccount(s){
    const str = String(s == null ? '' : s).trim();
    const parts = str.split(/[-\s]+/).filter(Boolean);
    if(parts.length === 3 && parts.every(x => /^\d+$/.test(x)) && parts[0].length === 3 && parts[2].length === 2 && parts[1].length <= 13)
      return parts[0] + parts[1].padStart(13, '0') + parts[2];
    const digits = str.replace(/\D/g, '');
    return digits.length === 18 && /^[\d\s-]+$/.test(str) ? digits : '';
  }
  // Ostatak deljenja velikog broja (niz cifara) sa 97
  const mod97 = digits => { let r = 0; for(const ch of digits) r = (r * 10 + Number(ch)) % 97; return r; };
  // Kontrolni broj ISO 7064 MOD 97-10: 98 - (broj * 100 mod 97)
  const control97 = digits => String(98 - mod97(digits + '00')).padStart(2, '0');
  function validAccount(s){
    const a = normalizeAccount(s);
    return !!a && control97(a.slice(0, 16)) === a.slice(16);
  }
  const formatAccount = a => { const n = normalizeAccount(a); return n ? n.slice(0, 3) + '-' + n.slice(3, 16) + '-' + n.slice(16) : String(a || ''); };
  // Poziv na broj po modelu 97: prve dve cifre su kontrolni broj ostatka (slova: A=10 … Z=35, crtice se ignorisu).
  function validReference97(ref){
    const r = String(ref || '').replace(/[-\s]/g, '').toUpperCase();
    if(!/^\d{2}[0-9A-Z]{1,20}$/.test(r)) return false;
    const body = r.slice(2).replace(/[A-Z]/g, ch => String(ch.charCodeAt(0) - 55));
    return control97(body) === r.slice(0, 2);
  }
  // NBS dozvoljava latinicu (sa čćžšđ), cifre i obicne znakove; cirilica se preslovljava, ostalo zamenjuje ili izbacuje.
  const CYR = { 'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Ђ':'Đ','Е':'E','Ж':'Ž','З':'Z','И':'I','Ј':'J','К':'K','Л':'L','Љ':'Lj','М':'M','Н':'N','Њ':'Nj','О':'O','П':'P','Р':'R','С':'S','Т':'T','Ћ':'Ć','У':'U','Ф':'F','Х':'H','Ц':'C','Ч':'Č','Џ':'Dž','Ш':'Š' };
  Object.keys(CYR).forEach(k => { CYR[k.toLowerCase()] = CYR[k].toLowerCase(); });
  const IPS_OK = /[A-Za-z0-9 .,\/():;"'!?%&#+*_@=<>\[\]~\-ČĆŽŠĐčćžšđ„“]/;
  function ipsSafe(s){
    return [...String(s == null ? '' : s).replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/…/g, '...').replace(/[\r\n\t|]/g, ' ')]
      .map(ch => CYR[ch] || ch)
      .map(ch => IPS_OK.test(ch) ? ch : ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]/g, ''))
      .join('');
  }
  const ipsText = (s, max) => ipsSafe(s).replace(/\s+/g, ' ').trim().slice(0, max);
  const ipsAmount = amount => 'RSD' + (Math.round(Number(amount) * 100) / 100).toFixed(2).replace('.', ',');
  // Podaci za placanje -> tekst za IPS QR. p: { account, name, amount, code, purpose, model, reference }
  function ipsQrString(p){
    const tags = ['K:PR', 'V:01', 'C:1', 'R:' + normalizeAccount(p.account), 'N:' + ipsText(p.name, 70), 'I:' + ipsAmount(p.amount || 0),
      'SF:' + String(p.code || '189').trim()];
    const purpose = ipsText(p.purpose, 35);
    if(purpose) tags.push('S:' + purpose);
    const ref = String(p.reference || '').replace(/\s/g, '');
    if(ref) tags.push('RO:' + (String(p.model || '').trim() || '00') + ref);
    return tags.join('|');
  }
  // IPS tekst sa uplatnice -> podaci za placanje (null ako nije NBS IPS QR za placanje racuna)
  function parseIpsQr(text){
    const map = {};
    String(text || '').trim().split('|').forEach(part => {
      const i = part.indexOf(':');
      if(i > 0) map[part.slice(0, i).trim()] = part.slice(i + 1);
    });
    if(map.K !== 'PR' || !map.R) return null;
    const amt = /^([A-Z]{3})(\d+(?:,\d{0,2})?)$/.exec(map.I || '');
    const ro = String(map.RO || '');
    return {
      account: normalizeAccount(map.R) || map.R,
      name: (map.N || '').replace(/\r?\n/g, ', ').trim(),
      amount: amt ? parseFloat(amt[2].replace(',', '.')) : null,
      currency: amt ? amt[1] : 'RSD',
      code: map.SF || '',
      purpose: map.S || '',
      model: ro.length > 2 ? ro.slice(0, 2) : '',
      reference: ro.length > 2 ? ro.slice(2) : ''
    };
  }
  // Podaci za placanje sa ponavljajuce stavke (iz kopije/Excela): samo poznata polja, sve kao tekst; bez racuna -> undefined
  function cleanPayee(p){
    if(!p || typeof p !== 'object') return undefined;
    const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
    const out = { account: normalizeAccount(p.account) || str(p.account, 40), name: str(p.name, 70), code: str(p.code, 3) || '189',
      purpose: str(p.purpose, 35), model: str(p.model, 2), reference: str(p.reference, 33) };
    return out.account ? out : undefined;
  }
  // Provera pre prikaza koda: spisak problema (prazan = u redu)
  function ipsProblems(p){
    const out = [];
    if(!normalizeAccount(p.account)) out.push('Račun primaoca treba da ima 18 cifara (npr. 160-0000000012345-67).');
    else if(!validAccount(p.account)) out.push('Kontrolni broj računa primaoca nije ispravan — proveri cifre.');
    if(!ipsText(p.name, 70)) out.push('Upiši naziv primaoca.');
    if(!/^[12]\d\d$/.test(String(p.code || '189').trim())) out.push('Šifra plaćanja ima 3 cifre i počinje sa 1 ili 2 (npr. 189).');
    if(!(Number(p.amount) > 0)) out.push('Iznos mora biti veći od nule.');
    const ref = String(p.reference || '').replace(/\s/g, '');
    const model = String(p.model || '').trim();
    if(ref && model && !/^\d\d$/.test(model)) out.push('Model ima dve cifre (97 ili 00).');
    if(ref && model === '97' && !validReference97(ref)) out.push('Poziv na broj ne odgovara modelu 97 — proveri cifre.');
    if(ref.length + 2 > 35) out.push('Poziv na broj je predugačak.');
    return out;
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

  // ---------- Nabavka ----------
  const SHOPPING_OTHER = 'Ostalo';
  const SHOPPING_SECTIONS = ['Voće i povrće', 'Pekara', 'Mlečni', 'Meso', 'Suvi program', 'Piće', 'Smrznuto', 'Higijena', 'Kućna hemija', SHOPPING_OTHER];
  const QTY_UNITS = ['kom', 'kg', 'g', 'l', 'ml', 'pak'];
  const QTY_RE = new RegExp('(?:^|\\s)(\\d+(?:[.,]\\d+)?)\\s?(' + QTY_UNITS.join('|') + ')\\.?$', 'i');
  // "Mleko 2 kom 150" -> naziv, kolicina (broj + jedinica), cena (poslednji broj bez jedinice)
  function parseShoppingInput(text){
    let s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    let price = null, qty = '';
    const pm = s.match(/(?:^|\s)(\d[\d.,]*)$/);
    if(pm){
      const v = parseAmount(pm[1]);
      if(isFinite(v) && v > 0){ price = v; s = s.slice(0, s.length - pm[0].length).trim(); }
    }
    const qm = s.match(QTY_RE);
    if(qm){ qty = qm[1] + ' ' + qm[2].toLowerCase(); s = s.slice(0, s.length - qm[0].length).trim(); }
    return { name: s, qty, price };
  }
  const normShoppingName = name => String(name == null ? '' : name).replace(/\s+/g, ' ').trim().toLowerCase();
  function findShoppingItem(items, name){
    const key = normShoppingName(name);
    return (items || []).find(i => normShoppingName(i.name) === key);
  }
  const purchaseItemLabel = item => item.qty ? item.name + ' (' + item.qty + ')' : item.name;
  // Najcesca prodavnica medju stavkama; nereseno -> prva po abecedi; bez prodavnica -> ''.
  function mostCommonStore(items){
    const counts = new Map();
    (items || []).forEach(i => { const s = String(i.store || '').trim(); if(s) counts.set(s, (counts.get(s) || 0) + 1); });
    let best = '', bestN = 0;
    [...counts.keys()].sort((a, b) => a.localeCompare(b)).forEach(s => { if(counts.get(s) > bestN){ best = s; bestN = counts.get(s); } });
    return best;
  }
  const itemsToCell = items => Array.isArray(items) ? items.join('; ') : '';
  const cellToItems = cell => String(cell == null ? '' : cell).split(';').map(x => x.trim()).filter(Boolean);
  // Proverava i dopunjuje sacuvanu listu: nepoznat deo -> Ostalo, duplikat naziva se izbacuje, Ostalo uvek postoji.
  function normalizeShopping(raw, makeId){
    const src = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    let sections = Array.isArray(src.sections)
      ? [...new Set(src.sections.filter(s => typeof s === 'string').map(s => s.trim()).filter(Boolean))]
      : SHOPPING_SECTIONS.slice();
    sections = sections.filter(s => s !== SHOPPING_OTHER).concat([SHOPPING_OTHER]);
    const seen = new Set();
    const items = [];
    (Array.isArray(src.items) ? src.items : []).forEach(i => {
      if(!i || typeof i !== 'object') return;
      const name = String(i.name == null ? '' : i.name).replace(/\s+/g, ' ').trim();
      const key = name.toLowerCase();
      if(!name || seen.has(key)) return;
      seen.add(key);
      const price = Number(i.price);
      items.push({
        id: (typeof i.id === 'string' && i.id) ? i.id : makeId(),
        name,
        section: sections.includes(i.section) ? i.section : SHOPPING_OTHER,
        store: String(i.store == null ? '' : i.store).trim(),
        category: typeof i.category === 'string' ? i.category : '',
        price: isFinite(price) && price > 0 ? price : null,
        qty: String(i.qty == null ? '' : i.qty).trim(),
        needed: !!i.needed,
        checked: !!i.checked
      });
      // stara imena (posle preimenovanja) — da istorija kupovina i cena ostane uz stavku
      if(Array.isArray(i.aliases)){
        const ak = new Set([key]), aliases = [];
        i.aliases.forEach(a => { if(typeof a !== 'string') return; const n = a.replace(/\s+/g, ' ').trim().slice(0, 80), k = n.toLowerCase(); if(n && !ak.has(k)){ ak.add(k); aliases.push(n); } });
        if(aliases.length) items[items.length - 1].aliases = aliases.slice(-10);
      }
    });
    const dismissed = {};
    if(src.dismissed && typeof src.dismissed === 'object' && !Array.isArray(src.dismissed))
      Object.keys(src.dismissed).forEach(k => { const v = src.dismissed[k]; if(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) dismissed[k] = v; });
    return { items, sections, dismissed };
  }

  const NO_STORE = 'Bez prodavnice', NO_CATEGORY = 'Bez kategorije';
  const byName = (a, b) => a.name.localeCompare(b.name);
  // Grupe za prikaz: deo prodavnice (redom iz sections), prodavnica ili kategorija (abecedno, "Bez ..." na kraju).
  function groupShoppingItems(items, by, opts){
    const sections = (opts && opts.sections) || SHOPPING_SECTIONS;
    const categories = (opts && opts.categories) || [];
    const keyOf = i => by === 'store' ? String(i.store || '').trim()
      : by === 'category' ? (categories.includes(i.category) ? i.category : '')
      : (sections.includes(i.section) ? i.section : SHOPPING_OTHER);
    const map = new Map();
    (items || []).forEach(i => { const k = keyOf(i); if(!map.has(k)) map.set(k, []); map.get(k).push(i); });
    const keys = [...map.keys()];
    if(by === 'section') keys.sort((a, b) => sections.indexOf(a) - sections.indexOf(b));
    else keys.sort((a, b) => (a === '') - (b === '') || a.localeCompare(b));
    const emptyLabel = by === 'store' ? NO_STORE : NO_CATEGORY;
    return keys.map(k => ({ key: k, label: k === '' ? emptyLabel : k, items: map.get(k).slice().sort(byName) }));
  }
  function shoppingEstimate(items, opts){
    const res = { count: 0, total: 0, unpriced: 0, byCategory: {} };
    if(opts && opts.history) res.fromReceipts = 0;
    (items || []).forEach(i => {
      if(!i.needed) return;
      res.count++;
      if(!(res.byCategory[i.category] >= 0)) res.byCategory[i.category] = 0;
      const est = opts && opts.history ? estimateShoppingItem(i, opts.history, opts.preferredStore) : { amount: i.price > 0 ? i.price : 0, source: i.price > 0 ? 'manual' : null };
      if(est.amount > 0){ res.total = round2(res.total + est.amount); res.byCategory[i.category] = round2(res.byCategory[i.category] + est.amount); if(est.source === 'store' || est.source === 'last') res.fromReceipts++; }
      else res.unpriced++;
    });
    return res;
  }
  // Ukupan iznos sa racuna -> po kategoriji, srazmerno ceni (bez cene = prosek; bez ijedne cene = broj stavki).
  // Celi dinari raspodeljeni najvecim ostatkom; nikad negativno; decimale racuna (ako ih ima) idu na poslednji red.
  function splitPurchase(items, total){
    if(!items || !items.length) return [];
    const priced = items.filter(i => i.price > 0);
    const avg = priced.length ? priced.reduce((s, i) => s + i.price, 0) / priced.length : 0;
    const weightOf = i => priced.length ? (i.price > 0 ? i.price : avg) : 1;
    const groups = new Map();
    items.forEach(i => { if(!groups.has(i.category)) groups.set(i.category, []); groups.get(i.category).push(i); });
    const rows = [...groups.entries()].map(([category, its]) => ({ category, items: its, weight: its.reduce((s, i) => s + weightOf(i), 0) }))
      .sort((a, b) => b.weight - a.weight || a.category.localeCompare(b.category));
    const W = rows.reduce((s, r) => s + r.weight, 0);
    const whole = Math.floor(total);
    const frac = Math.round((total - whole) * 100) / 100;
    const shares = rows.map(r => whole * r.weight / W);
    const amounts = shares.map(Math.floor);
    let left = whole - amounts.reduce((s, a) => s + a, 0);
    // preostale dinare dobijaju redovi sa najvecim ostatkom; nereseno -> kasniji red (100/3 -> 33, 33, 34)
    const order = shares.map((s, i) => ({ i, rem: s - Math.floor(s) })).sort((a, b) => b.rem - a.rem || b.i - a.i);
    for(let k = 0; left > 0; k++, left--) amounts[order[k % order.length].i]++;
    amounts[amounts.length - 1] = Math.round((amounts[amounts.length - 1] + frac) * 100) / 100;
    return rows.map((r, idx) => ({ category: r.category, amount: amounts[idx], items: r.items }));
  }

  // ---------- Mesec i ponavljajuce (premesteno iz stranice radi testova) ----------
  const round2 = x => Math.round(x * 100) / 100;
  // Mesecni zbir: prihodi + placeni rashodi, raspodeljene stavke mesecnim delom; sve zaokruzeno na pare.
  function monthTotals(entries, mKey){
    let income = 0, expense = 0;
    const byCat = {};
    entries.forEach(e => {
      if(e.type !== 'income' && !isPaidExp(e)) return;
      const share = shareInMonth(e, mKey);
      if(!share) return;
      if(e.type === 'income') income += share;
      else { expense += share; byCat[e.category] = (byCat[e.category] || 0) + share; }
    });
    Object.keys(byCat).forEach(k => { byCat[k] = round2(byCat[k]); });
    income = round2(income); expense = round2(expense);
    return { income, expense, net: round2(income - expense), byCat, catEntries: Object.entries(byCat).sort((a, b) => b[1] - a[1]) };
  }
  const isRecurringPaid = (applied, r, mKey) => ((applied || {})[mKey] || []).includes(r.id);
  const isRecurringSkipped = (skipped, r, mKey) => ((skipped || {})[mKey] || []).includes(r.id);
  const recurringEntryId = (r, mKey) => 'rec-' + r.id + '-' + mKey;
  // Ponavljajuce koje u mesecu (tekucem ili buducem) tek dospevaju: nisu placene, preskocene ni upisane.
  function pendingRecurringItems(recurring, entries, applied, skipped, mKey, currentMonth){
    if(mKey < currentMonth) return [];
    const ids = new Set(entries.map(e => e.id));
    return recurring.filter(r => isDueInMonth(r, mKey) && !isRecurringPaid(applied, r, mKey) && !isRecurringSkipped(skipped, r, mKey) && !ids.has(recurringEntryId(r, mKey)));
  }
  // Meseci za automatsko upisivanje: od poslednjeg obradjenog (ukljucno, da se ne izgubi rep tog meseca)
  // do tekuceg, najvise `max` unazad; bez kljuca samo tekuci.
  function monthsToProcess(last, current, max){
    if(!/^\d{4}-\d{2}$/.test(last || '') || last >= current) return [current];
    const oldest = addMonths(current, -((max || 24) - 1));
    return monthRange(last > oldest ? last : oldest, current);
  }
  // Stavke sa "Automatski upisi" dospele u mesecu; dayLimit = danasnji dan za tekuci mesec, null za prosle mesece.
  function autoPayDue(recurring, state, mKey, dayLimit){
    const s = state || {};
    return (recurring || []).filter(r => r.autoPay && isDueInMonth(r, mKey)
      && !isRecurringPaid(s.applied, r, mKey) && !isRecurringSkipped(s.skipped, r, mKey)
      && !(((s.optOut || {})[mKey]) || []).includes(r.id)
      && (dayLimit == null || effectiveDay(r.day, mKey) <= dayLimit));
  }
  // Zakasneli rashodi iz ponavljajucih u mesecu: dospeli (dan < danas), nisu placeni ni preskoceni; prihodi ne.
  function overdueRecurring(recurring, applied, skipped, mKey, today){
    return (recurring || []).filter(r => r.type !== 'income' && isDueInMonth(r, mKey)
      && !isRecurringPaid(applied, r, mKey) && !isRecurringSkipped(skipped, r, mKey)
      && effectiveDay(r.day, mKey) < today);
  }
  // Otplaceno od duga: rucne uplate + placeni rashodi rata vezani za taj dug (debtId). Zaokruzeno na pare.
  function debtPaid(d, entries){
    const linked = (entries || []).reduce((s, e) => (e.type === 'expense' && e.paid !== false && e.debtId === d.id) ? s + e.amount : s, 0);
    return round2((d.paidAmount || 0) + linked);
  }

  // ---------- Mesecna uplata u cilj ----------
  // Plan na cilju: g.monthly = { amount, day, since: 'YYYY-MM', last?: 'YYYY-MM' }.
  // Dospele uplate: od max(since, last+1) do tekuceg (najvise 24 meseca unazad); tekuci tek kad dan prodje.
  // Zbir ne prelazi ostatak do cilja.
  function goalPlanDue(goal, current, todayDay){
    const p = goal && goal.monthly;
    const amount = p ? Number(p.amount) : 0;
    if(!p || !(amount > 0) || !/^\d{4}-\d{2}$/.test(p.since || '')) return [];
    let start = p.since;
    if(/^\d{4}-\d{2}$/.test(p.last || '') && addMonths(p.last, 1) > start) start = addMonths(p.last, 1);
    const oldest = addMonths(current, -23);
    if(start < oldest) start = oldest;
    if(start > current) return [];
    let left = round2((Number(goal.target) || 0) - (Number(goal.current) || 0));
    const out = [];
    monthRange(start, current).forEach(mKey => {
      const day = effectiveDay(p.day, mKey);
      if(mKey === current && day > todayDay) return;
      if(left <= 0) return;
      const amt = round2(Math.min(amount, left));
      left = round2(left - amt);
      out.push({ mKey, amount: amt, day });
    });
    return out;
  }
  // Predlog iznosa plana iz "sta ako" usteda: zaokruzeno na 100, najmanje 100 (0 kad nema ustede).
  const planAmount = monthly => (Number(monthly) > 0) ? Math.max(100, Math.round(monthly / 100) * 100) : 0;

  // ---------- Mesecni pregled ("Mesec iza tebe") ----------
  // Prvih 10 dana u mesecu -> prethodni mesec, osim ako je vec zatvoren.
  function monthReviewMonth(todayISO, dismissed){
    if(parseInt(todayISO.slice(8, 10), 10) > 10) return null;
    const prev = addMonths(todayISO.slice(0, 7), -1);
    return dismissed === prev ? null : prev;
  }
  const REVIEW_DOWN_MIN = 1000;
  // state: { recurring, applied, skipped, limits }
  function monthReview(entries, state, mKey, n){
    const s = state || {};
    const t = monthTotals(entries, mKey);
    const b = categoryBreakdown(entries, mKey, n || 6);
    const avgExpense = b.enough ? round2(b.avg) : null;
    const downs = b.enough ? b.rows.concat(
        // kategorija bez troska u ovom mesecu nije u rows, a pad je ceo prosek
        [...new Set(entries.filter(isPaidExp).map(e => e.category))].filter(c => !b.rows.some(r => r.cat === c))
          .map(cat => { const avg = periodStats(entries, b.months, e => e.category === cat).avg; return { cat, total: 0, avg, diff: -avg }; }))
      .filter(r => r.avg > 0 && r.diff <= -REVIEW_DOWN_MIN).sort((a, b2) => a.diff - b2.diff) : [];
    const limits = s.limits || {};
    const overBudget = Object.keys(limits).filter(c => limits[c] > 0).map(cat => ({ cat, spent: round2(sumPaid(entries, mKey, e => e.category === cat)), limit: limits[cat] }))
      .filter(x => x.spent > x.limit).sort((a, b2) => (b2.spent - b2.limit) - (a.spent - a.limit));
    const unpaidEntries = (entries || []).filter(e => e.type === 'expense' && e.paid === false && (e.date || '').slice(0, 7) === mKey);
    const ids = new Set((entries || []).map(e => e.id));
    // samo stavke koje su vec ranije bile placene/preskocene — inace je stavka verovatno dodata posle tog meseca
    const earlier = Object.keys(s.applied || {}).concat(Object.keys(s.skipped || {})).filter(k => k < mKey);
    const knownBefore = r => earlier.some(k => ((s.applied || {})[k] || []).includes(r.id) || ((s.skipped || {})[k] || []).includes(r.id));
    const unpaidRecurring = (s.recurring || []).filter(r => r.type !== 'income' && isDueInMonth(r, mKey) && knownBefore(r)
      && !isRecurringPaid(s.applied, r, mKey) && !isRecurringSkipped(s.skipped, r, mKey) && !ids.has(recurringEntryId(r, mKey)));
    return {
      month: mKey, income: t.income, expense: t.expense, net: t.net,
      savingsRate: t.income > 0 ? Math.round(t.net / t.income * 100) : null,
      enough: b.enough, avgExpense, expensePct: avgExpense > 0 ? Math.round((t.expense - avgExpense) / avgExpense * 100) : null,
      up: aboveAverage(b).slice(0, 3), down: downs[0] || null, overBudget, unpaidEntries, unpaidRecurring,
      unpaidTotal: round2(unpaidEntries.reduce((x, e) => x + e.amount, 0) + unpaidRecurring.reduce((x, r) => x + (Number(r.amount) || 0), 0))
    };
  }

  // ---------- Kupljene stvari (Nabavka -> Analiza, predlozi) ----------
  // Skida samo zagradu sa kolicinom na kraju ("(2 kom)", "(1,5 kg)") — "Hleb (crni)" ostaje ceo naziv
  const purchasedItemName = label => String(label == null ? '' : label).replace(/(?:\s*\(\d[^()]*\))+\s*$/, '').replace(/\s+/g, ' ').trim();
  const purchasedItemKey = label => normShoppingName(purchasedItemName(label));
  // Preimenovana stavka liste (aliases = stara imena): kupovine pod starim imenom pripadaju njoj; stavka koja se bas tako zove ima prednost
  function aliasOwners(shoppingItems, keyFn){
    const list = (shoppingItems || []).filter(i => i && typeof i === 'object');
    const own = new Set(list.map(i => keyFn(i.name)).filter(Boolean));
    const m = new Map();
    list.forEach(i => { if(Array.isArray(i.aliases)) i.aliases.forEach(a => { const k = keyFn(a); if(k && !own.has(k) && !m.has(k)) m.set(k, i); }); });
    return m;
  }
  const purchaseOwner = (owners, label) => {
    const key = purchasedItemKey(label), o = owners.get(key);
    return o ? { key: normShoppingName(o.name), name: o.name } : { key, name: purchasedItemName(label) };
  };
  // Po stvari: broj kupovina i deo stvarnog iznosa racuna (srazmerno cenama sa liste; bez cene = prosek iz tog racuna)
  function purchasedItemStats(entries, months, category, shoppingItems){
    const owners = aliasOwners(shoppingItems, normShoppingName);
    const map = new Map();
    (entries || []).forEach(e => {
      if(!isPaidExp(e) || !Array.isArray(e.items) || !e.items.length) return;
      if(months && !months.includes(e.date.slice(0, 7))) return;
      if(category && e.category !== category) return;
      const prices = Array.isArray(e.itemPrices) && e.itemPrices.length === e.items.length ? e.itemPrices : null;
      const priced = prices ? prices.filter(p => p > 0) : [];
      const avg = priced.length ? priced.reduce((s, p) => s + p, 0) / priced.length : 0;
      const weights = priced.length ? prices.map(p => p > 0 ? p : avg) : null;
      const W = weights ? weights.reduce((s, w) => s + w, 0) : 0;
      e.items.forEach((label, i) => {
        const { key, name } = purchaseOwner(owners, label);
        if(!key) return;
        if(!map.has(key)) map.set(key, { key, name, count: 0, amount: null, withAmount: 0 });
        const g = map.get(key);
        g.count++;
        if(weights && W > 0){ g.amount = round2((g.amount || 0) + e.amount * weights[i] / W); g.withAmount++; }
      });
    });
    return [...map.values()].sort((a, b) => (b.amount || 0) - (a.amount || 0) || b.count - a.count || a.name.localeCompare(b.name));
  }
  const dayNumber = iso => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000);
  // "Vreme je da kupis": stvari kupljene bar 3 dana, medijan razmaka, proslo >= interval; bez needed i sakrivenih
  function purchaseDateSets(entries, shopping){
    const owners = aliasOwners(shopping && shopping.items, normShoppingName);
    const dates = new Map(), names = new Map();
    (entries || []).forEach(e => {
      if(!isPaidExp(e) || !Array.isArray(e.items)) return;
      e.items.forEach(label => {
        const { key, name } = purchaseOwner(owners, label);
        if(!key) return;
        if(!dates.has(key)){ dates.set(key, new Set()); names.set(key, name); }
        dates.get(key).add(e.date);
      });
    });
    return { dates, names };
  }
  // Poslednja kupovina po stvari (kljuc kao u predlozima)
  function lastPurchaseDates(entries, shopping){
    const out = new Map();
    purchaseDateSets(entries, shopping).dates.forEach((set, key) => out.set(key, [...set].sort().pop()));
    return out;
  }
  // Sakrivanje vazi samo do sledece kupovine: posle nje (ili kad stvari vise nema u kupovinama) se izbacuje
  function pruneDismissed(entries, shopping){
    const last = lastPurchaseDates(entries, shopping), src = (shopping && shopping.dismissed) || {}, out = {};
    Object.keys(src).forEach(k => { const l = last.get(k); if(l && src[k] >= l) out[k] = src[k]; });
    return out;
  }
  function restockSuggestions(entries, shopping, todayISO){
    const items = (shopping && shopping.items) || [];
    const dismissed = (shopping && shopping.dismissed) || {};
    const { dates, names } = purchaseDateSets(entries, shopping);
    const today = dayNumber(todayISO);
    const out = [];
    dates.forEach((set, key) => {
      const ds = [...set].sort();
      if(ds.length < 3) return;
      const gaps = ds.slice(1).map((d, i) => dayNumber(d) - dayNumber(ds[i])).sort((a, b) => a - b);
      const mid = gaps.length >> 1;
      const interval = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
      const last = ds[ds.length - 1];
      const since = today - dayNumber(last);
      if(interval <= 0 || since < interval) return;
      if(dismissed[key] && dismissed[key] >= last) return;
      const item = items.find(i => normShoppingName(i.name) === key);
      if(item && item.needed) return;
      out.push({ name: item ? item.name : names.get(key), key, intervalDays: Math.round(interval), daysSince: since, itemId: item ? item.id : null });
    });
    return out.sort((a, b) => (b.daysSince / b.intervalDays) - (a.daysSince / a.intervalDays) || a.name.localeCompare(b.name)).slice(0, 5);
  }

  // ---------- Kucni racuni (struja, plin, voda… po lokacijama) ----------
  const BILL_KEYS = { locations: 'budzet-lokacije-v1', types: 'budzet-vrste-racuna-v1', bills: 'budzet-kucni-racuni-v1' };
  // Poredjenje naziva bez velikih slova i dijakritika ("Struja" == "struja", "Potrošnja" == "potrosnja")
  const foldText = s => String(s == null ? '' : s).toLowerCase().replace(/đ/g, 'dj').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const isStr = v => typeof v === 'string' && v.trim() !== '';
  // id-jevi i kljucevi merenja idu u HTML atribute (data-*, value) — samo slova, cifre, _ i -
  const isId = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v);
  const isMetricKey = v => typeof v === 'string' && /^m\d{1,4}$/.test(v);
  function defaultBillTypes(locationId, category, newId){
    const mk = (name, metrics) => ({ id: newId(), locationId, name, category, metrics });
    return [
      mk('Struja', [{ key: 'm1', name: 'Skupa', unit: 'kWh' }, { key: 'm2', name: 'Jeftina', unit: 'kWh' }]),
      mk('Plin', [{ key: 'm1', name: 'Potrošnja', unit: 'm³' }]),
      mk('Voda', [{ key: 'm1', name: 'Potrošnja', unit: 'm³' }]),
      mk('Internet', [])
    ];
  }
  function cleanLocations(arr, currencies){
    return (Array.isArray(arr) ? arr : []).filter(l => l && isId(l.id) && isStr(l.name))
      .map(l => ({ id: l.id, name: l.name.trim().slice(0, 60), currency: (currencies || []).includes(l.currency) ? l.currency : 'RSD' }));
  }
  function cleanBillTypes(arr, locationIds){
    return (Array.isArray(arr) ? arr : []).filter(t => t && isId(t.id) && isStr(t.name) && (locationIds || []).includes(t.locationId))
      .map(t => ({ id: t.id, locationId: t.locationId, name: t.name.trim().slice(0, 60), category: isStr(t.category) ? t.category : 'Ostalo',
        metrics: (Array.isArray(t.metrics) ? t.metrics : []).filter(m => m && isMetricKey(m.key) && isStr(m.name))
          .map(m => ({ key: m.key, name: m.name.trim().slice(0, 40), unit: String(m.unit || '').trim().slice(0, 12) })) }));
  }
  const isoDateOk = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  function cleanBills(arr, typeIds){
    return (Array.isArray(arr) ? arr : []).filter(b => b && isId(b.id) && (typeIds || []).includes(b.billTypeId) && /^\d{4}-(0[1-9]|1[0-2])$/.test(b.month || ''))
      .map(b => {
        const amount = parseAmount(b.amount);
        const values = {};
        const src = b.values && typeof b.values === 'object' ? b.values : {};
        Object.keys(src).forEach(k => { const v = parseAmount(src[k]); if(isMetricKey(k) && Number.isFinite(v) && v >= 0) values[k] = v; });
        const out = { id: b.id, billTypeId: b.billTypeId, month: b.month, amount: Number.isFinite(amount) && amount > 0 ? round2(amount) : 0,
          currency: /^[A-Z]{3}$/.test(b.currency || '') ? b.currency : 'RSD', values, source: ['ai', 'qr', 'manual', 'excel'].includes(b.source) ? b.source : 'manual' };
        if(isoDateOk(b.periodFrom)) out.periodFrom = b.periodFrom;
        if(isoDateOk(b.periodTo)) out.periodTo = b.periodTo;
        if(isoDateOk(b.dueDate)) out.dueDate = b.dueDate;
        if(/^\d{4}-(0[1-9]|1[0-2])$/.test(b.expenseMonth || '')) out.expenseMonth = b.expenseMonth;
        const payee = b.payee && cleanPayee(b.payee); if(payee) out.payee = payee;
        ['entryId', 'recurringId'].forEach(k => { if(isId(b[k])) out[k] = b[k]; });
        if(isAttachmentName(b.file)) out.file = b.file;
        return out;
      });
  }

  // Uputstvo za AI model: oblik odgovora + spisak lokacija i vrsta (sa id-jevima) koje korisnik ima
  function billsPrompt(locations, billTypes){
    const lines = (locations || []).map(l => {
      const types = (billTypes || []).filter(t => t.locationId === l.id).map(t =>
        `${t.name} (id: ${t.id}; merenja: ${t.metrics.length ? t.metrics.map(m => `${m.key} = ${m.name} [${m.unit}]`).join(', ') : 'nema'})`);
      return `- lokacija "${l.name}" (id: ${l.id}, valuta ${l.currency}): ${types.join('; ') || 'nema vrsta'}`;
    });
    return [
      'Čitaš račun za komunalije (struja, plin, voda, internet, grejanje…) iz Srbije ili BiH, sa slike ili iz teksta PDF-a.',
      'Vrati SAMO jedan JSON objekat, bez objašnjenja, tačno ovog oblika:',
      '{"locationId":"","billTypeId":"","month":"YYYY-MM","periodFrom":"YYYY-MM-DD","periodTo":"YYYY-MM-DD","amount":0,"currency":"RSD","dueDate":"YYYY-MM-DD","values":{"m1":0},"payee":{"name":"","account":"","reference":""},"confidence":{"amount":"high"}}',
      'Lokacije i vrste računa korisnika (izaberi id koji odgovara; ako ništa ne odgovara, stavi ""):',
      ...lines,
      'Pravila:',
      '- amount je UKUPAN iznos za uplatu na ovom računu, kao JSON broj sa tačkom (4456.16).',
      '- month je obračunski mesec (mesec potrošnje), ne mesec plaćanja.',
      '- values: potrošnja u obračunskom periodu po ključu merenja (ne stanje brojila). Viša tarifa / VT / skupa → merenje "Skupa"; niža tarifa / NT / jeftina → "Jeftina".',
      '- confidence: za svako polje koje si upisao "high" ili "low" (low ako nisi siguran).',
      '- Ako nešto ne vidiš, stavi null. Ne izmišljaj brojeve.'
    ].join('\n');
  }
  // JSON iz odgovora modela: prihvata i tekst oko njega ili ```json blok
  function extractJson(raw){
    if(raw && typeof raw === 'object') return raw;
    const s = String(raw || '');
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if(a < 0 || b <= a) return null;
    try { const o = JSON.parse(s.slice(a, b + 1)); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch(e) { return null; }
  }
  const readDate = v => { if(!v) return ''; const s = String(v).trim(); if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; return parseFlexibleDate(s) || ''; };
  // Odgovor modela -> polja za prozor potvrde; low = polja koja treba proveriti (nesigurna ili prazna)
  function cleanBillReading(raw, ctx){
    const o = extractJson(raw);
    if(!o) return null;
    const locs = ctx.locations || [], types = ctx.billTypes || [];
    let loc = locs.find(l => l.id === o.locationId) || null;
    let type = types.find(t => t.id === o.billTypeId) || null;
    if(type && loc && type.locationId !== loc.id) type = null;
    if(type && !loc) loc = locs.find(l => l.id === type.locationId) || null;
    const conf = o.confidence && typeof o.confidence === 'object' ? o.confidence : {};
    const low = new Set(Object.keys(conf).filter(k => conf[k] === 'low'));
    const periodFrom = readDate(o.periodFrom), periodTo = readDate(o.periodTo);
    let month = /^\d{4}-(0[1-9]|1[0-2])$/.test(o.month || '') ? o.month : '';
    if(!month) month = (periodTo || periodFrom).slice(0, 7);
    const amt = parseAmount(o.amount);
    const cur = String(o.currency || '').toUpperCase();
    const values = {};
    if(type){
      const src = o.values && typeof o.values === 'object' ? o.values : {};
      type.metrics.forEach(m => { const v = parseAmount(src[m.key]); if(Number.isFinite(v) && v >= 0) values[m.key] = v; });
    }
    const p = o.payee && typeof o.payee === 'object' ? o.payee : null;
    const payee = p && (p.name || p.account) ? { name: String(p.name || '').trim().slice(0, 70), account: normalizeAccount(p.account) || String(p.account || '').trim().slice(0, 40),
      reference: String(p.reference || '').trim().slice(0, 33), model: String(p.model || '').trim().slice(0, 2) } : null;
    const out = { locationId: loc ? loc.id : '', billTypeId: type ? type.id : '', month, periodFrom, periodTo,
      amount: Number.isFinite(amt) && amt > 0 ? round2(amt) : null,
      currency: (ctx.currencies || []).includes(cur) ? cur : (loc ? loc.currency : 'RSD'),
      dueDate: readDate(o.dueDate), values, payee };
    if(!out.billTypeId) low.add('billTypeId');
    if(!out.month) low.add('month');
    if(out.amount == null) low.add('amount');
    out.low = [...low].filter(k => k !== 'values');
    return out;
  }
  const EMPTY_READING = () => ({ locationId: '', billTypeId: '', month: '', periodFrom: '', periodTo: '', amount: null, currency: 'RSD', dueDate: '', values: {}, payee: null, low: ['billTypeId', 'month', 'amount'] });
  // IPS QR sa uplatnice je pouzdaniji od AI-ja za iznos i podatke primaoca; razlika u iznosu -> polje za proveru
  function mergeBillQr(reading, qr){
    const r = Object.assign(EMPTY_READING(), reading || {});
    r.low = (r.low || []).slice();
    if(!qr) return r;
    if(qr.amount > 0){
      if(r.amount != null && Math.abs(r.amount - qr.amount) > 0.01){ if(!r.low.includes('amount')) r.low.push('amount'); }
      else r.low = r.low.filter(k => k !== 'amount');
      r.amount = round2(qr.amount);
      if(qr.currency) r.currency = qr.currency;
    }
    r.payee = cleanPayee(Object.assign({}, r.payee || {}, { account: qr.account, name: qr.name || (r.payee && r.payee.name), code: qr.code, purpose: qr.purpose, model: qr.model, reference: qr.reference })) || r.payee;
    return r;
  }

  // Kljuc novog merenja: posle svih kljuceva vrste I onih koji jos stoje u racunima (obrisano merenje ne sme da ozivi pod drugim imenom)
  // Tekst iz PDF-a pre slanja AI-ju: bez visestrukih razmaka, praznih redova i redova bez ijednog slova
  // (ose grafikona i sl.) — manje tokena (besplatan Groq nivo ima limit tokena u minuti)
  function compactBillText(text, max){
    const lines = String(text || '').split(/\r?\n/).map(l => l.replace(/[ \t ]+/g, ' ').trim()).filter(l => /\p{L}/u.test(l));
    let out = lines.join('\n');
    if(out.length > max){ out = out.slice(0, max); const nl = out.lastIndexOf('\n'); if(nl > max / 2) out = out.slice(0, nl); }
    return out;
  }
  function nextMetricKey(type, bills){
    const num = k => parseInt(String(k).slice(1), 10) || 0;
    let max = (type.metrics || []).reduce((mx, m) => Math.max(mx, num(m.key)), 0);
    (bills || []).forEach(b => { if(b.billTypeId === type.id && b.values) Object.keys(b.values).forEach(k => { max = Math.max(max, num(k)); }); });
    return 'm' + (max + 1);
  }
  function findBillDuplicate(bills, billTypeId, month, exceptId){
    return (bills || []).find(b => b.billTypeId === billTypeId && b.month === month && b.id !== exceptId) || null;
  }
  // Ponavljajuca stavka za racun: ista kategorija, opis sadrzi naziv vrste ("EPS – Struja" ~ Struja), u mesecu jos nije placena
  function findRecurringForBill(recurring, billType, month, state){
    if(!billType || !month) return null;
    const s = state || {};
    const ids = new Set((s.entries || []).map(e => e.id));
    const name = foldText(billType.name);
    return (recurring || []).find(r => r.type !== 'income' && r.category === billType.category && foldText(r.desc).includes(name)
      && isDueInMonth(r, month) && !isRecurringPaid(s.applied, r, month) && !isRecurringSkipped(s.skipped, r, month)
      && !ids.has(recurringEntryId(r, month))) || null;
  }
  // Godisnja tabela po lokacijama: iznosi po vrsti i potrosnja po merenju (meseci 1-12 + zbir).
  // missing = vrsta ima racune te godine, a za mesec pre tekuceg ga nema.
  function billsTable(bills, billTypes, locations, year, currentMonth){
    const months = Array.from({ length: 12 }, (_, i) => year + '-' + pad2(i + 1));
    const inYear = (bills || []).filter(b => b.month && b.month.slice(0, 4) === String(year));
    const empty = () => Array(12).fill(null);
    const add = (arr, i, v) => { arr[i] = round2((arr[i] || 0) + v); };
    // zbir je null kad red nema nijedan podatak (prikazuje se prazno, ne 0)
    const sum = cells => cells.some(v => v != null) ? round2(cells.reduce((s, v) => s + (v || 0), 0)) : null;
    return { locations: (locations || []).map(l => {
      const types = (billTypes || []).filter(t => t.locationId === l.id);
      const rows = types.map(t => {
        const cells = empty(), billIds = months.map(() => []);
        inYear.filter(b => b.billTypeId === t.id).forEach(b => { const i = months.indexOf(b.month); add(cells, i, b.amount || 0); billIds[i].push(b.id); });
        // "fali" = posle prvog racuna te vrste (bilo koje godine) i pre tekuceg meseca, a racuna nema
        const first = (bills || []).filter(b => b.billTypeId === t.id && b.month).reduce((mn, b) => (!mn || b.month < mn) ? b.month : mn, '');
        const missing = months.map((m, i) => !!first && m > first && m < currentMonth && !billIds[i].length);
        return { typeId: t.id, name: t.name, cells, billIds, missing, total: sum(cells) };
      });
      const metricRows = [];
      types.forEach(t => t.metrics.forEach(m => {
        const cells = empty();
        inYear.filter(b => b.billTypeId === t.id && b.values && typeof b.values[m.key] === 'number').forEach(b => add(cells, months.indexOf(b.month), b.values[m.key]));
        metricRows.push({ typeId: t.id, key: m.key, label: t.metrics.length > 1 ? t.name + ' – ' + m.name : t.name, unit: m.unit, cells, total: sum(cells) });
      }));
      return { id: l.id, name: l.name, currency: l.currency, rows, metricRows, total: round2(rows.reduce((s, r) => s + (r.total || 0), 0)) };
    }) };
  }
  // Datum rashoda za izabrani mesec: tekuci mesec -> danas; rok placanja u tom mesecu -> rok; inace poslednji dan meseca
  function expenseDateFor(mKey, dueDate, today){
    if(today && today.slice(0, 7) === mKey) return today;
    if(dueDate && dueDate.slice(0, 7) === mKey) return dueDate;
    return mKey + '-' + pad2(daysInMonth(mKey));
  }

  // Uvoz godisnje tabele racuna iz Excela (korisnikov raspored): red sa mesecima "01. Januar"…,
  // blokovi "Kućni računi", "Kućni računi (Drvar)", "Kućni računi (potrošnja)", "Kućni računi (Drvar / potrošnja)".
  const MONTH_HEAD = /^\s*(\d{1,2})\s*\.\s*\S/;
  function parseBillsSheet(aoa){
    const rows = Array.isArray(aoa) ? aoa : [];
    const monthOf = c => { const m = MONTH_HEAD.exec(String(c == null ? '' : c)); return m && +m[1] >= 1 && +m[1] <= 12 ? +m[1] : 0; };
    const hi = rows.findIndex(r => (r || []).filter(c => monthOf(c)).length >= 2);
    if(hi < 0) return null;
    const cols = {};
    rows[hi].forEach((c, i) => { const m = monthOf(c); if(m && cols[m] == null) cols[m] = i; });
    let year = null;
    for(let i = 0; i <= hi && !year; i++) (rows[i] || []).forEach(c => { const m = /\b(20\d\d)\b/.exec(String(c)); if(m && !year) year = +m[1]; });
    const blocks = [];
    let cur = null;
    for(let i = hi + 1; i < rows.length; i++){
      const r = rows[i] || [];
      const head = String(r[0] == null ? '' : r[0]).trim(), label = String(r[1] == null ? '' : r[1]).trim();
      if(head && /^kucni racuni/.test(foldText(head))){
        const inner = (/\(([^)]*)\)/.exec(head) || [, ''])[1].split('/').map(s => s.trim()).filter(Boolean);
        const isCons = s => /^potro/.test(foldText(s));
        cur = { location: inner.filter(s => !isCons(s))[0] || '', consumption: inner.some(isCons), rows: [] };
        blocks.push(cur);
      } else if(head){ cur = null; }
      if(!cur || !label || /^(kategorija|racun)$/.test(foldText(label))) continue;
      const values = Array.from({ length: 12 }, (_, m) => { const c = cols[m + 1]; if(c == null) return null; const v = parseAmount(r[c]); return Number.isFinite(v) ? v : null; });
      if(values.some(v => v != null)) cur.rows.push({ label, values });
    }
    return blocks.length ? { year, blocks } : null;
  }
  // Tabela -> nove lokacije/vrste/merenja + racuni (iznos i potrosnja iste vrste i meseca u jednom racunu); postojeci se preskacu
  function billsFromSheet(parsed, ctx){
    const out = { newLocations: [], newTypes: [], changedTypes: [], bills: [], duplicates: 0 };
    if(!parsed || !parsed.year) return out;
    const locations = (ctx.locations || []).slice(), types = (ctx.billTypes || []).map(t => ({ ...t, metrics: t.metrics.slice() }));
    const locFor = name => {
      if(!name) return locations.find(l => l.id === ctx.primaryLocationId) || locations[0];
      let l = locations.find(x => foldText(x.name) === foldText(name));
      if(!l){ l = { id: ctx.newId(), name, currency: (ctx.newLocationCurrency || {})[name] || 'RSD' }; locations.push(l); out.newLocations.push(l); }
      return l;
    };
    const typeFor = (loc, name) => {
      let t = types.find(x => x.locationId === loc.id && foldText(x.name) === foldText(name));
      if(!t){ t = { id: ctx.newId(), locationId: loc.id, name, category: ctx.category || 'Ostalo', metrics: [] }; types.push(t); out.newTypes.push(t); }
      return t;
    };
    const metricFor = (t, name) => {
      let m = name ? t.metrics.find(x => foldText(x.name) === foldText(name)) : (t.metrics.length === 1 ? t.metrics[0] : null);
      if(!m){
        m = { key: nextMetricKey(t, ctx.bills), name: name || 'Potrošnja', unit: '' };
        t.metrics.push(m);
        if(!out.newTypes.includes(t) && !out.changedTypes.includes(t)) out.changedTypes.push(t);
      }
      return m;
    };
    const acc = new Map();
    const slot = (t, loc, i) => {
      const month = parsed.year + '-' + pad2(i + 1), k = t.id + '|' + month;
      if(!acc.has(k)) acc.set(k, { id: ctx.newId(), billTypeId: t.id, month, amount: 0, currency: loc.currency, values: {}, source: 'excel' });
      return acc.get(k);
    };
    parsed.blocks.forEach(b => {
      const loc = locFor(b.location);
      b.rows.forEach(r => {
        const [typeName, metricName] = r.label.split(/\s+[-–]\s+/);
        const t = typeFor(loc, typeName.trim());
        const m = b.consumption ? metricFor(t, metricName ? metricName.trim().replace(/^./, c => c.toUpperCase()) : '') : null;
        r.values.forEach((v, i) => {
          if(v == null) return;
          if(m){ if(v >= 0) slot(t, loc, i).values[m.key] = v; }
          else if(v > 0) slot(t, loc, i).amount = round2(v);
        });
      });
    });
    acc.forEach(bill => {
      if(findBillDuplicate(ctx.bills, bill.billTypeId, bill.month)) out.duplicates++;
      else out.bills.push(bill);
    });
    return out;
  }

  // ---------- Fiskalni racun iz prodavnice ----------
  const ATTACH_RE = /^[^\\/:*?"<>|]+\.(pdf|jpe?g|png|webp|heic)$/i;
  const isAttachmentName = n => typeof n === 'string' && n.length <= 160 && n[0] !== '.' && ATTACH_RE.test(n);
  const itemKey = label => foldText(purchasedItemName(label));
  function receiptPrompt(categories){
    return [
      'Čitaš fiskalni račun iz prodavnice (Srbija/BiH), sa slike ili iz teksta. Slika može biti samo DEO dugačkog računa.',
      'Vrati SAMO jedan JSON objekat tačno ovog oblika:',
      '{"store":"","date":"YYYY-MM-DD","total":0,"items":[{"raw":"","name":"","qty":1,"unit":"kom","price":0,"category":"","discount":0}],"confidence":{"total":"high"}}',
      'Pravila:',
      '- items: svaki red sa artiklom, redom kako stoje na računu. raw = tekst reda; name = kratko ime stvari na srpskom (npr. "Mleko", "Hleb", "Deterdžent").',
      '- price = UKUPNA cena reda (količina × jedinična cena) kao JSON broj sa tačkom. Popust u posebnom redu = stavka sa negativnom cenom i "discount":1.',
      '- category: jedna od ovih kategorija korisnika ili "": ' + (categories || []).map(c => '"' + c + '"').join(', ') + '.',
      '- total = UKUPNO za plaćanje (ako se na ovom delu ne vidi, stavi null). store i date samo ako se vide.',
      '- Ne izmišljaj redove ni cene; nečitljivo = null. Ne vraćaj PDV rekapitulaciju, načine plaćanja ni kusur kao stavke.'
    ].join('\n');
  }
  // "SAPUN DOVE 100G" -> "Sapun dove" (bez brojeva, jedinica i znakova)
  const shortItemName = raw => {
    const s = String(raw || '').replace(/\d+([.,]\d+)?\s*(%|kg|gr?|l|ml|kom|x)?(?![\p{L}])/giu, ' ').replace(/[^\p{L}\s-]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    return s ? s[0].toUpperCase() + s.slice(1) : '';
  };
  function cleanReceiptReading(raw, ctx){
    const o = extractJson(raw);
    if(!o) return null;
    const cats = (ctx && ctx.categories) || [];
    const catFor = c => cats.find(x => foldText(x) === foldText(c)) || '';
    const items = (Array.isArray(o.items) ? o.items : []).filter(i => i && typeof i === 'object').map(i => {
      const rawText = String(i.raw || '').trim().slice(0, 120);
      const name = (String(i.name || '').trim() || shortItemName(rawText)).slice(0, 60);
      const price = parseAmount(i.price);
      const qty = parseQtyNum(i.qty);
      const discount = !!i.discount || (Number.isFinite(price) && price < 0);
      // popust je uvek negativan, i kad ga AI procita kao pozitivan iznos ("POPUST 15,00")
      return { raw: rawText, name, qty: Number.isFinite(qty) && qty > 0 ? qty : 1, unit: normUnit(i.unit) || String(i.unit || '').trim().slice(0, 8),
        price: Number.isFinite(price) ? round2(discount ? -Math.abs(price) : price) : null, category: catFor(i.category), discount };
    }).filter(i => i.name || i.price != null);
    const total = parseAmount(o.total);
    const out = { store: String(o.store || '').trim().slice(0, 60), date: readDate(o.date), total: Number.isFinite(total) && total > 0 ? round2(total) : null, items, low: [] };
    if(!out.date) out.low.push('date');
    if(out.total == null) out.low.push('total');
    if(!items.length) out.low.push('items');
    return out;
  }
  // Isti red na spoju dve slike: tekst (samo slova i cifre, "2,8%" = "2.8%") ili kratko ime + ista cena
  const lineKeys = i => [i.raw, i.name].map(x => foldText(x).replace(/[^a-z0-9]/g, '')).filter(Boolean).map(k => k + '|' + i.price);
  const sameLine = (x, y) => { const b = lineKeys(y); return lineKeys(x).some(k => b.includes(k)); };
  // Najduze preklapanje (do 8 redova): kraj prve liste = pocetak druge
  function overlapLen(prev, next){
    for(let k = Math.min(8, prev.length, next.length); k >= 1; k--){
      let ok = true;
      for(let j = 0; j < k && ok; j++) ok = sameLine(prev[prev.length - k + j], next[j]);
      if(ok) return k;
    }
    return 0;
  }
  const priceSum = items => items.reduce((s, i) => s + (i.price || 0), 0);
  // Delovi dugackog racuna (vise slika) -> jedan; redovi na spoju racunaju se jednom, osim kad bi tek sa njima zbir bio jednak ukupnom
  function mergeReceiptParts(parts){
    const list = (parts || []).filter(Boolean);
    if(!list.length) return null;
    const tagged = list.map((p, pi) => (p.items || []).map(i => Object.assign({}, i, { part: pi })));
    let items = [];
    tagged.forEach(next => { items.push(...next.slice(overlapLen(items, next))); });
    const first = f => (list.find(p => p[f]) || {})[f] || '';
    const lastTotal = list.slice().reverse().find(p => p.total != null);
    if(lastTotal){
      const all = [].concat(...tagged);
      if(Math.abs(priceSum(items) - lastTotal.total) > 0.5 && Math.abs(priceSum(all) - lastTotal.total) <= 0.5) items = all;
    }
    const out = { store: first('store'), date: first('date'), total: lastTotal ? lastTotal.total : null, items, low: [] };
    if(!out.date) out.low.push('date');
    if(out.total == null) out.low.push('total');
    if(!items.length) out.low.push('items');
    return out;
  }
  // Deo procitan kasnije ("Dodaj jos sliku", "Pokusaj ponovo"): ubaci ga na njegovo mesto, a korisnikove izmene ostalih stavki ostaju
  function insertReceiptPart(items, partIndex, newItems){
    const cur = (items || []).filter(i => i.part !== partIndex);
    let pos = cur.findIndex(i => (i.part || 0) > partIndex);
    if(pos < 0) pos = cur.length;
    const head = cur.slice(0, pos), tail = cur.slice(pos);
    let mid = (newItems || []).map(i => Object.assign({}, i, { part: partIndex }));
    mid = mid.slice(overlapLen(head, mid));
    mid = mid.slice(0, mid.length - overlapLen(mid, tail));
    return head.concat(mid, tail);
  }
  // Popust (negativna stavka) se oduzima od prethodne stavke; veci od nje ili bez prethodne -> srazmerno na sve sa cenom
  function applyReceiptDiscounts(items){
    const out = [];
    const spread = (targets, d) => {
      const sum = targets.reduce((s, x) => s + x.price, 0);
      if(sum <= 0) return;
      let left = Math.min(Math.round(-d * 100), Math.round(sum * 100));
      targets.forEach((x, idx) => {
        const cut = idx === targets.length - 1 ? left : Math.min(left, Math.round(-d * 100 * x.price / sum));
        x.price = Math.max(0, (Math.round(x.price * 100) - cut) / 100); left -= cut;
      });
    };
    const pending = [];
    (items || []).forEach(i => {
      if(!(i.discount && i.price != null && i.price < 0)){ out.push(Object.assign({}, i)); return; }
      const prev = [...out].reverse().find(x => x.price > 0);
      if(prev && prev.price + i.price >= 0) prev.price = round2(prev.price + i.price);
      else if(out.some(x => x.price > 0)) spread(out.filter(x => x.price > 0), i.price);
      else pending.push(i.price);
    });
    pending.forEach(d => spread(out.filter(x => x.price > 0), d));
    return out;
  }

  // Kategorija po stvari: poslednji rashod u kome se pojavila; kategorija sa liste za kupovinu ima prednost
  function itemCategoryMemory(entries, shoppingItems){
    const m = new Map();
    (entries || []).filter(e => e && e.type === 'expense' && Array.isArray(e.items) && e.category)
      .slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .forEach(e => e.items.forEach(l => { const k = itemKey(l); if(k) m.set(k, e.category); }));
    (shoppingItems || []).forEach(i => { const k = itemKey(i && i.name); if(k && i.category) m.set(k, i.category); });
    return m;
  }
  // Stavke racuna <-> trazene stavke sa liste: prvo tacno ime, pa ime sa liste kao pocetak ("Mleko" ~ "Mleko Imlek 2,8%"); svaka jednom
  function matchReceiptToShopping(items, shoppingItems){
    const cands = (shoppingItems || []).filter(s => s && s.needed);
    const used = new Set(), taken = new Set(), out = [];
    const pass = test => (items || []).forEach((it, idx) => {
      if(taken.has(idx)) return;
      const s = cands.find(c => !used.has(c.id) && test(it, foldText(c.name)));
      if(s){ used.add(s.id); taken.add(idx); out.push({ receiptIndex: idx, shoppingId: s.id }); }
    });
    const starts = (text, word) => { const t = foldText(text); return !!word && t.startsWith(word) && !/\p{L}/u.test(t.charAt(word.length)); };
    pass((it, w) => foldText(it.name) === w);
    pass((it, w) => starts(it.name, w) || starts(it.raw, w));
    return out;
  }
  // Stavke -> rashod po kategoriji; iznos = zbir cena, a razlika do unetog ukupnog ide srazmerno (tacno na pare)
  function receiptToExpenses(items, total){
    const groups = new Map();
    // rucno upisana negativna cena = popust (oduzima se od prethodne stavke, ne ide u itemPrices)
    applyReceiptDiscounts((items || []).map(i => i && i.price < 0 && !i.discount ? Object.assign({}, i, { discount: true }) : i)).forEach(i => { const c = i.category || 'Ostalo'; if(!groups.has(c)) groups.set(c, []); groups.get(c).push(i); });
    const rows = [...groups.entries()].map(([category, its]) => ({ category, items: its, itemPrices: its.map(i => i.price != null ? i.price : null),
      cents: its.reduce((s, i) => s + (i.price > 0 ? Math.round(i.price * 100) : 0), 0) }));
    if(!rows.length) return [];
    const sumC = rows.reduce((s, r) => s + r.cents, 0);
    const target = total > 0 ? Math.round(total * 100) : sumC;
    if(sumC > 0 && target !== sumC) rows.forEach(r => { r.cents = Math.round(r.cents * target / sumC); });
    else if(sumC === 0) rows.forEach((r, i) => { r.cents = i === 0 ? target : 0; });
    rows.sort((a, b) => b.cents - a.cents || a.category.localeCompare(b.category));
    rows[0].cents += target - rows.reduce((s, r) => s + r.cents, 0);
    // kategorija bez iznosa (stavke bez cene) ne pravi rashod od 0 — stavke idu u najveci rashod, bez cene
    const big = rows[0];
    rows.slice(1).filter(r => r.cents <= 0).forEach(r => { big.items = big.items.concat(r.items); big.itemPrices = big.itemPrices.concat(r.items.map(() => null)); });
    return rows.filter(r => r === big || r.cents > 0).map(r => ({ category: r.category, amount: r.cents / 100, items: r.items, itemPrices: r.itemPrices }));
  }
  // Isti racun vec unet: rashodi iste grupe (receiptId) tog dana sa zbirom +-1 din
  function findReceiptDuplicate(entries, date, total){
    const sums = new Map();
    (entries || []).forEach(e => { if(e && e.type === 'expense' && e.receiptId && e.date === date) sums.set(e.receiptId, (sums.get(e.receiptId) || 0) + e.amount); });
    for(const [id, s] of sums) if(Math.abs(s - total) <= 1) return id;
    return null;
  }

  // ---------- Uplatnica (nalog za uplatu) bez QR koda -> podaci za IPS placanje ----------
  function slipPrompt(){
    return [
      'Čitaš nalog za uplatu (uplatnicu) iz Srbije, sa slike ili iz teksta PDF-a.',
      'Vrati SAMO jedan JSON objekat tačno ovog oblika:',
      '{"name":"","account":"","code":"","amount":0,"currency":"RSD","purpose":"","model":"","reference":""}',
      'Pravila:',
      '- name = primalac (naziv i mesto), NE uplatilac. account = račun primaoca tačno kako piše (npr. 160-0000000012345-67).',
      '- code = šifra plaćanja (3 cifre, npr. 189). amount = iznos kao JSON broj sa tačkom. purpose = svrha uplate.',
      '- model = broj modela (npr. 97) ako postoji; reference = poziv na broj (odobrenje) primaoca.',
      '- Prepiši cifre tačno, bez izmišljanja; ako se nešto ne vidi, stavi "" ili null.'
    ].join('\n');
  }
  function cleanSlipReading(raw){
    const o = extractJson(raw);
    if(!o) return null;
    const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
    const name = str(o.name, 70), accountRaw = str(o.account, 40);
    if(!name && !accountRaw) return null;
    const code = str(o.code, 5).replace(/\D/g, '');
    const amount = parseAmount(o.amount);
    const cur = str(o.currency, 3).toUpperCase();
    const reference = str(o.reference, 40).replace(/\s+/g, '').slice(0, 33);
    let model = str(o.model, 6).replace(/\D/g, '').slice(0, 2);
    // AI cesto propusti polje "model": ako poziv na broj prolazi kontrolu modela 97, to je model 97
    if(!model && reference && validReference97(reference)) model = '97';
    return {
      name, account: normalizeAccount(accountRaw) || accountRaw,
      code: /^\d{3}$/.test(code) ? code : '',
      amount: Number.isFinite(amount) && amount > 0 ? round2(amount) : null,
      currency: /^[A-Z]{3}$/.test(cur) ? cur : 'RSD',
      purpose: str(o.purpose, 35),
      model, reference
    };
  }
  // Upozorenja za podatke koje je procitao AI (ne blokiraju placanje): poziv na broj bez modela 97 nema kontrolu
  function slipWarnings(p){
    const out = [];
    if(p && p.reference && p.model !== '97') out.push('Poziv na broj nije proveren kontrolnim brojem — uporedi ga sa uplatnicom pre plaćanja.');
    return out;
  }

  // ---------- Uvoz izvoda: AI predlog kategorije za nepoznate opise (salju se samo opisi) ----------
  const importDescKey = d => foldText(d).replace(/\s+/g, ' ');
  // rashodi bez pravila/istorije (catSource 'default'), jedinstveni opisi sa brojem stavki
  function importAiCandidates(rows){
    const map = new Map();
    (rows || []).forEach(r => {
      if(!r || r.type !== 'expense' || r.catSource !== 'default' || !String(r.desc || '').trim()) return;
      const key = importDescKey(r.desc);
      if(!map.has(key)) map.set(key, { key, desc: String(r.desc).trim().replace(/\s+/g, ' '), count: 0, raws: [] });
      const c = map.get(key); c.count++;
      if(!c.raws.includes(r.desc)) c.raws.push(r.desc);
    });
    return [...map.values()];
  }
  function importCategoryPrompt(categories, candidates){
    return [
      'Za svaku stavku sa bankovnog izvoda (Srbija) predloži kategoriju rashoda i ključnu reč za pravilo.',
      'Vrati SAMO JSON: {"items":[{"i":0,"category":"","keyword":""}]}',
      '- category: tačno jedna od ovih kategorija korisnika ili "" ako nisi siguran: ' + (categories || []).map(c => '"' + c + '"').join(', ') + '.',
      '- keyword: kratak deo opisa koji označava prodavca/uslugu (npr. "LIDL", "WOLT", "NIS PETROL"), tačno kako piše u opisu; bez brojeva, grada i reči kao POS/KUPOVINA.',
      'Stavke:',
      ...(candidates || []).map((c, i) => i + ': ' + maskDigits(c.desc))
    ].join('\n');
  }
  // brojevi kartica/racuna (4+ cifre u nizu, i sa razmacima/crticama) ne idu AI-ju
  function maskDigits(text){
    return String(text || '').replace(/\d[\d\s\-\/.]*\d/g, m => (m.match(/\d/g) || []).length >= 4 ? '#' : m);
  }
  const KEYWORD_STOP = new Set(['karticom', 'pos', 'kupovina', 'placanje', 'uplata', 'isplata', 'kartica', 'karticom', 'visa', 'mastercard', 'maestro', 'dina', 'internet', 'web', 'order', 'beograd', 'novi', 'sad', 'doo', 'srbija', 'srb', 'ltd', 'www', 'com', 'rsd', 'trn', 'pmt']);
  // prva rec od bar 3 slova koja nije opsta (POS, KUPOVINA, grad…) — rezerva kad AI ne da upotrebljivu kljucnu rec
  function suggestKeyword(desc){
    const w = String(desc || '').split(/[^\p{L}]+/u).find(x => x.length >= 3 && !KEYWORD_STOP.has(foldText(x)));
    return w || '';
  }
  // Kljucna rec za pravilo: bar 3 slova, bez niza cifara, bar jedna rec koja nije opsta, i postoji u SVAKOM izvornom opisu
  // (pravilo se poredi sa izvornim opisom, samo bez velikih slova — kao categoryFromRules)
  function usableKeyword(kw, raws){
    const k = String(kw || '').trim();
    if(k.length < 3 || /\d{3,}/.test(k) || (k.match(/\p{L}/gu) || []).length < 3) return false;
    if(!k.split(/[^\p{L}]+/u).some(w => w.length >= 3 && !KEYWORD_STOP.has(foldText(w)))) return false;
    return (raws || []).every(r => String(r).toLowerCase().includes(k.toLowerCase()));
  }
  function cleanImportSuggestions(raw, categories, candidates){
    const o = extractJson(raw);
    if(!o || !Array.isArray(o.items)) return null;
    const cats = categories || [];
    const out = new Map();
    o.items.forEach(x => {
      const c = x && (candidates || [])[Number(x.i)];
      if(!c || !Number.isInteger(Number(x.i))) return;
      const category = cats.find(k => foldText(k) === foldText(x.category)) || '';
      let keyword = String(x.keyword || '').trim().slice(0, 30);
      if(!usableKeyword(keyword, c.raws && c.raws.length ? c.raws : [c.desc])) keyword = suggestKeyword(c.desc);
      out.set(c.key, { category, keyword, strong: keyword.length >= 4 });
    });
    return out;
  }
  // izabrani predlozi -> nova pravila (bez praznih, bez vec postojecih kljucnih reci)
  function rulesFromSuggestions(choices, existingRules){
    const have = new Set((existingRules || []).map(r => foldText(r.keyword)));
    const out = [];
    (choices || []).forEach(ch => {
      const kw = String(ch.keyword || '').trim();
      if(!ch.make || kw.length < 3 || !ch.category || have.has(foldText(kw))) return;
      have.add(foldText(kw));
      out.push({ keyword: kw, category: ch.category });
    });
    return out;
  }

  // ---------- Brzi unos obicnim recima: "kafa i kroasan 520 juce gotovinom" (lokalno, bez AI) ----------
  const QS_WEEKDAYS = { nedelja: 0, nedelju: 0, nedelje: 0, ponedeljak: 1, ponedeljka: 1, utorak: 2, utorka: 2, sreda: 3, sredu: 3, srede: 3,
    cetvrtak: 4, cetvrtka: 4, petak: 5, petka: 5, subota: 6, subotu: 6, subote: 6 };
  const QS_RELATIVE = { danas: 0, juce: 1, prekjuce: 2 };
  const QS_CURRENCY = { eur: 'EUR', evra: 'EUR', evro: 'EUR', '€': 'EUR', usd: 'USD', dolara: 'USD', dolar: 'USD', '$': 'USD', chf: 'CHF', franaka: 'CHF',
    gbp: 'GBP', funti: 'GBP', '£': 'GBP', bam: 'BAM', din: 'RSD', dinara: 'RSD', rsd: 'RSD' };
  const QS_UNITS = new Set(['kom', 'kg', 'g', 'gr', 'l', 'ml', 'pak', 'x']);
  const QS_CASH = new Set(['gotovinom', 'gotovina', 'gotovinu', 'kes', 'kesom', 'cash']);
  const QS_CARD = new Set(['karticom', 'kartica', 'kartici', 'karticu']);
  const QS_PREP = new Set(['u', 'sa', 'na', 'iz', 'od', 'za']);
  const qsIso = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  function parseQuickSentence(text, ctx){
    const c = ctx || {};
    const [ty, tm, td] = String(c.today || '').split('-').map(Number);
    const today = new Date(ty, tm - 1, td);
    const tokens = String(text || '').trim().split(/\s+/).filter(Boolean);
    const used = tokens.map(() => false);
    const f = tokens.map(foldText);
    const out = { desc: '', amount: null, currency: null, date: null, accountId: null };
    const usePrep = i => { if(i > 0 && !used[i - 1] && QS_PREP.has(f[i - 1])) used[i - 1] = true; };
    const setCur = code => { out.currency = code === 'RSD' ? null : code; };
    const mkDate = (y, m, d) => { const x = new Date(y, m - 1, d); return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d ? x : null; };
    const dayMonth = (d, m, yTxt) => {
      if(yTxt){ const y = +yTxt < 100 ? 2000 + +yTxt : +yTxt; return mkDate(y, m, d); }
      const x = mkDate(today.getFullYear(), m, d);
      return x && x > today ? mkDate(today.getFullYear() - 1, m, d) : x;   // buduci datum bez godine -> prosla godina
    };
    const nums = [];           // kandidati za iznos: { i, dm } (dm = "15.9" bez tacke na kraju, moze biti i datum)
    tokens.forEach((tok, i) => {
      if(used[i]) return;
      const dm = /^(\d{1,2})\.(\d{1,2})\.(?:(\d{2}|\d{4})\.?)?$/.exec(tok);
      if(dm){ const d = dayMonth(+dm[1], +dm[2], dm[3]); if(d){ out.date = qsIso(d); used[i] = true; } return; }
      if(f[i] in QS_RELATIVE){ const d = new Date(today); d.setDate(d.getDate() - QS_RELATIVE[f[i]]); out.date = qsIso(d); used[i] = true; return; }
      if(f[i] in QS_WEEKDAYS){ const d = new Date(today); d.setDate(d.getDate() - ((today.getDay() - QS_WEEKDAYS[f[i]] + 7) % 7)); out.date = qsIso(d); used[i] = true; usePrep(i); return; }
      if(!c.noAmount){
        const a1 = /^(\d[\d.,]*)(€|\$|£|eur|din|rsd|bam)$/i.exec(tok), a2 = /^(€|\$|£)(\d[\d.,]*)$/.exec(tok);
        if((a1 || a2) && out.amount == null){ const n = parseAmount(a1 ? a1[1] : a2[2]); if(Number.isFinite(n) && n > 0){ out.amount = round2(n); setCur(QS_CURRENCY[(a1 ? a1[2] : a2[1]).toLowerCase()]); used[i] = true; return; } }
      }
      if(/^\d[\d.,]*$/.test(tok)){
        const next = f[i + 1];
        if(next && QS_UNITS.has(next)) return;                       // kolicina ("2 kom") ostaje u opisu
        if(!c.noAmount && next && QS_CURRENCY[next] && out.amount == null){ const n = parseAmount(tok); if(Number.isFinite(n) && n > 0){ out.amount = round2(n); setCur(QS_CURRENCY[next]); used[i] = used[i + 1] = true; return; } }
        nums.push({ i, dm: /^\d{1,2}\.\d{1,2}$/.test(tok) });
        return;
      }
      if(QS_CASH.has(f[i]) || QS_CARD.has(f[i])){
        const type = QS_CASH.has(f[i]) ? 'gotovina' : 'kartica';
        const acc = (c.accounts || []).find(a => a.type === type);
        if(acc){ out.accountId = acc.id; used[i] = true; usePrep(i); }
        return;
      }
      const acc = (c.accounts || []).find(a => foldText(a.name).split(/\s+/).some(w => w.length >= 4 && w === f[i]));
      if(acc){ out.accountId = acc.id; used[i] = true; usePrep(i); }
    });
    if(!c.noAmount && out.amount == null && nums.length){
      // "15.9" pored drugog broja je datum ("gorivo 3000 15.9"); sam je decimalni broj ("knjiga 12.5")
      if(nums.length > 1) nums.filter(n => n.dm).forEach(n => { const [d, m] = tokens[n.i].split('.').map(Number); const x = dayMonth(d, m); if(x){ if(!out.date) out.date = qsIso(x); used[n.i] = true; } });
      // iznos je samo broj na kraju (posle njega samo prepoznati datum/racun) — broj u sredini opisa ("iPhone 15 maska", "Racun 2025") ostaje opis
      const tailFree = i => tokens.every((_, j) => j <= i || used[j]);
      const ok = n => { const tk = tokens[n.i]; const digits = (tk.match(/\d/g) || []).length; return !used[n.i] && digits <= 6 && !/^0\d/.test(tk) && tailFree(n.i); };
      const pick = nums.filter(ok).pop();
      if(pick){ const n = parseAmount(tokens[pick.i]); if(Number.isFinite(n) && n > 0){ out.amount = round2(n); used[pick.i] = true; } }
    }
    out.desc = tokens.filter((_, i) => !used[i]).join(' ');
    return out;
  }
  function quickCategoryPrompt(categories, desc){
    return [
      'Za opis troška iz Srbije izaberi jednu kategoriju korisnika.',
      'Vrati SAMO JSON: {"category":""}',
      'Kategorije: ' + (categories || []).map(x => '"' + x + '"').join(', ') + '. Ako nijedna ne odgovara, vrati "".',
      'Opis: ' + String(desc || '').slice(0, 100)
    ].join('\n');
  }
  function cleanQuickCategory(raw, categories){
    const o = extractJson(raw);
    return o ? ((categories || []).find(x => foldText(x) === foldText(o.category)) || '') : '';
  }

  // ---------- Dokumenti: garancije i dokumenti sa rokom ----------
  const DOC_GROUPS = ['Tehnika', 'Auto', 'Osiguranje', 'Lična dokumenta', 'Ugovori', 'Ostalo'];
  const isoOk = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  function addMonthsToDate(iso, n){
    const [y, m, d] = iso.split('-').map(Number);
    const first = new Date(y, m - 1 + n, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return first.getFullYear() + '-' + pad2(first.getMonth() + 1) + '-' + pad2(Math.min(d, last));
  }
  function documentExpiry(doc){
    if(doc && isoOk(doc.expires)) return doc.expires;
    if(doc && isoOk(doc.issued) && doc.warrantyMonths > 0) return addMonthsToDate(doc.issued, doc.warrantyMonths);
    return '';
  }
  function documentStatus(doc, today){
    const exp = documentExpiry(doc);
    if(!exp) return { state: 'none', days: null };
    const days = dayNumber(exp) - dayNumber(today);
    const rd = doc.remindDays >= 0 ? doc.remindDays : 30;
    return { state: days < 0 ? 'expired' : days <= rd ? 'soon' : 'ok', days };
  }
  // za karticu i obavestenja: soon (i opciono skoro istekli), najblizi rok prvi
  function documentReminders(docs, today, opts){
    const back = (opts && opts.includeExpiredDays) || 0;
    return (docs || []).map(doc => ({ doc, status: documentStatus(doc, today) }))
      .filter(x => x.status.state === 'soon' || (x.status.state === 'expired' && -x.status.days <= back))
      .sort((a, b) => a.status.days - b.status.days)
      .map(x => Object.assign(x, { notifyKey: 'doc-' + x.doc.id + '-' + documentExpiry(x.doc) + '-' + (x.status.days === 0 ? 'day' : x.status.state === 'expired' ? 'expired' : 'soon') }));
  }
  // obnova: od starog roka ako nije istekao pre vise od 60 dana, inace od danas
  function renewDocument(doc, today, months){
    const n = months > 0 ? months : (doc.renewal && doc.renewal.months > 0 ? doc.renewal.months : 12);
    const old = documentExpiry(doc);
    const base = old && dayNumber(today) - dayNumber(old) <= 60 ? old : today;
    return Object.assign({}, doc, { expires: addMonthsToDate(base, n), history: (doc.history || []).concat([{ expires: old || '', renewedAt: today }]) });
  }
  // null/prazno/false = podrazumevanih 30 dana (+null bi dalo 0 = "bez podsetnika pre roka")
  function remindDaysOf(v){
    if(v == null || typeof v === 'boolean' || String(v).trim() === '') return 30;
    const n = +v;
    return Number.isInteger(n) && n >= 0 && n <= 365 ? n : 30;
  }
  function cleanDocuments(arr){
    const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
    return (Array.isArray(arr) ? arr : []).filter(d => d && isId(d.id) && str(d.title, 80)).map(d => {
      const o = { id: d.id, kind: d.kind === 'garancija' ? 'garancija' : 'dokument', title: str(d.title, 80), group: str(d.group, 40) || 'Ostalo',
        files: (Array.isArray(d.files) ? d.files : []).filter(isAttachmentName), remindDays: remindDaysOf(d.remindDays) };
      if(isoOk(d.issued)) o.issued = d.issued;
      if(isoOk(d.expires)) o.expires = d.expires;
      const wm = parseInt(d.warrantyMonths, 10); if(wm > 0 && wm <= 240) o.warrantyMonths = wm;
      if(str(d.vendor, 60)) o.vendor = str(d.vendor, 60);
      if(str(d.notes, 300)) o.notes = str(d.notes, 300);
      if(d.renewal && typeof d.renewal === 'object'){ const a = parseAmount(d.renewal.amount), m = parseInt(d.renewal.months, 10);
        o.renewal = { amount: Number.isFinite(a) && a > 0 ? round2(a) : 0, category: str(d.renewal.category, 40), months: m > 0 && m <= 120 ? m : 12 }; }
      if(Array.isArray(d.history)) o.history = d.history.filter(h => h && isoOk(h.renewedAt)).map(h => Object.assign({ expires: isoOk(h.expires) ? h.expires : '', renewedAt: h.renewedAt }, isId(h.entryId) ? { entryId: h.entryId } : {}));
      if(isId(d.entryId)) o.entryId = d.entryId;
      return o;
    });
  }
  function documentPrompt(groups){
    return ['Čitaš garantni list, polisu, saobraćajnu/registraciju, ugovor ili drugi dokument sa rokom (Srbija), sa slike ili iz teksta.',
      'Vrati SAMO JSON: {"kind":"garancija|dokument","title":"","group":"","issued":"YYYY-MM-DD","expires":"YYYY-MM-DD","warrantyMonths":0,"vendor":"","confidence":{"expires":"high"}}',
      '- title: kratak naziv (npr. "Frižider Gorenje", "Registracija Golf 7", "Kasko polisa").',
      '- group: jedna od ovih ili "": ' + (groups || []).map(g => '"' + g + '"').join(', ') + '.',
      '- issued: datum kupovine/izdavanja; expires: datum isteka ako piše; warrantyMonths: trajanje garancije u mesecima ako piše umesto datuma.',
      '- vendor: prodavac ili izdavalac. Nečitljivo = null; ne izmišljaj datume.'].join('\n');
  }
  function cleanDocumentReading(raw, groups){
    const o = extractJson(raw);
    if(!o) return null;
    const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
    const conf = o.confidence && typeof o.confidence === 'object' ? o.confidence : {};
    const wm = parseInt(o.warrantyMonths, 10);
    const out = { kind: o.kind === 'garancija' ? 'garancija' : 'dokument', title: str(o.title, 80), group: (groups || []).find(g => foldText(g) === foldText(o.group)) || '',
      issued: readDate(o.issued), expires: readDate(o.expires), warrantyMonths: wm > 0 && wm <= 240 ? wm : null, vendor: str(o.vendor, 60) };
    out.low = Object.keys(conf).filter(k => conf[k] === 'low');
    if(!out.expires && !(out.issued && out.warrantyMonths)) out.low.push('expires');
    return out;
  }

  // ---------- Pitaj svoj budzet: AI bira proracune, aplikacija racuna lokalno, AI pise odgovor ----------
  const ASK_TOOLS = ['monthSummary', 'byCategory', 'compare', 'top', 'average', 'recurring'];
  const ASK_MAX_CALLS = 4, ASK_MAX_MONTHS = 24, ASK_MAX_TOP = 10;
  function askPlanPrompt(o){
    return ['Ti si pomoćnik za lični budžet (Srbija, RSD). Ne vidiš podatke — biraš proračune koje će aplikacija uraditi.',
      'Danas je ' + o.today + '. Podaci postoje od ' + o.first + ' do ' + o.last + '.',
      'Kategorije rashoda: ' + (o.expenseCats || []).map(c => '"' + c + '"').join(', ') + '. Kategorije prihoda: ' + (o.incomeCats || []).map(c => '"' + c + '"').join(', ') + '.',
      'Proračuni (najviše ' + ASK_MAX_CALLS + ', meseci kao "YYYY-MM", najviše ' + ASK_MAX_MONTHS + ' po proračunu):',
      '- monthSummary {months}: prihodi, rashodi, saldo po mesecu',
      '- byCategory {months, type:"expense"|"income"}: zbir po kategoriji',
      '- compare {months, monthsB}: poređenje dva perioda po kategoriji',
      '- top {months, category?, n≤10}: najveći pojedinačni rashodi (opis, iznos)',
      '- average {months, category?}: prosek rashoda po mesecu (samo rashodi)',
      '- recurring {}: ponavljajući rashodi i pretplate',
      'Vrati SAMO JSON: {"calls":[{"tool":"","months":[],"monthsB":[],"category":"","type":"expense","n":5}],"offTopic":false}',
      'Ako pitanje nije o budžetu korisnika, vrati {"calls":[],"offTopic":true}.',
      'Pitanje: ' + String(o.question || '').slice(0, 500)].join('\n');
  }
  function cleanAskPlan(raw, ctx){
    const o = extractJson(raw);
    if(!o) return null;
    const notes = [];
    const okMonth = m => /^\d{4}-(0[1-9]|1[0-2])$/.test(m) && m >= ctx.first && m <= ctx.last;
    const months = (arr, label) => {
      const list = (Array.isArray(arr) ? arr : []).map(String);
      const good = [...new Set(list.filter(okMonth))].sort();
      if(good.length < list.length) notes.push(label + ': preskočeni meseci van podataka');
      if(good.length > ASK_MAX_MONTHS){ notes.push(label + ': skraćeno na ' + ASK_MAX_MONTHS + ' meseca'); return good.slice(-ASK_MAX_MONTHS); }
      return good;
    };
    const cat = c => (ctx.categories || []).find(x => foldText(x) === foldText(c)) || '';
    const calls = [];
    (Array.isArray(o.calls) ? o.calls : []).forEach(c => {
      if(!c || !ASK_TOOLS.includes(c.tool)){ notes.push('nepoznat proračun preskočen'); return; }
      if(calls.length >= ASK_MAX_CALLS){ notes.push('više od ' + ASK_MAX_CALLS + ' proračuna — ostali preskočeni'); return; }
      if(c.tool === 'recurring'){ calls.push({ tool: 'recurring' }); return; }
      const m = months(c.months, c.tool);
      if(!m.length){ notes.push(c.tool + ': nema meseci sa podacima'); return; }
      const out = { tool: c.tool, months: m };
      if(c.tool === 'byCategory') out.type = c.type === 'income' ? 'income' : 'expense';
      if(c.tool === 'compare'){ const b = months(c.monthsB, 'compare'); if(!b.length){ notes.push('compare: nema drugog perioda'); return; } out.monthsB = b; }
      if(c.tool === 'top'){ const n = parseInt(c.n, 10); out.n = n > 0 ? Math.min(n, ASK_MAX_TOP) : 5; }
      if((c.tool === 'top' || c.tool === 'average') && c.category){
        if(!cat(c.category)){ notes.push(c.tool + ': kategorija "' + String(c.category).slice(0, 40) + '" nije pronađena — proračun preskočen'); return; }
        out.category = cat(c.category);
      }
      calls.push(out);
    });
    return { calls, offTopic: !!o.offTopic, notes };
  }
  function runAskTools(calls, data){
    const entries = (data && data.entries) || [];
    const curMonth = data && /^\d{4}-\d{2}/.test(data.today || '') ? data.today.slice(0, 7) : '';
    const recurring = ((data && data.recurring) || []).filter(r => !r.until || !curMonth || r.until >= curMonth);   // zavrsene (npr. otplacena rata) se ne racunaju
    const sumBy = (months, type) => {
      const map = new Map();
      entries.forEach(e => {
        if(e.type !== type || (type === 'expense' && !isPaidExp(e))) return;
        months.forEach(m => { const s = shareInMonth(e, m); if(s){ const r = map.get(e.category) || { category: e.category, total: 0, perMonth: {} }; r.total += s; r.perMonth[m] = round2((r.perMonth[m] || 0) + s); map.set(e.category, r); } });
      });
      return [...map.values()].map(r => { r.total = round2(r.total); if(months.length > 6) delete r.perMonth; return r; }).sort((a, b) => b.total - a.total);
    };
    return (calls || []).map(c => {
      let result;
      if(c.tool === 'monthSummary') result = c.months.map(m => { const t = monthTotals(entries, m); return { month: m, income: t.income, expense: t.expense, net: t.net }; });
      else if(c.tool === 'byCategory') result = sumBy(c.months, c.type || 'expense');
      else if(c.tool === 'compare'){
        // uvek "ranije -> kasnije" sa imenovanim poljima, da model ne pomesa smer (razlika = kasnije - ranije)
        const swap = (c.monthsB[c.monthsB.length - 1] || '') < (c.months[c.months.length - 1] || '');
        const early = swap ? c.monthsB : c.months, late = swap ? c.months : c.monthsB;
        const a = new Map(sumBy(early, 'expense').map(r => [r.category, r.total])), b = new Map(sumBy(late, 'expense').map(r => [r.category, r.total]));
        const rows = [...new Set([...a.keys(), ...b.keys()])].map(k => { const x = a.get(k) || 0, y = b.get(k) || 0; return { category: k, ranije: x, kasnije: y, razlika: round2(y - x), procenat: x > 0 ? Math.round((y - x) / x * 100) : null }; })
          .sort((p, q) => Math.abs(q.razlika) - Math.abs(p.razlika)).slice(0, 15);
        result = { ranije: early, kasnije: late, rows };
      }
      else if(c.tool === 'top') result = entries.filter(e => isPaidExp(e) && (!c.category || e.category === c.category))
        .map(e => ({ e, part: round2(shareInMonths(e, c.months)) })).filter(x => x.part > 0)
        .sort((p, q) => q.part - p.part).slice(0, c.n || 5).map(({ e, part }) => Object.assign({ desc: String(e.desc || '').slice(0, 60), amount: e.amount, uPeriodu: part, category: e.category, month: String(e.date).slice(0, 7) },
          (parseInt(e.spreadMonths, 10) || 1) > 1 ? { spreadMonths: parseInt(e.spreadMonths, 10) } : {}));
      else if(c.tool === 'average') result = sumBy(c.months, 'expense').filter(r => !c.category || r.category === c.category).map(r => ({ category: r.category, avgPerMonth: round2(r.total / c.months.length) }));
      else if(c.tool === 'recurring'){
        const items = recurring.filter(r => r.type !== 'income').map(r => ({ desc: String(r.desc || '').slice(0, 60), amount: Number(r.amount) || 0, frequency: r.frequency || 'monthly', category: r.category }));
        const monthly = round2(recurring.filter(r => r.type !== 'income').reduce((s, r) => s + monthlyEquivalent(r), 0));
        result = { monthly, yearly: round2(monthly * 12), items };
      }
      return { tool: c.tool, args: Object.assign({}, c), result };
    });
  }
  // Odgovor modela: {"odgovor":"..."} (AI poziv uvek trazi JSON) ili obican tekst
  function cleanAskAnswer(raw){
    const s = String(raw == null ? '' : raw).trim();
    const o = extractJson(s);
    const v = o && (o.odgovor || o.answer || o.text);
    return typeof v === 'string' && v.trim() ? v.trim() : s;
  }
  // Opseg meseci za "Pitaj": i raspodeljene stavke (spreadMonths) pokrivaju svoje mesece, kao u mesecnim zbirovima
  function askMonthRange(entries, curMonth){
    let first = '', last = '';
    (entries || []).forEach(e => {
      if(!e || (e.type !== 'income' && e.type !== 'expense') || !/^\d{4}-\d{2}/.test(String(e.date || ''))) return;
      const s = spreadOf(e);
      if(!first || s.start < first) first = s.start;
      if(!last || s.end > last) last = s.end;
    });
    return { first: first || curMonth, last: last && last > curMonth ? last : curMonth };
  }
  function askAnswerPrompt(o){
    const lang = o.lang === 'en' ? 'Odgovori na engleskom jeziku (answer in English)' : 'Odgovori na srpskom (latinica)';
    return ['Ti si pomoćnik za lični budžet. ' + lang + ', kratko (do 8 rečenica), na osnovu REZULTATA ispod.',
      'Koristi samo brojeve iz rezultata; ne izmišljaj brojeve ni stavke. Iznose piši kao "12.345 RSD". Ako rezultati ne odgovaraju na pitanje, reci to.',
      'U rezultatu "top": "amount" je pun iznos stavke, a "uPeriodu" deo koji pripada traženim mesecima (stavka raspodeljena na "spreadMonths" meseci); za zbirove koristi "uPeriodu".',
      'U rezultatu "compare": "ranije" i "kasnije" su meseci dva perioda; u redovima "razlika" = kasnije − ranije (pozitivno = rast troška u kasnijem periodu).',
      'Vrati SAMO JSON: {"odgovor":"tekst odgovora"}',
      'Danas je ' + o.today + '.',
      'Pitanje: ' + String(o.question || '').slice(0, 500),
      'Rezultati (JSON): ' + JSON.stringify(o.results || [])].join('\n');
  }

  // ---------- Pracenje cena iz racuna iz prodavnice ----------
  const QTY_LABEL_RE = /\((\d+(?:[.,]\d+)?)\s*(kom|kg|g|l|ml|pak)\)\s*$/i;
  // Kolicina: zarez je uvek decimalni ("1,234 kg" = 1.234), za razliku od iznosa
  const parseQtyNum = v => typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).trim().replace(',', '.'));
  // Jedinica sa racuna ("KG", "KOM.", "Lit") -> jedna iz QTY_UNITS, inace ''
  const UNIT_ALIASES = { lit: 'l', lt: 'l', gr: 'g', kgr: 'kg', pcs: 'kom', kos: 'kom', pak: 'pak', pakovanje: 'pak' };
  function normUnit(unit){
    const u = String(unit || '').trim().toLowerCase().replace(/\.+$/, '');
    if(QTY_UNITS.includes(u)) return u;
    return UNIT_ALIASES[u] || '';
  }
  function normQty(qty, unit){
    const u = normUnit(unit) || 'kom';
    if(u === 'g') return { qty: qty / 1000, unit: 'kg' };
    if(u === 'ml') return { qty: qty / 1000, unit: 'l' };
    return { qty, unit: u };
  }
  function parseItemQty(label){
    const m = QTY_LABEL_RE.exec(String(label || ''));
    if(!m) return { qty: 1, unit: 'kom' };
    const q = parseQtyNum(m[1]);
    return q > 0 ? normQty(q, m[2]) : { qty: 1, unit: 'kom' };
  }
  // Red "razlika do ukupnog" se u podacima cuva na srpskom, bez obzira na jezik aplikacije
  const RECEIPT_DIFF_NAME = 'Razlika do ukupnog';
  const isReceiptDiffName = name => /^(razlika do ukupnog|difference to total)$/i.test(String(name == null ? '' : name).replace(/\s+/g, ' ').trim());
  const canonicalItemName = name => isReceiptDiffName(name) ? RECEIPT_DIFF_NAME : String(name == null ? '' : name).trim();
  function priceObservations(entries){
    const out = [];
    (entries || []).forEach(e => {
      if(!e || e.type !== 'expense' || !e.receiptId || !Array.isArray(e.items) || !Array.isArray(e.itemPrices)) return;
      e.items.forEach((label, i) => {
        const total = e.itemPrices[i];
        const name = purchasedItemName(label);
        if(!(total > 0) || !name || isReceiptDiffName(name)) return;
        const q = Array.isArray(e.itemQty) && e.itemQty[i] && e.itemQty[i].qty > 0 && normUnit(e.itemQty[i].unit) ? normQty(e.itemQty[i].qty, e.itemQty[i].unit) : parseItemQty(label);
        out.push({ date: e.date, store: String(e.desc || '').trim(), name, key: itemKey(label), qty: q.qty, unit: q.unit, total, unitPrice: round2(total / q.qty) });
      });
    });
    return out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }
  function priceHistory(entries){
    const map = new Map();
    priceObservations(entries).forEach(o => { if(!map.has(o.key)) map.set(o.key, { key: o.key, name: o.name, obs: [] }); const h = map.get(o.key); h.obs.push(o); h.name = o.name; });
    return map;
  }
  function priceInsight(hist, today){
    if(!hist || !hist.obs.length) return null;
    const obs = hist.obs, last = obs[obs.length - 1];
    const sameUnit = obs.filter(o => o.unit === last.unit);
    const before = sameUnit.slice(0, -1);
    let change = null;
    const prevStore = before.filter(o => foldText(o.store) === foldText(last.store)).pop();
    let base = null, vs = null;
    if(prevStore){ base = prevStore.unitPrice; vs = 'store'; }
    else if(before.length){ const lastN = before.slice(-3); base = lastN.reduce((s, o) => s + o.unitPrice, 0) / lastN.length; vs = 'avg'; }
    if(base > 0){ const pct = Math.round((last.unitPrice - base) / base * 100); if(Math.abs(pct) >= 3) change = { pct, vs, prev: round2(base) }; }
    const cutoff = dayNumber(today) - 90;
    const recent = sameUnit.filter(o => dayNumber(o.date) >= cutoff && o !== last);
    const cheapestObs = recent.reduce((m, o) => (!m || o.unitPrice < m.unitPrice) ? o : m, null);
    const cheapest = cheapestObs && cheapestObs.unitPrice <= last.unitPrice * 0.99 ? { store: cheapestObs.store, unitPrice: cheapestObs.unitPrice, date: cheapestObs.date } : null;
    return { key: hist.key, name: hist.name, last, change, cheapest, unit: last.unit };
  }
  // procena za stavku sa liste: cena po jedinici iz racuna x kolicina sa liste (jedinice moraju da se slazu)
  // Istorija cena za stavku liste: trenutno ime + stara imena (aliases), spojeno po datumu
  function itemPriceHistory(item, history){
    if(!history || !item) return null;
    const keys = [...new Set([item.name].concat(Array.isArray(item.aliases) ? item.aliases : []).map(itemKey).filter(Boolean))];
    const hs = keys.map(k => history.get(k)).filter(Boolean);
    if(hs.length <= 1) return hs[0] || null;
    const obs = [].concat(...hs.map(h => h.obs)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return { key: itemKey(item.name), name: String(item.name), obs };
  }
  function estimateShoppingItem(item, history, preferredStore){
    const h = itemPriceHistory(item, history);
    if(h && h.obs.length){
      const store = (item.store || preferredStore || '').trim();
      const atStore = store ? h.obs.filter(o => foldText(o.store) === foldText(store)).pop() : null;
      const o = atStore || h.obs[h.obs.length - 1];
      const listQ = item.qty ? (() => { const m = /(\d+(?:[.,]\d+)?)\s*(kom|kg|g|l|ml|pak)/i.exec(item.qty); return m && parseQtyNum(m[1]) > 0 ? normQty(parseQtyNum(m[1]), m[2]) : null; })() : null;
      const amount = listQ ? (listQ.unit === o.unit ? round2(o.unitPrice * listQ.qty) : o.total) : (o.unit === 'kom' ? o.unitPrice : o.total);
      return { amount, source: atStore ? 'store' : 'last', unitPrice: o.unitPrice, unit: o.unit };
    }
    if(item && item.price > 0) return { amount: item.price, source: 'manual' };
    return { amount: 0, source: null };
  }

  // ---------- Provera Excel fajla i fajla kopije ----------
  // Da li Excel izgleda kao izvoz Knjige budzeta (pre nego sto zameni sve podatke). Prazan list Stavke = izvoz bez stavki.
  const WORKBOOK_SHEETS = ['Stavke', 'Kategorije'];
  const STAVKE_COLUMNS = ['Datum', 'Opis', 'Iznos', 'Tip'];
  function checkWorkbookShape(sheetNames, stavkeHeader){
    const names = sheetNames || [];
    const missing = WORKBOOK_SHEETS.filter(s => !names.includes(s));
    const header = stavkeHeader || [];
    if(!missing.length && header.length) STAVKE_COLUMNS.forEach(c => { if(!header.includes(c)) missing.push('Stavke: ' + c); });
    return { ok: !missing.length, missing };
  }
  // Da li je fajl kopije (podaci.json) nas i neostecen: poznati kljucevi moraju biti niz/objekat (ili JSON string toga).
  const DATA_ARRAY_KEYS = ['budzet-stavke-v2', 'budzet-ponavljajuce-v1', 'budzet-ciljevi-v1', 'budzet-dugovi-v1', 'budzet-racuni-v1',
    'budzet-lokacije-v1', 'budzet-vrste-racuna-v1', 'budzet-kucni-racuni-v1', 'budzet-dokumenti-v1'];
  const DATA_OBJECT_KEYS = ['budzet-limiti-v1', 'budzet-primenjeno-v1', 'budzet-preskoceno-v1'];
  function checkDataFileShape(data){
    if(!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, problems: ['nema podataka Knjige budžeta'] };
    if(!Object.keys(data).some(k => k.startsWith('budzet-'))) return { ok: false, problems: ['nema podataka Knjige budžeta'] };
    const parse = v => { if(typeof v !== 'string') return v; try { return JSON.parse(v); } catch(e) { return undefined; } };
    const problems = [];
    DATA_ARRAY_KEYS.forEach(k => { if(k in data && !Array.isArray(parse(data[k]))) problems.push(k); });
    DATA_OBJECT_KEYS.forEach(k => { if(!(k in data)) return; const v = parse(data[k]); if(!v || typeof v !== 'object' || Array.isArray(v)) problems.push(k); });
    return { ok: !problems.length, problems };
  }

  return {
    pad2, toISODate, monthKeyOf, addMonths, daysInMonth, monthRange,
    effectiveDay, dueDateFor, clampRecurringDay, isDueInMonth,
    parseAmount, parseQuickAmount, parseFlexibleDate, validDate,
    detectDelimiter, parseCsv, findHeaderIndex, mapColumns, tableToImportRows,
    parseOFX, parseQIF, parseQifDate,
    dupKey, splitDuplicates, findNearDuplicates, monthCoverage, mergeImportBatches,
    normalizeAccount, validAccount, formatAccount, validReference97, ipsQrString, parseIpsQr, ipsProblems, cleanPayee, categoryFromRules,
    spreadOf, shareInMonth, shareInMonths,
    accountBalances, convertToRsd,
    linearRegressionForecast, debtPayoffPlan,
    NO_DESC, isPaidExp, cleanDesc, normalizeDesc, analysisPeriod, firstExpenseMonth, sumPaid, periodStats,
    isFixedEntry, monthlyEquivalent, ABOVE_PCT, ABOVE_MIN, SMALL_MAX, SMALL_PER_MONTH, groupByDesc, categoryBreakdown, aboveAverage, smallFrequent,
    splitFixedVariable, variableAverage, CREEP_PCT, subscriptionsYearly, monthsUntil, whatIf, savingsSummary,
    SHOPPING_OTHER, SHOPPING_SECTIONS, QTY_UNITS, parseShoppingInput, normShoppingName, findShoppingItem,
    purchaseItemLabel, mostCommonStore, itemsToCell, cellToItems, normalizeShopping,
    NO_STORE, NO_CATEGORY, groupShoppingItems, shoppingEstimate, splitPurchase,
    round2, monthTotals, isRecurringPaid, isRecurringSkipped, recurringEntryId, pendingRecurringItems, monthsToProcess, autoPayDue, overdueRecurring, debtPaid,
    purchasedItemName, purchasedItemKey, purchasedItemStats, restockSuggestions,
    goalPlanDue, planAmount, monthReviewMonth, monthReview,
    BILL_KEYS, foldText, defaultBillTypes, cleanLocations, cleanBillTypes, cleanBills, billsPrompt, cleanBillReading, mergeBillQr,
    compactBillText, nextMetricKey, findBillDuplicate, findRecurringForBill, billsTable, expenseDateFor, parseBillsSheet,
    isAttachmentName, itemKey, receiptPrompt, cleanReceiptReading, mergeReceiptParts, insertReceiptPart, applyReceiptDiscounts, slipPrompt, cleanSlipReading, slipWarnings, parseQuickSentence, quickCategoryPrompt, cleanQuickCategory, parseItemQty, normUnit, priceObservations, priceHistory, priceInsight, estimateShoppingItem, ASK_TOOLS, askPlanPrompt, askMonthRange, cleanAskPlan, runAskTools, askAnswerPrompt, cleanAskAnswer, DOC_GROUPS, addMonthsToDate, documentExpiry, documentStatus, documentReminders, renewDocument, cleanDocuments, documentPrompt, cleanDocumentReading, importDescKey, importAiCandidates, importCategoryPrompt, suggestKeyword, cleanImportSuggestions, rulesFromSuggestions, itemCategoryMemory, matchReceiptToShopping, receiptToExpenses, findReceiptDuplicate, billsFromSheet, itemPriceHistory, RECEIPT_DIFF_NAME, isReceiptDiffName, canonicalItemName, lastPurchaseDates, pruneDismissed,
    checkWorkbookShape, checkDataFileShape
  };
});
