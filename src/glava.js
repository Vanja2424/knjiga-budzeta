  // Desktop aplikacija (Electron): oznaci <html> pre prvog iscrtavanja da ne bi bilo "skoka" rasporeda.
  if(window.desktop){
    document.documentElement.classList.add('desktop');
    if(window.desktop.info && window.desktop.info.mica) document.documentElement.classList.add('mica');
    if(window.desktop.info && window.desktop.info.platform === 'darwin') document.documentElement.classList.add('mac');
  }

  // Desktop: svi podaci zive u jednom fajlu (Documents\Knjiga budzeta\podaci.json) umesto u
  // browserskom skladistu. Ostatak app-a i dalje koristi localStorage.getItem/setItem — ovde se
  // "localStorage" zamenjuje objektom istog oblika koji cita iz fajla pri startu i upisuje u fajl
  // ~300ms posle svake izmene (i odmah pri zatvaranju). Pravi localStorage se i dalje azurira kao
  // rezervni primerak (npr. za povratak na stariju verziju), ali vise nije izvor podataka.
  if(window.desktop && window.desktop.data){
    (function(){
      const real = window.localStorage;
      const map = new Map();
      const res = window.desktop.data.load();
      if(res.ok && res.data){
        Object.keys(res.data).forEach(k=>{
          const v = res.data[k];
          map.set(k, typeof v === 'string' ? v : JSON.stringify(v));
        });
      } else {
        // Prvi start nove verzije (nema fajla): preuzmi sve dosadasnje podatke iz browserskog skladista.
        for(let i = 0; i < real.length; i++){ const k = real.key(i); map.set(k, real.getItem(k)); }
      }
      // U fajlu su JSON vrednosti (nizovi/objekti) upisane kao pravi JSON da bi fajl bio citljiv;
      // obicne tekstualne vrednosti ostaju tekst.
      function serialize(){
        const out = {};
        map.forEach((v, k)=>{
          let parsed = null;
          if(v && (v[0] === '{' || v[0] === '[')){ try{ parsed = JSON.parse(v); } catch(e){ parsed = null; } }
          out[k] = (parsed && typeof parsed === 'object') ? parsed : v;
        });
        return out;
      }
      let dirty = false, timer = null;
      const status = { savedAt: res.savedAt || null, error: null, warning: res.warning || null, path: res.path };
      const emit = ()=> window.dispatchEvent(new CustomEvent('desktop-data-status', { detail: status }));
      async function saveNow(){
        clearTimeout(timer);
        if(!dirty) return;
        dirty = false;
        try{ status.savedAt = await window.desktop.data.save(serialize()); status.error = null; }
        catch(err){ dirty = true; status.error = String(err && err.message || err); timer = setTimeout(saveNow, 5000); }
        emit();
      }
      function flushSync(){
        clearTimeout(timer);
        if(!dirty) return true;
        const r = window.desktop.data.saveSync(serialize());
        if(r && r.ok){ dirty = false; status.savedAt = r.savedAt; status.error = null; return true; }
        status.error = r && r.error;
        return false;
      }
      function changed(){ dirty = true; clearTimeout(timer); timer = setTimeout(saveNow, 300); }
      const mirror = (fn)=>{ try{ fn(); } catch(e){ /* rezervni primerak moze da prekoraci kvotu — nebitno */ } };
      const store = {
        getItem: (k)=> map.has(String(k)) ? map.get(String(k)) : null,
        setItem: (k, v)=>{ k = String(k); v = String(v); if(map.get(k) === v) return; map.set(k, v); changed(); mirror(()=> real.setItem(k, v)); },
        removeItem: (k)=>{ k = String(k); if(!map.has(k)) return; map.delete(k); changed(); mirror(()=> real.removeItem(k)); },
        clear: ()=>{ map.clear(); changed(); mirror(()=> real.clear()); },
        key: (i)=> [...map.keys()][i] ?? null,
        get length(){ return map.size; }
      };
      Object.defineProperty(window, 'localStorage', { value: store, configurable: true });
      if(!(res.ok && res.data)) changed(); // prvi start: odmah napravi fajl od postojecih podataka
      window.__desktopData = {
        status, flushSync, saveNow,
        // Vracanje rezervne kopije: zameni SVE podatke i odmah upisi fajl.
        replaceAll(data){
          map.clear();
          Object.keys(data).forEach(k=> map.set(k, typeof data[k] === 'string' ? data[k] : JSON.stringify(data[k])));
          dirty = true; flushSync();
        }
      };
      window.addEventListener('beforeunload', flushSync);
      document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState === 'hidden') saveNow(); });
    })();
  }
