# PhyloRecViewer

**中文** | [English](./README.md)

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23053317.svg)](https://doi.org/10.5281/zenodo.23053317)
[![CI](https://github.com/ZengZichao/PhyloRecViewer/actions/workflows/ci.yml/badge.svg)](https://github.com/ZengZichao/PhyloRecViewer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![ORCID](https://img.shields.io/badge/ORCID-0000--0001--6553--970X-a6ce39?logo=orcid&logoColor=white)](https://orcid.org/0000-0001-6553-970X)

美观、离线、交互式的 **recPhyloXML / NHX** 系统发育调和可视化工具。基于 Tauri v2（Rust + React 18 / TypeScript 严格模式）构建，采用确定性、纯样式的 SVG 渲染器。

## 功能特性

- **格式支持**：recPhyloXML 和 NHX/Newick 格式解析（按内容自动检测，无法识别时回退为 recPhyloXML），多文件合并。NHX 导入依靠 `S=` 批注重建物种树——对自包含文件可靠，但输入中未标记的水平转移无法被辨别，因此含 HGT 的结果请优先使用 recPhyloXML
- **可视化**：物种 + 基因树调和绘制，四种方向，紧凑/矩形布局
- **嵌套视图**：三层嵌套（基因 → 共生体 → 宿主），以及对比视图（画布默认上下堆叠，可切换为左右并排）
- **分析**：搜索 / 筛选 / 统计 / 数据检查，转移网络
- **导出**：SVG / PNG / PDF / 交互式 HTML / NHX；会话保存与恢复，会话级自动保存覆盖所有打开的标签页。无头命令行还可导出 **recPhyloXML**——完全无损、自描述的往返格式。NHX 是扩展方言：现已携带全部转移到达、时间片、置信度、支持度与枝长，但仍会丢失物种树本身、物种枝长、基因树名称以及从未被任何基因树取样的物种
- **平台**：中英双语（中文 / English），浅色和深色主题；完全离线运行
- **开源**：MIT 许可证；提供 macOS、Windows 和 Linux 安装包

## 安装

### 网页版（免安装）

本工具也可以直接在浏览器里使用：**<https://zengzichao.github.io/PhyloRecViewer/>**
——打开或拖入 `.recphyloxml` / `.nhx` / `.nwk` 文件即可，解析、布局、渲染、导出
全部在浏览器本地完成，文件不会离开你的设备。网页版由 `pages.yml` 工作流在每次
push 到 `main` 后自动重新部署。仅限桌面的能力（系统文件关联、「打开方式」）在
网页版中不可用。

### 预编译二进制文件

从 [GitHub Releases](https://github.com/ZengZichao/PhyloRecViewer/releases) 下载最新版本。

| 平台 | 文件 |
|---|---|
| macOS（Apple Silicon 与 Intel） | `PhyloRecViewer_<version>_universal.dmg` |
| Windows | `PhyloRecViewer_<version>_x64-setup.exe` |
| Linux（Debian/Ubuntu） | `PhyloRecViewer_<version>_amd64.deb` |
| Linux（便携版） | `PhyloRecViewer_<version>_amd64.AppImage` |

安装包由 `release.yml` 工作流在每个 `v*` 标签上构建，且**未做代码签名与公证**：
macOS 首次打开需右键 → 打开以放行，`.AppImage` 需要 `chmod +x`。其隐含的威胁模型见
[安全策略](./SECURITY.zh-CN.md)。

### 从源码构建

```bash
# 前置条件：Node.js 20+、npm 9+、Rust 1.77+（仅桌面构建）；Linux 上运行桌面构建
# 还需 WebKitGTK 4.1+
git clone <repository URL>
cd PhyloRecViewer
npm ci                # 或 npm install（同步更新 package-lock.json）
npm run build         # 生产环境 Web 构建 -> dist/
npm run tauri build   # 原生桌面打包
```

开发模式：

```bash
npm run dev           # Web 开发服务器 (Vite, http://localhost:5173)
npm run tauri dev     # 桌面 (Tauri) 开发
npm run preview       # 通过 http:// 提供构建后的 dist/（产物使用
                      # ES Module 脚本，直接从文件系统打开 dist/index.html
                      # 会被浏览器的 CORS 规则拦截）
npm run typecheck     # tsc -b
npm run lint          # eslint . --max-warnings 0
npm test              # vitest
npm run coverage      # vitest 并输出覆盖率报告
npm run check:tracked # 确保被导入的文件均已提交（见 CONTRIBUTING.zh-CN.md）
npm run cli           # 无头导出（输入为保存的会话文件 .rpvsession.json）：
                      # 统计 CSV、检查 JSON、SVG / HTML / recPhyloXML / NHX
```

`npm run measure` 走一遍真实的解析器 → 布局 → 渲染器路径，把基准 CSV 写入 `_build/`
（已被 git 忽略）。CI 在 Linux 上运行它，以免脚本悄悄腐坏。手稿引用的冻结基准表位于
`data/`；`scripts/aggregate-measurements.py` 可将多次运行归并到该目录（或写入
`_build/aggregates/` 进行非破坏性重放）。

## 使用方法

1. 启动 PhyloRecViewer。
2. 通过 **文件 → 打开文件**、拖放或系统文件关联，打开 `.recphyloxml` / `.recphylo` /
   `.xml` / `.phyloxml` 文件（软件读取的是 **recPhyloXML 内容**；不含 `<recPhylo>`
   根元素的普通 PhyloXML 树不是调和结果，会被拒绝），或 `.nhx` / `.nwk` /
   `.newick` 基因树文件。
3. 使用左侧面板调整布局、样式和标签。
4. 使用右侧面板进行搜索、统计、转移网络和数据检查。
5. 通过 **导出** 菜单导出为 SVG / PNG / PDF / HTML。

详细操作说明请参阅 [详细使用手册（中文）](./docs/USER_MANUAL.zh-CN.md) 或 [full user manual (English)](./docs/USER_MANUAL.md)。

## 文档与社区

所有面向用户的文档都提供英文和中文两个版本。英文文件是主版本；`.zh-CN.md`
是它的译文，并与英文版保持同步。`docs/` 下的编辑说明（界面术语表、风格指南
与带日期的 UI 审查）面向维护者，目前仅有中文。

- [使用手册](./docs/USER_MANUAL.zh-CN.md) · [User manual](./docs/USER_MANUAL.md)
- [贡献指南](./CONTRIBUTING.zh-CN.md) · [Contributing guide](./CONTRIBUTING.md)——工具链、检查项与发布流程
- [安全策略](./SECURITY.zh-CN.md) · [Security policy](./SECURITY.md)
- [行为准则](./CODE_OF_CONDUCT.zh-CN.md) · [Code of conduct](./CODE_OF_CONDUCT.md)

## 架构

```
src/
├── model/      # 标准化数据模型
├── parser/     # recPhyloXML + NHX 解析器
├── layout/     # 六步布局流水线
├── analysis/   # 统计、对比、校验
├── render/     # 纯 SVG 渲染器
├── export/     # SVG/PNG/PDF/HTML/recPhyloXML/NHX 导出
├── state/      # Zustand 状态管理、撤销/重做
├── app/        # React 组件
├── samples/    # 随附示例调和结果
└── platform/   # Tauri 桌面集成
```

## 引用

如果你在研究中使用 PhyloRecViewer，请引用当前发布版本：

> Zeng, Z., & Wang, Y. (2026). *PhyloRecViewer* (v0.2.0) [Computer software]. Zenodo. https://doi.org/10.5281/zenodo.24108315

v0.2.0 于 2026-11-10 发布；`10.5281/zenodo.24108315` 是其不可变的**版本 DOI**。
归档的**概念 DOI** https://doi.org/10.5281/zenodo.23053317 始终解析到最新的归档版本。
更早的版本 DOI 为 v0.1.0 = `10.5281/zenodo.23053318`、v0.1.2 =
`10.5281/zenodo.23653805`；不存在已归档的 v0.1.1 版本。

机器可读版本见 [CITATION.cff](./CITATION.cff)。

## 许可证

MIT——见 [LICENSE](./LICENSE)。

