  // ---- Tabs ----
  function positionTabIndicator(btn){
    const indicator = document.getElementById('tabIndicator');
    if(!btn || !indicator) return;
    indicator.style.left = btn.offsetLeft + 'px';
    indicator.style.width = btn.offsetWidth + 'px';
  }
  // Grupe ekrana: glavni meni ima 9 stavki, a srodni ekrani su podmeni unutar grupe.
  const SCREEN_GROUPS = {
    pregled: [['pregled', 'Pregled']],
    transakcije: [['rashodi', 'Rashodi'], ['prihodi', 'Prihodi'], ['ponavljajuce', 'Ponavljajuće'], ['racuni', 'Računi i prenosi'], ['pretraga', 'Pretraga']],
    budzet: [['kategorije', 'Budžet i kategorije']],
    ciljevi: [['ciljevi', 'Ciljevi štednje'], ['dugovi', 'Dugovi i pozajmice']],
    izvestaji: [['analiza', 'Analiza'], ['prognoza', 'Prognoza'], ['godisnji', 'Godišnji troškovi'], ['pitaj', 'Pitaj'], ['rezije', 'Kućni računi'], ['izvestaj', 'Izveštaj za štampu'], ['uporedi', 'Uporedi'], ['scenario', 'Scenario „šta ako“']],
    kursevi: [['kursevi', 'Kursevi']],
    nabavka: [['nabavka', 'Nabavka']],
    dokumenti: [['dokumenti', 'Dokumenti']],
    podesavanja: [['podesavanja', 'Podešavanja']]
  };
  const groupOf = screen => Object.keys(SCREEN_GROUPS).find(g => SCREEN_GROUPS[g].some(([s]) => s === screen));
  const lastScreenInGroup = {};
  let activeScreen = 'pregled';
  // Iscrtavanje po ekranu — posle izmene se odmah crta samo vidljivi ekran, ostali pri otvaranju.
  const SCREEN_RENDER = {
    pregled: ()=>{ renderDocReminders(); renderForecastCard(); renderPregledStart(); renderMonthReview(); renderHealthScore(); renderEnvelopesPanel(); renderAccountsOverview(); renderPregled(); },
    prihodi: ()=> renderIncome(),
    rashodi: ()=> renderExpenses(),
    racuni: ()=> renderAccounts(),
    pretraga: ()=> renderSearch(),
    kategorije: ()=> renderCategories(),
    ponavljajuce: ()=> renderRecurring(),
    ciljevi: ()=> renderGoals(),
    dugovi: ()=> renderDebts(),
    analiza: ()=> renderAnaliza(),
    prognoza: ()=> renderForecast(),
    godisnji: ()=> renderYearly(),
    rezije: ()=> renderRezije(),
    pitaj: ()=> renderAsk(),
    izvestaj: ()=> renderReport(),
    uporedi: ()=> setCompareMode(compareMode),
    scenario: ()=>{ if(scenarioActive) renderScenario(); },
    kursevi: ()=> renderRatesScreen(),
    nabavka: ()=> renderShopping(),
    dokumenti: ()=> renderDocuments(),
    podesavanja: ()=>{ renderBillSettings(); renderAiSettings(); renderTgSettings(); renderPaydaySettings(); }
  };
  const dirtyScreens = new Set(Object.keys(SCREEN_RENDER));
  function invalidate(){
    renderSummary();
    Object.keys(SCREEN_RENDER).forEach(s=>{ if(s !== activeScreen) dirtyScreens.add(s); });
    updateTabBadges();
    scheduleExcelWrite();
  }
  function renderScreen(name){
    dirtyScreens.delete(name);
    SCREEN_RENDER[name]();
  }
  // Stepenasti ulaz panela Pregleda — samo kad se ekran otvori, ne pri svakom osvezavanju
  function playPregledStagger(){
    const el = document.getElementById('screen-pregled');
    el.classList.remove('stagger-in');
    void el.offsetWidth;
    el.classList.add('stagger-in');
    clearTimeout(playPregledStagger.t);
    playPregledStagger.t = setTimeout(()=> el.classList.remove('stagger-in'), 700);
  }
  function showScreen(name){
    if(!SCREEN_RENDER[name]) name = 'pregled';
    if(name === 'pregled' && activeScreen !== 'pregled') playPregledStagger();
    const group = groupOf(name);
    activeScreen = name;
    lastScreenInGroup[group] = name;
    const groupBtn = document.querySelector(`nav.tabs button[data-group="${group}"] .tab-label`);
    if(groupBtn) document.getElementById('screenTitle').textContent = groupBtn.textContent;
    document.querySelectorAll('nav.tabs button').forEach(b=> b.classList.toggle('active', b.dataset.group === group));
    document.querySelectorAll('.screen').forEach(s=> s.classList.toggle('active', s.id === 'screen-' + name));
    const sub = document.getElementById('subtabs');
    const items = SCREEN_GROUPS[group];
    sub.style.display = items.length > 1 ? 'flex' : 'none';
    sub.innerHTML = items.length > 1 ? items.map(([s, label])=> `<button data-screen="${s}" class="${s === name ? 'active' : ''}">${label}${s === 'rashodi' ? '<span class="tab-badge" id="rashodiSubBadge" style="display:none;"></span>' : ''}${s === 'ponavljajuce' ? '<span class="tab-badge" id="ponavljajuceSubBadge" style="display:none;"></span>' : ''}</button>`).join('') : '';
    sub.querySelectorAll('button').forEach(b=> b.addEventListener('click', ()=> showScreen(b.dataset.screen)));
    positionTabIndicator(document.querySelector('nav.tabs button.active'));
    if(dirtyScreens.has(name) || name === 'pretraga' || name === 'izvestaj' || name === 'uporedi' || name === 'pitaj') renderScreen(name); // pitaj: kljuc je mozda upisan u Podesavanjima
    updateTabBadges();
    requestAnimationFrame(updateTableScrollFades);
    updateMobileFab(name);
    const isIncome = name === 'prihodi';
    document.getElementById('newEntryLabel').textContent = isIncome ? 'Novi prihod' : 'Novi rashod';
    document.getElementById('newEntryBtn').title = isIncome ? 'Novi prihod (Ctrl+Shift+N)' : 'Novi rashod (Ctrl+N)';
  }
  if(IS_TEST) window.__showScreen = showScreen;
  // Novi unos: u desktop aplikaciji uvek kroz prozor za unos; u browseru forma na ekranu
  const usePopoutEntry = () => !!(window.desktop && window.desktop.quick && window.desktop.quick.open);
  function openNewEntry(type){
    type = type || (activeScreen === 'prihodi' ? 'income' : 'expense');
    if(usePopoutEntry()){ window.desktop.quick.open(type); return; }
    showScreen(type === 'income' ? 'prihodi' : 'rashodi');
    const el = document.getElementById(type === 'income' ? 'incDesc' : 'expDesc');
    setTimeout(()=>{ el.scrollIntoView({behavior:'smooth', block:'center'}); el.focus({preventScroll:true}); }, 60);
  }
  if(IS_TEST) window.__openNewEntry = openNewEntry;
  document.getElementById('newEntryBtn').addEventListener('click', ()=> openNewEntry());
  document.querySelectorAll('nav.tabs button').forEach(btn=>{
    btn.addEventListener('click', ()=> showScreen(lastScreenInGroup[btn.dataset.group] || SCREEN_GROUPS[btn.dataset.group][0][0]));
  });
  window.addEventListener('resize', ()=> positionTabIndicator(document.querySelector('nav.tabs button.active')));
  requestAnimationFrame(()=> positionTabIndicator(document.querySelector('nav.tabs button.active')));

  // ---- Precica "/" za fokus na glavno polje za unos aktivnog ekrana ----
  const QUICK_FOCUS_BY_SCREEN = {
    prihodi: 'incDesc', rashodi: 'expDesc', kategorije: 'newCatInput',
    ponavljajuce: 'recDesc', ciljevi: 'goalName', pretraga: 'searchInput', nabavka: 'shopQuickInput'
  };
  document.addEventListener('keydown', (e)=>{
    if(e.key !== '/') return;
    const tag = (e.target.tagName || '').toLowerCase();
    if(tag === 'input' || tag === 'select' || tag === 'textarea') return;
    const activeScreen = document.querySelector('.screen.active');
    if(!activeScreen) return;
    const screenName = activeScreen.id.replace('screen-', '');
    const targetId = QUICK_FOCUS_BY_SCREEN[screenName];
    if(!targetId) return;
    e.preventDefault();
    if((screenName === 'rashodi' || screenName === 'prihodi') && usePopoutEntry()){ openNewEntry(screenName === 'prihodi' ? 'income' : 'expense'); return; }
    const el = document.getElementById(targetId);
    if(el) el.focus();
  });

  // ---- Plutajuce dugme za brz unos na mobilnom ----
  function updateMobileFab(screenName){
    const fab = document.getElementById('mobileFab');
    fab.classList.toggle('show', !!QUICK_FOCUS_BY_SCREEN[screenName]);
  }
  document.getElementById('mobileFab').addEventListener('click', ()=>{
    const activeScreen = document.querySelector('.screen.active');
    if(!activeScreen) return;
    const screenName = activeScreen.id.replace('screen-', '');
    const targetId = QUICK_FOCUS_BY_SCREEN[screenName];
    if(!targetId) return;
    if((screenName === 'rashodi' || screenName === 'prihodi') && usePopoutEntry()){ openNewEntry(screenName === 'prihodi' ? 'income' : 'expense'); return; }
    const el = document.getElementById(targetId);
    if(!el) return;
    el.scrollIntoView({behavior:'smooth', block:'center'});
    setTimeout(()=> el.focus(), 300);
  });
  updateMobileFab('pregled');

