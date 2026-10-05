# Veliki godišnji troškovi (v1.33.0) Implementation Plan

> Izvršava se po koracima (native), uz test koji prvo pada.

**Spec:** `docs/superpowers/specs/2026-10-05-godisnji-troskovi-design.md`

## Global Constraints
- Logika ide u jezgro (`yearlyCosts`, `yearlyReminders`, fond u `cashForecast`). Stranica prikazuje rezultat i zapisuje podatke.
- Fond je cilj sa `yearlyFund: true`, najviše jedan. Ide u JSON kopiju (`cleanGoals`) i u Excel kolonu `GodisnjiFond`.
- „Plati iz fonda“ se može poništiti. Novi tekstovi idu u i18n i svaki mora da se koristi.
- Pre izdanja: smoke, upakovana aplikacija u običnom režimu, nezavisan pregled.

## Review Focus
1. Tromesečna stavka u prozoru od 12 meseci: 4 pojave, ne 12.
2. Stavka plaćena ovog meseca: sledeća pojava je za godinu dana (ili za 3 meseca), ne ovaj mesec.
3. Fond koji nema dovoljno: razlika se oduzima od raspoloživog novca.
4. Poništavanje „Plati iz fonda“ vraća i fond, i oznaku plaćeno, i rashod.
5. `catchUp` kad je fond veći od svih troškova: 0, nikad negativno.

### Task 1: Jezgro (test → implementacija → commit)
### Task 2: Stranica — podkartica, prečica, fond, plaćanje iz fonda, podsetnik, JSON/Excel (smoke → implementacija → EN → commit)
### Task 3: Završno — snimci SR/EN, pregled, popravke, izdanje 1.33.0, memorija
