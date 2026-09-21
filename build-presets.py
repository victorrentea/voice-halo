#!/usr/bin/env python3
"""Alege presete MilkDrop NOI din colecțiile de pe net și scrie `halo-presets.js`.

    ./build-presets.py                       # tot lanțul, exact ca pachetul publicat
    ./build-presets.py --keep 160 --pool 700
    ./build-presets.py --reuse               # sare peste măsurare, dacă e deja în cache

De ce un script și nu o alegere pe ochi: presetele MilkDrop nu se pot judeca din
text. Același `.milk` poate fi o linie fină pe negru sau un ecran plin de vopsea,
iar diferența se vede abia rulat, cu semnal audio în el. Deci fiecare candidat e
**randat cu motorul lui** (butterchurn, în Chromium headless), cu exact același
semnal audio pentru toți, iar alegerea se face pe ce a ieșit pe pânză:

  · nu e negru / nu e înghețat (altfel pe telefon pare că s-a stricat pagina);
  · **lasă centrul liber** — criteriul de ordonare al paginii, măsurat ca raportul
    dintre luminanța din discul central și cea din inelul din jur;
  · nu umple tot cadrul cu vopsea (haloul se compune peste ecranul viu).

Ce NU face: nu atinge cele 103 presete „curate" din pachetele oficiale base+extra.
Pe alea le-ai răsfoit deja și ți-ai ales din ele (vezi FORMULAS în index.html);
aici intră numai ce nu e în ele.

Surse (toate publice, toate verificate că se încarcă în butterchurn 2.6.7):
  · ansorre/tens-of-thousands-milkdrop-presets-for-butterchurn — 15.056 presete
    MilkDrop convertite în JSON de butterchurn (arhiva din repo);
  · butterchurn-presets@2.4.7 `lib/butterchurnPresetsExtra2.min.js` și
    `lib/butterchurnPresetsMD1.min.js` — încă două pachete oficiale (MIT) din
    ACELAȘI npm din care pagina lua deja base+extra, pe care nu le încărca nimeni.
"""

import argparse, functools, hashlib, http.server, json, os, re, shutil, socketserver
import subprocess, sys, threading, time, urllib.request, zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
CACHE = os.environ.get("HALO_PRESETS_CACHE", "/tmp/voice-halo-presets")
OUT = os.path.join(ROOT, "halo-presets.js")

# a treia sursă: efectele „linii pe negru" din ~/workspace/milkdrop-gallery, scrise
# în cod MilkDrop sau alese din cream-of-the-crop. Sunt `.milk`, deci trec întâi
# prin `milkdrop-preset-converter` ca să ajungă în formatul lui butterchurn.
GALLERY = os.path.expanduser("~/workspace/milkdrop-gallery/gallery/milk")

ZIP_URL = ("https://raw.githubusercontent.com/ansorre/"
           "tens-of-thousands-milkdrop-presets-for-butterchurn/master/"
           "milkdrop-presets-for-butterchurn.zip")
CDN = "https://unpkg.com/butterchurn-presets@2.4.7/lib/"
ENGINE = "https://unpkg.com/butterchurn@2.6.7/lib/butterchurn.min.js"
# pachetele pe care pagina le încarcă oricum: ce e în ele NU e „nou"
OFFICIAL_BASE = ["butterchurnPresets", "butterchurnPresetsExtra"]
# pachetele oficiale în plus, din care se pot alege presete noi
OFFICIAL_NEW = ["butterchurnPresetsExtra2", "butterchurnPresetsMD1"]

MS = 2600          # cât rulează fiecare preset înainte de măsurători (3 capturi)
SHARDS = 5         # câte Chromium-uri în paralel


# ── descărcări ───────────────────────────────────────────────────────────────

def fetch(url: str, dest: str) -> str:
    if not os.path.exists(dest):
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        print(f"  ↓ {os.path.basename(dest)}", flush=True)
        urllib.request.urlretrieve(url, dest)
    return dest


def download() -> None:
    fetch(ZIP_URL, f"{CACHE}/ansorre.zip")
    fetch(ENGINE, f"{CACHE}/butterchurn.min.js")
    for n in OFFICIAL_BASE + OFFICIAL_NEW:
        fetch(CDN + n + ".min.js", f"{CACHE}/{n}.min.js")


