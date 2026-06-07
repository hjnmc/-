# 电脑实时监控系统

<div align="center">

一个面向多终端与服务器场景的轻量级实时监控与管理系统，提供监控大屏、设备编排后台、告警流、历史趋势与采集端接入能力。

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![SSE](https://img.shields.io/badge/Realtime-SSE-orange)](https://developer.mozilla.org/docs/Web/API/Server-sent_events)
[![Platform](https://img.shields.io/badge/Agent-Windows%20%7C%20Node-blue)](#采集端接入)

</div>

---

## 目录

- [项目简介](#项目简介)
- [核心能力](#核心能力)
- [系统架构](#系统架构)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [本地运行](#本地运行)
- [Docker 部署](#docker-部署)
- [采集端接入](#采集端接入)
- [接口概览](#接口概览)
- [数据存储与配置](#数据存储与配置)
- [使用建议](#使用建议)
- [后续扩展方向](#后续扩展方向)

---

## 项目简介

极光运维矩阵是一个基于 Node.js 原生能力构建的实时监控系统，适用于办公终端、小型机房、实验环境与多节点演示场景。系统围绕“监控大屏 + 管理后台 + 轻量采集端”展开，支持在后台注册设备、生成独立令牌、接入采集端并持续回传指标数据。

项目默认提供演示模拟能力，开箱即可查看完整监控效果；当需要接入真实设备时，也可以通过内置的 Node 采集端或 PowerShell 采集端快速接入。

### 适用场景

- 多台 Windows 电脑或服务器的统一状态查看
- 办公网络、实验室、机房边缘节点的轻量监控
- 会议室大屏、值班看板、演示环境的实时展示
- 需要快速搭建、低依赖部署的内部监控原型系统

---

## 核心能力

### 1. 实时监控大屏

- 提供独立监控首页，适合大屏投放与全局态势观察
- 展示在线状态、健康度、资源趋势、压力排名、分组态势与事件流
- 使用 SSE 实时推送数据，前端无须手动刷新

### 2. 设备编排后台

- 支持新增、编辑、删除监控设备
- 可配置设备名称、地址、分组、位置、平台、标签和备注
- 支持 CPU、内存、磁盘阈值配置
- 支持为每台设备生成独立接入令牌

### 3. 双采集端接入

- 提供 Node 采集端，适用于跨平台轻量接入
- 提供 PowerShell 采集端，适用于 Windows 设备快速部署
- 采集 CPU、内存、磁盘、网络、进程数量、运行时长、温度估算等指标

### 4. 告警与运维动作

- 基于阈值生成预警与严重告警
- 支持告警确认
- 支持下发即时采样命令
- 支持切换维护模式，避免维护期间误判健康状态

### 5. 历史数据与事件留痕

- 保存设备历史趋势数据
- 提供最近时间窗口的资源曲线查询
- 记录新增设备、告警触发、命令执行等操作活动

---

## 系统架构

```text
+----------------------------------------------------------+
|                     Aurora Ops Matrix                    |
|----------------------------------------------------------|
|  Web UI                Admin UI             API Server   |
|  Dashboard             Device Console       HTTP/SSE     |
+------------------------------+---------------------------+
                               |
                     +---------+---------+
                     |    data/db.json   |
                     | persistent store  |
                     +---------+---------+
                               |
          +--------------------+--------------------+
          |                                         |
+---------+---------+                     +---------+---------+
| Node Agent        |                     | PowerShell Agent  |
| Windows / Linux   |                     | Windows           |
| /api/ingest       |                     | /api/ingest       |
+-------------------+                     +-------------------+
```

---

## 技术栈

| 类别 | 说明 |
| --- | --- |
| 服务端 | Node.js 18+，基于原生 `http`、`fs`、`path`、`crypto` 模块 |
| 前端 | 原生 HTML、CSS、JavaScript |
| 实时通信 | Server-Sent Events (SSE) |
| 数据存储 | 本地 JSON 文件持久化 |
| 部署方式 | 本地运行 / Docker / Docker Compose |
| 采集端 | Node Agent、PowerShell Agent |

---

## 项目结构

```text
.
├─ data/
│  └─ db.json
├─ public/
│  ├─ admin.html
│  ├─ app.js
│  ├─ index.html
│  └─ styles.css
├─ scripts/
│  ├─ agent.js
│  └─ windows-agent.ps1
├─ docker-compose.yml
├─ Dockerfile
├─ package.json
├─ README.md
└─ server.js
```

### 关键文件说明

- [server.js](./server.js)：系统主服务，负责 API、SSE、静态资源与数据落盘
- [public/index.html](./public/index.html)：监控大屏页面
- [public/admin.html](./public/admin.html)：后台管理页面
- [public/app.js](./public/app.js)：前端交互逻辑与数据渲染
- [scripts/agent.js](./scripts/agent.js)：Node 采集端
- [scripts/windows-agent.ps1](./scripts/windows-agent.ps1)：PowerShell 采集端

---

## 快速开始

### 方式一：直接启动

```bash
node server.js
```

启动后访问：

- 监控大屏：`http://127.0.0.1:3030/`
- 后台管理：`http://127.0.0.1:3030/admin`

### 方式二：使用 npm script

```bash
npm start
```

---

## 本地运行

### 环境要求

- Node.js 18 或更高版本

### 安装与启动

本项目无额外第三方 npm 依赖，克隆后即可直接运行：

```bash
git clone <your-repository-url>
cd aurora-ops-monitor
node server.js
```

如果当前环境无法直接调用系统 Node，可使用工作区自带运行时：

```powershell
& "C:\Users\96948\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" .\server.js
```

---

## Docker 部署

### 使用 Docker Compose

```bash
docker compose up -d --build
```

查看日志：

```bash
docker compose logs -f
```

停止服务：

```bash
docker compose down
```

### 直接构建镜像

```bash
docker build -t aurora-ops-matrix .
docker run -d --name aurora-ops -p 3030:3030 -v aurora-ops-data:/app/data aurora-ops-matrix
```

---

## 采集端接入

### 接入流程

1. 打开后台管理页。
2. 新增一个监控设备。
3. 系统会为该设备生成独立接入令牌。
4. 在目标机器执行对应采集端脚本。
5. 设备开始向服务端持续上报指标。

### PowerShell 采集端

适用于 Windows 主机。

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows-agent.ps1 `
  -ServerUrl http://127.0.0.1:3030 `
  -Token <设备令牌> `
  -DeviceName "办公电脑-01"
```

### Node 采集端

适用于安装了 Node.js 的 Windows / Linux 设备。

```bash
node scripts/agent.js --server http://127.0.0.1:3030 --token <设备令牌> --name "实验室节点-01"
```

### 采集内容

- CPU 使用率
- 内存使用率
- 磁盘使用率
- 上下行网络速率
- 进程数量
- 运行时长
- 温度估算值
- 平台与标签元信息

---

## 接口概览

### 页面路由

- `GET /`：监控大屏
- `GET /admin`：后台管理页

### 核心 API

- `GET /api/bootstrap`：初始化页面数据
- `GET /api/servers`：获取设备列表
- `POST /api/servers`：新增设备
- `PUT /api/servers/:id`：更新设备
- `POST /api/servers/:id/actions`：执行设备动作
- `GET /api/servers/:id/history?metric=cpu`：查询历史曲线
- `GET /api/stream`：SSE 实时数据流
- `POST /api/ingest`：采集端上报指标
- `GET /api/agent/commands?token=...`：采集端拉取待执行命令
- `POST /api/agent/command-result`：采集端回传命令执行结果

### 支持的设备动作

- `collect_now`：立即采样
- `toggle_maintenance`：切换维护模式
- `ack_alerts`：确认当前设备告警

---

## 数据存储与配置

### 持久化目录

- 默认数据目录：`./data`
- 默认数据文件：`./data/db.json`

### 环境变量

| 变量名 | 默认值 | 说明 |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | 服务监听地址 |
| `PORT` | `3030` | 服务监听端口 |
| `DATA_DIR` | `./data` | 数据持久化目录 |

### Docker Compose 默认配置

当前仓库中的 [docker-compose.yml](./docker-compose.yml) 默认会：

- 将容器 `3030` 端口映射到宿主机 `3030`
- 将本地 `./data` 挂载到容器 `/app/data`
- 设置时区为 `Asia/Shanghai`

---

## 使用建议

- 首次体验建议保留演示模拟数据，便于快速查看大屏效果。
- 接入真实设备前，建议关闭设备的模拟开关，避免模拟数据干扰实际趋势。
- 若用于局域网多终端访问，请确保目标机器可访问服务端 `3030` 端口。
- 若用于长期运行，建议优先采用 Docker 部署并定期备份 `data/db.json`。

---

## 后续扩展方向

- 登录鉴权与角色权限体系
- WebSocket 双向控制通道
- 邮件、企业微信、钉钉、飞书告警通知
- 更完整的进程、服务、磁盘分区级监控
- Redis / PostgreSQL 持久化改造
- 多实例部署与集中管理能力

---

## 说明

当前版本以轻量、可演示、易部署为目标，适合作为内部监控原型、课程项目、展示系统或二次开发基础。如果你计划将其用于正式生产环境，建议进一步补充认证授权、异常恢复、日志治理、持久化升级和更严格的安全策略。

## 系统截图
### 监控大屏
<img width="2516" height="1251" alt="M3@B4LS7~RMI1LALQ)FGOSO" src="https://github.com/user-attachments/assets/48f07503-5069-4693-8ee3-8d8987391516" />
<img width="2510" height="1244" alt="TWLVEPC% 68MQ @}8MI}D2K" src="https://github.com/user-attachments/assets/e8dad390-2a80-4eee-86fd-7f12ca06e6c3" />

###  主机管理页面
<img width="2519" height="1245" alt="KUF9KB4QOVC}~Q8R}`A%{38" src="https://github.com/user-attachments/assets/fda9a741-666c-478d-a317-c01aec70db41" />
<img width="2522" height="1242" alt="~}FPL$FN26CXD~0K3C VR}L" src="https://github.com/user-attachments/assets/49fa5582-e8c8-4fc1-87ea-254b5b5b391c" />
