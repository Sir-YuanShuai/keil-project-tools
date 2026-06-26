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

- 按步骤读取项目：项目 → target → group → 文件。
- 读取 target 的设备、编译器、宏定义、头文件路径、链接设置、调试/烧录配置。
- 搜索 group、文件、宏定义、头文件路径。
- 修改 target 名称、C 宏定义、头文件路径。
- 在 target 下增删改 group，在 group 中增删源文件，在 group 之间移动文件。
- 解析多工程工作空间 `.uvmpw`。
- 所有写操作自动备份原文件为 `.bak`。
- 跨平台路径兼容：在 macOS/Linux 上也能正确处理 Windows 反斜杠路径。

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

## MCP 支持的功能

**查询类**

| 工具 | 说明 |
|------|------|
| `list_projects_in_workspace` | 读取 `.uvmpw` 工作空间，列出所有子项目路径 |
| `read_project_summary` | 读取项目 schema、header、target 名称列表 |
| `list_targets` | 列出所有 target 名称 |
| `read_target_summary` | 读取 target 的设备、vendor、pack、CPU、输出目录等 |
| `read_target_defines` | 读取 target 的 C 宏定义 |
| `read_target_include_paths` | 读取 target 的 C 头文件路径 |
| `read_target_groups` | 读取 target 的 group 名称列表 |
| `read_target_files` | 读取 target 下指定 group 的文件列表 |
| `read_target_linker_settings` | 读取 scatter file、链接库、链接器 misc |
| `read_target_debug_settings` | 读取 debugger driver、flash driver |

**搜索类**

| 工具 | 说明 |
|------|------|
| `search_groups` | 按关键字搜索 group 名称 |
| `search_files` | 按关键字搜索文件（跨 group） |
| `search_defines` | 按关键字搜索宏定义 |
| `search_include_paths` | 按关键字搜索头文件路径 |

**修改类**

所有修改类工具都会先自动备份原文件为 `.bak`。

| 工具 | 说明 |
|------|------|
| `rename_target` | 重命名 target |
| `set_defines` | 整体替换 C 宏定义 |
| `add_define` | 追加单个 C 宏定义 |
| `remove_define` | 移除单个 C 宏定义 |
| `set_include_paths` | 整体替换头文件路径 |
| `add_include_path` | 追加单条头文件路径 |
| `remove_include_path` | 移除单条头文件路径 |
| `add_group` | 在 target 下新增 group |
| `remove_group` | 删除 target 下的 group 及其文件 |
| `rename_group` | 重命名 group |
| `add_file` | 向指定 group 添加源文件 |
| `remove_file` | 从指定 group 移除源文件 |
| `move_file` | 把文件从一个 group 移动到另一个 group |

**构建 / 烧录类**

新增工具对应 `keil`、`build-keil`、`flash-keil` 三个 skill 的能力，使用 Keil MDK 的 `UV4.exe` 命令行执行构建、产物扫描和烧录。

| 工具 | 说明 |
|------|------|
| `keil_scan` | 扫描目录下的 `.uvprojx` / `.uvproj` / `.uvmpw` 工程；或列出指定工程的 target；或检测 UV4 环境 |
| `keil_build` | 增量编译、全量重建、清理工程、扫描产物（`build` / `rebuild` / `clean` / `scan-artifacts`） |
| `keil_flash` | 通过 Keil 内置调试器将固件烧录到目标板 |

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