# ── candidați ────────────────────────────────────────────────────────────────

def norm(name: str) -> str:
    """Numele aceluiași preset diferă prin punctuație de la o colecție la alta."""
    return re.sub(r"[^a-z0-9]+", "", re.sub(r"\.milk$", "", name.lower()))


def cleanliness(p: dict) -> float:
    """Cât de „numai linii" pare presetul DIN PARAMETRI. Aceeași formulă ca în
    index.html; aici e doar presortare, ca să nu randăm toate cele 15.056."""
    b = p.get("baseVals", {})
    g = lambda k, d=0: b[k] if b.get(k) is not None else d
    on = lambda l: len([x for x in (l or []) if x.get("baseVals", {}).get("enabled")])
    return (min(g("wave_a", 0), 1) * 2 + (1 if g("wave_thick", 0) else 0)
            - abs(g("zoom", 1) - 1) * 4 - abs(g("warp", 0)) * 1.5
            - g("echo_alpha", 0) * 2 - (1 - g("decay", 1)) * 6
            - on(p.get("shapes")) * 0.7 + on(p.get("waves")) * 0.4
            - (1 if len(p.get("pixel_eqs_str") or "") > 40 else 0))


def signature(p: dict) -> str:
    """Amprentă pe CONȚINUT: colecțiile sunt pline de același preset sub alt nume."""
    parts = [p.get("frame_eqs_str", ""), p.get("pixel_eqs_str", ""),
             p.get("warp", ""), p.get("comp", ""), p.get("init_eqs_str", "")]
    for w in (p.get("waves") or []):
        parts += [json.dumps(w.get("baseVals", {}), sort_keys=True),
                  w.get("point_eqs_str") or "", w.get("init_eqs_str") or "",
                  w.get("frame_eqs_str") or ""]
    for sh in (p.get("shapes") or []):
        parts += [json.dumps(sh.get("baseVals", {}), sort_keys=True),
                  sh.get("init_eqs_str") or "", sh.get("frame_eqs_str") or ""]
    parts.append(json.dumps(p.get("baseVals", {}), sort_keys=True))
    txt = re.sub(r"\s+", "", re.sub(r"//[^\n]*", "", "|".join(map(str, parts)))).lower()
    return hashlib.sha1(txt.encode()).hexdigest()


def node_packs(names: list[str]) -> dict:
    """Pachetele oficiale sunt UMD minificat: le citește node, nu Python."""
    src = ";".join(f"Object.assign(o, require({json.dumps(CACHE + '/' + n + '.min.js')})"
                   f".getPresets())" for n in names)
    js = f"global.window = global; const o = {{}}; {src}; console.log(JSON.stringify(o));"
    out = subprocess.run(["node", "-e", js], capture_output=True, text=True)
    if out.returncode:
        sys.exit("node nu a putut citi pachetele oficiale:\n" + out.stderr[-500:])
    return json.loads(out.stdout)


def gallery_candidates() -> list[dict]:
    """Galeria proprie de `.milk`. Intră ÎNTREAGĂ, ca și pachetele oficiale: sunt
    122 și au fost deja alese o dată pe criteriul „linii pe negru".

    Atenție la capcană: în galerie sunt randate cu motorul din Python, care desenează
    DOAR waveform-ul custom — fără warp mesh și fără feedback. Cu butterchurn (motorul
    lor adevărat) unele arată complet altfel. De aia trec prin aceeași măsurătoare ca
    restul: ce nu ține figura acolo, nu intră în pachet."""
    if not os.path.isdir(GALLERY):
        print(f"  (fără galerie: {GALLERY} nu există)")
        return []
    out_dir = f"{CACHE}/gallery-json"
    if not os.path.isdir(out_dir) or not os.listdir(out_dir):
        conv = os.path.join(CACHE, "conv")
        os.makedirs(conv, exist_ok=True)
        subprocess.run(["npm", "install", "--silent", "milkdrop-preset-converter"],
                       cwd=conv, check=True)
        js = r"""const fs=require('fs'),path=require('path');
        const {convertPreset}=require('milkdrop-preset-converter');
        const [SRC,OUT]=process.argv.slice(2); fs.mkdirSync(OUT,{recursive:true});
        (async()=>{for(const f of fs.readdirSync(SRC).filter(x=>/\.milk$/i.test(x))){
          try{const j=await convertPreset(fs.readFileSync(path.join(SRC,f),'utf8'));
            if(j&&j.baseVals) fs.writeFileSync(path.join(OUT,f.replace(/\.milk$/i,'.json')),JSON.stringify(j));
          }catch(e){}}})();"""
        subprocess.run(["node", "-e", js, GALLERY, out_dir], cwd=conv, check=True)
    rows = []
    for f in sorted(os.listdir(out_dir)):
        if not f.endswith(".json"):
            continue
        p = json.load(open(os.path.join(out_dir, f)))
        rows.append({"name": "gallery: " + f[:-len(".json")], "src": "gallery",
                     "pre": cleanliness(p), "p": p})
    print(f"  {len(rows)} candidați din galeria proprie de .milk")
    return rows


