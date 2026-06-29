"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const { TelemetryStore } = require("./store");

const PORT = Number(process.env.PORT || 8080);
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const store = new TelemetryStore();

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendEmpty(response, statusCode) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  response.end();
}

function parseJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";

    request.on("data", (chunk) => {
      raw += chunk.toString("utf8");
      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large."));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Invalid JSON body."));
      }
    });

    request.on("error", reject);
  });
}

function notFound(response) {
  sendJson(response, 404, {
    error: "Not found"
  });
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html") {
    return "text/html; charset=utf-8";
  }
  if (extension === ".css") {
    return "text/css; charset=utf-8";
  }
  if (extension === ".js") {
    return "application/javascript; charset=utf-8";
  }
  if (extension === ".json") {
    return "application/json; charset=utf-8";
  }
  if (extension === ".svg") {
    return "image/svg+xml";
  }
  if (extension === ".png") {
    return "image/png";
  }
  return "text/plain; charset=utf-8";
}

function tryServeStatic(urlPath, response) {
  const cleanPath = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const candidatePath = path.normalize(path.join(PUBLIC_DIR, cleanPath));

  if (!candidatePath.startsWith(PUBLIC_DIR)) {
    return false;
  }

  if (!fs.existsSync(candidatePath) || fs.statSync(candidatePath).isDirectory()) {
    return false;
  }

  response.writeHead(200, {
    "Content-Type": contentTypeFor(candidatePath)
  });
  response.end(fs.readFileSync(candidatePath));
  return true;
}

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    notFound(response);
    return;
  }

  if (request.method === "OPTIONS") {
    sendEmpty(response, 204);
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const segments = url.pathname.split("/").filter(Boolean);

  try {
    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, {
        ok: true,
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/dashboard") {
      sendJson(response, 200, store.getDashboard());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/bins") {
      sendJson(response, 200, {
        bins: store.listBins()
      });
      return;
    }

    if (request.method === "GET" && segments.length === 3 && segments[0] === "api" && segments[1] === "bins") {
      const bin = store.getBin(segments[2]);
      if (!bin) {
        notFound(response);
        return;
      }

      sendJson(response, 200, bin);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/telemetry") {
      const payload = await parseJsonBody(request);
      const result = store.ingestTelemetry(payload);
      sendJson(response, 202, result);
      return;
    }

    if (
      request.method === "POST" &&
      segments.length === 4 &&
      segments[0] === "api" &&
      segments[1] === "bins" &&
      segments[3] === "report-issue"
    ) {
      const payload = await parseJsonBody(request);
      const issue = typeof payload.text === "string" && payload.text.trim()
        ? payload.text.trim()
        : "Manual issue reported";
      const level = payload.level === "warn" ? "warn" : "danger";
      const bin = store.reportIssue(segments[2], issue, level);
      sendJson(response, 201, bin);
      return;
    }

    if (request.method === "GET" && tryServeStatic(url.pathname, response)) {
      return;
    }

    notFound(response);
  } catch (error) {
    sendJson(response, 400, {
      error: error.message
    });
  }
});

server.listen(PORT, () => {
  console.log(`Smart segregation backend listening on http://localhost:${PORT}`);
});
