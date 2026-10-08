# Podela budzet-tracker.html na izvorne fajlove (v1.40.2) — dizajn

Datum: 2026-10-08 · Korisnik je odobrio varijantu 1 (izvorni fajlovi + spajanje pri izradi) i rekao „kreni odmah“.

## Cilj

`budzet-tracker.html` ima 12.633 reda: CSS (~1.800), HTML (~1.360), JS u jednoj `(function(){…})()` celini (~9.350). Izmene i pregledi su spori i rizični. Cilj su manji izvorni fajlovi po oblastima, bez ikakve promene ponašanja.

Van ovog posla: prelazak na prave module (import/export), menjanje koda unutar delova, podela HTML-a ekrana.

## Struktura

```
src/
  budzet-tracker.html   šablon: originalni fajl sa redovima <!--@include putanja--> umesto izdvojenih delova
  glava.js              skript iz <head> (desktop skladište)
  stil/osnova.css       prvi <style>
  stil/tema.css         <style id="apple-theme">
  js/NN-ime.js          telo glavne (function(){…})() celine, 28 delova u originalnom redosledu
```

Granice JS delova su postojeći naslovi sekcija (`// ---- … ----`). Delovi su uzastopni opsezi redova originala; redosled je redosled spajanja.

## Spajanje

`app/scripts/build-web.js` čita `src/budzet-tracker.html` i svaki red `<!--@include X-->` zamenjuje tačnim sadržajem `src/X` (bajt po bajt, CRLF ostaje). Rezultat se upisuje u `E:\Vanja\budzet-tracker.html`. `copy-web` prvo poziva spajanje, pa `start`, `smoke`, `dist` i `release` koriste svež fajl. `npm test` namerno ne spaja: test pada ako koren nije spoj iz `src/` (posle izmene u `src/` pokreni `npm run copy-web` pre testa i commit-a). Pregledačka verzija (`pokreni-budzet.bat`) i dalje otvara isti fajl u korenu.

Generisani fajl ne dobija dodatni komentar u prvoj verziji, da bi prvi rezultat bio bajt-identičan originalu; komentar „GENERISANO — menjaj src/“ dodaje se u šablon odmah posle provere identičnosti.

## Bezbednost

1. Jednokratna skripta deli fajl; odmah posle se proverava da je spoj bajt-identičan originalu (SHA-256).
2. Jedinični test `build.test.js`: spoj iz `src/` je jednak `budzet-tracker.html` u korenu (niko ne menja generisani fajl umesto izvora) i svaki `@include` postoji.
3. Svi testovi, smoke i upakovana aplikacija na kopiji podataka.
4. Memorija: ubuduće se menja `src/`, pa `npm run copy-web` (ili bilo koja npm komanda koja ga poziva).
