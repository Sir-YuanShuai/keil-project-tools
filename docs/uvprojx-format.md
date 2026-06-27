# Keil µVision 工程文件格式说明

> **免责声明**：Keil µVision 项目文件（`.uvprojx`、`.uvproj`、`.uvmpw）是 **Keil/ARM 的私有 XML 序列化格式**，虽然 `.uvprojx` 文件头通常会引用 `xsi:noNamespaceSchemaLocation="project_projx.xsd"`，但 Keil 并未公开该 XSD 文件，官方也没有完整的字段文档。本文档中的节点路径、字段含义和版本假设均来自对真实 Keil µVision 5.x 工程文件的逆向工程观察，以及 Keil 官方命令行/用户文档中的概念描述。

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
<Project xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="project_projx.xsd">
  <SchemaVersion>2.1</SchemaVersion>
  <Header>### uVision Project, (C) Keil Software</Header>
  <Targets> ... </Targets>
  <RTE> ... </RTE>         <!-- Run-Time Environment 组件 -->
</Project>
```

| 字段 | 含义 |
|------|------|
| `xmlns:xsi` / `xsi:noNamespaceSchemaLocation` | 引用 Keil 内部 XSD `project_projx.xsd`（该文件未公开） |
| `SchemaVersion` | 工程文件格式版本号，常见为 `2.1` |
| `Header` | 文件头标识 |
| `Targets.Target` | 一个或多个 Target 节点 |
| `RTE.components.component` | RTE 组件列表（带 `@_Cclass` / `@_Cgroup` / `@_Cvendor` / `@_Cversion` 属性） |

> 注：在真实 `.uvprojx` 文件中，`Groups` 通常位于每个 `Target` 节点内部，而不是项目根节点下。

## 3. Target 节点结构

```xml
<Target>
  <TargetName>Target 1</TargetName>
  <ToolsetNumber>0x4</ToolsetNumber>
  <ToolsetName>ARM-ADS</ToolsetName>
  <pCCUsed>5060960::V5.06 update 7 (build 960)::.\ARMCC</pCCUsed>
  <uAC6>0</uAC6>
  <TargetOption> ... </TargetOption>
  <Groups> ... </Groups>
</Target>
```

| 字段 | XML 路径 | 含义 | 本工具是否解析 |
|------|----------|------|----------------|
| `target_name` | `TargetName` | Target 名称 | 是 |
| `toolset_number` | `ToolsetNumber` | 工具链编号 | 是 |
| `toolset_name` | `ToolsetName` | 工具链名称，如 `ARM-ADS` | 是 |
| `pCCUsed` | `pCCUsed` | 具体编译器版本信息 | 否 |
| `uAC6` | `uAC6` | 是否使用 ARM Compiler 6 | 否 |
| `groups` | `Groups.Group` | 该 Target 下的文件分组 | 是 |

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

`TargetOption` 是 `.uvprojx` 中最复杂的部分，包含以下常见子节点：

```xml
<TargetOption>
  <TargetCommonOption> ... </TargetCommonOption>
  <CommonProperty> ... </CommonProperty>
  <DllOption> ... </DllOption>
  <DebugOption> ... </DebugOption>
  <Utilities> ... </Utilities>
  <TargetArmAds> ... </TargetArmAds>
</TargetOption>
```

### 5.1 通用选项（TargetCommonOption）

