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
  function shoppingEstimate(items){
    const res = { count: 0, total: 0, unpriced: 0, byCategory: {} };
    (items || []).forEach(i => {
      if(!i.needed) return;
      res.count++;
      if(!(res.byCategory[i.category] >= 0)) res.byCategory[i.category] = 0;
      if(i.price > 0){ res.total += i.price; res.byCategory[i.category] += i.price; } else res.unpriced++;
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
  const purchasedItemName = label => String(label == null ? '' : label).replace(/\s*\(\d[^()]*\)\s*$/, '').replace(/\s+/g, ' ').trim();
  const purchasedItemKey = label => normShoppingName(purchasedItemName(label));
  // Po stvari: broj kupovina i deo stvarnog iznosa racuna (srazmerno cenama sa liste; bez cene = prosek iz tog racuna)
  function purchasedItemStats(entries, months, category){
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
        const key = purchasedItemKey(label);
        if(!key) return;
        if(!map.has(key)) map.set(key, { key, name: purchasedItemName(label), count: 0, amount: null, withAmount: 0 });
        const g = map.get(key);
        g.count++;
        if(weights && W > 0){ g.amount = round2((g.amount || 0) + e.amount * weights[i] / W); g.withAmount++; }
      });
    });
    return [...map.values()].sort((a, b) => (b.amount || 0) - (a.amount || 0) || b.count - a.count || a.name.localeCompare(b.name));
  }
  const dayNumber = iso => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000);
  // "Vreme je da kupis": stvari kupljene bar 3 dana, medijan razmaka, proslo >= interval; bez needed i sakrivenih
  function restockSuggestions(entries, shopping, todayISO){
    const items = (shopping && shopping.items) || [];
    const dismissed = (shopping && shopping.dismissed) || {};
    const dates = new Map(), names = new Map();
    (entries || []).forEach(e => {
      if(!isPaidExp(e) || !Array.isArray(e.items)) return;
      e.items.forEach(label => {
        const key = purchasedItemKey(label);
        if(!key) return;
        if(!dates.has(key)){ dates.set(key, new Set()); names.set(key, purchasedItemName(label)); }
        dates.get(key).add(e.date);
      });
    });
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
    return (Array.isArray(arr) ? arr : []).filter(l => l && isStr(l.id) && isStr(l.name))
      .map(l => ({ id: l.id, name: l.name.trim().slice(0, 60), currency: (currencies || []).includes(l.currency) ? l.currency : 'RSD' }));
  }
  function cleanBillTypes(arr, locationIds){
    return (Array.isArray(arr) ? arr : []).filter(t => t && isStr(t.id) && isStr(t.name) && (locationIds || []).includes(t.locationId))
      .map(t => ({ id: t.id, locationId: t.locationId, name: t.name.trim().slice(0, 60), category: isStr(t.category) ? t.category : 'Ostalo',
        metrics: (Array.isArray(t.metrics) ? t.metrics : []).filter(m => m && isStr(m.key) && isStr(m.name))
          .map(m => ({ key: m.key, name: m.name.trim().slice(0, 40), unit: String(m.unit || '').trim().slice(0, 12) })) }));
  }
  const isoDateOk = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  function cleanBills(arr, typeIds){
    return (Array.isArray(arr) ? arr : []).filter(b => b && isStr(b.id) && (typeIds || []).includes(b.billTypeId) && /^\d{4}-(0[1-9]|1[0-2])$/.test(b.month || ''))
      .map(b => {
        const amount = parseAmount(b.amount);
        const values = {};
        const src = b.values && typeof b.values === 'object' ? b.values : {};
        Object.keys(src).forEach(k => { const v = parseAmount(src[k]); if(Number.isFinite(v) && v >= 0) values[k] = v; });
        const out = { id: b.id, billTypeId: b.billTypeId, month: b.month, amount: Number.isFinite(amount) && amount > 0 ? round2(amount) : 0,
          currency: /^[A-Z]{3}$/.test(b.currency || '') ? b.currency : 'RSD', values, source: ['ai', 'qr', 'manual', 'excel'].includes(b.source) ? b.source : 'manual' };
        if(isoDateOk(b.periodFrom)) out.periodFrom = b.periodFrom;
        if(isoDateOk(b.periodTo)) out.periodTo = b.periodTo;
        if(isoDateOk(b.dueDate)) out.dueDate = b.dueDate;
        const payee = b.payee && cleanPayee(b.payee); if(payee) out.payee = payee;
        ['entryId', 'recurringId'].forEach(k => { if(isStr(b[k])) out[k] = b[k]; });
        if(isStr(b.file) && !/[\/]/.test(b.file)) out.file = b.file;
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
    'budzet-lokacije-v1', 'budzet-vrste-racuna-v1', 'budzet-kucni-racuni-v1'];
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
    checkWorkbookShape, checkDataFileShape
  };
});
