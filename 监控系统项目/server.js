const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3030);
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const HISTORY_LIMIT = 240;
const SSE_CLIENTS = new Set();

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8"
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 1) {
  return Number(Number(value).toFixed(digits));
}

function uid(prefix) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function isoNow() {
  return new Date().toISOString();
}

function randomSeries(base, spread, size) {
  const values = [];
  let current = base;
  for (let index = 0; index < size; index += 1) {
    current = clamp(current + (Math.random() - 0.5) * spread, 8, 98);
    values.push(round(current));
  }
  return values;
}

function computeHealth(server) {
  if (server.maintenanceMode) {
    return 100;
  }
  const lastSeenGap = Date.now() - new Date(server.lastSeen || 0).getTime();
  if (!server.lastSeen || lastSeenGap > 90_000) {
    return 0;
  }
  const metrics = server.metrics || {};
  const cpuPenalty = Math.max(0, (metrics.cpu || 0) - 65) * 0.7;
  const memoryPenalty = Math.max(0, (metrics.memory || 0) - 72) * 0.8;
  const diskPenalty = Math.max(0, (metrics.disk || 0) - 78) * 1.1;
  const tempPenalty = Math.max(0, (metrics.temperature || 0) - 70) * 0.9;
  return clamp(round(100 - cpuPenalty - memoryPenalty - diskPenalty - tempPenalty, 0), 0, 100);
}

function statusFor(server) {
  if (server.maintenanceMode) {
    return "maintenance";
  }
  const gap = Date.now() - new Date(server.lastSeen || 0).getTime();
  if (!server.lastSeen || gap > 90_000) {
    return "offline";
  }
  if ((server.healthScore || 0) <= 35) {
    return "critical";
  }
  if ((server.healthScore || 0) <= 70) {
    return "warning";
  }
  return "online";
}

function createSeedServer(config) {
  const now = Date.now();
  const cpuSeries = randomSeries(config.cpu, 12, 48);
  const memorySeries = randomSeries(config.memory, 8, 48);
  const diskSeries = randomSeries(config.disk, 2.2, 48);
  const networkSeries = randomSeries(config.network, 18, 48);

  const server = {
    id: uid("srv"),
    token: uid("tok"),
    name: config.name,
    host: config.host,
    location: config.location,
    group: config.group,
    platform: config.platform,
    notes: config.notes,
    tags: config.tags,
    simulationEnabled: true,
    status: "online",
    maintenanceMode: false,
    lastSeen: new Date(now - 1000 * (2 + Math.random() * 5)).toISOString(),
    createdAt: new Date(now - 1000 * 60 * 60 * 36).toISOString(),
    updatedAt: isoNow(),
    thresholds: {
      cpu: 85,
      memory: 88,
      disk: 90
    },
    metrics: {
      cpu: cpuSeries.at(-1),
      memory: memorySeries.at(-1),
      disk: diskSeries.at(-1),
      networkIn: networkSeries.at(-1),
      networkOut: round(networkSeries.at(-1) * 0.72),
      processes: Math.floor(88 + Math.random() * 120),
      uptimeHours: round(48 + Math.random() * 720),
      temperature: round(39 + Math.random() * 26),
      loadLabel: config.loadLabel
    },
    history: {
      cpu: cpuSeries.map((value, index) => ({
        ts: new Date(now - (47 - index) * 60 * 1000).toISOString(),
        value
      })),
      memory: memorySeries.map((value, index) => ({
        ts: new Date(now - (47 - index) * 60 * 1000).toISOString(),
        value
      })),
      disk: diskSeries.map((value, index) => ({
        ts: new Date(now - (47 - index) * 60 * 1000).toISOString(),
        value
      })),
      network: networkSeries.map((value, index) => ({
        ts: new Date(now - (47 - index) * 60 * 1000).toISOString(),
        value
      }))
    },
    audit: [],
    commandIds: []
  };

  server.healthScore = computeHealth(server);
  return server;
}

