# Keil µVision 工程文件格式说明

> **免责声明**：Keil µVision 项目文件（`.uvprojx`、`.uvproj`、`.uvmpw）是 **Keil/ARM 的私有 XML 序列化格式**，官方没有公开的 XSD 或完整字段文档。本文档中的节点路径、字段含义和版本假设均来自对真实 Keil µVision 5.x 工程文件的逆向工程观察，以及 Keil 官方命令行/用户文档中的概念描述。

## 1. 支持的文件类型

| 扩展名 | 说明 |
|--------|------|
| `.uvprojx` | 单项目文件（µVision 5 格式） |
| `.uvproj` | 旧版单项目文件（µVision 4 及更早） |
| `.uvmpw` | 多项目工作区文件（multi-project workspace） |

本工具使用 `fast-xml-parser` 把 XML 解析为 JavaScript 对象，然后按下面的节点路径读取/修改字段。

## 2. 单项目文件根结构

`.uvprojx` 的根节点是 `<Project>`，常用字段：

```xml
<Project>
  <SchemaVersion>2.0</SchemaVersion>
  <Header>### uVision Project, (C) Keil Software</Header>
  <Targets> ... </Targets>
  <Groups> ... </Groups>   <!-- 可选，µVision 通常把 Groups 放在每个 Target 下 -->
  <RTE> ... </RTE>         <!-- Run-Time Environment 组件 -->
</Project>
```

| 读取字段 | 含义 |
|----------|------|
| `SchemaVersion` | 工程文件格式版本号，目前常见为 `2.0` |
| `Header` | 文件头标识 |
| `Targets.Target` | 一个或多个 Target 节点 |
| `RTE.components.component` | RTE 组件列表（带 `@_Cclass` / `@_Cgroup` / `@_Cvendor` / `@_Cversion` 属性） |

## 3. Target 节点结构

```xml
<Target>
  <TargetName>Target 1</TargetName>
  <ToolsetNumber>0x4</ToolsetNumber>
  <ToolsetName>ARM-ADS</ToolsetName>
  <TargetOption> ... </TargetOption>
  <Groups> ... </Groups>
</Target>
```

| 读取字段 | XML 路径 | 含义 |
|----------|----------|------|
| `target_name` | `TargetName` | Target 名称 |
| `toolset_number` | `ToolsetNumber` | 工具链编号 |
| `toolset_name` | `ToolsetName` | 工具链名称，如 `ARM-ADS` |
| `groups` | `Groups.Group` | 该 Target 下的文件分组 |

## 4. 文件分组与文件

```xml
<Groups>
  <Group>
    <GroupName>Source</GroupName>
    <Files>
      <File>
        <FileName>main.c</FileName>
        <FileType>1</FileType>
        <FilePath>./src/main.c</FilePath>
      </File>
    </Files>
  </Group>
</Groups>
```

| 读取字段 | XML 路径 | 含义 |
|----------|----------|------|
| `group.name` | `GroupName` | 分组名 |
| `file.name` | `File.FileName` | 文件名 |
| `file.type` | `File.FileType` | 文件类型代码，见下表 |
| `file.path` | `File.FilePath` | 原始路径，保留反斜杠 |
| `file.absolute_path` | 派生 | 相对路径会解析为绝对路径 |

### 文件类型代码

| 代码 | 类型 |
|------|------|
| `1` | C 文件 |
| `2` | 汇编文件 |
| `3` | 目标文件 |
| `4` | 库文件 |
| `5` | 文本文件 |
| `8` | C++ 文件 |

## 5. Target 选项（TargetOption）

### 5.1 通用选项（TargetCommonOption）

```xml
<TargetOption>
  <TargetCommonOption>
    <Device>STM32F103C8</Device>
    <Vendor>STMicroelectronics</Vendor>
    <PackID>Keil::STM32F1xx_DFP</PackID>
    <PackURL>http://www.keil.com/pack/</PackURL>
    <Cpu>IRAM(0x20000000,0x00005000) ...</Cpu>
    <OutputDirectory>./Objects</OutputDirectory>
    <OutputName>project</OutputName>
    <CreateExecutable>1</CreateExecutable>
    <CreateLib>0</CreateLib>
    <CreateHexFile>1</CreateHexFile>
  </TargetCommonOption>
</TargetOption>
```

| 读取字段 | XML 路径 | 含义 |
|----------|----------|------|
| `device` | `Device` | 目标 MCU 型号 |
| `vendor` | `Vendor` | 厂商 |
| `pack_id` | `PackID` | Pack 标识 |
| `pack_url` | `PackURL` | Pack 下载地址 |
| `cpu` | `Cpu` | CPU 内存布局描述 |
| `output_directory` | `OutputDirectory` | 编译输出目录 |
| `output_name` | `OutputName` | 输出文件名 |
| `create_executable` | `CreateExecutable` | 是否生成可执行文件 |
| `create_lib` | `CreateLib` | 是否生成库 |
| `create_hex_file` | `CreateHexFile` | 是否生成 HEX 文件 |

### 5.2 C 编译器选项（Cads）

```xml
<TargetArmAds>
  <Cads>
    <Optim>4</Optim>
    <VariousControls>
      <MiscControls></MiscControls>
      <Define>USE_HAL_DRIVER,STM32F103xB</Define>
      <Undefine></Undefine>
      <IncludePath>./inc;./drivers</IncludePath>
    </VariousControls>
  </Cads>
