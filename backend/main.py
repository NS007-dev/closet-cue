"""ClosetCue backend: FastAPI + SQLite + a local open-weight model (Gemma via Ollama).
AI: reads clothing photos, proposes outfits, explains them.
Plain code: storage, history, repeat-prevention, validation, ranking."""
import base64, io, json, os, queue, random, sqlite3, threading, uuid
from datetime import date, timedelta
from pathlib import Path

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps
from pydantic import BaseModel

OLLAMA = os.getenv("OLLAMA_URL", "http://localhost:11434")
MODEL = os.getenv("CLOSETCUE_MODEL", "gemma4:e4b")
BASE = Path(__file__).parent
UPLOADS = BASE / "uploads"
UPLOADS.mkdir(exist_ok=True)
CATS = ["Top", "Bottom", "Dress", "Shoes", "Outerwear", "Accessory"]

def conn():
    c = sqlite3.connect(BASE / "closetcue.db")
    c.row_factory = sqlite3.Row
    return c

def rows(sql, args=()):
    with conn() as c:
        return [dict(r) for r in c.execute(sql, args).fetchall()]

def run(sql, args=()):
    with conn() as c:
        return c.execute(sql, args).lastrowid

run("""CREATE TABLE IF NOT EXISTS items(id INTEGER PRIMARY KEY, image TEXT, category TEXT, type TEXT,
colour TEXT, pattern TEXT, style TEXT, season TEXT, reviewed INTEGER DEFAULT 0)""")
run("""CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY, day TEXT, occasion TEXT,
item_ids TEXT, worn INTEGER, reason TEXT)""")
run("CREATE TABLE IF NOT EXISTS profile(id INTEGER PRIMARY KEY, data TEXT)")

app = FastAPI(title="ClosetCue")
app.mount("/uploads", StaticFiles(directory=UPLOADS), name="uploads")

# ---------- AI (Ollama) ----------
def ask(prompt, image_b64=None, timeout=240):
    msg = {"role": "user", "content": prompt}
    if image_b64:
        msg["images"] = [image_b64]
    r = httpx.post(f"{OLLAMA}/api/chat", timeout=timeout, json={
        "model": MODEL, "messages": [msg], "stream": False, "format": "json",
        "keep_alive": "30m", "options": {"temperature": 0.4}})
    r.raise_for_status()
    return json.loads(r.json()["message"]["content"])

def analyse(b64):
    prompt = ("You label ONE clothing item for a wardrobe app. Reply with JSON only: "
              '{"category":"Top|Bottom|Dress|Shoes|Outerwear|Accessory","type":"e.g. sweater",'
              '"colour":"main colour","pattern":"Solid|Striped|Floral|Plaid|Graphic|Other",'
              '"style":"Casual|Feminine|Trendy|Minimal|Streetwear|Sporty|Vintage|Preppy",'
              '"season":"Spring/Summer|Fall/Winter|All year"}')
    try:
        d = ask(prompt, b64)
    except Exception:
        return {}
    cat = next((c for c in CATS if c.lower() == str(d.get("category", "")).lower()), "Top")
    return {"category": cat, "type": str(d.get("type", ""))[:40], "colour": str(d.get("colour", ""))[:30],
            "pattern": str(d.get("pattern", "Solid"))[:20], "style": str(d.get("style", "Casual"))[:20],
            "season": str(d.get("season", "All year"))[:20]}

@app.get("/api/health")
def health():
    try:
        names = [m["name"] for m in httpx.get(f"{OLLAMA}/api/tags", timeout=2).json()["models"]]
        return {"ai": MODEL in names or f"{MODEL}:latest" in names, "model": MODEL}
    except Exception:
        return {"ai": False, "model": MODEL}

# ---------- Wardrobe ----------
class ItemIn(BaseModel):
    category: str
    type: str = ""
    colour: str = ""
    pattern: str = "Solid"
    style: str = "Casual"
    season: str = "All year"

@app.get("/api/items")
def list_items():
    return rows("SELECT * FROM items ORDER BY id DESC")

@app.post("/api/items")
def add_item(file: UploadFile = File(...)):
    try:
        img = ImageOps.exif_transpose(Image.open(file.file)).convert("RGB")
    except Exception:
        raise HTTPException(400, "I couldn't read that photo. Try a JPG or PNG.")
    img.thumbnail((900, 900))
    name = f"{uuid.uuid4().hex}.jpg"
    img.save(UPLOADS / name, quality=88)
    # Save instantly; the AI reads the photo in the background queue (see bottom of file).
    new_id = run("INSERT INTO items(image,category,type,colour,pattern,style,season,status) VALUES(?,?,?,?,?,?,?,'pending')",
                 (name, "Top", "", "", "Solid", "Casual", "All year"))
    jobs.put(new_id)
    return rows("SELECT * FROM items WHERE id=?", (new_id,))[0]

