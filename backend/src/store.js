"use strict";

const fs = require("fs");
const path = require("path");

const {
  BIN_CONFIG,
  MATERIALS,
  buildInitialState
} = require("./config");
const {
  appendActivity,
  buildDashboardPayload,
  buildBinResponse,
  computeFillPercent,
  computeMaterialMassKg,
  reconcileAlerts,
  toIsoTime
} = require("./analytics");

class TelemetryStore {
  constructor(options = {}) {
    this.stateFile = options.stateFile || path.join(__dirname, "..", "data", "state.json");
    this.state = this.loadState();
  }

  loadState() {
    const initial = buildInitialState();

    if (!fs.existsSync(this.stateFile)) {
      this.ensureStateDir();
      fs.writeFileSync(this.stateFile, JSON.stringify(initial, null, 2));
      return initial;
    }

    try {
      const raw = fs.readFileSync(this.stateFile, "utf8");
      const parsed = JSON.parse(raw);
      return this.mergeWithConfig(parsed);
    } catch (error) {
      return initial;
    }
  }

  ensureStateDir() {
    fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
  }

  mergeWithConfig(existingState) {
    const nextState = buildInitialState();

    if (!existingState || typeof existingState !== "object" || !existingState.bins) {
      return nextState;
    }

    for (const bin of BIN_CONFIG) {
      const previous = existingState.bins[bin.id];
      if (!previous) {
        continue;
      }

      nextState.bins[bin.id] = {
        ...nextState.bins[bin.id],
        ...previous,
        id: bin.id,
        name: bin.name,
        site: bin.site,
        latlng: bin.latlng,
        fills: {
          ...nextState.bins[bin.id].fills,
          ...(previous.fills || {})
        },
        distancesCm: {
          ...nextState.bins[bin.id].distancesCm,
          ...(previous.distancesCm || {})
        },
        estimatedMassKg: {
          ...nextState.bins[bin.id].estimatedMassKg,
          ...(previous.estimatedMassKg || {})
        },
        alerts: Array.isArray(previous.alerts) ? previous.alerts : [],
        activity: Array.isArray(previous.activity) ? previous.activity : []
      };
    }

    return nextState;
  }

  saveState() {
    this.ensureStateDir();
    fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
  }

  listBins() {
    return Object.values(this.state.bins).map(buildBinResponse);
  }

  getBin(binId) {
    const bin = this.state.bins[binId];
    return bin ? buildBinResponse(bin) : null;
  }

  getDashboard() {
    const now = Date.now();
    for (const bin of Object.values(this.state.bins)) {
      reconcileAlerts(bin, now);
    }
    this.saveState();
    return buildDashboardPayload(this.state);
  }

  ingestTelemetry(payload) {
    const normalized = this.normalizePayload(payload);
    const bin = this.state.bins[normalized.binId];

    if (!bin) {
      throw new Error(`Unknown binId "${normalized.binId}".`);
    }

    const timestamp = normalized.timestamp;

    for (const materialKey of MATERIALS) {
      const distanceCm = normalized.ultrasonicCm[materialKey];
      const fillPercent = computeFillPercent(distanceCm, materialKey);

      if (fillPercent === null) {
        throw new Error(`Invalid ultrasonic reading for ${materialKey}: ${distanceCm}`);
      }

      bin.distancesCm[materialKey] = distanceCm;
      bin.fills[materialKey] = fillPercent;
      bin.estimatedMassKg[materialKey] = computeMaterialMassKg(fillPercent, materialKey);
    }

    const wasTriggered = Boolean(bin.lastIrState);
    const isTriggered = Boolean(normalized.irTriggered);
    bin.lastIrState = isTriggered;
    bin.lastTelemetryAt = toIsoTime(timestamp);

    const summary = MATERIALS.map((materialKey) => `${materialKey}:${bin.fills[materialKey]}%`).join(", ");
    appendActivity(bin, "Telemetry", `Readings updated (${summary})`, timestamp);

    if (isTriggered && !wasTriggered) {
      bin.throwEvents += 1;
      bin.lastThrowAt = toIsoTime(timestamp);
      appendActivity(bin, "IR", "Trash throw detected at inlet", timestamp);
    }

    reconcileAlerts(bin, timestamp);
    this.saveState();

    return {
      accepted: true,
      bin: buildBinResponse(bin),
      dashboard: buildDashboardPayload(this.state)
    };
  }

  reportIssue(binId, issueText, level = "danger") {
    const bin = this.state.bins[binId];
    if (!bin) {
      throw new Error(`Unknown binId "${binId}".`);
    }

    const timestamp = Date.now();
    bin.alerts.unshift({
      source: "manual",
      level,
      text: issueText,
      ts: timestamp
    });
    appendActivity(bin, "Manual", issueText, timestamp);
    reconcileAlerts(bin, timestamp);
    this.saveState();
    return buildBinResponse(bin);
  }

  normalizePayload(payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("Telemetry payload must be a JSON object.");
    }

    const binId = payload.binId || payload.bin_id;
    if (typeof binId !== "string" || !binId.trim()) {
      throw new Error("binId is required.");
    }

    const ultrasonicSource = payload.ultrasonicCm || payload.ultrasonic_cm || payload.ultrasonic || {};
    const irTriggered = payload.irTriggered ?? payload.ir_triggered;

    if (typeof irTriggered !== "boolean") {
      throw new Error("irTriggered must be true or false.");
    }

    const ultrasonicCm = {};
    for (const materialKey of MATERIALS) {
      const rawValue =
        ultrasonicSource[materialKey] ??
        ultrasonicSource[`${materialKey}Cm`] ??
        ultrasonicSource[`${materialKey}_cm`];

      const numericValue = Number(rawValue);
      if (!Number.isFinite(numericValue)) {
        throw new Error(`Missing numeric ultrasonic reading for ${materialKey}.`);
      }
      ultrasonicCm[materialKey] = numericValue;
    }

    const timestampValue = payload.timestamp || payload.ts || Date.now();
    const timestamp = new Date(timestampValue).getTime();
    if (Number.isNaN(timestamp)) {
      throw new Error("Invalid timestamp.");
    }

    return {
      binId: binId.trim(),
      timestamp,
      ultrasonicCm,
      irTriggered
    };
  }
}

module.exports = {
  TelemetryStore
};
