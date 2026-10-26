#!/usr/bin/env python3
"""
threat_service.py — ABSR Multi-Sensor Threat Ingestion & PostgreSQL Service
=============================================================================
Evaluates real-time telemetry from the rover/drone against approved threat constraints.

Storage Rule:
- ONLY inserts into the PostgreSQL 'threat_logs' table if at least one sensor
  violates the safe threshold (or fusion level is ALERT/FIRE).
- Safe readings are discarded and NEVER saved to the database.

Database: PostgreSQL 18.x (DB: 'hackpurush')
Table:    threat_logs (threat_number, date_time, sensor snapshot, triggers)
"""

import os
import sys
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
from dotenv import load_dotenv
import psycopg
from psycopg.rows import dict_row

load_dotenv()

# Database connection credentials from .env
DB_HOST = os.getenv("POSTGRES_HOST", "localhost")
DB_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
DB_NAME = os.getenv("POSTGRES_DB", "hackpurush")
DB_USER = os.getenv("POSTGRES_USER", "postgres")
DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "")

def get_connection():
    """Establish connection to PostgreSQL hackpurush database."""
    return psycopg.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        row_factory=dict_row
    )


# =============================================================================
# APPROVED THREAT CONSTRAINTS (SAFE vs DANGER)
# =============================================================================
# 1. FLAME IR:       Safe > 2500 ADC | Danger < 1500 ADC
# 2. OBSTACLE DIST:  Safe > 100 cm   | Danger < 40 cm
# 3. METAL SENSOR:   Safe = False/0  | Danger = True/1
# 4. ACOUSTIC SND:   Safe < 1500 ADC | Danger > 2500 ADC
# 5. AMBIENT TEMP:   Safe -10°C..45°C| Danger > 55°C or < -15°C
# 6. HUMIDITY:       Safe 20%..85%   | Danger > 95%
# 7. LORA RSSI:      Safe > -105 dBm | Danger < -125 dBm
# 8. GPS SATS:       Safe >= 6 lock  | Danger < 4 lock (while moving)
# 9. THREAT FUSION:  Safe = CLEAR    | Danger = ALERT, FIRE, or Score >= 0.70
# =============================================================================

