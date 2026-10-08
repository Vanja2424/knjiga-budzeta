  // ---- Mesecna uplata u cilj (g.monthly) ----
  // Iz kopije/Excela: samo ispravan plan (iznos > 0, mesec YYYY-MM), inace undefined.
  function cleanGoalPlan(p){
    if(!p || typeof p !== 'object') return undefined;
    const amount = Number(p.amount);
    const since = String(p.since || '');
    if(!(amount > 0) || !/^\d{4}-\d{2}$/.test(since)) return undefined;
    const plan = { amount: C.round2(amount), day: C.clampRecurringDay(p.day), since };
    if(/^\d{4}-\d{2}$/.test(String(p.last || ''))) plan.last = String(p.last);
    return plan;
  }
  // Kao automatski upis: dospele uplate (i propustene dok je aplikacija bila zatvorena) se same uplate.
  // opts.showNow: poruka sa opozivom odmah (test) — inace tek kad je prozor vidljiv
  function processGoalPlans(opts){
    const cur = currentMonthKey();
    const today = new Date().getDate();
    const done = [];
    goals.forEach(g=>{
      if(!g.monthly) return;
      const due = C.goalPlanDue(g, cur, today);
      if(!due.length) return;
      const prevLast = g.monthly.last;
      due.forEach(d=>{
        const trId = contributeToGoal(g, d.amount, null, { date: d.mKey + '-' + String(d.day).padStart(2, '0'), auto: true });
        done.push({ goalId: g.id, amount: d.amount, trId, prevLast });
      });
      g.monthly.last = due[due.length - 1].mKey;
    });
    if(!done.length) return false;
    saveGoals();
    const total = C.round2(done.reduce((s, d)=> s + d.amount, 0));
    const show = ()=> showUndoToast(t('Automatski uplaćeno u ciljeve: {0} ({1})', done.length, fmt(total)), ()=>{
      const trIds = new Set(done.map(d=> d.trId).filter(Boolean));
      entries = entries.filter(e=> !trIds.has(e.id));
      done.forEach(d=>{
        const g = goals.find(x=> x.id === d.goalId);
        if(!g) return;
        g.current = Math.max(0, C.round2(g.current - d.amount));
        if(g.monthly){ if(d.prevLast) g.monthly.last = d.prevLast; else delete g.monthly.last; }
      });
      saveEntries(); saveGoals(); renderAll();
    });
    if(document.visibilityState !== 'visible' && !(opts && opts.showNow)){
      document.addEventListener('visibilitychange', function onVis(){
        if(document.visibilityState !== 'visible') return;
        document.removeEventListener('visibilitychange', onVis);
        show();
      });
    } else show();
    return true;
  }
  if(IS_TEST) window.__processGoalPlans = () => { const c = processGoalPlans({ showNow: true }); if(c) renderAll(); return c; };
  // Nov plan: od tekuceg meseca ako dan jos nije prosao, inace od sledeceg (ili uvek od sledeceg).
  function setGoalPlan(g, amount, day, fromNextMonth){
    const cur = currentMonthKey();
    day = C.clampRecurringDay(day);
    const since = (fromNextMonth || C.effectiveDay(day, cur) <= new Date().getDate()) ? C.addMonths(cur, 1) : cur;
    g.monthly = { amount: C.round2(amount), day, since };
  }
  function goalPlanNextDate(g){
    const p = g.monthly;
    const cur = currentMonthKey();
    let m = p.since > cur ? p.since : cur;
    if(p.last && p.last >= m) m = C.addMonths(p.last, 1);
    if(m === cur && C.effectiveDay(p.day, cur) <= new Date().getDate()) m = C.addMonths(cur, 1);
    return parseLocalDate(C.dueDateFor({ day: p.day }, m));
  }

  // ---- Progres trake koje se "pune" pri renderu ----
  function growBars(container){
    const bars = container.querySelectorAll('.bar-fill[data-target]');
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        bars.forEach(b=>{ b.style.width = b.dataset.target; });
      });
    });
  }

  // ---- Pregled za novog korisnika: bez ijednog prihoda/rashoda prazni grafikoni se skrivaju ----
  function renderPregledStart(){
    const empty = !entries.some(e=> e.type === 'income' || e.type === 'expense');
    document.getElementById('pregledStart').style.display = empty ? 'block' : 'none';
    document.getElementById('screen-pregled').classList.toggle('pregled-empty', empty);
  }
  document.getElementById('pregledStartExpense').addEventListener('click', ()=> openNewEntry('expense'));
  document.getElementById('pregledStartIncome').addEventListener('click', ()=> openNewEntry('income'));
  document.getElementById('pregledStartRecurring').addEventListener('click', ()=> showScreen('ponavljajuce'));

  // ---- Mesec iza tebe (kartica na Pregledu, prvih 10 dana meseca) ----
  const MONTH_REVIEW_KEY = 'budzet-mesecni-pregled-zatvoren-v1';
  function dismissMonthReview(mKey){
    localStorage.setItem(MONTH_REVIEW_KEY, mKey);
    renderMonthReview();
  }
  let monthReviewToday = null; // samo za testove (window.__monthReview)
  function renderMonthReview(){
    const panel = document.getElementById('monthReviewPanel');
    const mKey = C.monthReviewMonth(monthReviewToday || toISODateLocal(new Date()), localStorage.getItem(MONTH_REVIEW_KEY));
    const hasData = mKey && entries.some(e=> (e.type === 'income' || (e.type === 'expense' && isExpensePaid(e))) && C.shareInMonth(e, mKey) > 0);
    if(!hasData){ panel.style.display = 'none'; return; }
    const r = C.monthReview(entries, { recurring, applied, skipped, limits }, mKey, 6);
    panel.style.display = 'block';
    panel.dataset.month = mKey;
    document.getElementById('monthReviewTitle').textContent = t('Mesec iza tebe: {0}', monthYearLabelSr(mKey));
    const stat = (label, val, cls) => `<div class="month-review-stat"><span>${label}</span><b class="${cls || ''}">${val}</b></div>`;
    const lines = [];
    if(r.enough && r.expensePct != null && r.expensePct !== 0) lines.push(r.expensePct > 0
      ? t('Potrošnja je {0}% veća od proseka ({1}).', r.expensePct, fmt(r.avgExpense))
      : t('Potrošnja je {0}% manja od proseka ({1}).', -r.expensePct, fmt(r.avgExpense)));
    r.up.forEach(x=> lines.push(t('{0}: {1} više nego obično', catTagHtml(x.cat), fmt(x.diff))));
    if(r.down) lines.push(t('{0}: {1} manje nego obično', catTagHtml(r.down.cat), fmt(-r.down.diff)));
    r.overBudget.forEach(x=> lines.push(t('{0}: preko budžeta za {1}', catTagHtml(x.cat), fmt(x.spent - x.limit))));
    const unpaidCount = r.unpaidEntries.length + r.unpaidRecurring.length;
    if(unpaidCount){
      const names = r.unpaidEntries.map(e=> e.desc).concat(r.unpaidRecurring.map(x=> x.desc)).filter(Boolean);
      const shown = names.slice(0, 3).map(n=> `<span translate="no">${escapeHtml(n)}</span>`).join(', ') + (names.length > 3 ? ', …' : '');
      lines.push(`<span class="month-review-warn">${t('Ostalo neplaćeno: {0} ({1})', unpaidCount, fmt(r.unpaidTotal))}</span>${shown ? ' — ' + shown : ''}`);
    }
    document.getElementById('monthReviewBody').innerHTML = `<div class="month-review-stats">
        ${stat(t('Prihodi'), fmt(r.income))}${stat(t('Rashodi'), fmt(r.expense))}
        ${stat(t('Razlika'), (r.net > 0 ? '+' : '') + fmt(r.net), r.net >= 0 ? 'pos' : 'neg')}
        ${r.savingsRate != null ? stat(t('Stopa štednje'), r.savingsRate + '%', r.savingsRate >= 0 ? 'pos' : 'neg') : ''}
      </div>${lines.length ? `<ul class="month-review-list">${lines.map(l=> `<li>${l}</li>`).join('')}</ul>` : ''}`;
    const acts = [`<button class="btn-secondary" id="monthReviewAnaliza">${t('Detaljno u Analizi')}</button>`];
    const sweep = r.net > 0 && activeGoals().length ? Math.floor(r.net) : 0;
    if(sweep > 0) acts.push(`<button class="btn-secondary" id="monthReviewSweep">${t('Prebaci višak u cilj')}</button>`);
    if(r.unpaidEntries.length) acts.push(`<button class="btn-secondary" id="monthReviewUnpaid">${t('Pogledaj neplaćeno')}</button>`);
    if(r.unpaidRecurring.length) acts.push(`<button class="btn-secondary" id="monthReviewPayRec">${escapeHtml(t('Plati zaostale ponavljajuće ({0})', r.unpaidRecurring.length))}</button>`);
    const box = document.getElementById('monthReviewActions');
    box.innerHTML = acts.join('');
    document.getElementById('monthReviewAnaliza').addEventListener('click', ()=> openAnaliza(null, mKey));
    if(sweep > 0) document.getElementById('monthReviewSweep').addEventListener('click', ()=>{
      const list = activeGoals();
      openEditModal(t('Prebaci višak iz meseca {0} u cilj', monthYearLabelSr(mKey)), [
        {key:'goalName', label:'Cilj', type:'select', value: list[0].name, options: list.map(g=> g.name)},
        {key:'amount', label:'Iznos (RSD)', type:'number', value: sweep},
      ], vals=>{
        const g = list.find(x=> x.name === vals.goalName);
        if(!g || isNaN(vals.amount) || vals.amount <= 0) return;
        const before = g.current;
        const trId = contributeToGoal(g, vals.amount);
        localStorage.setItem(MONTH_REVIEW_KEY, mKey);
        renderAll();
        showUndoToast(t('Uplaćeno {0} u cilj „{1}“', fmt(vals.amount), g.name), ()=>{
          g.current = before;
          if(trId){ entries = entries.filter(e=> e.id !== trId); saveEntries(); }
          saveGoals(); localStorage.removeItem(MONTH_REVIEW_KEY); renderAll();
        });
      });
    });
    if(r.unpaidEntries.length) document.getElementById('monthReviewUnpaid').addEventListener('click', ()=>{
      expListMonth = mKey; dirtyScreens.add('rashodi');
      showScreen('rashodi');
    });
    if(r.unpaidRecurring.length) document.getElementById('monthReviewPayRec').addEventListener('click', ()=> payMonthReviewRecurring(r.unpaidRecurring.map(x=> x.id), mKey));
  }
  // Za opoziv placanja: sta je markRecurringPaid promenio za ove stavke u mesecu (placeno, preskoceno, veza racuna sa rashodom).
  // Vraca funkciju koja te stavke vraca tacno na prethodno stanje (ostale izmene u medjuvremenu ostaju).
  function recurringPayUndo(ids, mKey){
    const was = ids.map(id=> ({ id, applied: (applied[mKey] || []).includes(id), skipped: (skipped[mKey] || []).includes(id) }));
    const links = bills.filter(b=> ids.includes(b.recurringId) && (b.expenseMonth || b.month) === mKey).map(b=> ({ b, had: 'entryId' in b, entryId: b.entryId }));
    return ()=>{
      was.forEach(w=>{
        if(!w.applied && applied[mKey]) applied[mKey] = applied[mKey].filter(x=> x !== w.id);
        if(w.skipped){ if(!skipped[mKey]) skipped[mKey] = []; if(!skipped[mKey].includes(w.id)) skipped[mKey].push(w.id); }
      });
      let relink = false;
      links.forEach(l=>{ if(l.b.entryId === l.entryId) return; relink = true; if(l.had) l.b.entryId = l.entryId; else delete l.b.entryId; });
      saveApplied(); saveSkipped(); if(relink) saveBillsState();
    };
  }
  // Placanje ponavljajucih koje su ostale neplacene u proslom mesecu (rashod sa datumom dospeca tog meseca), sa opozivom
  function payMonthReviewRecurring(ids, mKey){
    const restore = recurringPayUndo(ids, mKey);
    const paid = [];
    ids.forEach(id=>{
      const rr = recurring.find(x=> x.id === id); if(!rr) return;
      const had = entries.some(e=> e.id === recurringEntryId(rr, mKey));
      const eid = markRecurringPaid(rr, mKey);
      if(eid) paid.push({ id, eid, had });
    });
    if(!paid.length) return;
    saveApplied(); saveEntries(); playPaidSound(); renderAll();
    showUndoToast(t('Plaćeno za {0}: {1}', monthYearLabelSr(mKey), paid.length), ()=>{
      const drop = new Set(paid.filter(p=> !p.had).map(p=> p.eid));
      entries = entries.filter(e=> !drop.has(e.id));
      restore();
      saveEntries(); renderAll();
    });
  }
  if(IS_TEST) window.__monthReview = iso => { monthReviewToday = iso || null; renderMonthReview(); };
  if(IS_TEST) window.__goals = () => goals;
  if(IS_TEST) window.__recurringRaw = { list: ()=> recurring, applied: ()=> applied, skipped: ()=> skipped, save: ()=>{ saveRecurring(); saveApplied(); renderAll(); } };
  if(IS_TEST) window.__saveGoals = () => { saveGoals(); renderAll(); };
  document.getElementById('monthReviewClose').addEventListener('click', ()=>{
    const mKey = document.getElementById('monthReviewPanel').dataset.month;
    if(!mKey) return;
    dismissMonthReview(mKey);
    showUndoToast(t('Pregled meseca je zatvoren'), ()=>{ localStorage.removeItem(MONTH_REVIEW_KEY); renderMonthReview(); });
  });

  // ---- Pregled ----
  function renderPregled(){
    const { byCat, catEntries } = monthTotals(viewMonth);
    const maxVal = Math.max(1, ...Object.values(byCat));
    const total = Object.values(byCat).reduce((s,v)=>s+v,0);
    const breakdownEl = document.getElementById('breakdown');
    document.getElementById('breakdownTitle').textContent = t('Rashodi po kategorijama — {0}', monthYearLabelSr(viewMonth));
    breakdownEl.innerHTML = catEntries.length === 0
      ? '<div class="empty" style="padding:1em 0;">Nema plaćenih rashoda u ovom mesecu.</div>'
      : catEntries.map(([cat,val])=>{
        const barClass = '';
        const limitTxt = ` <span style="opacity:0.65;">${total > 0 ? Math.round(val/total*100) : 0}%</span>`;
        const color = sanitizeHexColor(catColors[cat]);
        const barStyle = color ? ` style="background:${color}"` : '';
        return `<div class="breakdown-item">
          <div class="row"><span>${escapeHtml(cat)}</span><span>${fmt(val)}${limitTxt}</span></div>
          <div class="bar-track"><div class="bar-fill ${barClass}" data-target="${Math.min(100,(val/maxVal*100)).toFixed(1)}%"${barStyle}></div></div>
        </div>`;
      }).join('');
    growBars(breakdownEl);

    const recent = entries.filter(e=> (e.type === 'income' || e.type === 'expense') && (monthKey(e.date) === viewMonth || C.shareInMonth(e, viewMonth) > 0))
      .sort((a,b)=> b.date.localeCompare(a.date)).slice(0,10);
    document.getElementById('recentTitle').textContent = t('Poslednje stavke — {0}', monthYearLabelSr(viewMonth));
    const recentBody = document.getElementById('recentBody');
    const recentEmpty = document.getElementById('recentEmpty');
    if(recent.length === 0){ recentBody.innerHTML = ''; recentEmpty.style.display = 'block'; }
    else {
      recentEmpty.style.display = 'none';
      recentBody.innerHTML = recent.map(e=>{
        const d = parseLocalDate(e.date).toLocaleDateString(LOCALE, {day:'2-digit', month:'2-digit', year:'numeric'});
        const sign = e.type === 'income' ? '+' : '−';
        const pendingTag = (e.type==='expense' && !isExpensePaid(e)) ? ' <span class="cat-tag" style="color:var(--gold-text);border-color:var(--gold);">na čekanju</span>' : '';
        const share = C.shareInMonth(e, viewMonth);
        const amountHtml = isSpread(e)
          ? `${sign} ${fmt(share)}<span class="orig-amt">${t('deo od {0}', fmt(e.amount))}</span>`
          : `${sign} ${fmt(e.amount)}${origTag(e)}`;
        return `<tr><td>${d}</td><td>${escapeHtml(e.desc)}</td><td>${catTagHtml(e.category)}${pendingTag}${tagsHtml(e.tags)}${accountTag(e)}${spreadTag(e)}</td>
          <td class="amount ${e.type}">${amountHtml}</td></tr>`;
      }).join('');
    }

    renderDonut(catEntries);
    renderTrend();
    renderBalanceChart();
    renderInsights(catEntries);
    renderWarnings(catEntries);
    renderRecurringSuggestions();
    renderTagBreakdown();
    renderPatterns();
    renderMonthCalendar();
  }

  function renderTagBreakdown(){
    const panel = document.getElementById('tagBreakdownPanel');
    const byTag = {};
    entries.filter(e=>isPaidExpense(e) && e.tags && e.tags.length).forEach(e=>{
      const share = C.shareInMonth(e, viewMonth);
      if(share) e.tags.forEach(t=>{ byTag[t] = (byTag[t]||0) + share; });
    });
    const tagEntries = Object.entries(byTag).sort((a,b)=>b[1]-a[1]);
    if(tagEntries.length === 0){ panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    const maxVal = Math.max(1, ...tagEntries.map(([,v])=>v));
    const el = document.getElementById('tagBreakdown');
    el.innerHTML = tagEntries.map(([tag,val])=>`<div class="breakdown-item">
      <div class="row"><span>#${escapeHtml(tag)}</span><span>${fmt(val)}</span></div>
      <div class="bar-track"><div class="bar-fill ok" data-target="${Math.min(100,(val/maxVal*100)).toFixed(1)}%"></div></div>
    </div>`).join('');
    growBars(el);
  }

  // ---- Obrasci i anomalije ----
  // "Subscription creep": poredi PRVI i NAJNOVIJI stvarno naplaceni iznos za istu ponavljajucu
  // stavku (iz stvarnih generisanih entries, ne iz definicije r.amount) — hvata bills koji su
  // tiho porasli kroz vreme (npr. streaming pretplata koja je jeftina prve godine).
  function detectSubscriptionCreep(){
    const results = [];
    recurring.forEach(r=>{
      const prefix = 'rec-' + r.id + '-';
      const history = entries.filter(e=>e.id.startsWith(prefix)).sort((a,b)=>a.date.localeCompare(b.date));
      if(history.length < 3) return;
      const first = history[0].amount;
      const last = history[history.length-1].amount;
      if(first > 0 && last > first * 1.15){
        results.push({ r, first, last, pct: Math.round((last-first)/first*100) });
      }
    });
    return results;
  }
  // Isti tip+datum+iznos+opis (bez obzira na velika/mala slova/razmake) — cest slucaj kod
  // dvostrukog CSV/OFX/QIF uvoza ili slucajnog dva puta unetog rashoda. Vraca grupe od 2+ stavke.
  function detectDuplicateEntries(){
    const seen = new Map();
    entries.forEach(e=>{
      if(isTransfer(e)) return;
      const key = `${e.type}|${e.date}|${e.amount}|${(e.desc||'').trim().toLowerCase()}`;
      if(!seen.has(key)) seen.set(key, []);
      seen.get(key).push(e);
    });
    const groups = [];
    seen.forEach(list=>{ if(list.length > 1) groups.push(list); });
    return groups;
  }
  // Prosta linearna regresija (najmanji kvadrati) — koristi se samo za grubu prognozu sledeceg
  // meseca na osnovu trenda poslednjih meseci, ne kao precizna finansijska projekcija.
  const linearRegressionForecast = C.linearRegressionForecast;
  function renderPatterns(){
    const panel = document.getElementById('patternsPanel');
    const creep = detectSubscriptionCreep();
    const S = C.savingsSummary(entries, recurring, fixedCategories, currentMonthKey(), 6);
    const months = lastNMonths(6);
    const monthlyExpense = months.map(m => sumMonth(m, isPaidExpense));
    const forecast = linearRegressionForecast(monthlyExpense);
    if(creep.length === 0 && S.above.length === 0 && S.small.length === 0 && forecast == null){ panel.style.display = 'none'; return; }
    panel.style.display = 'block';

    const forecastEl = document.getElementById('patternsForecast');
    forecastEl.innerHTML = (forecast != null) ? `<div class="insight-card" style="border-bottom:none; padding:0;">
      <div class="big">${fmt(Math.round(forecast))}</div>
      <div class="small">${t('Procena ukupnih rashoda za sledeći mesec, na osnovu trenda poslednjih {0} meseci.', monthlyExpense.length)}</div>
    </div>` : '';

    const rows = [];
    creep.forEach(({r,first,last,pct})=>{
      rows.push({level:'caution', icon:'📈', txt: t('<b>{0}</b> je poskupeo za {1}% od prve naplate ({2} → {3}) — vredi proveriti da li je i dalje isplativ.', escapeHtml(r.desc), pct, fmt(first), fmt(last))});
    });
    const aboveMonthsN = C.periodStats(entries, S.breakdown.months).monthsWithData;
    S.above.forEach(({cat,total,avg,pct})=>{
      rows.push({level:'caution', icon:'⚠', txt: t('Kategorija <b>{0}</b> je ovog meseca {1}% iznad proseka ({2}: {3} naspram proseka {4}).', escapeHtml(cat), pct, monthsTxt(aboveMonthsN), fmt(total), fmt(Math.round(avg)))});
    });
    document.getElementById('patternsList').innerHTML = rows.map(w=>`<div class="warning-item caution"><span class="icon">${w.icon}</span><span class="txt">${w.txt}</span></div>`).join('');

    const link = document.getElementById('patternsAnalizaLink');
    if(S.above.length){
      link.dataset.kind = 'above'; link.dataset.total = String(Math.round(S.aboveTotal));
      link.textContent = (S.above.length === 1 ? t('1 kategorija iznad proseka') : t('{0} iznad proseka', categoriesTxt(S.above.length))) + ' · ' + t('moguća ušteda ~{0} →', fmt(S.aboveTotal));
      link.style.display = '';
    } else if(S.small.length){
      link.dataset.kind = 'small'; link.dataset.total = String(Math.round(S.smallMonthly));
      link.textContent = t('Sitni troškovi: ~{0} mesečno →', fmt(S.smallMonthly));
      link.style.display = '';
    } else {
      link.style.display = 'none'; delete link.dataset.total;
    }
  }
  document.getElementById('patternsAnalizaLink').addEventListener('click', ()=> openAnaliza('save'));

