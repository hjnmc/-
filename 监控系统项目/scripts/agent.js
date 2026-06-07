#!/usr/bin/env node

const os = require("node:os");
const fs = require("node:fs");
const { execSync } = require("node:child_process");

function getArg(flag, fallback = "") {
  const index = process.argv.indexOf(flag);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return fallback;
}

const serverUrl = getArg("--server", process.env.AURORA_SERVER_URL || "http://127.0.0.1:3030");
const token = getArg("--token", process.env.AURORA_TOKEN || "");
const deviceName = getArg("--name", os.hostname());
const intervalSec = Number(getArg("--interval", process.env.AURORA_INTERVAL || 8));

if (!token) {
  console.error("Missing --token or AURORA_TOKEN");
  process.exit(1);
}

let previousCpu = snapshotCpuTimes();
let previousNetwork = snapshotNetworkStats();

function snapshotCpuTimes() {
  return os.cpus().map((cpu) => ({ ...cpu.times }));
}

function cpuUsage() {
  const next = snapshotCpuTimes();
  let idle = 0;
  let total = 0;
  for (let index = 0; index < next.length; index += 1) {
    const before = previousCpu[index];
    const after = next[index];
    const idleDiff = after.idle - before.idle;
    const totalDiff =
      after.user -
      before.user +
      (after.nice - before.nice) +
      (after.sys - before.sys) +
      idleDiff +
      (after.irq - before.irq);
    idle += idleDiff;
    total += totalDiff;
  }
  previousCpu = next;
  return total > 0 ? Math.max(0, Math.min(100, ((total - idle) / total) * 100)) : 0;
}

function networkStatsCommand() {
  if (process.platform === "win32") {
    return `powershell -NoProfile -Command "Get-NetAdapterStatistics | Select-Object -Property ReceivedBytes,SentBytes | ConvertTo-Json -Compress"`;
  }
  if (process.platform === "linux") {
    return "cat /proc/net/dev";
  }
  return "";
}

function snapshotNetworkStats() {
  try {
    if (process.platform === "win32") {
      const output = execSync(networkStatsCommand(), { encoding: "utf8" }).trim();
      const rows = JSON.parse(output);
      const list = Array.isArray(rows) ? rows : [rows];
      return list.reduce(
        (acc, item) => {
          acc.rx += Number(item.ReceivedBytes || 0);
          acc.tx += Number(item.SentBytes || 0);
          return acc;
        },
        { rx: 0, tx: 0 }
      );
    }
    if (process.platform === "linux" && fs.existsSync("/proc/net/dev")) {
      const raw = execSync(networkStatsCommand(), { encoding: "utf8" });
      return raw
        .split("\n")
        .slice(2)
        .reduce(
          (acc, line) => {
            const [, data] = line.split(":");
            if (!data) return acc;
            const parts = data.trim().split(/\s+/);
            acc.rx += Number(parts[0] || 0);
            acc.tx += Number(parts[8] || 0);
            return acc;
          },
          { rx: 0, tx: 0 }
        );
    }
  } catch (error) {
    return { rx: 0, tx: 0 };
  }
  return { rx: 0, tx: 0 };
}

function networkMbps() {
  const current = snapshotNetworkStats();
  const deltaRx = current.rx - previousNetwork.rx;
  const deltaTx = current.tx - previousNetwork.tx;
  previousNetwork = current;
  const seconds = Math.max(intervalSec, 1);
  return {
    networkIn: (deltaRx * 8) / 1024 / 1024 / seconds,
    networkOut: (deltaTx * 8) / 1024 / 1024 / seconds
  };
}

function diskUsage() {
  try {
    if (process.platform === "win32") {
      const output = execSync(
        `powershell -NoProfile -Command "(Get-CimInstance Win32_LogicalDisk -Filter \\"DriveType=3\\" | Sort-Object Size -Descending | Select-Object -First 1 -Property Size,FreeSpace | ConvertTo-Json -Compress)"`,
        { encoding: "utf8" }
      ).trim();
      const info = JSON.parse(output);
      const total = Number(info.Size || 0);
      const free = Number(info.FreeSpace || 0);
      return total > 0 ? ((total - free) / total) * 100 : 0;
    }
    const output = execSync("df -kP /", { encoding: "utf8" }).trim().split("\n")[1] || "";
    const columns = output.trim().split(/\s+/);
    return Number(String(columns[4] || "0").replace("%", ""));
  } catch (error) {
    return 0;
  }
}

function processCount() {
  try {
    if (process.platform === "win32") {
      const output = execSync(`powershell -NoProfile -Command "(Get-Process).Count"`, { encoding: "utf8" }).trim();
      return Number(output || 0);
    }
    const output = execSync("ps -e --no-headers | wc -l", { encoding: "utf8" }).trim();
    return Number(output || 0);
  } catch (error) {
    return 0;
  }
}

function memoryUsage() {
  const total = os.totalmem();
  const free = os.freemem();
  return total > 0 ? ((total - free) / total) * 100 : 0;
}

function temperatureGuess(cpu, memory) {
  return Math.min(88, 34 + cpu * 0.35 + memory * 0.12);
}

async function sendSnapshot() {
  const cpu = cpuUsage();
  const memory = memoryUsage();
  const disk = diskUsage();
  const network = networkMbps();
  const snapshot = {
    cpu,
    memory,
    disk,
    networkIn: network.networkIn,
    networkOut: network.networkOut,
    processes: processCount(),
    uptimeHours: os.uptime() / 3600,
    temperature: temperatureGuess(cpu, memory),
    loadLabel: process.platform === "win32" ? "Node agent / Windows" : "Node agent / Unix"
  };

  await fetch(`${serverUrl}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      snapshot,
      meta: {
        host: deviceName,
        platform: `${os.type()} ${os.release()}`,
        location: os.hostname(),
        tags: [process.platform, "node-agent"]
      }
    })
  });

  const commandResponse = await fetch(`${serverUrl}/api/agent/commands?token=${encodeURIComponent(token)}`);
  const commandPayload = await commandResponse.json();
  for (const command of commandPayload.commands || []) {
    await fetch(`${serverUrl}/api/agent/command-result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        commandId: command.id,
        result: { ok: true, handledAt: new Date().toISOString(), note: "Command received by lightweight agent." }
      })
    });
  }
}

console.log(`Aurora agent started for ${deviceName} -> ${serverUrl}`);
sendSnapshot().catch((error) => console.error(error));
setInterval(() => {
  sendSnapshot().catch((error) => console.error(error));
}, intervalSec * 1000);
