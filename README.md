# Knjiga budžeta

Desktop aplikacija za vođenje ličnog budžeta (Windows).

Instalacioni fajl najnovije verzije je pod **Releases**. Instalirana aplikacija se sama ažurira.

## Šta ume

- Prihodi i rashodi po kategorijama, oznake, podela rashoda na više kategorija
- Pregled po mesecima, budžet po kategoriji (uz opcioni prenos ostatka), finansijsko zdravlje
- Računi (tekući, gotovina, štednja, kartica) i prenosi između njih
- Ponavljajuće stavke (mesečno, kvartalno, godišnje), automatski upis i podsetnici
- Iznosi u EUR/USD/CHF/GBP po srednjem kursu NBS
- Ciljevi štednje, dugovi i plan otplate, scenario „šta ako“
- Uvoz izvoda banke (CSV, Excel, OFX, QIF) sa pregledom i preskakanjem duplikata; izvoz u Excel/CSV/JSON
- Podaci u jednom fajlu na računaru (`Dokumenti\Knjiga budzeta\podaci.json`) sa dnevnim i mesečnim rezervnim kopijama — ništa se ne šalje na internet (osim zahteva za kursnu listu i provere ažuriranja)

## Struktura

| Putanja | Šta je |
|---|---|
| `budzet-tracker.html` | Cela aplikacija (interfejs) |
| `budzet-core.js` | Logika bez interfejsa: iznosi, datumi, uvoz izvoda, računi — pokrivena testovima |
| `xlsx.core.min.js` | [SheetJS](https://sheetjs.com) 0.20.3 (Apache 2.0) za Excel |
| `pokreni-budzet.bat` | Pokretanje u browseru (lokalni server) |
| `app/` | Electron omotač: `main.js`, `preload.js`, prozor za brzi unos, build i objava |
| `app/test/` | `core.test.js` (jedinični testovi) i `smoke.js` (pokreće pravu aplikaciju nad kopijom podataka) |
| `app/release-notes/` | Beleške o izdanjima (prikazuju se u aplikaciji posle ažuriranja) |

## Razvoj

```powershell
cd app
npm install
node node_modules\electron\install.js   # ako npm preskoči preuzimanje Electron-a
npm start                                 # pokretanje
npm test                                  # jedinični testovi
npm run smoke -- C:\putanja\do\kopije\podaci.json   # provera cele aplikacije nad kopijom podataka
npm run release                           # build + objava na GitHub Releases (potreban GH_TOKEN)
```
