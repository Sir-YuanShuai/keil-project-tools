# keil-project-tools

[![npm version](https://img.shields.io/npm/v/keil-project-tools)](https://www.npmjs.com/package/keil-project-tools)
[![npm license](https://img.shields.io/npm/l/keil-project-tools)](https://github.com/Sir-YuanShuai/keil-project-tools/blob/main/LICENSE)
[![GitHub Repo stars](https://img.shields.io/github/stars/Sir-YuanShuai/keil-project-tools)](https://github.com/Sir-YuanShuai/keil-project-tools/stargazers)
[![GitHub last commit](https://img.shields.io/github/last-commit/Sir-YuanShuai/keil-project-tools)](https://github.com/Sir-YuanShuai/keil-project-tools/commits/main)
[![GitHub issues](https://img.shields.io/github/issues/Sir-YuanShuai/keil-project-tools)](https://github.com/Sir-YuanShuai/keil-project-tools/issues)
![node](https://img.shields.io/badge/node-%3E%3D18.0.0-blue)

面向 AI Agent 的 Keil µVision 项目操作工具，以 [MCP](https://modelcontextprotocol.io/) 协议对外暴露原子化的读写能力。

**这个项目不是给人类用户直接用的。** 人类工程师修改 Keil 项目请直接打开 Keil µVision IDE。这里的 CLI 和 MCP 服务是为了让 AI Agent（例如 Claude、Cline 等）能够读取、理解并批量修改 `.uvprojx` / `.uvproj` / `.uvmpw` 文件。

## 功能

- **工程发现**：扫描目录或解析 `.uvmpw` 工作空间，列出所有 Keil 工程。
- **配置读取**：按 section 读取 target 完整配置（Device、Compiler、Linker、Debug、Memory），支持紧凑模式折叠大数组和长字符串。
- **搜索**：在 group、文件、defines、include paths、linker 设置等 11 种范围内按关键字搜索。
- **配置修改**：原子增删改编译器列表（defines、undefines、include_paths）；全量替换配置 section；增删改 group 和文件。
- **构建与烧录**：通过 UV4.exe 执行 build / rebuild / clean / flash，自动检测环境和扫描产物。
- 所有写操作自动备份原文件为 `.bak`。
- 跨平台路径兼容：在 macOS / Linux 上也能正确处理 Windows 反斜杠路径。

## 工程文件格式

`.uvprojx` / `.uvproj` / `.uvmpw` 是 Keil µVision 的私有 XML 格式，官方没有公开的 XSD 或完整字段文档。本工具对 XML 节点路径和字段含义的理解均来自对真实 Keil µVision 5.x 工程文件的逆向工程观察。当前支持的格式与实现依据详见 [docs/uvprojx-format.md](docs/uvprojx-format.md)。

## 如何配置 AI 工具 / MCP

把 `keil-project-tools` 接入任意支持 MCP 的 Agent 客户端，Agent 即可在对话中直接操作 Keil 项目。

### Claude Desktop

编辑 `claude_desktop_config.json`：

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

加入以下内容：

```json
{
  "mcpServers": {
    "keil-project-tools": {
      "command": "npx",
      "args": ["-y", "keil-project-tools@latest", "mcp"],
      "env": {
        "KEIL_UV4_EXE": "C:\\Keil_v5\\UV4\\UV4.exe"
      }
    }
  }
}
```

保存后重启 Claude Desktop，工具会在对话中可用。

### Cline / VS Code

在 MCP 设置 JSON 中加入：

```json
{
  "keil-project-tools": {
    "command": "npx",
    "args": ["-y", "keil-project-tools@latest", "mcp"],
    "env": {
      "KEIL_UV4_EXE": "C:\\Keil_v5\\UV4\\UV4.exe"
    }
  }
}
```

### 版本更新说明

配置里使用 `keil-project-tools@latest`，每次启动 MCP 服务时 npx 都会检查 npm 最新版本。如果发布了新版本，npx 会自动下载并运行最新版。**已运行的进程不会热更新**，需要重启 MCP 客户端或重新启动服务器进程。

如果希望固定版本，可把 `latest` 换成具体版本号，例如 `keil-project-tools@0.3.0`。

## MCP 工具

共 13 个工具，按功能域分为四类。完整设计文档见 [docs/mcp-tool-design.md](docs/mcp-tool-design.md)。

### 工程发现

| 工具 | 说明 |
|------|------|
| `list_projects` | 扫描目录或解析 `.uvmpw` 工作空间，发现 `.uvprojx` / `.uvproj` 工程 |
| `read_project` | 读取工程基本信息：schema 版本、target 名称列表 |

### 配置读取

| 工具 | 说明 |
|------|------|
| `read_target` | 按 `section` 读取 target 配置（`summary` / `compiler` / `cads` / `aads` / `ldads` / `debug` / `memory` / `all`），默认紧凑模式折叠数组和长字符串 |
| `read_groups` | 读取 target 的分组列表，支持 `include_files` 和分页 |
| `search` | 按关键字搜索 group、文件、defines、include paths、linker 设置等 11 种范围，支持分页 |

### 配置修改

所有修改类工具都会自动备份原文件为 `.bak`。

| 工具 | 说明 |
|------|------|
| `manage_compiler_lists` | 原子增删改 C/C++ 和 Asm 的 defines、undefines、include_paths，`add` / `remove` 支持数组批量操作 |
| `update_target_config` | 全量替换一个 section（`compiler` / `cads` / `aads` / `ldads` / `debug` / `memory` / `summary`），修改 `summary` 需 `confirm: true` |
| `manage_group` | 增删改 target 下的 group |
| `rename_target` | 重命名 target |
| `manage_file` | 批量增删移源文件，按 group 分组，一次调用处理多个文件 |

### 构建与烧录

需 Windows + Keil MDK `UV4.exe`。

| 工具 | 说明 |
|------|------|
| `keil_scan` | 检测 Keil UV4.exe 环境 |
| `keil_build` | 增量编译、全量重建、清理、扫描产物（`build` / `rebuild` / `clean` / `scan-artifacts` / `detect`） |
| `keil_flash` | 通过 Keil 调试器烧录固件，默认检查最近是否成功构建 |

## Keil / UV4.exe 配置

`keil_build` 和 `keil_flash` 需要定位 `UV4.exe`。只保留两种配置方式，**推荐环境变量**：

1. 环境变量 `KEIL_UV4_EXE`（推荐，MCP 配置中统一设置）
2. 工具参数 `uv4`（仅用于覆盖环境变量）

如果两者都未提供，会尝试透明回退到常见 Keil 安装路径或系统 `PATH` 中的 `UV4.exe`；仍找不到则返回错误提示。

**环境变量**（首选方式）：

```bash
export KEIL_UV4_EXE="C:\Keil_v5\UV4\UV4.exe"
```

**工具参数**（仅在需要覆盖环境变量时使用）：

```json
{
  "uv4": "C:\\Keil_v5\\UV4\\UV4.exe"
}
```

> 提示：Agent 通常不需要传 `uv4` 参数。优先在 MCP 配置中设置 `KEIL_UV4_EXE`，遇到多版本 Keil 或临时切换路径时才用 `uv4` 覆盖。

构建成功后会自动回写 `.em_skill.json`（优先在 target 输出目录，无输出目录时回退到工程根目录），缓存最后一次构建结果、产物路径和 MCU 信息，供后续烧录或调试工具复用。

## 注意事项

- Keil 项目文件是内部 XML 格式，不同 MDK 版本之间可能有差异。写操作前请备份项目文件。
- 工具写回时会尽量保持 XML 节点顺序，以兼容 µVision。
- `.uvprojx` 中的路径通常使用反斜杠，输出文件会保留原始格式。
- 所有写操作都会自动备份原文件为 `.bak`。

## 许可证

MIT