def candidates(pool: int) -> list[dict]:
    """Presetele care merită randate: noi, cu undă circulară, fără dubluri."""
    known = {norm(n) for n in node_packs(OFFICIAL_BASE)}
    print(f"  {len(known)} presete în base+extra — pe astea le sare")

    rows, seen_name = [], set()
    z = zipfile.ZipFile(f"{CACHE}/ansorre.zip")
    for entry in z.namelist():
        if not (entry.startswith("converted/") and entry.endswith(".json")):
            continue
        name = entry[len("converted/"):-len(".json")]
        if norm(name) in known or norm(name) in seen_name:
            continue
        try:
            p = json.loads(z.read(entry).decode("utf-8", "replace"))
        except Exception:
            continue
        if not isinstance(p.get("baseVals"), dict):
            continue
        # unda circulară: restul modurilor desenează bare/linii peste tot ecranul
        if int(p["baseVals"].get("wave_mode") or 0) > 1:
            continue
        seen_name.add(norm(name))
        rows.append({"name": name, "src": "ansorre", "pre": cleanliness(p), "p": p})
    print(f"  {len(rows)} candidați noi cu undă circulară din arhiva ansorre")

    # Pachetele oficiale în plus intră ÎNTREGI: sunt puține și deja curatoriate,
    # iar nota lor din parametri e prea aspră ca să treacă de pragul arhivei mari.
    first = []
    for name, p in node_packs(OFFICIAL_NEW).items():
        if norm(name) in known or norm(name) in seen_name:
            continue
        if int(p.get("baseVals", {}).get("wave_mode") or 0) > 1:
            continue
        seen_name.add(norm(name))
        first.append({"name": name, "src": "official", "pre": cleanliness(p), "p": p})
    print(f"  {len(first)} candidați noi din pachetele oficiale Extra2 + MD1")

    rows.sort(key=lambda r: -r["pre"])
    out, seen_sig = [], set()
    for r in first + rows:
        sig = signature(r["p"])
        if sig in seen_sig:
            continue
        seen_sig.add(sig)
        r["i"] = len(out)
        out.append(r)
        if len(out) >= pool:
            break
    # La coadă, ca indicii celor deja măsurați să nu se miște între rulări.
    for r in gallery_candidates():
        sig = signature(r["p"])
        if sig in seen_sig:
            continue
        seen_sig.add(sig)
        r["i"] = len(out)
        out.append(r)
    print(f"  {len(out)} rămân după dublurile pe conținut → se randează")
    return out


# ── măsurarea: fiecare candidat randat cu motorul lui ────────────────────────

