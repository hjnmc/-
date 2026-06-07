const state = {
  payload: null,
  selectedServerId: null,
  editingServerId: null,
  editMode: false,
  formDirty: false
};

const page = document.body.dataset.page;

const STATUS_TEXT = {
  online: "正常",
  warning: "预警",
  critical: "严重",
  offline: "离线",
  maintenance: "维护中"
};

const EVENT_TEXT = {
  alert: "告警",
  system: "系统",
  agent: "采集端",
  command: "命令"
};

function statusClass(status) {
  return `status-pill status-${status}`;
}

function formatPercent(value) {
  return `${Math.round(value || 0)}%`;
}

function formatTime(value) {
  if (!value) return "尚未上线";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function relativeTime(value) {
  if (!value) return "等待采集端连接";
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatStatusText(status) {
  return STATUS_TEXT[status] || status;
}

function formatEventType(type) {
  return EVENT_TEXT[type] || "动态";
}

function sparkline(values, color = "#f97316") {
  const width = 240;
  const height = 52;
  const safe = values.length ? values : [0, 0];
  const max = Math.max(...safe, 100);
  const min = Math.min(...safe, 0);
  const span = max - min || 1;
  const points = safe
    .map((value, index) => {
      const x = (index / Math.max(safe.length - 1, 1)) * width;
      const y = height - ((value - min) / span) * (height - 6) - 3;
      return `${x},${y}`;
    })
    .join(" ");
  return `
    <svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <polyline fill="none" stroke="${color}" stroke-width="3" points="${points}" />
    </svg>
  `;
}

function linePath(series, width, height, maxY) {
  if (!series.length) {
    return "";
  }
  return series
    .map((point, index) => {
      const x = 40 + (index / Math.max(series.length - 1, 1)) * (width - 60);
      const y = height - 30 - ((point.value || 0) / maxY) * (height - 60);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

function renderTrendChart(payload) {
  const mount = document.getElementById("trendChart");
  if (!mount) return;
  const cpu = payload.series.cpu || [];
  const memory = payload.series.memory || [];
  const network = payload.series.network || [];
  const width = 900;
  const height = 320;
  const maxY = Math.max(
    100,
    ...cpu.map((item) => item.value),
    ...memory.map((item) => item.value),
    ...network.map((item) => item.value)
  );
  const grid = [0, 25, 50, 75, 100]
    .map((value) => {
      const y = height - 30 - (value / 100) * (height - 60);
      return `<g><line class="grid" x1="40" y1="${y}" x2="${width - 20}" y2="${y}" /><text x="8" y="${y + 4}">${value}</text></g>`;
    })
    .join("");

  const area = `${linePath(cpu, width, height, maxY)} L ${width - 20} ${height - 30} L 40 ${height - 30} Z`;
  mount.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" width="100%" height="${height}">
      ${grid}
      <path class="area-a" d="${area}"></path>
      <path class="series-a" d="${linePath(cpu, width, height, maxY)}"></path>
      <path class="series-b" d="${linePath(memory, width, height, maxY)}"></path>
      <path class="series-c" d="${linePath(network, width, height, maxY)}"></path>
      <text x="48" y="22">处理器</text>
      <text x="112" y="22">内存</text>
      <text x="164" y="22">网络</text>
      <text x="${width - 150}" y="${height - 8}">最近 48 个采样点</text>
    </svg>
  `;
}

function renderSummary(payload) {
  const mount = document.getElementById("summaryCards");
  if (!mount) return;
  const cards = [
    {
      label: "受管设备",
      value: payload.summary.total,
      mini: `${payload.summary.online} 台在线`
    },
    {
      label: "平均健康度",
      value: payload.summary.avgHealth,
      mini: `${payload.summary.critical} 台严重异常`
    },
    {
      label: "平均处理器占用",
      value: payload.summary.avgCpu,
      mini: `${payload.summary.avgMemory}% 内存占用`
    },
    {
      label: "离线设备",
      value: payload.summary.offline,
      mini: `${payload.alerts.filter((item) => !item.acknowledgedAt).length} 条待处理告警`
    }
  ];
  mount.innerHTML = cards
    .map(
      (card) => `
      <article class="summary-card">
        <div class="label">${escapeHtml(card.label)}</div>
        <div class="value">${escapeHtml(card.value)}</div>
        <div class="mini">${escapeHtml(card.mini)}</div>
      </article>
    `
    )
    .join("");
}

function renderFleet(payload) {
  const mount = document.getElementById("fleetGrid");
  if (!mount) return;
  mount.innerHTML = payload.servers
    .slice()
    .sort((left, right) => right.healthScore - left.healthScore)
    .map((server) => {
      const cpuHistory = (server.history.cpu || []).map((item) => item.value);
      return `
        <article class="server-card">
          <div class="server-card-head">
            <div>
              <h4>${escapeHtml(server.name)}</h4>
              <div class="server-meta">${escapeHtml(server.group)} · ${escapeHtml(server.location)}</div>
            </div>
            <span class="${statusClass(server.status)}">${escapeHtml(formatStatusText(server.status))}</span>
          </div>
          <div class="metric-grid">
            <div class="metric-chip"><div class="metric-meta">健康度</div><div class="metric-value">${server.healthScore}</div></div>
            <div class="metric-chip"><div class="metric-meta">处理器</div><div class="metric-value">${formatPercent(server.metrics.cpu)}</div></div>
            <div class="metric-chip"><div class="metric-meta">内存</div><div class="metric-value">${formatPercent(server.metrics.memory)}</div></div>
            <div class="metric-chip"><div class="metric-meta">磁盘</div><div class="metric-value">${formatPercent(server.metrics.disk)}</div></div>
          </div>
          ${sparkline(cpuHistory, server.status === "critical" ? "#dc2626" : "#f97316")}
          <p class="server-notes">${escapeHtml(server.metrics.loadLabel || "实时采样")} · 最后心跳 ${escapeHtml(relativeTime(server.lastSeen))}</p>
          <div class="tag-list">${(server.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
        </article>
      `;
    })
    .join("");
}

function renderPressure(payload) {
  const mount = document.getElementById("pressureBars");
  if (!mount) return;
  mount.innerHTML = `
    <div class="bar-list">
      ${payload.topPressure
        .map(
          (item) => `
          <div class="bar-item">
            <div>${escapeHtml(item.name)}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${item.value}%"></div></div>
            <div>${item.value}</div>
          </div>
        `
        )
        .join("")}
    </div>
  `;
}

function renderGroups(payload) {
  const mount = document.getElementById("groupCards");
  if (!mount) return;
  mount.innerHTML = payload.groups
    .map(
      (group) => `
      <article class="group-card">
        <h4>${escapeHtml(group.name)}</h4>
        <p class="muted">${group.total} 台设备归属该分组</p>
        <div class="group-badges">
          <span>正常 ${group.online || 0}</span>
          <span>预警 ${group.warning || 0}</span>
          <span>严重 ${group.critical || 0}</span>
        </div>
      </article>
    `
    )
    .join("");
}

function renderFeed(payload, activityTargetId = "alertFeed") {
  const mount = document.getElementById(activityTargetId);
  if (!mount) return;
  const merged = [
    ...payload.alerts.map((item) => ({
      type: "alert",
      title: `${item.serverName} · ${formatStatusText(item.severity)}`,
      detail: item.message,
      createdAt: item.createdAt
    })),
    ...payload.activity.map((item) => ({
      type: item.kind,
      title: `${formatEventType(item.kind)} · ${item.title}`,
      detail: item.detail,
      createdAt: item.createdAt
    }))
  ]
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    .slice(0, 24);

  mount.innerHTML = merged
    .map(
      (item) => `
      <article class="feed-item">
        <div class="feed-head">
          <h4>${escapeHtml(item.title)}</h4>
          <span class="feed-time">${escapeHtml(relativeTime(item.createdAt))}</span>
        </div>
        <div class="feed-detail">${escapeHtml(item.detail)}</div>
      </article>
    `
    )
    .join("");
}

function installSnippets(server) {
  const origin = window.location.origin;
  const safeName = server.name.replaceAll('"', '\\"');
  const nodeSnippet = `node scripts/agent.js --server ${origin} --token ${server.token} --name "${safeName}"`;
  const psSnippet = `powershell -ExecutionPolicy Bypass -File .\\windows-agent.ps1 -ServerUrl ${origin} -Token ${server.token} -DeviceName "${safeName}"`;
  return { nodeSnippet, psSnippet };
}

function fillForm(server) {
  const formTitle = document.getElementById("formTitle");
  const setValue = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.value = value ?? "";
  };
  setValue("serverId", server?.id || "");
  setValue("name", server?.name || "");
  setValue("host", server?.host || "");
  setValue("group", server?.group || "");
  setValue("location", server?.location || "");
  setValue("platform", server?.platform || "");
  setValue("tags", (server?.tags || []).join(", "));
  setValue("notes", server?.notes || "");
  setValue("cpuThreshold", server?.thresholds?.cpu || 85);
  setValue("memoryThreshold", server?.thresholds?.memory || 88);
  setValue("diskThreshold", server?.thresholds?.disk || 90);
  document.getElementById("simulationEnabled").checked = server ? !!server.simulationEnabled : true;
  if (formTitle) {
    formTitle.textContent = server ? `编辑设备：${server.name}` : "添加新的监控设备";
  }
  state.formDirty = false;
}

async function postJson(url, method, payload) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({ error: "请求失败" }));
    throw new Error(detail.error || "请求失败");
  }
  return response.json();
}

function renderAdminServers(payload) {
  const mount = document.getElementById("adminServerList");
  if (!mount) return;
  const selectedId = payload.servers.some((item) => item.id === state.selectedServerId)
    ? state.selectedServerId
    : payload.servers[0]?.id;
  state.selectedServerId = selectedId;
  mount.innerHTML = payload.servers
    .map((server) => {
      const selected = server.id === selectedId ? "selected" : "";
      return `
        <article class="admin-server-card ${selected}" data-server-id="${escapeHtml(server.id)}">
          <div class="admin-card-head">
            <div>
              <h4>${escapeHtml(server.name)}</h4>
              <div class="server-meta">${escapeHtml(server.host)} · ${escapeHtml(server.platform)}</div>
            </div>
            <span class="${statusClass(server.status)}">${escapeHtml(formatStatusText(server.status))}</span>
          </div>
          <p class="server-notes">${escapeHtml(server.notes || "暂无备注")} · 最后上报 ${escapeHtml(formatTime(server.lastSeen))}</p>
          <div class="metric-grid">
            <div class="metric-chip"><div class="metric-meta">处理器</div><div class="metric-value">${formatPercent(server.metrics.cpu)}</div></div>
            <div class="metric-chip"><div class="metric-meta">内存</div><div class="metric-value">${formatPercent(server.metrics.memory)}</div></div>
            <div class="metric-chip"><div class="metric-meta">磁盘</div><div class="metric-value">${formatPercent(server.metrics.disk)}</div></div>
            <div class="metric-chip"><div class="metric-meta">进程</div><div class="metric-value">${server.metrics.processes || 0}</div></div>
          </div>
          <div class="tag-list">${(server.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
          <div class="admin-card-actions">
            <button class="mini-btn" data-action="collect_now" data-server-id="${escapeHtml(server.id)}">立即采样</button>
            <button class="mini-btn" data-action="toggle_maintenance" data-server-id="${escapeHtml(server.id)}">${server.maintenanceMode ? "结束维护" : "进入维护"}</button>
            <button class="mini-btn" data-action="ack_alerts" data-server-id="${escapeHtml(server.id)}">确认告警</button>
            <button class="mini-btn" data-action="delete" data-server-id="${escapeHtml(server.id)}">删除设备</button>
          </div>
        </article>
      `;
    })
    .join("");

  mount.querySelectorAll(".admin-server-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      state.selectedServerId = card.dataset.serverId;
      state.editingServerId = card.dataset.serverId;
      state.editMode = true;
      const server = payload.servers.find((item) => item.id === state.selectedServerId);
      fillForm(server);
      renderAdminServers(payload);
      renderInstallBox(payload);
    });
  });

  mount.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const serverId = button.dataset.serverId;
      const action = button.dataset.action;
      if (action === "delete") {
        await fetch(`/api/servers/${serverId}`, { method: "DELETE" });
        if (state.selectedServerId === serverId) {
          state.selectedServerId = null;
        }
        if (state.editingServerId === serverId) {
          state.editingServerId = null;
          state.editMode = false;
          fillForm(null);
        }
        return;
      }
      await postJson(`/api/servers/${serverId}/actions`, "POST", { action });
    });
  });
}

function renderInstallBox(payload) {
  const mount = document.getElementById("installBox");
  if (!mount) return;
  const server = payload.servers.find((item) => item.id === state.selectedServerId) || payload.servers[0];
  if (!server) {
    mount.innerHTML = "<p>先添加一台设备，随后这里会自动生成安装命令。</p>";
    return;
  }
  const { nodeSnippet, psSnippet } = installSnippets(server);
  mount.innerHTML = `
    <p><strong>${escapeHtml(server.name)}</strong> 的接入令牌：<code>${escapeHtml(server.token)}</code></p>
    <p>Windows PowerShell 采集端：</p>
    <div class="code-block">${escapeHtml(psSnippet)}</div>
    <p>Node 采集端：</p>
    <div class="code-block">${escapeHtml(nodeSnippet)}</div>
    <p>如果准备接入真实电脑，建议关闭“演示模拟”，避免模拟数据覆盖真实趋势。</p>
  `;
}

function bindAdminForm() {
  const form = document.getElementById("serverForm");
  if (!form) return;
  form.querySelectorAll("input, textarea").forEach((field) => {
    field.addEventListener("input", () => {
      state.formDirty = true;
    });
    field.addEventListener("change", () => {
      state.formDirty = true;
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const serverId = document.getElementById("serverId").value;
    const payload = {
      name: document.getElementById("name").value.trim(),
      host: document.getElementById("host").value.trim(),
      group: document.getElementById("group").value.trim(),
      location: document.getElementById("location").value.trim(),
      platform: document.getElementById("platform").value.trim(),
      tags: document.getElementById("tags").value.trim(),
      notes: document.getElementById("notes").value.trim(),
      simulationEnabled: document.getElementById("simulationEnabled").checked,
      thresholds: {
        cpu: Number(document.getElementById("cpuThreshold").value),
        memory: Number(document.getElementById("memoryThreshold").value),
        disk: Number(document.getElementById("diskThreshold").value)
      }
    };

    const response = serverId
      ? await postJson(`/api/servers/${serverId}`, "PUT", payload)
      : await postJson("/api/servers", "POST", payload);
    state.selectedServerId = response.id;
    state.editingServerId = null;
    state.editMode = false;
    state.formDirty = false;
    form.reset();
    fillForm(null);
  });

  const resetBtn = document.getElementById("resetFormBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      form.reset();
      state.editingServerId = null;
      state.editMode = false;
      state.formDirty = false;
      fillForm(null);
    });
  }
}

function renderDashboard(payload) {
  const generatedAt = document.getElementById("generatedAt");
  if (generatedAt) {
    generatedAt.textContent = `刷新时间：${formatTime(payload.generatedAt)}`;
  }
  renderSummary(payload);
  renderTrendChart(payload);
  renderFleet(payload);
  renderPressure(payload);
  renderGroups(payload);
  renderFeed(payload);
}

function renderAdmin(payload) {
  renderAdminServers(payload);
  renderInstallBox(payload);
  renderFeed(payload, "activityList");
  if (!state.formDirty) {
    const editing = state.editMode
      ? payload.servers.find((item) => item.id === state.editingServerId) || null
      : null;
    fillForm(editing);
  }
}

function render(payload) {
  state.payload = payload;
  if (page === "dashboard") {
    renderDashboard(payload);
  } else if (page === "admin") {
    renderAdmin(payload);
  }
}

async function bootstrap() {
  const response = await fetch("/api/bootstrap");
  const payload = await response.json();
  render(payload);
  const stream = new EventSource("/api/stream");
  stream.onmessage = (event) => {
    render(JSON.parse(event.data));
  };
}

bindAdminForm();
bootstrap();
