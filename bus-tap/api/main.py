import os, sqlite3, json, datetime
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
DB_PATH = os.getenv("DB_PATH", "/data/events.db")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
app = FastAPI(title="Bus Tap API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

def init_db():
    with sqlite3.connect(DB_PATH) as con:
        con.execute("""
        CREATE TABLE IF NOT EXISTS events(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            driver_id TEXT NOT NULL,
            bus_id TEXT NOT NULL,
            status TEXT NOT NULL
        )""")
init_db()
class EventIn(BaseModel):
    driver_id: str
    bus_id: str
    status: str = "leaving"
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
    with sqlite3.connect(DB_PATH) as con:
        con.execute("INSERT INTO events(ts,driver_id,bus_id,status) VALUES (?,?,?,?)",
                    (ts, ev.driver_id, ev.bus_id, ev.status))
    data = {"ts": ts, **ev.dict()}
    await broadcast({"type": "event", "data": data})
    return {"ok": True, "data": data}

@app.get("/events")
def list_events(limit: int = 50):
    with sqlite3.connect(DB_PATH) as con:
        cur = con.execute("SELECT ts,driver_id,bus_id,status FROM events ORDER BY id DESC LIMIT ?", (limit,))
        rows = [{"ts": ts, "driver_id": d, "bus_id": b, "status": s} for (ts,d,b,s) in cur.fetchall()]
    return {"items": rows}

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
