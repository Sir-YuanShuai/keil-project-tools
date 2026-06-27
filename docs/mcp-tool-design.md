# Keil MCP 工具功能分类设计

## 1. 设计思路

MCP 工具按 Keil 工程的功能域组织：工程发现、Target 配置读取、编译器列表管理、复杂配置替换、项目组管理、构建与烧录。`section` 和 `action` 的命名参考了 Keil µVision 的 **Options for Target** 和 **Manage Project Items** 对话框，帮助用户理解，但设计核心不是复制 UI 结构，而是：

1. **参数类型稳定**：每个工具的参数类型固定，不随上下文变化。
2. **操作语义清晰**：读、原子改、全量替换、构建、烧录各自独立。
3. **上下文可控**：默认折叠、分页、批量，减少 Agent 理解负担。
4. **LLM 好选**：工具数量少，职责边界明确。

## 2. 功能域与工具映射

> 以下对照表仅帮助熟悉 Keil UI 的用户快速定位工具，不代表设计基于 UI 页面结构。

### 2.1 Options for Target

| Keil 页面 | 主要内容 | 对应 MCP 工具/section |
|-----------|---------|----------------------|
| **Device** | 芯片型号、Vendor、Pack、Toolset | `read_target` / `section: "summary"` |
| **Target** | 晶振、操作系统、内存布局 | `read_target` / `section: "summary"` 或 `section: "memory"` |
| **Output** | 输出目录、可执行文件名、HEX/Lib | `read_target` / `section: "summary"` |
| **Listing** | 列表文件输出路径、MAP 选项 | `read_target` / `section: "summary"` |
| **User** | 编译前/后执行的用户程序 | `read_target` / `section: "summary"` |
| **C/C++** | 预处理器符号、Include Paths、优化等级、Misc Controls | `read_target` / `section: "cads"` |
| **Asm** | 条件汇编符号、Include Paths、Misc Controls | `read_target` / `section: "aads"` |
| **Linker** | Scatter File、链接库、Misc Controls | `read_target` / `section: "ldads"` |
| **Debug** | 调试器驱动、调试配置 | `read_target` / `section: "debug"` |
| **Utilities** | Flash 下载驱动、Flash 配置 | `read_target` / `section: "debug"` |

### 2.2 Manage Project Items

| 层级 | 内容 | 对应 MCP 工具 |
|------|------|--------------|
| **Project Targets** | 工程中的所有 target | `read_project` / `list_projects` / `rename_target` |
| **Groups** | target 下的分组 | `read_groups` / `manage_group` |
| **Files** | 分组中的源文件 | `read_groups` / `manage_file` |

### 2.3 Manage Multi-Project Workspace

| 对话框 | 内容 | 对应 MCP 工具 |
|--------|------|--------------|
| **Manage Multi-Project Workspace Components** | workspace 中的 .uvprojx 列表 | `list_projects` |

## 3. 工具定义

### 3.1 工程发现

#### `list_projects`

```json
{
  "file": "/abs/path/to/xxx.uvmpw",  // 可选
  "root": "/abs/path/to/dir"         // 可选
}
```

##### 参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | string | 否 | 解析 `.uvmpw` workspace 文件，返回其中包含的所有 `.uvprojx` / `.uvproj` 绝对路径。 |
| `root` | string | 否 | 扫描目录（递归），返回该目录下所有 Keil 工程文件绝对路径。 |

- 传 `file` 时优先解析 workspace，忽略 `root`。
- 传 `root` 时扫描目录，包含 `.uvprojx` / `.uvproj` / `.uvmpw`。
- `file` 和 `root` 都省略时，扫描当前工作目录。
- 两者都不存在且当前目录无工程时返回 `projects: []`。

##### 输出格式

```json
{
  "projects": [
    "/abs/path/to/project1.uvprojx",
    "/abs/path/to/project2.uvprojx"
  ]
}
```

#### `read_project`

```json
{ "file": "/abs/path/to/project.uvprojx" }
```

##### 参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | string | 是 | 工程文件绝对路径，必须是 `.uvprojx` 或 `.uvproj`。 |

##### 输出格式

```json
{
  "project_path": "/abs/path/to/project.uvprojx",
  "schema_version": "2.1",
  "targets": ["target_1", "target_2"]
}
```

- `schema_version` 是工程 XML 格式版本。
- `targets` 按 XML 中出现的顺序排列。
- 后续工具中 `target` 省略时，默认取 `targets` 的第一个。

### 3.2 Target 配置读取

