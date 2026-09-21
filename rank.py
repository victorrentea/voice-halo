"""Nota și ordinea presetelor, măsurate — și calibrate pe ce ai aprobat deja.

Importat de build-presets.py. E fișier separat fiindcă aici stă TOT ce ține de
gust, iar gustul se schimbă mai des decât conducta care descarcă și randează.

Cum se dă nota: nu după o formulă inventată de mine, ci după **distanța față de
presetele pe care le-ai aprobat tu** în FORMULAS (★, • și cele fără semn) —
măsurate cu exact aceeași sondă ca toți candidații. Cele marcate `−` (respinse
de tine: Silk, Nova, Royal, Mosaic) sunt referința negativă, și ele contează:
un candidat care seamănă cu ele e împins în jos.

Ce se măsoară, în cuvintele tale:
  · „fum subtil, delicat"      → `mean` și `ink` mici (puțină lumină, puțină vopsea)
  · „să lase centrul liber"    → `free`, luminanța din inel față de cea din disc
  · „nu înghețat"              → `move`, cât se schimbă imaginea între capturi
  · „să nu se dezvolte progresiv, să apară din multe părți deodată"
                               → `growth`, cât crește lumina de la prima captură
                                 la ultima; un preset care se construiește încet
                                 are growth mare, unul care apare deodată, mic

Ce se respinge de tot: negru, înghețat, sau nici nu s-a încărcat. **Cele care
umplu tot ecranul NU se mai resping** — intră în listă, dar la coadă, după tot
ce e subtil.
"""

import math

# cât valorează o unitate din fiecare trăsătură, ca să fie comparabile între ele
SCALE = {"mean": 0.12, "ink": 0.22, "free": 0.45, "move": 0.025, "growth": 0.55}
FEATURES = list(SCALE)

# de la ce încolo un preset „umple cadrul" și pleacă la coada listei
FLOOD_INK, FLOOD_MEAN = 0.88, 0.5


def features(m: dict) -> dict | None:
    """Trăsăturile unei sonde: trei capturi la 55%, 80% și 100% din durată."""
    if not m or m.get("err") or not m.get("b"):
        return None
    a, b, d = m["a"], m["b"], m["d"]
    mean = (a["mean"] + b["mean"] + d["mean"]) / 3
    ring = (a["ring"] + b["ring"] + d["ring"]) / 3
    ctr = (a["center"] + b["center"] + d["center"]) / 3
    grid = lambda x, y: sum(abs(p - q) for p, q in zip(x["grid"], y["grid"])) / len(x["grid"])
    return {
        "mean": mean,
        "ink": (b["ink"] + d["ink"]) / 2,
        "free": (ring - ctr) / max(ring, 0.02),
        "move": max(grid(a, b), grid(b, d)),
        "growth": (d["mean"] - a["mean"]) / max(a["mean"], 0.01),
    }


def reject(f: dict) -> str:
    """Doar defectele: ce arată prost e treaba notei, nu a respingerii."""
    if f["mean"] < 0.012:
        return f"negru ({f['mean']:.3f})"
    if f["move"] < 0.006:
        return f"înghețat ({f['move']:.4f})"
    return ""


def floods(f: dict) -> bool:
    return f["ink"] > FLOOD_INK or f["mean"] > FLOOD_MEAN


def centroid(rows: list[dict]) -> dict:
    return {k: sum(r[k] for r in rows) / len(rows) for k in FEATURES}


def distance(f: dict, c: dict) -> float:
    return math.sqrt(sum(((f[k] - c[k]) / SCALE[k]) ** 2 for k in FEATURES))


def profile(refs: dict) -> tuple[dict, dict | None]:
    """`refs` = {nume din FORMULAS: trăsături}. Întoarce ținta și anti-ținta."""
    good = [f for n, f in refs.items() if not n.lstrip().startswith("−")]
    bad = [f for n, f in refs.items() if n.lstrip().startswith("−")]
    if not good:
        raise SystemExit("niciun preset aprobat măsurat — nu am pe ce calibra")
    return centroid(good), (centroid(bad) if bad else None)


def grade(f: dict, target: dict, anti: dict | None) -> float:
    """Cu cât mai aproape de ce ai aprobat și mai departe de ce ai respins."""
    s = -distance(f, target)
    if anti:
        s += 0.35 * min(distance(f, anti), 6.0)
    return s
