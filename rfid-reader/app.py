#!/usr/bin/env python3
import os, time, json, uuid, random, requests
import RPi.GPIO as GPIO
from mfrc522 import SimpleMFRC522
from RPLCD.i2c import CharLCD
import subprocess

# --- Config from environment (with safe defaults)
LED_RED_PIN = int(os.getenv("LED_RED_PIN", "17"))
LED_BLUE_PIN = int(os.getenv("LED_BLUE_PIN", "27"))          # ok if not wired
LED_ACTIVE_HIGH = os.getenv("LED_ACTIVE_HIGH", "1") == "1"   # set 0 to invert
BLUE_HOLD_SECONDS = float(os.getenv("BLUE_HOLD_SECONDS", "5"))
LCD_ENABLED = os.getenv("LCD_ENABLED", "1") == "1"
LCD_ADDR = int(os.getenv("LCD_I2C_ADDRESS", "0x27"), 16)
API_BASE = os.getenv("API_BASE_URL", "http://api:8000")      # compose service
BUZZER_ENABLED = os.getenv("BUZZER_ENABLED", "1") == "1"
RANDOM_IDS = os.getenv("RANDOM_IDS", "0") == "1"
BUS_POOL = [b for b in os.getenv("BUS_POOL", "BUS-A,BUS-B,BUS-C").split(",") if b]

# --- Helpers
def led_on(pin):
    if pin is None: return
    GPIO.output(pin, GPIO.HIGH if LED_ACTIVE_HIGH else GPIO.LOW)

def led_off(pin):
    if pin is None: return
    GPIO.output(pin, GPIO.LOW if LED_ACTIVE_HIGH else GPIO.HIGH)

def lcd_msg(l1, l2=""):
    if lcd is None:
        # fallback to logs
        if l2:
            print(f"LCD: {l1} | {l2}")
        else:
            print(f"LCD: {l1}")
        return

    lcd.clear()
    lcd.write_string((l1 or "")[:16])
    if l2:
        lcd.crlf()
        lcd.write_string((l2 or "")[:16])

def load_map():
    try:
        with open("/app/drivers.json", "r") as f:
            return json.load(f)
    except Exception:
        return {}

def pick_ids(uid_hex: str):
    if RANDOM_IDS:
        drv = f"DRV-{uuid.uuid4().hex[:8]}"
        bus = random.choice(BUS_POOL) if BUS_POOL else "BUS-A"
        return drv, bus
    m = load_map()
    if uid_hex in m:
        return m[uid_hex]["driver_id"], m[uid_hex]["bus_id"]
    return f"DRV-{uid_hex}", "BUS-A"  # fallback

def post_event(driver_id, bus_id, uid_hex=None):
    url = f"{API_BASE}/events"
    payload = {"driver_id": driver_id, "bus_id": bus_id, "status": "leaving"}
# NEW: include UID for tracking
    if os.getenv("SEND_UID", "0") == "1":
        payload["uid"] = uid_hex
# Route/Stop handling
    routes = [r.strip() for r in os.getenv("ROUTE_POOL", "R1,R2,R3").split(",") if r.strip()]
    stops  = [s.strip() for s in os.getenv("STOP_POOL", "").split(",") if s.strip()]

    if os.getenv("RANDOM_ROUTE", "0") == "1":
        payload["route_id"] = random.choice(routes)
        if stops:
            payload["stop_id"] = random.choice(stops)
    else:
        route_id = os.getenv("ROUTE_ID")
        stop_id = os.getenv("STOP_ID")
        if route_id:
            payload["route_id"] = route_id
        if stop_id:
            payload["stop_id"] = stop_id
    try:
        r = requests.post(url, json=payload, timeout=4)
        print("POST", r.status_code, r.text[:200])
    except Exception as e:
        print("POST failed:", e)

def buzz_ok():
    if not BUZZER_ENABLED:
        return
    ms = os.getenv("BUZZER_OK_MS", "80")
    subprocess.run(["python3", "/app/buzz.py", ms], check=False)

def buzz_error():
    if not BUZZER_ENABLED:
        return
    ms = os.getenv("BUZZER_ERROR_MS", "200")
    subprocess.run(["python3", "/app/buzz.py", ms], check=False)

# --- Init hardware
GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)
GPIO.setup(LED_RED_PIN, GPIO.OUT, initial=GPIO.LOW if LED_ACTIVE_HIGH else GPIO.HIGH)
GPIO.setup(LED_BLUE_PIN, GPIO.OUT, initial=GPIO.LOW if LED_ACTIVE_HIGH else GPIO.HIGH)

# Start in "STOP" -> red ON, blue OFF
led_on(LED_RED_PIN)

led_off(LED_BLUE_PIN)

lcd = None
if LCD_ENABLED:
    try:
        lcd = CharLCD(i2c_expander="PCF8574", address=LCD_ADDR, port=1, cols=16, rows=2)
    except Exception as e:
        print(f"LCD disabled (init failed): {e}")
        lcd = None
else:
    print("LCD disabled by env (LCD_ENABLED=0)")

reader = SimpleMFRC522()  # SPI0 CE0, RST=GPIO25 by default

print("Reader ready. Tap a card...")
try:
    while True:
        uid, _ = reader.read()
        uid_hex = format(uid, "x")
        print("UID:", uid_hex)

        driver_id, bus_id = pick_ids(uid_hex)

        # Signal departure: red OFF, blue ON, show success
        led_off(LED_RED_PIN)
        led_on(LED_BLUE_PIN)
        lcd_msg("Updated", "successfully")

        print("DEBUG: about to buzz_ok()", flush=True)
        buzz_ok()

        post_event(driver_id, bus_id, uid_hex)

        # Hold "go" for a few seconds, then return to "stop"
        time.sleep(BLUE_HOLD_SECONDS)
        led_off(LED_BLUE_PIN)
        led_on(LED_RED_PIN)
        lcd_msg("Tap card ID")
        time.sleep(0.25)
except KeyboardInterrupt:
    pass
finally:
    GPIO.cleanup()