#### `read_target`

```json
{
  "file": "/abs/path/to/project.uvprojx",
  "target": "target_name",   // 省略时取第一个 target
  "section": "summary",      // 默认 summary
  "compact": true            // 默认 true
}
```

##### 参数说明

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `file` | string | 是 | - | 工程文件绝对路径。 |
| `target` | string | 否 | 第一个 target | 要读取的 target 名称。省略时取 `read_project` 返回的第一个 target。 |
| `section` | string \| string[] | 否 | `"summary"` | 要读取的配置页。支持单值或数组。传 `"all"` 返回全部 section。 |
| `compact` | boolean | 否 | `true` | 是否折叠大数组和长字符串。 |

- `target` 省略时默认取工程中的第一个 target。
- `section` 支持字符串或字符串数组。传数组时返回包含多个 section 的合并对象，例如 `section: ["summary", "cads"]` 返回：

```json
{
  "target_name": "nrf52840_xxaa_s140",
  "sections": ["summary", "cads"],
  "summary": { ... },
  "cads": { ... }
}
```

- 传 `section: "all"` 时返回全部 section。
- `compact=false` 读取的完整数组可以作为 `update_target_config` 的 `data` 回写；`compact=true` 返回的占位符不能回写。

#### `section` 枚举

| 值 | 返回内容 | 对应 Keil 页面 |
|----|---------|---------------|
| `summary` | Device、Vendor、Pack、Toolset、CPU、输出目录、输出名、编译前后用户程序 | Device / Target / Output / Listing / User |
| `compiler` | Cads + Aads + LDads | C/C++ / Asm / Linker |
| `cads` | 仅 C/C++ 配置 | C/C++ |
| `aads` | 仅 Asm 配置 | Asm |
| `ldads` | 仅 Linker 配置 | Linker |
| `debug` | DebugOption + Utilities | Debug / Utilities |
| `memory` | OnChipMemories（IROM/IRAM/OCM） | Target |
| `all` | 以上全部 | - |

默认 `section` 为 `summary`，保证默认输出最小。

#### `compact` 折叠规则

- `compact=true`（默认）：
  - 数组显示为 `{ "_count": N }`。
  - 字符串超过 120 字符显示为 `{ "_length": N, "_preview": "..." }`。
  - 大对象（如 `on_chip_memories`）显示为 `{ "_count": N }`。
- `compact=false`：
  - 展开数组。
  - 展开的数组最多返回 100 条，超出部分显示为 `{ "_count": N, "_returned": 100 }`。
  - `on_chip_memories` 只在 `section` 包含 `"memory"` 或 `"all"` 时展开。

> `section: "all"` 默认返回 compact 摘要；展开时可能产生极长输出。

#### 输出示例

`section: "summary"`（compact）：

```json
{
  "target_name": "nrf52840_xxaa_s140",
  "section": "summary",
  "summary": {
    "toolset_name": "ARM-ADS",
    "device": "nRF52840_xxAA",
    "vendor": "Nordic Semiconductor",
    "pack_id": "NordicSemiconductor.nRF_DeviceFamilyPack.8.35.0",
    "cpu": { "_length": 167, "_preview": "IROM(0x00000000,0x100000) ..." },
    "output_directory": ".\\_build\\",
    "output_name": "boot",
    "create_executable": true,
    "create_hex_file": true,
    "before_compile": { ... },
    "before_make": { ... },
    "after_make": { ... }
  }
}
```

`section: "compiler"`（compact）：

```json
{
  "target_name": "nrf52840_xxaa_s140",
  "section": "compiler",
  "compiler": {
    "cads": {
      "optim": "4",
      "misc_controls": "--reduce_paths",
      "defines": { "_count": 12 },
      "include_paths": { "_count": 49 }
    },
    "aads": { ... },
    "ldads": {
      "scatter_file": null,
      "linker_misc": "--diag_suppress 6330"
    }
  }
}
```

`section: "memory"`（compact）：

```json
{
  "target_name": "nrf52840_xxaa_s140",
  "section": "memory",
  "memory": { "_count": 19 }
}
```

`section: "memory"`（compact=false）时展开：

```json
{
  "target_name": "nrf52840_xxaa_s140",
  "section": "memory",
  "memory": {
    "iram": { "type": "0", "start_address": "0x20000000", "size": "0x40000" },
    "irom": { "type": "1", "start_address": "0x0", "size": "0x100000" },
    "ocr_rvct4": { "type": "1", "start_address": "0x27000", "size": "0xd9000" },
    "ocr_rvct9": { "type": "0", "start_address": "0x200030c0", "size": "0x3d508" },
    "ocr_rvct10": { "type": "0", "start_address": "0x800000", "size": "0x40000" }
  }
}
```

