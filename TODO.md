# Ce mai e de făcut

Evidența cererilor lui Victor, ca să nu se piardă niciuna între review-uri.
✅ = livrat și publicat.

## Portul în Swift (Walkie Talkie)

Protocolul de handoff: **fiecare predare e marcată cu un tag pe acest repo**, ca
să se știe exact de la ce sursă s-a portat și ce a rămas de încorporat ulterior.

| tag | commit | ce conține | stare |
|---|---|---|---|
| `swift-port-01` | `6717b17` | 9 efecte proprii, meniu + gest pe rotiță | ✅ portat (`9cc4461`) |
| `swift-port-02` | `d832097` | apă, presete MilkDrop, voce de demo | ✅ portat (`773e249`) |
| — | — | nume englezești, rază la jumătate, blocuri groase, Mosaic la − | de predat |

Ce se schimbă **după** un tag intră în predarea următoare: diff între tag-uri, nu
ghicit. Aplicația instalată pe Mac e la `773e249`, dinaintea lucrărilor de mai jos.

## În lucru la agentul de Swift

- [ ] **Decizia pe motor** — trei rute comparate cu cifre măsurate (pagina în
      `WKWebView`, `projectM` nativ, motor scris în Metal). Din fișierele de pe
      disc reiese că a pornit pe ruta cu pagina: `HaloPage.swift`,
      `assets/voice-halo/`, `tools/vendor-voice-halo.sh`, iar `HaloEffects.swift`
      (reimplementările în CoreGraphics) e șters. Raportul n-a venit încă.
- [ ] **Decupajul pătrat** — panoul își ia mărimea din inel (`core × (1+spread) ×
      (1+swell)` ≈ 422 pt), deci efectele gândite pentru tot ecranul sunt tăiate.
      Panoul devine cât ecranul pentru toate, în afară de fulgerele implicite.
- [ ] **Un singur meniu `Halo fx`**, cu ⚡ pe presete, nume englezești, ordinea în
      bară: sursă → engine → Halo fx.
- [ ] **Tunnel** cu rotația dublă (se modifică `rot` în preset, nu se rotește pânza).
- [ ] **Lagoon** — scos din Swift la cererea lui („renunță la meteorii desenați").
      De reconfirmat: în galerie, capturat întreg, îi place cum arată.

## Reguli care se aplică peste tot

- Haloul se compune peste ecranul **viu**. Opacitate parțială e în regulă;
  umplere opacă sau instantaneu înghețat, nu.
- Efectele marcate **−** nu se implementează: Petals, Silk, Nova, Royal, Mosaic.
- Inelul de fulgere implicit rămâne **nativ și ieftin**, neatins.
- 30 fps e suficient. Atenție: constantele de stingere sunt calibrate la 60 —
  la 30 urma se înjumătățește dacă nu sunt legate de timp.

## De întrebat / opțional

- [ ] Inelul procedural roșu/albastru — gata ca prototip, arată bine. De decis
      dacă înlocuiește filmul de 25 de cadre (care nu reacționează la voce și se
      repetă la 3,75 s) sau rămâne un efect în plus.
- [ ] **GIF-ul original al inelului nu e în repo** — `~/Downloads/neon-electric-ring.gif`
      e singura verigă din lanț care trăiește în afara versionării. Dacă dispare,
      foaia de sprite-uri nu se mai poate regenera.
- [ ] Galeria de 122 de efecte MilkDrop din `~/workspace/milkdrop-gallery` — de
      adăugat ca pagină separată?

## Livrate

- ✅ Pagină publică pe telefon, cerc la 80% din lățime, microfonul telefonului
- ✅ Barele de spectru + diagnosticul de microfon (file:// nu dă getUserMedia)
- ✅ Formula reală MilkDrop: undă PCM pe cerc + feedback
- ✅ Toate efectele pe ecran întreg, fără pătrat și fără mască
- ✅ Puls doar spre exterior; ceață care emană în afară
- ✅ Benzi de spectru cu prag de zgomot, tavan lent și răspuns compresiv
- ✅ Presetele alese rulate **cu motorul lor**, identice cu originalul
- ✅ Mod MilkDrop cu 103 presete, swipe stânga/dreapta
- ✅ Toggle-uri jos: fundal IDE, MilkDrop, plimbare, ascunde barele, cursor
- ✅ Cursor macOS în centru, care merge cu efectul la plimbare
- ✅ Nume englezești scurte + marcaje ★ • −
- ✅ Pagina se actualizează singură (cache-ul Pages ține 10 min; `version.txt`)
- ✅ Galerie cu clipuri de 3 s, regenerabilă cu `./build-gallery.py`
- ✅ Link de demo în capul README, repo public, homepage setat