@app.patch("/api/items/{item_id}")
def edit_item(item_id: int, b: ItemIn):
    if b.category not in CATS:
        raise HTTPException(400, "Unknown category")
    run("UPDATE items SET category=?,type=?,colour=?,pattern=?,style=?,season=?,reviewed=1 WHERE id=?",
        (b.category, b.type, b.colour, b.pattern, b.style, b.season, item_id))
    return {"ok": True}

@app.delete("/api/items/{item_id}")
def delete_item(item_id: int):
    for r in rows("SELECT image FROM items WHERE id=?", (item_id,)):
        (UPLOADS / r["image"]).unlink(missing_ok=True)
    run("DELETE FROM items WHERE id=?", (item_id,))
    return {"ok": True}

# ---------- Style profile ----------
@app.get("/api/profile")
def get_profile():
    r = rows("SELECT data FROM profile WHERE id=1")
    return json.loads(r[0]["data"]) if r else {"styles": [], "vibes": []}

@app.put("/api/profile")
def put_profile(p: dict):
    data = {"styles": list(p.get("styles", [])), "vibes": list(p.get("vibes", []))}
    run("INSERT INTO profile(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
        (json.dumps(data),))
    return data

# ---------- History ----------
class Log(BaseModel):
    occasion: str = "School"
    item_ids: list[int]
    worn: bool = True
    reason: str = ""

@app.post("/api/history")
def log(b: Log):
    today = date.today().isoformat()
    if b.worn:  # one worn outfit per day
        run("DELETE FROM history WHERE day=? AND worn=1", (today,))
    run("INSERT INTO history(day,occasion,item_ids,worn,reason) VALUES(?,?,?,?,?)",
        (today, b.occasion, json.dumps(sorted(b.item_ids)), int(b.worn), b.reason))
    return {"ok": True}

@app.get("/api/history")
def history():
    by = {i["id"]: i for i in rows("SELECT * FROM items")}
    out = []
    for h in rows("SELECT * FROM history WHERE worn=1 ORDER BY day DESC, id DESC"):
        items = [by[i] for i in json.loads(h["item_ids"]) if i in by]
        if items:
            out.append({"id": h["id"], "day": h["day"], "occasion": h["occasion"], "items": items})
    return {"today": date.today().isoformat(), "entries": out}

# ---------- Outfit generation ----------
class OutfitReq(BaseModel):
    occasion: str = "School"
    anchor_id: int | None = None
    exclude: list[list[int]] = []

def last_worn():
    out = {}
    for h in rows("SELECT day,item_ids FROM history WHERE worn=1 ORDER BY day"):
        for i in json.loads(h["item_ids"]):
            out[i] = h["day"]
    return out

def valid(ids, by, anchor):
    if not ids or any(i not in by for i in ids) or len(set(ids)) != len(ids):
        return False
    if anchor and anchor["id"] not in ids:
        return False
    cats = [by[i]["category"] for i in ids]
    has_shoes = any(v["category"] == "Shoes" for v in by.values())
    base = ("Dress" in cats and "Top" not in cats and "Bottom" not in cats) or ("Top" in cats and "Bottom" in cats and "Dress" not in cats)
    return base and ("Shoes" in cats or not has_shoes) and all(cats.count(c) <= 1 for c in CATS[:4])

def random_outfit(g, anchor):
    pick = {}
    cat = anchor["category"] if anchor else None
    if cat in ("Top", "Bottom", "Dress", "Shoes", "Outerwear"):
        pick[cat] = anchor
    if "Dress" in pick or (not pick.keys() & {"Top", "Bottom"} and g["Dress"] and random.random() < .3):
        pick.setdefault("Dress", random.choice(g["Dress"]))
    else:
        for c in ("Top", "Bottom"):
            if c not in pick and g[c]:
                pick[c] = random.choice(g[c])
    if "Shoes" not in pick and g["Shoes"]:
        pick["Shoes"] = random.choice(g["Shoes"])
    if "Outerwear" not in pick and g["Outerwear"] and random.random() < .35:
        pick["Outerwear"] = random.choice(g["Outerwear"])
    ids = [v["id"] for v in pick.values()]
    if anchor and anchor["id"] not in ids:
        ids.append(anchor["id"])
    return ids