function seedDatabase() {
  const servers = [
    createSeedServer({
      name: "设计工作站-01",
      host: "10.0.8.21",
      location: "上海 / 创意工作室",
      group: "创意中心",
      platform: "Windows 11",
      notes: "图形工作站与渲染节点",
      tags: ["设计", "图形", "渲染"],
      cpu: 54,
      memory: 61,
      disk: 44,
      network: 36,
      loadLabel: "渲染混合负载"
    }),
    createSeedServer({
      name: "边缘网关-02",
      host: "10.0.4.9",
      location: "杭州 / 机房",
      group: "边缘节点",
      platform: "Ubuntu 24.04",
      notes: "边缘缓存与出口流量调度",
      tags: ["边缘", "网络", "生产"],
      cpu: 33,
      memory: 48,
      disk: 57,
      network: 72,
      loadLabel: "流量均衡任务"
    }),
    createSeedServer({
      name: "财务终端-07",
      host: "10.0.11.76",
      location: "苏州 / 办公区",
      group: "办公终端",
      platform: "Windows 10",
      notes: "财务终端，重点关注磁盘与进程异常",
      tags: ["办公", "财务", "重点"],
      cpu: 67,
      memory: 78,
      disk: 81,
      network: 22,
      loadLabel: "批量对账任务"
    })
  ];

  const alerts = [
    {
      id: uid("alt"),
      serverId: servers[2].id,
      serverName: servers[2].name,
      severity: "warning",
      category: "capacity",
      message: "磁盘使用率已接近阈值，建议清理临时文件或考虑扩容。",
      createdAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      acknowledgedAt: null
    }
  ];

  const activity = [
    {
      id: uid("evt"),
      kind: "system",
      title: "示例设备已预置",
      detail: "系统已生成 3 台演示设备，便于立即查看监控大屏效果。",
      createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString()
    }
  ];

  return {
    meta: {
      title: "极光运维矩阵",
      createdAt: isoNow(),
      version: 1
    },
    servers,
    alerts,
    commands: [],
    activity
  };
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    const db = seedDatabase();
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
    return db;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function saveDb() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(state.db, null, 2), "utf8");
}

function addActivity(kind, title, detail) {
  state.db.activity.unshift({
    id: uid("evt"),
    kind,
    title,
    detail,
    createdAt: isoNow()
  });
  state.db.activity = state.db.activity.slice(0, 40);
}

function addAlert(server, severity, category, message) {
  const recent = state.db.alerts.find((alert) => {
    return (
      alert.serverId === server.id &&
      alert.category === category &&
      Date.now() - new Date(alert.createdAt).getTime() < 5 * 60 * 1000
    );
  });
  if (recent) {
    return;
  }
  state.db.alerts.unshift({
    id: uid("alt"),
    serverId: server.id,
    serverName: server.name,
    severity,
    category,
    message,
    createdAt: isoNow(),
    acknowledgedAt: null
  });
  state.db.alerts = state.db.alerts.slice(0, 80);
  addActivity("alert", `${server.name} 触发${severity === "critical" ? "严重" : "预警"}事件`, message);
}

function recordHistory(server, snapshot) {
  const ts = isoNow();
  const entries = {
    cpu: snapshot.cpu,
    memory: snapshot.memory,
    disk: snapshot.disk,
    network: round((snapshot.networkIn || 0) + (snapshot.networkOut || 0))
  };

  Object.entries(entries).forEach(([key, value]) => {
    if (!server.history[key]) {
      server.history[key] = [];
    }
    server.history[key].push({ ts, value: round(value) });
    if (server.history[key].length > HISTORY_LIMIT) {
      server.history[key] = server.history[key].slice(-HISTORY_LIMIT);
    }
  });
}

