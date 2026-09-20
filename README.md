# Voice Halo

Un halo audio-reactiv, pentru telefon. Deschizi pagina, dai drumul la microfon și
cercul din mijlocul ecranului reacționează la voce.

**→ https://victorrentea.github.io/voice-halo/**

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
- Barele de jos arată spectrul (grave la stânga), ca să vezi imediat când intră vocea.
- `wakeLock` ține ecranul aprins cât te uiți.
