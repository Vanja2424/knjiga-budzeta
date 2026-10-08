  // ---- Onboarding vodic (samo za prvi put, ili rucno preko "Pokreni vodic" u Podesavanjima) ----
  const ONBOARDING_KEY = 'budzet-onboarding-v1';
  const ONBOARDING_STEPS = 6;
  const ONBOARDING_TITLES = ['Dobrodošao/la u Knjigu budžeta', 'Prvi prihod', 'Kategorije rashoda', 'Cilj štednje', 'Budžet po kategoriji', 'Spreman/na si!'];
  let onboardingStep = 0;
  let onboardingState = null;
  function onboardingStepHtml(step){
    switch(step){
      case 0: return `<p>Ovaj kratak vodič (5 koraka, može se preskočiti bilo kad) te vodi kroz osnovno podešavanje: prvi prihod, kategorije rashoda, cilj štednje i budžet po kategoriji.</p>`;
      case 1: return `
        <label for="obIncomeDesc">Opis prihoda</label>
        <input type="text" id="obIncomeDesc" placeholder="npr. Plata" value="${escapeHtml(onboardingState.incomeDesc)}">
        <label for="obIncomeAmount">Iznos (RSD)</label>
        <input type="number" id="obIncomeAmount" min="0" step="1" placeholder="0" value="${onboardingState.incomeAmount}">
        <div class="hint">Opciono — možeš i preskočiti i uneti kasnije na tabu "Prihodi".</div>`;
      case 2: return `
        <p class="hint" style="margin-top:0;">Ovo su podrazumevane kategorije rashoda — isključi one koje ti ne trebaju, ili dodaj svoju.</p>
        <ul class="cat-list" id="obCatList"></ul>
        <div style="display:flex; gap:0.5em; margin-top:0.8em;">
          <input type="text" id="obNewCat" placeholder="Dodaj svoju kategoriju">
          <button type="button" class="btn-secondary" id="obAddCatBtn">Dodaj</button>
        </div>`;
      case 3: return `
        <label for="obGoalName">Naziv cilja štednje</label>
        <input type="text" id="obGoalName" placeholder="npr. Fond za slučaj nužde" value="${escapeHtml(onboardingState.goalName)}">
        <label for="obGoalTarget">Ciljani iznos (RSD)</label>
        <input type="number" id="obGoalTarget" min="0" step="1" placeholder="0" value="${onboardingState.goalTarget}">
        <div class="hint">Opciono — samo ako već imaš nešto na umu.</div>`;
      case 4: return `
        <p class="hint" style="margin-top:0;">Postavi mesečni budžet za jednu kategoriju (npr. Hrana) da na Pregledu vidiš koliko ti je preostalo tokom meseca.</p>
        <label for="obEnvelopeCat">Kategorija</label>
        <select id="obEnvelopeCat">${onboardingState.candidateCats.filter(c=>onboardingState.checkedCats.has(c)).map(c=>userOption(c)).join('')}</select>
        <label for="obEnvelopeAmount">Mesečni budžet (RSD)</label>
        <input type="number" id="obEnvelopeAmount" min="0" step="1" placeholder="0" value="${onboardingState.envelopeAmount}">
        <div class="hint">Opciono — može se podesiti i kasnije na tabu "Budžet".</div>`;
      case 5: return `<p>Spreman/na si! Sve što si podesio/la je već sačuvano. Ostatak (ponavljajuće stavke, dugovi, Excel sinhronizacija...) pronađi kroz tabove kad ti zatreba.</p>`;
    }
  }
  function renderOnboardingCatList(){
    const list = document.getElementById('obCatList');
    list.innerHTML = onboardingState.candidateCats.map(c=>`<li><label style="display:flex; align-items:center; gap:0.6em; cursor:pointer; flex:1;">
      <input type="checkbox" class="ob-cat-check" value="${escapeHtml(c)}" ${onboardingState.checkedCats.has(c)?'checked':''}> ${escapeHtml(c)}</label></li>`).join('');
    list.querySelectorAll('.ob-cat-check').forEach(cb=>{
      cb.addEventListener('change', ()=>{
        if(cb.checked) onboardingState.checkedCats.add(cb.value); else onboardingState.checkedCats.delete(cb.value);
      });
    });
  }
  function renderOnboardingStep(){
    document.getElementById('onboardingBody').innerHTML = onboardingStepHtml(onboardingStep);
    document.getElementById('onboardingTitle').textContent = ONBOARDING_TITLES[onboardingStep];
    document.getElementById('onboardingBackBtn').style.visibility = onboardingStep === 0 ? 'hidden' : 'visible';
    document.getElementById('onboardingNextBtn').textContent = onboardingStep === ONBOARDING_STEPS-1 ? 'Gotovo' : 'Dalje';
    document.getElementById('onboardingSkipBtn').style.display = onboardingStep === ONBOARDING_STEPS-1 ? 'none' : 'inline-block';
    document.getElementById('onboardingStepDots').innerHTML = Array.from({length:ONBOARDING_STEPS}).map((_,i)=>
      `<span style="width:8px;height:8px;border-radius:50%;background:${i===onboardingStep?'var(--ledger)':'var(--paper-line)'};"></span>`).join('');
    if(onboardingStep === 2){
      renderOnboardingCatList();
      document.getElementById('obAddCatBtn').addEventListener('click', ()=>{
        const input = document.getElementById('obNewCat');
        const name = input.value.trim();
        if(!name || onboardingState.candidateCats.some(c=>c.toLowerCase()===name.toLowerCase())) return;
        onboardingState.candidateCats.push(name);
        onboardingState.checkedCats.add(name);
        input.value = '';
        renderOnboardingCatList();
      });
    }
    setTimeout(()=>{ const f = document.querySelector('#onboardingBody input:not([type="checkbox"]), #onboardingBody select'); if(f) f.focus(); }, 0);
  }
  function captureOnboardingStepData(){
    if(onboardingStep === 1){
      onboardingState.incomeDesc = document.getElementById('obIncomeDesc').value.trim();
      onboardingState.incomeAmount = document.getElementById('obIncomeAmount').value;
    } else if(onboardingStep === 3){
      onboardingState.goalName = document.getElementById('obGoalName').value.trim();
      onboardingState.goalTarget = document.getElementById('obGoalTarget').value;
    } else if(onboardingStep === 4){
      onboardingState.envelopeCat = document.getElementById('obEnvelopeCat').value;
      onboardingState.envelopeAmount = document.getElementById('obEnvelopeAmount').value;
    }
  }
  function finishOnboarding(){
    const incAmount = parseFloat(onboardingState.incomeAmount);
    if(onboardingState.incomeDesc && !isNaN(incAmount) && incAmount > 0){
      entries.push({ id:newId(), type:'income', desc:onboardingState.incomeDesc, amount:incAmount, category:incomeCats[0], date: toISODateLocal(new Date()), tags:[] });
    }
    expenseCats = [...onboardingState.checkedCats];
    if(expenseCats.length === 0) expenseCats = DEFAULT_CATS.slice();
    const goalTarget = parseFloat(onboardingState.goalTarget);
    if(onboardingState.goalName && !isNaN(goalTarget) && goalTarget > 0){
      goals.push({ id:newId(), name:onboardingState.goalName, target:goalTarget, current:0, deadline:'' });
    }
    const envAmount = parseFloat(onboardingState.envelopeAmount);
    if(onboardingState.envelopeCat && !isNaN(envAmount) && envAmount > 0 && expenseCats.includes(onboardingState.envelopeCat)){
      limits[onboardingState.envelopeCat] = envAmount;
    }
    saveEntries(); saveCats(); saveGoals(); saveLimits();
    localStorage.setItem(ONBOARDING_KEY, 'done');
    document.getElementById('onboardingOverlay').classList.remove('show');
    populateExpenseCategorySelect(); populateExpenseFilters(); populateRecurringCategorySelect(); renderCatRules();
    renderAll();
  }
  document.getElementById('onboardingNextBtn').addEventListener('click', ()=>{
    captureOnboardingStepData();
    if(onboardingStep === ONBOARDING_STEPS-1){ finishOnboarding(); return; }
    onboardingStep++;
    renderOnboardingStep();
  });
  document.getElementById('onboardingBackBtn').addEventListener('click', ()=>{
    captureOnboardingStepData();
    if(onboardingStep > 0){ onboardingStep--; renderOnboardingStep(); }
  });
  document.getElementById('onboardingSkipBtn').addEventListener('click', ()=>{
    localStorage.setItem(ONBOARDING_KEY, 'done');
    document.getElementById('onboardingOverlay').classList.remove('show');
  });
  function startOnboarding(){
    onboardingStep = 0;
    onboardingState = { incomeDesc:'', incomeAmount:'', candidateCats: DEFAULT_CATS.slice(), checkedCats: new Set(DEFAULT_CATS), goalName:'', goalTarget:'', envelopeCat:'', envelopeAmount:'' };
    renderOnboardingStep();
    document.getElementById('onboardingOverlay').classList.add('show');
  }
  document.getElementById('startOnboardingBtn').addEventListener('click', startOnboarding);

  populateExpenseCategorySelect();
  populateExpenseFilters();
  populateRecurringCategorySelect();
  populateAccountSelects();
  populateCurrencySelects();
  renderRatesInfo(null);
  if(window.desktop){
    refreshRates(false);
    setInterval(()=> refreshRates(false), 3*60*60*1000);
    document.getElementById('ratesRefreshBtn').addEventListener('click', ()=> refreshRates(true));
  } else {
    document.getElementById('ratesRefreshRow').style.display = 'none';
  }
  reconcileAppliedEntries();
  // Ispravnost nadoknade (backfill) meseci u monthsToProcess zavisi od toga da je sve pre ovog poziva
  // sinhrono izvrseno (recurring/applied/skipped vec ucitani) — ne pomerati iza async koda.
  processAutoPay();
  processGoalPlans();
  // Aplikacija moze danima da radi u tray-u — proveri automatske uplate i prelazak dana/meseca.
  let lastSeenDay = toISODateLocal(new Date());
  setInterval(()=>{
    const today = toISODateLocal(new Date());
    const changed = processAutoPay() | processGoalPlans();
    if(changed || today !== lastSeenDay){
      lastSeenDay = today;
      if(viewMonthFollowsToday && viewMonth !== currentMonthKey()){ viewMonth = currentMonthKey(); expListMonth = incListMonth = viewMonth; }
      renderAll();
    }
  }, 15*60*1000);
  setupExcelUI();
  renderBackupReminder();
  renderAll();
  playPregledStagger();
  if(!localStorage.getItem(ONBOARDING_KEY) && entries.length === 0 && recurring.length === 0 && goals.length === 0){
    startOnboarding();
  }

  document.getElementById('reconcileBtn').addEventListener('click', ()=>{
    const fixed = reconcileAppliedEntries();
    const statusEl = document.getElementById('reconcileStatus');
    if(fixed > 0){
      statusEl.textContent = t('Popravljeno: dopunjeno {0} nedostajućih stavki. Brojke su ažurirane.', fixed);
      renderAll();
    } else {
      statusEl.textContent = 'Sve je već usklađeno — ništa nije trebalo popraviti.';
    }
  });

  document.getElementById('archiveBtn').addEventListener('click', async ()=>{
    const statusEl = document.getElementById('archiveStatus');
    const years = Math.max(1, parseInt(document.getElementById('archiveYears').value) || 3);
    const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - years);
    const cutoffStr = toISODateLocal(cutoff);
    const toArchive = entries.filter(e => e.date < cutoffStr);
    if(toArchive.length === 0){
      statusEl.textContent = t('Nema stavki starijih od {0} — ništa nije arhivirano.', cutoffStr);
      return;
    }
    if(!(await appConfirm(t('Preuzeće se rezervni JSON fajl sa {0} stavki starijih od {1}, a zatim će biti uklonjene iz aktivnog spiska. Nastaviti?', toArchive.length, cutoffStr), { title: t('Arhiviranje'), okText: t('Arhiviraj') }))) return;
    const blob = new Blob([JSON.stringify({ archivedEntries: toArchive, archivedAt: new Date().toISOString(), cutoff: cutoffStr }, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'budzet-arhiva-' + cutoffStr + '.json'; a.click();
    URL.revokeObjectURL(url);
    const archivedIds = new Set(toArchive.map(e=>e.id));
    entries = entries.filter(e => !archivedIds.has(e.id));
    Object.keys(applied).forEach(mKey=>{
      applied[mKey] = (applied[mKey]||[]).filter(rid=>{
        const r = recurring.find(x=>x.id===rid);
        if(!r) return true;
        return entries.some(e=>e.id === recurringEntryId(r, mKey));
      });
    });
    saveEntries(); saveApplied();
    statusEl.textContent = t('Arhivirano i uklonjeno {0} stavki (fajl je preuzet).', toArchive.length);
    renderAll();
  });

  // Stampa/PDF uvek u svetloj temi — tamna tema bi dala svetao tekst na belom papiru.
  let themeBeforePrint = null;
  window.addEventListener('beforeprint', ()=>{
    themeBeforePrint = document.body.getAttribute('data-theme');
    document.body.setAttribute('data-theme', 'light');
  });
  window.addEventListener('afterprint', ()=>{
    if(themeBeforePrint) document.body.setAttribute('data-theme', themeBeforePrint);
    themeBeforePrint = null;
  });