function updateServerSnapshot(server, snapshot, meta = {}) {
  const mergedSnapshot = {
    cpu: clamp(round(snapshot.cpu || 0), 0, 100),
    memory: clamp(round(snapshot.memory || 0), 0, 100),
    disk: clamp(round(snapshot.disk || 0), 0, 100),
    networkIn: clamp(round(snapshot.networkIn || 0), 0, 9999),
    networkOut: clamp(round(snapshot.networkOut || 0), 0, 9999),
    processes: Math.max(0, Math.round(snapshot.processes || 0)),
    uptimeHours: Math.max(0, round(snapshot.uptimeHours || 0)),
    temperature: clamp(round(snapshot.temperature || 0), 0, 120),
    loadLabel: snapshot.loadLabel || server.metrics?.loadLabel || "采集端回传"
  };

  server.metrics = mergedSnapshot;
  server.lastSeen = isoNow();
  server.updatedAt = isoNow();
  server.host = meta.host || server.host;
  server.platform = meta.platform || server.platform;
  server.location = meta.location || server.location;
  server.tags = Array.isArray(meta.tags) && meta.tags.length ? meta.tags : server.tags;

  recordHistory(server, mergedSnapshot);

  server.healthScore = computeHealth(server);
  server.status = statusFor(server);

  const thresholds = server.thresholds || { cpu: 85, memory: 88, disk: 90 };
  if (mergedSnapshot.cpu >= thresholds.cpu) {
    addAlert(server, mergedSnapshot.cpu > 95 ? "critical" : "warning", "cpu", `处理器使用率达到 ${mergedSnapshot.cpu}%`);
  }
  if (mergedSnapshot.memory >= thresholds.memory) {
    addAlert(server, mergedSnapshot.memory > 95 ? "critical" : "warning", "memory", `内存使用率达到 ${mergedSnapshot.memory}%`);
  }
  if (mergedSnapshot.disk >= thresholds.disk) {
    addAlert(server, mergedSnapshot.disk > 96 ? "critical" : "warning", "capacity", `磁盘使用率达到 ${mergedSnapshot.disk}%`);
  }
  if (mergedSnapshot.temperature >= 82) {
    addAlert(server, "warning", "temperature", `设备温度达到 ${mergedSnapshot.temperature}°C`);
  }
}

function simulateServer(server) {
  const current = server.metrics || {};
  const snapshot = {
    cpu: clamp((current.cpu || 20) + (Math.random() - 0.45) * 10, 5, 99),
    memory: clamp((current.memory || 20) + (Math.random() - 0.48) * 6, 15, 98),
    disk: clamp((current.disk || 40) + (Math.random() - 0.495) * 1.5, 18, 99),
    networkIn: clamp((current.networkIn || 18) + (Math.random() - 0.4) * 12, 1, 140),
    networkOut: clamp((current.networkOut || 10) + (Math.random() - 0.42) * 10, 1, 120),
    processes: clamp((current.processes || 110) + Math.round((Math.random() - 0.5) * 8), 60, 280),
    uptimeHours: (current.uptimeHours || 120) + 0.0014,
    temperature: clamp((current.temperature || 45) + (Math.random() - 0.46) * 2.8, 32, 88),
    loadLabel: current.loadLabel || "演示采样数据"
  };
  updateServerSnapshot(server, snapshot);
}

function refreshDerivedState() {
  for (const server of state.db.servers) {
    server.healthScore = computeHealth(server);
    server.status = statusFor(server);
  }
}

function averageSeries(seriesCollection) {
  const longest = Math.max(...seriesCollection.map((series) => series.length), 0);
  const result = [];
  for (let index = 0; index < longest; index += 1) {
    const bucket = [];
    let ts = isoNow();
    for (const series of seriesCollection) {
      const offset = series.length - longest + index;
      if (offset >= 0 && series[offset]) {
        bucket.push(series[offset].value);
        ts = series[offset].ts;
      }
    }
    if (bucket.length) {
      result.push({
        ts,
        value: round(bucket.reduce((sum, value) => sum + value, 0) / bucket.length)
      });
    }
  }
  return result;
}

function toPublicServer(server) {
  return {
    id: server.id,
    token: server.token,
    name: server.name,
    host: server.host,
    location: server.location,
    group: server.group,
    platform: server.platform,
    notes: server.notes,
    tags: server.tags || [],
    status: server.status,
    maintenanceMode: Boolean(server.maintenanceMode),
    simulationEnabled: Boolean(server.simulationEnabled),
    lastSeen: server.lastSeen,
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
    thresholds: server.thresholds,
    healthScore: server.healthScore,
    metrics: server.metrics,
    history: {
      cpu: (server.history.cpu || []).slice(-24),
      memory: (server.history.memory || []).slice(-24),
      disk: (server.history.disk || []).slice(-24),
      network: (server.history.network || []).slice(-24)
    }
  };
}

