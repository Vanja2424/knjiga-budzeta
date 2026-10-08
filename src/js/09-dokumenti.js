  // ---------- Dokumenti: garancije i dokumenti sa rokom (prilozi, AI citanje, podsetnici, obnova) ----------
  const dEl = id => document.getElementById(id);
  let docFilter = 'all';
  let docReview = null; // { doc (izmena) | null, files: [{ name?, prep?, label }], removed: [imena], entryId?, resolve }
  let fakeDocReading = null; // test: req -> { ok, content }
  if(IS_TEST) Object.defineProperty(window, '__fakeDocReading', { get: ()=> fakeDocReading, set: v=>{ fakeDocReading = v; }, configurable: true });
  const docToday = ()=> toISODateLocal(new Date());
  const docGroupsAll = ()=> [...new Set(C.DOC_GROUPS.concat(documents.map(d=> d.group)).filter(Boolean))];
  const fmtDocDate = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(LOCALE, { day: 'numeric', month: 'numeric', year: 'numeric' }); };
  function docStatusLabel(doc){
    const st = C.documentStatus(doc, docToday()), exp = C.documentExpiry(doc);
    if(st.state === 'none') return { st, text: t('bez roka') };
    if(st.state === 'expired') return { st, text: t('isteklo pre {0} dana', -st.days) };
    if(st.state === 'soon') return { st, text: st.days === 0 ? t('ističe danas') : t('ističe za {0} dana', st.days) };
    return { st, text: t('važi do {0}', fmtDocDate(exp)) };
  }
  function renderDocuments(){
    document.querySelectorAll('.doc-filter-btn').forEach(b=> b.classList.toggle('active', b.dataset.f === docFilter));
    const rank = { expired: 0, soon: 1, ok: 2, none: 3 };
    const list = documents.filter(d=> docFilter === 'all' || d.kind === docFilter).map(d=> Object.assign({ d }, docStatusLabel(d)))
      .sort((a, b)=> rank[a.st.state] - rank[b.st.state] || (a.st.days || 0) - (b.st.days || 0) || a.d.title.localeCompare(b.d.title));
    dEl('docList').innerHTML = list.length ? list.map(x=> `<div class="doc-row doc-${x.st.state}" data-id="${x.d.id}" data-row-id="${x.d.id}" tabindex="0">
        <div class="doc-main"><b translate="no">${escapeHtml(x.d.title)}</b><span class="hint" translate="no">${escapeHtml([x.d.group, x.d.vendor].filter(Boolean).join(' · '))}</span></div>
        <span class="doc-badge">${escapeHtml(x.text)}</span>
        ${x.d.files.length && window.desktop ? `<button type="button" class="att-btn doc-att" title="${escapeHtml(t('Otvori prilog'))}">📎</button>` : x.d.fiscalUrl ? `<button type="button" class="att-btn doc-fiscal" title="${escapeHtml(t('Otvori račun na sajtu Poreske uprave'))}">🧾</button>` : '<span></span>'}
        ${x.d.kind === 'dokument' && C.documentExpiry(x.d) ? `<button type="button" class="btn-secondary doc-renew">${escapeHtml(t('Obnovi'))}</button>` : '<span></span>'}
      </div>`).join('') : `<div class="hint" style="padding:1em 0;">${escapeHtml(t('Još nema dokumenata. Dodaj garanciju, registraciju, polisu…'))}</div>`;
  }
  dEl('docList').addEventListener('click', e=>{
    const row = e.target.closest('.doc-row'); if(!row) return;
    const doc = documents.find(d=> d.id === row.dataset.id); if(!doc) return;
    if(e.target.closest('.doc-att')){ window.desktop.bills.openFile(doc.files[0]).then(r=>{ if(!r || !r.ok) appAlert(t('Prilog nije pronađen u folderu Prilozi.')); }); return; }
    if(e.target.closest('.doc-renew')){ renewDocumentNow(doc.id); return; }
    if(e.target.closest('.doc-fiscal')){ const url = C.fiscalUrlFrom(doc.fiscalUrl); if(url) window.open(url); return; }
    openDocReview({ doc });
  });
  // Enter/razmak na redu (ne na dugmetu u redu) otvara zapis kao klik
  const docRowKey = e=>{
    if((e.key !== 'Enter' && e.key !== ' ') || !e.target.classList || !e.target.classList.contains('doc-row')) return;
    e.preventDefault(); e.target.click();
  };
  dEl('docList').addEventListener('keydown', docRowKey);
  document.querySelectorAll('.doc-filter-btn').forEach(b=> b.addEventListener('click', ()=>{ docFilter = b.dataset.f; renderDocuments(); }));
  dEl('docAddBtn').addEventListener('click', ()=> dEl('docAddInput').click());
  dEl('docAddInput').addEventListener('change', e=>{ const f = [...e.target.files]; e.target.value = ''; if(f.length) addDocFiles(f); });

  function docKindChanged(){ dEl('docRenewBox').style.display = dEl('docKind').value === 'dokument' ? '' : 'none'; }
  function docGroupChanged(){
    const personal = C.foldText(dEl('docGroup').value) === C.foldText('Lična dokumenta');
    dEl('docNoAiHint').style.display = personal ? '' : 'none';
    if(personal) dEl('docNoAi').checked = true;
  }
  function renderDocFiles(){
    const files = docReview ? docReview.files : [];
    dEl('docFiles').innerHTML = files.map((f, i)=> `<div class="doc-file" data-i="${i}"><span translate="no">${escapeHtml(f.label || f.name || '')}</span><button type="button" class="del-btn doc-file-del" aria-label="${escapeHtml(t('Ukloni prilog'))}">×</button></div>`).join('');
    const first = files.find(f=> f.prep && f.prep.images && f.prep.images[0]);
    dEl('docPreview').innerHTML = first ? `<img src="${first.prep.images[0]}" alt="${escapeHtml(t('Pregled dokumenta'))}">` : `<div class="hint" style="padding:2em;">${escapeHtml(files.length ? t('Prilog je sačuvan; pregled nije dostupan.') : t('Nema priloga.'))}</div>`;
  }
  dEl('docFiles').addEventListener('click', e=>{
    const b = e.target.closest('.doc-file-del'); if(!b || !docReview) return;
    const i = +b.closest('.doc-file').dataset.i, f = docReview.files[i];
    if(f && f.name) docReview.removed.push(f.name);
    docReview.files.splice(i, 1); renderDocFiles();
  });
  function fillDocForm(d){
    dEl('docKind').value = d.kind || 'garancija';
    dEl('docGroup').value = d.group || ''; dEl('docTitle').value = d.title || '';
    dEl('docIssued').value = d.issued || ''; dEl('docMonths').value = d.warrantyMonths || '';
    dEl('docExpires').value = d.expires || ''; dEl('docRemind').value = d.remindDays != null ? d.remindDays : 30;
    dEl('docVendor').value = d.vendor || ''; dEl('docNotes').value = d.notes || '';
    const r = d.renewal || {};
    dEl('docRenewAmount').value = r.amount || ''; dEl('docRenewMonths').value = r.months || 12;
    dEl('docRenewCat').innerHTML = expenseCats.map(c=> `<option value="${escapeHtml(c)}"${c === (r.category || (expenseCats.includes('Prevoz') ? 'Prevoz' : expenseCats[0])) ? ' selected' : ''} translate="no">${escapeHtml(c)}</option>`).join('');
    dEl('docGroupList').innerHTML = docGroupsAll().map(g=> `<option value="${escapeHtml(g)}">`).join('');
    ['docTitle', 'docIssued', 'docExpires'].forEach(id=> dEl(id).classList.remove('bill-low'));
    docKindChanged(); docGroupChanged();
  }
  function openDocReview(opts){
    const doc = opts.doc || null, pre = opts.prefill || {};
    docReview = { doc, files: (doc ? doc.files : (pre.files || [])).map(n=> ({ name: n, label: n })), removed: [], entryId: doc ? doc.entryId : pre.entryId, fiscalUrl: doc ? doc.fiscalUrl : pre.fiscalUrl, resolve: null };
    dEl('docDlgTitle').textContent = doc ? t('Izmeni zapis') : t('Novi zapis');
    dEl('docNoAi').checked = false;
    fillDocForm(doc || Object.assign({ kind: 'garancija', remindDays: 30 }, pre));
    dEl('docStatus').textContent = '';
    dEl('docDelete').style.display = doc ? '' : 'none';
    renderDocFiles();
    dEl('docOverlay').classList.add('show');
    return new Promise(res=>{ docReview.resolve = res; });
  }
  function closeDocReview(saved){
    if(!saved && docReview && docReview.saving) return; // cuvanje u toku (prilozi se upisuju) — prozor se zatvara sam kad zavrsi
    dEl('docOverlay').classList.remove('show'); const r = docReview && docReview.resolve; docReview = null; if(r) r(!!saved);
  }
  // AI: procitaj fajl (ako prekidac dozvoljava) i popuni prazna polja
  async function readDocFile(prep, st){
    if(dEl('docNoAi').checked || prep.error || !(fakeDocReading || (window.desktop && window.desktop.bills))) return;
    dEl('docStatus').textContent = t('Čitam dokument…');
    const req = { images: prep.images, text: prep.text, prompt: C.documentPrompt(C.DOC_GROUPS) }; // korisnikove grupe ostaju lokalno
    let res;
    try{ res = fakeDocReading ? await fakeDocReading(req) : await window.desktop.bills.read(req); }
    catch(e){ res = { ok: false, kind: 'http', message: String(e && e.message || e) }; }
    if(docReview !== st) return;
    if(!res || !res.ok){ dEl('docStatus').textContent = (BILL_ERR[res && res.kind] || BILL_ERR.http)(res || {}); return; }
    const r = C.cleanDocumentReading(res.content, docGroupsAll());
    if(!r){ dEl('docStatus').textContent = t('Dokument nije pročitan — popuni podatke ručno.'); return; }
    const fill = (id, v)=>{ if(v && !dEl(id).value) dEl(id).value = v; };
    if(!st.doc) dEl('docKind').value = r.kind;
    fill('docTitle', r.title); fill('docGroup', r.group); fill('docIssued', r.issued); fill('docExpires', r.expires); fill('docVendor', r.vendor);
    if(r.warrantyMonths) fill('docMonths', String(r.warrantyMonths));
    [['docTitle', 'title'], ['docIssued', 'issued'], ['docExpires', 'expires']].forEach(([id, k])=> dEl(id).classList.toggle('bill-low', r.low.includes(k) || !dEl(id).value && k !== 'issued'));
    docKindChanged(); docGroupChanged();
    dEl('docStatus').textContent = t('Pročitano sa slike (AI) — proveri podatke.');
  }
  const docAiAvailable = ()=> !!(fakeDocReading || (window.desktop && window.desktop.bills));
  function setDocBusy(st, d){
    st.busy = Math.max(0, (st.busy || 0) + d);
    if(docReview !== st) return;
    dEl('docSave').disabled = st.busy > 0;
    const unread = st.files.some(f=> f.prep && !f.prep.error && !f.read);
    dEl('docReadAi').style.display = !st.busy && unread && docAiAvailable() ? '' : 'none';
  }
  // fajlovi se samo pripreme (pregled, prilog); AI cita tek na "Procitaj AI-jem" — da licni dokument ne ode pre prekidaca
  async function addFilesToDocReview(files){
    const st = docReview; if(!st) return;
    setDocBusy(st, +1);
    try{
      for(const f of files){
        const prep = await prepareBillFile(f);
        if(docReview !== st) return;
        st.files.push({ prep, label: f.name || t('prilog') });
        renderDocFiles();
        if(prep.error) dEl('docStatus').textContent = prep.error;
      }
      if(docReview === st && st.files.some(f=> f.prep && !f.prep.error && !f.read) && docAiAvailable())
        dEl('docStatus').textContent = t('Klikni „Pročitaj AI-jem“ da se podaci popune sami, ili ih upiši ručno.');
    } finally { setDocBusy(st, -1); }
  }
  dEl('docReadAi').addEventListener('click', async ()=>{
    const st = docReview; if(!st || st.busy) return;
    if(dEl('docNoAi').checked){ dEl('docStatus').textContent = t('Prekidač „Ne šalji ovaj fajl AI-ju“ je uključen — fajl nije poslat.'); return; }
    setDocBusy(st, +1);
    try{
      for(const f of st.files){
        if(!f.prep || f.prep.error || f.read) continue;
        if(docReview !== st || dEl('docNoAi').checked) break;
        f.read = true;
        await readDocFile(f.prep, st);
      }
    } finally { setDocBusy(st, -1); }
  });
  function addDocFiles(files){
    const p = openDocReview({});
    addFilesToDocReview(Array.from(files || []));
    return p;
  }
  if(IS_TEST) window.__addDocFiles = addDocFiles;
  if(IS_TEST) window.__openDocReview = opts => openDocReview(opts || {});
  dEl('docAddFile').addEventListener('click', ()=> dEl('docFileInput').click());
  dEl('docFileInput').addEventListener('change', e=>{ const f = [...e.target.files]; e.target.value = ''; if(f.length) addFilesToDocReview(f); });
  dEl('docKind').addEventListener('change', docKindChanged);
  dEl('docGroup').addEventListener('input', docGroupChanged);
  ['docTitle', 'docIssued', 'docExpires'].forEach(id=> dEl(id).addEventListener('input', ()=> dEl(id).classList.remove('bill-low')));
  dEl('docCancel').addEventListener('click', ()=> closeDocReview(false));
  dEl('docOverlay').addEventListener('click', e=>{ if(e.target.id === 'docOverlay') closeDocReview(false); });
  dEl('docDelete').addEventListener('click', ()=>{ const d = docReview && docReview.doc; if(!d || docReview.saving) return; closeDocReview(false); deleteDocument(d.id); });
  dEl('docSave').addEventListener('click', async ()=>{
    const st = docReview; if(!st || st.busy) return;
    const title = dEl('docTitle').value.trim();
    if(!title){ dEl('docStatus').textContent = t('Upiši naziv.'); dEl('docTitle').classList.add('bill-low'); return; }
    dEl('docSave').disabled = true;
    st.saving = true;
    const kind = dEl('docKind').value;
    const base = { id: st.doc ? st.doc.id : newId(), kind, title, group: dEl('docGroup').value.trim() || 'Ostalo',
      issued: dEl('docIssued').value || undefined, expires: dEl('docExpires').value || undefined, warrantyMonths: parseInt(dEl('docMonths').value, 10) || undefined,
      vendor: dEl('docVendor').value.trim(), notes: dEl('docNotes').value.trim(), remindDays: dEl('docRemind').value === '' ? 30 : parseInt(dEl('docRemind').value, 10),
      history: st.doc ? st.doc.history : undefined, entryId: st.entryId, fiscalUrl: st.fiscalUrl };
    if(kind === 'dokument' && (parseFloat(dEl('docRenewAmount').value) > 0 || parseInt(dEl('docRenewMonths').value, 10) !== 12))
      base.renewal = { amount: parseFloat(dEl('docRenewAmount').value) || 0, category: dEl('docRenewCat').value, months: parseInt(dEl('docRenewMonths').value, 10) || 12 };
    const names = [];
    for(let i = 0; i < st.files.length; i++){
      const f = st.files[i];
      if(f.name){ names.push(f.name); continue; }
      if(f.prep && f.prep.bytes && window.desktop && window.desktop.bills){
        const res = await window.desktop.bills.saveFile(f.prep.bytes, `${docToday()}-dokument-${billSlug(title)}-${i + 1}.${f.prep.ext}`);
        if(res && res.ok) names.push(res.name);
      }
    }
    base.files = names;
    const clean = C.cleanDocuments([base])[0];
    st.saving = false;
    const current = docReview === st; // za svaki slucaj: drugi prozor otvoren u medjuvremenu se ne dira
    if(current) dEl('docSave').disabled = false;
    if(!clean){ if(current) dEl('docStatus').textContent = t('Zapis nije sačuvan.'); return; }
    const sharedNames = new Set(entries.flatMap(e=> e.attachments || []).concat(documents.filter(d=> d.id !== clean.id).flatMap(d=> d.files)));
    if(window.desktop && window.desktop.bills) st.removed.filter(n=> !sharedNames.has(n) && !clean.files.includes(n)).forEach(n=> window.desktop.bills.deleteFile(n));
    documents = documents.filter(d=> d.id !== clean.id).concat(clean);
    saveDocuments();
    if(current) closeDocReview(true); else if(st.resolve) st.resolve(true);
    renderAll();
  });
  if(IS_TEST) window.__saveDocumentRaw = obj => { const d = C.cleanDocuments([Object.assign({ id: newId(), files: [] }, obj)])[0]; if(!d) return null; documents = documents.filter(x=> x.id !== d.id).concat(d); saveDocuments(); renderAll(); return d.id; };
  if(IS_TEST) window.__documents = ()=> documents;
  function deleteDocument(id, opts){
    const d = documents.find(x=> x.id === id); if(!d) return;
    const run = ()=>{
      documents = documents.filter(x=> x.id !== id); saveDocuments();
      const shared = new Set(entries.flatMap(e=> e.attachments || []).concat(documents.flatMap(x=> x.files)));
      const own = d.files.filter(n=> !shared.has(n));
      if(window.desktop && window.desktop.bills) own.forEach(n=> window.desktop.bills.deleteFile(n));
      renderAll();
      showUndoToast(t('Obrisan zapis: {0}', d.title), ()=>{
        documents = documents.concat(d); saveDocuments();
        if(window.desktop && window.desktop.bills) own.forEach(n=> window.desktop.bills.restoreFile(n).then(r=>{
          if(r && r.ok && r.name && r.name !== n){ d.files = d.files.map(x=> x === n ? r.name : x); saveDocuments(); }
        }));
        renderAll();
      });
    };
    if(opts && opts.confirm === false) return run();
    appConfirm(t('Obrisati „{0}“? Prilozi idu u Prilozi/.obrisano i trajno se brišu posle 30 dana.', d.title), { okText: t('Obriši'), danger: true }).then(ok=>{ if(ok) run(); });
  }
  if(IS_TEST) window.__deleteDocument = deleteDocument;
  function renewDocumentNow(id){
    const d = documents.find(x=> x.id === id); if(!d) return;
    const nd = C.renewDocument(d, docToday());
    let entry = null;
    if(d.renewal && d.renewal.amount > 0){
      entry = { id: newId(), type: 'expense', desc: t('Obnova: {0}', d.title), amount: d.renewal.amount, category: d.renewal.category || expenseCats[0], date: docToday(), paid: true, tags: [] };
      if(accounts.length) entry.accountId = defaultAccountId();
      entries.push(entry); saveEntries();
      nd.history[nd.history.length - 1].entryId = entry.id;
    }
    documents = documents.map(x=> x.id === id ? nd : x); saveDocuments(); renderAll();
    showUndoToast(t('Obnovljeno: {0} — važi do {1}', d.title, fmtDocDate(nd.expires)), ()=>{
      documents = documents.map(x=>{
        if(x.id !== id) return x;
        const back = Object.assign({}, x);
        if(d.expires) back.expires = d.expires; else delete back.expires;
        if(d.history) back.history = d.history; else delete back.history;
        return back;
      });
      saveDocuments();
      if(entry){ entries = entries.filter(e=> e.id !== entry.id); saveEntries(); }
      renderAll();
    });
  }
  if(IS_TEST) window.__renewDocument = renewDocumentNow;
  // Pregled: "Uskoro istice" (uskoro + istekli u poslednjih 30 dana)
