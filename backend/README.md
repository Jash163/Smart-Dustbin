# Smart Segregation Backend

This backend accepts telemetry from one smart bin controller at a time and serves dashboard-ready analytics for the three configured campus bins:

- `lib` -> Library Bin
- `eng` -> Engineering Bin
- `cant` -> Dining Hall Bin

Each telemetry packet should contain:

- 3 ultrasonic readings in centimeters for `paper`, `plastic`, and `metal`
- 1 IR boolean flag to detect when trash passes the inlet
- a `binId`
- an optional timestamp

The backend computes:

- fill percentage for each material stream
- estimated stored mass in kilograms
- throw-event counts from the IR sensor
- capacity and stale-telemetry alerts
- dashboard KPIs like total tracked mass, CO2 avoided, and paper sheets saved

## Run

```bash
cd backend
npm start          # or: node src/server.js
```

The server listens on `http://localhost:8080`.

## API

### `GET /health`

Basic liveness check.

### `GET /api/dashboard`

Returns the full dashboard payload:

- `summary`
- `materialTotals`
- `bins`
- `alerts`
- `impact`

### `GET /api/bins`

Returns current state for all bins.

### `GET /api/bins/:id`

Returns current state for a single bin.

### `POST /api/telemetry`

Sample payload:

```json
{
  "binId": "lib",
  "timestamp": "2026-04-23T12:15:00Z",
  "ultrasonicCm": {
    "paper": 18.4,
    "plastic": 22.1,
    "metal": 30.0
  },
  "irTriggered": true
}
```

Notes:

- `irTriggered` should go `true` only while the inlet beam is blocked.
- A throw event is counted on the rising edge, meaning when the IR state changes from `false` to `true`.
- Ultrasonic distances are converted to fill percentages using the calibration values in [`src/config.js`](src/config.js).

### `POST /api/bins/:id/report-issue`

Optional manual issue endpoint for the dashboard’s report flow.

```json
{
  "text": "Compactor malfunction",
  "level": "danger"
}
```

## Arduino-side shape

From the microcontroller, post JSON like this:

```cpp
{
  "binId": "eng",
  "ultrasonicCm": {
    "paper": 14.2,
    "plastic": 9.8,
    "metal": 27.5
  },
  "irTriggered": false
}
```

If your bin geometry differs, update the per-material calibration in [`src/config.js`](src/config.js):

- `emptyDistanceCm`
- `fullDistanceCm`
- `capacityKg`
- `co2AvoidedPerKg`
- `sheetsPerKg`

## Persistence

Runtime state is stored in [`data/state.json`](data/state.json), so the dashboard retains:

- latest readings
- throw counts
- alerts
- recent activity log
