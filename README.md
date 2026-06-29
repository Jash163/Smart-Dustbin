# Smart Dustbin — IoT Waste Segregation & Monitoring

An ESP32-based smart dustbin that measures how full each waste stream is,
detects throw events, and reports live telemetry to a Node.js backend with a
real-time dashboard (fill levels, map of bins, alerts, and environmental
impact stats).

## How it works

```
  ESP32 (sensors)  ──HTTP POST──▶  Node.js backend  ──HTTP GET──▶  Dashboard
   3x ultrasonic                   fill % + mass +                 live KPIs,
   1x IR (throw)                   alerts + impact                 map, alerts
```

1. The ESP32 reads three ultrasonic distances (paper / plastic / metal) and an
   IR beam that detects when trash passes the inlet.
2. It sends a telemetry packet to `POST /api/telemetry`.
3. The backend converts distances into fill percentages, estimates stored mass,
   counts throw events, raises capacity/stale alerts, and logs recent activity.
4. The dashboard polls `GET /api/dashboard` every 15 seconds and renders live
   KPIs, map markers, alerts, and impact statistics.

## Repository structure

| Path | What it is |
|------|------------|
| `firmware/esp32_smart_bin/` | ESP32 firmware (`.ino`) — sensors + WiFi + telemetry |
| `backend/` | Node.js HTTP backend + dashboard server (no external deps) |
| `backend/public/index.html` | Live dashboard frontend |
| `backend/src/` | `server.js`, `store.js`, `analytics.js`, `config.js` |
| `backend/data/state.json` | Persisted runtime state |
| `Dashboard.codex.html` | Standalone dashboard (works via `file:` too) |
| `libraries/` | Bundled Arduino libraries needed to compile the firmware |

## Hardware

- ESP32 development board (built-in WiFi)
- 3x ultrasonic distance sensors (one per material stream)
- 1x IR sensor at the inlet (throw detection)

## Run the backend

Requires [Node.js](https://nodejs.org). The backend uses only Node's standard
library, so there is nothing to `npm install`.

```bash
cd backend
npm start          # or: node src/server.js
```

Then open <http://localhost:8080>.

## Configure the firmware

Open `firmware/esp32_smart_bin/esp32_smart_bin.ino` and set:

- `WIFI_SSID` and `WIFI_PASSWORD` — your network credentials
- `BACKEND_URL` — where your backend is reachable (e.g. `http://<server-ip>:8080/api/telemetry`)
- `BIN_ID` — which bin this controller represents
- the GPIO pin assignments for your wiring

If your bin geometry differs, update the calibration in `backend/src/config.js`
(`emptyDistanceCm`, `fullDistanceCm`, `capacityKg`, `co2AvoidedPerKg`, `sheetsPerKg`).

> The committed WiFi values are placeholders (`YOUR_WIFI_NAME` / `YOUR_WIFI_PASSWORD`).
> Never commit real credentials — keep them local.

## API endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/health` | Liveness check |
| `GET` | `/api/dashboard` | Full dashboard payload (summary, totals, bins, alerts, impact) |
| `GET` | `/api/bins` | State for all bins |
| `GET` | `/api/bins/:id` | State for one bin |
| `POST` | `/api/telemetry` | Ingest a sensor packet |
| `POST` | `/api/bins/:id/report-issue` | Manual issue report from the dashboard |

See [`backend/README.md`](backend/README.md) for sample payloads and details.

## Notes

- The dashboard falls back to `http://localhost:8080` when opened directly as a file.
- The firmware targets ESP32 because WiFi is built in.
- Bin locations in `config.js` are sample/demo coordinates — change them to your own deployment sites.

## License

MIT — see [LICENSE](LICENSE).