```xml
<TargetCommonOption>
  <Device>nRF52840_xxAA</Device>
  <Vendor>Nordic Semiconductor</Vendor>
  <PackID>NordicSemiconductor.nRF_DeviceFamilyPack.8.35.0</PackID>
  <PackURL>http://developer.nordicsemi.com/...</PackURL>
  <Cpu>IROM(0x00000000,0x100000) IRAM(0x20000000,0x40000) ...</Cpu>
  <RegisterFile>$$Device:nRF52832_xxAA$Device\Include\nrf.h</RegisterFile>
  <SFDFile>..\..\..\..\..\modules\nrfx\mdk\nrf52840.svd</SFDFile>
  <OutputDirectory>.\_build\</OutputDirectory>
  <OutputName>boot</OutputName>
  <CreateExecutable>1</CreateExecutable>
  <CreateLib>0</CreateLib>
  <CreateHexFile>1</CreateHexFile>
  <DebugInformation>1</DebugInformation>
  <BrowseInformation>1</BrowseInformation>
  <ListingPath>.\_build\</ListingPath>
  <TargetStatus>
    <Error>0</Error>
    <ExitCodeStop>0</ExitCodeStop>
    <ButtonStop>0</ButtonStop>
    <NotGenerated>0</NotGenerated>
    <InvalidFlash>1</InvalidFlash>
  </TargetStatus>
  <BeforeCompile> ... </BeforeCompile>
  <BeforeMake> ... </BeforeMake>
  <AfterMake> ... </AfterMake>
</TargetCommonOption>
```

| 字段 | XML 路径 | 含义 | 本工具是否解析 |
|------|----------|------|----------------|
| `device` | `Device` | 目标 MCU 型号 | 是 |
| `vendor` | `Vendor` | 厂商 | 是 |
| `pack_id` | `PackID` | Pack 标识 | 是 |
| `pack_url` | `PackURL` | Pack 下载地址 | 是 |
| `cpu` | `Cpu` | CPU 内存布局描述 | 是 |
| `output_directory` | `OutputDirectory` | 编译输出目录 | 是 |
| `output_name` | `OutputName` | 输出文件名 | 是 |
| `create_executable` | `CreateExecutable` | 是否生成可执行文件 | 是 |
| `create_lib` | `CreateLib` | 是否生成库 | 是 |
| `create_hex_file` | `CreateHexFile` | 是否生成 HEX 文件 | 是 |
| `register_file` | `RegisterFile` | 寄存器定义文件 | 否 |
| `sfd_file` | `SFDFile` | SVD 文件路径 | 否 |
| `listing_path` | `ListingPath` | 列表文件输出目录 | 否 |
| `target_status` | `TargetStatus` | 目标状态标志 | 否 |
| `before_compile` | `BeforeCompile` | 编译前用户程序 | 否 |
| `before_make` | `BeforeMake` | 构建前用户程序 | 否 |
| `after_make` | `AfterMake` | 构建后用户程序 | 否 |

> 还有许多其他字段（如 `FlashUtilSpec`、`StartupFile`、`FlashDriverDll`、`DeviceId`、`MemoryEnv`、`Cmp`、`Asm`、`Linker`、`OHString`、`InfinionOptionDll`、`SLE66CMisc`、`SLE66AMisc`、`SLE66LinkerMisc`、`bCustSvd`、`UseEnv`、`BinPath`、`IncludePath`、`LibPath`、`RegisterFilePath`、`DBRegisterFilePath`、`HexFormatSelection`、`Merge32K`、`CreateBatchFile`、`SelectedForBatchBuild`、`SVCSIdString` 等），目前未被本工具解析，但会被原样保留。

### 5.2 CommonProperty

```xml
<CommonProperty>
  <UseCPPCompiler>0</UseCPPCompiler>
  <RVCTCodeConst>0</RVCTCodeConst>
  <RVCTZI>0</RVCTZI>
  <RVCTOtherData>0</RVCTOtherData>
  <ModuleSelection>0</ModuleSelection>
  <IncludeInBuild>1</IncludeInBuild>
  <AlwaysBuild>0</AlwaysBuild>
  <GenerateAssemblyFile>0</GenerateAssemblyFile>
  <AssembleAssemblyFile>0</AssembleAssemblyFile>
  <PublicsOnly>0</PublicsOnly>
  <StopOnExitCode>3</StopOnExitCode>
  <CustomArgument></CustomArgument>
  <IncludeLibraryModules></IncludeLibraryModules>
  <ComprImg>1</ComprImg>
</CommonProperty>
```

| 字段 | XML 路径 | 含义 | 本工具是否解析 |
|------|----------|------|----------------|
| `use_cpp_compiler` | `UseCPPCompiler` | 是否使用 C++ 编译器 | 否 |
| `include_in_build` | `IncludeInBuild` | 是否包含在构建中 | 否 |
| `always_build` | `AlwaysBuild` | 是否总是构建 | 否 |
| `stop_on_exit_code` | `StopOnExitCode` | 停止退出码 | 否 |

