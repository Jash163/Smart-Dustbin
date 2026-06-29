"use strict";

const MATERIALS = ["paper", "plastic", "metal"];
const AUTO_CLEAR_MS = 6 * 60 * 60 * 1000;

const MATERIAL_CONFIG = {
  paper: {
    label: "Paper",
    emptyDistanceCm: 52,
    fullDistanceCm: 8,
    capacityKg: 6,
    co2AvoidedPerKg: 1.3,
    sheetsPerKg: 200
  },
  plastic: {
    label: "Plastic",
    emptyDistanceCm: 48,
    fullDistanceCm: 7,
    capacityKg: 5,
    co2AvoidedPerKg: 2.1,
    sheetsPerKg: 0
  },
  metal: {
    label: "Metal",
    emptyDistanceCm: 46,
    fullDistanceCm: 6,
    capacityKg: 8,
    co2AvoidedPerKg: 3.6,
    sheetsPerKg: 0
  }
};

const BIN_CONFIG = [
  {
    id: "lib",
    name: "Library Bin",
    site: "SNU Library",
    latlng: [28.5248, 77.5725]
  },
  {
    id: "eng",
    name: "Engineering Bin",
    site: "SNU Block C",
    latlng: [28.5260, 77.5745]
  },
  {
    id: "cant",
    name: "Dining Hall Bin",
    site: "Dining Hall 1",
    latlng: [28.5238, 77.5715]
  }
];

function buildInitialState() {
  const bins = {};

  for (const bin of BIN_CONFIG) {
    bins[bin.id] = {
      id: bin.id,
      name: bin.name,
      site: bin.site,
      latlng: bin.latlng,
      fills: {
        paper: 0,
        plastic: 0,
        metal: 0,
        others: 0
      },
      distancesCm: {
        paper: null,
        plastic: null,
        metal: null
      },
      estimatedMassKg: {
        paper: 0,
        plastic: 0,
        metal: 0,
        others: 0
      },
      throwEvents: 0,
      lastIrState: false,
      lastThrowAt: null,
      lastTelemetryAt: null,
      alerts: [],
      activity: []
    };
  }

  return {
    version: 1,
    bins
  };
}

module.exports = {
  AUTO_CLEAR_MS,
  BIN_CONFIG,
  MATERIALS,
  MATERIAL_CONFIG,
  buildInitialState
};
