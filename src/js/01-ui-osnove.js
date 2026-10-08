  // ---- Zvuk (Web Audio, bez eksternih fajlova) ----
  let audioCtx = null;
  function tone(freq, start, dur, type='sine', vol=0.16){
    if(!soundOn) return;
    try{
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.value = vol;
      osc.connect(gain); gain.connect(audioCtx.destination);
      const t0 = audioCtx.currentTime + start;
      osc.start(t0);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.stop(t0 + dur + 0.02);
    } catch(e){ /* audio nije dostupan, tiho preskoci */ }
  }
  function playPaidSound(){ tone(660, 0, 0.11, 'sine', 0.14); tone(990, 0.09, 0.16, 'sine', 0.14); }
  function playUnpaidSound(){ tone(440, 0, 0.12, 'sine', 0.1); }
  function playDeleteSound(){ tone(320, 0, 0.14, 'triangle', 0.1); }
  function playSuccessSound(){ tone(523, 0, 0.11, 'sine', 0.15); tone(659, 0.1, 0.11, 'sine', 0.15); tone(784, 0.2, 0.22, 'sine', 0.15); }

  // ---- Undo toast ----
  // Stog (ne jedan slot) — svako brisanje dobija svoj undo koji NIKAD ne biva nemo odbacen
  // ako se desi jos jedno brisanje pre isteka prethodnog toasta (npr. brzo brisanje 2 stavke zaredom).
  let undoStack = [];
  function showUndoToast(message, undoFn){
    const entry = { message, undoFn, timer: null };
    entry.timer = setTimeout(()=>{
      const idx = undoStack.indexOf(entry);
      if(idx !== -1){ undoStack.splice(idx, 1); renderUndoToast(); }
    }, 5000);
    undoStack.push(entry);
    renderUndoToast();
  }
  function renderUndoToast(){
    const toast = document.getElementById('undoToast');
    const fill = document.getElementById('undoProgressFill');
    if(undoStack.length === 0){ hideToast(); return; }
    const top = undoStack[undoStack.length - 1];
    const label = undoStack.length > 1 ? t('{0} (+{1} još na čekanju)', top.message, undoStack.length - 1) : top.message;
    document.getElementById('undoMessage').textContent = label;
    const newBtn = document.getElementById('undoBtn').cloneNode(true);
    document.getElementById('undoBtn').replaceWith(newBtn);
    newBtn.addEventListener('click', ()=>{
      clearTimeout(top.timer);
      const idx = undoStack.indexOf(top);
      if(idx !== -1) undoStack.splice(idx, 1);
      top.undoFn();
      renderUndoToast();
    });
    toast.style.display = 'flex';
    fill.style.transition = 'none';
    fill.style.width = '100%';
    requestAnimationFrame(()=>{
      toast.classList.add('show');
      requestAnimationFrame(()=>{
        fill.style.transition = 'width 5s linear';
        fill.style.width = '0%';
      });
    });
  }
  function dismissTopUndo(){
    if(undoStack.length === 0) return;
    const top = undoStack.pop();
    clearTimeout(top.timer);
    renderUndoToast();
  }
  function hideToast(){
    const toast = document.getElementById('undoToast');
    toast.classList.remove('show');
  }

  // ---- Generic edit modal ----
  let editModalLastFocus = null;
  function openEditModal(title, fields, onSave){
    document.getElementById('editModalTitle').textContent = title;
    const container = document.getElementById('editModalFields');
    container.innerHTML = fields.map(f=>{
      const fieldId = 'edit-field-' + f.key;
      const valAttr = f.value != null ? String(f.value).replace(/"/g,'&quot;') : '';
      if(f.type === 'select'){
        return `<div class="modal-field"><label for="${fieldId}">${escapeHtml(f.label)}</label>
          <select id="${fieldId}" data-field="${f.key}">${f.options.map(o=>`<option value="${escapeHtml(o)}" ${o===f.value?'selected':''}>${escapeHtml(o)}</option>`).join('')}</select></div>`;
      }
      if(f.type === 'checkbox'){
        return `<div class="modal-field"><label class="paid-checkbox-label" for="${fieldId}"><input type="checkbox" id="${fieldId}" data-field="${f.key}" ${f.value?'checked':''}><span>${escapeHtml(f.label)}</span></label></div>`;
      }
      const extra = f.type === 'number' ? 'step="1" min="0"' : '';
      return `<div class="modal-field"><label for="${fieldId}">${escapeHtml(f.label)}</label><input type="${f.type}" id="${fieldId}" data-field="${f.key}" value="${valAttr}" ${extra}></div>`;
    }).join('');

    const overlay = document.getElementById('editModalOverlay');
    editModalLastFocus = document.activeElement;
    overlay.classList.add('show');

    const oldSave = document.getElementById('editModalSave');
    const newSave = oldSave.cloneNode(true);
    oldSave.replaceWith(newSave);
    const oldCancel = document.getElementById('editModalCancel');
    const newCancel = oldCancel.cloneNode(true);
    oldCancel.replaceWith(newCancel);

    newCancel.addEventListener('click', closeEditModal);
    newSave.addEventListener('click', ()=>{
      const values = {};
      fields.forEach(f=>{
        const el = container.querySelector(`[data-field="${f.key}"]`);
        if(f.type === 'checkbox') values[f.key] = el.checked;
        else if(f.type === 'number') values[f.key] = parseFloat(el.value);
        else values[f.key] = el.value;
      });
      closeEditModal();
      onSave(values);
    });

    const firstField = container.querySelector('input, select, textarea');
    // setTimeout(0): overlay je do malopre imao visibility:hidden (CSS transition), a fokusiranje
    // elementa unutar jos-nevidljivog roditelja nemo ne uspeva dok se stil ne preracuna
    // nakon classList.add('show'); odlaganje van trenutnog taska to resava pouzdano.
    setTimeout(()=> (firstField || newCancel).focus(), 0);
  }
  function closeEditModal(){
    document.getElementById('editModalOverlay').classList.remove('show');
    if(editModalLastFocus && typeof editModalLastFocus.focus === 'function') editModalLastFocus.focus();
    editModalLastFocus = null;
  }
  // Klik na tamnu pozadinu zatvara prozor samo ako je i pritisak misa bio na pozadini: kad se tekst u polju
  // selektuje prevlacenjem pa mis pusti van prozora, pregledac salje "click" pozadini — to ne sme da zatvori prozor.
  // Isto i obrnuto: pritisak na pozadini, pustanje u prozoru. Zatvara samo kad su i pritisak i pustanje na pozadini.
  let pointerDownOn = null, pointerUpOn = null;
  document.addEventListener('mousedown', e=>{ pointerDownOn = e.target; pointerUpOn = null; }, true);
  document.addEventListener('mouseup', e=>{ pointerUpOn = e.target; }, true);
  document.addEventListener('click', e=>{
    const el = e.target;
    const isOverlay = el && (el.classList.contains('modal-overlay') || /Overlay$/.test(el.id || ''));
    if(isOverlay && (pointerDownOn !== el || (pointerUpOn && pointerUpOn !== el))) e.stopImmediatePropagation();
    pointerDownOn = pointerUpOn = null;
  }, true);
  document.getElementById('editModalOverlay').addEventListener('click', (e)=>{
    if(e.target.id === 'editModalOverlay') closeEditModal();
  });

  // ---- Dijalozi u stilu aplikacije (umesto browserskih alert/confirm) ----
  // appConfirm vraca Promise<boolean>; appAlert Promise koji se razresi kad se dijalog zatvori.
  let dialogResolve = null, dialogLastFocus = null;
  function openDialog(title, message, opts){
    opts = opts || {};
    if(dialogResolve) dialogResolve(false);
    document.getElementById('dialogTitle').textContent = title;
    const body = document.getElementById('dialogBody');
    if(opts.html) body.innerHTML = message; else body.textContent = message;
    const ok = document.getElementById('dialogOk'), cancel = document.getElementById('dialogCancel');
    ok.textContent = opts.okText || 'U redu';
    ok.style.background = opts.danger ? 'var(--rust)' : '';
    cancel.style.display = opts.alertOnly ? 'none' : '';
    cancel.textContent = opts.cancelText || 'Otkaži';
    dialogLastFocus = document.activeElement;
    document.getElementById('dialogOverlay').classList.add('show');
    setTimeout(()=> ok.focus(), 0);
    return new Promise(res=>{ dialogResolve = res; });
  }
  function closeDialog(result){
    document.getElementById('dialogOverlay').classList.remove('show');
    const res = dialogResolve; dialogResolve = null;
    if(dialogLastFocus && typeof dialogLastFocus.focus === 'function') dialogLastFocus.focus();
    if(res) res(result);
  }
  const appConfirm = (message, opts) => openDialog((opts && opts.title) || 'Potvrda', message, opts);
  const appAlert = (message, opts) => openDialog((opts && opts.title) || 'Obaveštenje', message, Object.assign({ alertOnly: true }, opts));
  document.getElementById('dialogOk').addEventListener('click', ()=> closeDialog(true));
  document.getElementById('dialogCancel').addEventListener('click', ()=> closeDialog(false));
  document.getElementById('dialogOverlay').addEventListener('click', (e)=>{ if(e.target.id === 'dialogOverlay') closeDialog(false); });
  // Zadrzi fokus unutar modala dok je otvoren (Tab/Shift+Tab ne izlazi na pozadinu). Radi za bilo
  // koji .modal-overlay (editModalOverlay ili dayDetailOverlay), koji god je trenutno otvoren.
  document.addEventListener('keydown', (e)=>{
    if(e.key !== 'Tab') return;
    const open = document.querySelectorAll('.modal-overlay.show');
    const overlay = open[open.length - 1];
    if(!overlay) return;
    const focusables = Array.from(overlay.querySelectorAll('input, select, textarea, button'))
      .filter(el => !el.disabled && el.offsetParent !== null);
    if(focusables.length === 0) return;
    const first = focusables[0], last = focusables[focusables.length-1];
    if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  });
  document.addEventListener('keydown', (e)=>{
    if(e.key !== 'Escape') return;
    if(document.getElementById('dialogOverlay').classList.contains('show')){ closeDialog(false); return; }
    if(document.getElementById('editModalOverlay').classList.contains('show')){ closeEditModal(); return; }
    if(document.getElementById('finishShopOverlay').classList.contains('show')){ closeFinishPurchase(); return; }
    if(document.getElementById('payOverdueOverlay').classList.contains('show')){ closePayOverdue(); return; }
    if(document.getElementById('billOverlay').classList.contains('show')){ closeBillReview(false); return; }
    if(document.getElementById('receiptOverlay').classList.contains('show')){ closeReceipt(false); return; }
    if(document.getElementById('docOverlay').classList.contains('show')){ closeDocReview(false); return; }
    if(document.getElementById('ipsOverlay').classList.contains('show')){ closeIps(); return; }
    if(document.getElementById('dayDetailOverlay').classList.contains('show')){ closeDayDetail(); return; }
    if(document.getElementById('undoToast').classList.contains('show')){ dismissTopUndo(); }
  });
  // Ctrl+Z = "Poništi" iz poruke (vrh steka); u polju za tekst i u otvorenom prozoru pripada polju.
  const typingIn = el => { const tag = (el && el.tagName || '').toLowerCase(); return tag === 'input' || tag === 'textarea' || tag === 'select' || !!(el && el.isContentEditable); };
  function undoTop(){
    if(!undoStack.length) return false;
    const top = undoStack.pop();
    clearTimeout(top.timer);
    top.undoFn();
    renderUndoToast();
    return true;
  }
  if(IS_TEST) window.__undoTop = undoTop;
  document.addEventListener('keydown', (e)=>{
    if(!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || (e.key !== 'z' && e.key !== 'Z' && e.code !== 'KeyZ')) return;
    if(typingIn(e.target) || document.querySelector('.modal-overlay.show')) return;
    if(undoTop()) e.preventDefault();
  });
  // "?" = prozor sa precicama (samo desktop, tamo spisak ima smisla)
  function openShortcutsDialog(){
    const grid = document.querySelector('#desktopShortcuts .shortcut-grid');
    if(!grid) return;
    openDialog(t('Prečice na tastaturi'), `<div class="shortcut-grid">${grid.innerHTML}</div>`, { html: true, alertOnly: true, okText: t('Zatvori') });
  }
  if(IS_TEST) window.__openShortcuts = openShortcutsDialog;
  // Mac: Ctrl/Alt/Shift se prikazuju kao ⌘ ⌥ ⇧ (u spisku precica i u opisima dugmadi, npr. "Novi rashod (⌘N)")
  const isMacDesktop = document.documentElement.classList.contains('mac');
  function macKeyLabels(root){
    if(!isMacDesktop) return;
    (root || document).querySelectorAll('kbd').forEach(k=>{
      const map = { Ctrl: '⌘', Alt: '⌥', Shift: '⇧' };
      if(map[k.textContent]) k.textContent = map[k.textContent];
    });
    (root || document).querySelectorAll('[title*="Ctrl+"], [title*="Alt+"]').forEach(el=>{
      el.title = el.title.replace(/Ctrl\+Shift\+/g, '⇧⌘').replace(/Ctrl\+Alt\+/g, '⌥⌘').replace(/Ctrl\+/g, '⌘').replace(/Alt\+/g, '⌥');
    });
  }
  if(isMacDesktop){
    macKeyLabels();
    let macQueued = false;
    new MutationObserver(()=>{ if(macQueued) return; macQueued = true; requestAnimationFrame(()=>{ macQueued = false; macKeyLabels(); }); })
      .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['title'] });
    const al = document.getElementById('deskAutostartLabel');
    if(al) al.textContent = t('Pokreni automatski pri prijavi na Mac (tiho, u pozadini)');
  }
  // Dugmad samo sa ikonicom/znakom dobijaju aria-label iz title (citaci ekrana inace procitaju "✕").
  function labelIconButtons(root){
    (root || document).querySelectorAll('button[title]:not([aria-label])').forEach(b=>{
      if(b.textContent.trim().length <= 2) b.setAttribute('aria-label', b.getAttribute('title'));
    });
  }
  labelIconButtons();
  let labelQueued = false;
  new MutationObserver(()=>{
    if(labelQueued) return;
    labelQueued = true;
    requestAnimationFrame(()=>{ labelQueued = false; labelIconButtons(); });
  }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('keydown', (e)=>{
    if(e.key !== '?' || e.ctrlKey || e.altKey || e.metaKey || !window.desktop) return;
    if(typingIn(e.target) || document.querySelector('.modal-overlay.show')) return;
    e.preventDefault();
    openShortcutsDialog();
  });

  // ---- Animirano brisanje reda (fade pa tek onda ukloni iz podataka) ----
  // Dok red "iščezava" (180ms), bilo koji drugi renderAll() (npr. čekiranje drugog reda) inace
  // rekonstruiše ceo tbody/listu preko innerHTML i taj red se vrati "svež" bez klase row-removing.
  // pendingRemovalIds pamti koji id treba ponovo označiti kao "u brisanju" nakon SVAKOG render-a
  // dok tajmer traje — svaka render* funkcija ima data-row-id na svom red-wrapper elementu.
  const pendingRemovalIds = new Set();
  function reapplyPendingRemovalClass(){
    if(pendingRemovalIds.size === 0) return;
    document.querySelectorAll('[data-row-id]').forEach(el=>{
      if(pendingRemovalIds.has(el.dataset.rowId)) el.classList.add('row-removing');
    });
  }
  function animatedDelete(rowEl, deleteFn, undoMessage, undoFn){
    const rowId = rowEl && rowEl.dataset ? rowEl.dataset.rowId : null;
    if(rowEl){
      rowEl.classList.add('row-removing');
      if(rowId) pendingRemovalIds.add(rowId);
      setTimeout(()=>{
        if(rowId) pendingRemovalIds.delete(rowId);
        deleteFn();
        playDeleteSound();
        renderAll();
        showUndoToast(undoMessage, ()=>{ undoFn(); renderAll(); });
      }, 180);
    } else {
      deleteFn();
      playDeleteSound();
      renderAll();
      showUndoToast(undoMessage, ()=>{ undoFn(); renderAll(); });
    }
  }

  // ---- Zajednicki helperi za povezivanje dugmica na redu/kartici ----
  // 6 render* funkcija (prihodi/rashodi/ponavljajuce/ciljevi/dugovi/kategorije) ponavljaju istu
  // "nadji entitet po id-u -> otvori edit modal / animatedDelete+undo" logiku. Svaki NOVI ekran
  // tipa liste treba da koristi ove helpere umesto da kopira postojecu render* funkciju —
  // upravo je copy-paste pristup ranije proizveo tihe bugove (npr. newEntryId koji se resetuje
  // samo u renderExpenses, ne i u renderIncome).
  // Polje "Racun" u modalu za izmenu (samo kad postoje bar 2 racuna); vraca [] ili [polje]
  function accountEditField(currentId){
    if(accounts.length < 2) return [];
    return [{key:'account', label:'Račun', type:'select', value: accountName(currentId), options: accounts.map(a=>a.name)}];
  }
  function applySpreadEdit(e, vals){
    const n = Math.max(1, Math.min(60, parseInt(vals.spreadMonths, 10) || 1));
    if(n > 1){ e.spreadMonths = n; if(/^\d{4}-\d{2}$/.test(vals.spreadStart || '')) e.spreadStart = vals.spreadStart; else delete e.spreadStart; }
    else { delete e.spreadMonths; delete e.spreadStart; }
  }
  function applyAccountEdit(obj, vals){
    if(vals.account === undefined) return;
    const a = accounts.find(x=> x.name === vals.account);
    if(a) obj.accountId = a.id;
  }
  // Izmenjen iznos u RSD kod stavke u stranoj valuti: preracunaj iznos u valuti po istom kursu
  function applyAmountEdit(e, newAmount){
    if(e.currency && e.rate && newAmount !== e.amount) e.origAmount = Math.round(newAmount / e.rate * 100) / 100;
    e.amount = newAmount;
  }
  function wireEditButton(container, opts){
    container.querySelectorAll(opts.selector || '.edit-btn').forEach(b=>{
      b.addEventListener('click', ()=>{
        const entity = opts.find(b.dataset.id);
        if(!entity) return;
        openEditModal(opts.title, opts.buildFields(entity), (vals)=> opts.onSave(entity, vals));
      });
    });
  }
  function wireDeleteButton(container, opts){
    container.querySelectorAll(opts.selector || '.del-btn').forEach(b=>{
      b.addEventListener('click', ()=>{
        const entity = opts.find(b.dataset.id);
        const row = b.closest(opts.rowSelector);
        let deleteResult;
        animatedDelete(row,
          ()=>{ deleteResult = opts.onDelete(entity, b); },
          opts.undoLabel(entity),
          ()=> opts.onUndo(entity, deleteResult)
        );
      });
    });
  }
  function wireContributeButton(container, key, inputClass, onContribute){
    container.querySelectorAll('.goal-contribute .add').forEach(b=>{
      b.addEventListener('click', ()=>{
        const id = b.dataset[key];
        const input = container.querySelector(`.${inputClass}[data-${key}="${id}"]`);
        const val = parseFloat(input.value);
        if(isNaN(val) || val <= 0) return;
        onContribute(id, val);
      });
    });
  }

  document.getElementById('todayLine').textContent =
    new Date().toLocaleDateString(LOCALE, {weekday:'long', year:'numeric', month:'long', day:'numeric'});
  document.getElementById('incDate').value = toISODateLocal(new Date());
  document.getElementById('expDate').value = toISODateLocal(new Date());

  // ---- Tema ----
  function applyTheme(t, persist){
    document.body.setAttribute('data-theme', t);
    if(persist) localStorage.setItem(THEME_KEY, t);
    // Desktop: naslovna traka, Mica i sistemski dijalozi prate temu aplikacije
    if(window.desktop) window.desktop.setTheme(t, persist || !!localStorage.getItem(THEME_KEY));
  }
  function toggleTheme(){
    const cur = document.body.getAttribute('data-theme') || 'light';
    applyTheme(cur === 'dark' ? 'light' : 'dark', true);
    const iconBtn = document.getElementById('themeToggle');
    iconBtn.classList.remove('spin');
    void iconBtn.offsetWidth;
    iconBtn.classList.add('spin');
  }
  const storedTheme = localStorage.getItem(THEME_KEY);
  const systemDarkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  applyTheme(storedTheme || (systemDarkQuery && systemDarkQuery.matches ? 'dark' : 'light'), false);
  if(!storedTheme && systemDarkQuery){
    systemDarkQuery.addEventListener('change', (e)=>{
      if(!localStorage.getItem(THEME_KEY)) applyTheme(e.matches ? 'dark' : 'light', false);
    });
  }
  // ---- Jezik ----
  document.querySelectorAll('.lang-seg button').forEach(b=>{
    const on = b.dataset.lang === I18N.lang;
    b.classList.toggle('active', on); b.setAttribute('aria-checked', on);
    b.addEventListener('click', async ()=>{
      if(b.dataset.lang === I18N.lang) return;
      const lang = b.dataset.lang;
      try{ localStorage.setItem(I18N.LANG_KEY, lang); } catch(e){ /* ignorisano */ }
      if(window.desktop && window.desktop.setSetting){
        // Desktop: jezik pamti glavni program (meniji, datumi) i aplikacija se ponovo pokrece
        if(window.__desktopData) await window.__desktopData.saveNow();
        window.desktop.setSetting('lang', lang);
      } else location.reload();
    });
  });

  // ---- Bocni meni: skupljanje na ikonice (pamti se) ----
  const SIDEBAR_KEY = 'budzet-meni-skupljen-v1';
  function setSidebarCollapsed(on){
    document.documentElement.classList.toggle('sidebar-collapsed', on);
    const btn = document.getElementById('sidebarToggle');
    btn.setAttribute('aria-expanded', !on);
    btn.title = t(on ? 'Proširi bočni meni' : 'Skupi bočni meni') + ' (Ctrl+Alt+S)';
    btn.setAttribute('aria-label', t(on ? 'Proširi bočni meni' : 'Skupi bočni meni'));
    try{ localStorage.setItem(SIDEBAR_KEY, on ? '1' : ''); } catch(e){ /* ignorisano */ }
  }
  setSidebarCollapsed(localStorage.getItem(SIDEBAR_KEY) === '1');
  document.getElementById('sidebarToggle').addEventListener('click', ()=> setSidebarCollapsed(!document.documentElement.classList.contains('sidebar-collapsed')));
  document.addEventListener('keydown', (e)=>{
    if(e.ctrlKey && e.altKey && (e.key === 's' || e.key === 'S')){ e.preventDefault(); setSidebarCollapsed(!document.documentElement.classList.contains('sidebar-collapsed')); }
  });
  window.__toggleSidebar = ()=> setSidebarCollapsed(!document.documentElement.classList.contains('sidebar-collapsed'));

  const soundToggle = document.getElementById('soundToggle');
  soundToggle.checked = soundOn;
  soundToggle.addEventListener('change', ()=>{
    soundOn = soundToggle.checked;
    localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off');
    if(soundOn) playPaidSound();
  });
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  document.getElementById('settingsThemeToggle').addEventListener('click', toggleTheme);

  // ---- Ukupan mesecni budzet ----
  const monthlyBudgetInput = document.getElementById('monthlyBudgetInput');
  monthlyBudgetInput.value = monthlyBudget > 0 ? monthlyBudget : '';
  monthlyBudgetInput.addEventListener('change', ()=>{
    const val = parseFloat(monthlyBudgetInput.value);
    monthlyBudget = (!isNaN(val) && val > 0) ? val : 0;
    saveMonthlyBudget();
    invalidate(); renderBudgetSummary();
  });
  document.getElementById('rolloverToggle').addEventListener('change', (e)=>{
    envelopeState.rolloverEnabled = e.target.checked;
    // Prenos pocinje od tekuceg meseca (bez retroaktivnog obracuna)
    envelopeState.rollover = {};
    envelopeState.lastRolloverMonth = currentMonthKey();
    saveEnvelopeState();
    invalidate();
  });

