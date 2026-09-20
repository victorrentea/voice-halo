# Ce mai e de făcut

Evidența cererilor lui Victor, ca să nu se piardă niciuna între review-uri.
Ordinea e cronologică; ✅ = livrat și publicat.

## Portul în Swift (Walkie Talkie)

Protocolul de handoff: **fiecare predare e marcată cu un tag pe acest repo**, ca
să se știe exact de la ce sursă s-a portat și ce a rămas de încorporat ulterior.

| tag | commit | ce conține | stare |
|---|---|---|---|
| `swift-port-01` | `6717b17` | 8 efecte proprii + presetele fixate + modul MilkDrop + toggle-uri + cursor | portare lansată |

Ce se schimbă **după** un tag intră în următoarea predare. Când mai polișăm aici,
se pune un tag nou și se dă diff-ul dintre tag-uri agentului care portează.

## În lucru

- [ ] **Efectul cu apă** (delegat unui subagent, 2026-09-20): apa stă în partea de
      jos a ecranului, cometele luminoase se rotesc **în jurul mouse-ului**, iar
      tot ce se învârte se **oglindește în apa de jos**. Cursorul rămâne în
      centrul lor.
- [ ] **Identificat presetul „GTA 3"** — numărul dictat nu s-a potrivit cu niciun
      preset cu apă/oglindire din listă. De lămurit cu Victor sau de găsit prin
      randare. Candidați din nume: 9 (Ocean of Light), 64 (Toxic water diffusion),
      67 (chromatidal pool mirror), 82 (water cooled red uranium).

## De întrebat / opțional

- [ ] Dâră globală la plimbare — acum urma se vede doar la efectele care au deja
      strat de ceață (fulgere, bile). Se poate pune un strat de urmă peste tot.
- [ ] Galeria de 122 de efecte MilkDrop „linii pe negru" construită de cealaltă
      sesiune (`~/workspace/milkdrop-gallery`) — de adăugat ca pagină separată?

## Livrate

- ✅ Pagină publică pe telefon, cerc la 80% din lățime, microfonul telefonului
- ✅ Barele de spectru jos + diagnosticul de microfon (file:// nu dă getUserMedia)
- ✅ Formula reală MilkDrop: undă PCM pe cerc + feedback
- ✅ Centrul liber la toate efectele proprii (măsurat, nu din ochi)
- ✅ Puls doar spre exterior; ceață care emană în afară
- ✅ Benzi de spectru cu prag de zgomot, tavan lent și răspuns compresiv
- ✅ Spițe pe două semicercuri, apoi patru sferturi; vârf stins pe ultimele 25%
- ✅ Inel de segmente fără goluri, cu nuanța închisă fără cusătură
- ✅ Oscilogramă mov (albastru + roșu suprapuse pe aceeași rază)
- ✅ Două bile diametral opuse, albastru/roșu, ceață în valuri, doar pe sunet
- ✅ Orbite de particule reconstruite din filmul de la 0:15, cadru cu cadru
- ✅ Inel de blocuri (textura de mărgele pătrate din film)
- ✅ Mod MilkDrop cu 103 presete circulare, swipe stânga/dreapta
- ✅ Toggle-uri jos: fundal IDE, MilkDrop, plimbare, ascunde barele, cursor
- ✅ Cursor macOS fix în centru, proporțional cu fontul HUD
- ✅ Cursorul merge cu efectul când acesta se plimbă
- ✅ Presetele alese (7, 8, 20, 44, 77, 85, 87, 97, 99) rulate **cu motorul lor**,
      pe toată fereastra — identice cu originalul, nu reimplementate
- ✅ „raze ORB — fără flash": singura reimplementare păstrată, fiindcă abaterea
      (miezul alb scos) e cerută explicit
