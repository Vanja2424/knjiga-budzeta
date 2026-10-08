  const C = window.BudzetCore;
  // Test kuke (window.__*) postoje samo kad je KNJIGA_TEST postavljen (main.js -> desktop.info.test), kao u prozoru za brzi unos
  const IS_TEST = !!(window.desktop && window.desktop.info && window.desktop.info.test);
  // Prevodi: staticki tekst se prevodi sam; poruke sa vrednostima idu kroz t('... {0}', x)
  I18N.start();
  const t = I18N.t;
  const LOCALE = I18N.locale;
  const daysTxt = n => t(n === 1 ? '{0} dan' : '{0} dana', n);
  const monthsTxt = n => t(n % 10 === 1 && n % 100 !== 11 ? '{0} mesec' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? '{0} meseca' : '{0} meseci', n);
  const categoriesTxt = n => t(n % 10 === 1 && n % 100 !== 11 ? '{0} kategorija' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? '{0} kategorije' : '{0} kategorija', n);
  const ENTRIES_KEY = 'budzet-stavke-v2';
  const CATS_KEY = 'budzet-kategorije-v2';
  const LIMITS_KEY = 'budzet-limiti-v1';
  const RECURRING_KEY = 'budzet-ponavljajuce-v1';
  const APPLIED_KEY = 'budzet-primenjeno-v1';
  const GOALS_KEY = 'budzet-ciljevi-v1';
  const THEME_KEY = 'budzet-tema-v1';
  const CATCOLORS_KEY = 'budzet-boje-kategorija-v1';
  const MONTHLY_BUDGET_KEY = 'budzet-mesecni-limit-v1';
  const SKIPPED_KEY = 'budzet-preskoceno-v1';
  const DEBTS_KEY = 'budzet-dugovi-v1';
  const HEALTH_KEY = 'budzet-zdravlje-v1';
  const ENVELOPES_KEY = 'budzet-koverte-v1';
  const CATRULES_KEY = 'budzet-pravila-kategorizacije-v1';
  const ROUNDUP_KEY = 'budzet-zaokruzivanje-v1';
  const FIXED_CATS_KEY = 'budzet-fiksne-kategorije-v1';
  const SHOPPING_KEY = 'budzet-nabavka-v1';
  let roundUpGoalId = localStorage.getItem(ROUNDUP_KEY) || '';
  const DEFAULT_CATS = ['Hrana','Stanovanje','Prevoz','Zabava','Zdravlje','Ostalo'];
  const PALETTE = ['#6366F1','#F59E0B','#10B981','#EF4444','#8B5CF6','#06B6D4','#EC4899','#84CC16'];

  let entries = JSON.parse(localStorage.getItem(ENTRIES_KEY) || '[]');
  let expenseCats = JSON.parse(localStorage.getItem(CATS_KEY) || 'null') || DEFAULT_CATS.slice();
  let limits = JSON.parse(localStorage.getItem(LIMITS_KEY) || '{}');
  let recurring = JSON.parse(localStorage.getItem(RECURRING_KEY) || '[]');
  let applied = JSON.parse(localStorage.getItem(APPLIED_KEY) || '{}');
  let goals = JSON.parse(localStorage.getItem(GOALS_KEY) || '[]');
  let catColors = JSON.parse(localStorage.getItem(CATCOLORS_KEY) || '{}');
  let monthlyBudget = parseFloat(localStorage.getItem(MONTHLY_BUDGET_KEY)) || 0;
  let skipped = JSON.parse(localStorage.getItem(SKIPPED_KEY) || '{}');
  let debts = JSON.parse(localStorage.getItem(DEBTS_KEY) || '[]');
  let healthHistory = JSON.parse(localStorage.getItem(HEALTH_KEY) || '[]');
  // Kategorije koje korisnik oznaci kao fiksne (Analiza). Stavke iz ponavljajucih su fiksne i bez oznake.
  let fixedCategories = (()=>{ try{ const v = JSON.parse(localStorage.getItem(FIXED_CATS_KEY) || '[]'); return Array.isArray(v) ? v.filter(c=> typeof c === 'string') : []; } catch(e){ return []; } })();
  // Envelope/zero-based budzetiranje — ADITIVNO uz postojece limits[cat] (koje ostaje kao prost
  // prag za upozorenje), ne zamena: limits se koristi na desetak mesta (renderPregled, renderWarnings,
  // computeHealthScore, Excel export/import, JSON backup) i puna zamena bi bila rizicna, invazivna
  // promena. allocations[cat] = mesecna alokacija; rollover[cat] = preneto iz proslog meseca (moze biti
  // i negativno = "dug" preneto unapred); lastRolloverMonth = poslednji mesec za koji je rollover obracunat.
  let envelopeState = JSON.parse(localStorage.getItem(ENVELOPES_KEY) || 'null') || { allocations: {}, rollover: {}, lastRolloverMonth: null };
  // v1.4: "koverte" su spojene sa limitima u jedan budzet po kategoriji (+ opcioni prenos ostatka).
  function migrateEnvelopes(){
    if(!envelopeState.allocations || !Object.keys(envelopeState.allocations).some(c=> envelopeState.allocations[c] > 0)) return;
    Object.keys(envelopeState.allocations).forEach(c=>{ const v = envelopeState.allocations[c]; if(v > 0 && !(limits[c] > 0)) limits[c] = v; });
    envelopeState.rolloverEnabled = true;
    envelopeState.allocations = {};
    localStorage.setItem(LIMITS_KEY, JSON.stringify(limits));
    localStorage.setItem(ENVELOPES_KEY, JSON.stringify(envelopeState));
  }
  migrateEnvelopes();
  // Pravila auto-kategorizacije pri CSV uvozu: {keyword, category} — ako opis uvezenog reda
  // sadrzi keyword (bez obzira na velika/mala slova), kategorija iz pravila ima prioritet
  // nad koloni-izvedenom kategorijom (korisnik ih namerno definise da prepisu generican/pogresan
  // naziv kategorije iz bankovnog izvoda).
  let catRules = JSON.parse(localStorage.getItem(CATRULES_KEY) || '[]');
  const saveCatRules = () => localStorage.setItem(CATRULES_KEY, JSON.stringify(catRules));
  if(IS_TEST) window.__catRules = ()=> catRules;
  if(IS_TEST) window.__setCatRules = list => { catRules = list.slice(); saveCatRules(); if(typeof renderCatRules === 'function') renderCatRules(); };
  const categoryFromRules = desc => C.categoryFromRules(catRules, desc);
  // Kategorije prihoda su od v1.3 izmenljive (ranije fiksna lista).
  const INCOME_CATS_KEY = 'budzet-kategorije-prihoda-v1';
  const DEFAULT_INCOME_CATS = ['Plata','Honorar','Poklon','Ostalo'];
  let incomeCats = JSON.parse(localStorage.getItem(INCOME_CATS_KEY) || 'null') || DEFAULT_INCOME_CATS.slice();
  const saveIncomeCats = () => localStorage.setItem(INCOME_CATS_KEY, JSON.stringify(incomeCats));
  const SOUND_KEY = 'budzet-zvuk-v1';
  let soundOn = localStorage.getItem(SOUND_KEY) !== 'off';
  // Racuni (v1.4): [{id, name, type, openingBalance}]. Bez racuna sve radi kao ranije.
  const ACCOUNTS_KEY = 'budzet-racuni-v1';
  let accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]');
  const saveAccounts = () => localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  // Kursna lista (NBS srednji kurs) — poslednja preuzeta se pamti za rad bez interneta.
  const FX_KEY = 'budzet-kurs-v1';
  let fx = JSON.parse(localStorage.getItem(FX_KEY) || 'null') || { date: null, rates: {} };
  // Sve valute sa kursne liste NBS (koje imaju kurs); u unosu se nude samo omiljene (ekran Kursevi).
  const CURRENCIES = ['RSD', 'EUR', 'USD', 'CHF', 'GBP', 'AUD', 'CAD', 'JPY', 'CNY', 'DKK', 'NOK', 'SEK', 'CZK', 'HUF', 'PLN', 'RON', 'BGN',
    'BAM', 'MKD', 'HRK', 'TRY', 'RUB', 'BYN', 'AED', 'KWD', 'INR'];
  const CURRENCY_SYMBOL = { RSD: 'RSD', EUR: '€', USD: '$', CHF: 'CHF', GBP: '£' };
  const FX_FAV_KEY = 'budzet-valute-v1';
  const FX_FAV_DEFAULT = ['EUR', 'USD', 'CHF', 'GBP'];
  let fxFavorites = (()=>{ try{ const v = JSON.parse(localStorage.getItem(FX_FAV_KEY) || 'null'); return Array.isArray(v) ? v.filter(c=> CURRENCIES.includes(c) && c !== 'RSD') : FX_FAV_DEFAULT.slice(); } catch(e){ return FX_FAV_DEFAULT.slice(); } })();
  const saveFxFavorites = ()=> localStorage.setItem(FX_FAV_KEY, JSON.stringify(fxFavorites));
  const currencyName = (()=>{
    let dn = null;
    try{ dn = new Intl.DisplayNames([LOCALE], { type: 'currency' }); } catch(e){}
    return c => { try{ const n = dn && dn.of(c); return n && n !== c ? n.charAt(0).toUpperCase() + n.slice(1) : c; } catch(e){ return c; } };
  })();
  // ---- UI-only state (ne ide u localStorage) ----
  // Mesec koji prikazuju sazetak i Pregled. Prati tekuci mesec dok korisnik ne izabere drugi.
  let viewMonth = C.monthKeyOf(new Date());
  let viewMonthFollowsToday = true;
  // Liste Rashodi/Prihodi prate izabrani mesec ('' = svi meseci); rucni izbor u filteru vazi do sledece promene meseca
  let expListMonth = viewMonth;
  let incListMonth = viewMonth;
  let currentRecType = 'expense';
  let justPaidId = null;
  let newEntryId = null;
  let selectedIncomeIds = new Set();
  let selectedExpenseIds = new Set();
  let justCompletedId = null;
  // Scenario planer — sandbox "sta ako" izmene se NE upisuju u prave entries/recurring dok se
  // ne klikne "Primeni"; da bi Primeni ostao bezbedan i kad korisnik u medjuvremenu doda pravu
  // stavku na drugom tabu, cuvamo samo DODATKE/ISKLJUCENJA (dif), ne kopiju celog state-a.
  let scenarioActive = false;
  let scenarioExtraEntries = [];
  let scenarioExtraRecurring = [];
  let scenarioExcludedRecurringIds = new Set();
  let scenarioBudgetOverride = null;
  const SAVED_SCENARIOS_KEY = 'budzet-scenariji-v1';
  let savedScenarios = JSON.parse(localStorage.getItem(SAVED_SCENARIOS_KEY) || '[]');
  const saveSavedScenarios = () => localStorage.setItem(SAVED_SCENARIOS_KEY, JSON.stringify(savedScenarios));

  const fmt = n => Math.round(n).toLocaleString(LOCALE) + ' RSD';
  let entriesVersion = 0; // raste pri svakom cuvanju stavki (kes istorije cena)
  const saveEntries = () => { entriesVersion++; localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries)); };
  const saveCats = () => localStorage.setItem(CATS_KEY, JSON.stringify(expenseCats));
  const saveLimits = () => localStorage.setItem(LIMITS_KEY, JSON.stringify(limits));
  const saveRecurring = () => localStorage.setItem(RECURRING_KEY, JSON.stringify(recurring));
  const saveApplied = () => localStorage.setItem(APPLIED_KEY, JSON.stringify(applied));
  const saveGoals = () => localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
  const saveCatColors = () => localStorage.setItem(CATCOLORS_KEY, JSON.stringify(catColors));
  const saveMonthlyBudget = () => localStorage.setItem(MONTHLY_BUDGET_KEY, String(monthlyBudget));
  const saveSkipped = () => localStorage.setItem(SKIPPED_KEY, JSON.stringify(skipped));
  const saveDebts = () => localStorage.setItem(DEBTS_KEY, JSON.stringify(debts));
  const saveHealthHistory = () => localStorage.setItem(HEALTH_KEY, JSON.stringify(healthHistory));
  const saveEnvelopeState = () => localStorage.setItem(ENVELOPES_KEY, JSON.stringify(envelopeState));
  const saveFixedCategories = () => localStorage.setItem(FIXED_CATS_KEY, JSON.stringify(fixedCategories));
  // Plata za prognozu: automatski (najveci ponavljajuci prihod) ili rucno { date, amount } dok datum ne prodje
  const PAYDAY_KEY = 'budzet-plata-v1';
  function cleanPayday(v){
    const ok = v && typeof v === 'object' && v.mode === 'manual' && /^\d{4}-\d{2}-\d{2}$/.test(v.date || '') && Number(v.amount) > 0;
    return ok ? { mode: 'manual', date: v.date, amount: Math.round(Number(v.amount) * 100) / 100 } : { mode: 'auto' };
  }
  let payday = (()=>{ try{ return cleanPayday(JSON.parse(localStorage.getItem(PAYDAY_KEY) || 'null')); } catch(e){ return { mode: 'auto' }; } })();
  const savePayday = () => localStorage.setItem(PAYDAY_KEY, JSON.stringify(payday));
  const saveShopping = () => localStorage.setItem(SHOPPING_KEY, JSON.stringify(shopping));
  const shoppingCategoryInUse = cat => shopping.items.some(i => i.category === cat);
  if(IS_TEST) window.__shopping = () => shopping;
  if(IS_TEST) window.__saveShopping = () => { saveShopping(); invalidate(); if(activeScreen === 'nabavka') renderShopping(); };
  function catColorFor(cat, fallbackIndex){
    return sanitizeHexColor(catColors[cat]) || PALETTE[fallbackIndex % PALETTE.length];
  }
  function catTagHtml(cat){
    const color = catColors[cat];
    const dot = color ? `<i class="cat-dot" style="background:${color}"></i>` : '';
    return `<span class="cat-tag">${dot}${escapeHtml(cat)}</span>`;
  }
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
  // Lista za kupovinu (Nabavka): stalni spisak stavki + delovi prodavnice. Proverava se pri ucitavanju.
  // Kucni racuni: lokacije (valuta), vrste racuna (merenja) i racuni sa prilozima
  const { locations: LOCATIONS_KEY, types: BILL_TYPES_KEY, bills: BILLS_KEY } = C.BILL_KEYS;
  const readJsonKey = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch(e){ return d; } };
  let locations = C.cleanLocations(readJsonKey(LOCATIONS_KEY, []), CURRENCIES);
  let billTypes = C.cleanBillTypes(readJsonKey(BILL_TYPES_KEY, []), locations.map(l=> l.id));
  let bills = C.cleanBills(readJsonKey(BILLS_KEY, []), billTypes.map(x=> x.id));
  function saveBillsState(){
    localStorage.setItem(LOCATIONS_KEY, JSON.stringify(locations));
    localStorage.setItem(BILL_TYPES_KEY, JSON.stringify(billTypes));
    localStorage.setItem(BILLS_KEY, JSON.stringify(bills));
  }
  const defaultBillCategory = () => expenseCats.includes('Stanovanje') ? 'Stanovanje' : (expenseCats[0] || 'Ostalo');
  // Prvi put (kad korisnik otvori racune): lokacija "Stan" (RSD) sa vrstama Struja/Plin/Voda/Internet
  function ensureBillDefaults(){
    if(locations.length) return;
    const loc = { id: newId(), name: 'Stan', currency: 'RSD' };
    locations = [loc];
    billTypes = C.defaultBillTypes(loc.id, defaultBillCategory(), newId);
    saveBillsState();
  }
  // Dokumenti (garancije i dokumenti sa rokom)
  const DOCS_KEY = 'budzet-dokumenti-v1';
  let documents = C.cleanDocuments(readJsonKey(DOCS_KEY, []));
  const saveDocuments = () => localStorage.setItem(DOCS_KEY, JSON.stringify(documents));
  let shopping = C.normalizeShopping((()=>{ try{ return JSON.parse(localStorage.getItem(SHOPPING_KEY) || 'null'); } catch(e){ return null; } })(), newId);
  const monthKey = dateStr => dateStr.slice(0,7);

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  // Opcija sa korisnickim podatkom: eksplicitna vrednost + bez prevoda (prevod bi inace promenio sacuvanu vrednost)
  const userOption = (v, selected) => `<option value="${escapeHtml(v)}" translate="no"${selected ? ' selected' : ''}>${escapeHtml(v)}</option>`;
  function sanitizeHexColor(v){
    return (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v)) ? v : null;
  }

  // WCAG kontrast helperi — koriste se gde boja pozadine zavisi od teme/color-mix() i
  // fiksni JS prag ne moze pouzdano pratiti stvarni renderovani kontrast (npr. heatmap).
  function relLuminance(r,g,b){
    const toLin = c => { c/=255; return c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); };
    return 0.2126*toLin(r) + 0.7152*toLin(g) + 0.0722*toLin(b);
  }
  function contrastRatio(rgbA, rgbB){
    const lA = relLuminance(...rgbA), lB = relLuminance(...rgbB);
    const lighter = Math.max(lA,lB), darker = Math.min(lA,lB);
    return (lighter+0.05)/(darker+0.05);
  }
  function parseRgbString(str){
    const m = str && str.match(/rgba?\(([^)]+)\)/);
    if(!m) return [255,255,255];
    return m[1].split(',').slice(0,3).map(n=>parseFloat(n));
  }
  function bestTextColorOn(bgCssColor){
    const bg = parseRgbString(bgCssColor);
    const white = [255,255,255], dark = [16,24,40];
    return contrastRatio(bg, white) >= contrastRatio(bg, dark) ? '#fff' : '#101828';
  }

  // Zajednicki SVG path builderi za linijske grafikone (renderTrend, renderBalanceChart) —
  // baseline je parametrizovan jer se razlikuje (dno grafika kod Trend-a, nulta linija kod bilansa).
  function buildLinePath(vals, xFor, yFor){
    return vals.map((v,i)=> (i===0?'M':'L') + xFor(i).toFixed(1) + ',' + yFor(v).toFixed(1)).join(' ');
  }
  function buildAreaPath(vals, xFor, yFor, baselineY){
    return `M${xFor(0).toFixed(1)},${baselineY.toFixed(1)} ` +
      vals.map((v,i)=> 'L'+xFor(i).toFixed(1)+','+yFor(v).toFixed(1)).join(' ') +
      ` L${xFor(vals.length-1).toFixed(1)},${baselineY.toFixed(1)} Z`;
  }

  // Ako iznos nije unet, a opis se zavrsava brojem (npr. "Kafa 350" ili "Kafa 1.500"), izvuci broj kao iznos.
  // Iznosi u ovoj app su uvek celi RSD (fmt() radi Math.round, prikaz koristi tacku kao hiljadarski separator sr-RS lokala),
  // pa se i tacka i zarez u broju iz opisa tretiraju kao separatori grupa cifara, NE kao decimalni zarez/tacka.
  const parseQuickAmount = C.parseQuickAmount;

  function parseTagsInput(str){
    return (str || '').split(',').map(t=>t.trim().toLowerCase()).filter(Boolean);
  }
  function tagsHtml(tags){
    return (tags || []).map(t=>`<span class="tag-chip">#${escapeHtml(t)}</span>`).join('');
  }
  // "Mleko (2 kom), Hleb, Jaja +3" — ceo spisak u tooltip-u
  // Artikli rashoda koji se otvaraju klikom: svaki artikal sa cenom (ako je poznata)
  function itemsDetailsHtml(e){
    const items = Array.isArray(e.items) ? e.items : [];
    if(!items.length) return '';
    const prices = Array.isArray(e.itemPrices) && e.itemPrices.length === items.length ? e.itemPrices : [];
    const shown = items.slice(0, 3).join(', ') + (items.length > 3 ? ' +' + (items.length - 3) : '');
    return `<details class="entry-items-details" translate="no"><summary>${escapeHtml(shown)}</summary><ul>`
      + items.map((it, i)=> `<li><span>${escapeHtml(it)}</span>${typeof prices[i] === 'number' ? `<span>${escapeHtml(fmtNum(prices[i], 2))}</span>` : ''}</li>`).join('')
      + '</ul></details>';
  }
  function itemsSummaryHtml(items){
    if(!Array.isArray(items) || !items.length) return '';
    const shown = items.slice(0, 3).join(', ') + (items.length > 3 ? ' +' + (items.length - 3) : '');
    return `<div class="entry-items" translate="no" title="${escapeHtml(items.join(', '))}">${escapeHtml(shown)}</div>`;
  }

  // Datumi se cuvaju kao "YYYY-MM-DD" stringovi. Kad ih parsiramo nazad u Date objekat
  // preko new Date(stringa), JS to tumaci kao UTC ponoc, sto uz konverziju u lokalno vreme
  // moze da pomeri prikazani dan za jedan unazad. Ove dve funkcije to izbegavaju.
  function toISODateLocal(d){
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function parseLocalDate(dateStr){
    const [y,m,d] = dateStr.split('-').map(Number);
    return new Date(y, (m||1)-1, d||1);
  }