### 3.3 分组与文件

当前 MCP 工具只覆盖最常用的 Project Items 操作。`Folders/Extensions`、`Books`、`Project Info/Layer` 这几个 tab 与工程配置关联较弱，暂不纳入工具范围。

#### `read_groups`

```json
{
  "file": "/abs/path/to/project.uvprojx",
  "target": "target_name",
  "include_files": false,
  "page": 1,
  "perPage": 20
}
```

##### 参数说明

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `file` | string | 是 | - | 工程文件绝对路径。 |
| `target` | string | 否 | 第一个 target | 要读取的 target 名称。 |
| `include_files` | boolean | 否 | `false` | 是否返回每个 group 下的文件列表。 |
| `page` | number | 否 | `1` | 分页页码，从 1 开始。 |
| `perPage` | number | 否 | `20` | 每页数量，最大 100。 |

- `perPage` 默认 20，最大 100，避免大项目输出过长。
- `include_files=true` 时每个 group 的文件列表也会受输出大小控制，超长时文件路径以 preview 显示。

##### 输出格式

默认只返回分组名列表：

```json
{
  "items": ["Application", "nRF_Bootloader", "nRF_Drivers"],
  "total": 18,
  "page": 1,
  "perPage": 20
}
```

`include_files=true` 时返回分组及文件：

```json
{
  "items": [
    {
      "name": "Application",
      "files": [
        { "name": "main.c", "type": "c", "path": "..\\main.c" }
      ]
    }
  ],
  "total": 18,
  "page": 1,
  "perPage": 20
}
```

### 3.4 搜索

#### `search`

```json
{
  "file": "/abs/path/to/project.uvprojx",
  "target": "target_name",    // 省略时取第一个 target
  "scope": "files",           // 见下表
  "keyword": "bootloader",
  "caseSensitive": false,
  "exactMatch": false,
  "page": 1,
  "perPage": 20
}
```

##### 参数说明

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `file` | string | 是 | - | 工程文件绝对路径。 |
| `target` | string | 否 | 第一个 target | 要搜索的 target 名称。 |
| `scope` | string | 是 | - | 搜索范围，见下表。 |
| `keyword` | string | 是 | - | 搜索关键字。 |
| `caseSensitive` | boolean | 否 | `false` | 是否区分大小写。 |
| `exactMatch` | boolean | 否 | `false` | 是否精确匹配。 |
| `page` | number | 否 | `1` | 分页页码。 |
| `perPage` | number | 否 | `20` | 每页数量，最大 100。 |

- `target` 省略时默认取第一个 target。
- `perPage` 默认 20，最大 100，防止搜索结果过多占满上下文。
- `exactMatch=true` 时整个字符串必须完全匹配；`exactMatch=false` 时子串匹配即可。

##### `scope` 枚举

| scope | 搜索范围 | items 元素类型 |
|-------|---------|---------------|
| `groups` | 分组名 | 字符串（group name） |
| `files` | 分组中的文件 | 对象 `{ name, type, path }` |
| `cads_defines` | C/C++ defines | 字符串 |
| `cads_undefines` | C/C++ undefines | 字符串 |
| `cads_include_paths` | C/C++ include paths | 字符串 |
| `aads_defines` | Asm defines | 字符串 |
| `aads_undefines` | Asm undefines | 字符串 |
| `aads_include_paths` | Asm include paths | 字符串 |
| `ldads_scatter_file` | Linker scatter file | 字符串 |
| `ldads_include_libs` | Linker include libs | 字符串 |
| `ldads_linker_misc` | Linker misc controls | 字符串 |

##### 统一返回

```json
{
  "scope": "files",
  "items": [ ... ],
  "total": 156,
  "page": 1,
  "perPage": 20
}
```

### 3.5 修改操作

#### `manage_compiler_lists`

专门管理 C/C++ 和 Asm 的 **defines**、**undefines** 和 **include_paths**。`value` 类型固定为字符串或字符串数组，避免 LLM 传错。

```json
{
  "file": "/abs/path/to/project.uvprojx",
  "target": "target_name",
  "section": "cads_defines",
  "action": "add",
  "value": "TEST_DEFINE=1"
}
```

