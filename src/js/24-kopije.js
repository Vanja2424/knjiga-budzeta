  // ---- Backup / restore JSON ----
  const LAST_BACKUP_KEY = 'budzet-poslednji-backup-v1';
  function renderBackupReminder(){
    const el = document.getElementById('backupReminder');
    // Excel fajl je vec sam po sebi trajna kopija van browsera; desktop app pravi automatske dnevne kopije
    if(excelHandle || window.desktop){ el.style.display = 'none'; return; }
    const lastBackupRaw = localStorage.getItem(LAST_BACKUP_KEY);
    const daysSince = lastBackupRaw ? Math.floor((Date.now() - new Date(lastBackupRaw).getTime()) / 86400000) : null;
    if(daysSince === null){
      el.style.display = 'flex';
      document.getElementById('backupReminderText').textContent = 'Još nikad nisi izvezao/la JSON rezervnu kopiju — podaci postoje samo u ovom browseru.';
    } else if(daysSince >= 30){
      el.style.display = 'flex';
      document.getElementById('backupReminderText').textContent = t('Poslednji backup je bio pre {0} dana — vredi izvesti novi.', daysSince);
    } else {
      el.style.display = 'none';
    }
  }
  function buildBackupData(){
    return { entries, accounts, expenseCats, incomeCats, limits, recurring, applied, goals, catColors, skipped, debts, monthlyBudget, healthHistory, envelopeState, catRules, savedScenarios, fixedCategories, payday, shopping, locations, billTypes, bills, documents, hiddenSubsDismissed: hiddenSubsDismissed(), exportedAt: new Date().toISOString() };
  }
  // Preuzimanje JSON rezervne kopije — koristi se i za dugme za izvoz i pre rizičnih radnji (npr. uvoz Excela u browseru).
  function downloadBackupJson(){
    const data = buildBackupData();
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'budzet-backup-' + toISODateLocal(new Date()) + '.json'; a.click();
    URL.revokeObjectURL(url);
    localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
    renderBackupReminder();
  }
  document.getElementById('backupExportBtn').addEventListener('click', downloadBackupJson);

  function isPlainObject(v){ return v !== null && typeof v === 'object' && !Array.isArray(v); }

  // Validira oblik uvezenog backup JSON-a polje po polje umesto da se osloni samo na
  // entries — nevalidan/oštećen fajl ne treba da obori app kasnije kroz .map/.filter na
  // pogrešnom tipu, nego da se odbace samo neispravni delovi.
  function sanitizeImportedBackup(data){
    if(!isPlainObject(data) || !Array.isArray(data.entries)) throw new Error('Neispravan format fajla.');
    const cleanEntries = data.entries.filter(e =>
      isPlainObject(e) &&
      typeof e.id === 'string' && e.id &&
      (e.type === 'income' || e.type === 'expense' || (e.type === 'transfer' && typeof e.fromAccount === 'string' && typeof e.toAccount === 'string')) &&
      typeof e.amount === 'number' && isFinite(e.amount) &&
      typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date)
    ).map(e => { const o = Object.assign({}, e, { desc: String(e.desc == null ? '' : e.desc), category: String(e.category || 'Ostalo'), tags: Array.isArray(e.tags) ? e.tags.map(String) : [] });
      if(Array.isArray(e.items)) o.items = e.items.map(String); else delete o.items;
      if(typeof e.receiptId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(e.receiptId)) o.receiptId = e.receiptId; else delete o.receiptId;
      if(typeof e.fiscalUrl === 'string' && C.fiscalUrlFrom(e.fiscalUrl) === e.fiscalUrl) o.fiscalUrl = e.fiscalUrl; else delete o.fiscalUrl;
      const att = Array.isArray(e.attachments) ? e.attachments.filter(C.isAttachmentName) : [];
      if(att.length) o.attachments = att; else delete o.attachments;
      if(Array.isArray(o.items) && Array.isArray(e.itemPrices) && e.itemPrices.length === o.items.length) o.itemPrices = e.itemPrices.map(p=> (typeof p === 'number' && isFinite(p) && p >= 0) ? p : null); else delete o.itemPrices;
      if(Array.isArray(o.items) && Array.isArray(e.itemQty) && e.itemQty.length === o.items.length) o.itemQty = e.itemQty.map(cleanItemQty); else delete o.itemQty;
      return o; });
    // Isti tip/opseg koercija kao rucni unos (recurringForm submit) i Excel uvoz (parseWorkbook) —
    // JSON backup ne sme biti jedini put uvoza koji propusti npr. day:31 ili day:0 nekoercirano.
    const cleanRecurring = (Array.isArray(data.recurring) ? data.recurring.filter(isPlainObject) : []).map(r=>({
      id: (typeof r.id === 'string' && r.id) ? r.id : newId(),
      desc: String(r.desc || ''),
      amount: Number(r.amount) || 0,
      category: String(r.category || 'Ostalo'),
      type: (r.type === 'income') ? 'income' : 'expense',
      day: C.clampRecurringDay(Number(r.day) || 1),
      frequency: ['monthly','quarterly','yearly'].includes(r.frequency) ? r.frequency : 'monthly',
      anchorMonth: Math.min(12, Math.max(1, Number(r.anchorMonth) || 1)),
      isSubscription: !!r.isSubscription,
      autoPay: !!r.autoPay,
      spreadPeriod: !!r.spreadPeriod || undefined,
      accountId: typeof r.accountId === 'string' ? r.accountId : undefined,
      currency: CURRENCIES.includes(r.currency) ? r.currency : undefined,
      origAmount: Number(r.origAmount) || undefined,
      debtId: (typeof r.debtId === 'string' && r.debtId) ? r.debtId : undefined,
      until: (typeof r.until === 'string' && /^\d{4}-\d{2}$/.test(r.until)) ? r.until : undefined,
      payee: C.cleanPayee(r.payee),
    })).filter(r => r.desc);
    const cleanGoals = (Array.isArray(data.goals) ? data.goals.filter(isPlainObject) : []).map(g=>({
      id: (typeof g.id === 'string' && g.id) ? g.id : newId(),
      name: String(g.name || ''),
      target: Number(g.target) || 0,
      current: Math.max(0, Number(g.current) || 0),
      deadline: (typeof g.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(g.deadline)) ? g.deadline : '',
      accountId: typeof g.accountId === 'string' ? g.accountId : undefined,
      monthly: cleanGoalPlan(g.monthly),
      ...(g.yearlyFund === true ? { yearlyFund: true } : {})
    })).filter(g => g.name && g.target > 0);
    const cleanDebts = (Array.isArray(data.debts) ? data.debts.filter(isPlainObject) : []).map(d=>({
      id: (typeof d.id === 'string' && d.id) ? d.id : newId(),
      person: String(d.person || ''),
      amount: Number(d.amount) || 0,
      paidAmount: Math.max(0, Number(d.paidAmount) || 0),
      direction: (d.direction === 'i_owe') ? 'i_owe' : 'owed_to_me',
      date: (typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date)) ? d.date : toISODateLocal(new Date()),
      due: (typeof d.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.due)) ? d.due : '',
      note: String(d.note || ''),
      ...(CURRENCIES.includes(d.currency) && d.currency !== 'RSD' ? { currency: d.currency, origAmount: Number(d.origAmount) || undefined, rate: Number(d.rate) || undefined } : {})
    })).filter(d => d.person && d.amount > 0);
    const cleanCatColors = {};
    if(isPlainObject(data.catColors)){
      Object.keys(data.catColors).forEach(cat=>{
        const hex = sanitizeHexColor(data.catColors[cat]);
        if(hex) cleanCatColors[cat] = hex;
      });
    }
    const cleanAccounts = (Array.isArray(data.accounts) ? data.accounts.filter(isPlainObject) : []).map(a=>({
      id: (typeof a.id === 'string' && a.id) ? a.id : newId(),
      name: String(a.name || 'Račun'),
      type: ['tekuci','gotovina','stednja','kartica'].includes(a.type) ? a.type : 'tekuci',
      openingBalance: Number(a.openingBalance) || 0
    }));
    return {
      entries: cleanEntries,
      accounts: cleanAccounts,
      expenseCats: Array.isArray(data.expenseCats) ? data.expenseCats.filter(c=>typeof c === 'string') : DEFAULT_CATS.slice(),
      incomeCats: Array.isArray(data.incomeCats) && data.incomeCats.some(c=>typeof c === 'string') ? data.incomeCats.filter(c=>typeof c === 'string') : DEFAULT_INCOME_CATS.slice(),
      limits: isPlainObject(data.limits) ? data.limits : {},
      recurring: cleanRecurring,
      applied: isPlainObject(data.applied) ? data.applied : {},
      goals: cleanGoals,
      catColors: cleanCatColors,
      skipped: isPlainObject(data.skipped) ? data.skipped : {},
      debts: cleanDebts,
      monthlyBudget: parseFloat(data.monthlyBudget) || 0,
      healthHistory: Array.isArray(data.healthHistory) ? data.healthHistory.filter(h=>
        isPlainObject(h) && typeof h.month === 'string' && /^\d{4}-\d{2}$/.test(h.month) && typeof h.score === 'number'
      ) : [],
      envelopeState: isPlainObject(data.envelopeState) ? {
        allocations: isPlainObject(data.envelopeState.allocations) ? data.envelopeState.allocations : {},
        rollover: isPlainObject(data.envelopeState.rollover) ? data.envelopeState.rollover : {},
        rolloverEnabled: !!data.envelopeState.rolloverEnabled,
        lastRolloverMonth: (typeof data.envelopeState.lastRolloverMonth === 'string' && /^\d{4}-\d{2}$/.test(data.envelopeState.lastRolloverMonth)) ? data.envelopeState.lastRolloverMonth : null,
      } : { allocations: {}, rollover: {}, lastRolloverMonth: null },
      catRules: Array.isArray(data.catRules) ? data.catRules.filter(r=> isPlainObject(r) && typeof r.keyword === 'string' && typeof r.category === 'string') : [],
      savedScenarios: Array.isArray(data.savedScenarios) ? data.savedScenarios.filter(s=> isPlainObject(s) && typeof s.id === 'string' && typeof s.name === 'string') : [],
      fixedCategories: Array.isArray(data.fixedCategories) ? data.fixedCategories.filter(c=> typeof c === 'string') : [],
      payday: cleanPayday(data.payday),
      shopping: ('shopping' in data) ? C.normalizeShopping(data.shopping, newId) : null,
      ...(Array.isArray(data.documents) ? { documents: C.cleanDocuments(data.documents) } : {}),
      ...(Array.isArray(data.hiddenSubsDismissed) ? { hiddenSubsDismissed: data.hiddenSubsDismissed.filter(x=> typeof x === 'string').slice(0, 500) } : {}),
      ...(()=>{ // kucni racuni: vrste zavise od lokacija, racuni od vrsta
        if(!('locations' in data)) return {};
        const locs = C.cleanLocations(data.locations, CURRENCIES), types = C.cleanBillTypes(data.billTypes, locs.map(l=> l.id));
        return { locations: locs, billTypes: types, bills: C.cleanBills(data.bills, types.map(x=> x.id)) };
      })(),
    };
  }
  if(IS_TEST) window.__sanitizeImportedBackup = sanitizeImportedBackup;
  if(IS_TEST) window.__buildBackupData = () => buildBackupData();
  if(IS_TEST) window.__itemArraysFromCells = itemArraysFromCells;
  if(IS_TEST) window.__addEntriesRaw = list => { entries.push(...list); saveEntries(); invalidate(); };

  document.getElementById('backupImportInput').addEventListener('change', function(e){
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = async function(evt){
      try{
        const raw = JSON.parse(evt.target.result);
        // Desktop: kopija celog fajla sa podacima (iz foldera "Rezervne kopije") vraca SVE podatke odjednom.
        if(window.__desktopData && raw && raw.app === 'Knjiga budzeta' && isPlainObject(raw.data)){
          const shape = C.checkDataFileShape(raw.data);
          if(!shape.ok){ appAlert(t('Kopija je oštećena ili nije iz Knjige budžeta ({0}). Podaci nisu promenjeni.', shape.problems.join(', '))); return; }
          const when = raw.savedAt ? new Date(raw.savedAt).toLocaleString(LOCALE, {dateStyle:'medium', timeStyle:'short'}) : 'nepoznato';
          if(!(await appConfirm(t('Vratiti sve podatke iz ove kopije (sačuvana: {0})?\n\nTrenutni podaci biće zamenjeni. Pre toga se automatski pravi kopija trenutnog stanja.', when), { title: t('Vraćanje kopije'), okText: t('Vrati kopiju') }))) return;
          await window.__desktopData.saveNow();
          await window.desktop.backupNow();
          window.__desktopData.replaceAll(raw.data);
          location.reload();
          return;
        }
        const data = sanitizeImportedBackup(raw);
        entries = data.entries;
        accounts = data.accounts;
        expenseCats = data.expenseCats;
        incomeCats = data.incomeCats;
        limits = data.limits;
        recurring = data.recurring;
        applied = data.applied;
        goals = data.goals;
        catColors = data.catColors;
        skipped = data.skipped;
        debts = data.debts;
        monthlyBudget = data.monthlyBudget;
        healthHistory = data.healthHistory;
        envelopeState = data.envelopeState;
        migrateEnvelopes();
        catRules = data.catRules;
        savedScenarios = data.savedScenarios;
        fixedCategories = data.fixedCategories;
        payday = data.payday || { mode: 'auto' }; savePayday();
        if(data.shopping) shopping = data.shopping;
        if(data.locations){ locations = data.locations; billTypes = data.billTypes; bills = data.bills; saveBillsState(); }
        if(data.documents){ documents = data.documents; saveDocuments(); }
        if(data.hiddenSubsDismissed) localStorage.setItem(HIDDEN_SUBS_KEY, JSON.stringify(data.hiddenSubsDismissed));
        saveEntries(); saveAccounts(); saveCats(); saveIncomeCats(); saveLimits(); saveRecurring(); saveApplied(); saveGoals(); saveCatColors(); saveSkipped(); saveDebts(); saveMonthlyBudget(); saveHealthHistory(); saveEnvelopeState(); saveCatRules(); saveSavedScenarios(); saveFixedCategories(); saveShopping();
        populateAccountSelects();
        document.getElementById('monthlyBudgetInput').value = monthlyBudget > 0 ? monthlyBudget : '';
        populateExpenseCategorySelect(); populateExpenseFilters(); populateRecurringCategorySelect(); renderCatRules();
        renderSavedScenariosList();
        renderAll();
        appAlert('Rezervna kopija je uspešno učitana.');
      } catch(err){
        appAlert('Greška pri učitavanju rezervne kopije: ' + err.message);
      }
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  });

  // Broj kasnih stavki (ista pravila kao notifikacije): ponavljajuce koje su prosle dan dospeca
  // ovog meseca a nisu placene/preskocene + dugovi sa proslim rokom.
  function countOverdue(){
    const todayDay = new Date().getDate();
    const curMonthKey = currentMonthKey();
    let n = 0;
    recurring.forEach(r=>{
      if(isDueThisMonth(r, curMonthKey) && !isPaid(r, curMonthKey) && !isSkipped(r, curMonthKey) && dueDayNow(r) < todayDay) n++;
    });
    const todayStr = toISODateLocal(new Date());
    debts.forEach(d=>{ if(debtRemaining(d) > 0 && d.due && d.due < todayStr) n++; });
    return n;
  }
  // Desktop: crveni bedz sa brojem kasnih plaćanja preko ikonice na taskbaru
  let lastDesktopBadge = -1;
  function updateDesktopBadge(){
    if(!window.desktop) return;
    const n = countOverdue();
    if(n === lastDesktopBadge) return;
    lastDesktopBadge = n;
    if(n === 0){ window.desktop.setBadge(0, null); return; }
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    g.fillStyle = '#EF4444';
    g.beginPath(); g.arc(16, 16, 15, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff';
    g.font = `bold ${n > 9 ? 15 : 19}px "Segoe UI", Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(n > 9 ? '9+' : String(n), 16, 17);
    window.desktop.setBadge(n, c.toDataURL('image/png'));
  }

  function updateTabBadges(){
    const pendingCount = entries.filter(e=>e.type==='expense' && !isExpensePaid(e)).length;
    ['rashodiBadge', 'rashodiSubBadge'].forEach(id=>{
      const badge = document.getElementById(id);
      if(!badge) return;
      badge.textContent = pendingCount;
      badge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
      badge.title = t('{0} neplaćenih rashoda', pendingCount);
    });
    const recBadge = document.getElementById('ponavljajuceSubBadge');
    if(recBadge){
      const late = C.overdueRecurring(recurring, applied, skipped, currentMonthKey(), new Date().getDate()).length;
      recBadge.textContent = late;
      recBadge.style.display = late > 0 ? 'inline-block' : 'none';
      recBadge.title = t('{0} zakasnelih ponavljajućih', late);
    }
    positionTabIndicator(document.querySelector('nav.tabs button.active'));
    updateDesktopBadge();
  }

  function updateTableScrollFades(){
    document.querySelectorAll('.table-scroll').forEach(el=>{
      // Ne samo da IMA overflow-a, nego da ima jos sadrzaja DESNO od trenutne scroll pozicije —
      // inace fade ostaje vidljiv (i preklapa dugmice za akcije) i kad je tabela vec skrolovana do kraja.
      const hasMoreRight = el.scrollWidth > el.clientWidth + 2 && (el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
      el.classList.toggle('has-overflow', hasMoreRight);
    });
  }
  window.addEventListener('resize', updateTableScrollFades);
  document.addEventListener('scroll', (e)=>{
    if(e.target && e.target.classList && e.target.classList.contains('table-scroll')) updateTableScrollFades();
  }, true);

  function renderAll(){
    syncDebtInstallments();
    renderSummary();
    // Stvari koje moraju da se dese i kad Pregled nije otvoren
    processEnvelopeRollover();
    upsertHealthSnapshot();
    // Svi ekrani su sada zastareli; vidljivi se crta odmah, ostali kad se otvore.
    Object.keys(SCREEN_RENDER).forEach(s=> dirtyScreens.add(s));
    renderScreen(activeScreen);
    updateTabBadges();
    populateDescDatalists();
    reapplyPendingRemovalClass();
    requestAnimationFrame(updateTableScrollFades);
    scheduleExcelWrite();
    if(!hadFirstRender){ hadFirstRender = true; } else { document.body.classList.add('no-replay-anim'); }
    // Resetuj OVDE (ne u renderExpenses) da bi obe liste (prihodi i rashodi) dobile row-enter
    // animaciju kad se doda nova stavka, i da se ta animacija ne "zalepi" i ponovo okine na
    // svaki sledeci nepovezani render — ranije je renderIncome() nikad nije resetovala.
    newEntryId = null;
  }
  let hadFirstRender = false;

