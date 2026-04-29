import os, sqlite3, json, datetime
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

DB_PATH = os.getenv("DB_PATH", "/data/events.db")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

app = FastAPI(title="Bus Tap API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def init_db():
    with sqlite3.connect(DB_PATH) as con:
        con.execute("""
        CREATE TABLE IF NOT EXISTS events(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            driver_id TEXT NOT NULL,
            bus_id TEXT NOT NULL,
            status TEXT NOT NULL,
            uid TEXT,
            route_id TEXT,
            stop_id TEXT
        )
        """)
        con.execute("""
        CREATE TABLE IF NOT EXISTS tags(
            uid TEXT PRIMARY KEY,
            driver_id TEXT,
            bus_id TEXT,
            first_seen TEXT NOT NULL,
            last_seen TEXT NOT NULL,
            tap_count INTEGER NOT NULL DEFAULT 0
        )
        """)
        con.execute("""
        CREATE TABLE IF NOT EXISTS routes(
            route_id TEXT PRIMARY KEY,
            name TEXT NOT NULL
        )
        """)
        con.execute("""
        CREATE TABLE IF NOT EXISTS stops(
            stop_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            route_id TEXT NOT NULL
        )
        """)
        con.execute("INSERT OR IGNORE INTO routes(route_id,name) VALUES (?,?)", ("R1","Route 1"))
        con.execute("INSERT OR IGNORE INTO routes(route_id,name) VALUES (?,?)", ("R2","Route 2"))
        con.execute("INSERT OR IGNORE INTO routes(route_id,name) VALUES (?,?)", ("R3","Route 3"))
        con.execute("INSERT OR IGNORE INTO stops(stop_id,name,route_id) VALUES (?,?,?)",
            ("DOWNTOWN","Downtown Transit Center","R2"))

init_db()

class EventIn(BaseModel):
    driver_id: str
    bus_id: str
    status: str = "leaving"
    uid: Optional[str] = None
    route_id: Optional[str] = None
    stop_id: Optional[str] = None

subscribers: List[WebSocket] = []

async def broadcast(message: dict):
    dead = []
    for ws in list(subscribers):
        try:
            await ws.send_text(json.dumps(message))
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in subscribers:
            subscribers.remove(ws)

@app.post("/events")
async def post_event(ev: EventIn):
    ts = datetime.datetime.utcnow().isoformat() + "Z"

    # Tag tracking (optional)
    if ev.uid:
        with sqlite3.connect(DB_PATH) as con:
            con.execute("""
            INSERT INTO tags(uid, driver_id, bus_id, first_seen, last_seen, tap_count)
            VALUES (?, ?, ?, ?, ?, 1)
            ON CONFLICT(uid) DO UPDATE SET
                driver_id=excluded.driver_id,
                bus_id=excluded.bus_id,
                last_seen=excluded.last_seen,
                tap_count=tap_count+1
            """, (ev.uid, ev.driver_id, ev.bus_id, ts, ts))

    # Store event
    with sqlite3.connect(DB_PATH) as con:
        con.execute("""
        INSERT INTO events(ts,driver_id,bus_id,status,uid,route_id,stop_id)
        VALUES (?,?,?,?,?,?,?)
        """, (ts, ev.driver_id, ev.bus_id, ev.status, ev.uid, ev.route_id, ev.stop_id))

    data = {"ts": ts, **ev.dict()}
    await broadcast({"type": "event", "data": data})
    return {"ok": True, "data": data}

@app.get("/events")
def list_events(limit: int = 50):
    with sqlite3.connect(DB_PATH) as con:
        cur = con.execute("""
        SELECT ts,driver_id,bus_id,status,uid,route_id,stop_id
        FROM events
        ORDER BY id DESC
        LIMIT ?
        """, (limit,))
        rows = [
            {"ts": ts, "driver_id": d, "bus_id": b, "status": s, "uid": u, "route_id": r, "stop_id": st}
            for (ts, d, b, s, u, r, st) in cur.fetchall()
        ]
    return {"items": rows}

@app.get("/tags")
def list_tags():
    with sqlite3.connect(DB_PATH) as con:
        cur = con.execute("""
        SELECT uid,driver_id,bus_id,first_seen,last_seen,tap_count
        FROM tags
        ORDER BY last_seen DESC
        """)
        rows = [
            {"uid": u, "driver_id": d, "bus_id": b, "first_seen": fs, "last_seen": ls, "tap_count": c}
            for (u, d, b, fs, ls, c) in cur.fetchall()
        ]
    return {"items": rows}

@app.get("/routes")
def list_routes():
    with sqlite3.connect(DB_PATH) as con:
        cur = con.execute("SELECT route_id,name FROM routes ORDER BY route_id ASC")
        rows = [{"route_id": r, "name": n} for (r, n) in cur.fetchall()]
    return {"items": rows}

@app.post("/routes")
def add_route(route_id: str, name: str):
    with sqlite3.connect(DB_PATH) as con:
        con.execute("INSERT OR REPLACE INTO routes(route_id,name) VALUES (?,?)", (route_id, name))
    return {"ok": True}

@app.websocket("/ws")
async def ws(ws: WebSocket):
    await ws.accept()
    subscribers.append(ws)
    try:
        while True:
            await ws.receive_text()  # keepalive
    except Exception:
        pass
    finally:
        if ws in subscribers:
            subscribers.remove(ws)
