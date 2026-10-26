#!/usr/bin/env python3
import os
import psycopg
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

load_dotenv()

DB_HOST = os.getenv("POSTGRES_HOST", "localhost")
DB_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
DB_NAME = os.getenv("POSTGRES_DB", "hackpurush")
DB_USER = os.getenv("POSTGRES_USER", "postgres")
DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "")

conn = psycopg.connect(
    host=DB_HOST,
    port=DB_PORT,
    user=DB_USER,
    password=DB_PASSWORD,
    dbname=DB_NAME
)
cur = conn.cursor()

# 1. Truncate table and restart identity
cur.execute("TRUNCATE TABLE threat_logs RESTART IDENTITY;")

now = datetime.now(timezone.utc)
t1 = now - timedelta(hours=2, minutes=15)
t2 = now - timedelta(minutes=45)

insert_sql = """
INSERT INTO threat_logs (
    threat_number, date_time, threat_level, threat_type, threat_score, trigger_sensors,
    obstacle_dist_cm, acoustic_snd_adc, metal_detected, flame_ir_adc,
    gps_satellites, ambient_temp_c, humidity_pct, lora_rssi_dbm,
    patrol_mode, gps_lat, gps_lon, threat_summary
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
"""

# Event 1: Obstacle Incursion
cur.execute(insert_sql, (
    1, t1, "CRITICAL", "COLLISION_IMMINENT", 0.910, ["OBSTACLE_DIST", "PROXIMITY_ALERT"],
    24.5, 840, False, 3600, 8, 29.5, 54.0, -86.0,
    "WP-01", 28.6139, 77.2090,
    "Perimeter physical obstruction detected within 24.5 cm safety threshold. Automated braking engaged."
))

# Event 2: Optical Flame Hazard
cur.execute(insert_sql, (
    2, t2, "FIRE", "FIRE_HAZARD", 0.980, ["FLAME_IR"],
    145.0, 920, False, 1120, 8, 42.0, 46.0, -84.0,
    "WP-02", 28.6141, 77.2094,
    "Optical flame infrared emission detected below 1500 ADC threshold. Sentry alert signaled."
))

# Reset sequence to 2 so the next real threat encountered will be #3
cur.execute("SELECT setval('threat_logs_threat_number_seq', 2);")
conn.commit()

# Verify
rows = cur.execute("SELECT threat_number, date_time, threat_level, threat_type FROM threat_logs ORDER BY threat_number;").fetchall()
print(f"Total threat_logs in hackpurush: {len(rows)}")
for r in rows:
    print(f"  - Threat #{r[0]}: [{r[2]}] {r[3]} at {r[1]}")

conn.close()