PROBE_HTML = r"""<!doctype html><meta charset=utf-8><body style="margin:0;background:#000">
<canvas id=c width=400 height=400></canvas>
<script src="butterchurn.min.js"></script>
<script>
const S = 400, cv = document.getElementById('c');
let actx, viz, src, gain, pending = null;
function audio() {
  actx = new (window.AudioContext || window.webkitAudioContext)();
  const len = actx.sampleRate * 2, buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / actx.sampleRate, env = 0.5 + 0.5 * Math.sin(2 * Math.PI * 2 * t);
    d[i] = 0.55 * env * Math.sin(2 * Math.PI * 55 * t) + 0.2 * Math.sin(2 * Math.PI * 220 * t)
         + 0.12 * Math.sin(2 * Math.PI * 1400 * t) + 0.18 * (Math.random() * 2 - 1) * env;
  }
  src = actx.createBufferSource(); src.buffer = buf; src.loop = true;
  gain = actx.createGain(); src.connect(gain); src.start();
}
window.boot = async () => {
  audio(); await actx.resume();
  viz = (butterchurn.default || butterchurn).createVisualizer(actx, cv, { width: S, height: S, pixelRatio: 1 });
  viz.setRendererSize(S, S); viz.connectAudio(gain);
  // Un preset cu shader stricat aruncă din render() și, fără try, omoară bucla —
  // toate capturile de după rămân agățate.
  const loop = () => {
    try { viz.render(); } catch (e) { window.__err = String(e).slice(0, 160); }
    if (pending) { const f = pending; pending = null; f(); }
    requestAnimationFrame(loop);
  }; loop();
  return true;
};
const g = document.createElement('canvas'); g.width = g.height = S;
const gx = g.getContext('2d');
// Pânza WebGL a lui butterchurn n-are preserveDrawingBuffer: citită din alt tick,
// e mereu neagră. Deci copiem în ACELAȘI cadru, imediat după render().
function grab() {
  return new Promise(r => {
    let done = false;
    pending = () => { if (done) return; done = true; gx.drawImage(cv, 0, 0); r(); };
    setTimeout(() => { if (!done) { done = true; pending = null; r(); } }, 1500);
  });
}
async function metrics() {
  await grab();
  const px = gx.getImageData(0, 0, S, S).data;
  let sum = 0, ctr = 0, ctrN = 0, ring = 0, ringN = 0, out = 0, outN = 0, ink = 0;
  const c = S / 2, G = 16, grid = new Array(G * G).fill(0), cell = S / G;
  for (let y = 0; y < S; y += 2) for (let x = 0; x < S; x += 2) {
    const o = (y * S + x) * 4;
    const l = (0.2126 * px[o] + 0.7152 * px[o + 1] + 0.0722 * px[o + 2]) / 255;
    sum += l; if (l > 0.08) ink++;
    const r = Math.hypot(x - c, y - c) / c;
    if (r < 0.28) { ctr += l; ctrN++; } else if (r < 0.75) { ring += l; ringN++; }
    else if (r <= 1.0) { out += l; outN++; }
    grid[((y / cell) | 0) * G + ((x / cell) | 0)] += l;
  }
  const n = (S / 2) * (S / 2), per = (cell / 2) * (cell / 2);
  return { mean: sum / n, center: ctr / ctrN, ring: ring / ringN, outer: out / outN,
           ink: ink / n, grid: grid.map(v => v / per) };
}
window.probe = async (preset, ms) => {
  window.__err = null;
  try { viz.loadPreset(preset, 0.0); } catch (e) { return { err: 'load: ' + String(e).slice(0, 160) }; }
  const wait = t => new Promise(r => setTimeout(r, t));
  await wait(ms * 0.55); const a = await metrics();
  await wait(ms * 0.25); const b = await metrics();
  await wait(ms * 0.20); const d = await metrics();
  return { a, b, d, err: window.__err };
};
</script>
"""

SHARD = r"""
import json, os, sys, functools, http.server, socketserver, threading
from playwright.sync_api import sync_playwright
ROOT, lo, hi, MS = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
items = [x for x in json.load(open(f'{ROOT}/index.json')) if lo <= x['i'] < hi]
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
class Quiet(socketserver.TCPServer):
    allow_reuse_address = True
    def handle_error(self, *a): pass
httpd = Quiet(("127.0.0.1", 0), handler); port = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()
out = []
with sync_playwright() as pw:
    br = pw.chromium.launch(args=["--autoplay-policy=no-user-gesture-required",
                                  "--enable-unsafe-swiftshader"])
    ctx = br.new_context(viewport={"width": 420, "height": 460})
    def fresh():
        pg = ctx.new_page()
        pg.set_default_timeout(20000)
        pg.goto(f"http://127.0.0.1:{port}/probe.html"); pg.wait_for_timeout(500)
        pg.evaluate("boot()"); pg.wait_for_timeout(800)
        return pg
    pg = fresh()
    # Rezultatele se scriu pe măsură ce ies, nu la final: o randare de 30 de minute
    # care moare pe la minutul 25 nu mai aruncă tot.
    seen = set()
    for f in sorted(os.listdir(ROOT)):
        if f.endswith('.jsonl'):
            for line in open(f'{ROOT}/{f}'):
                seen.add(json.loads(line)['i'])
    log = open(f'{ROOT}/metrics_{lo}.jsonl', 'a')
    for k, it in enumerate(items):
        if it['i'] in seen: continue
        try:
            preset = json.load(open(f"{ROOT}/presets/{it['i']:04d}.json"))
            row = {**it, 'm': pg.evaluate("([p, ms]) => probe(p, ms)", [preset, MS])}
            out.append(row); log.write(json.dumps(row) + '\n'); log.flush()
        except Exception as e:
            # Un preset cu ecuație scăpată în buclă înțepenește firul JS: pagina nu
            # mai răspunde NICIODATĂ, iar toate presetele de după ies pe timeout.
            # Deci după orice eșec pagina se aruncă și se pornește una nouă.
            row = {**it, 'm': {'err': str(e)[:150]}}
            out.append(row); log.write(json.dumps(row) + '\n'); log.flush()
            try: pg.close()
            except Exception: pass
            pg = fresh()
        if k % 20 == 0: print(f"  {lo}+{k}/{len(items)}", flush=True)
    br.close()
"""


