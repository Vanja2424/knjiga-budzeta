  // ---- Excel fajl kao izvor podataka ----
  // U desktop aplikaciji podaci su u sopstvenom fajlu (podaci.json), pa Excel sinhronizacija nije
  // potrebna — ostaje samo rucni izvoz/uvoz Excel fajla.
  const desktop = window.desktop || null;
  const fsApiSupported = !desktop && ('showSaveFilePicker' in window) && ('showOpenFilePicker' in window);
  let excelHandle = null;
  let pendingHandle = null;
  let excelWriteTimer = null;
  // Konflikt-detekcija za deljeni Excel fajl (npr. isti fajl u cloud folderu, otvoren i sa telefona
  // i sa laptopa): puni per-record merge (timestamp po zapisu) bi zahtevao da se updatedAt provuce
  // kroz desetine mesta koje mutiraju entries/recurring/goals/debts u celom fajlu — nesrazmerno
  // invazivno za app ovog obima. Umesto toga: dva timestampa se porede — kad su LOKALNI podaci
  // poslednji put promenjeni (DATA_UPDATED_KEY, upisuje se ODMAH pri svakoj izmeni, prezivljava
  // zatvaranje taba) i sa kojim timestampom su podaci poslednji put USPESNO usaglaseni sa fajlom
  // (DATA_SYNCED_KEY — postavlja se i posle upisa U fajl i posle citanja IZ fajla). Sam sadrzaj
  // fajla nosi taj isti timestamp (u "Podesavanja" listi, PoslednjaIzmena kolona) — ne oslanjamo se
  // na OS mtime fajla (nepouzdano kroz cloud sync alate kao OneDrive/Google Drive), OS mtime se
  // koristi samo kao jeftin pre-filter da izbegnemo citanje celog fajla kad sigurno nije diran.
  const DATA_UPDATED_KEY = 'budzet-podaci-azurirani-v1';
  const DATA_SYNCED_KEY = 'budzet-podaci-sinhronizovani-v1';
  const getDataUpdatedAt = () => parseInt(localStorage.getItem(DATA_UPDATED_KEY) || '0', 10);
  const markDataUpdated = () => localStorage.setItem(DATA_UPDATED_KEY, String(Date.now()));
  const getDataSyncedAt = () => parseInt(localStorage.getItem(DATA_SYNCED_KEY) || '0', 10);
  const markDataSynced = (ts) => localStorage.setItem(DATA_SYNCED_KEY, String(ts));
  const hasLocalUnsyncedChanges = () => getDataUpdatedAt() > getDataSyncedAt();
  let lastKnownFileModified = 0;
  let excelConflictActive = false;
  let excelPollTimer = null;

  function idbOpen(){
    return new Promise((resolve,reject)=>{
      const req = indexedDB.open('budzet-db', 1);
      req.onupgradeneeded = ()=> { if(!req.result.objectStoreNames.contains('handles')) req.result.createObjectStore('handles'); };
      req.onsuccess = ()=> resolve(req.result);
      req.onerror = ()=> reject(req.error);
    });
  }
  async function idbSet(key, value){
    const db = await idbOpen();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction('handles','readwrite');
      tx.objectStore('handles').put(value, key);
      tx.oncomplete = ()=> resolve();
      tx.onerror = ()=> reject(tx.error);
    });
  }
  async function idbGet(key){
    const db = await idbOpen();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction('handles','readonly');
      const req = tx.objectStore('handles').get(key);
      req.onsuccess = ()=> resolve(req.result || null);
      req.onerror = ()=> reject(req.error);
    });
  }

  function updateExcelStatus(msg){
    const el = document.getElementById('excelStatus');
    if(el) el.textContent = msg;
    renderBackupReminder();
  }

  // fallback: sta vratiti za nečitljiv datum (podrazumevano danas; za dokumente prazno)
  function normalizeDateCell(val, fallback){
    if(val instanceof Date && !isNaN(val)) return toISODateLocal(val);
    if(typeof val === 'number' && window.XLSX && XLSX.SSF){
      const d = XLSX.SSF.parse_date_code(val);
      if(d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
    }
    if(typeof val === 'string'){
      let m = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if(m) return val.slice(0,10);
      m = val.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
      if(m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
      const d = new Date(val);
      if(!isNaN(d)) return toISODateLocal(d);
    }
    return fallback !== undefined ? fallback : toISODateLocal(new Date());
  }

  function buildWorkbook(dataTimestamp){
    const wb = XLSX.utils.book_new();
    const wsStavke = XLSX.utils.json_to_sheet(entries.filter(e=> e.type === 'income' || e.type === 'expense').map(e=>({ID:e.id, Datum:e.date, Opis:e.desc, Kategorija:e.category, Tip:e.type, Iznos:e.amount, Placeno: e.type==='expense' ? (isExpensePaid(e)?'da':'ne') : '', Oznake:(e.tags||[]).join(', '), Racun: e.accountId ? accountName(e.accountId) : '', Valuta: e.currency || '', IznosUValuti: e.origAmount || '', Kurs: e.rate || '', PokrivaMeseci: isSpread(e) ? parseInt(e.spreadMonths, 10) : '', OdMeseca: isSpread(e) ? (e.spreadStart || '') : '', Kupljeno: C.itemsToCell(e.items), CeneStavki: Array.isArray(e.itemPrices) ? JSON.stringify(e.itemPrices) : '', Kolicine: Array.isArray(e.itemQty) ? JSON.stringify(e.itemQty) : '', DugID: e.debtId || '', RacunID: e.receiptId || '', FiskalniLink: e.fiscalUrl || '', Prilozi: (e.attachments || []).join('; ')})));
    XLSX.utils.book_append_sheet(wb, wsStavke, 'Stavke');
    if(accounts.length){
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(accounts.map(a=>({ID:a.id, Naziv:a.name, Vrsta:a.type, PocetnoStanje:a.openingBalance||0}))), 'Racuni');
      const tr = entries.filter(isTransfer);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tr.length ? tr.map(e=>({ID:e.id, Datum:e.date, Opis:e.desc||'', Iznos:e.amount, SaRacuna:e.fromAccount, NaRacun:e.toAccount})) : [{ID:'', Datum:'', Opis:'', Iznos:'', SaRacuna:'', NaRacun:''}]), 'Prenosi');
    }
    const wsKat = XLSX.utils.json_to_sheet(expenseCats.map(c=>({Naziv:c, Limit: limits[c] != null ? limits[c] : ''})));
    XLSX.utils.book_append_sheet(wb, wsKat, 'Kategorije');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(incomeCats.map(c=>({Naziv:c}))), 'KategorijePrihoda');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(catRules.length ? catRules.map(r=>({KljucnaRec:r.keyword, Kategorija:r.category})) : [{KljucnaRec:'', Kategorija:''}]), 'Pravila');
    const wsRec = XLSX.utils.json_to_sheet(recurring.map(r=>({ID:r.id, Opis:r.desc, Iznos:r.amount, Kategorija:r.category, Tip:r.type, Dan:r.day, Ucestalost:r.frequency||'monthly', PocetniMesec:r.anchorMonth||1, Pretplata:r.isSubscription?'da':'ne', AutoUpis:r.autoPay?'da':'ne', RaspodelaNaPeriod:r.spreadPeriod?'da':'ne', DugID:r.debtId||'', Do:r.until||'', PrimalacRacun:r.payee?r.payee.account:'', PrimalacNaziv:r.payee?r.payee.name:'', SifraPlacanja:r.payee?r.payee.code:'', SvrhaPlacanja:r.payee?r.payee.purpose:'', Model:r.payee?r.payee.model:'', PozivNaBroj:r.payee?r.payee.reference:''})));
    XLSX.utils.book_append_sheet(wb, wsRec, 'Ponavljajuce');
    if(documents.length){
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(documents.map(d=>({ID:d.id, Vrsta:d.kind, Naziv:d.title, Grupa:d.group, Izdato:d.issued||'', Istice:d.expires||'', GarancijaMeseci:d.warrantyMonths||'', Prodavac:d.vendor||'', Napomena:d.notes||'', Podsetnik:d.remindDays, Prilozi:(d.files||[]).join('; '), Obnova:d.renewal ? JSON.stringify(d.renewal) : '', Istorija:d.history ? JSON.stringify(d.history) : '', StavkaID:d.entryId||'', Link:d.fiscalUrl||''}))), 'Dokumenti');
    }
    if(locations.length){
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(locations.map(l=>({ID:l.id, Naziv:l.name, Valuta:l.currency}))), 'Lokacije');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(billTypes.length ? billTypes.map(x=>({ID:x.id, LokacijaID:x.locationId, Naziv:x.name, Kategorija:x.category, Merenja: JSON.stringify(x.metrics)})) : [{ID:'', LokacijaID:'', Naziv:'', Kategorija:'', Merenja:''}]), 'VrsteRacuna');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bills.length ? bills.map(b=>({ID:b.id, VrstaID:b.billTypeId, Mesec:b.month, Iznos:b.amount, Valuta:b.currency, MesecRashoda:b.expenseMonth||'', Vrednosti: JSON.stringify(b.values), OdDatuma:b.periodFrom||'', DoDatuma:b.periodTo||'', Rok:b.dueDate||'', StavkaID:b.entryId||'', PonavljajucaID:b.recurringId||'', Prilog:b.file||'', Izvor:b.source, PrimalacRacun:b.payee?b.payee.account:'', PrimalacNaziv:b.payee?b.payee.name:'', Model:b.payee?b.payee.model:'', PozivNaBroj:b.payee?b.payee.reference:''})) : [{ID:'', VrstaID:'', Mesec:'', Iznos:'', Valuta:'', MesecRashoda:'', Vrednosti:'', OdDatuma:'', DoDatuma:'', Rok:'', StavkaID:'', PonavljajucaID:'', Prilog:'', Izvor:'', PrimalacRacun:'', PrimalacNaziv:'', Model:'', PozivNaBroj:''}]), 'KucniRacuni');
    }
    const wsCilj = XLSX.utils.json_to_sheet(goals.map(g=>({ID:g.id, Naziv:g.name, Cilj:g.target, Trenutno:g.current, Rok:g.deadline||'', GodisnjiFond: g.yearlyFund ? 'da' : '', MesecnaUplata:g.monthly?g.monthly.amount:'', DanUplate:g.monthly?g.monthly.day:'', UplataOd:g.monthly?g.monthly.since:'', PoslednjaUplata:g.monthly?(g.monthly.last||''):'', RacunID:g.accountId||''})));
    XLSX.utils.book_append_sheet(wb, wsCilj, 'Ciljevi');
    const paidRows = [];
    Object.keys(applied).forEach(mKey=>{ (applied[mKey]||[]).forEach(rid=> paidRows.push({Mesec:mKey, RecurringID:rid})); });
    const wsPlac = XLSX.utils.json_to_sheet(paidRows.length ? paidRows : [{Mesec:'', RecurringID:''}]);
    XLSX.utils.book_append_sheet(wb, wsPlac, 'PlacenoLog');
    const wsDug = XLSX.utils.json_to_sheet(debts.map(d=>({ID:d.id, Osoba:d.person, Iznos:d.amount, Uplaceno:d.paidAmount||0, Smer:d.direction, Datum:d.date||'', Rok:d.due||'', Napomena:d.note||'', Valuta: d.currency || '', IznosUValuti: d.origAmount || '', Kurs: d.rate || ''})));
    XLSX.utils.book_append_sheet(wb, wsDug, 'Dugovi');
    const skipRows = [];
    Object.keys(skipped).forEach(mKey=>{ (skipped[mKey]||[]).forEach(rid=> skipRows.push({Mesec:mKey, RecurringID:rid})); });
    const wsSkip = XLSX.utils.json_to_sheet(skipRows.length ? skipRows : [{Mesec:'', RecurringID:''}]);
    XLSX.utils.book_append_sheet(wb, wsSkip, 'Preskoceno');
    const bojeRows = Object.keys(catColors).map(cat=>({Kategorija:cat, Boja:catColors[cat]}));
    const wsBoje = XLSX.utils.json_to_sheet(bojeRows.length ? bojeRows : [{Kategorija:'', Boja:''}]);
    XLSX.utils.book_append_sheet(wb, wsBoje, 'BojeKategorija');
    const wsPod = XLSX.utils.json_to_sheet([{MesecniBudzet: monthlyBudget || '', PoslednjaIzmena: dataTimestamp || Date.now()}]);
    XLSX.utils.book_append_sheet(wb, wsPod, 'Podesavanja');
    return wb;
  }
  if(IS_TEST) window.__buildWorkbook = () => buildWorkbook(Date.now());
  // Cita samo timestamp izmene iz "Podesavanja" liste, bez ostalog parsiranja/mutiranja globalnog
  // stanja — koristi se za odlucivanje da li je fajl stvarno noviji od onoga sa cim smo sinhronizovani.
  function readFileDataTimestamp(wb){
    const rows = wb.Sheets['Podesavanja'] ? XLSX.utils.sheet_to_json(wb.Sheets['Podesavanja'], {defval:''}) : [];
    return rows.length ? (parseInt(rows[0].PoslednjaIzmena, 10) || 0) : 0;
  }

  // Pre zamene svih podataka: da li Excel izgleda kao nas izvoz (null = u redu, inace poruka za korisnika)
  function workbookShapeError(wb){
    const ws = wb.Sheets['Stavke'];
    const header = ws ? (XLSX.utils.sheet_to_json(ws, { header: 1 })[0] || []) : [];
    const chk = C.checkWorkbookShape(wb.SheetNames, header);
    return chk.ok ? null : t('Ovo ne izgleda kao Excel fajl Knjige budžeta (nedostaje: {0}). Podaci nisu promenjeni.', chk.missing.join(', '));
  }
  if(IS_TEST) window.__workbookShapeError = workbookShapeError;

  // Kucni racuni iz Excela (listovi Lokacije, VrsteRacuna, KucniRacuni); null = stari fajl bez njih (racuni ostaju)
  function billsFromWorkbook(wb){
    if(!(wb.Sheets['Lokacije'] && wb.Sheets['VrsteRacuna'] && wb.Sheets['KucniRacuni'])) return null;
    const sheetRows = (name) => XLSX.utils.sheet_to_json(wb.Sheets[name], {defval:''});
    const js = v => { try { return JSON.parse(v); } catch(e){ return undefined; } };
    const locs = C.cleanLocations(sheetRows('Lokacije').map(r=>({ id: String(r.ID), name: String(r.Naziv), currency: String(r.Valuta) })), CURRENCIES);
    const types = C.cleanBillTypes(sheetRows('VrsteRacuna').filter(r=> r.ID).map(r=>({ id: String(r.ID), locationId: String(r.LokacijaID), name: String(r.Naziv), category: String(r.Kategorija), metrics: js(r.Merenja) })), locs.map(l=> l.id));
    const list = C.cleanBills(sheetRows('KucniRacuni').filter(r=> r.ID).map(r=>({ id: String(r.ID), billTypeId: String(r.VrstaID), month: String(r.Mesec), expenseMonth: String(r.MesecRashoda||''), amount: r.Iznos, currency: String(r.Valuta), values: js(r.Vrednosti), periodFrom: String(r.OdDatuma||''), periodTo: String(r.DoDatuma||''), dueDate: String(r.Rok||''), entryId: String(r.StavkaID||''), recurringId: String(r.PonavljajucaID||''), file: String(r.Prilog||''), source: String(r.Izvor||''), payee: r.PrimalacRacun || r.PrimalacNaziv ? { account: String(r.PrimalacRacun||''), name: String(r.PrimalacNaziv||''), model: String(r.Model||''), reference: String(r.PozivNaBroj||'') } : undefined })), types.map(x=> x.id));
    return { locations: locs, billTypes: types, bills: list };
  }
  if(IS_TEST) window.__billsFromWorkbook = billsFromWorkbook;
  // List Dokumenti (null = stari fajl bez njega); datumi mogu biti broj iz Excela ili dd.mm.gggg
  function documentsFromWorkbook(wb){
    if(!wb.Sheets['Dokumenti']) return null;
    const js = v => { try { return JSON.parse(v); } catch(e){ return undefined; } };
    const dateCell = v => v === '' || v == null ? '' : normalizeDateCell(v, '');
    return C.cleanDocuments(XLSX.utils.sheet_to_json(wb.Sheets['Dokumenti'], {defval:''}).filter(r=> r.ID).map(r=>({ id: String(r.ID), kind: String(r.Vrsta), title: String(r.Naziv), group: String(r.Grupa), issued: dateCell(r.Izdato), expires: dateCell(r.Istice), warrantyMonths: r.GarancijaMeseci, vendor: String(r.Prodavac||''), notes: String(r.Napomena||''), remindDays: r.Podsetnik, files: String(r.Prilozi||'').split(';').map(x=> x.trim()).filter(Boolean), renewal: js(r.Obnova), history: js(r.Istorija), entryId: String(r.StavkaID||''), fiscalUrl: String(r.Link||'') })));
  }
  if(IS_TEST) window.__documentsFromWorkbook = documentsFromWorkbook;
  // List Ciljevi (racun cilja se cuva po ID-ju, kao i racuni u listu Racuni)
  function goalsFromWorkbook(wb){
    const rows = wb.Sheets['Ciljevi'] ? XLSX.utils.sheet_to_json(wb.Sheets['Ciljevi'], {defval:''}) : [];
    return rows.filter(r=>r.Naziv).map(r=>({
      id: String(r.ID || newId()),
      name: String(r.Naziv || ''),
      target: Number(r.Cilj) || 0,
      current: Number(r.Trenutno) || 0,
      deadline: r.Rok ? normalizeDateCell(r.Rok) : '',
      monthly: cleanGoalPlan(Number(r.MesecnaUplata) > 0 ? { amount: r.MesecnaUplata, day: r.DanUplate, since: String(r.UplataOd || ''), last: String(r.PoslednjaUplata || '') } : null),
      ...(String(r.RacunID || '').trim() ? { accountId: String(r.RacunID).trim() } : {}),
      ...(String(r.GodisnjiFond || '').trim().toLowerCase() === 'da' ? { yearlyFund: true } : {})
    }));
  }
  if(IS_TEST) window.__goalsFromWorkbook = goalsFromWorkbook;
  function parseWorkbook(wb){
    const sheetRows = (name) => wb.Sheets[name] ? XLSX.utils.sheet_to_json(wb.Sheets[name], {defval:''}) : [];

    const stavkeRows = sheetRows('Stavke');
    entries = stavkeRows.filter(r=>r.Datum || r.Opis).map(r=>{
      const type = (String(r.Tip).toLowerCase() === 'income') ? 'income' : 'expense';
      const placenoRaw = String(r.Placeno||'').trim().toLowerCase();
      const paid = placenoRaw === '' ? true : /^(da|yes|true|1)$/.test(placenoRaw);
      return {
        id: String(r.ID || newId()),
        date: normalizeDateCell(r.Datum),
        desc: String(r.Opis || ''),
        category: String(r.Kategorija || 'Ostalo'),
        type,
        amount: Number(r.Iznos) || 0,
        paid: type === 'expense' ? paid : undefined,
        tags: String(r.Oznake || '').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean),
        ...(r.Racun ? { accountName: String(r.Racun) } : {}),
        ...((parseInt(r.PokrivaMeseci, 10) || 1) > 1 ? { spreadMonths: parseInt(r.PokrivaMeseci, 10), ...(/^\d{4}-\d{2}$/.test(String(r.OdMeseca)) ? { spreadStart: String(r.OdMeseca) } : {}) } : {}),
        ...(CURRENCIES.includes(String(r.Valuta)) && String(r.Valuta) !== 'RSD' ? { currency: String(r.Valuta), origAmount: Number(r.IznosUValuti) || undefined, rate: Number(r.Kurs) || undefined } : {}),
        ...(C.cellToItems(r.Kupljeno).length ? { items: C.cellToItems(r.Kupljeno) } : {}),
        ...itemArraysFromCells(C.cellToItems(r.Kupljeno).length, r.CeneStavki, r.Kolicine),
        ...(r.DugID ? { debtId: String(r.DugID) } : {}),
        ...(/^[A-Za-z0-9_-]{1,64}$/.test(String(r.RacunID || '')) ? { receiptId: String(r.RacunID) } : {}),
        ...(C.fiscalUrlFrom(String(r.FiskalniLink || '')) ? { fiscalUrl: C.fiscalUrlFrom(String(r.FiskalniLink)) } : {}),
        ...((att => att.length ? { attachments: att } : {})(String(r.Prilozi || '').split(';').map(x=> x.trim()).filter(C.isAttachmentName)))
      };
    });

    const katRows = sheetRows('Kategorije');
    expenseCats = katRows.map(r=>String(r.Naziv)).filter(Boolean);
    limits = {};
    katRows.forEach(r=>{ if(r.Limit !== '' && r.Limit != null) limits[String(r.Naziv)] = Number(r.Limit); });
    if(expenseCats.length === 0) expenseCats = DEFAULT_CATS.slice();
    fixedCategories = fixedCategories.filter(c => expenseCats.includes(c)); saveFixedCategories();

    const recRows = sheetRows('Ponavljajuce');
    recurring = recRows.filter(r=>r.Opis).map(r=>({
      id: String(r.ID || newId()),
      desc: String(r.Opis || ''),
      amount: Number(r.Iznos) || 0,
      category: String(r.Kategorija || 'Ostalo'),
      type: (String(r.Tip).toLowerCase() === 'income') ? 'income' : 'expense',
      day: C.clampRecurringDay(Number(r.Dan) || 1),
      frequency: ['monthly','quarterly','yearly'].includes(String(r.Ucestalost)) ? String(r.Ucestalost) : 'monthly',
      anchorMonth: Math.min(12, Math.max(1, Number(r.PocetniMesec) || 1)),
      isSubscription: /^(da|yes|true|1)$/i.test(String(r.Pretplata||'').trim()),
      autoPay: /^(da|yes|true|1)$/i.test(String(r.AutoUpis||'').trim()),
      ...(/^(da|yes|true|1)$/i.test(String(r.RaspodelaNaPeriod||'').trim()) ? { spreadPeriod: true } : {}),
      ...(r.DugID ? { debtId: String(r.DugID) } : {}),
      ...(/^\d{4}-\d{2}$/.test(String(r.Do||'')) ? { until: String(r.Do) } : {}),
      ...(r.PrimalacRacun ? { payee: C.cleanPayee({ account: r.PrimalacRacun, name: r.PrimalacNaziv, code: r.SifraPlacanja, purpose: r.SvrhaPlacanja, model: r.Model, reference: r.PozivNaBroj }) } : {}),
    }));

    goals = goalsFromWorkbook(wb);

    const placRows = sheetRows('PlacenoLog');
    applied = {};
    placRows.forEach(r=>{
      if(!r.Mesec || !r.RecurringID) return;
      const m = String(r.Mesec), rid = String(r.RecurringID);
      if(!applied[m]) applied[m] = [];
      applied[m].push(rid);
    });

    const dugRows = sheetRows('Dugovi');
    debts = dugRows.filter(r=>r.Osoba).map(r=>({
      id: String(r.ID || newId()),
      person: String(r.Osoba || ''),
      amount: Number(r.Iznos) || 0,
      paidAmount: Number(r.Uplaceno) || 0,
      direction: (String(r.Smer) === 'i_owe') ? 'i_owe' : 'owed_to_me',
      date: r.Datum ? normalizeDateCell(r.Datum) : toISODateLocal(new Date()),
      due: r.Rok ? normalizeDateCell(r.Rok) : '',
      note: String(r.Napomena || ''),
      ...(CURRENCIES.includes(String(r.Valuta)) && String(r.Valuta) !== 'RSD' ? { currency: String(r.Valuta), origAmount: Number(r.IznosUValuti) || undefined, rate: Number(r.Kurs) || undefined } : {})
    }));

    const skipRows = sheetRows('Preskoceno');
    skipped = {};
    skipRows.forEach(r=>{
      if(!r.Mesec || !r.RecurringID) return;
      const m = String(r.Mesec), rid = String(r.RecurringID);
      if(!skipped[m]) skipped[m] = [];
      skipped[m].push(rid);
    });

    const bojeRows = sheetRows('BojeKategorija');
    catColors = {};
    bojeRows.forEach(r=>{
      const hex = sanitizeHexColor(r.Boja);
      if(r.Kategorija && hex) catColors[String(r.Kategorija)] = hex;
    });

    if(wb.Sheets['Racuni']){
      accounts = sheetRows('Racuni').filter(r=>r.Naziv).map(r=>({ id: String(r.ID || newId()), name: String(r.Naziv), type: ['tekuci','gotovina','stednja','kartica'].includes(String(r.Vrsta)) ? String(r.Vrsta) : 'tekuci', openingBalance: Number(r.PocetnoStanje) || 0 }));
      sheetRows('Prenosi').filter(r=>r.Datum && r.SaRacuna && r.NaRacun).forEach(r=> entries.push({ id: String(r.ID || newId()), type: 'transfer', date: normalizeDateCell(r.Datum), desc: String(r.Opis||''), amount: Number(r.Iznos) || 0, fromAccount: String(r.SaRacuna), toAccount: String(r.NaRacun) }));
    }
    const wbBills = billsFromWorkbook(wb);
    if(wbBills){ locations = wbBills.locations; billTypes = wbBills.billTypes; bills = wbBills.bills; }
    const wbDocs = documentsFromWorkbook(wb);
    if(wbDocs) documents = wbDocs;
    entries.forEach(e=>{ if(e.accountName){ const a = accounts.find(x=> x.name === e.accountName); if(a) e.accountId = a.id; delete e.accountName; } });

    const incRows = sheetRows('KategorijePrihoda');
    if(incRows.length) incomeCats = incRows.map(r=>String(r.Naziv)).filter(Boolean);
    const ruleRows = sheetRows('Pravila');
    if(wb.Sheets['Pravila']) catRules = ruleRows.filter(r=>r.KljucnaRec && r.Kategorija).map(r=>({ keyword: String(r.KljucnaRec), category: String(r.Kategorija) }));

    const podRows = sheetRows('Podesavanja');
    monthlyBudget = podRows.length ? (parseFloat(podRows[0].MesecniBudzet) || 0) : 0;
  }

  function persistAllToLocalStorage(){
    saveEntries(); saveCats(); saveLimits(); saveRecurring(); saveApplied(); saveGoals();
    saveDebts(); saveSkipped(); saveCatColors(); saveMonthlyBudget(); saveIncomeCats(); saveCatRules(); saveAccounts(); saveBillsState(); saveDocuments();
    populateAccountSelects();
  }

  // Popravlja neusklađenost: ako je applied-log rekao da je neki mesec plaćen za neku
  // ponavljajuću stavku, a stvarna stavka u entries-ima za taj mesec nedostaje (npr. zbog
  // starijeg bug-a ili nepotpunog uvoza), dopunjuje nedostajuću stavku da brojke budu tačne.
  if(IS_TEST) window.__reconcileApplied = () => { reconcileAppliedEntries(); renderAll(); };
  function reconcileAppliedEntries(){
    let changed = false;
    let fixedCount = 0;
    Object.keys(applied).forEach(mKey=>{
      (applied[mKey] || []).forEach(rid=>{
        const r = recurring.find(x=>x.id === rid);
        if(!r) return;
        const entryId = recurringEntryId(r, mKey);
        if(!entries.some(e=>e.id === entryId)){
          const dateStr = C.dueDateFor(r, mKey);
          entries.push(recurringEntry(r, mKey));
          changed = true;
          fixedCount++;
        }
      });
    });
    if(changed) saveEntries();
    return fixedCount;
  }

  async function writeExcelNow(){
    if(!excelHandle || !window.XLSX) return;
    if(excelConflictActive) return; // ne prepisuj fajl dok korisnik ne resi konflikt
    try{
      const perm = await excelHandle.queryPermission({mode:'readwrite'});
      if(perm !== 'granted'){ updateExcelStatus('Potrebna je ponovna dozvola za pristup fajlu — koristi "Ponovo poveži".'); return; }
      const syncTimestamp = getDataUpdatedAt() || Date.now();
      const wb = buildWorkbook(syncTimestamp);
      const arrBuf = XLSX.write(wb, {bookType:'xlsx', type:'array'});
      const writable = await excelHandle.createWritable();
      await writable.write(arrBuf);
      await writable.close();
      markDataSynced(syncTimestamp);
      try{ const f = await excelHandle.getFile(); lastKnownFileModified = f.lastModified; } catch(e){ /* ignorisano */ }
      updateExcelStatus(`Povezano: ${excelHandle.name} — sačuvano u ${new Date().toLocaleTimeString(LOCALE)}`);
    } catch(err){
      updateExcelStatus('Greška pri čuvanju u Excel: ' + err.message);
    }
  }
  function scheduleExcelWrite(){
    if(!excelHandle) return;
    // Upisuje se ODMAH, sinhrono, u localStorage (ne samo u JS promenljivu) — prezivljava
    // zatvaranje taba/browsera. Bez ovoga: ako korisnik unese nesto i odmah zatvori tab pre
    // isteka 450ms debounce-a, fajl na disku ostaje stariji od localStorage-a; sledeci put kad
    // se app otvori, tryReconnectExcel() bi bezuslovno UCITAO stariji fajl i PREPISAO tek unetu
    // stavku — upravo ovo je bio prijavljeni bug.
    markDataUpdated();
    if(excelConflictActive) return; // sacekaj da korisnik resi konflikt pre sledeceg pisanja
    clearTimeout(excelWriteTimer);
    excelWriteTimer = setTimeout(writeExcelNow, 450);
  }
  // Ucitava sadrzaj fajla u lokalne podatke (koristi se i za "Otvori postojeci fajl" i za
  // automatsko preuzimanje spolja-promenjenog fajla kad nemamo neposlatih lokalnih izmena).
  async function readExcelFileIntoLocal(handle){
    const file = await handle.getFile();
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, {type:'array'});
    const bad = workbookShapeError(wb);
    if(bad){ const err = new Error(bad); err.shape = true; throw err; }
    parseWorkbook(wb);
    persistAllToLocalStorage(); reconcileAppliedEntries();
    lastKnownFileModified = file.lastModified;
    // Lokalni podaci SADA jesu ono sto je u fajlu — oba timestampa se izjednacavaju na isti
    // trenutak da hasLocalUnsyncedChanges() odmah vrati false (a ne da "updated" ostane stariji
    // od "synced" i pogresno izazove ponovnu detekciju neposlatih izmena).
    const fileTs = readFileDataTimestamp(wb) || Date.now();
    localStorage.setItem(DATA_UPDATED_KEY, String(fileTs));
    markDataSynced(fileTs);
    populateExpenseCategorySelect(); populateExpenseFilters(); populateRecurringCategorySelect(); renderCatRules();
    renderAll();
  }
  // Cita "Stavke" iz workbook-a SAMO radi poredjenja sa lokalnim entries (za diff prikaz u konflikt
  // baneru) — ne mutira nista, za razliku od parseWorkbook() koje upisuje u globalne varijable.
  function extractEntryIdsFromWorkbook(wb){
    const rows = wb.Sheets['Stavke'] ? XLSX.utils.sheet_to_json(wb.Sheets['Stavke'], {defval:''}) : [];
    return new Set(rows.filter(r=>r.Datum || r.Opis).map(r=>String(r.ID)));
  }
  function showExcelConflict(diffText){
    excelConflictActive = true;
    clearTimeout(excelWriteTimer);
    document.getElementById('excelConflictBanner').style.display = 'flex';
    document.getElementById('excelConflictDiff').textContent = diffText || '';
    updateExcelStatus('Konflikt: fajl je promenjen na drugom uređaju dok si ovde imao neposlate izmene.');
  }
  function hideExcelConflict(){
    excelConflictActive = false;
    document.getElementById('excelConflictBanner').style.display = 'none';
  }
  // Periodicna provera (samo dok je tab vidljiv) da li se povezan fajl promenio spolja —
  // omogucava da isti .xlsx u cloud folderu (OneDrive/Google Drive) sinhronizuje dva uredjaja
  // bez servera. Bezbedno tiho preuzima SAMO ako nemamo neposlatih lokalnih izmena; inace trazi
  // od korisnika da eksplicitno resi konflikt (nikad tihо ne prepisuje ni jednu stranu).
  async function checkExcelFileChangedExternally(){
    if(!excelHandle || excelConflictActive || document.visibilityState !== 'visible') return;
    try{
      const perm = await excelHandle.queryPermission({mode:'readwrite'});
      if(perm !== 'granted') return;
      const file = await excelHandle.getFile();
      if(file.lastModified <= lastKnownFileModified){ return; } // OS mtime nepromenjen - sigurno nista novo
      // mtime se promenio, ali to ne mora znaciti da su PODACI stvarno drugi (cloud-sync alati
      // ponekad diraju mtime bez izmene sadrzaja) — pouzdano provera je timestamp UPISAN U fajl.
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, {type:'array'});
      lastKnownFileModified = file.lastModified;
      const fileTs = readFileDataTimestamp(wb);
      if(fileTs <= getDataSyncedAt()) return; // fajl nije stvarno noviji od onog sa cim smo usaglaseni
      if(hasLocalUnsyncedChanges()){
        let diffText = '';
        try{
          const fileIds = extractEntryIdsFromWorkbook(wb);
          const localIds = new Set(entries.map(e=>e.id));
          const onlyInFile = [...fileIds].filter(id=>!localIds.has(id)).length;
          const onlyLocal = [...localIds].filter(id=>!fileIds.has(id)).length;
          diffText = `Fajl ima ${onlyInFile} stavki koje ovde nemaš; ti imaš ${onlyLocal} novih stavki koje fajl nema.`;
        } catch(e){ /* diff je samo informativan prikaz, konflikt se i bez njega bezbedno resava */ }
        showExcelConflict(diffText);
      } else {
        await readExcelFileIntoLocal(excelHandle);
        updateExcelStatus(`Povezano: ${excelHandle.name} — preuzete izmene sa drugog uređaja u ${new Date().toLocaleTimeString(LOCALE)}`);
      }
    } catch(e){
      // Pogresan oblik fajla: reci korisniku (podaci nisu dirani); ostalo je verovatno privremeno — probaj ponovo
      if(e && e.shape){ excelShapeStatus = e.message; updateExcelStatus(e.message); }
    }
  }
  let excelShapeStatus = '';
  if(IS_TEST) window.__excelShapeStatus = () => excelShapeStatus;

  async function connectNewExcelFile(){
    try{
      const handle = await window.showSaveFilePicker({
        suggestedName: 'budzet.xlsx',
        types: [{ description: 'Excel radna sveska', accept: {'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']} }]
      });
      excelHandle = handle;
      await idbSet('excelFile', handle);
      await writeExcelNow();
      document.getElementById('excelReconnectBtn').style.display = 'none';
      startExcelPolling();
    } catch(err){ if(err.name !== 'AbortError') updateExcelStatus('Greška: ' + err.message); }
  }

  async function openExistingExcelFile(){
    try{
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Excel radna sveska', accept: {'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']} }]
      });
      const perm = await handle.requestPermission({mode:'readwrite'});
      if(perm !== 'granted') throw new Error('Dozvola nije data.');
      excelHandle = handle;
      await readExcelFileIntoLocal(handle);
      await idbSet('excelFile', handle);
      document.getElementById('excelReconnectBtn').style.display = 'none';
      startExcelPolling();
    } catch(err){ if(err.name !== 'AbortError') updateExcelStatus('Greška: ' + err.message); }
  }

  async function tryReconnectExcel(){
    if(!fsApiSupported) return;
    try{
      const handle = await idbGet('excelFile');
      if(!handle) return;
      const perm = await handle.queryPermission({mode:'readwrite'});
      if(perm === 'granted'){
        excelHandle = handle;
        if(hasLocalUnsyncedChanges()){
          // Prethodna sesija je imala lokalne izmene koje nikad nisu stigle u fajl (tab zatvoren
          // pre isteka debounce-a) — NE prepisuj lokalne podatke starijim fajlom, vec odmah
          // upisi trenutno (novije) lokalno stanje u fajl da ga dovedes u red.
          try{ await writeExcelNow(); } catch(e){ /* ignorisano */ }
          updateExcelStatus(`Povezano: ${handle.name} — sačuvane su izmene iz prethodne sesije koje nisu stigle u fajl.`);
        } else {
          try{ await readExcelFileIntoLocal(handle); } catch(e){ /* fajl mozda obrisan/premesten - nastavi sa lokalnim podacima */ }
          updateExcelStatus(`Povezano: ${handle.name}`);
        }
      } else {
        pendingHandle = handle;
        updateExcelStatus(`Prethodno povezan fajl "${handle.name}" — klikni "Ponovo poveži" da nastaviš.`);
        document.getElementById('excelReconnectBtn').style.display = 'inline-block';
      }
    } catch(e){ /* IndexedDB nedostupan ili nema sacuvanog handle-a */ }
  }
  function startExcelPolling(){
    clearInterval(excelPollTimer);
    excelPollTimer = setInterval(checkExcelFileChangedExternally, 20000);
  }
  // Dodatna zastita (uz dirty-flag oporavak pri sledecem otvaranju): kad se tab sakrije/zatvori,
  // odmah pokusaj da upises zakazanu izmenu umesto da cekas ostatak od 450ms debounce-a. Ne moze
  // se garantovati da ce async upis stici da se zavrsi, ali drastično smanjuje prozor rizika.
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState === 'hidden' && excelHandle && hasLocalUnsyncedChanges() && !excelConflictActive){
      clearTimeout(excelWriteTimer);
      writeExcelNow();
    }
  });

  function setupExcelUI(){
    if(fsApiSupported){
      document.getElementById('excelFsSection').style.display = 'block';
      document.getElementById('excelConnectNewBtn').addEventListener('click', connectNewExcelFile);
      document.getElementById('excelOpenExistingBtn').addEventListener('click', openExistingExcelFile);
      document.getElementById('excelKeepMineBtn').addEventListener('click', async ()=>{
        hideExcelConflict();
        await writeExcelNow();
      });
      document.getElementById('excelTakeFileBtn').addEventListener('click', async ()=>{
        hideExcelConflict();
        try{ await readExcelFileIntoLocal(excelHandle); updateExcelStatus(`Povezano: ${excelHandle.name} — preuzeto iz fajla u ${new Date().toLocaleTimeString(LOCALE)}`); }
        catch(err){ updateExcelStatus('Greška: ' + err.message); }
      });
      document.getElementById('excelReconnectBtn').addEventListener('click', async ()=>{
        if(!pendingHandle) return;
        try{
          const perm = await pendingHandle.requestPermission({mode:'readwrite'});
          if(perm === 'granted'){
            excelHandle = pendingHandle;
            if(hasLocalUnsyncedChanges()){
              await writeExcelNow();
              updateExcelStatus(`Povezano: ${excelHandle.name} — sačuvane su izmene iz prethodne sesije koje nisu stigle u fajl.`);
            } else {
              await readExcelFileIntoLocal(excelHandle);
            }
            document.getElementById('excelReconnectBtn').style.display = 'none';
            startExcelPolling();
          } else {
            updateExcelStatus('Dozvola nije data.');
          }
        } catch(err){ updateExcelStatus('Greška: ' + err.message); }
      });
      tryReconnectExcel();
      startExcelPolling();
    } else {
      document.getElementById('excelFallbackSection').style.display = 'block';
      document.getElementById('excelManualExportBtn').addEventListener('click', ()=>{
        const wb = buildWorkbook();
        XLSX.writeFile(wb, 'budzet-' + toISODateLocal(new Date()) + '.xlsx');
      });
      document.getElementById('excelManualImportInput').addEventListener('change', function(e){
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = async (evt)=>{
          try{
            const wb = XLSX.read(evt.target.result, {type:'array'});
            const bad = workbookShapeError(wb);
            if(bad){ appAlert(bad); return; }
            if(!(await appConfirm('Uvoz iz Excel fajla ZAMENJUJE stavke, kategorije, ponavljajuće stavke, ciljeve i dugove u aplikaciji podacima iz fajla. Nastaviti?', { title: 'Uvoz iz Excela', okText: 'Zameni podatke', danger: true }))) return;
            if(window.__desktopData){ await window.__desktopData.saveNow(); try{ await window.desktop.backupNow(); } catch(e){ /* prva upotreba — nema jos fajla */ } }
            else downloadBackupJson();
            parseWorkbook(wb);
            persistAllToLocalStorage(); reconcileAppliedEntries();
            populateExpenseCategorySelect(); populateExpenseFilters(); populateRecurringCategorySelect(); renderCatRules();
            renderAll();
            appAlert('Excel fajl je uspešno učitan.');
          } catch(err){ appAlert('Greška pri čitanju Excel fajla: ' + err.message); }
        };
        reader.readAsArrayBuffer(file);
        e.target.value = '';
      });
    }
  }