##### 参数说明

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `file` | string | 是 | - | 工程文件绝对路径。 |
| `target` | string | 否 | 第一个 target | 要修改的 target 名称。 |
| `section` | string | 是 | - | 见下表。 |
| `action` | string | 是 | - | `add` / `remove` / `set`。 |
| `value` | string \| string[] | 是 | - | `add`/`remove` 支持单个字符串或数组；`set` 必须是数组。 |

- `action: "add"`：向列表追加值；已存在时跳过，不重复添加。
- `action: "remove"`：从列表删除值；不存在的值幂等忽略，返回 `count: 0`。
- `action: "set"`：完整替换列表。
- `value` 为数组时批量处理，返回 `count` 表示实际处理的条目数。

##### `section` 枚举

| section | `add/remove` 的 value | `set` 的 value |
|---------|----------------------|---------------|
| `cads_defines` | 单个 define 字符串或 define 数组 | define 数组 |
| `cads_undefines` | 单个 undefine 字符串或 undefine 数组 | undefine 数组 |
| `cads_include_paths` | 单个路径字符串或路径数组 | 路径数组 |
| `aads_defines` | 单个 define 字符串或 define 数组 | define 数组 |
| `aads_undefines` | 单个 undefine 字符串或 undefine 数组 | undefine 数组 |
| `aads_include_paths` | 单个路径字符串或路径数组 | 路径数组 |

`add/remove` 传数组时，一次批量处理多个值，减少 MCP 调用次数。

##### 输出

```json
{
  "saved": "/abs/path/to/project.uvprojx",
  "section": "cads_defines",
  "action": "add",
  "value": "TEST_DEFINE=1",
  "count": 1
}
```

`value` 为数组时，`count` 返回实际处理的条目数。

#### `update_target_config`

完整替换一个复杂 section。`data` 必须是完整的 section 对象，后端做全量替换。

```json
{
  "file": "/abs/path/to/project.uvprojx",
  "target": "target_name",
  "section": "compiler",
  "confirm": true,
  "data": {
    "cads": { "optim": "4", "defines": ["A", "B"] },
    "aads": { ... },
    "ldads": { "scatter_file": "...", "linker_misc": "..." }
  }
}
```

##### 参数说明

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `file` | string | 是 | - | 工程文件绝对路径。 |
| `target` | string | 否 | 第一个 target | 要修改的 target 名称。 |
| `section` | string | 是 | - | 要替换的 section，见下表。 |
| `confirm` | boolean | 条件必填 | `false` | `section: "summary"` 时必须为 `true`，否则返回 `confirm-required`。 |
| `data` | object | 是 | - | 完整的 section 对象，必须来自 `read_target` 同 section 且 `compact=false`。 |

- `data` 中不允许包含 `_count`、`_length`、`_preview`、`_returned` 等折叠占位符，否则返回 `invalid-compact-data`。
- `section: "summary"` 包含 Device/Pack/Toolset 等敏感字段，误改可能导致工程无法打开，必须显式确认。

##### `section` 枚举

| section | `data` 内容 |
|---------|------------|
| `compiler` | `{ cads, aads, ldads }` |
| `cads` | `{ optim, misc_controls, defines, include_paths, ... }` |
| `aads` | `{ misc_controls, defines, include_paths, ... }` |
| `ldads` | `{ scatter_file, linker_misc, include_libs, ... }` |
| `debug` | `{ common_property, dll_option, debug_option, utilities }` |
| `memory` | `{ iram, irom, ocr_rvct1, ... }`（键名是动态示例，以实际工程为准） |
| `summary` | `{ device, output_directory, output_name, ... }`（⚠️ 高风险：修改 device/pack 等可能导致工程无法打开） |

**重要**：`data` 必须是 `read_target` 在相同 `section` 下**且 `compact=false`** 返回的完整对象。

**⚠️ `summary` 特殊限制**：`summary` 包含 Device、Pack、Toolset、输出路径等敏感字段。修改 `summary` 时必须传 `confirm: true`，否则返回 `confirm-required` 错误。如果 `data` 中包含 `_count`、`_length`、`_preview`、`_returned` 等折叠占位符，直接返回 `invalid-compact-data` 错误，禁止回写。

> 正确流程：先用 `read_target` 读取 `compact=false` 的完整结构，修改字段后再传给 `update_target_config`。

##### 输出

```json
{
  "saved": "/abs/path/to/project.uvprojx",
  "section": "compiler"
}
```

#### `manage_group`