def evaluate_and_ingest_telemetry(t: Dict[str, Any]) -> Dict[str, Any]:
    """
    Evaluates telemetry packet against approved safety constraints.
    Saves to PostgreSQL ONLY when a threat is identified.
    Returns dictionary with status and metadata.
    """
    triggers: List[str] = []
    threat_types: List[str] = []
    max_level = "CLEAR"
    max_score = float(t.get("threat_score") or t.get("score") or 0.0)

    # 1. Flame IR Sensor (ADC 0..4095)
    flame = t.get("flame_ir_adc") or t.get("flame")
    if flame is not None and flame < 1500:
        triggers.append("FLAME_IR")
        threat_types.append("FIRE_HAZARD")
        max_level = "FIRE"
        max_score = max(max_score, 0.98)

    # 2. Obstacle Proximity Distance (cm)
    dist = t.get("obstacle_dist_cm") or t.get("dist")
    if dist is not None and 0 < dist < 40.0:
        triggers.append("OBSTACLE_DIST")
        threat_types.append("COLLISION_IMMINENT")
        if max_level != "FIRE":
            max_level = "CRITICAL"
        max_score = max(max_score, 0.90)

    # 3. Metal Sensor (Boolean / 0 or 1)
    metal = t.get("metal_detected") or t.get("metal")
    if metal is True or metal == 1 or str(metal).lower() in ("true", "1", "yes"):
        triggers.append("METAL_SENSOR")
        threat_types.append("METALLIC_CONTRABAND")
        if max_level not in ("FIRE", "CRITICAL"):
            max_level = "ALERT"
        max_score = max(max_score, 0.85)

    # 4. Acoustic Sound Level (ADC)
    snd = t.get("acoustic_snd_adc") or t.get("snd")
    if snd is not None and snd > 2500:
        triggers.append("ACOUSTIC_SND")
        threat_types.append("ACOUSTIC_IMPACT")
        if max_level not in ("FIRE", "CRITICAL"):
            max_level = "ALERT"
        max_score = max(max_score, 0.80)

    # 5. Ambient Temperature (°C)
    temp = t.get("ambient_temp_c") or t.get("temp")
    if temp is not None:
        if temp > 55.0:
            triggers.append("AMBIENT_TEMP")
            threat_types.append("THERMAL_OVERHEAT")
            if max_level != "FIRE":
                max_level = "CRITICAL"
            max_score = max(max_score, 0.92)
        elif temp < -15.0:
            triggers.append("AMBIENT_TEMP")
            threat_types.append("SUBZERO_FREEZE")
            if max_level not in ("FIRE", "CRITICAL"):
                max_level = "ALERT"
            max_score = max(max_score, 0.75)

    # 6. Humidity (%)
    hum = t.get("humidity_pct") or t.get("hum")
    if hum is not None and hum > 95.0:
        triggers.append("HUMIDITY")
        threat_types.append("MOISTURE_INGRESS")
        if max_level == "CLEAR":
            max_level = "WATCH"
        max_score = max(max_score, 0.65)

    # 7. LoRa RSSI (dBm)
    rssi = t.get("lora_rssi_dbm") or t.get("rssi")
    if rssi is not None and rssi < -125.0:
        triggers.append("LORA_RSSI")
        threat_types.append("RF_SIGNAL_JAMMING")
        if max_level == "CLEAR":
            max_level = "WATCH"
        max_score = max(max_score, 0.70)

    # 8. GPS Satellites
    sats = t.get("gps_satellites") or t.get("sats")
    if sats is not None and sats < 4 and t.get("is_moving", False):
        triggers.append("GPS_SATELLITES")
        threat_types.append("GPS_LOCK_LOST")
        if max_level == "CLEAR":
            max_level = "WATCH"
        max_score = max(max_score, 0.60)

    # 9. Threat Level / Score from Fusion Brain
    fusion_lvl = (t.get("threat_level") or t.get("level") or "").upper()
    if fusion_lvl in ("FIRE", "ALERT", "CRITICAL"):
        if "THREAT_FUSION" not in triggers:
            triggers.append("THREAT_FUSION")
        if fusion_lvl == "FIRE":
            max_level = "FIRE"
        elif max_level not in ("FIRE", "CRITICAL"):
            max_level = fusion_lvl
        max_score = max(max_score, 0.75)

    if max_score >= 0.70 and "HIGH_FUSION_SCORE" not in triggers:
        triggers.append("HIGH_FUSION_SCORE")
        if max_level not in ("FIRE", "CRITICAL"):
            max_level = "ALERT"

    # =========================================================================
    # DECISION RULE:
    # If no trigger condition met -> SAFE. DO NOT SAVE TO POSTGRESQL.
    # =========================================================================
    if not triggers:
        return {
            "saved": False,
            "status": "SAFE",
            "threat_level": "CLEAR",
            "threat_score": max_score,
            "message": "All sensor readings within safe operational limits. Telemetry discarded from DB."
        }

    # =========================================================================
    # THREAT CONFIRMED: SAVE TO POSTGRESQL
    # =========================================================================
    primary_threat_type = threat_types[0] if threat_types else "MULTI_SENSOR_THREAT"
    threat_summary = (
        f"THREAT DETECTED: [{max_level}] {primary_threat_type} | "
        f"Triggers: {', '.join(triggers)} | Score: {round(max_score, 3)}"
    )

    now_utc = datetime.now(timezone.utc)

    # Normalize fields
    metal_val = bool(metal is True or metal == 1 or str(metal).lower() in ("true", "1", "yes"))
    patrol = t.get("patrol_mode") or ("WAYPOINT_PATROL" if t.get("patrol") else "STANDBY")
    lat = t.get("gps_lat") or t.get("lat")
    lon = t.get("gps_lon") or t.get("lon")

    insert_sql = """
        INSERT INTO threat_logs (
            date_time,
            threat_level,
            threat_type,
            threat_score,
            trigger_sensors,
            obstacle_dist_cm,
            acoustic_snd_adc,
            metal_detected,
            flame_ir_adc,
            gps_satellites,
            ambient_temp_c,
            humidity_pct,
            lora_rssi_dbm,
            patrol_mode,
            gps_lat,
            gps_lon,
            threat_summary
        ) VALUES (
            %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s
        )
        RETURNING threat_number, date_time;
    """

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                insert_sql,
                (
                    now_utc,
                    max_level,
                    primary_threat_type,
                    round(max_score, 3),
                    triggers,
                    dist,
                    snd,
                    metal_val,
                    flame,
                    sats,
                    temp,
                    hum,
                    rssi,
                    patrol,
                    lat,
                    lon,
                    threat_summary,
                )
            )
            row = cur.fetchone()
            conn.commit()

    return {
        "saved": True,
        "threat_number": row["threat_number"],
        "date_time": row["date_time"].isoformat(),
        "threat_level": max_level,
        "threat_type": primary_threat_type,
        "threat_score": round(max_score, 3),
        "trigger_sensors": triggers,
        "threat_summary": threat_summary,
    }


