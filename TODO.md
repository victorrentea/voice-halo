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

## Decizia pe motor — luată, cu cifre

**Ruta A, în două pagini.** Efectele proprii rulează **chiar pagina asta** într-un
`WKWebView`; presetele MilkDrop rulează butterchurn în pagina lor (`halo.html`);
inelul de fulgere rămâne **nativ** și nu atinge niciun WebView.

Ce a decis-o: nativ în CoreGraphics, un singur pas de urmă pe tot ecranul costă
**48–86 ms**, iar inelul cu blur **58 ms** — peste bugetul de 33 ms. Un fix nativ
ar fi însemnat un renderer în Metal, adică rescriere. Cele 1330 de linii de
CoreGraphics au fost șterse, nu reparate.

`projectM` 4.1.7 merge și e rapid (2–3 ms/cadru), dar **trei din cele șapte
presete alese (Tunnel, Tendrils, Water Dream) nu există ca `.milk` nicăieri**,
doar ca JSON butterchurn — deci ruta nativă ar livra alte presete.

Livrat în `b7eeef4` + `6b0edec`: meniu unic `Halo fx`, ⚡ pe presete, ordinea în
bară, panou cât ecranul, plasă de siguranță (dacă pagina pică → film), pagina
vendorizată la un commit fixat.

## Unde s-a oprit (20 sep, 23:00)

Aplicația instalată: build 22:57, cu pagina vendorizată la `22cd62c`. Ambele
repo-uri curate și împinse. Deciziile lui Victor din ultima rundă:

- **Comets și Water Dream ies din listă**; codul rămâne comis, nu șters.
- **Cele 115 ms** de reconstrucție a paginii la schimbarea efectului **rămân** —
  nu se simt. E decizie, nu scăpare: nu o „repara" într-o sesiune viitoare.
- **Atom**: punctele scalează acum cu efectul în ambele sensuri.

## Deschise

- [ ] **Tunnel: 0.42 sau 0.33?** Aplicația îl randa la scara 1, nu 0.5, deci „3×
      mai mic din ce vedeam" ar fi 0.33. Un singur număr în `HaloStyle.swift`.
- [ ] **Presetele ies întunecate în pagina întreagă** — măsurat pe framebuffer-ul
      motorului (2/255 față de 67/255 în `halo.html`), cauză necunoscută după 40
      de minute de bisecție. De aceea presetele rulează în pagina lor separată.
- [ ] **Fără limitare la 30 fps** — constantele de stingere sunt per cadru; un cap
      la 30 ar înjumătăți ceața dacă nu sunt legate întâi de timp.
- [ ] **Energia nemăsurată** cu `powermetrics`.
- ✅ **Lagoon scos definitiv** — „water dream e ce mi-a plăcut". Marcat − în pagină,
      deci iese și din galerie; efectul cu apă de pe desktop e presetul, nu al nostru.

## Reguli care se aplică peste tot

- Haloul se compune peste ecranul **viu**. Opacitate parțială e în regulă;
  umplere opacă sau instantaneu înghețat, nu.
- Efectele marcate **−** nu se implementează: Petals, Silk, Nova, Royal, Mosaic, Lagoon.
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
- [ ] **Presetele noi de răsfoit** (`halo-presets.js`) sunt doar în pagină. Dacă
      vrei vreunul și în aplicație, el trebuie fixat în `FORMULAS` cu numele lui,
      ca celelalte — ruta nativă projectM nu-l poate lua, fiindcă majoritatea
      nu există ca `.milk` în colecțiile clonate local (doar 47 din 700 aveau).

## Livrate

- ✅ Pagină publică pe telefon, cerc la 80% din lățime, microfonul telefonului
- ✅ Barele de spectru + diagnosticul de microfon (file:// nu dă getUserMedia)
- ✅ Formula reală MilkDrop: undă PCM pe cerc + feedback
- ✅ Toate efectele pe ecran întreg, fără pătrat și fără mască
- ✅ Puls doar spre exterior; ceață care emană în afară
- ✅ Benzi de spectru cu prag de zgomot, tavan lent și răspuns compresiv
- ✅ Presetele alese rulate **cu motorul lor**, identice cu originalul
- ✅ Mod MilkDrop cu 103 presete, swipe stânga/dreapta
- ✅ Presete NOI la răsfoire: cele 103 ies din listă (rămân doar cele fixate în
  `FORMULAS`), în loc vine `halo-presets.js` — ales prin randare, cu `./build-presets.py`
- ✅ Toggle-uri jos: fundal IDE, MilkDrop, plimbare, ascunde barele, cursor
- ✅ Cursor macOS în centru, care merge cu efectul la plimbare
- ✅ Nume englezești scurte + marcaje ★ • −
- ✅ Pagina se actualizează singură (cache-ul Pages ține 10 min; `version.txt`)
- ✅ Galerie cu clipuri de 3 s, regenerabilă cu `./build-gallery.py`
- ✅ Link de demo în capul README, repo public, homepage setat