```json
{
  "file": "/abs/path/to/project.uvprojx",
  "target": "target_name",
  "action": "add",
  "group": "NewGroup",
  "newName": "RenamedGroup"
}
```

##### 参数说明

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `file` | string | 是 | - | 工程文件绝对路径。 |
| `target` | string | 否 | 第一个 target | 要修改的 target 名称。 |
| `action` | string | 是 | - | `add` / `remove` / `rename`。 |
| `group` | string | 是 | - | 目标 group 名称。 |
| `newName` | string | 条件必填 | - | `action: "rename"` 时必须提供。 |

- `action: "add"`：创建空 group，已存在时返回 `group-already-exists`。
- `action: "remove"`：删除 group 及其下所有文件；group 不存在时返回 `group-not-found`。
- `action: "rename"`：修改 group 名称；`newName` 已存在时返回 `group-name-conflict`。
- `target` 省略时默认取第一个 target。

#### `rename_target`

```json
{
  "file": "/abs/path/to/project.uvprojx",
  "target": "target_name",
  "newName": "new_target_name"
}
```

##### 参数说明

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `file` | string | 是 | - | 工程文件绝对路径。 |
| `target` | string | 是 | - | 旧 target 名称。 |
| `newName` | string | 是 | - | 新 target 名称。 |

- 修改 target 的 `TargetName` 字段。
- `newName` 已存在时返回 `target-name-conflict`。
- `target` 不存在时返回 `target-not-found`。
- 输出返回 `{ "saved": "...", "target": "old", "newName": "new" }`。

#### `manage_file`

```json
{
  "file": "/abs/path/to/project.uvprojx",
  "target": "target_name",   // 省略时取第一个 target
  "action": "add",           // add | remove | move
  "items": [
    {
      "group": "Application",
      "type": "c",
      "files": [
        "..\\main.c",
        "..\\utils.c",
        "..\\helper.c"
      ]
    }
  ]
}
```

##### 参数说明

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `file` | string | 是 | - | 工程文件绝对路径。 |
| `target` | string | 否 | 第一个 target | 要修改的 target 名称。 |
| `action` | string | 是 | - | `add` / `remove` / `move`。 |
| `items` | object[] | 是 | - | 批量操作列表，每个 item 对应一个 group。 |

每个 item 的字段：

| 字段 | 类型 | `add` | `remove` | `move` | 说明 |
|------|------|-------|----------|--------|------|
| `group` | string | 必填 | 必填 | 必填 | 源 group 名称。 |
| `toGroup` | string | 不填 | 不填 | 必填 | 目标 group 名称，仅 move 使用。 |
| `type` | string | 必填 | 不填 | 不填 | 文件类型：`c` / `cpp` / `asm` / `lib` / `obj` / `text`。 |
| `files` | string[] | 必填 | 必填 | 必填 | 要操作的文件路径列表。 |

- `target` 省略时默认取第一个 target。
- `items` 按 group 分组，一次调用可处理多个文件，减少重复 `group` / `type` 和 MCP 调用次数。
- 同一 group 需要添加不同类型文件时，拆成多个 item。
- `remove` 通过 `files` 路径匹配，不区分大小写；未匹配到的文件在 `partial-failure` 中列出。
- `add` 已存在的文件跳过，不报错。
- `move` 文件已在目标 group 时幂等，不报错。

##### `remove` 示例

```json
{
  "action": "remove",
  "items": [
    {
      "group": "Application",
      "files": ["..\\main.c", "..\\utils.c"]
    }
  ]
}
```

##### `move` 示例

```json
{
  "action": "move",
  "items": [
    {
      "group": "Application",
      "toGroup": "Utils",
      "files": ["..\\main.c", "..\\utils.c"]
    }
  ]
}
```

- `move` 与 `add` / `remove` 共用 `group` 字段作为源 group，额外需要 `toGroup` 作为目标 group。
- `remove` 和 `move` 通过 `files` 中的路径匹配，不区分大小写。

### 3.6 构建与烧录

#### `keil_scan`

```json
{
  "action": "detect",
  "uv4": "/path/to/UV4.exe"
}
```

##### 参数说明

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `action` | string | 是 | `"detect"` | 仅支持 `detect`。 |
| `uv4` | string | 否 | - | 覆盖 UV4.exe 路径。优先使用 `KEIL_UV4_EXE` 环境变量。 |

- 仅用于检测 Keil 环境（Windows、UV4.exe 是否存在）。
- 成功时返回 `{ "uv4": "/path/to/UV4.exe", "detected": true }`。
- 失败时返回 `environment-missing` 错误。
- 项目发现请使用 `list_projects`，不要混用 `keil_scan`。