### 5.3 DllOption

调试器 DLL 配置：

```xml
<DllOption>
  <SimDllName></SimDllName>
  <SimDllArguments></SimDllArguments>
  <SimDlgDll></SimDlgDll>
  <SimDlgDllArguments></SimDlgDllArguments>
  <TargetDllName>SARMCM3.DLL</TargetDllName>
  <TargetDllArguments>-MPU</TargetDllArguments>
  <TargetDlgDll>TCM.DLL</TargetDlgDll>
  <TargetDlgDllArguments>-pCM4</TargetDlgDllArguments>
</DllOption>
```

### 5.4 调试选项（DebugOption）

```xml
<DebugOption>
  <OPTHX>
    <HexSelection>1</HexSelection>
    <HexRangeLowAddress>0</HexRangeLowAddress>
    <HexRangeHighAddress>0</HexRangeHighAddress>
    <HexOffset>0</HexOffset>
    <Oh166RecLen>16</Oh166RecLen>
  </OPTHX>
</DebugOption>
```

本工具读取 `DebugOption.TargetDlls.Driver` 作为 `debugger_driver`。

### 5.5 烧录工具选项（Utilities）

```xml
<Utilities>
  <Flash1>
    <UseTargetDll>1</UseTargetDll>
    <UseExternalTool>0</UseExternalTool>
    <RunIndependent>0</RunIndependent>
    <UpdateFlashBeforeDebugging>1</UpdateFlashBeforeDebugging>
    <Capability>1</Capability>
    <DriverSelection>4099</DriverSelection>
  </Flash1>
  <bUseTDR>1</bUseTDR>
  <Flash2>BIN\UL2CM3.DLL</Flash2>
  <Flash3></Flash3>
  <Flash4></Flash4>
  <pFcarmOut></pFcarmOut>
  <pFcarmGrp></pFcarmGrp>
  <pFcArmRoot></pFcArmRoot>
  <FcArmLst>0</FcArmLst>
</Utilities>
```

| 字段 | XML 路径 | 含义 | 本工具是否解析 |
|------|----------|------|----------------|
| `flash_driver` | `Utilities.Flash2` | 烧录算法/驱动 | 是 |

### 5.6 C 编译器选项（Cads）

```xml
<TargetArmAds>
  <ArmAdsMisc> ... </ArmAdsMisc>
  <Cads>
    <interw>1</interw>
    <Optim>4</Optim>
    <oTime>0</oTime>
    <SplitLS>0</SplitLS>
    <OneElfS>1</OneElfS>
    <Strict>0</Strict>
    <EnumInt>0</EnumInt>
    <PlainCh>0</PlainCh>
    <Ropi>0</Ropi>
    <Rwpi>0</Rwpi>
    <wLevel>0</wLevel>
    <uThumb>0</uThumb>
    <uSurpInc>0</uSurpInc>
    <uC99>1</uC99>
    <uGnu>0</uGnu>
    <useXO>0</useXO>
    <v6Lang>0</v6Lang>
    <v6LangP>0</v6LangP>
    <vShortEn>0</vShortEn>
    <vShortWch>0</vShortWch>
    <v6Lto>0</v6Lto>
    <v6WtE>0</v6WtE>
    <v6Rtti>0</v6Rtti>
    <VariousControls>
      <MiscControls>--reduce_paths</MiscControls>
      <Define>BLE_STACK_SUPPORT_REQD ...</Define>
      <Undefine></Undefine>
      <IncludePath>..\..\config;...</IncludePath>
    </VariousControls>
  </Cads>
</TargetArmAds>
```

