"use strict";

const { AUTO_CLEAR_MS, MATERIALS, MATERIAL_CONFIG } = require("./config");

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function toIsoTime(value) {
  return new Date(value).toISOString();
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function computeFillPercent(distanceCm, materialKey) {
  const material = MATERIAL_CONFIG[materialKey];
  if (!material || !isFiniteNumber(distanceCm)) {
    return null;
  }

  const tolerance = 3;
  const maxDistance = material.emptyDistanceCm + tolerance;
  const minDistance = material.fullDistanceCm - tolerance;

  if (distanceCm > maxDistance || distanceCm < minDistance) {
    return null;
  }

  const denominator = material.emptyDistanceCm - material.fullDistanceCm;
  if (denominator <= 0) {
    return null;
  }

  const filledHeight = material.emptyDistanceCm - distanceCm;
  return clamp(Math.round((filledHeight / denominator) * 100), 0, 100);
}

function computeMaterialMassKg(fillPercent, materialKey) {
  const material = MATERIAL_CONFIG[materialKey];
  if (!material || !isFiniteNumber(fillPercent)) {
    return 0;
  }
  return round((fillPercent / 100) * material.capacityKg, 3);
}

function getOverallFill(bin) {
  return Math.max(bin.fills.paper || 0, bin.fills.plastic || 0, bin.fills.metal || 0, bin.fills.others || 0);
}

function appendActivity(bin, type, details, timestamp) {
  const entry = {
    time: toIsoTime(timestamp),
    type,
    details
  };

  bin.activity.push(entry);
  if (bin.activity.length > 60) {
    bin.activity.splice(0, bin.activity.length - 60);
  }
}

function reconcileAlerts(bin, timestamp) {
  const nextAlerts = [];
  const now = new Date(timestamp).getTime();

  for (const alert of bin.alerts || []) {
    if (alert.source === "manual" || alert.source === "sensor") {
      nextAlerts.push(alert);
      continue;
    }

    if (alert.source === "system" && now - alert.ts <= AUTO_CLEAR_MS) {
      nextAlerts.push(alert);
    }
  }

  for (const materialKey of MATERIALS) {
    const level = bin.fills[materialKey] || 0;
    if (level >= 90) {
      nextAlerts.push({
        source: "system",
        level: "danger",
        text: `${MATERIAL_CONFIG[materialKey].label} at ${level}% capacity`,
        ts: now
      });
    } else if (level >= 75) {
      nextAlerts.push({
        source: "system",
        level: "warn",
        text: `${MATERIAL_CONFIG[materialKey].label} near capacity (${level}%)`,
        ts: now
      });
    }
  }

  if (!bin.lastTelemetryAt) {
    nextAlerts.push({
      source: "system",
      level: "warn",
      text: "No telemetry received yet",
      ts: now
    });
  } else {
    const ageMs = now - new Date(bin.lastTelemetryAt).getTime();
    if (ageMs > 30 * 60 * 1000) {
      nextAlerts.push({
        source: "system",
        level: "danger",
        text: "Telemetry stale for more than 30 minutes",
        ts: now
      });
    } else if (ageMs > 10 * 60 * 1000) {
      nextAlerts.push({
        source: "system",
        level: "warn",
        text: "Telemetry stale for more than 10 minutes",
        ts: now
      });
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const alert of nextAlerts.sort((left, right) => right.ts - left.ts)) {
    const key = `${alert.level}|${alert.text}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(alert);
    }
  }

  bin.alerts = deduped;
  return deduped;
}

function computeStatus(bin) {
  if (bin.alerts.some((alert) => alert.level === "danger") || getOverallFill(bin) >= 90) {
    return "Critical";
  }
  if (bin.alerts.some((alert) => alert.level === "warn") || getOverallFill(bin) >= 75) {
    return "Warning";
  }
  return "Healthy";
}

function buildBinResponse(bin) {
  return {
    id: bin.id,
    name: bin.name,
    site: bin.site,
    latlng: bin.latlng,
    fills: bin.fills,
    distancesCm: bin.distancesCm,
    estimatedMassKg: bin.estimatedMassKg,
    throwEvents: bin.throwEvents,
    lastThrowAt: bin.lastThrowAt,
    lastTelemetryAt: bin.lastTelemetryAt,
    overallFill: getOverallFill(bin),
    status: computeStatus(bin),
    alerts: bin.alerts,
    activity: [...bin.activity].slice(-10).reverse()
  };
}

function buildDashboardPayload(state) {
  const bins = Object.values(state.bins).map(buildBinResponse);
  const alerts = bins
    .flatMap((bin) => {
      return bin.alerts.map((alert) => ({
        ...alert,
        binId: bin.id,
        binName: bin.name
      }));
    })
    .sort((left, right) => right.ts - left.ts);

  let totalTrackedKg = 0;
  let totalCo2Kg = 0;
  let totalPaperKg = 0;
  let totalThrows = 0;

  for (const bin of bins) {
    totalThrows += bin.throwEvents;

    for (const materialKey of MATERIALS) {
      const massKg = bin.estimatedMassKg[materialKey] || 0;
      totalTrackedKg += massKg;
      totalCo2Kg += massKg * MATERIAL_CONFIG[materialKey].co2AvoidedPerKg;
      if (materialKey === "paper") {
        totalPaperKg += massKg;
      }
    }
  }

  const impact = bins.map((bin) => ({
    id: bin.id,
    name: bin.name,
    site: bin.site,
    fillPercent: bin.overallFill,
    massKg: round(
      (bin.estimatedMassKg.paper || 0) +
      (bin.estimatedMassKg.plastic || 0) +
      (bin.estimatedMassKg.metal || 0),
      2
    ),
    sheetEquivalent: Math.round((bin.estimatedMassKg.paper || 0) * MATERIAL_CONFIG.paper.sheetsPerKg)
  }));

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalTrackedKg: round(totalTrackedKg, 2),
      co2AvoidedKg: round(totalCo2Kg, 2),
      paperSheetsSaved: Math.round(totalPaperKg * MATERIAL_CONFIG.paper.sheetsPerKg),
      activeAlerts: alerts.length,
      totalThrowEvents: totalThrows
    },
    materialTotals: {
      paperKg: round(bins.reduce((sum, bin) => sum + (bin.estimatedMassKg.paper || 0), 0), 2),
      plasticKg: round(bins.reduce((sum, bin) => sum + (bin.estimatedMassKg.plastic || 0), 0), 2),
      metalKg: round(bins.reduce((sum, bin) => sum + (bin.estimatedMassKg.metal || 0), 0), 2)
    },
    bins,
    alerts,
    impact
  };
}

module.exports = {
  appendActivity,
  buildDashboardPayload,
  buildBinResponse,
  computeFillPercent,
  computeMaterialMassKg,
  reconcileAlerts,
  toIsoTime
};
