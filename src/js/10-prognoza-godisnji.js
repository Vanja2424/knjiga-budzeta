  // ---------- Prognoza do plate ----------
  function forecastNow(){
    const today = toISODateLocal(new Date());
    let start;
    if(accounts.length){
      const bal = C.accountBalances(accounts, entries, isExpensePaid, today);
      start = accounts.filter(a=> a.type !== 'stednja').reduce((s, a)=> s + (bal[a.id] || 0), 0);
    } else {
      const past = entries.filter(e=> e.date <= today);
      start = past.filter(e=> e.type === 'income').reduce((s, e)=> s + e.amount, 0) - past.filter(e=> e.type === 'expense' && isExpensePaid(e)).reduce((s, e)=> s + e.amount, 0) - debtExpenseTotals().paid;
    }
    const rec = recurring.map(r=> Object.assign({}, r, { amount: recurringAmountNow(r) }));
    const dailySpend = C.forecastDailySpend(entries, currentMonthKey(), rec, fixedCategories);
    const fundGoal = goals.find(g=> g.yearlyFund);
    const fundAcc = fundGoal && accounts.find(a=> a.id === fundGoal.accountId);
    // novac fonda bez racuna stednje stoji na tekucem racunu: rezervisan je, pa nije raspoloziv za trosenje
    if(fundGoal && !(fundAcc && fundAcc.type === 'stednja')) start -= Number(fundGoal.current) || 0;
    // iz fonda se placa samo "Plati iz fonda"; stavke sa automatskim placanjem idu sa svog racuna
    const fund = fundGoal ? { goalId: fundGoal.id, current: fundGoal.current, itemIds: rec.filter(r=> r.type === 'expense' && !r.autoPay && (r.frequency === 'yearly' || r.frequency === 'quarterly')).map(r=> r.id) } : null;
    const f = C.cashForecast({ today, days: 60, startBalance: C.round2(start), recurring: rec, entries, applied, skipped, goals, dailySpend,
      payday: payday.mode === 'manual' ? payday : null, fund });
    f.dailySpend = C.round2(dailySpend);
    f.startBalance = C.round2(start);
    f.fundItemIds = fund ? fund.itemIds : [];
    return f;
  }
  const fcDate = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' }); };
  function renderForecastCard(){
    const box = document.getElementById('forecastCard'); if(!box) return;
    if(!entries.length && !recurring.length){ box.style.display = 'none'; return; }
    const f = forecastNow(), today = toISODateLocal(new Date());
    const warn = f.firstNegative && (!f.payday || f.firstNegative.date < f.payday.date);
    let main, sub = '';
    if(warn) main = '⚠ ' + t('Oko {0} ulaziš u minus ({1}).', fcDate(f.firstNegative.date), fmt(f.firstNegative.balance));
    else if(f.payday){
      main = t('Do plate ({0}) ostaje ~{1}', fcDate(f.payday.date), fmt(f.beforePayday ? f.beforePayday.balance : f.points[0].balance));
      if(f.daily != null) sub = t('Možeš da trošiš ~{0} dnevno (posle računa i uplata koje dolaze).', fmt(f.daily));
    } else main = t('Za 60 dana: ~{0}', fmt(f.points[f.points.length - 1].balance));
    if(!f.payday) sub = t('Plata nije poznata — dodaj ponavljajući prihod ili je upiši u Podešavanjima → Plata.');
    const expired = payday.mode === 'manual' && payday.date < today;
    const soon = C.yearlyReminders(recurring.map(r=> Object.assign({}, r, { amount: recurringAmountNow(r) })), today, { applied, skipped }).slice(0, 3);
    if(soon.length) sub += (sub ? ' ' : '') + t('Uskoro: {0}.', soon.map(x=> `${x.desc} ${fmt(x.amount)} (${fcDate(x.date)})`).join(', '));
    box.classList.toggle('fc-warn', !!warn);
    box.style.display = '';
    box.innerHTML = `<h3 style="margin-top:0;">${escapeHtml(t('Do plate'))}</h3><div class="fc-main">${escapeHtml(main)}</div>`
      + (sub ? `<div class="fc-sub">${escapeHtml(sub)}</div>` : '')
      + (expired ? `<div class="fc-note">${escapeHtml(t('Plata od {0} je prošla — upiši sledeću ili vrati na automatski (Podešavanja → Plata).', fcDate(payday.date)))}</div>` : '');
  }
  document.getElementById('forecastCard').addEventListener('click', ()=> showScreen('prognoza'));
  document.getElementById('forecastCard').addEventListener('keydown', e=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); showScreen('prognoza'); } });
  function renderForecast(){
    const f = forecastNow(), svg = document.getElementById('forecastChart');
    const W = 760, H = 220, P = { l: 56, r: 12, t: 14, b: 26 };
    const vals = f.points.map(p=> p.balance), lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), span = (hi - lo) || 1;
    const x = i => P.l + i * (W - P.l - P.r) / (f.points.length - 1), y = v => P.t + (hi - v) * (H - P.t - P.b) / span;
    const idx = new Map(f.points.map((p, i)=> [p.date, i]));
    const big = Math.max(2000, Math.abs(f.points[0].balance) * 0.03);
    const dots = f.events.filter(e=> Math.abs(e.amount) >= big).map(e=>{ const i = idx.get(e.date); if(i == null) return '';
      return `<circle class="${e.amount > 0 ? 'fc-dot-in' : 'fc-dot-out'}" cx="${x(i).toFixed(1)}" cy="${y(f.points[i].balance).toFixed(1)}" r="3.5"><title>${escapeHtml(fcDate(e.date) + ' · ' + (e.desc || (e.kind === 'payday' ? t('Plata') : '')) + ' · ' + fmt(e.amount))}</title></circle>`; }).join('');
    const pay = f.payday && idx.has(f.payday.date) ? `<line class="fc-pay" x1="${x(idx.get(f.payday.date))}" x2="${x(idx.get(f.payday.date))}" y1="${P.t}" y2="${H - P.b}"/><text class="fc-label" x="${x(idx.get(f.payday.date)) + 4}" y="${P.t + 10}">${escapeHtml(t('Plata'))}</text>` : '';
    svg.innerHTML = `<line class="fc-zero" x1="${P.l}" x2="${W - P.r}" y1="${y(0)}" y2="${y(0)}"/>`
      + `<text class="fc-label" x="4" y="${y(hi) + 4}">${escapeHtml(fmt(hi))}</text><text class="fc-label" x="4" y="${y(lo) + 4}">${escapeHtml(fmt(lo))}</text>`
      + `<text class="fc-label" x="${P.l}" y="${H - 6}">${escapeHtml(fcDate(f.points[0].date))}</text><text class="fc-label" x="${W - P.r - 60}" y="${H - 6}">${escapeHtml(fcDate(f.points[f.points.length - 1].date))}</text>`
      + pay + `<polyline class="fc-line" points="${f.points.map((p, i)=> x(i).toFixed(1) + ',' + y(p.balance).toFixed(1)).join(' ')}"/>` + dots;
    const dailySpend = f.dailySpend;
    document.getElementById('forecastSummary').textContent = [
      t('Polazno stanje (računi bez štednje): {0}', fmt(f.startBalance)),
      dailySpend > 0 ? t('svakodnevna potrošnja ~{0} dnevno (prosek 3 meseca)', fmt(dailySpend)) : '',
      f.payday ? t('plata {0}: {1}', fcDate(f.payday.date), fmt(f.payday.amount)) : t('plata nije poznata'),
      t('najniže: {0} ({1})', fmt(f.lowest.balance), fcDate(f.lowest.date))
    ].filter(Boolean).join(' · ');
    const balOn = new Map(f.points.map(p=> [p.date, p.balance]));
    document.getElementById('forecastBody').innerHTML = f.events.length ? f.events.map(e=> `<tr class="fc-event${balOn.get(e.date) < 0 ? ' fc-neg' : ''}"><td>${escapeHtml(fcDate(e.date))}</td><td translate="no">${escapeHtml(e.desc || (e.kind === 'payday' ? t('Plata') : ''))}</td><td class="num">${escapeHtml(fmt(e.amount))}</td><td class="num">${escapeHtml(fmt(balOn.get(e.date)))}</td></tr>`).join('')
      : `<tr><td colspan="4" class="hint">${escapeHtml(t('Nema predstojećih stavki u narednih 60 dana.'))}</td></tr>`;
  }
  // ---------- Veliki godisnji troskovi ----------
  const yearlyFundGoal = () => goals.find(g=> g.yearlyFund) || null;
  function yearlyNow(){
    const g = yearlyFundGoal();
    return C.yearlyCosts(recurring.map(r=> Object.assign({}, r, { amount: recurringAmountNow(r) })), toISODateLocal(new Date()), { applied, skipped, fundBalance: g ? g.current : 0 });
  }
  const ycMonthName = i => new Date(2026, i, 1).toLocaleDateString(LOCALE, { month: 'long' });
  const ycMonthShort = mKey => { const [y, m] = mKey.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString(LOCALE, { month: 'short', year: 'numeric' }); };
  function renderYearly(){
    const y = yearlyNow(), g = yearlyFundGoal(), today = toISODateLocal(new Date());
    const soonLimit = (()=>{ const d = new Date(); d.setDate(d.getDate() + 30); return toISODateLocal(d); })();
    document.getElementById('yearlySummary').innerHTML = y.items.length
      ? `<div class="yc-big">${escapeHtml(t('Mesečno odvajanje: ~{0}', fmt(y.recommended)))}</div><div class="yc-sub">${escapeHtml(t('dugoročno ~{0} · da sve stigne na vreme ~{1}', fmt(y.steady), fmt(y.catchUp)))}</div>`
      : `<div class="yc-sub">${escapeHtml(t('Nema godišnjih ni tromesečnih troškova. Dodaj registraciju, osiguranje, porez na imovinu ili godišnju pretplatu.'))}</div>`;
    document.getElementById('yearlyStrip').innerHTML = y.months.map(m=> `<div class="yc-month${m.total ? '' : ' yc-empty'}${y.heavy.includes(m.mKey) ? ' heavy' : ''}"><div class="yc-mname">${escapeHtml(ycMonthShort(m.mKey))}</div>`
      + m.items.map(i=> `<div class="yc-item"><span translate="no">${escapeHtml(i.desc)}</span><span>${escapeHtml(fmt(i.amount))}</span></div>`).join('')
      + (m.total ? `<div class="yc-total">${escapeHtml(fmt(m.total))}</div>` : '') + '</div>').join('');
    const freq = f => f === 'quarterly' ? t('tromesečno') : t('godišnje');
    document.getElementById('yearlyBody').innerHTML = y.items.length ? y.items.map(i=> `<tr data-id="${i.id}"><td translate="no">${escapeHtml(i.desc)}</td><td class="num">${escapeHtml(fmt(i.amount))}</td><td>${escapeHtml(freq(i.frequency))}</td>`
      + `<td>${i.next ? escapeHtml(fmtDocDate(i.next)) : ''}</td><td class="num">${i.monthsLeft}</td><td class="num">${escapeHtml(fmt(i.perMonth))}</td>`
      + `<td>${g && i.next && i.next <= soonLimit ? `<button class="btn-secondary yc-pay" data-id="${i.id}">${escapeHtml(t('Plati iz fonda'))}</button>` : ''}</td></tr>`).join('')
      : `<tr><td colspan="7" class="hint">${escapeHtml(t('Još nema stavki.'))}</td></tr>`;
    document.querySelectorAll('#yearlyBody .yc-pay').forEach(b=> b.addEventListener('click', ()=> payYearlyFromFund(b.dataset.id)));
    const fp = document.getElementById('yearlyFundPanel');
    if(!g){
      fp.innerHTML = `<h3 style="margin-top:0;">${escapeHtml(t('Fond za godišnje troškove'))}</h3><div class="import-status" style="margin-top:0;">${escapeHtml(t('Napravi cilj štednje sa automatskom mesečnom uplatom predloženog iznosa, pa troškove plaćaj iz njega kad stignu.'))}</div>`
        + `<div class="file-row"><button class="btn-secondary" id="ycFundCreate"${y.recommended > 0 ? '' : ' disabled'}>${escapeHtml(t('Napravi cilj „Godišnji troškovi“'))}</button></div>`;
      document.getElementById('ycFundCreate').addEventListener('click', createYearlyFund);
    } else {
      const off = g.monthly && Math.abs(g.monthly.amount - y.recommended) >= 100;
      fp.innerHTML = `<h3 style="margin-top:0;">${escapeHtml(t('Fond za godišnje troškove'))}</h3><div class="import-status" style="margin-top:0;">${escapeHtml(t('U fondu: {0} od {1}.', fmt(g.current), fmt(g.target)))} ${escapeHtml(g.monthly ? t('Mesečna uplata: {0} ({1}. u mesecu).', fmt(g.monthly.amount), g.monthly.day) : t('Nema mesečne uplate.'))}</div>`
        + (off ? `<div class="import-status">${escapeHtml(t('Predlog je sada {0} mesečno.', fmt(y.recommended)))}</div>` : '')
        + `<div class="file-row"><button class="btn-secondary" id="ycFundSync"${off || !g.monthly ? '' : ' disabled'}>${escapeHtml(t('Uskladi plan'))}</button><button class="btn-secondary" id="ycFundOpen">${escapeHtml(t('Otvori Ciljeve'))}</button></div>`;
      document.getElementById('ycFundSync').addEventListener('click', ()=>{
        const cur = yearlyNow();
        g.monthly = cleanGoalPlan({ amount: cur.recommended, day: g.monthly ? g.monthly.day : 1, since: (g.monthly && g.monthly.since) || yearlyPlanSince(1), last: g.monthly && g.monthly.last });
        g.target = Math.max(g.target, cur.yearTotal);
        saveGoals(); renderAll();
      });
      document.getElementById('ycFundOpen').addEventListener('click', ()=> showScreen('ciljevi'));
    }
  }
  document.getElementById('ycAdd').addEventListener('click', ()=>{
    const months = Array.from({ length: 12 }, (_, i)=> ycMonthName(i));
    openEditModal(t('Dodaj godišnji trošak'), [
      { key: 'desc', label: t('Naziv (npr. Registracija auta)'), type: 'text', value: '' },
      { key: 'amount', label: t('Iznos (RSD)'), type: 'number', value: '' },
      { key: 'month', label: t('Mesec'), type: 'select', value: months[new Date().getMonth()], options: months },
      { key: 'day', label: t('Dan u mesecu'), type: 'number', value: 1 },
      { key: 'category', label: t('Kategorija'), type: 'select', value: expenseCats[0] || '', options: expenseCats }
    ], vals=>{
      const desc = String(vals.desc || '').trim(), amount = Number(vals.amount);
      if(!desc || !(amount > 0)){ appAlert(t('Upiši naziv i iznos.')); return false; }
      const rec = { id: newId(), desc, amount: C.round2(amount), category: expenseCats.includes(vals.category) ? vals.category : (expenseCats[0] || 'Ostalo'), type: 'expense',
        day: C.clampRecurringDay(vals.day), frequency: 'yearly', anchorMonth: Math.max(1, months.indexOf(vals.month) + 1), isSubscription: false, autoPay: false };
      if(accounts.length) rec.accountId = defaultAccountId();
      recurring.push(rec); saveRecurring(); renderAll();
    });
  });
  // Prva mesecna uplata: ovog meseca ako dan uplate jos nije prosao, inace od sledeceg (bez uplate unazad)
  const yearlyPlanSince = day => C.clampRecurringDay(day) >= new Date().getDate() ? currentMonthKey() : C.addMonths(currentMonthKey(), 1);
  function createYearlyFund(){
    const y = yearlyNow(), NONE = t('— bez računa —');
    const accs = accounts.filter(a=> a.type === 'stednja');
    openEditModal(t('Napravi cilj „Godišnji troškovi“'), [
      { key: 'account', label: t('Račun na koji ide novac (opciono)'), type: 'select', value: accs.length && accs[0].type === 'stednja' ? accs[0].name : NONE, options: [NONE].concat(accs.map(a=> a.name)) },
      { key: 'day', label: t('Dan mesečne uplate'), type: 'number', value: 1 }
    ], vals=>{
      if(yearlyFundGoal()) return;
      const acc = accs.find(a=> a.name === vals.account);
      const goal = { id: newId(), name: t('Godišnji troškovi'), target: Math.max(1, y.yearTotal), current: 0, deadline: '', yearlyFund: true,
        monthly: cleanGoalPlan({ amount: y.recommended, day: vals.day, since: yearlyPlanSince(vals.day) }) };
      if(acc) goal.accountId = acc.id;
      goals.push(goal); saveGoals(); renderAll();
    });
  }
  function payYearlyFromFund(id){
    const g = yearlyFundGoal(), r = recurring.find(x=> x.id === id);
    const item = yearlyNow().items.find(i=> i.id === id);
    if(!g || !r || !item || !item.next) return;
    const mKey = item.next.slice(0, 7), amount = recurringAmountNow(r);
    const prev = { applied: (applied[mKey] || []).slice(), skipped: (skipped[mKey] || []).slice(), current: g.current };
    const covered = C.round2(Math.min(Math.max(0, g.current), amount)), rest = C.round2(amount - covered);
    const entryId = markRecurringPaid(r, mKey, covered > 0 ? covered : amount);
    if(!entryId) return;
    const today = toISODateLocal(new Date());
    // placeno danas (ne na dan dospeca), da se ne vrati u prognozu kao buduci trosak
    const e = entries.find(x=> x.id === entryId);
    if(e){ e.date = today; if(covered > 0 && g.accountId) e.accountId = g.accountId; }
    // razlika koju fond ne pokriva: poseban rashod sa podrazumevanog racuna
    let restId = null;
    if(covered > 0 && rest > 0){
      const extra = { id: newId(), type: 'expense', desc: r.desc, amount: rest, category: r.category, date: today, paid: true, tags: [] };
      if(accounts.length) extra.accountId = accountById(r.accountId) ? r.accountId : defaultAccountId();
      entries.push(extra); restId = extra.id;
    }
    g.current = C.round2(g.current - covered);
    saveApplied(); saveSkipped(); saveEntries(); saveGoals(); renderAll();
    showUndoToast(t('Plaćeno iz fonda: {0} ({1})', r.desc, fmt(amount)), ()=>{
      applied[mKey] = prev.applied; skipped[mKey] = prev.skipped; entries = entries.filter(x=> x.id !== entryId && x.id !== restId); g.current = prev.current;
      saveApplied(); saveSkipped(); saveEntries(); saveGoals(); renderAll();
    });
  }
  if(IS_TEST) window.__yearly = ()=> yearlyNow();
  function renderPaydaySettings(){
    const rec = C.pickSalary(recurring.map(r=> Object.assign({}, r, { amount: recurringAmountNow(r) })), currentMonthKey());
    document.getElementById('paydayAutoInfo').textContent = rec ? t('Sada: „{0}“, {1}. u mesecu, {2}.', rec.desc, rec.day, fmt(recurringAmountNow(rec))) : t('Nema ponavljajućeg prihoda — dodaj ga u Ponavljajuće ili upiši platu ručno.');
    document.querySelectorAll('input[name="paydayMode"]').forEach(r=> { r.checked = r.value === payday.mode; });
    document.getElementById('paydayDate').value = payday.mode === 'manual' ? payday.date : '';
    document.getElementById('paydayAmount').value = payday.mode === 'manual' ? payday.amount : '';
  }
  document.querySelectorAll('input[name="paydayMode"]').forEach(r=> r.addEventListener('change', ()=>{
    if(r.value === 'auto' && r.checked){ payday = { mode: 'auto' }; savePayday(); document.getElementById('paydayStatus').textContent = t('Plata se uzima iz Ponavljajućih.'); invalidate(); }
  }));
  document.getElementById('paydaySave').addEventListener('click', ()=>{
    const v = cleanPayday({ mode: 'manual', date: document.getElementById('paydayDate').value, amount: parseFloat(document.getElementById('paydayAmount').value) });
    const st = document.getElementById('paydayStatus');
    if(v.mode !== 'manual'){ st.textContent = t('Upiši datum i iznos sledeće plate.'); return; }
    const todayIso = toISODateLocal(new Date()), maxD = new Date(); maxD.setDate(maxD.getDate() + 120);
    if(v.date < todayIso || v.date > toISODateLocal(maxD)){ st.textContent = t('Datum plate mora biti od danas do 120 dana unapred.'); return; }
    payday = v; savePayday();
    document.querySelector('input[name="paydayMode"][value="manual"]').checked = true;
    st.textContent = t('Sačuvano: plata {0}, {1}.', fcDate(v.date), fmt(v.amount));
    invalidate();
  });
  if(IS_TEST) window.__forecast = ()=> forecastNow();
  if(IS_TEST) window.__setPayday = v => { payday = cleanPayday(v); savePayday(); renderAll(); };
  function renderDocReminders(){
    const box = dEl('docReminders'); if(!box) return;
    const list = C.documentReminders(documents, docToday(), { includeExpiredDays: 30 });
    box.style.display = list.length ? '' : 'none';
    if(!list.length){ box.innerHTML = ''; return; }
    box.innerHTML = `<h3 style="margin-top:0;">${escapeHtml(t('Uskoro ističe'))}</h3>`
      + list.slice(0, 6).map(x=> `<div class="doc-row doc-${x.status.state}" data-id="${x.doc.id}" tabindex="0"><div class="doc-main"><b translate="no">${escapeHtml(x.doc.title)}</b><span class="hint" translate="no">${escapeHtml(x.doc.group || '')}</span></div><span class="doc-badge">${escapeHtml(docStatusLabel(x.doc).text)}</span><span></span><span></span></div>`).join('')
      + `<div class="file-row"><button type="button" class="btn-secondary" id="docRemindersOpen">${escapeHtml(t('Otvori Dokumenti'))}</button></div>`;
    box.querySelectorAll('.doc-row').forEach(r=>{ r.addEventListener('click', ()=>{ showScreen('dokumenti'); const d = documents.find(x=> x.id === r.dataset.id); if(d) openDocReview({ doc: d }); }); r.addEventListener('keydown', docRowKey); });
    dEl('docRemindersOpen').addEventListener('click', ()=> showScreen('dokumenti'));
  }
  if(IS_TEST) window.__docNotifyKeys = ()=> C.documentReminders(documents, docToday()).map(x=> x.notifyKey);
  const DOC_NOTIFIED_KEY = 'budzet-dokumenti-obavesteno-v1';
  function runDocNotifications(){
    const rem = C.documentReminders(documents, docToday());
    const current = new Set(rem.map(x=> x.notifyKey));
    const log = (readJsonKey(DOC_NOTIFIED_KEY, []) || []).filter(k=> current.has(k));
    const toSend = rem.filter(x=> !log.includes(x.notifyKey));
    toSend.forEach(x=>{
      log.push(x.notifyKey);
      if(!('Notification' in window) || Notification.permission !== 'granted') return;
      try{
        const n = new Notification(x.status.days === 0 ? t('Danas ističe') : t('Uskoro ističe'), { body: x.doc.title + ' — ' + docStatusLabel(x.doc).text, tag: x.notifyKey });
        n.onclick = ()=>{ if(window.desktop) window.desktop.showWindow(); openNotificationTarget({ screen: 'dokumenti', rowId: x.doc.id }); };
      } catch(e){ /* obavestenja nedostupna */ }
    });
    localStorage.setItem(DOC_NOTIFIED_KEY, JSON.stringify(log));
    return toSend.map(x=> x.notifyKey);
  }
  if(IS_TEST) window.__runDocNotifications = ()=> runDocNotifications();
  // Garancija iz rashoda: popunjen nov zapis sa prilozima rashoda
  // rashod iz prodavnice: artikli (i fiskalni racun bez slike) ili slika racuna (ne uplatnica)
  function hasWarrantySource(e){ return (Array.isArray(e.items) && e.items.length > 0) || (!e.fiscalUrl && e.attachments && e.attachments.length && !!window.desktop && !/-uplatnica-/.test(String(e.attachments[0] || ''))); }
  const WARRANTY_MIN_PRICE = 5000;
  function openWarrantyFromEntry(e){
    const items = C.warrantyItems(e, documents);
    if(items.length > 1) return openWarrantyPicker(items.map(item=> ({ entry: e, item })), { title: t('Garancija za artikle'), checked: false });
    const first = items[0] ? items[0].name : '';
    const open = ()=> openDocReview({ prefill: { kind: 'garancija', title: first || e.desc, group: 'Tehnika', issued: e.date, warrantyMonths: 24, vendor: e.desc, files: (e.attachments || []).filter(n=> !isSlipAttachment(n)), entryId: e.id, fiscalUrl: e.fiscalUrl } });
    if(items[0] && items[0].has) return appConfirm(t('Za ovaj artikal već postoji garancija. Napraviti još jednu?')).then(ok=>{ if(ok) open(); });
    open();
  }
  // garancije za izabrane artikle (jedna po artiklu): naziv artikla, datum racuna, prodavnica, link racuna, slika racuna
  function addWarrantyDocs(pairs, months){
    const made = pairs.map(({ entry, item })=> C.cleanDocuments([Object.assign({ id: newId() }, C.warrantyFromItem(entry, item, months),
      { files: entry.fiscalUrl ? [] : (entry.attachments || []).filter(n=> !isSlipAttachment(n)) })])[0]).filter(Boolean);
    if(!made.length) return [];
    documents = documents.concat(made); saveDocuments(); renderAll();
    return made;
  }
  function openWarrantyPicker(pairs, opts){
    const fields = pairs.map((p, i)=> ({ key: 'w' + i, type: 'checkbox', value: !!opts.checked && !p.item.has,
      label: p.item.name + (p.item.unitPrice != null ? ' — ' + fmt(p.item.unitPrice) : '') + (p.item.has ? ' · ' + t('već ima garanciju') : '') }))
      .concat({ key: 'months', type: 'number', label: t('Trajanje garancije (meseci)'), value: 24 });
    openEditModal(opts.title, fields, vals=>{
      const chosen = pairs.filter((p, i)=> vals['w' + i]);
      const made = addWarrantyDocs(chosen, vals.months);
      if(!made.length) return;
      const ids = new Set(made.map(d=> d.id));
      showUndoToast(t('Garancija dodata ({0})', made.length), ()=>{ documents = documents.filter(d=> !ids.has(d.id)); saveDocuments(); renderAll(); });
    });
  }
  // posle cuvanja racuna: predlog za skupe artikle (bez onih koji vec imaju garanciju)
  const warrantySuggestions = ids => ids.map(id=> entries.find(e=> e.id === id)).filter(Boolean)
    .flatMap(e=> C.warrantyItems(e, documents, WARRANTY_MIN_PRICE).map(item=> ({ entry: e, item })));

