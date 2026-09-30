# PhyloRecViewer

[English](./README.md) | **中文**

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23053318.svg)](https://doi.org/10.5281/zenodo.23053318)

美观、离线、交互式的 **recPhyloXML / NHX** 系统发育调和可视化工具。基于 Tauri v2（Rust + React 18 / TypeScript 严格模式）构建，采用纯函数式 SVG 渲染器。

## 功能特性

- **格式支持**：recPhyloXML 和 NHX/Newick 格式解析（按内容自动检测，无法识别时回退为 recPhyloXML），多文件合并。NHX 导入依靠 `S=` 注释重建物种树——对自包含文件可靠，但输入中**未加标注**的水平转移无法被辨别，因此含 HGT 的结果请优先使用 recPhyloXML
- **可视化**：物种 + 基因树调和绘制，四种方向，紧凑/矩形布局
- **嵌套视图**：三级嵌套（基因 → 共生体 → 宿主）和并排对比
- **分析**：搜索 / 筛选 / 统计 / 一致性检查，转移网络
- **导出**：SVG / PNG / PDF / 交互式 HTML / NHX；会话保存与恢复（覆盖全部标签页的工作区快照与自动保存）。NHX 导出在本软件内可无损往返，但使用的是扩展方言——外部 Newick 读取器可能丢失基因丢失与转移事件，因此需要完全无损、自描述的往返时请使用 recPhyloXML
- **平台**：中英双语，浅色和深色主题；完全离线运行
- **开源**：MIT 许可证；提供 macOS、Windows 和 Linux 安装包

## 安装

### 预编译二进制文件

从 [GitHub Releases](https://github.com/ZengZichao/PhyloRecViewer/releases) 下载最新版本。

| 平台 | 文件 |
|---|---|
| macOS（Apple Silicon 与 Intel） | `PhyloRecViewer_<版本号>_universal.dmg` |
| Windows | `PhyloRecViewer_<版本号>_x64-setup.exe` |
| Linux（Debian/Ubuntu） | `PhyloRecViewer_<版本号>_amd64.deb` |
| Linux（便携版） | `PhyloRecViewer_<版本号>_amd64.AppImage` |

安装包由 `release.yml` 工作流在每个 `v*` 标签上构建，且**未做代码签名与公证**：
macOS 首次打开需右键 → 打开以放行，`.AppImage` 需要 `chmod +x`。由此带来的安全
边界见 [SECURITY.md](./SECURITY.md)。

### 从源码构建

```bash
# 前置条件：Node.js 20+、npm 9+、Rust 1.77+（仅桌面构建）、Python 3（聚合脚本），
# Linux 上运行桌面构建还需 WebKitGTK 4.1+
git clone <仓库 URL>
cd PhyloRecViewer
npm ci                # 或 npm install（同步更新 package-lock.json）
npm run build         # 生产环境 Web 构建 -> dist/
npm run tauri build   # 原生桌面打包
```

开发模式：

```bash
npm run dev           # Web 开发服务器 (Vite, http://localhost:5173)
npm run tauri dev     # 桌面 (Tauri) 开发
npm run preview       # 以 http:// 方式伺服构建后的 dist/（构建产物使用 ES
                      # Module 脚本，直接双击打开 dist/index.html 会被浏览器
                      # 的 CORS 规则拦截，只剩空白页面）
npm run typecheck     # tsc -b
npm run lint          # eslint . --max-warnings 0
npm test              # vitest
npm run coverage      # vitest 并输出覆盖率报告
npm run check:tracked # 确认被引用的文件都已纳入版本控制（见 CONTRIBUTING.md）
```

`data/` 中的基准数值可在同一份代码树上复现：

```bash
for i in 1 2 3 4 5 6 7 8 9 10; do
  npm run measure   # 每次写入 _build/，须先归档再跑下一次
  mkdir -p "run$i" && cp _build/benchmarks.csv _build/benchmarks-datasets.csv "run$i/"
done
npm run measure:aggregate run1 run2 run3 run4 run5 run6 run7 run8 run9 run10
```

同一套结果也可以只用仓库里已提交的数据表重算：

```bash
python3 scripts/aggregate-measurements.py --from-runs
```

`data/` 保存冻结的测量数据（中位数、每次运行的原始值、输入哈希）。

## 使用方法

1. 启动 PhyloRecViewer。
2. 通过 **文件 → 打开**、拖放或系统文件关联，打开 `.recphyloxml`、`.recphylo`、
   `.xml`、`.phyloxml`、`.nhx`、`.nwk` 或 `.newick` 文件。
3. 使用左侧面板调整布局、样式和标签。
4. 使用右侧面板进行搜索、统计、转移网络和一致性检查。
5. 通过菜单栏的 **导出** 菜单导出为 SVG / PNG / PDF / HTML。

详细操作说明请参阅 [详细使用手册（中文）](./docs/USER_MANUAL.zh-CN.md) 或 [full user manual (English)](./docs/USER_MANUAL.md)。

## 文档与社区

所有文档均提供英文与中文两个版本，英文为主版本，`.zh-CN.md` 为其中文翻译并与英文版保持一致。

- [使用手册](./docs/USER_MANUAL.zh-CN.md) · [User manual](./docs/USER_MANUAL.md)
- [贡献指南](./CONTRIBUTING.zh-CN.md) · [Contributing guide](./CONTRIBUTING.md)——开发环境、检查项与发布流程
- [安全策略](./SECURITY.zh-CN.md) · [Security policy](./SECURITY.md)
- [行为准则](./CODE_OF_CONDUCT.zh-CN.md) · [Code of conduct](./CODE_OF_CONDUCT.md)

## 架构

```
src/
├── model/      # 标准化数据模型
├── parser/     # recPhyloXML + NHX 解析器
├── layout/     # 六步布局流水线
├── analysis/   # 统计、对比、一致性检查
├── render/     # 纯 SVG 渲染器
├── export/     # SVG/PNG/PDF/HTML/NHX 导出
├── state/      # Zustand 状态管理、撤销/重做
├── app/        # React 组件
├── samples/    # 随附示例谱系
└── platform/   # Tauri 桌面集成
```

## 引用

如果您在研究中使用 PhyloRecViewer，请引用已归档的发布版本：

> Zeng, Z. (2026). *PhyloRecViewer* (v0.1.0) [Computer software]. Zenodo. https://doi.org/10.5281/zenodo.23053318

机器可读版本见 [CITATION.cff](./CITATION.cff)。

## 许可证

MIT — 见 [LICENSE](./LICENSE)。

