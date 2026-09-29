# Knjiga budžeta na Mac-u — instalacija

Knjiga budžeta je aplikacija za vođenje kućnog budžeta. Sve tvoje stavke se čuvaju samo na tvom Mac-u, a vidiš ih samo ti. Radi na macOS 12 (Monterey) i novijim.

## 1. Koji fajl da preuzmeš

Klikni na Apple meni  (gore levo) → **About This Mac** (O ovom Mac-u):

- piše **Chip: Apple M1, M2, M3…** → preuzmi fajl koji se završava sa **`mac-arm64.dmg`**
- piše **Processor: … Intel …** → preuzmi fajl koji se završava sa **`mac-x64.dmg`**

Fajlovi su na stranici: **https://github.com/Vanja2424/knjiga-budzeta/releases/latest**. Nalaze se pri dnu, u delu **Assets**.

## 2. Instalacija

1. Otvori preuzeti `.dmg` fajl (dupli klik u Downloads).
2. Otvoriće se prozor. **Prevuci ikonicu „Knjiga budzeta“ u folder Applications.**
3. Zatvori prozor i izbaci disk „Knjiga budzeta“ (desni klik → Eject).

## 3. Prvo otvaranje (samo jednom)

Aplikacija nije kupljena preko Apple-a, pa će macOS pitati da li si sigurna. To je očekivano.

**macOS 15 (Sequoia) i noviji:**
1. U **Applications** dvaput klikni na **Knjiga budzeta**. Pojaviće se poruka da ne može da se otvori. Klikni **Done**.
2. Otvori **System Settings → Privacy & Security** i skroluj skroz dole.
3. Pored poruke *„Knjiga budzeta" was blocked…* klikni **Open Anyway**, upiši lozinku Mac-a, pa ponovo **Open**.

**macOS 14 (Sonoma) i stariji:**
1. U **Applications** drži taster **Control** i klikni na **Knjiga budzeta** (ili desni klik) → **Open**.
2. U poruci ponovo klikni **Open**.

Posle toga se aplikacija otvara normalno, dvostrukim klikom ili iz Launchpad-a.

### Ako piše „is damaged and can't be opened"

Aplikacija nije oštećena. To macOS tako kaže za preuzete aplikacije koje nisu kupljene preko Apple-a.
1. Otvori **Terminal** (⌘ + razmak, upiši *Terminal*, Enter).
2. Nalepi ovaj red i pritisni Enter:
   ```
   xattr -cr "/Applications/Knjiga budzeta.app"
   ```
3. Ponovo otvori aplikaciju.

## 4. Kad je otvorena

- Kad aplikacija pita za **obaveštenja**, klikni **Allow**. Tako te podseća na plaćanja koja stižu.
- **Zatvaranje prozora** (crveno dugme) ne gasi aplikaciju. Ostaje u Dock-u i u traci menija gore desno, da bi podsetnici stizali. Da je potpuno ugasiš: **⌘Q**.
- Prečice koriste taster ⌘:
  - **⌘N**: novi rashod
  - **⌘Z**: poništi
  - **⌘F**: pretraga
  - **?**: spisak svih prečica
- **Podaci** su u **Documents → Knjiga budzeta** (`podaci.json`). Kopije se prave same, svaki dan, u podfolder *Rezervne kopije*. Ako ti je Documents u iCloud-u, podaci se čuvaju i tamo.

## 5. Nova verzija

Aplikacija sama proverava da li postoji nova verzija. Kad je nađe, gore levo i u **Podešavanjima** pojavi se **„Preuzmi X"**.
1. Klikni **Preuzmi**. Otvoriće se stranica sa fajlovima.
2. Preuzmi isti fajl kao prvi put (arm64 ili x64). Otvori ga i prevuci aplikaciju u **Applications**. Kad pita, izaberi **Replace**.
3. Tvoji podaci ostaju gde su bili.

Ako macOS posle nove verzije opet pita za dozvolu, ponovi korak 3.

## Ako nešto ne radi

Javi Vanji šta se desilo. Pošalji snimak ekrana (⌘ + Shift + 4) i broj verzije: piše u levom meniju ispod naziva aplikacije, na primer *v1.19.0*.
