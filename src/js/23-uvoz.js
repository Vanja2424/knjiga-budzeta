  // ---- Uvoz izvoda banke / CSV / Excel / OFX / QIF ----
  // Parsiranje je u budzet-core.js (testirano). Ovde: citanje fajla, pregled pre uvoza, duplikati.
  function readImportFile(file){
    const name = file.name.toLowerCase();
    return new Promise((resolve, reject)=>{
      const reader = new FileReader();
      reader.onerror = ()=> reject(reader.error);
      if(name.endsWith('.xlsx') || name.endsWith('.xls')){
        reader.onload = (evt)=>{
          try{
            const wb = XLSX.read(evt.target.result, {type:'array', cellDates:true});
            // Najveci list je obicno onaj sa transakcijama
            const sheetName = wb.SheetNames.slice().sort((a,b)=> (XLSX.utils.sheet_to_json(wb.Sheets[b], {header:1}).length) - (XLSX.utils.sheet_to_json(wb.Sheets[a], {header:1}).length))[0];
            // raw: brojevi ostaju brojevi, datumi Date objekti (prikazni tekst moze biti u US formatu)
            const table = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {header:1, defval:'', raw:true});
            resolve({ format: 'Excel', ...C.tableToImportRows(table) });
          } catch(err){ reject(err); }
        };
        reader.readAsArrayBuffer(file);
        return;
      }
      reader.onload = (evt)=>{
        let text = evt.target.result;
        // Stariji izvodi znaju da budu u Windows-1250 — tada UTF-8 citanje daje znakove zamene.
        if(text.includes('�') && !file.__retried){
          file.__retried = true;
          const r2 = new FileReader();
          r2.onload = (e2)=> { try{ resolve(parseImportText(name, e2.target.result)); } catch(err){ reject(err); } };
          r2.onerror = ()=> reject(r2.error);
          r2.readAsText(file, 'windows-1250');
          return;
        }
        try{ resolve(parseImportText(name, text)); } catch(err){ reject(err); }
      };
      reader.readAsText(file, 'UTF-8');
    });
  }
  function parseImportText(name, text){
    if(name.endsWith('.ofx') || name.endsWith('.qfx') || /<OFX>/i.test(text)) return { format: 'OFX', rows: C.parseOFX(text), skipped: 0, error: null };
    if(name.endsWith('.qif') || /^!Type:/m.test(text)) return { format: 'QIF', rows: C.parseQIF(text), skipped: 0, error: null };
    return { format: 'CSV', ...C.tableToImportRows(C.parseCsv(text)) };
  }
  // Kategorija stavke iz izvoda; r.catSource kaze odakle je (rule/bank/history/default) — 'default' ide AI-ju na predlog
  function importRowCategory(r){
    const ruleCat = categoryFromRules(r.desc);
    if(ruleCat){ r.catSource = 'rule'; return ruleCat; }
    if(r.category){ r.catSource = 'bank'; return r.category; }
    // Isti opis kao ranije unet — ista kategorija
    const prev = entries.filter(e=> e.type === r.type && (e.desc||'').trim().toLowerCase() === r.desc.trim().toLowerCase()).sort((a,b)=> b.date.localeCompare(a.date))[0];
    if(prev){ r.catSource = 'history'; return prev.category; }
    r.catSource = 'default';
    return r.type === 'expense' ? (expenseCats.includes('Ostalo') ? 'Ostalo' : expenseCats[0] || 'Ostalo') : (incomeCats.includes('Ostalo') ? 'Ostalo' : incomeCats[0] || 'Ostalo');
  }
  // AI predlog kategorije i kljucne reci za nepoznate opise; salju se SAMO opisi (bez iznosa i datuma), do 60 po zahtevu
  let fakeImportCategorizing = null; // test: req -> { ok, content }
  if(IS_TEST) Object.defineProperty(window, '__fakeImportCategorizing', { get: ()=> fakeImportCategorizing, set: v=>{ fakeImportCategorizing = v; }, configurable: true });
  // greske iz BILL_ERR su pisane za racun ("Racun je prevelik…", "Popuni podatke rucno") — za uvoz izvoda sopstvene reci
  const importAiErr = r => r && r.kind === 'toolarge' ? t('Previše opisa za besplatni Groq limit — pokušaj ponovo za minut.')
    : r && r.kind === 'nokey' ? t('AI čitanje nije podešeno (Podešavanja → AI čitanje računa).')
    : (BILL_ERR[r && r.kind] || BILL_ERR.http)(r || {});
  async function suggestImportCategories(cands, onProgress){
    const map = new Map();
    if(!(fakeImportCategorizing || (window.desktop && window.desktop.bills))) return { map, error: '' };
    for(let i = 0; i < cands.length; i += 60){
      const batch = cands.slice(i, i + 60);
      if(onProgress) onProgress(Math.floor(i / 60) + 1, Math.ceil(cands.length / 60));
      const req = { images: [], text: '', prompt: C.importCategoryPrompt(expenseCats, batch) };
      let res;
      try{ res = fakeImportCategorizing ? await fakeImportCategorizing(req) : await window.desktop.bills.read(req); }
      catch(e){ res = { ok: false, kind: 'http', message: String(e && e.message || e) }; }
      if(!res || !res.ok) return { map, error: importAiErr(res) };
      const got = C.cleanImportSuggestions(res.content, expenseCats, batch);
      if(!got) return { map, error: t('AI odgovor nije mogao da se pročita.') };
      got.forEach((v, k)=> map.set(k, v));
    }
    return { map, error: '' };
  }
  let importBusy = false;
  async function runImport(fileOrFiles, statusEl){
    if(importBusy){ statusEl.textContent = t('Uvoz je već u toku — sačekaj da se završi.'); return; }
    importBusy = true;
    try{ return await runImportInner(fileOrFiles, statusEl); } finally { importBusy = false; }
  }
  async function runImportInner(fileOrFiles, statusEl){
    const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
    const perFile = [], formats = new Set(), problems = [];
    let skipped = 0;
    for(const file of files){
      let parsed;
      try{ parsed = await readImportFile(file); }
      catch(err){ problems.push(t('{0}: greška pri čitanju ({1})', file.name, err.message)); continue; }
      if(parsed.error){ problems.push(file.name + ': ' + parsed.error); continue; }
      formats.add(parsed.format);
      skipped += parsed.skipped || 0;
      perFile.push(parsed.rows);
    }
    const problemTxt = problems.join(' · ');
    const rows = C.mergeImportBatches(perFile);
    if(!rows.length){ statusEl.textContent = problemTxt || 'U fajlu nije pronađena nijedna stavka.'; return; }
    // Tacni duplikati (vec u knjizi) se preskacu; slicni (drugi opis, isti iznos, datum +-3 dana) se nude cekiranjem.
    const { fresh, dups } = C.splitDuplicates(rows, entries);
    const { clean, near } = C.findNearDuplicates(fresh, entries.filter(e=> e.type === 'income' || e.type === 'expense'), 3);
    clean.forEach(r=> r.category = importRowCategory(r));
    near.forEach(n=> n.row.category = importRowCategory(n.row));
    // AI predlozi za rashode koje pravila i istorija ne prepoznaju
    const aiCands = C.importAiCandidates(clean);
    let aiRes = { map: new Map(), error: '' };
    if(aiCands.length){
      statusEl.textContent = t('AI predlaže kategorije za {0} opisa…', aiCands.length);
      aiRes = await suggestImportCategories(aiCands, (k, n)=>{ if(n > 1) statusEl.textContent = t('AI predlaže kategorije za {0} opisa… (deo {1}/{2})', aiCands.length, k, n); });
    }
    const fallbackCat = expenseCats.includes('Ostalo') ? 'Ostalo' : (expenseCats[0] || 'Ostalo');
    const aiChoices = aiRes.map.size ? aiCands.map(c=>{ const sg = aiRes.map.get(c.key) || { category: '', keyword: C.suggestKeyword(c.desc) };
      const category = sg.category || fallbackCat;
      // pravilo za podrazumevanu kategoriju nema smisla (opis bi ionako dobio nju) — nije stiklirano, a ni ne pravi se
      return { key: c.key, desc: c.desc, count: c.count, category, keyword: sg.keyword, make: !!sg.category && category !== fallbackCat && sg.strong !== false, makeTouched: false }; }) : [];
    const applyAiChoice = r => { if(r.type !== 'expense' || r.catSource !== 'default') return; const ch = aiChoices.find(x=> x.key === C.importDescKey(r.desc)); if(ch) r.category = ch.category; };
    clean.forEach(applyAiChoice); near.forEach(n=> applyAiChoice(n.row));
    const catOptsHtml = sel => expenseCats.map(c=> `<option value="${escapeHtml(c)}"${c === sel ? ' selected' : ''} translate="no">${escapeHtml(c)}</option>`).join('');
    const aiHtml = aiChoices.length ? `<div class="import-ai"><p><b>${escapeHtml(t('AI predlozi'))}</b> — ${escapeHtml(t('za opise koje pravila ne prepoznaju. Štiklirano = napravi pravilo, pa sledeći put AI nije potreban.'))}</p>
        ${aiChoices.map((c, i)=> `<div class="import-ai-row" data-ai="${i}"><span class="import-ai-desc" translate="no" title="${escapeHtml(c.desc)}">${escapeHtml(c.desc.slice(0, 40))}${c.count > 1 ? ' ×' + c.count : ''}</span>
          <select aria-label="${escapeHtml(t('Kategorija'))}">${catOptsHtml(c.category)}</select>
          <input type="text" value="${escapeHtml(c.keyword)}" maxlength="30" translate="no" aria-label="${escapeHtml(t('Ključna reč za pravilo'))}">
          <label class="import-ai-make"><input type="checkbox"${c.make ? ' checked' : ''}> ${escapeHtml(t('pravilo'))}</label></div>`).join('')}</div>`
      : '';
    // greska AI-ja se uvek prikazuje — i kad je samo deo zahteva (po 60 opisa) pao, pa deo predloga fali
    const aiErrHtml = !aiRes.error ? '' : aiChoices.length
      ? `<p class="hint import-ai-error">${escapeHtml(t('Deo AI predloga nije stigao ({0}) — ti opisi ostaju u kategoriji {1}.', aiRes.error, fallbackCat))}</p>`
      : `<p class="hint import-ai-error">${escapeHtml(t('AI predlozi nisu dostupni ({0}).', aiRes.error))}</p>`;
    const sum = list => list.reduce((a,r)=>a+r.amount,0);
    const inc = clean.filter(r=>r.type==='income'), exp = clean.filter(r=>r.type==='expense');
    const all = clean.concat(near.map(n=> n.row));
    const dates = all.map(r=>r.date).sort();
    const cov = C.monthCoverage(all);
    const haveByMonth = new Map();
    entries.forEach(e=>{ if(e.type === 'income' || e.type === 'expense'){ const m = (e.date || '').slice(0, 7); haveByMonth.set(m, (haveByMonth.get(m) || 0) + 1); } });
    const covTxt = cov.map(c=> `<span class="import-month${haveByMonth.get(c.month) ? ' has' : ''}" title="${escapeHtml(t('prihodi {0} · rashodi {1}', fmt(c.income), fmt(c.expense)))}">${monthYearLabelSr(c.month)} <b>${c.count}</b></span>`).join('');
    const dShort = iso => parseLocalDate(iso).toLocaleDateString(LOCALE,{day:'2-digit',month:'2-digit',year:'2-digit'});
    const preview = clean.slice().sort((a,b)=> a.date.localeCompare(b.date)).slice(0, 8).map(r=>
      `<tr><td>${dShort(r.date)}</td><td>${escapeHtml(r.desc.slice(0,38))}</td><td${r.type === 'expense' && r.catSource === 'default' ? ` data-ai-key="${escapeHtml(C.importDescKey(r.desc))}"` : ''}>${escapeHtml(r.category)}</td><td class="amount ${r.type}">${r.type==='income'?'+':'−'} ${fmt(r.amount)}</td></tr>`).join('');
    const nearHtml = near.length ? `<div class="import-near"><p>${t('<b>{0}</b> stavki liči na nešto što je već upisano (isti iznos, datum do 3 dana razlike). Podrazumevano se <b>ne</b> uvoze — čekiraj one koje ipak želiš:', near.length)}</p>
        ${near.map((n, i)=> `<label class="import-near-row"><input type="checkbox" data-near="${i}"><span>${dShort(n.row.date)} · ${escapeHtml(n.row.desc.slice(0,32))} · ${fmt(n.row.amount)}</span><span class="muted">${t('već: {0} · {1}', escapeHtml((n.match.desc || '').slice(0,24)), dShort(n.match.date))}</span></label>`).join('')}</div>` : '';
    const msg = !all.length
      ? t('Sve stavke iz ovog fajla ({0}) su već u knjizi — nema ništa novo za uvoz.', dups.length)
      : `<p style="margin-top:0;">${t('Format: <b>{0}</b> · period {1} – {2}', [...formats].join(', '), parseLocalDate(dates[0]).toLocaleDateString(LOCALE), parseLocalDate(dates[dates.length-1]).toLocaleDateString(LOCALE))}${files.length > 1 ? ' · ' + t('{0} fajlova', files.length) : ''}</p>
         <p>${t('<b>{0}</b> novih stavki: {1} rashoda ({2}) i {3} prihoda ({4}).', clean.length, exp.length, fmt(sum(exp)), inc.length, fmt(sum(inc)))}</p>
         ${cov.length > 1 ? `<div class="import-months">${covTxt}</div><p class="hint" style="margin-top:0.3em;">${t('Podvučeni meseci već imaju stavke u knjizi.')}</p>` : ''}
         ${dups.length ? `<p>${t('Preskače se <b>{0}</b> stavki koje već postoje u knjizi.', dups.length)}</p>` : ''}
         ${skipped ? `<p>${t('Preskočeno {0} redova bez datuma ili iznosa.', skipped)}</p>` : ''}
         ${problemTxt ? `<p class="hint">${escapeHtml(problemTxt)}</p>` : ''}
         ${clean.length ? `<div class="table-scroll" style="margin-top:0.6em;"><table style="font-size:0.86em;"><tbody>${preview}</tbody></table></div>` : ''}
         ${clean.length > 8 ? `<p class="hint">${t('…i još {0}.', clean.length - 8)}</p>` : ''}
         ${nearHtml}
         ${aiHtml}
         ${aiErrHtml}
         <p class="hint">Kategorije su dodeljene po pravilima i ranijim stavkama sa istim opisom — posle uvoza ih možeš promeniti.</p>`;
    if(!all.length){ await appAlert(msg, { title: 'Uvoz izvoda' }); statusEl.textContent = 'Ništa novo za uvoz.'; return; }
    const pickedNear = new Set();
    const okText = n => t('Uvezi {0}', n);
    const pending = appConfirm(msg, { title: t('Uvoz izvoda'), html: true, okText: okText(clean.length) });
    document.querySelectorAll('#dialogBody [data-near]').forEach(box=> box.addEventListener('change', ()=>{
      const i = Number(box.dataset.near);
      if(box.checked) pickedNear.add(i); else pickedNear.delete(i);
      document.getElementById('dialogOk').textContent = okText(clean.length + pickedNear.size);
    }));
    document.querySelectorAll('#dialogBody .import-ai-row').forEach(row=>{
      const ch = aiChoices[Number(row.dataset.ai)];
      const sel = row.querySelector('select'), kw = row.querySelector('input[type="text"]'), mk = row.querySelector('input[type="checkbox"]');
      sel.addEventListener('change', ()=>{
        ch.category = sel.value;
        // stiklica prati izbor samo dok je korisnik nije sam dirao; za podrazumevanu kategoriju pravilo nema smisla
        if(!ch.makeTouched){ ch.make = ch.category !== fallbackCat; mk.checked = ch.make; }
        // pregled iznad prikazuje izabranu kategoriju, ne AI predlog
        document.querySelectorAll('#dialogBody td[data-ai-key]').forEach(td=>{ if(td.dataset.aiKey === ch.key) td.textContent = ch.category; });
      });
      kw.addEventListener('input', ()=>{ ch.keyword = kw.value; });
      mk.addEventListener('change', ()=>{ ch.make = mk.checked; ch.makeTouched = true; });
    });
    const confirmed = await pending;
    const toImport = clean.concat(near.filter((n, i)=> pickedNear.has(i)).map(n=> n.row));
    if(!confirmed || !toImport.length){ statusEl.textContent = 'Uvoz je otkazan.'; return; }
    const importId = newId();
    toImport.forEach(applyAiChoice);
    const rulePlan = C.importRulePlan(aiChoices, catRules, fallbackCat);
    const newRules = rulePlan.rules;
    if(newRules.length){ catRules.push(...newRules); saveCatRules(); }
    toImport.forEach(r=>{
      if(r.type === 'expense' && !expenseCats.includes(r.category)) expenseCats.push(r.category);
      if(r.type === 'income' && !incomeCats.includes(r.category)) incomeCats.push(r.category);
      const e = { id: newId(), type: r.type, desc: r.desc, amount: r.amount, category: r.category, date: r.date, tags: r.tags || [], importId };
      if(accounts.length) e.accountId = document.getElementById('importAccount').value || defaultAccountId();
      if(r.type === 'expense') e.paid = r.paid !== false;
      entries.push(e);
    });
    saveEntries(); saveCats(); saveIncomeCats();
    populateExpenseCategorySelect(); populateExpenseFilters(); populateRecurringCategorySelect(); renderCatRules();
    const skippedNear = near.length - pickedNear.size;
    statusEl.textContent = t('Uvezeno {0} stavki.', toImport.length)
      + (dups.length ? ' ' + t('Preskočeno duplikata: {0}.', dups.length) : '')
      + (skippedNear ? ' ' + t('Preskočeno sličnih: {0}.', skippedNear) : '')
      + (problemTxt ? ' ' + problemTxt : '');
    renderAll();
    if(newRules.length) statusEl.textContent += ' ' + t('Nova pravila: {0}.', newRules.length);
    if(rulePlan.conflicts.length) statusEl.textContent += ' ' + t('Pravilo nije napravljeno jer ključna reč već vodi u drugu kategoriju: {0}.',
      rulePlan.conflicts.map(c=> `${c.keyword} → ${c.category} (${t('već: {0}', c.existing)})`).join(', '));
    showUndoToast(t('Uvezeno {0} stavki', toImport.length), ()=>{
      entries = entries.filter(e=> e.importId !== importId); saveEntries();
      if(newRules.length){ catRules = catRules.filter(r=> !newRules.includes(r)); saveCatRules(); renderCatRules(); }
      renderAll(); statusEl.textContent = 'Uvoz je poništen.';
    });
  }
  // Za testove: uvoz tekstualnih fajlova bez biranja fajla
  if(IS_TEST) window.__runImportText = files => runImport(files.map(f=> new File([f.text], f.name, { type: 'text/plain' })), document.getElementById('csvImportStatus'));
  document.getElementById('csvImportInput').addEventListener('change', function(e){
    const files = [...e.target.files];
    e.target.value = '';
    if(files.length) runImport(files, document.getElementById('csvImportStatus'));
  });

  // Pravilo iz izmene stavke: kljucna rec = opis bez brojeva na kraju (npr. "WOLT 12345" -> "wolt").
  function rememberCategoryRule(desc, category){
    const keyword = String(desc).replace(/[\d\s.,*#\/-]+$/, '').trim().toLowerCase();
    if(keyword.length < 2) return;
    const existing = catRules.find(r=> r.keyword.toLowerCase() === keyword);
    if(existing) existing.category = category; else catRules.push({ keyword, category });
    saveCatRules(); renderCatRules();
  }
  function renderCatRules(){
    const sel = document.getElementById('newRuleCategory');
    sel.innerHTML = expenseCats.map(c=>userOption(c)).join('');
    const list = document.getElementById('catRulesList');
    list.innerHTML = catRules.map((r,i)=>`<li><span class="name">"${escapeHtml(r.keyword)}" → ${escapeHtml(r.category)}</span>
      <button class="del-btn" data-rule-idx="${i}" title="Obriši pravilo">✕</button></li>`).join('')
      || '<li class="empty">Nema definisanih pravila.</li>';
    list.querySelectorAll('[data-rule-idx]').forEach(b=>{
      b.addEventListener('click', ()=>{
        catRules.splice(parseInt(b.dataset.ruleIdx), 1);
        saveCatRules(); renderCatRules();
      });
    });
  }
  document.getElementById('addCatRuleBtn').addEventListener('click', ()=>{
    const keyword = document.getElementById('newRuleKeyword').value.trim();
    const category = document.getElementById('newRuleCategory').value;
    if(!keyword || !category) return;
    catRules.push({ keyword, category });
    saveCatRules(); renderCatRules();
    document.getElementById('newRuleKeyword').value = '';
  });
  renderCatRules();