function buildBootstrap() {
  refreshDerivedState();
  const servers = state.db.servers.map(toPublicServer);
  const total = servers.length;
  const online = servers.filter((server) => server.status !== "offline").length;
  const warning = servers.filter((server) => server.status === "warning").length;
  const critical = servers.filter((server) => server.status === "critical").length;
  const offline = servers.filter((server) => server.status === "offline").length;
  const avg = (pick) =>
    total
      ? round(servers.reduce((sum, server) => sum + pick(server), 0) / total)
      : 0;

  const groups = Object.values(
    servers.reduce((acc, server) => {
      const key = server.group || "未分组";
      if (!acc[key]) {
        acc[key] = { name: key, total: 0, online: 0, warning: 0, critical: 0 };
      }
      acc[key].total += 1;
      acc[key][server.status] = (acc[key][server.status] || 0) + 1;
      return acc;
    }, {})
  );

  const topPressure = [...servers]
    .sort((left, right) => right.metrics.cpu + right.metrics.memory - (left.metrics.cpu + left.metrics.memory))
    .slice(0, 5)
    .map((server) => ({
      id: server.id,
      name: server.name,
      value: round(server.metrics.cpu * 0.55 + server.metrics.memory * 0.45),
      cpu: server.metrics.cpu,
      memory: server.metrics.memory
    }));

  return {
    meta: state.db.meta,
    generatedAt: isoNow(),
    summary: {
      total,
      online,
      warning,
      critical,
      offline,
      avgCpu: avg((server) => server.metrics.cpu || 0),
      avgMemory: avg((server) => server.metrics.memory || 0),
      avgDisk: avg((server) => server.metrics.disk || 0),
      avgHealth: avg((server) => server.healthScore || 0)
    },
    series: {
      cpu: averageSeries(state.db.servers.map((server) => server.history.cpu || [])).slice(-48),
      memory: averageSeries(state.db.servers.map((server) => server.history.memory || [])).slice(-48),
      network: averageSeries(state.db.servers.map((server) => server.history.network || [])).slice(-48)
    },
    groups,
    topPressure,
    servers,
    alerts: state.db.alerts.slice(0, 20),
    activity: state.db.activity.slice(0, 20),
    commands: state.db.commands.slice(-20).reverse()
  };
}

function broadcast() {
  const payload = `data: ${JSON.stringify(buildBootstrap())}\n\n`;
  for (const client of SSE_CLIENTS) {
    client.write(payload);
  }
}

