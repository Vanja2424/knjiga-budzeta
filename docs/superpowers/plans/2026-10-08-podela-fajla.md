# Podela budzet-tracker.html — plan izrade

**Spec:** `docs/superpowers/specs/2026-10-08-podela-fajla-design.md`

### Task 1: Jednokratna podela + spajanje (bajt-identično)
- Skripta (scratchpad, ne ide u repo) deli original po opsezima redova u `src/` i pravi šablon.
- `app/scripts/build-web.js`: zamena `<!--@include X-->` sadržajem `src/X`; izlaz u koren.
- Provera: SHA-256 spoja = SHA-256 originala.

### Task 2: Ugradnja u tok
- `copy-web.js` prvo poziva build-web.
- `build.test.js`: koren = spoj iz src; svaki include postoji; delovi nisu prazni.
- Šablon dobija komentar „GENERISANO — menjaj src/“ (u HTML komentaru posle `<!DOCTYPE html>`); koren se ponovo generiše.

### Task 3: Provera i izdanje
- `npm test`, smoke bez podataka, upakovana aplikacija na kopiji podataka.
- Nezavisan pregled, v1.40.2, push-source, release.
- Memorija: rad se menja u `src/`.
