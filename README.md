# Voice Halo

**▶ Demo live: https://victorrentea.github.io/voice-halo/** — deschide-l pe telefon,
dă drumul la microfon și vorbește. Galeria cu toate efectele:
[galerie.html](https://victorrentea.github.io/voice-halo/galerie.html).
Presete Winamp AVS reale, care reacționează la același microfon:
[avs.html](https://victorrentea.github.io/voice-halo/avs.html)

Un halo audio-reactiv, pentru telefon. Deschizi pagina, dai drumul la microfon și
cercul din mijlocul ecranului reacționează la voce.

## De ce arată așa

Efectul principal nu e o imitație desenată „din ochi": e formula reală din
**MilkDrop** (vizualizatorul Winamp), verificată rulând motorul original
(butterchurn) peste presete adevărate:

- inelul **este forma de undă** — raza în punctul `i` = raza de repaus +
  eșantionul PCM. Zimții sunt literalmente semnalul audio, nu zgomot procedural.
  Dovada: cu un ton curat, motorul real desenează un **cerc perfect**; abia
  zgomotul de bandă largă dă crinkle-ul din Winamp.
- mănunchiul de fire concentrice e **feedback de cadru**: fiecare cadru
  redesenează cadrul precedent puțin mărit (`zoom`), puțin rotit (`twist`) și mai
  stins (`decay`). Nu se desenează niciodată mai multe bucle deodată — e istoria
  ultimelor cadre.
- albul ars vine din desenul **aditiv** peste negru.

## Criteriul de ordonare

Efectele sunt ordonate după cât de mult **lasă centrul liber**: primele țin toată
mișcarea într-o bandă îngustă, ca să poți suprapune ceva discret în mijloc.
Ultimele două (`spiro cu coarde`, `vortex`) traversează sau umplu centrul — sunt
la coadă tocmai fiindcă încalcă criteriul.

## Presetele din butonul MilkDrop

Butonul răsfoiește presete pe care **nu** le-ai mai văzut. Cele 103 „curate" din
pachetele oficiale ale lui butterchurn (base + extra, filtrate pe undă circulară)
au fost deja parcurse o dată și ce a rămas bun din ele e fixat în listă ca efect
cu numele lui — deci la răsfoire nu mai apar. În locul lor vine `halo-presets.js`,
scris de `./build-presets.py` din alte colecții de pe net:

- `ansorre/tens-of-thousands-milkdrop-presets-for-butterchurn` — 15.056 presete
  MilkDrop convertite în formatul lui butterchurn;
- `butterchurn-presets@2.4.7`, pachetele **Extra2** și **MD1** — încă două pachete
  oficiale (MIT) din exact același npm din care pagina lua base+extra, doar că
  nedocumentate în README-ul lor, deci practic nefolosite de nimeni.

Alegerea nu se face din text — un `.milk` poate fi la fel de bine o linie fină pe
negru sau un ecran plin de vopsea, iar diferența se vede abia rulat. Fiecare
candidat e **randat cu motorul lui**, în Chromium headless, cu exact același semnal
audio, și notat pe ce a ieșit pe pânză: nu e negru, nu e înghețat, nu umple cadrul,
și **lasă centrul liber** (luminanța din discul central față de inelul din jur) —
adică fix criteriul de ordonare de mai sus, măsurat în loc de ghicit.

Pachetul mai conține și cele zece presete fixate în `FORMULAS`, scoase din
pachetele oficiale: așa pagina nu mai descarcă 1,5 MB de presete ca să folosească
nouă din ele.

## 20 — Fluid

Simulatorul lui Pavel Dobryakov,
[WebGL-Fluid-Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation)
(MIT), portat în `fluid.js` cu fizica lui neatinsă: aceleași shadere (advecție,
curl + vorticity confinement, Jacobi pe presiune, scăderea gradientului, splat
gaussian), aceeași ordine a pașilor și aceleași constante, plus display-ul lui
cu shading, bloom și sunrays.

Schimbat e doar **stimulul**. La el, splat-urile vin din mișcarea mouse-ului
(poziția + delta × `SPLAT_FORCE`). Aici vin din **voce**: 12 emițători pe un cerc
mic în jurul cursorului, fiecare un „pointer" virtual care, cât se vorbește, se
mișcă spre exterior cu viteza dată de nivelul vocii, cu o mică răsucire
tangențială ca vorticity-ul să aibă ce amplifica. În liniște vocea nu mai emite
nimic și fluidul se stinge singur. Razele sunrays pleacă de la cursor, nu din
mijlocul ecranului.

### 21–25 — aceeași fizică, alt fel de a mișca fluidul cu vocea

Toate trec prin același `splatPointer()`; diferă doar ce pointer virtual mișcă
vocea, încotro și cât (`MODES` în `fluid.js`):

| # | nume | ce face vocea |
|---|---|---|
| 20 | Fluid | inel de 12 emițători care împing spre exterior; rotirea e acum lentă (0.03 rad/s, era 0.15 + răsucire 0.35 — amețitoare) |
| 21 | Geyser | un singur jet în sus: volumul e înălțimea, tonul îl înclină (grav stânga, ascuțit dreapta) |
| 22 | Syllables | în tăcere nimic; fiecare atac de silabă aruncă un inel întreg, cu culoare nouă |
| 23 | Compass | un pointer care se rotește în jurul cursorului; unghiul e tonul vocii |
| 24 | Organ | spectrul pe orizontală prin cursor, fiecare bandă un tub care suflă în sus |
| 25 | Breath | vorbești: se umflă și varsă culoare; taci: același inel trage fumul înapoi |

Tonul e centroidul benzilor, întins pe domeniul vorbirii (centroidul brut al
vocii stă între ~0.05 și ~0.4) și netezit, ca direcția să nu tremure.

Mișcarea rămâne și ea stimul, cu `splatPointer()`-ul lui neschimbat: când centrul
se mută (mouse-ul real în Walkie Talkie, „plimbarea" în pagină), fluidul primește
impulsul mișcării. Doar că e atenuat (`MOVE_FORCE` 0.35 din forță, `MOVE_DYE` 0.06
din culoare): mișcarea fără voce lasă o dâră discretă, vocea e cea care îl umple.

Două reglaje au fost necesare, fiindcă un emițător care stă pe loc nu e un
mouse: „mișcarea" unui emițător e de doar 3 px pe cadru la voce plină (la 16 px
viteza se aduna în același punct și se lovea de plafonul de ±1000 din shader), iar culoarea e împărțită între
emițători și mult redusă (sunrays-ul amplifică de ~8× orice dye slab, iar
vorbirea continuă n-are pauzele unui mouse).

## Note tehnice

- Microfonul cere **https** și un gest al utilizatorului. Pe `file://` Chrome nu
  expune deloc `navigator.mediaDevices` — fără prompt, fără eroare — de aceea
  pagina e servită de pe GitHub Pages. iOS mai cere și `AudioContext.resume()`
  chiar în handler-ul gestului.
- Cercul de repaus are diametrul = **80% din lățimea ecranului**. Fiecare efect
  își declară `scale` (raza lui de referință, ca fracțiune din latura mică a
  ferestrei), ca toate să iasă la același diametru.
- **Nimic nu se desenează într-un dreptunghi.** A existat o pânză pătrată centrată
  (`#wrap`/`#c`) din care efectele își luau raza; efectele cu urmă îi umpleau
  pătratul și li se vedea muchia, iar cu „plimbarea" pornită dreptunghiul rătăcea
  vizibil pe ecran. Acum toate desenează pe pânza cât fereastra. Nici mască
  rotundă nu există: un cerc care taie imaginea e același defect ca pătratul.
  Presetele MilkDrop stau pe o pânză **pătrată cu latura max(lățime, înălțime)** —
  acoperă ecranul în ambele direcții, deci nu i se vede marginea, dar păstrează
  raportul presetului (întinsă pe ecran de telefon, orice cerc devenea elipsă).
- Butonul **mișcare: off | auto | manual** mută centrul tuturor efectelor: `auto`
  e plimbarea lentă de dinainte, iar în `manual` pe desktop punctul urmează
  mouse-ul fără clic (săgeata desenată ține locul celei reale), iar pe telefon îl
  tragi cu degetul de oriunde de pe ecran — relativ, ca degetul să nu acopere punctul. Modul se ține
  minte în browser. În `manual` swipe-ul prin presete e oprit, ca degetul să
  aibă un singur înțeles; swipe-ul cu două degete pentru voce rămâne.
- Barele de jos arată spectrul (grave la stânga), ca să vezi imediat când intră vocea.
- `wakeLock` ține ecranul aprins cât te uiți.