def ai_outfits(items, prof, occasion, anchor, banned, dislikes):
    wardrobe = "\n".join(f'{i["id"]}: {i["category"]} | {i["type"]} | {i["colour"]} | {i["pattern"]} | {i["style"]} | {i["season"]}' for i in items)
    prompt = f"""You are a kind, stylish personal stylist. Build 4 DIFFERENT outfits for: {occasion}.
Use ONLY item ids from the wardrobe. Each outfit = one dress OR one top + one bottom, plus shoes, optionally outerwear or an accessory. Colours must work together.
Her style: {', '.join(prof['styles']) or 'not set yet'}. Vibes: {', '.join(prof['vibes']) or 'not set yet'}.
{f'Build every outfit around item {anchor["id"]}.' if anchor else ''}
Do not repeat these combos: {[sorted(b) for b in list(banned)[:6]]}. Things she disliked before: {dislikes or 'nothing yet'}.
Wardrobe (id: category | type | colour | pattern | style | season):
{wardrobe}
Reply JSON only: {{"outfits":[{{"items":[ids],"why":"one warm sentence on why it suits her"}}]}}"""
    try:
        d = ask(prompt, timeout=25)  # don't keep her waiting: fall back to simple mode
        return [([int(x) for x in o["items"]], str(o.get("why", ""))[:220]) for o in d["outfits"]]
    except Exception:
        return []

@app.post("/api/outfits")
def outfits(r: OutfitReq):
    items = rows("SELECT * FROM items WHERE status!='pending'")
    by = {i["id"]: i for i in items}
    anchor = by.get(r.anchor_id)
    prof, worn, today = get_profile(), last_worn(), date.today()
    recent = {frozenset(json.loads(h["item_ids"])) for h in rows(
        "SELECT item_ids FROM history WHERE worn=1 AND day>=?", ((today - timedelta(days=14)).isoformat(),))}
    banned = recent | {frozenset(e) for e in r.exclude}  # hard rule: no repeated complete outfits
    dislikes = "; ".join(x["reason"] for x in rows(
        "SELECT reason FROM history WHERE worn=0 AND reason!='' ORDER BY id DESC LIMIT 5"))
    cands = [(ids, why, "ai") for ids, why in ai_outfits(items, prof, r.occasion, anchor, banned, dislikes)] if len(items) >= 3 and jobs.empty() else []
    g = {c: [i for i in items if i["category"] == c] for c in CATS}
    cands += [(random_outfit(g, anchor), "A fresh mix of pieces you haven't worn lately.", "simple") for _ in range(80)]
    seen, scored = set(), []
    for ids, why, src in cands:
        key = frozenset(ids)
        if key in banned or key in seen or not valid(ids, by, anchor):
            continue
        seen.add(key)
        fresh = sum(min((today - date.fromisoformat(worn[i])).days, 14) if i in worn else 14 for i in ids) / len(ids) / 14
        match = sum(by[i]["style"] in prof["styles"] for i in ids) / len(ids) if prof["styles"] else .5
        scored.append((fresh * 2 + match + random.random() * .3 + (.8 if src == "ai" else 0), ids, why, src))
    scored.sort(key=lambda s: s[0], reverse=True)
    return {"outfits": [{"item_ids": i, "why": w, "source": s} for _, i, w, s in scored[:3]]}


# ---------- Background photo reader (survives page reloads and server restarts) ----------
try:
    run("ALTER TABLE items ADD COLUMN status TEXT DEFAULT 'done'")
except sqlite3.OperationalError:
    pass  # column already exists

jobs = queue.Queue()

def worker():
    while True:
        item_id = jobs.get()
        try:
            r = rows("SELECT image FROM items WHERE id=? AND status='pending'", (item_id,))
            if not r:
                continue
            im = Image.open(UPLOADS / r[0]["image"])
            im.thumbnail((448, 448))
            buf = io.BytesIO()
            im.save(buf, "JPEG")
            m = {"category": "Top", "type": "", "colour": "", "pattern": "Solid", "style": "Casual",
                 "season": "All year", **analyse(base64.b64encode(buf.getvalue()).decode())}
            run("UPDATE items SET category=?,type=?,colour=?,pattern=?,style=?,season=?,status='done' WHERE id=?",
                (m["category"], m["type"], m["colour"], m["pattern"], m["style"], m["season"], item_id))
        except Exception:
            run("UPDATE items SET status='done' WHERE id=?", (item_id,))
        finally:
            jobs.task_done()

threading.Thread(target=worker, daemon=True).start()
for r in rows("SELECT id FROM items WHERE status='pending'"):
    jobs.put(r["id"])