function queueCommand(serverId, type, payload = {}) {
  const command = {
    id: uid("cmd"),
    serverId,
    type,
    payload,
    status: "pending",
    createdAt: isoNow(),
    deliveredAt: null,
    completedAt: null,
    result: null
  };
  state.db.commands.push(command);
  const server = state.db.servers.find((item) => item.id === serverId);
  if (server) {
    server.commandIds.push(command.id);
    addActivity("command", `已向 ${server.name} 下发命令`, `命令类型：${type}`);
  }
  return command;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function notFound(res) {
  sendJson(res, 404, { error: "Not found" });
}

function serveStatic(res, targetPath) {
  if (!targetPath.startsWith(PUBLIC_DIR)) {
    notFound(res);
    return;
  }
  if (!fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
    notFound(res);
    return;
  }
  const ext = path.extname(targetPath);
  res.writeHead(200, {
    "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
    "Cache-Control": [".html", ".js", ".css"].includes(ext) ? "no-store" : "public, max-age=300"
  });
  fs.createReadStream(targetPath).pipe(res);
}

function createServerFromBody(body) {
  return {
    id: uid("srv"),
    token: uid("tok"),
    name: String(body.name || "").trim() || `新设备-${state.db.servers.length + 1}`,
    host: String(body.host || "").trim() || "pending-host",
    location: String(body.location || "").trim() || "未知位置",
    group: String(body.group || "").trim() || "未分组",
    platform: String(body.platform || "").trim() || "Windows / Linux",
    notes: String(body.notes || "").trim(),
    tags: Array.isArray(body.tags)
      ? body.tags.map((tag) => String(tag).trim()).filter(Boolean)
      : String(body.tags || "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
    simulationEnabled: body.simulationEnabled !== false,
    maintenanceMode: false,
    status: "offline",
    lastSeen: null,
    createdAt: isoNow(),
    updatedAt: isoNow(),
    thresholds: {
      cpu: clamp(Number(body.thresholds?.cpu || body.cpuThreshold || 85), 50, 100),
      memory: clamp(Number(body.thresholds?.memory || body.memoryThreshold || 88), 50, 100),
      disk: clamp(Number(body.thresholds?.disk || body.diskThreshold || 90), 50, 100)
    },
    metrics: {
      cpu: 0,
      memory: 0,
      disk: 0,
      networkIn: 0,
      networkOut: 0,
      processes: 0,
      uptimeHours: 0,
      temperature: 0,
      loadLabel: "等待采集端接入"
    },
    history: { cpu: [], memory: [], disk: [], network: [] },
    audit: [],
    commandIds: []
  };
}

const state = {
  db: ensureDataFile()
};

function handleApi(req, res, pathname, searchParams) {
  if (req.method === "GET" && pathname === "/api/bootstrap") {
    sendJson(res, 200, buildBootstrap());
    return true;
  }

  if (req.method === "GET" && pathname === "/api/servers") {
    sendJson(res, 200, state.db.servers.map(toPublicServer));
    return true;
  }

  if (req.method === "POST" && pathname === "/api/servers") {
    parseBody(req)
      .then((body) => {
        const server = createServerFromBody(body);
        state.db.servers.unshift(server);
        addActivity("system", `新增监控设备 ${server.name}`, `已生成安装令牌 ${server.token}`);
        saveDb();
        broadcast();
        sendJson(res, 201, toPublicServer(server));
      })
      .catch((error) => sendJson(res, 400, { error: error.message }));
    return true;
  }

  const serverMatch = pathname.match(/^\/api\/servers\/([^/]+)$/);
  if (serverMatch && req.method === "PUT") {
    parseBody(req)
      .then((body) => {
        const server = state.db.servers.find((item) => item.id === serverMatch[1]);
        if (!server) {
          notFound(res);
          return;
        }
        server.name = String(body.name || server.name);
        server.host = String(body.host || server.host);
        server.location = String(body.location || server.location);
        server.group = String(body.group || server.group);
        server.platform = String(body.platform || server.platform);
        server.notes = String(body.notes ?? server.notes);
        server.tags = Array.isArray(body.tags)
          ? body.tags.map((tag) => String(tag).trim()).filter(Boolean)
          : String(body.tags || server.tags.join(","))
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean);
        server.thresholds = {
          cpu: clamp(Number(body.thresholds?.cpu || server.thresholds.cpu), 50, 100),
          memory: clamp(Number(body.thresholds?.memory || server.thresholds.memory), 50, 100),
          disk: clamp(Number(body.thresholds?.disk || server.thresholds.disk), 50, 100)
        };
        server.simulationEnabled =
          body.simulationEnabled !== undefined ? Boolean(body.simulationEnabled) : server.simulationEnabled;
        server.updatedAt = isoNow();
        addActivity("system", `更新设备 ${server.name}`, "设备信息与阈值已保存。");
        saveDb();
        broadcast();
        sendJson(res, 200, toPublicServer(server));
      })
      .catch((error) => sendJson(res, 400, { error: error.message }));
    return true;
  }

  if (serverMatch && req.method === "DELETE") {
    const index = state.db.servers.findIndex((item) => item.id === serverMatch[1]);
    if (index === -1) {
      notFound(res);
      return true;
    }
    const [deleted] = state.db.servers.splice(index, 1);
    addActivity("system", `移除设备 ${deleted.name}`, "设备记录与后续采样已从控制台删除。");
    saveDb();
    broadcast();
    sendJson(res, 200, { ok: true });
    return true;
  }

  const actionMatch = pathname.match(/^\/api\/servers\/([^/]+)\/actions$/);
  if (actionMatch && req.method === "POST") {
    parseBody(req)
      .then((body) => {
        const server = state.db.servers.find((item) => item.id === actionMatch[1]);
        if (!server) {
          notFound(res);
          return;
        }
        const action = body.action;
        if (action === "collect_now") {
          queueCommand(server.id, "collect_now");
        } else if (action === "toggle_maintenance") {
          server.maintenanceMode = !server.maintenanceMode;
          addActivity("system", `${server.name} 维护模式${server.maintenanceMode ? "开启" : "关闭"}`, "前端监控状态已同步切换。");
        } else if (action === "ack_alerts") {
          for (const alert of state.db.alerts) {
            if (alert.serverId === server.id && !alert.acknowledgedAt) {
              alert.acknowledgedAt = isoNow();
            }
          }
          addActivity("system", `${server.name} 告警已确认`, "相关告警已从待确认队列中移出。");
        } else {
          sendJson(res, 400, { error: "Unknown action" });
          return;
        }
        saveDb();
        broadcast();
        sendJson(res, 200, { ok: true });
      })
      .catch((error) => sendJson(res, 400, { error: error.message }));
    return true;
  }

  const historyMatch = pathname.match(/^\/api\/servers\/([^/]+)\/history$/);
  if (historyMatch && req.method === "GET") {
    const server = state.db.servers.find((item) => item.id === historyMatch[1]);
    if (!server) {
      notFound(res);
      return true;
    }
    const metric = searchParams.get("metric") || "cpu";
    sendJson(res, 200, {
      metric,
      values: (server.history[metric] || []).slice(-60)
    });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/stream") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    });
    res.write(`data: ${JSON.stringify(buildBootstrap())}\n\n`);
    SSE_CLIENTS.add(res);
    req.on("close", () => SSE_CLIENTS.delete(res));
    return true;
  }

  if (req.method === "POST" && pathname === "/api/ingest") {
    parseBody(req)
      .then((body) => {
        const token = String(body.token || "").trim();
        const server = state.db.servers.find((item) => item.token === token);
        if (!server) {
          sendJson(res, 404, { error: "Invalid token" });
          return;
        }
        updateServerSnapshot(server, body.snapshot || {}, body.meta || {});
        addActivity(
          "agent",
          `${server.name} 已回传实时采样`,
          `处理器 ${server.metrics.cpu}% / 内存 ${server.metrics.memory}% / 磁盘 ${server.metrics.disk}%`
        );
        saveDb();
        broadcast();
        sendJson(res, 200, {
          ok: true,
          commandCount: state.db.commands.filter((item) => item.serverId === server.id && item.status === "pending").length
        });
      })
      .catch((error) => sendJson(res, 400, { error: error.message }));
    return true;
  }

  if (req.method === "GET" && pathname === "/api/agent/commands") {
    const token = String(searchParams.get("token") || "");
    const server = state.db.servers.find((item) => item.token === token);
    if (!server) {
      sendJson(res, 404, { error: "Invalid token" });
      return true;
    }
    const commands = state.db.commands.filter((item) => item.serverId === server.id && item.status === "pending");
    commands.forEach((item) => {
      item.status = "delivered";
      item.deliveredAt = isoNow();
    });
    saveDb();
    sendJson(res, 200, { commands });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/agent/command-result") {
    parseBody(req)
      .then((body) => {
        const token = String(body.token || "");
        const commandId = String(body.commandId || "");
        const server = state.db.servers.find((item) => item.token === token);
        if (!server) {
          sendJson(res, 404, { error: "Invalid token" });
          return;
        }
        const command = state.db.commands.find((item) => item.id === commandId && item.serverId === server.id);
        if (!command) {
          sendJson(res, 404, { error: "Command not found" });
          return;
        }
        command.status = "completed";
        command.completedAt = isoNow();
        command.result = body.result || null;
        addActivity("agent", `${server.name} 已完成命令`, `命令 ${command.type} 执行完成。`);
        saveDb();
        broadcast();
        sendJson(res, 200, { ok: true });
      })
      .catch((error) => sendJson(res, 400, { error: error.message }));
    return true;
  }

  return false;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname.startsWith("/api/")) {
    const handled = handleApi(req, res, pathname, url.searchParams);
    if (!handled) {
      notFound(res);
    }
    return;
  }

  if (pathname === "/" || pathname === "/index.html") {
    serveStatic(res, path.join(PUBLIC_DIR, "index.html"));
    return;
  }

  if (pathname === "/admin") {
    serveStatic(res, path.join(PUBLIC_DIR, "admin.html"));
    return;
  }

  const staticTarget = path.join(PUBLIC_DIR, pathname.replace(/^\/+/, ""));
  serveStatic(res, staticTarget);
});

setInterval(() => {
  let changed = false;
  for (const serverRecord of state.db.servers) {
    if (serverRecord.simulationEnabled && !serverRecord.maintenanceMode) {
      simulateServer(serverRecord);
      changed = true;
    } else {
      const nextStatus = statusFor(serverRecord);
      if (nextStatus !== serverRecord.status) {
        serverRecord.status = nextStatus;
        changed = true;
      }
    }
  }
  if (changed) {
    saveDb();
    broadcast();
  }
}, 5000);

server.listen(PORT, HOST, () => {
  console.log(`极光运维矩阵已启动：http://127.0.0.1:${PORT}`);
});