#### `keil_build`

```json
{
  "action": "build",          // build | rebuild | clean | scan-artifacts | detect
  "project": "/abs/path/to/project.uvprojx",
  "target": "target_name",    // 省略时取第一个 target
  "uv4": "/path/to/UV4.exe",
  "log_tail_lines": 100       // 默认 100，返回日志最后 100 行
}
```

##### 参数说明

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `action` | string | 是 | `"build"` | `build` / `rebuild` / `clean` / `scan-artifacts` / `detect`。 |
| `project` | string | 是 | - | 工程文件绝对路径。 |
| `target` | string | 否 | 第一个 target | 要构建的 target 名称。 |
| `uv4` | string | 否 | 自动检测 | UV4.exe 路径。优先使用 `KEIL_UV4_EXE` 环境变量。 |
| `log_tail_lines` | number | 否 | `100` | 返回日志最后 N 行，最大 1000。 |
| `clean_first` | boolean | 否 | `false` | `rebuild` 时是否先 clean。 |
| `operation_mode` | number | 否 | `1` | `1`=执行；`2`=仅摘要；`3`=确认后执行。 |
| `confirm` | boolean | 否 | `false` | `operation_mode=3` 时必须为 `true`。 |

- `project` 必填。
- `target` 省略时默认取第一个 target。
- `log_tail_lines` 默认 100，最大 1000，超出时按 1000 截取。
- `action: "detect"` 时返回环境检测结果，不实际构建。
- 成功时返回 `{ success: true, log_excerpt: "...", log_file: "...", artifacts: [...] }`。
- 失败时返回 `{ success: false, code: "build-failed", log_excerpt: "...", log_file: "..." }`。
- 完整日志文件路径通过 `log_file` 返回，避免日志占满上下文。

#### `keil_flash`

```json
{
  "project": "/abs/path/to/project.uvprojx",
  "target": "target_name",    // 省略时取第一个 target
  "uv4": "/path/to/UV4.exe",
  "skip_build_check": false
}
```

##### 参数说明

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `project` | string | 是 | - | 工程文件绝对路径。 |
| `target` | string | 否 | 第一个 target | 要烧录的 target 名称。 |
| `uv4` | string | 否 | 自动检测 | UV4.exe 路径。 |
| `skip_build_check` | boolean | 否 | `false` | 是否跳过最近成功构建的检查。 |

- `project` 必填。
- `target` 省略时默认取第一个 target。
- 默认检查该 target 是否已有成功构建，无则返回 `build-required`。
- `skip_build_check=true` 时跳过构建检查，但烧录失败风险自负。
- 成功时返回 `{ success: true, flashed: true }`。
- 失败时返回 `flash-failed` 或 `environment-missing`。

## 4. 最终工具清单

最终保留 13 个工具：

1. `list_projects`
2. `read_project`
3. `read_target`
4. `read_groups`
5. `search`
6. `manage_compiler_lists`
7. `update_target_config`
8. `manage_group`
9. `rename_target`
10. `manage_file`
11. `keil_scan`
12. `keil_build`
13. `keil_flash`

## 5. 上下文优化

### 5.1 输出长度控制

| 工具 | 控制手段 |
|------|---------|
| `read_target` | 默认 `compact=true`；展开的数组最多 100 条；`section: "all"` 展开时可能产生极长输出 |
| `read_groups` | `perPage` 默认 20，最大 100；`include_files=true` 时文件路径超长自动 preview |
| `search` | `perPage` 默认 20，最大 100 |
| `keil_build` | `log_tail_lines` 默认 100，完整日志通过 `log_file` 返回 |
| 所有字符串字段 | 默认超过 120 字符显示 preview |

### 5.2 批量操作

| 工具 | 批量能力 |
|------|---------|
| `manage_compiler_lists` | `add/remove` 的 `value` 支持数组，一次批量增删 |
| `manage_file` | `items` 支持多个文件，一次批量 add / remove / move |
| `manage_group` | `add` 可通过多次调用实现，暂不开放数组（group 操作频率较低） |

## 6. 工具描述（Tool Descriptions）

每个工具都需要清晰、全面的 description，让 Agent 知道什么时候该调用、参数怎么填。以下是推荐写入 MCP schema 的 description。

### 6.1 工具清单与描述总表