</TargetArmAds>
```

| 读取字段 | XML 路径 | 含义 |
|----------|----------|------|
| `c_optim` | `Cads.Optim` | 优化等级 |
| `c_misc_controls` | `Cads.VariousControls.MiscControls` | 其他 C 编译控制 |
| `defines` | `Cads.VariousControls.Define` | C 宏定义，逗号/空格分隔 |
| `undefines` | `Cads.VariousControls.Undefine` | 取消定义的宏 |
| `include_paths` | `Cads.VariousControls.IncludePath` | 头文件搜索路径，分号分隔 |

### 5.3 汇编器选项（Aads）

与 `Cads` 结构类似，字段前缀为 `asm_`：

| 读取字段 | XML 路径 |
|----------|----------|
| `asm_misc_controls` | `Aads.VariousControls.MiscControls` |
| `asm_defines` | `Aads.VariousControls.Define` |
| `asm_include_paths` | `Aads.VariousControls.IncludePath` |

### 5.4 链接器选项（LDads）

```xml
<TargetArmAds>
  <LDads>
    <ScatterFile>./ScatterFile.sct</ScatterFile>
    <Misc></Misc>
    <IncludeLibs></IncludeLibs>
    <IncludeLibsPath></IncludeLibsPath>
  </LDads>
</TargetArmAds>
```

| 读取字段 | XML 路径 | 含义 |
|----------|----------|------|
| `scatter_file` | `LDads.ScatterFile` | 分散加载文件 |
| `linker_misc` | `LDads.Misc` | 链接器杂项 |
| `include_libs` | `LDads.IncludeLibs` | 包含的库文件 |
| `include_libs_path` | `LDads.IncludeLibsPath` | 库文件搜索路径 |

### 5.5 调试与烧录选项

```xml
<TargetOption>
  <DebugOption>
    <TargetDlls>
      <Driver>CMSIS-DAP.dll</Driver>
    </TargetDlls>
  </DebugOption>
  <Utilities>
    <Flash2>CMSIS-DAP.FLM</Flash2>
  </Utilities>
</TargetOption>
```

| 读取字段 | XML 路径 | 含义 |
|----------|----------|------|
| `debugger_driver` | `DebugOption.TargetDlls.Driver` | 调试器 DLL |
| `flash_driver` | `Utilities.Flash2` | 烧录算法文件 |

## 6. 多项目工作区（.uvmpw）

根节点是 `<ProjectWorkspace>`：

```xml
<ProjectWorkspace>
  <WorkspaceName>MyWorkspace</WorkspaceName>
  <project>
    <PathAndName>./project1/project1.uvprojx</PathAndName>
  </project>
  <project>
    <PathAndName>./project2/project2.uvprojx</PathAndName>
  </project>
</ProjectWorkspace>
```

| 读取字段 | XML 路径 | 含义 |
|----------|----------|------|
| `workspace_name` | `WorkspaceName` | 工作区名称 |
| `projects` | `project.PathAndName` | 子项目路径列表 |

## 7. 路径处理规则

Keil 工程文件里大量使用反斜杠，本工具在内部统一使用正斜杠处理：

- 读取时保留原始 `FilePath`。
- 相对路径会基于工程目录解析为 `absolute_path`。
- 写入时把正斜杠再转回反斜杠（`toKeilPath`）。
- 保留 Keil 变量前缀（如 `PRJ_DIR$`、`CWD$`）不解析。

## 8. 写操作注意事项

本工具目前支持修改以下节点（见 `src/writer.js`）：

- Target 重命名（`setTargetName`）
- C 宏定义：替换、添加、删除（`setDefines` / `addDefine` / `removeDefine`）
- C 头文件搜索路径：替换、添加、删除（`setIncludePaths` / `addIncludePath` / `removeIncludePath`）
- 文件分组：增删改（`addGroup` / `removeGroup` / `renameGroup`）
- 文件：添加、删除、移动（`addFile` / `removeFile` / `moveFile`）
- 保存时自动备份原文件为 `.bak`。

**注意**：由于 `.uvprojx` 格式没有官方规范，写回时无法保证与所有 µVision 版本完全兼容。修改前请备份工程。

## 9. 已知限制与假设

1. 没有官方 XSD，所有字段路径都是经验归纳。
2. 主要测试/观察基于 **Keil µVision 5.x** 生成的 `.uvprojx` 文件。
3. 数组节点（如 `Target`、`Group`、`File`）在单元素时可能是对象而非数组，代码中做了 `Array.isArray` 兼容。
4. 布尔值在 XML 中通常以 `'1'` / `'0'` 字符串表示。
5. 不同 Keil 版本或 Pack 生成的 XML 可能包含本工具未解析的字段，这些字段会被保留但不会修改。
