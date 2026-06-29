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
2. It sends a telemetry packet to `POST /api/telemetry` every 5 seconds (and
   immediately whenever the IR state changes).
3. The backend converts distances into fill percentages, estimates stored mass,
   counts throw events, raises capacity/stale alerts, and logs recent activity.
4. The dashboard polls `GET /api/dashboard` every 15 seconds and renders live
   KPIs, map markers, alerts, and impact statistics.

## Repository structure

| Path | What it is |
|------|------------|
| `firmware/esp32_smart_bin/` | ESP32 firmware (`.ino`) — sensors + WiFi + telemetry |
| `backend/` | Node.js HTTP backend + dashboard server (no external dependencies) |
| `backend/public/index.html` | Live dashboard frontend (served at `/`) |
| `backend/src/` | `server.js`, `store.js`, `analytics.js`, `config.js` |
| `backend/data/state.json` | Persisted runtime state |

## Hardware

- ESP32 development board (built-in WiFi)
- 3x HC-SR04 ultrasonic distance sensors (one per material stream)
- 1x IR sensor at the inlet (throw detection)

## Wiring (ESP32 GPIO)

| Signal | Trig | Echo |
|--------|------|------|
| Paper ultrasonic | GPIO 5 | GPIO 18 |
| Plastic ultrasonic | GPIO 19 | GPIO 21 |
| Metal ultrasonic | GPIO 22 | GPIO 23 |
| IR sensor (inlet) | GPIO 27 | — |

- The IR pin uses `INPUT_PULLUP` and is treated as **active LOW** (beam blocked = LOW).
  If your IR module is active HIGH, flip `IR_ACTIVE_STATE` in the firmware.
- HC-SR04 modules run on 5V; the ESP32 GPIOs are 3.3V — level-shift the ECHO
  lines (or use a divider) if your board isn't 5V-tolerant. Share a common GND.

## Run the backend

Requires [Node.js](https://nodejs.org). The backend uses only Node's standard
library, so there is nothing to `npm install`.

```bash
cd backend
npm start          # or: node src/server.js
```

Then open <http://localhost:8080>.

## Configure the firmware

The firmware needs **no external Arduino libraries** — it uses only the built-in
`WiFi.h` and `HTTPClient.h` from the ESP32 core. Open
`firmware/esp32_smart_bin/esp32_smart_bin.ino` and set:

- `WIFI_SSID` and `WIFI_PASSWORD` — your network credentials
- `BACKEND_URL` — where your backend is reachable (e.g. `http://<server-ip>:8080/api/telemetry`)
- `BIN_ID` — which bin this controller represents (`lib`, `eng`, or `cant`)
- the GPIO pin assignments above, if your wiring differs

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

- Bin locations in `config.js` are sample/demo coordinates — change them to your
  own deployment sites.
- Runtime state is persisted to `backend/data/state.json` (committed as a seed).

## License

MIT — see [LICENSE](LICENSE).