| 字段 | XML 路径 | 含义 | 本工具是否解析 |
|------|----------|------|----------------|
| `c_optim` | `Cads.Optim` | 优化等级 | 是 |
| `c_misc_controls` | `Cads.VariousControls.MiscControls` | 其他 C 编译控制 | 是 |
| `defines` | `Cads.VariousControls.Define` | C 宏定义，逗号/空格分隔 | 是 |
| `undefines` | `Cads.VariousControls.Undefine` | 取消定义的宏 | 是 |
| `include_paths` | `Cads.VariousControls.IncludePath` | 头文件搜索路径，分号分隔 | 是 |

> `Cads` 下还有大量编译器开关字段（如 `interw`、`oTime`、`SplitLS`、`OneElfS`、`Strict`、`EnumInt`、`PlainCh`、`Ropi`、`Rwpi`、`wLevel`、`uThumb`、`uSurpInc`、`uC99`、`uGnu`、`useXO`、`v6Lang` 等），目前未被本工具解析，但会被原样保留。

### 5.7 汇编器选项（Aads）

结构与 `Cads` 类似，字段前缀为 `asm_`：

| 字段 | XML 路径 | 本工具是否解析 |
|------|----------|----------------|
| `asm_misc_controls` | `Aads.VariousControls.MiscControls` | 是 |
| `asm_defines` | `Aads.VariousControls.Define` | 是 |
| `asm_include_paths` | `Aads.VariousControls.IncludePath` | 是 |

### 5.8 链接器选项（LDads）

```xml
<LDads>
  <umfTarg>1</umfTarg>
  <Ropi>0</Ropi>
  <Rwpi>0</Rwpi>
  <noStLib>0</noStLib>
  <RepFail>1</RepFail>
  <useFile>0</useFile>
  <TextAddressRange>0x00000000</TextAddressRange>
  <DataAddressRange>0x20000000</DataAddressRange>
  <pXoBase></pXoBase>
  <ScatterFile></ScatterFile>
  <IncludeLibs></IncludeLibs>
  <IncludeLibsPath></IncludeLibsPath>
  <Misc>--diag_suppress 6330</Misc>
  <LinkerInputFile></LinkerInputFile>
  <DisabledWarnings></DisabledWarnings>
</LDads>
```

| 字段 | XML 路径 | 含义 | 本工具是否解析 |
|------|----------|------|----------------|
| `scatter_file` | `LDads.ScatterFile` | 分散加载文件 | 是 |
| `linker_misc` | `LDads.Misc` | 链接器杂项 | 是 |
| `include_libs` | `LDads.IncludeLibs` | 包含的库文件 | 是 |
| `include_libs_path` | `LDads.IncludeLibsPath` | 库文件搜索路径 | 是 |

### 5.9 TargetArmAds / ArmAdsMisc

`ArmAdsMisc` 包含大量 ARM 工具链杂项配置（如 `GenerateListings`、`asHll`、`asAsm`、`asMacX`、`AdsCpuType`、`RvdsVP`、`useUlib`、`RoSelD`、`RwSelD`、`CodeSel`、`OptFeed` 等），以及 `OnChipMemories` 内存布局（`IRAM`、`IROM`、`XRAM`、`OCR_RVCT1` 等）。这些目前未被本工具解析，但会被原样保留。

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

1. **没有官方 XSD**：`.uvprojx` 引用的 `project_projx.xsd` 未公开，所有字段路径都是经验归纳。
2. **观察样本**：当前文档主要基于 `tmp/BCL603S2.uvprojx` 和 `tmp/secure_bootloader_ble_s140_pca10056.uvprojx` 两个真实工程文件，以及其它 **Keil µVision 5.x** 生成的 `.uvprojx` 文件。`SchemaVersion` 观察值为 `2.1`。
3. **节点覆盖**：文档列出的是常见的 TargetOption 子节点和本工具已解析的字段。Keil 不同版本、不同 Pack、不同工具链可能还有更多字段未被列出。
4. 数组节点（如 `Target`、`Group`、`File`）在单元素时可能是对象而非数组，代码中做了 `Array.isArray` 兼容。
5. 布尔值在 XML 中通常以 `'1'` / `'0'` 字符串表示。
6. 不同 Keil 版本或 Pack 生成的 XML 可能包含本工具未解析的字段，这些字段会被保留但不会修改。