def fetch_recent_threats(limit: int = 50, level: Optional[str] = None) -> List[Dict[str, Any]]:
    """Retrieve recent threat log events from PostgreSQL."""
    query = "SELECT * FROM threat_logs"
    params = []

    if level:
        query += " WHERE threat_level = %s"
        params.append(level.upper())

    query += " ORDER BY threat_number DESC LIMIT %s;"
    params.append(limit)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            rows = cur.fetchall()
            # Convert datetime to ISO string for JSON serialization
            for r in rows:
                if isinstance(r.get("date_time"), datetime):
                    r["date_time"] = r["date_time"].isoformat()
            return rows


def fetch_threat_stats() -> Dict[str, Any]:
    """Retrieve threat statistics for dashboard display."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS total_threats, MAX(threat_number) AS latest_threat_number FROM threat_logs;")
            totals = cur.fetchone()

            cur.execute("""
                SELECT threat_level, COUNT(*) AS count
                FROM threat_logs
                GROUP BY threat_level
                ORDER BY count DESC;
            """)
            by_level = {row["threat_level"]: row["count"] for row in cur.fetchall()}

            cur.execute("""
                SELECT threat_type, COUNT(*) AS count
                FROM threat_logs
                GROUP BY threat_type
                ORDER BY count DESC
                LIMIT 5;
            """)
            by_type = {row["threat_type"]: row["count"] for row in cur.fetchall()}

            return {
                "total_threats": totals["total_threats"] or 0,
                "latest_threat_number": totals["latest_threat_number"] or 0,
                "by_level": by_level,
                "top_threat_types": by_type,
            }


# =============================================================================
# FASTAPI APPLICATION (Runs on Port 8001)
# =============================================================================
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(
    title="ABSR Threat Ingestion & PostgreSQL API",
    description="Filters sensor telemetry against safety constraints and logs threats to PostgreSQL.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TelemetryPayload(BaseModel):
    obstacle_dist_cm: Optional[float] = None
    acoustic_snd_adc: Optional[int] = None
    metal_detected: Optional[bool] = False
    flame_ir_adc: Optional[int] = None
    gps_satellites: Optional[int] = None
    ambient_temp_c: Optional[float] = None
    humidity_pct: Optional[float] = None
    lora_rssi_dbm: Optional[float] = None
    threat_level: Optional[str] = "CLEAR"
    threat_score: Optional[float] = 0.0
    patrol_mode: Optional[str] = "STANDBY"
    gps_lat: Optional[float] = None
    gps_lon: Optional[float] = None
    is_moving: Optional[bool] = False

@app.get("/api/health")
def health_check():
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT current_database(), version();")
                info = cur.fetchone()
                return {
                    "status": "ONLINE",
                    "database": info["current_database"],
                    "version": info["version"].split(" on ")[0]
                }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database connection error: {str(e)}")

@app.post("/api/telemetry/ingest")
def ingest_telemetry(data: TelemetryPayload):
    try:
        res = evaluate_and_ingest_telemetry(data.model_dump())
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/threats")
def get_threats(limit: int = Query(50, ge=1, le=200), level: Optional[str] = None):
    try:
        return fetch_recent_threats(limit, level)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/threats/stats")
def get_stats():
    try:
        return fetch_threat_stats()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/threats/simulate")
def simulate_threat(scenario: str = Query("fire", pattern="^(fire|obstacle|metal|sound|overheat|safe)$")):
    """Simulates a test telemetry payload to verify constraints and pgAdmin storage."""
    scenarios = {
        "safe": {
            "obstacle_dist_cm": 185.0,
            "acoustic_snd_adc": 850,
            "metal_detected": False,
            "flame_ir_adc": 3800,
            "gps_satellites": 9,
            "ambient_temp_c": 28.5,
            "humidity_pct": 55.0,
            "lora_rssi_dbm": -88.0,
            "threat_level": "CLEAR",
            "threat_score": 0.08,
            "patrol_mode": "WAYPOINT_02"
        },
        "fire": {
            "obstacle_dist_cm": 150.0,
            "acoustic_snd_adc": 920,
            "metal_detected": False,
            "flame_ir_adc": 1120,      # < 1500 (FIRE DANGER)
            "gps_satellites": 8,
            "ambient_temp_c": 58.2,     # > 55°C (HEAT DANGER)
            "humidity_pct": 42.0,
            "lora_rssi_dbm": -92.0,
            "threat_level": "FIRE",
            "threat_score": 0.98,
            "patrol_mode": "WAYPOINT_03"
        },
        "obstacle": {
            "obstacle_dist_cm": 24.5,   # < 40 cm (COLLISION DANGER)
            "acoustic_snd_adc": 1100,
            "metal_detected": False,
            "flame_ir_adc": 3600,
            "gps_satellites": 7,
            "ambient_temp_c": 31.0,
            "humidity_pct": 60.0,
            "lora_rssi_dbm": -90.0,
            "threat_level": "ALERT",
            "threat_score": 0.91,
            "patrol_mode": "WAYPOINT_01"
        },
        "metal": {
            "obstacle_dist_cm": 120.0,
            "acoustic_snd_adc": 950,
            "metal_detected": True,     # METAL = TRUE (CONTRABAND/IED)
            "flame_ir_adc": 3750,
            "gps_satellites": 8,
            "ambient_temp_c": 29.0,
            "humidity_pct": 52.0,
            "lora_rssi_dbm": -87.0,
            "threat_level": "ALERT",
            "threat_score": 0.86,
            "patrol_mode": "PERIMETER_FENCE"
        },
        "sound": {
            "obstacle_dist_cm": 140.0,
            "acoustic_snd_adc": 2950,   # > 2500 (GUNSHOT / BLAST DANGER)
            "metal_detected": False,
            "flame_ir_adc": 3700,
            "gps_satellites": 8,
            "ambient_temp_c": 30.0,
            "humidity_pct": 58.0,
            "lora_rssi_dbm": -91.0,
            "threat_level": "ALERT",
            "threat_score": 0.84,
            "patrol_mode": "PATROL_ALPHA"
        },
        "overheat": {
            "obstacle_dist_cm": 200.0,
            "acoustic_snd_adc": 820,
            "metal_detected": False,
            "flame_ir_adc": 3600,
            "gps_satellites": 9,
            "ambient_temp_c": 64.5,     # > 55°C (HEAT STRESS)
            "humidity_pct": 35.0,
            "lora_rssi_dbm": -85.0,
            "threat_level": "CRITICAL",
            "threat_score": 0.93,
            "patrol_mode": "SECTOR_04"
        }
    }
    payload = scenarios[scenario]
    return evaluate_and_ingest_telemetry(payload)


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("THREAT_API_PORT", "8001"))
    print(f"[START] Starting ABSR Threat Ingestion Service on http://localhost:{port}")
    print(f"[DATABASE] PostgreSQL: {DB_HOST}:{DB_PORT}/{DB_NAME} (User: {DB_USER})")
    print(f"[RULE] Threats saved to 'threat_logs'. Safe readings DISCARDED.")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
