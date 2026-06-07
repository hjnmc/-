# 电脑实时监控系统

一个面向多台电脑与服务器的实时监控与管理系统，支持后台注册设备、生成独立接入令牌、实时监控大屏、告警流、历史趋势和采集端接入。

这套界面和你给的示例刻意做了明显区分：

- 监控页采用“指挥舱”式大屏布局，强调全局态势、压力热点和事件流。
- 后台页采用“设备编排工坊”布局，强调设备注册、阈值管理、采集端接入和运维日志。

## 主要能力

- 支持后台添加和管理多台电脑设备
- 为每台设备生成独立接入令牌
- 支持 Node 采集端与 PowerShell 采集端
- 实时采集处理器、内存、磁盘、网络、进程、温度估算、运行时长
- 使用 SSE 实时推送前端监控数据
- 提供趋势图、压力排名、分组态势、事件与告警流
- 支持维护模式、即时采样、告警确认、设备删除
- 提供 Docker 部署方式

## 项目结构

- [server.js](F:/监控系统项目/server.js)
- [public/index.html](F:/监控系统项目/public/index.html)
- [public/admin.html](F:/监控系统项目/public/admin.html)
- [public/app.js](F:/监控系统项目/public/app.js)
- [public/styles.css](F:/监控系统项目/public/styles.css)
- [scripts/agent.js](F:/监控系统项目/scripts/agent.js)
- [scripts/windows-agent.ps1](F:/监控系统项目/scripts/windows-agent.ps1)
- [Dockerfile](F:/监控系统项目/Dockerfile)
- [docker-compose.yml](F:/监控系统项目/docker-compose.yml)

## 本地启动

如果本机已安装 Node：

```bash
node server.js
```

使用当前工作区自带 Node 运行时：

```powershell
& "C:\Users\96948\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" F:\监控系统项目\server.js
```

访问地址：

- 监控大屏：[http://127.0.0.1:3030/](http://127.0.0.1:3030/)
- 后台管理：[http://127.0.0.1:3030/admin](http://127.0.0.1:3030/admin)

## Docker 部署

### 方式一：使用 Docker Compose

```bash
docker compose up -d --build
```

停止服务：

```bash
docker compose down
```

### 方式二：直接构建镜像

```bash
docker build -t aurora-ops-matrix .
docker run -d --name aurora-ops -p 3030:3030 -v aurora-ops-data:/app/data aurora-ops-matrix
```

## 数据持久化

- 容器内数据目录是 `/app/data`
- `docker-compose.yml` 已将本地 [data](F:/监控系统项目/data) 目录挂载到容器内
- 数据文件默认是 `data/db.json`

## 接入真实电脑

### PowerShell 采集端

1. 在后台添加设备。
2. 复制右侧自动生成的 PowerShell 命令。
3. 在目标 Windows 电脑执行。

示例：

```powershell
powershell -ExecutionPolicy Bypass -File .\windows-agent.ps1 -ServerUrl http://你的监控主机:3030 -Token 设备令牌 -DeviceName "办公电脑-01"
```

### Node 采集端

```bash
node scripts/agent.js --server http://你的监控主机:3030 --token 设备令牌 --name "实验室节点-01"
```

## 使用建议

- 如果准备接入真实电脑，建议关闭“演示模拟”，避免模拟数据覆盖真实趋势。
- 新设备接入后，后台会自动生成专属令牌和安装命令。
- `collect_now` 用于通知采集端立即回传一次采样。
- `toggle_maintenance` 适合维护或升级期间暂时屏蔽健康度影响。

## 后续可扩展方向

- 登录鉴权与权限体系
- WebSocket 双向控制通道
- 邮件、企业微信、钉钉、飞书告警通知
- 进程清单、服务状态、磁盘分区级监控
- Redis / PostgreSQL 持久化与多实例部署