| 工具 | 描述 |
|------|------|
| `list_projects` | Scan a directory or parse a Keil workspace (.uvmpw) to discover .uvprojx/.uvproj projects. Use this before reading or building any project. |
| `read_project` | Read high-level project info including schema version and target names. Use this to list available targets before reading, building, or flashing. |
| `read_target` | Read a specific target's configuration. Use `section` to select the configuration page (summary, compiler, cads, aads, ldads, debug, memory). Defaults to `summary` for minimal output. |
| `read_groups` | List groups and optionally files for a target. Supports pagination. Use this instead of `read_target` for group/file information. |
| `search` | Search within a target's groups, files, or compiler settings for a keyword. Supports pagination. Use this to find things before modifying them. |
| `manage_compiler_lists` | Atomically add, remove, or set C/C++ or Asm defines, undefines, and include paths. Use this for simple compiler option modifications. |
| `update_target_config` | Replace an entire target configuration section (compiler, cads, aads, ldads, debug, memory, summary) with a complete object. Use only for complex multi-field updates. |
| `manage_group` | Add, remove, or rename a group in a target. Groups are containers for source files. |
| `rename_target` | Rename a target in the project. Changes the `TargetName` field in the project XML. |
| `manage_file` | Add, remove, or move multiple source files in groups. Use `items` to batch operations and reduce MCP calls. |
| `keil_scan` | Detect the Keil UV4.exe environment. Use this before calling `keil_build` or `keil_flash` to verify the environment is ready. |
| `keil_build` | Build, rebuild, clean, scan artifacts, or detect the Keil environment for a project using UV4.exe. Returns metrics and a log excerpt. |
| `keil_flash` | Flash/download the built firmware to target hardware using UV4.exe. Requires a recent successful build. |

### 6.2 工程发现

#### `list_projects`

> Scan a directory or parse a Keil multi-project workspace (.uvmpw) to discover .uvprojx/.uvproj projects. Use this before reading or building any project. Pass `file` to read a workspace, or `root` to scan a directory. Returns absolute paths of projects found.

#### `read_project`

> Read high-level project information including schema version and target names. Use this to list available targets before calling `read_target`, `keil_build`, or `keil_flash`. Pass the absolute path to the .uvprojx file.

### 6.3 读取配置

#### `read_target`

> Read a specific target's configuration. Use `section` to select which configuration page to read: `summary` (Device/Target/Output/Listing/User), `compiler` (C/C++ + Asm + Linker), `cads`, `aads`, `ldads`, `debug` (Debug + Utilities), or `memory`. Use `compact` to control output size. Defaults to `summary` for minimal output. If `target` is omitted, the first target is used.

#### `read_groups`

> List groups and optionally files for a target. Use `include_files` to see files inside each group. Supports pagination via `page` and `perPage`. Use this instead of `read_target` for group/file information. If `target` is omitted, the first target is used.

### 6.4 搜索

#### `search`

> Search within a target's groups, files, or compiler/linker settings for a keyword. Use `scope` to select `groups`, `files`, `cads_defines`, `cads_undefines`, `cads_include_paths`, `aads_defines`, `aads_undefines`, `aads_include_paths`, `ldads_scatter_file`, `ldads_include_libs`, or `ldads_linker_misc`. Supports pagination. Use this to find specific files, groups, defines, include paths, or linker settings before modifying them. If `target` is omitted, the first target is used.

### 6.5 修改配置

#### `manage_compiler_lists`

> Atomically add, remove, or set C/C++ or Asm preprocessor defines, undefines, and include paths. Use this for simple compiler option modifications. `section` must be one of: `cads_defines`, `cads_undefines`, `cads_include_paths`, `aads_defines`, `aads_undefines`, `aads_include_paths`. `value` can be a single string or an array for batch operations. For complex compiler/debug/memory/summary changes, use `update_target_config` instead.

#### `update_target_config`

> Replace an entire target configuration section with a complete object. Use this only when you need to update multiple fields at once. `section` can be `compiler`, `cads`, `aads`, `ldads`, `debug`, `memory`, or `summary`. Always call `read_target` first to get the current section, then modify the object and pass it back. This operation overwrites the entire section, so partial updates risk losing existing settings.

#### `manage_group`

> Add, remove, or rename a group in a target. Groups are containers for source files. `action` can be `add`, `remove`, or `rename`. For `rename`, provide `newName`. If `target` is omitted, the first target is used.

#### `rename_target`

> Rename a target in the project. Provide the current target name and the new name. This changes the `TargetName` field in the project XML.

#### `manage_file`

