#!/usr/bin/env python3
"""
test_threat_constraints.py — Automated Test Suite for PostgreSQL Threat Ingestion
==================================================================================
Tests:
1. SAFE readings are REJECTED from the database (0 rows written).
2. THREAT conditions are IDENTIFIED and SAVED with threat_number and timestamp.
3. Database row counts accurately reflect ONLY threat events.
"""

import sys
import os
from datetime import datetime

# Add project root to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.threat_service import (
    evaluate_and_ingest_telemetry,
    fetch_recent_threats,
    fetch_threat_stats,
    get_connection
)

def run_tests():
    print("=" * 70)
    print("🧪 RUNNING ABSR THREAT CONSTRAINTS & POSTGRESQL VALIDATION TEST")
    print("=" * 70)

    # 1. Check initial row count in database
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM threat_logs;")
            initial_count = cur.fetchone()["count"]

    print(f"\n[INFO] Starting count in 'threat_logs' table: {initial_count} rows\n")

    passed = 0
    total = 0

    def test(name, condition, details=""):
        nonlocal passed, total
        total += 1
        status = "✅ PASS" if condition else "❌ FAIL"
        if condition:
            passed += 1
        print(f"  {status} | Test {total}: {name}")
        if details:
            print(f"         └─ {details}")

    # -------------------------------------------------------------------------
    # TEST 1: Safe Telemetry (All values within normal bounds)
    # Expected: saved == False, DB row count UNCHANGED
    # -------------------------------------------------------------------------
    safe_data = {
        "obstacle_dist_cm": 150.0,   # Safe (> 100cm)
        "acoustic_snd_adc": 650,     # Safe (< 1500)
        "metal_detected": False,     # Safe (False)
        "flame_ir_adc": 3800,        # Safe (> 2500)
        "gps_satellites": 8,         # Safe (>= 6)
        "ambient_temp_c": 28.0,      # Safe (28°C)
        "humidity_pct": 52.0,        # Safe (52%)
        "lora_rssi_dbm": -82.0,      # Safe (> -105 dBm)
        "threat_level": "CLEAR",     # Safe
        "threat_score": 0.05,        # Safe
        "patrol_mode": "WP_PATROL"
    }
    res1 = evaluate_and_ingest_telemetry(safe_data)
    test(
        "SAFE telemetry is NOT saved to PostgreSQL",
        res1["saved"] is False and res1["status"] == "SAFE",
        f"Result: {res1['message']}"
    )

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM threat_logs;")
            count_after_safe = cur.fetchone()["count"]
    test(
        "Database row count did NOT increase after SAFE telemetry",
        count_after_safe == initial_count,
        f"Rows: {count_after_safe} (unchanged from {initial_count})"
    )

    # -------------------------------------------------------------------------
    # TEST 2: Fire Detection (Flame IR ADC < 1500)
    # Expected: saved == True, Level = FIRE, trigger = FLAME_IR
    # -------------------------------------------------------------------------
    fire_data = {
        "obstacle_dist_cm": 160.0,
        "acoustic_snd_adc": 700,
        "metal_detected": False,
        "flame_ir_adc": 820,         # DANGER (< 1500)
        "gps_satellites": 8,
        "ambient_temp_c": 32.0,
        "humidity_pct": 50.0,
        "lora_rssi_dbm": -85.0,
        "threat_level": "FIRE",
        "threat_score": 0.98,
        "patrol_mode": "WP_PATROL"
    }
    res2 = evaluate_and_ingest_telemetry(fire_data)
    test(
        "FLAME IR (< 1500 ADC) triggers FIRE threat and writes to DB",
        res2["saved"] is True and res2["threat_level"] == "FIRE" and "FLAME_IR" in res2["trigger_sensors"],
        f"Assigned Threat #{res2.get('threat_number')} at {res2.get('date_time')}"
    )

    # -------------------------------------------------------------------------
    # TEST 3: Obstacle Proximity (< 40 cm)
    # Expected: saved == True, Level = CRITICAL, trigger = OBSTACLE_DIST
    # -------------------------------------------------------------------------
    obstacle_data = {
        "obstacle_dist_cm": 22.0,    # DANGER (< 40 cm)
        "acoustic_snd_adc": 800,
        "metal_detected": False,
        "flame_ir_adc": 3500,
        "gps_satellites": 7,
        "ambient_temp_c": 29.0,
        "humidity_pct": 55.0,
        "lora_rssi_dbm": -88.0,
        "threat_level": "ALERT",
        "threat_score": 0.91,
        "patrol_mode": "WP_PATROL"
    }
    res3 = evaluate_and_ingest_telemetry(obstacle_data)
    test(
        "OBSTACLE DIST (< 40 cm) triggers COLLISION_IMMINENT threat",
        res3["saved"] is True and "OBSTACLE_DIST" in res3["trigger_sensors"],
        f"Assigned Threat #{res3.get('threat_number')}: {res3.get('threat_summary')}"
    )

    # -------------------------------------------------------------------------
    # TEST 4: Metal Detected (Inductive Proximity Sensor)
    # Expected: saved == True, trigger = METAL_SENSOR
    # -------------------------------------------------------------------------
    metal_data = {
        "obstacle_dist_cm": 140.0,
        "acoustic_snd_adc": 750,
        "metal_detected": True,      # DANGER (Metal True)
        "flame_ir_adc": 3600,
        "gps_satellites": 8,
        "ambient_temp_c": 30.0,
        "humidity_pct": 52.0,
        "lora_rssi_dbm": -84.0,
        "threat_level": "ALERT",
        "threat_score": 0.85,
        "patrol_mode": "PERIMETER_CHECK"
    }
    res4 = evaluate_and_ingest_telemetry(metal_data)
    test(
        "METAL SENSOR (True) triggers METALLIC_CONTRABAND threat",
        res4["saved"] is True and "METAL_SENSOR" in res4["trigger_sensors"],
        f"Assigned Threat #{res4.get('threat_number')}: {res4.get('threat_summary')}"
    )

    # -------------------------------------------------------------------------
    # TEST 5: Acoustic Sound Spike (> 2500 ADC)
    # Expected: saved == True, trigger = ACOUSTIC_SND
    # -------------------------------------------------------------------------
    sound_data = {
        "obstacle_dist_cm": 150.0,
        "acoustic_snd_adc": 3100,    # DANGER (> 2500 ADC)
        "metal_detected": False,
        "flame_ir_adc": 3700,
        "gps_satellites": 8,
        "ambient_temp_c": 28.0,
        "humidity_pct": 50.0,
        "lora_rssi_dbm": -86.0,
        "threat_level": "ALERT",
        "threat_score": 0.82,
        "patrol_mode": "WP_PATROL"
    }
    res5 = evaluate_and_ingest_telemetry(sound_data)
    test(
        "ACOUSTIC SND (> 2500 ADC) triggers ACOUSTIC_IMPACT threat",
        res5["saved"] is True and "ACOUSTIC_SND" in res5["trigger_sensors"],
        f"Assigned Threat #{res5.get('threat_number')}: {res5.get('threat_summary')}"
    )

    # -------------------------------------------------------------------------
    # TEST 6: Extreme Thermal Overheat (> 55°C)
    # Expected: saved == True, trigger = AMBIENT_TEMP
    # -------------------------------------------------------------------------
    heat_data = {
        "obstacle_dist_cm": 170.0,
        "acoustic_snd_adc": 600,
        "metal_detected": False,
        "flame_ir_adc": 3400,
        "gps_satellites": 9,
        "ambient_temp_c": 62.4,      # DANGER (> 55°C)
        "humidity_pct": 30.0,
        "lora_rssi_dbm": -80.0,
        "threat_level": "CRITICAL",
        "threat_score": 0.94,
        "patrol_mode": "WP_PATROL"
    }
    res6 = evaluate_and_ingest_telemetry(heat_data)
    test(
        "AMBIENT TEMP (> 55°C) triggers THERMAL_OVERHEAT threat",
        res6["saved"] is True and "AMBIENT_TEMP" in res6["trigger_sensors"],
        f"Assigned Threat #{res6.get('threat_number')}: {res6.get('threat_summary')}"
    )

    # -------------------------------------------------------------------------
    # TEST 7: LoRa Jamming / Severe Degradation (< -125 dBm)
    # Expected: saved == True, trigger = LORA_RSSI
    # -------------------------------------------------------------------------
    rf_data = {
        "obstacle_dist_cm": 180.0,
        "acoustic_snd_adc": 500,
        "metal_detected": False,
        "flame_ir_adc": 3800,
        "gps_satellites": 8,
        "ambient_temp_c": 27.0,
        "humidity_pct": 45.0,
        "lora_rssi_dbm": -128.5,     # DANGER (< -125 dBm)
        "threat_level": "WATCH",
        "threat_score": 0.70,
        "patrol_mode": "WP_PATROL"
    }
    res7 = evaluate_and_ingest_telemetry(rf_data)
    test(
        "LORA RSSI (< -125 dBm) triggers RF_SIGNAL_JAMMING threat",
        res7["saved"] is True and "LORA_RSSI" in res7["trigger_sensors"],
        f"Assigned Threat #{res7.get('threat_number')}: {res7.get('threat_summary')}"
    )

    # -------------------------------------------------------------------------
    # TEST 8: Safe Telemetry again
    # Expected: saved == False, DB row count remains precisely (initial + 6)
    # -------------------------------------------------------------------------
    res8 = evaluate_and_ingest_telemetry(safe_data)
    test(
        "Subsequent SAFE telemetry is again discarded without DB write",
        res8["saved"] is False and res8["status"] == "SAFE"
    )

    stats = fetch_threat_stats()
    expected_rows = initial_count + 6
    test(
        f"Database has exactly {expected_rows} threat events ({initial_count} initial + 6 verified threats)",
        stats["total_threats"] == expected_rows,
        f"Current total in PostgreSQL: {stats['total_threats']} | By level: {stats['by_level']}"
    )

    print("\n" + "=" * 70)
    print(f"📊 TEST RESULTS: {passed}/{total} PASSED")
    print("=" * 70)

    if passed == total:
        print("🎉 ALL THREAT CONSTRAINTS & POSTGRESQL INGESTION LOGIC VERIFIED!\n")
        return 0
    else:
        print("❌ SOME TESTS FAILED!\n")
        return 1

if __name__ == "__main__":
    sys.exit(run_tests())
