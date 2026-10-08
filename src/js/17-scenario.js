  // ---- Scenario planer ----
  // Projektuje bilans UNAPRED (za razliku od balanceThroughMonth koje gleda unazad/trenutno) —
  // polazi od stvarnog bilansa na kraju proslog meseca, pa za svaki naredni mesec dodaje realne
  // stavke (ako vec postoje, npr. za tekuci mesec) plus projektovane ponavljajuce stavke koje
  // JOS NISU realizovane kao stvarni unos za taj mesec (izbegava duplo racunanje).
  function projectForward(overrides, monthsAhead){
    const months = [];
    const now = new Date();
    for(let i=0;i<monthsAhead;i++){
      const d = new Date(now.getFullYear(), now.getMonth()+i, 1);
      months.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));
    }
    const effEntries = overrides ? entries.concat(overrides.extraEntries) : entries;
    const effRecurring = overrides
      ? recurring.filter(r=>!overrides.excludeRecurringIds.has(r.id)).concat(overrides.extraRecurring)
      : recurring;
    let running = balanceThroughMonth(monthKeyPlus(-1));
    const vals = months.map(mKey=>{
      // Projekcija prati novac (stvarni datum uplate), kao i stanje na racunima — ne raspodelu po mesecima
      const realNet = effEntries.filter(e=>monthKey(e.date)===mKey && !isTransfer(e) && (e.type!=='expense' || isExpensePaid(e)))
        .reduce((s,e)=> s + (e.type==='income' ? e.amount : -e.amount), 0);
      const recurringNet = effRecurring.reduce((s,r)=>{
        if(!isDueThisMonth(r, mKey)) return s;
        if(effEntries.some(e=>e.id === recurringEntryId(r, mKey))) return s;
        return s + (r.type==='income' ? r.amount : -r.amount);
      }, 0);
      running += realNet + recurringNet;
      return running;
    });
    return { months, vals };
  }

  function startScenario(){
    scenarioActive = true;
    scenarioExtraEntries = [];
    scenarioExtraRecurring = [];
    scenarioExcludedRecurringIds = new Set();
    scenarioBudgetOverride = null;
    document.getElementById('scenarioIntro').style.display = 'none';
    document.getElementById('scenarioChartPanel').style.display = 'block';
    document.getElementById('scenarioControls').style.display = 'grid';
    document.getElementById('scenarioMonthlyBudgetInput').value = monthlyBudget > 0 ? monthlyBudget : '';
    renderScenario();
  }
  function discardScenario(){
    scenarioActive = false;
    scenarioExtraEntries = []; scenarioExtraRecurring = []; scenarioExcludedRecurringIds = new Set(); scenarioBudgetOverride = null;
    document.getElementById('scenarioIntro').style.display = 'block';
    document.getElementById('scenarioChartPanel').style.display = 'none';
    document.getElementById('scenarioControls').style.display = 'none';
  }
  function applyScenario(){
    entries.push(...scenarioExtraEntries);
    recurring = recurring.filter(r=>!scenarioExcludedRecurringIds.has(r.id)).concat(scenarioExtraRecurring);
    if(scenarioBudgetOverride != null) monthlyBudget = scenarioBudgetOverride;
    saveEntries(); saveRecurring(); saveMonthlyBudget();
    discardScenario();
    renderAll();
    appAlert('Scenario je primenjen na stvarne podatke.');
  }

  // ---- Sacuvani scenariji (vise imenovanih nacrta, ne samo jedan aktivni) ----
  function renderSavedScenariosList(){
    const panel = document.getElementById('savedScenariosPanel');
    if(savedScenarios.length === 0){ panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    const list = document.getElementById('savedScenariosList');
    list.innerHTML = savedScenarios.map(s=>`<li>
      <span class="name">${escapeHtml(s.name)}</span>
      <span style="display:flex; gap:0.5em;">
        <button class="btn-secondary" data-load-scenario="${s.id}">Učitaj</button>
        <button class="del-btn" data-del-scenario="${s.id}" title="Obriši">✕</button>
      </span>
    </li>`).join('');
    list.querySelectorAll('[data-load-scenario]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const s = savedScenarios.find(x=>x.id === b.dataset.loadScenario);
        if(s) loadSavedScenario(s);
      });
    });
    list.querySelectorAll('[data-del-scenario]').forEach(b=>{
      b.addEventListener('click', ()=>{
        savedScenarios = savedScenarios.filter(x=>x.id !== b.dataset.delScenario);
        saveSavedScenarios(); renderSavedScenariosList();
      });
    });
  }
  function loadSavedScenario(s){
    scenarioActive = true;
    scenarioExtraEntries = JSON.parse(JSON.stringify(s.extraEntries));
    scenarioExtraRecurring = JSON.parse(JSON.stringify(s.extraRecurring));
    scenarioExcludedRecurringIds = new Set(s.excludedRecurringIds);
    scenarioBudgetOverride = s.budgetOverride;
    document.getElementById('scenarioIntro').style.display = 'none';
    document.getElementById('scenarioChartPanel').style.display = 'block';
    document.getElementById('scenarioControls').style.display = 'grid';
    document.getElementById('scenarioMonthlyBudgetInput').value = (scenarioBudgetOverride != null && scenarioBudgetOverride > 0) ? scenarioBudgetOverride : '';
    renderScenario();
  }
  function saveCurrentScenarioAs(name){
    savedScenarios.push({
      id: newId(), name,
      extraEntries: scenarioExtraEntries,
      extraRecurring: scenarioExtraRecurring,
      excludedRecurringIds: [...scenarioExcludedRecurringIds],
      budgetOverride: scenarioBudgetOverride,
    });
    saveSavedScenarios(); renderSavedScenariosList();
  }

  function renderScenarioChart(){
    const monthsAhead = 6;
    const baseline = projectForward(null, monthsAhead);
    const scenario = projectForward({ extraEntries: scenarioExtraEntries, extraRecurring: scenarioExtraRecurring, excludeRecurringIds: scenarioExcludedRecurringIds }, monthsAhead);
    const W = 760, H = 200, padL = 10, padR = 10, padT = 15, padB = 30;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const allVals = baseline.vals.concat(scenario.vals);
    const maxVal = Math.max(1, ...allVals);
    const minVal = Math.min(0, ...allVals);
    const range = (maxVal - minVal) || 1;
    const stepX = plotW / (baseline.months.length - 1 || 1);
    const yFor = v => padT + plotH - ((v - minVal)/range)*plotH;
    const xFor = i => padL + i*stepX;
    const zeroY = yFor(0);
    const zeroLine = minVal < 0 ? `<line x1="${padL}" y1="${zeroY.toFixed(1)}" x2="${W-padR}" y2="${zeroY.toFixed(1)}" stroke="var(--paper-line)" stroke-width="1" stroke-dasharray="3 3"/>` : '';
    const labels = baseline.months.map((m,i)=>{
      const [y,mo] = m.split('-');
      const label = new Date(y,mo-1,1).toLocaleDateString(LOCALE,{month:'short'}).replace('.','');
      return `<text x="${xFor(i).toFixed(1)}" y="${H-8}" text-anchor="middle" font-size="10" fill="var(--ink-soft)" font-family="-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">${label}</text>`;
    }).join('');
    document.getElementById('scenarioChart').innerHTML = `
      ${zeroLine}
      <path class="line-draw" d="${buildLinePath(baseline.vals, xFor, yFor)}" fill="none" stroke="var(--ink-soft)" stroke-width="2" stroke-dasharray="4 3"/>
      <path class="line-draw" d="${buildLinePath(scenario.vals, xFor, yFor)}" fill="none" stroke="var(--ledger)" stroke-width="2"/>
      ${labels}
    `;
    document.querySelectorAll('#scenarioChart .line-draw').forEach(path=>{
      const len = path.getTotalLength();
      path.style.strokeDasharray = len;
      path.style.strokeDashoffset = len;
      requestAnimationFrame(()=>{
        requestAnimationFrame(()=>{
          path.style.transition = 'stroke-dashoffset .9s ease';
          path.style.strokeDashoffset = '0';
        });
      });
    });

    const printBody = document.getElementById('scenarioPrintTableBody');
    printBody.innerHTML = baseline.months.map((m,i)=>{
      const [y,mo] = m.split('-');
      const label = new Date(y,mo-1,1).toLocaleDateString(LOCALE,{month:'long', year:'numeric'});
      const diff = scenario.vals[i] - baseline.vals[i];
      return `<tr><td>${label}</td><td style="text-align:right;">${fmt(baseline.vals[i])}</td><td style="text-align:right;">${fmt(scenario.vals[i])}</td><td style="text-align:right;">${diff>=0?'+':''}${fmt(diff)}</td></tr>`;
    }).join('');
  }

  function renderScenario(){
    if(!scenarioActive) return;
    const recList = document.getElementById('scenarioRecurringList');
    const realRows = recurring.map(r=>{
      const excluded = scenarioExcludedRecurringIds.has(r.id);
      return `<li${excluded?' style="opacity:0.5;text-decoration:line-through;"':''}>
        <span class="name">${t('{0} ({1}, {2})', escapeHtml(r.desc), t(r.type==='income'?'prihod':'rashod'), fmt(r.amount))}</span>
        <button class="btn-secondary" data-real-rec="${r.id}">${excluded?'Vrati':'Ukloni u scenariju'}</button></li>`;
    }).join('');
    const extraRows = scenarioExtraRecurring.map(r=>`<li>
        <span class="name">${t('{0} ({1}, {2}) — novo', escapeHtml(r.desc), t(r.type==='income'?'prihod':'rashod'), fmt(r.amount))}</span>
        <button class="btn-secondary" data-extra-rec="${r.id}">Obriši</button></li>`).join('');
    recList.innerHTML = (realRows + extraRows) || '<li class="empty">Nema ponavljajućih stavki.</li>';
    recList.querySelectorAll('[data-real-rec]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const id = b.dataset.realRec;
        if(scenarioExcludedRecurringIds.has(id)) scenarioExcludedRecurringIds.delete(id); else scenarioExcludedRecurringIds.add(id);
        renderScenario();
      });
    });
    recList.querySelectorAll('[data-extra-rec]').forEach(b=>{
      b.addEventListener('click', ()=>{
        scenarioExtraRecurring = scenarioExtraRecurring.filter(r=>r.id !== b.dataset.extraRec);
        renderScenario();
      });
    });

    const oneList = document.getElementById('scenarioOneTimeList');
    oneList.innerHTML = scenarioExtraEntries.map(e=>{
      const d = parseLocalDate(e.date).toLocaleDateString(LOCALE,{day:'2-digit',month:'2-digit',year:'numeric'});
      return `<li><span class="name">${escapeHtml(e.desc)} — ${d} (${e.type==='income'?'+':'−'}${fmt(e.amount)})</span>
        <button class="btn-secondary" data-onetime="${e.id}">Obriši</button></li>`;
    }).join('') || '<li class="empty">Nema jednokratnih izmena.</li>';
    oneList.querySelectorAll('[data-onetime]').forEach(b=>{
      b.addEventListener('click', ()=>{
        scenarioExtraEntries = scenarioExtraEntries.filter(e=>e.id !== b.dataset.onetime);
        renderScenario();
      });
    });

    renderScenarioChart();
  }

  document.getElementById('scenarioStartBtn').addEventListener('click', startScenario);
  document.getElementById('scenarioDiscardBtn').addEventListener('click', discardScenario);
  document.getElementById('scenarioApplyBtn').addEventListener('click', applyScenario);
  document.getElementById('scenarioSaveBtn').addEventListener('click', ()=>{
    openEditModal('Sačuvaj scenario kao', [
      {key:'name', label:'Naziv', type:'text', value:''},
    ], (vals)=>{
      if(!vals.name || !vals.name.trim()) return;
      saveCurrentScenarioAs(vals.name.trim());
    });
  });
  document.getElementById('scenarioPrintBtn').addEventListener('click', ()=>{
    document.body.classList.add('print-scenario');
    window.print();
  });
  window.addEventListener('afterprint', ()=> document.body.classList.remove('print-scenario'));
  renderSavedScenariosList();
  document.getElementById('scenarioMonthlyBudgetInput').addEventListener('change', (e)=>{
    const val = parseFloat(e.target.value);
    scenarioBudgetOverride = (isNaN(val) || val <= 0) ? 0 : val;
  });
  document.getElementById('scenarioAddRecurringBtn').addEventListener('click', ()=>{
    openEditModal('Dodaj hipotetičku ponavljajuću stavku', [
      {key:'desc', label:'Opis', type:'text', value:''},
      {key:'amount', label:'Iznos (RSD)', type:'number', value:''},
      {key:'category', label:'Kategorija', type:'select', value:expenseCats[0], options:expenseCats},
      {key:'day', label:'Dan u mesecu (1–31; 31 = poslednji dan)', type:'number', value:1},
      {key:'isIncome', label:'Ovo je prihod (ne rashod)', type:'checkbox', value:false},
    ], (vals)=>{
      if(!vals.desc || !vals.desc.trim() || isNaN(vals.amount) || vals.amount <= 0) return;
      scenarioExtraRecurring.push({
        id: newId(), desc: vals.desc.trim(), amount: vals.amount, category: vals.category,
        type: vals.isIncome ? 'income' : 'expense', day: C.clampRecurringDay(parseInt(vals.day) || 1)
      });
      renderScenario();
    });
  });
  document.getElementById('scenarioAddOneTimeBtn').addEventListener('click', ()=>{
    openEditModal('Dodaj jednokratnu hipotetičku stavku', [
      {key:'desc', label:'Opis', type:'text', value:''},
      {key:'amount', label:'Iznos (RSD)', type:'number', value:''},
      {key:'date', label:'Datum', type:'date', value: toISODateLocal(new Date())},
      {key:'category', label:'Kategorija', type:'select', value:expenseCats[0], options:expenseCats},
      {key:'isIncome', label:'Ovo je prihod (ne rashod)', type:'checkbox', value:false},
    ], (vals)=>{
      if(!vals.desc || !vals.desc.trim() || isNaN(vals.amount) || vals.amount <= 0 || !vals.date) return;
      scenarioExtraEntries.push({
        id: newId(), desc: vals.desc.trim(), amount: vals.amount, category: vals.category,
        type: vals.isIncome ? 'income' : 'expense', date: vals.date
      });
      renderScenario();
    });
  });

  function renderInsights(catEntries){
    const el = document.getElementById('insights');
    const month = monthTotals(viewMonth);
    const totalExpense = month.expense;
    const totalIncome = month.income;
    const isCurrent = viewMonth === currentMonthKey();
    const cards = [];
    if(totalExpense === 0 && totalIncome === 0){
      cards.push('<div class="empty" style="padding:0.8em 0;">Nema stavki u ovom mesecu.</div>');
    }
    if(catEntries.length){
      const [topCat, topVal] = catEntries[0];
      const pct = ((topVal/totalExpense)*100).toFixed(0);
      cards.push(`<div class="insight-card"><div class="big">${escapeHtml(topCat)}</div>
        <div class="small">${t('Najveći trošak ovog meseca — <b>{0}%</b> svih rashoda ({1}).', pct, fmt(topVal))}</div></div>`);
    }
    const thisExp = totalExpense;
    const prevExp = monthTotals(C.addMonths(viewMonth, -1)).expense;
    if(prevExp > 0 && thisExp > 0){
      const diff = ((thisExp-prevExp)/prevExp*100);
      const dir = diff >= 0 ? 'više' : 'manje';
      cards.push(`<div class="insight-card"><div class="big">${diff>=0?'+':''}${diff.toFixed(0)}%</div>
        <div class="small">${t(isCurrent ? 'Ovaj mesec trošiš <b>{0}% {1}</b> nego mesec ranije (a mesec još traje).' : 'U ovom mesecu potrošeno je <b>{0}% {1}</b> nego mesec ranije.', Math.abs(diff).toFixed(0), t(dir))}</div></div>`);
    }
    if(totalIncome > 0){
      const savings = ((totalIncome-totalExpense)/totalIncome*100);
      cards.push(`<div class="insight-card"><div class="big">${savings.toFixed(0)}%</div>
        <div class="small">Stopa uštede — od prihoda ovog meseca, toliko je ostalo posle rashoda.</div></div>`);
    }
    if(thisExp > 0){
      const daysInMonth = C.daysInMonth(viewMonth);
      const dayCount = isCurrent ? new Date().getDate() : daysInMonth;
      const avgDaily = thisExp / dayCount;
      cards.push(`<div class="insight-card"><div class="big">${fmt(Math.round(avgDaily))}</div>
        <div class="small">Prosečna dnevna potrošnja u ovom mesecu.</div></div>`);
      if(isCurrent){
        cards.push(`<div class="insight-card"><div class="big">${fmt(Math.round(avgDaily * daysInMonth))}</div>
          <div class="small">Procena ukupne potrošnje do kraja meseca, po dosadašnjem tempu.</div></div>`);
      }
    }
    // Najskuplji dan u nedelji
    const expenseEntries = entries.filter(e=>e.type==='expense' && isExpensePaid(e));
    if(expenseEntries.length >= 5){
      const dayNames = ['Nedelja','Ponedeljak','Utorak','Sreda','Četvrtak','Petak','Subota'];
      const sums = Array(7).fill(0), counts = Array(7).fill(0);
      const seenDates = new Set();
      expenseEntries.forEach(e=>{
        const d = parseLocalDate(e.date);
        const wd = d.getDay();
        sums[wd] += e.amount;
        const dayId = wd+'|'+e.date;
        if(!seenDates.has(e.date+'#'+wd)){ counts[wd]++; seenDates.add(e.date+'#'+wd); }
      });
      let bestIdx = 0;
      for(let i=1;i<7;i++){
        const avgI = counts[i] ? sums[i]/counts[i] : 0;
        const avgBest = counts[bestIdx] ? sums[bestIdx]/counts[bestIdx] : 0;
        if(avgI > avgBest) bestIdx = i;
      }
      if(counts[bestIdx] > 0){
        cards.push(`<div class="insight-card"><div class="big">${dayNames[bestIdx]}</div>
          <div class="small">${t('Dan u nedelji kad u proseku trošiš najviše ({0} po danu).', fmt(sums[bestIdx]/counts[bestIdx]))}</div></div>`);
      }
    }
    // Streak (vezan za danasnji dan, pa samo u tekucem mesecu)
    if(isCurrent && expenseEntries.length >= 3){
      const firstDate = expenseEntries.reduce((min,e)=> e.date < min ? e.date : min, expenseEntries[0].date);
      const daysSinceStart = Math.max(1, Math.round((new Date() - parseLocalDate(firstDate)) / 86400000) + 1);
      const avgDailyAll = expenseEntries.reduce((s,e)=>s+e.amount,0) / daysSinceStart;
      let streak = 0;
      for(let i=0;i<365;i++){
        const d = new Date(); d.setDate(d.getDate()-i);
        const dStr = toISODateLocal(d);
        if(dStr < firstDate) break;
        const daySum = expenseEntries.filter(e=>e.date===dStr).reduce((s,e)=>s+e.amount,0);
        if(daySum <= avgDailyAll) streak++; else break;
      }
      cards.push(`<div class="insight-card"><div class="big">${daysTxt(streak)}</div>
        <div class="small">${t('Niz dana zaredom bez prekoračenja tvog dnevnog proseka ({0}).', fmt(avgDailyAll))}</div></div>`);
    }
    el.innerHTML = cards.join('') || '<div class="empty" style="padding:0.8em 0;">Nema dovoljno podataka.</div>';
  }

  // Dodatna kopija (USB): upozori kad je folder izabran, a kopija nije napravljena 14+ dana
  let extraBackupState = null;
  const EXTRA_BACKUP_WARN_DAYS = 14;
  function extraBackupDays(){
    if(!extraBackupState || !extraBackupState.dir) return null;
    if(!extraBackupState.last) return Infinity;
    return Math.floor((Date.now() - new Date(extraBackupState.last).getTime()) / 86400000);
  }
  function extraBackupWarning(){
    const days = extraBackupDays();
    if(days == null || days < EXTRA_BACKUP_WARN_DAYS) return '';
    return days === Infinity
      ? t('Kopija van računara još nije napravljena — priključi disk ({0}).', escapeHtml(extraBackupState.dir))
      : t('Kopija van računara nije napravljena {0} dana — priključi disk ({1}).', days, escapeHtml(extraBackupState.dir));
  }
  function renderWarnings(catEntries){
    const el = document.getElementById('warnings');
    const warnings = [];
    const isCurrent = viewMonth === currentMonthKey();
    const month = monthTotals(viewMonth);
    const totalExpense = month.expense;
    const totalIncome = month.income;
    const thisInc = month.income;
    const thisExp = month.expense;
    const prevExp = monthTotals(C.addMonths(viewMonth, -1)).expense;

    if(thisInc > 0 && thisExp > thisInc){
      warnings.push({level:'danger', icon:'⚠', txt: t(isCurrent ? 'Ovog meseca <b>trošiš više nego što zarađuješ</b> — za {0}.' : 'U ovom mesecu <b>rashodi su bili veći od prihoda</b> — za {0}.', fmt(thisExp-thisInc))});
    }
    if(catEntries.length){
      const [topCat, topVal] = catEntries[0];
      const pct = totalExpense ? (topVal/totalExpense*100) : 0;
      if(pct >= 45) warnings.push({level:'danger', icon:'🔥', txt: t('Kategorija <b>{0}</b> guta {1}% svih rashoda — ozbiljna neravnoteža budžeta.', escapeHtml(topCat), pct.toFixed(0))});
      else if(pct >= 30) warnings.push({level:'caution', icon:'⚡', txt: t('Kategorija <b>{0}</b> čini {1}% rashoda — vredi držati je na oku.', escapeHtml(topCat), pct.toFixed(0))});
    }
    if(prevExp > 0 && thisExp > prevExp * 1.2){
      const diff = ((thisExp-prevExp)/prevExp*100).toFixed(0);
      warnings.push({level:'caution', icon:'📈', txt: t('Potrošnja je skočila za <b>{0}%</b> u odnosu na prošli mesec.', diff)});
    }
    if(thisInc === 0 && thisExp > 0){
      warnings.push({level:'caution', icon:'✎', txt: isCurrent ? `Nisi uneo nijedan <b>prihod</b> za tekući mesec.` : `Za ovaj mesec nema unetih <b>prihoda</b>.`});
    }
    if(totalIncome > 0 && ((totalIncome-totalExpense)/totalIncome) < 0.1 && totalExpense > 0){
      warnings.push({level:'caution', icon:'💧', txt:`Ušteda je ispod <b>10%</b> prihoda ovog meseca — tanka je margina.`});
    }
    // Limiti po kategoriji
    catEntries.forEach(([cat,val])=>{
      const limit = limits[cat];
      if(limit && val > limit){
        warnings.push({level:'danger', icon:'🚨', txt: t('Premašen limit za <b>{0}</b>: {1} od {2}.', escapeHtml(cat), fmt(val), fmt(limit))});
      } else if(limit && val >= limit*0.8){
        warnings.push({level:'caution', icon:'🔔', txt: t('Blizu si limita za <b>{0}</b>: {1} od {2}.', escapeHtml(cat), fmt(val), fmt(limit))});
      }
    });
    // Ukupan mesecni budzet
    if(monthlyBudget > 0){
      if(thisExp > monthlyBudget){
        warnings.push({level:'danger', icon:'💸', txt: t('Premašen ukupan mesečni budžet: {0} od {1}.', fmt(thisExp), fmt(monthlyBudget))});
      } else if(thisExp >= monthlyBudget*0.8){
        warnings.push({level:'caution', icon:'💸', txt: t('Blizu si ukupnog mesečnog budžeta: {0} od {1}.', fmt(thisExp), fmt(monthlyBudget))});
      }
    }
    // Podsetnici za ponavljajuce stavke koje dospevaju ili su zakasnile
    const todayDay = new Date().getDate();
    const curMonthKey = currentMonthKey();
    if(isCurrent) recurring.forEach(r=>{
      if(!isDueThisMonth(r, curMonthKey) || isPaid(r, curMonthKey) || isSkipped(r, curMonthKey)) return;
      const diff = dueDayNow(r) - todayDay;
      const rLabel = r.type === 'income' ? 'naplatiš' : 'platiš';
      if(diff < 0){
        warnings.push({level:'danger', icon:'⏰', txt: t(r.type === 'income' ? 'Trebalo je da naplatiš <b>{0}</b> pre {1} (dan {2}. u mesecu).' : 'Trebalo je da platiš <b>{0}</b> pre {1} (dan {2}. u mesecu).', escapeHtml(r.desc), daysTxt(Math.abs(diff)), dueDayNow(r))});
      } else if(diff <= 3){
        warnings.push({level:'caution', icon:'⏰', txt: diff === 0 ? t('<b>{0}</b> dospeva danas.', escapeHtml(r.desc)) : t('<b>{0}</b> dospeva za {1}.', escapeHtml(r.desc), daysTxt(diff))});
      }
    });
    // Dugovi/pozajmice sa prosetlim rokom
    const todayStr = toISODateLocal(new Date());
    if(isCurrent) debts.forEach(d=>{
      const remaining = debtRemaining(d);
      if(remaining <= 0 || !d.due || d.due >= todayStr) return;
      const verb = d.direction === 'owed_to_me' ? 'da ti vrati' : 'da vratiš';
      warnings.push({level:'caution', icon:'🤝', txt: t(d.direction === 'owed_to_me' ? '<b>{0}</b> je trebalo da ti vrati {1} — rok je prošao.' : '<b>{0}</b> je trebalo da vratiš {1} — rok je prošao.', escapeHtml(d.person), fmt(remaining))});
    });

    // Moguci duplikati — zadrzi PRVU stavku, ponudi brisanje ostalih u grupi jednim klikom.
    detectDuplicateEntries().forEach(group=>{
      const extra = group.slice(1);
      const kind = group[0].type === 'income' ? 'prihoda' : 'rashoda';
      warnings.push({level:'caution', icon:'🧩', txt: t('Moguć duplikat: {0} identične stavke {1} "{2}" ({3}, {4}).', group.length, t(kind), escapeHtml(group[0].desc), fmt(group[0].amount), group[0].date) + ` <button type="button" class="dup-warning-remove" data-ids="${extra.map(e=>e.id).join(',')}">${t('Ukloni suvišne ({0})', extra.length)}</button>`});
    });

    const xb = extraBackupWarning();
    if(xb) warnings.push({level:'caution', icon:'💾', txt: xb});

    if(warnings.length === 0){
      el.innerHTML = `<div class="warning-item ok"><span class="icon">✓</span><span class="txt">Budžet izgleda <b>uravnoteženo</b> — nema upozorenja u ovom trenutku.</span></div>`;
    } else {
      el.innerHTML = warnings.map(w=>`<div class="warning-item ${w.level==='danger'?'':'caution'}"><span class="icon">${w.icon}</span><span class="txt">${w.txt}</span></div>`).join('');
    }
    el.querySelectorAll('.dup-warning-remove').forEach(b=>{
      b.addEventListener('click', ()=>{
        const ids = b.dataset.ids.split(',');
        const removed = entries.filter(e=>ids.includes(e.id));
        entries = entries.filter(e=>!ids.includes(e.id));
        removed.forEach(e=>unmarkRecurringEntry(e.id));
        saveEntries();
        playDeleteSound();
        renderAll();
        showUndoToast(t('Obrisano {0} dupliranih stavki', removed.length), ()=>{ entries.push(...removed); removed.forEach(e=>remarkRecurringEntry(e.id)); saveEntries(); renderAll(); });
      });
    });
  }

