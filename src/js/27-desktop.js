  // ---- Desktop aplikacija (Electron) ----
  if(desktop){
    const byId = (id)=> document.getElementById(id);
    let toastTimer = null;
    function deskToast(msg, ms){
      const t = byId('deskToast');
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(()=> t.classList.remove('show'), ms || 3200);
    }

    // Naslovna traka
    byId('tbMenuBtn').addEventListener('click', (e)=>{
      const r = e.currentTarget.getBoundingClientRect();
      desktop.showMenu(r.left, r.bottom + 4);
    });
    byId('tbStatus').addEventListener('click', ()=>{
      showScreen('podesavanja');
      setTimeout(()=> byId('desktopData').scrollIntoView({behavior:'smooth', block:'start'}), 80);
    });

    // Status fajla sa podacima: naslovna traka (zelena tacka = sve sacuvano) + Podesavanja
    const dataStore = window.__desktopData;
    const timeFmt = (iso)=> new Date(iso).toLocaleTimeString(LOCALE, {hour:'2-digit', minute:'2-digit'});
    function renderDataStatus(){
      const s = dataStore.status;
      const dot = byId('tbDot'), txt = byId('tbStatusText');
      if(s.error){ dot.className = 'tb-dot err'; txt.textContent = 'Greška pri čuvanju — klikni za detalje'; }
      else if(s.savedAt){ dot.className = 'tb-dot ok'; txt.textContent = t('Sačuvano {0}', timeFmt(s.savedAt)); }
      else { dot.className = 'tb-dot'; txt.textContent = 'Čuva se…'; }
      byId('deskDataPath').textContent = s.path;
      byId('deskDataStatus').textContent = (s.warning ? '⚠ ' + s.warning + ' ' : '') + (s.error
        ? 'Poslednje čuvanje nije uspelo: ' + s.error + ' — pokušava se ponovo automatski.'
        : s.savedAt ? t('Poslednje čuvanje:') + ' ' + new Date(s.savedAt).toLocaleString(LOCALE, {dateStyle:'medium', timeStyle:'short'}) : '');
    }
    window.addEventListener('desktop-data-status', renderDataStatus);
    renderDataStatus();
    if(dataStore.status.warning) deskToast(dataStore.status.warning, 12000);
    byId('deskOpenDataBtn').addEventListener('click', ()=> desktop.data.open());

    // Tekstovi koji u browseru govore o browseru
    document.querySelector('footer').innerHTML = `<span>${t('Podaci se čuvaju u fajlu na ovom računaru. AI čitanje šalje Groq-u samo ono što ubaciš (vidi Podešavanja).')}</span><span class="footer-keys">${t('Pritisni {0} za prečice na tastaturi', '<kbd>?</kbd>')}</span>`;
    byId('enableNotifBtn').style.display = 'none';
    byId('notifStatus').textContent = 'Notifikacije su uključene — podsetnici za kasna plaćanja i dugove stižu i kad je prozor zatvoren (dok aplikacija radi u tray-u).';
    // Excel: samo rucni izvoz/uvoz (podaci vise ne zavise od Excel fajla)
    const excelGroup = byId('excelFallbackSection').closest('.settings-group');
    excelGroup.querySelector('h3').textContent = 'Excel izvoz / uvoz';
    byId('excelManualExportBtn').textContent = 'Izvezi u Excel';
    byId('excelFallbackSection').querySelector('.import-status').textContent =
      'Izvoz pravi Excel fajl sa svim stavkama, kategorijama, ponavljajućim stavkama, ciljevima i dugovima (npr. za analizu). Uvoz iz Excel fajla ZAMENJUJE te podatke u aplikaciji.';
    byId('savePdfReportBtn').style.display = '';
    document.querySelector('#screen-izvestaj .hint').textContent = 'Izveštaj se generiše iz stavki (rashodi računaju samo plaćene). "Sačuvaj kao PDF" pravi PDF fajl direktno, bez dijaloga za štampu.';

    // Komande iz menija, precica na tastaturi, tray-a i jump liste
    function focusField(id){
      setTimeout(()=>{
        const el = byId(id);
        if(!el) return;
        el.scrollIntoView({behavior:'smooth', block:'center'});
        el.focus({preventScroll:true});
      }, 60);
    }
    async function savePdfReport(){
      renderReport();
      const scope = byId('reportScope').value;
      const label = scope === 'year' ? byId('reportYear').value : byId('reportMonth').value;
      const filePath = await desktop.choosePdfPath(`Izvestaj-${label || toISODateLocal(new Date())}.pdf`);
      if(!filePath) return;
      const prevTheme = document.body.getAttribute('data-theme');
      document.body.setAttribute('data-theme', 'light');
      try{
        await new Promise(r=> requestAnimationFrame(()=> requestAnimationFrame(r)));
        await desktop.writePdf(filePath);
        deskToast('PDF je sačuvan: ' + filePath.split(/[\\/]/).pop());
      } catch(err){
        appAlert('Greška pri čuvanju PDF-a: ' + err.message);
      } finally {
        document.body.setAttribute('data-theme', prevTheme);
      }
    }
    byId('savePdfReportBtn').addEventListener('click', savePdfReport);

    desktop.onCommand((name, arg)=>{
      switch(name){
        case 'navigate':
          if(arg === 'podesavanja-desktop' || arg === 'podesavanja-azuriranja'){
            showScreen('podesavanja');
            const target = arg === 'podesavanja-desktop' ? 'desktopShortcuts' : 'desktopUpdates';
            setTimeout(()=> byId(target).scrollIntoView({behavior:'smooth', block:'start'}), 80);
          } else showScreen(arg);
          break;
        case 'new-expense': openNewEntry('expense'); break;
        case 'new-income': openNewEntry('income'); break;
        case 'search': showScreen('pretraga'); focusField('searchInput'); break;
        case 'toggle-theme': toggleTheme(); break;
        case 'toggle-sidebar': window.__toggleSidebar(); break;
        case 'print-report': renderReport(); window.print(); break;
        case 'save-pdf': savePdfReport(); break;
        case 'backup-now': backupNow(); break;
      }
    });

    // Rezervne kopije (dnevnu kopiju pravi sam program pre prvog cuvanja tog dana)
    async function refreshBackupInfo(){
      try{
        const i = await desktop.backupInfo();
        byId('deskBackupStatus').textContent = i.last
          ? t('Poslednja kopija: {0} · {1} fajlova u {2}', new Date(i.last).toLocaleString(LOCALE, {dateStyle:'medium', timeStyle:'short'}), i.count, i.dir)
          : t('Još nema kopija — prva se pravi automatski. Folder: {0}', i.dir);
        const list = await desktop.backupList();
        const kindLabel = { daily: 'dnevna', monthly: 'mesečna', manual: 'ručna', before: 'pre vraćanja' };
        byId('deskBackupList').innerHTML = list.map(b=> `<li><span class="name">${new Date(b.savedAt || b.mtime).toLocaleString(LOCALE, {dateStyle:'medium', timeStyle:'short'})}
            <span class="cat-tag" style="margin-left:0.4em;">${kindLabel[b.kind] || b.kind}</span>
            <span style="color:var(--ink-soft); font-size:0.88em; margin-left:0.4em;">${b.entries != null ? t('{0} stavki', b.entries) : ''}</span></span>
          <button class="btn-secondary" data-restore="${escapeHtml(b.name)}" style="padding:0.35em 0.9em;">Vrati</button></li>`).join('')
          || '<li class="empty">Još nema kopija.</li>';
        byId('deskBackupList').querySelectorAll('[data-restore]').forEach(btn=>{
          btn.addEventListener('click', ()=> restoreBackup(btn.dataset.restore));
        });
      } catch(e){ /* ignorisano */ }
    }
    async function restoreBackup(name){
      let raw;
      try{ raw = await desktop.backupRead(name); }
      catch(err){ appAlert('Kopija ne može da se pročita: ' + err.message); return; }
      const when = raw.savedAt ? new Date(raw.savedAt).toLocaleString(LOCALE, {dateStyle:'medium', timeStyle:'short'}) : name;
      if(!(await appConfirm(t('Vratiti sve podatke na stanje od {0}?\n\nSve izmene posle tog trenutka biće zamenjene. Pre vraćanja se automatski čuva kopija trenutnog stanja, pa se i ovo može poništiti.', when), { title: t('Vraćanje kopije'), okText: t('Vrati kopiju') }))) return;
      await dataStore.saveNow();
      try{ await desktop.backupNow('before'); } catch(e){ /* nema jos fajla */ }
      dataStore.replaceAll(raw.data);
      location.reload();
    }
    async function backupNow(){
      try{
        await dataStore.saveNow();
        await desktop.backupNow();
        deskToast('Rezervna kopija je napravljena.');
      } catch(err){ appAlert('Greška pri pravljenju rezervne kopije: ' + err.message); }
      refreshBackupInfo();
    }
    // Posle cuvanja osvezi spisak kopija, ali najvise jednom u 15 s (nova dnevna kopija nastaje retko).
    let backupRefreshTimer = null;
    window.addEventListener('desktop-data-status', ()=>{
      if(backupRefreshTimer) return;
      backupRefreshTimer = setTimeout(()=>{ backupRefreshTimer = null; refreshBackupInfo(); }, 15000);
    });
    byId('deskBackupNowBtn').addEventListener('click', backupNow);
    byId('deskOpenBackupsBtn').addEventListener('click', ()=> desktop.openBackups());

    // Kopija van racunara (USB / drugi folder)
    function renderExtraBackup(info){
      extraBackupState = info || null;
      const has = !!(info && info.dir);
      byId('extraBackupChooseBtn').textContent = has ? t('Promeni folder…') : t('Izaberi folder…');
      ['extraBackupNowBtn', 'extraBackupOpenBtn', 'extraBackupClearBtn'].forEach(id=> byId(id).style.display = has ? '' : 'none');
      const st = byId('extraBackupStatus');
      if(!has){ st.textContent = t('Isključeno — kopije postoje samo na ovom računaru.'); st.classList.remove('warn'); return; }
      const lastTxt = info.last ? new Date(info.last).toLocaleString(LOCALE, {dateStyle:'medium', timeStyle:'short'}) : t('još nijednom');
      st.textContent = t('Folder: {0} · poslednja kopija: {1}', info.dir, lastTxt) + (info.available ? '' : ' · ' + t('disk trenutno nije priključen'));
      st.classList.toggle('warn', (extraBackupDays() || 0) >= EXTRA_BACKUP_WARN_DAYS);
    }
    if(desktop.extraBackup){
      desktop.extraBackup.info().then(info=>{ renderExtraBackup(info); invalidate(); });
      desktop.extraBackup.onChange(info=>{ renderExtraBackup(info); invalidate(); });
      byId('extraBackupChooseBtn').addEventListener('click', async ()=>{ await dataStore.saveNow(); renderExtraBackup(await desktop.extraBackup.choose()); invalidate(); });
      byId('extraBackupOpenBtn').addEventListener('click', ()=> desktop.extraBackup.open());
      byId('extraBackupClearBtn').addEventListener('click', async ()=>{ renderExtraBackup(await desktop.extraBackup.clear()); invalidate(); });
      byId('extraBackupNowBtn').addEventListener('click', async ()=>{
        await dataStore.saveNow();
        const r = await desktop.extraBackup.now();
        if(r && r.ok) deskToast(t('Kopija je upisana u izabrani folder.'));
        else appAlert(r && r.reason === 'unavailable' ? t('Folder nije dostupan — da li je disk priključen?') : t('Kopija nije uspela: {0}', (r && r.error) || ''));
        renderExtraBackup(await desktop.extraBackup.info()); invalidate();
      });
    } else byId('extraBackupGroup').style.display = 'none';

    // Podesavanja desktop aplikacije
    byId('desktopSettings').style.display = 'block';
    const shortcutLabel = (acc)=> acc
      ? acc.replace('CommandOrControl', isMacDesktop ? '⌘' : 'Ctrl').replace('Super', 'Win').replace('Space', 'Razmak').replace(/^Alt|(?<=\+)Alt/g, isMacDesktop ? '⌥' : 'Alt').replace(/Shift/g, isMacDesktop ? '⇧' : 'Shift').split('+').map(k=>`<kbd>${k}</kbd>`).join(' + ')
      : '<span>isključeno</span>';
    function renderShortcutStatus(acc, ok){
      byId('deskShortcutKeys').innerHTML = shortcutLabel(acc);
      byId('deskShortcutStatus').textContent = !acc ? 'Brzi unos je i dalje dostupan iz tray menija i sa desnim klikom na ikonicu na taskbaru.'
        : ok ? (isMacDesktop ? 'Pritisni prečicu bilo gde na Mac-u da otvoriš mali prozor za brzi unos rashoda.' : 'Pritisni prečicu bilo gde u Windows-u da otvoriš mali prozor za brzi unos rashoda.')
        : 'Ovu prečicu već koristi neki drugi program — izaberi drugu.';
    }
    async function refreshDesktopSettings(){
      const s = await desktop.getSettings();
      byId('deskAutostart').checked = s.startWithWindows;
      byId('deskCloseToTray').checked = s.closeToTray;
      byId('deskShortcut').value = s.quickAddShortcut;
      renderShortcutStatus(s.quickAddShortcut, s.quickAddShortcutOk);
    }
    byId('deskAutostart').addEventListener('change', (e)=> desktop.setSetting('startWithWindows', e.target.checked));
    byId('deskCloseToTray').addEventListener('change', (e)=> desktop.setSetting('closeToTray', e.target.checked));
    byId('deskShortcut').addEventListener('change', async (e)=>{
      const r = await desktop.setSetting('quickAddShortcut', e.target.value);
      renderShortcutStatus(e.target.value, r.quickAddShortcutOk);
    });
    desktop.onSettingsChanged(refreshDesktopSettings);
    refreshDesktopSettings();
    refreshBackupInfo();

    // Automatska azuriranja: status u Podesavanjima + dugme "Restartuj" u naslovnoj traci kad je nova verzija preuzeta
    let updateState = null, countdownTimer = null;
    // Verzija gore levo: instalirana verzija; ako postoji novija na GitHub-u — preuzima se / "Azuriraj na X"
    function renderSidebarVersion(s){
      const el = byId('sbVersion');
      el.style.display = '';
      el.className = 'sb-version';
      const icon = byId('sbAppIcon');
      let label = 'v' + s.current, title = t('Instalirana verzija: {0}', s.current);
      if(s.status === 'current') title += ' — ' + t('najnovija');
      if(s.status === 'downloading' && s.version){ el.classList.add('pending'); label = t('v{0} → {1} (preuzima se)', s.current, s.version); title = t('Nova verzija {0} se preuzima.', s.version); }
      if(s.status === 'ready' && s.version){ el.classList.add('ready'); label = t('Ažuriraj na {0}', s.version); title = t('Instalirana je {0}, a dostupna je {1} — klikni da ažuriraš.', s.current, s.version); }
      if(s.status === 'installing'){ el.classList.add('ready'); label = t('Instaliram {0}…', s.version || ''); }
      if(s.status === 'manual' && s.version){ el.classList.add('ready'); label = t('Preuzmi {0}', s.version); title = t('Instalirana je {0}, a dostupna je {1} — klikni da preuzmeš.', s.current, s.version); }
      el.textContent = label; el.title = title; el.setAttribute('aria-label', title);
      icon.classList.toggle('update-dot', s.status === 'downloading' || s.status === 'ready' || s.status === 'installing' || s.status === 'manual');
      icon.title = (s.status === 'ready' || s.status === 'manual') ? title : '';
    }
    byId('sbVersion').addEventListener('click', ()=>{
      if(updateState && updateState.status === 'ready'){ desktop.update.install(); return; }
      if(updateState && updateState.status === 'manual'){ desktop.update.openDownload(); return; }
      showScreen('podesavanja');
      setTimeout(()=> byId('desktopUpdates').scrollIntoView({behavior:'smooth', block:'start'}), 80);
      if(!updateState || !['downloading','installing'].includes(updateState.status)) desktop.update.check();
    });
    function renderUpdate(s){
      if(!s) return;
      updateState = s;
      renderSidebarVersion(s);
      const pill = byId('tbUpdate');
      byId('deskVersion').textContent = t('Instalirana verzija: {0}', s.current);
      const txt = {
        idle: 'Nove verzije se proveravaju automatski (pri pokretanju, na svakih 15 minuta i kad otvoriš prozor) i instaliraju same.',
        checking: 'Proveravam da li postoji nova verzija…',
        current: 'Imaš najnoviju verziju. Nove verzije se instaliraju automatski.',
        downloading: t('Preuzimam verziju {0}… {1}', s.version || '', s.percent ? s.percent + '%' : ''),
        ready: s.saveFailed
          ? t('Verzija {0} čeka: podaci nisu mogli da se sačuvaju (fajl je zauzet), pa je instalacija odložena. Pokušaću ponovo za 5 minuta.', s.version)
          : s.postponed
          ? t('Verzija {0} je spremna — instaliraće se čim skloniš prozor (tray ili minimizuj) ili zatvoriš aplikaciju.', s.version)
          : t('Verzija {0} je spremna i instaliraće se automatski za nekoliko trenutaka.', s.version),
        installing: t('Instaliram verziju {0}…', s.version),
        manual: t('Dostupna je verzija {0}. Klikni „Preuzmi“, otvori preuzeti .dmg i prevuci aplikaciju u Applications (preko stare) — podaci ostaju.', s.version),
        error: t('Provera nije uspela (možda nema interneta) — pokušaću ponovo kasnije. {0}', s.error || '')
      }[s.status] || '';
      byId('deskUpdateStatus').textContent = isMacDesktop && ['idle', 'current'].includes(s.status)
        ? (s.status === 'current' ? t('Imaš najnoviju verziju. Aplikacija sama proverava nove verzije i javi kad stigne nova.') : t('Nove verzije se proveravaju automatski; kad stigne nova, aplikacija ponudi dugme „Preuzmi“.'))
        : txt;
      const manual = s.status === 'manual';
      byId('deskUpdateInstallBtn').style.display = (s.status === 'ready' || manual) ? '' : 'none';
      byId('deskUpdateInstallBtn').textContent = manual ? t('Preuzmi') : t('Restartuj i ažuriraj');
      pill.style.display = (s.status === 'ready' || s.status === 'installing' || manual) ? 'flex' : 'none';
      byId('tbUpdateLater').style.display = (s.status === 'ready' && s.installAt) ? '' : 'none';
      byId('tbUpdateNow').style.display = (s.status === 'ready' || manual) ? '' : 'none';
      byId('tbUpdateNow').textContent = manual ? t('Preuzmi') : t('Ažuriraj sada');
      clearInterval(countdownTimer);
      const tick = ()=>{
        const st = updateState;
        let label;
        if(st.status === 'installing') label = t('Instaliram {0}…', st.version);
        else if(st.installAt){
          const secs = Math.max(0, Math.ceil((st.installAt - Date.now()) / 1000));
          label = t('Verzija {0} se instalira za {1} s', st.version, secs);
        } else if(st.status === 'manual') label = t('Dostupna je verzija {0}', st.version);
        else if(st.saveFailed) label = t('Ažuriranje odloženo — podaci nisu sačuvani');
        else label = t('Verzija {0} je spremna', st.version);
        byId('tbUpdateText').textContent = label;
      };
      tick();
      if(s.installAt) countdownTimer = setInterval(tick, 1000);
    }
    if(IS_TEST) window.__renderUpdate = renderUpdate; // za automatske provere
    desktop.update.onChange(renderUpdate);
    desktop.update.get().then(renderUpdate);
    byId('deskUpdateCheckBtn').addEventListener('click', ()=> desktop.update.check());
    const installOrDownload = ()=> (updateState && updateState.status === 'manual') ? desktop.update.openDownload() : desktop.update.install();
    byId('deskUpdateInstallBtn').addEventListener('click', installOrDownload);
    byId('tbUpdateNow').addEventListener('click', installOrDownload);
    byId('tbUpdateLater').addEventListener('click', ()=> desktop.update.postpone());
    // Posle upravo instaliranog azuriranja: kratka poruka + beleske o izdanju u Podesavanjima
    desktop.update.notes().then(notes=>{
      const el = byId('deskReleaseNotes');
      if(notes && notes.text && notes.version === desktop.info.version){
        el.style.display = '';
        el.textContent = t('Šta je novo u {0}:\n{1}', notes.version, notes.text);
      }
      if(desktop.info.updatedFrom){
        deskToast(t('Aplikacija je ažurirana na verziju {0} — šta je novo pogledaj u Podešavanjima.', desktop.info.version), 8000);
      }
    }).catch(()=>{});

    // Bedz na taskbaru se osvezava i kad se promeni dan (bez ikakve izmene podataka)
    setInterval(updateDesktopBadge, 30*60*1000);

    // Most za prozor za brzi unos i za bezbedan izlazak iz programa
    window.__desktopBridge = {
      getQuickAddData(){
        return {
          accounts: accounts.map(a=>({ id: a.id, name: a.name, type: a.type })),
          defaultAccountId: defaultAccountId(),
          rates: Object.assign({}, fx.rates),
          currencies: fxFavorites.filter(c=> fx.rates[c]),
          rateDate: fx.date,
          expenseCats: expenseCats.slice(),
          incomeCats: incomeCats.slice(),
          rules: catRules.map(r=>({ keyword: r.keyword, category: r.category })),
          history: entries.filter(e=> !isTransfer(e)).sort((a,b)=> b.date.localeCompare(a.date)).slice(0, 400)
            .map(e=>({ type: e.type, desc: e.desc, category: e.category }))
        };
      },
      // Unos iz prozora za unos: valuta, racun, oznake, raspodela na mesece i podela na kategorije
      addEntry(input){
        const type = input.type === 'income' ? 'income' : 'expense';
        const currency = CURRENCIES.includes(input.currency) ? input.currency : 'RSD';
        const rate = currency === 'RSD' ? 1 : fx.rates[currency];
        if(!rate) return { ok:false, error: t('Kurs za {0} nije dostupan.', currency) };
        const toRsd = v => Math.round(v * rate * 100) / 100;
        const parsed = parseQuickAmount(String(input.desc || ''), parseFloat(input.amount));
        if(!parsed.desc) return { ok:false, error:'Unesi opis.' };
        const cats = type === 'expense' ? expenseCats : incomeCats;
        const pickCat = c => cats.includes(c) ? c : (cats[0] || 'Ostalo');
        const date = /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : toISODateLocal(new Date());
        const tags = parseTagsInput(String(input.tags || ''));
        const accountId = accounts.length ? (accountById(input.accountId) ? input.accountId : defaultAccountId()) : undefined;
        const spreadMonths = Math.max(1, Math.min(60, parseInt(input.spreadMonths, 10) || 1));
        const spreadStart = /^\d{4}-\d{2}$/.test(input.spreadStart || '') ? input.spreadStart : null;
        // Delovi: jedna stavka, ili vise kategorija (samo rashod)
        let parts;
        if(type === 'expense' && Array.isArray(input.split) && input.split.length){
          parts = input.split.map(s=> ({ category: pickCat(s.category), orig: parseFloat(s.amount) }));
          if(parts.some(p=> isNaN(p.orig) || p.orig <= 0)) return { ok:false, error:'Svaka kategorija u podeli treba iznos veći od nule.' };
        } else {
          if(isNaN(parsed.amount) || parsed.amount <= 0) return { ok:false, error:'Unesi iznos veći od nule.' };
          parts = [{ category: pickCat(input.category), orig: parsed.amount }];
        }
        let total = 0, lastId = null;
        const made = [];
        parts.forEach(p=>{
          const id = newId();
          const entry = { id, type, desc: parsed.desc, amount: toRsd(p.orig), category: p.category, date, tags };
          if(currency !== 'RSD') Object.assign(entry, { origAmount: p.orig, currency, rate });
          if(type === 'expense') entry.paid = input.paid !== false;
          if(accountId) entry.accountId = accountId;
          if(spreadMonths > 1){ entry.spreadMonths = spreadMonths; if(spreadStart) entry.spreadStart = spreadStart; }
          entries.push(entry);
          if(type === 'expense') applyRoundUpSaving(entry.amount);
          total += entry.amount; lastId = id; made.push(id);
        });
        newEntryId = lastId;
        saveEntries(); renderAll();
        return { ok:true, amountText: fmt(total) + (parts.length > 1 ? t(' ({0} kategorije)', parts.length) : ''), ids: made, category: parts[0].category, type };
      },
      async flush(){
        const ok = dataStore.flushSync();
        return { ok: ok !== false, error: ok === false ? (dataStore.status && dataStore.status.error) || 'save failed' : null };
      }
    };
    // Telegram bot: glavni proces prosledjuje poruke ovde (vidi app/telegram.js)
    window.__telegramBridge = { handle: tgHandle, tick: tgTick, nack: tgNack };
  }
