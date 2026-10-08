  // ---------- Telegram bot: podesavanja (token i petlja su u glavnom procesu) ----------
  const tgEl = id => document.getElementById(id);
  const TG_STATE = { notoken: ()=> t('Token nije upisan.'), off: ()=> t('Bot je isključen.'), running: ()=> t('Radi.'), offline: ()=> t('Nema veze sa Telegramom — pokušavam ponovo.'),
    conflict: ()=> t('Isti bot radi na drugom računaru — ugasi ga tamo (isključi bota u Podešavanjima ili zatvori aplikaciju), pa ovde nastavlja sam. Dok rade oba, poruke se dele između računara.'), badToken: ()=> t('Token ne važi — proveri ga u @BotFather.') };
  let tgPairTimer = null;
  function renderTgStatus(st){
    if(!st) return;
    tgEl('tgToken').value = ''; tgEl('tgToken').placeholder = st.set ? t('upisan (…{0})', st.last4) : t('nije upisan');
    tgEl('tgOn').checked = st.on;
    ['tgPair', 'tgOn'].forEach(id=> { tgEl(id).disabled = !st.set; });
    tgEl('tgUnlink').style.display = st.linked ? '' : 'none';
    const parts = [];
    if(st.pairCode) parts.push(t('Pošalji botu {0} kod: {1} (važi još {2} min).', st.botName ? '@' + st.botName : '', st.pairCode, Math.max(1, Math.ceil((st.pairUntil - Date.now()) / 60000))));
    else if(st.linked && st.chatTitle) parts.push(t('Povezan sa grupom „{0}“ ({1}).', st.chatTitle, st.botName ? '@' + st.botName : t('botom')));
    else if(st.linked) parts.push(t('Povezan sa {0}.', st.botName ? '@' + st.botName : t('botom')));
    else if(st.set) parts.push(t('Nije povezan — klikni „Poveži Telegram“.'));
    if(TG_STATE[st.state] && (st.state !== 'running' || !st.linked)) parts.push(TG_STATE[st.state]());
    if(st.set && !(document.getElementById('deskCloseToTray') || {}).checked) parts.push(t('Zatvaranje prozora gasi aplikaciju, pa i bota — uključi „Zatvaranje prozora ostavlja aplikaciju u system tray-u“.'));
    if(st.encryption === false) parts.push(t('Šifrovanje ključa nije dostupno na ovom računaru, pa ključ ne može da se sačuva.'));
    tgEl('tgStatus').textContent = parts.join(' ');
    clearTimeout(tgPairTimer);
    if(st.pairCode) tgPairTimer = setTimeout(async ()=> renderTgStatus(await window.desktop.telegram.status()), 30000);
  }
  async function renderTgSettings(){
    const box = tgEl('tgSettings');
    if(!(window.desktop && window.desktop.telegram)){ box.style.display = 'none'; return; }
    box.style.display = '';
    renderTgStatus(await window.desktop.telegram.status());
  }
  if(window.desktop && window.desktop.telegram){
    window.desktop.telegram.onStatus(st=> renderTgStatus(st));
    tgEl('tgTokenSave').addEventListener('click', async ()=>{ const v = tgEl('tgToken').value.trim(); if(!v) return; tgEl('tgStatus').textContent = t('Proveravam…'); renderTgStatus(await window.desktop.telegram.setToken(v)); });
    tgEl('tgTokenClear').addEventListener('click', async ()=> renderTgStatus(await window.desktop.telegram.setToken('')));
    tgEl('tgPair').addEventListener('click', async ()=> renderTgStatus(await window.desktop.telegram.pair()));
    tgEl('tgUnlink').addEventListener('click', async ()=>{ if(await appConfirm(t('Prekinuti vezu sa Telegramom? Bot više neće primati tvoje poruke dok ga ponovo ne povežeš.'))) renderTgStatus(await window.desktop.telegram.unlink()); });
    tgEl('tgOn').addEventListener('change', async e=> renderTgStatus(await window.desktop.telegram.setOn(e.target.checked)));
  }

