#!/usr/bin/env python3
"""Regenerează galeria: un clip de câteva secunde din fiecare efect, plus pagina.

    ./build-gallery.py                 # tot, exact ca în galeria publicată
    ./build-gallery.py --only Pulse Eclipse
    ./build-gallery.py --seconds 5 --fps 15

De ce un script și nu comenzi ad-hoc: galeria se reface după fiecare rundă de
review, iar capturile trebuie făcute în EXACT aceleași condiții, altfel cardurile
nu mai sunt comparabile între ele. Condițiile care contează, toate fixate aici:

  · microfon fals al Chrome-ului (`--use-fake-device-for-media-stream`), deci
    fiecare efect vede același semnal — altfel unul pare viu și altul mort doar
    fiindcă s-a nimerit liniște;
  · `body.bare`, ca să nu intre butoanele în cadru, și cursorul ascuns;
  · un timp de așezare mult mai lung pentru presetele MilkDrop: motorul se
    încarcă o dată (~1 MB) și presetul are nevoie de secunde bune ca să-și
    construiască feedback-ul. Fără asta prinzi un cadru aproape gol.

Iese MP4, nu GIF: aceleași trei secunde ocupă ~20 KB în loc de ~700 KB, iar
`<video autoplay loop muted playsinline>` se comportă pe telefon exact ca un GIF.
"""

import argparse, functools, http.server, json, os, re, shutil, socketserver, subprocess, sys, threading

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "galerie")
FRAMES = "/tmp/voice-halo-frames"

# cât așteptăm după ce alegem efectul, până începem să filmăm
SETTLE_OWN = 4.5        # efectele proprii sunt pornite instantaneu
SETTLE_PRESET = 11.0    # presetele: încărcat motorul + construit feedback-ul


def build(seconds: float, fps: int, only: list[str], keep_marked: bool) -> None:
    from playwright.sync_api import sync_playwright

    os.chdir(ROOT)
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)

    class Quiet(socketserver.TCPServer):
        allow_reuse_address = True
        def handle_error(self, *a): pass

    httpd = Quiet(("127.0.0.1", 0), handler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    os.makedirs(OUT, exist_ok=True)
    items = []

    with sync_playwright() as p:
        browser = p.chromium.launch(args=[
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            "--autoplay-policy=no-user-gesture-required",
        ])
        ctx = browser.new_context(viewport={"width": 760, "height": 760},
                                  device_scale_factor=1, permissions=["microphone"])
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"http://127.0.0.1:{port}/index.html")
        page.wait_for_timeout(900)
        page.click("#mic")
        page.wait_for_timeout(700)
        page.evaluate("document.body.classList.add('bare');"
                      "document.getElementById('cursor').style.display = 'none'")

        meta = page.evaluate("FORMULAS.map(f => ({name: f.name, desc: f.desc || '',"
                             " preset: !!f.preset, scene: !!f.water}))")
        for i, m in enumerate(meta):
            name = m["name"]
            bare = name.lstrip("★•− ").strip()
            if not keep_marked and name.lstrip().startswith("−"):
                continue                      # respinse de Victor: nu intră în galerie
            if only and bare not in only:
                continue

            page.evaluate(f"pick({i})")
            page.wait_for_timeout(int((SETTLE_PRESET if m["preset"] else SETTLE_OWN) * 1000))

            shutil.rmtree(FRAMES, ignore_errors=True)
            os.makedirs(FRAMES)
            # Efectele-halo se încadrează bine într-un pătrat din centru. Cele care
            # sunt SCENE pe tot ecranul (Lagoon are linia apei la 80% din înălțime)
            # își pierd tocmai partea de jos dacă le decupezi centrul — se capturează
            # toată fereastra, altfel cardul arată mult mai sărac decât efectul.
            clip = ({"x": 0, "y": 0, "width": 760, "height": 760} if m["scene"]
                    else {"x": 80, "y": 80, "width": 600, "height": 600})
            # Un efect cu `fade` desenează pe o pânză cu mască radială, iar o captură
            # de-a lui poate depăși cu mult timeout-ul implicit de 30 s al lui
            # Playwright pe o mașină încărcată — ★ Sigil pică acolo de fiecare dată.
            # Capturile sunt oricum secvențiale, deci un timeout mare nu costă nimic
            # la efectele rapide: se așteaptă exact cât durează.
            for k in range(int(seconds * fps)):
                page.screenshot(path=f"{FRAMES}/f{k:04d}.png", clip=clip, timeout=180_000)

            mp4 = f"{OUT}/{i+1:02d}.mp4"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(fps),
                            "-i", f"{FRAMES}/f%04d.png", "-vf", "scale=300:300",
                            "-c:v", "libx264", "-preset", "veryfast", "-crf", "30",
                            "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4],
                           check=True)
            # posterul: primul cadru servit cât timp se încarcă videoul
            page.screenshot(path=f"{OUT}/{i+1:02d}.png", clip=clip, timeout=180_000)

            mark = "★" if name.startswith("★") else "•" if name.startswith("•") else ""
            items.append({"n": i + 1, "nume": bare, "mark": mark,
                          "desc": m["desc"], "preset": m["preset"]})
            print(f"  {bare:<12} {os.path.getsize(mp4)//1024:>4} KB", flush=True)

        browser.close()

    if errors:
        print("!! erori în pagină:", errors[:3], file=sys.stderr)

    # O rulare parțială (`--only`) trebuie să ÎMBINE, nu să înlocuiască: altfel
    # regenerarea unui singur efect ștergea restul galeriei din pagină. O rulare
    # ÎNTREAGĂ e însă lista autoritară: dacă îmbină, un efect scos din FORMULAS
    # rămâne în galerie pe vecie, cu clipul lui cu tot.
    index = os.path.join(OUT, "lista.json")
    if only:
        known = {}
        if os.path.exists(index):
            known = {it["n"]: it for it in json.load(open(index))}
        known.update({it["n"]: it for it in items})
        items = [known[k] for k in sorted(known)]
    else:
        live = {it["n"] for it in items}
        for f in sorted(os.listdir(OUT)):
            m = re.fullmatch(r"(\d+)\.(mp4|png)", f)
            if m and int(m.group(1)) not in live:
                os.remove(os.path.join(OUT, f))
                print(f"  (scos din galerie: {f})")
    json.dump(items, open(index, "w"), ensure_ascii=False)

    write_page(items)
    total = sum(os.path.getsize(f"{OUT}/{it['n']:02d}.mp4") for it in items
                if os.path.exists(f"{OUT}/{it['n']:02d}.mp4"))
    print(f"\n{len(items)} efecte, {total//1024} KB de clipuri → galerie.html")


