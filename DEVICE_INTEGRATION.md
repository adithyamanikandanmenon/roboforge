# Send your system's readings to RoboForge

The dashboard is connected to Firebase project `roboforge-5e54c`.

- Database: `https://roboforge-5e54c-default-rtdb.asia-southeast1.firebasedatabase.app`
- Readings collection: `water_quality/POND_01/readings`
- Write a new child record per measurement, using a unique record ID or a Firebase push key.
- Include `timestamp` in every record. Use one consistent format: ISO date/time strings or numeric Unix timestamps.

Expected measurement keys:

```json
{
  "temperature": 28.5,
  "ph": 7.2,
  "dissolved_oxygen": 6.8,
  "turbidity": 12,
  "tds": 320,
  "air_temperature": 31.2,
  "aqi": 45,
  "rainfall": 0,
  "timestamp": "2026-10-31T10:30:00Z"
}
```

This is a format example, not a measured record. No sample values have been inserted into the live database.

Units: water/air temperature °C, oxygen mg/L, turbidity NTU, TDS ppm, rainfall mm/h. AQI interpretation depends on the index implemented by your sensor system.

The readings collection is publicly readable. Device/client writes require a trusted Firebase identity with a `sensor_writer: true` custom claim (or a verified farm owner). An Admin SDK backend can ingest data using its server-side credentials. Writer access has not been provisioned for your friend's system yet; use [FIREBASE_SETUP.md](FIREBASE_SETUP.md) to arrange the trusted account with the project administrator. Do not make database writes public or put a service-account private key in browser code.

The dashboard updates automatically as records arrive. Its present waiting state means the connection works but no sensor records have been received. If your friend's field names differ, map them to these keys before writing, or update the dashboard's data adapter.