> Add, remove, or move multiple source files in groups. Use `items` to batch operations and reduce MCP calls. For `add`, provide `group`, `type`, and `files` array. For `remove`, provide `group` and `files`. For `move`, provide `group`, `toGroup`, and `files`. Files are matched by path case-insensitively. If `target` is omitted, the first target is used.

### 6.6 构建与烧录

#### `keil_scan`

> Detect the Keil UV4.exe environment. Use this before calling `keil_build` or `keil_flash` to verify the environment is ready. Returns the resolved UV4.exe path or an `environment-missing` error. Project discovery should use `list_projects` instead.

#### `keil_build`

> Build, rebuild, clean, scan build artifacts, or detect the Keil environment for a project using UV4.exe. Requires Windows and UV4.exe. Returns build metrics and a log excerpt. Full build log is available via the returned `log_file` path. Use `log_tail_lines` to control how many log lines are included in the response. If `target` is omitted, the first target is used.

#### `keil_flash`

> Flash/download the built firmware to target hardware using UV4.exe. Requires a recent successful build. If `target` is omitted, the first target is used. Use `skip_build_check` with caution.

## 7. 错误响应与边界行为

### 7.1 统一错误响应格式

所有工具出错时统一返回以下结构：

```json
{
  "error": true,
  "code": "target-not-found",
  "message": "Target 'xxx' not found in project 'xxx.uvprojx'. Available targets: ['target_1', 'target_2']"
}
```

常见错误码：

| 错误码 | 说明 | 常见触发场景 |
|--------|------|-------------|
| `file-not-found` | 工程文件不存在 | `file` 路径错误 |
| `target-not-found` | target 不存在 | `target` 名称错误，且未提供默认 target |
| `invalid-section` | `section` 不在枚举范围内 | `read_target` / `update_target_config` / `search` |
| `invalid-action` | `action` 不在枚举范围内 | `manage_compiler_lists` / `manage_group` / `manage_file` / `keil_build` |
| `group-not-found` | group 不存在 | `remove` 一个不存在的 group |
| `group-already-exists` | group 已存在 | `add` 一个已存在的 group |
| `group-name-conflict` | 新 group 名称已存在 | `rename` 目标名称冲突 |
| `file-not-found-in-group` | 文件不存在于指定 group | `manage_file` remove/move 时 |
| `target-name-conflict` | 新 target 名称已存在 | `rename_target` |
| `invalid-compact-data` | data 包含 compact 占位符 | `update_target_config` 传入 `_count` 等 |
| `environment-missing` | 缺少 Windows 或 UV4.exe | `keil_build` / `keil_flash` / `keil_scan` detect |
| `build-failed` | 构建失败 | `keil_build` |
| `flash-failed` | 烧录失败 | `keil_flash` |
| `invalid-path` | 路径非法或无法访问 | `include_paths` 等 |
| `partial-failure` | 批量操作部分失败 | `manage_file` 批量时列出失败的 items |
| `confirm-required` | 需要显式确认 | `update_target_config section=summary` 时未传 `confirm: true` |

### 7.2 边界行为

| 场景 | 行为 |
|------|------|
| `manage_group` remove 不存在的 group | 返回 `group-not-found` 错误 |
| `manage_compiler_lists` remove 不存在的值 | 幂等，返回 `count: 0`，不报错 |
| `manage_compiler_lists` add 已存在的值 | 幂等，不重复添加，返回实际新增 `count` |
| `rename_target` 新名称已存在 | 返回 `target-name-conflict` 错误 |
| `manage_file` remove 找不到文件 | 返回 `file-not-found-in-group`，并列出未匹配的文件 |
| `manage_file` add 已存在的文件 | 跳过，不报错 |
| `manage_file` move 文件已在目标 group | 幂等，不报错 |
| `keil_build` `log_tail_lines` 超过最大值 | 按最大值 1000 截取，返回 `log_tail_lines` 实际使用值 |
| `keil_flash` 未构建且未设置 `skip_build_check` | 返回 `build-required` 错误 |

### 7.3 工具重叠说明

| 重叠点 | 说明 |
|--------|------|
| `keil_scan` detect vs `keil_build` detect | 两者都能检测 UV4.exe 环境。`keil_scan` 仅做环境检测；`keil_build` detect 额外验证项目可构建性。 |
| `manage_compiler_lists` vs `update_target_config` | 两者都能改 defines / include_paths。`manage_compiler_lists` 负责原子增删；`update_target_config` 负责全量替换。 |