def write_page(items: list[dict]) -> None:
    cards = []
    for it in items:
        mark = f'<i>{it["mark"]}</i>' if it["mark"] else ""
        bolt = "⚡ " if it["preset"] else ""
        cards.append(f'''  <figure>
    <video src="galerie/{it['n']:02d}.mp4" poster="galerie/{it['n']:02d}.png"
           autoplay loop muted playsinline preload="none"></video>
    <figcaption><b>{bolt}{it['nume']}</b>{mark}<span>{it['desc']}</span></figcaption>
  </figure>''')

    open(os.path.join(ROOT, "galerie.html"), "w").write(f'''<!doctype html>
<html lang="ro">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Voice Halo — efecte</title>
<style>
  :root {{ color-scheme: dark }}
  body {{ margin: 0; padding: 18px 14px 48px; background: #05070a; color: #cfd6de;
         font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif }}
  h1 {{ font-size: 17px; margin: 0 0 4px }}
  p.sub {{ margin: 0 0 20px; color: #7f8894; font-size: 12px }}
  .grid {{ display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)) }}
  figure {{ margin: 0; background: #0b0f15; border: 1px solid #1d242d; border-radius: 12px; overflow: hidden }}
  video {{ width: 100%; display: block; aspect-ratio: 1; object-fit: cover; background: #000 }}
  figcaption {{ padding: 9px 11px 12px; display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px }}
  figcaption b {{ font-size: 15px; color: #e7edf5 }}
  figcaption i {{ font-style: normal; color: #7fc9ff; font-size: 12px }}
  figcaption span {{ flex: 1 0 100%; font-size: 11px; color: #79828e }}
  a {{ color: #7fc9ff }}
</style>
<h1>Voice Halo — efecte</h1>
<p class="sub">Trei secunde din fiecare, înregistrate din pagina reală cu semnal de test.
  ⚡ = preset MilkDrop rulat cu motorul lui · ★ îmi place mult · • are potențial ·
  cele marcate − lipsesc, nu se implementează. · <a href="./">deschide halo-ul</a></p>
<div class="grid">
{chr(10).join(cards)}
</div>
</html>
''')


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--seconds", type=float, default=3.0, help="lungimea clipului (3)")
    ap.add_argument("--fps", type=int, default=12, help="cadre pe secundă (12)")
    ap.add_argument("--only", nargs="*", default=[], metavar="NUME",
                    help="doar efectele astea, după numele scurt")
    ap.add_argument("--keep-marked", action="store_true",
                    help="include și efectele marcate cu − (implicit sunt sărite)")
    a = ap.parse_args()
    build(a.seconds, a.fps, a.only, a.keep_marked)