def measure(cands: list[dict], reuse: bool) -> list[dict]:
    lab = f"{CACHE}/lab"
    done = f"{lab}/metrics.json"
    if reuse and os.path.exists(done):
        print("  (refolosesc măsurătorile din cache)")
        return json.load(open(done))

    os.makedirs(f"{lab}/presets", exist_ok=True)
    shutil.copy(f"{CACHE}/butterchurn.min.js", lab)
    open(f"{lab}/probe.html", "w").write(PROBE_HTML)
    open(f"{lab}/shard.py", "w").write(SHARD)
    for c in cands:
        json.dump(c["p"], open(f"{lab}/presets/{c['i']:04d}.json", "w"))
    json.dump([{k: c[k] for k in ("i", "name", "src", "pre")} for c in cands],
              open(f"{lab}/index.json", "w"))

    step = -(-len(cands) // SHARDS)
    t0 = time.time()
    procs = [subprocess.Popen([sys.executable, f"{lab}/shard.py", lab,
                               str(lo), str(lo + step), str(MS)])
             for lo in range(0, len(cands), step)]
    for p in procs:
        p.wait()
    # Măsurătorile se adună din toate fișierele scrise pe parcurs, indiferent cum
    # au fost împărțite shard-urile la rulările anterioare.
    rows = {}
    for f in sorted(os.listdir(lab)):
        if f.endswith(".jsonl"):
            for line in open(f"{lab}/{f}"):
                r = json.loads(line)
                rows[r["i"]] = r
    rows = [rows[i] for i in sorted(rows)]
    json.dump(rows, open(done, "w"))
    print(f"  {len(rows)} presete randate în {int(time.time() - t0)} s")
    return rows


# ── nota finală, din ce a ieșit pe pânză ─────────────────────────────────────

def score(m: dict) -> tuple[float, str]:
    """Nota + motivul respingerii. Ordinea din pagină e criteriul lui Victor:
    întâi cele care țin mișcarea într-o bandă și lasă centrul liber."""
    if not m or m.get("err"):
        return -99, (m or {}).get("err", "fără măsurători")[:60]
    a, b, d = m["a"], m["b"], m["d"]
    mean = (a["mean"] + b["mean"] + d["mean"]) / 3
    ring = (a["ring"] + b["ring"] + d["ring"]) / 3
    ctr = (a["center"] + b["center"] + d["center"]) / 3
    ink = (b["ink"] + d["ink"]) / 2
    # mișcare: cât se schimbă imaginea între capturi (celule de 25×25 px)
    move = max(sum(abs(x - y) for x, y in zip(a["grid"], b["grid"])) / len(a["grid"]),
               sum(abs(x - y) for x, y in zip(b["grid"], d["grid"])) / len(b["grid"]))
    if mean < 0.012:            return -50, f"negru ({mean:.3f})"
    if move < 0.006:            return -40, f"înghețat ({move:.4f})"
    if ink > 0.88 or mean > 0.5: return -30, f"umple cadrul ({ink:.2f}/{mean:.2f})"
    # centrul liber: inelul aprins, mijlocul stins
    free = (ring - ctr) / max(ring, 0.02)
    return (free * 2.2                       # criteriul de ordonare al paginii
            + min(ring, 0.35) * 2.0          # dar să se și vadă ceva în bandă
            + min(move, 0.06) * 6.0          # și să fie viu
            - max(0, ink - 0.55) * 3.0), ""  # fără vopsea pe tot ecranul


def pinned_presets() -> dict:
    """Presetele fixate în FORMULAS (index.html) — singurele de care mai avem
    nevoie din pachetele oficiale. Se citesc din pagină, ca să nu rămână în urmă
    când adaugi sau scoți un efect."""
    page = open(os.path.join(ROOT, "index.html")).read()
    names = re.findall(r"preset:\s*'((?:[^'\\]|\\.)*)'", page)
    names = [n.replace("\\'", "'") for n in dict.fromkeys(names)]
    official = node_packs(OFFICIAL_BASE + OFFICIAL_NEW)
    out, missing = {}, []
    for n in names:
        (out.setdefault(n, official[n]) if n in official else missing.append(n))
    if missing:
        sys.exit("presete fixate în index.html care nu există în pachete: " + repr(missing))
    return out


def write_pack(rows: list[dict], cands: list[dict], keep: int) -> None:
    by_i = {c["i"]: c for c in cands}
    graded = []
    for r in rows:
        s, why = score(r.get("m"))
        graded.append({**r, "score": s, "why": why})
    ok = sorted([g for g in graded if not g["why"]], key=lambda g: -g["score"])[:keep]

    pins = pinned_presets()
    everything = {g["name"]: by_i[g["i"]]["p"] for g in ok}
    everything.update(pins)     # cele fixate în FORMULAS, dar NU la răsfoire
    body = ",\n".join(f"{json.dumps(n)}:{json.dumps(p, separators=(',', ':'))}"
                       for n, p in everything.items())
    open(OUT, "w").write(
        "// Generat de ./build-presets.py — nu edita de mână.\n"
        "//\n"
        "// `haloBrowse` = presetele prin care treci cu degetul în modul MilkDrop:\n"
        "// toate NOI față de cele 103 din pachetele oficiale base+extra, pe care\n"
        "// le-ai răsfoit deja o dată. Ordinea e măsurată, nu ghicită: fiecare a fost\n"
        "// randat cu butterchurn și notat după cât lasă centrul liber.\n"
        "// `haloPresets` mai conține, în plus, presetele fixate în FORMULAS — scoase\n"
        "// din pachetele oficiale, ca pagina să nu mai aducă 1,5 MB pentru nouă presete.\n"
        "//\n"
        "// Surse: ansorre/tens-of-thousands-milkdrop-presets-for-butterchurn și\n"
        "// butterchurn-presets@2.4.7 (packs Extra2 + MD1, MIT) — presete MilkDrop\n"
        "// scrise de comunitate, redistribuite ca în projectM.\n"
        f"window.haloPresets = {{\n{body}\n}};\n"
        f"window.haloBrowse = {json.dumps([g['name'] for g in ok], ensure_ascii=False)};\n")

    rej = {}
    for g in graded:
        if g["why"]:
            rej[g["why"].split(" ")[0]] = rej.get(g["why"].split(" ")[0], 0) + 1
    kb = os.path.getsize(OUT) // 1024
    print(f"\n{len(ok)} presete de răsfoit + {len(pins)} fixate → halo-presets.js ({kb} KB)")
    print("respinse la randare: " + ", ".join(f"{k} {v}" for k, v in sorted(rej.items())))
    print("\nprimele 15:")
    for g in ok[:15]:
        print(f"  {g['score']:5.2f}  {g['name'][:60]}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pool", type=int, default=760, help="câți candidați se randează")
    ap.add_argument("--keep", type=int, default=160, help="câte presete intră în pachet")
    ap.add_argument("--reuse", action="store_true", help="refolosește măsurătorile din cache")
    a = ap.parse_args()

    print("surse:")
    download()
    print("candidați:")
    cands = candidates(a.pool)
    print("randare (Chromium headless, același semnal audio pentru toate):")
    rows = measure(cands, a.reuse)
    write_pack(rows, cands, a.keep)


if __name__ == "__main__":
    main()
