# PhyloRecViewer 贡献指南（中文）

**中文** | [English](./CONTRIBUTING.md)

感谢你有意为 PhyloRecViewer 做出贡献！本文描述开发工作流、代码规范与项目结构。

## 前置条件

- **Node.js** 20+ 与 npm 9+（`package.json` 中的 `engines`；CI 锁定 Node 20）。锁文件是
  `lockfileVersion: 3`，`packageManager` 则锁定维护该锁文件的 npm 10 版本线——启用
  Corepack（`corepack enable`）后会自动使用那个版本；任何 npm 9+ 也都能正常读取锁文件。
- **Rust** 工具链 1.77+（用于 Tauri 桌面壳）
- **macOS**：Xcode Command Line Tools
- **Linux**：`libwebkit2gtk-4.1-dev`（WebKitGTK 4.1）以及其他 Tauri 系统库（参见
  [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)）
- **Windows**：Microsoft C++ Build Tools

## CI 运行哪些检查

`.github/workflows/ci.yml` 是每个拉取请求都必须通过的门禁，在 Ubuntu 22.04、macOS 和
Windows 上运行：

| Job | 做的事情 |
|---|---|
| `web`（3 系统矩阵） | 三套系统上都执行 `npm ci` → `check:tracked` → `lint`（`--max-warnings 0`）→ `typecheck` → `test` → `build`；`coverage` 与 `npm run measure` 仅在 Linux 执行；`npm run preview` 冒烟测试在 Linux 和 macOS 执行（`windows-latest` 不在此列） |
| `tracked-only-build` | 从 commit 中**只导出 git 跟踪的文件**到一个干净目录，把 `node_modules` 链接进去，然后在那里运行 `npm run build`、`npm run typecheck`、`npm test`——因此"被跟踪的文件引入了一个未跟踪的文件"不可能通过 CI |
| `rust`（Ubuntu + macOS） | 针对 Tauri 桌面壳执行 `cargo fmt --all -- --check`、`cargo check --all-targets`、`cargo test --all-targets`、`cargo clippy --all-targets -- -D warnings`，在 Ubuntu 和 macOS 上 |

发布打包（三个平台的安装包）是另一个独立的工作流——见[版本发布](#版本发布)。

## 快速开始

```bash
git clone <仓库 URL>
cd PhyloRecViewer
npm install
npm run tauri dev   # 以开发模式启动桌面应用
```

仅做 Web 开发（不涉及 Tauri）：

```bash
npm run dev         # http://localhost:5173
npm run build       # 生产构建包 -> dist/
npm run preview     # 以 http://localhost:4173 伺服 dist/
```

`npm run preview` 是在浏览器中查看生产构建包的唯一受支持方式：构建包以
`type="module"` 脚本加载，而直接从文件系统打开 `dist/index.html` 会被浏览器针对模块脚本
的 CORS 规则拦截（结果是只剩一个空白窗口和一条控制台报错）。

npm 版本：`package.json` 锁定了 `packageManager`（npm 10 版本线，与 `lockfileVersion: 3`
相匹配）。启用 Corepack（`corepack enable`）后即自动使用被锁定的版本。当你只需要锁定的
依赖集合时，一律用 `npm ci` 安装——这正是 CI 的做法——只有在你有意改动某个依赖时才用
`npm install`，这样 `package-lock.json` 会在同一个提交里更新。绝不要手工编辑锁文件。

## 项目结构

```
src/
├── app/           # React 组件（App、Canvas、Sidebar、RightPanel、……）
├── render/        # 纯函数 SVG 渲染器（Scene、几何、主题）
├── layout/        # 六步布局流水线（物种/基因/转移/……）
├── model/         | 不可变调和模型（Reconciliation、GeneNode、……）
├── parser/        # recPhyloXML / NHX / Newick 解析器
├── analysis/      | 聚焦匹配、统计、一致性检查、差异
├── export/        | SVG / PNG / PDF / HTML / NHX 导出器
├── state/         | Zustand store、自动保存、会话、偏好设置
├── platform/      | Tauri 桌面桥接（文件打开/保存、fs）
├── samples/       # 随附示例调和（四个菜单项）
├── i18n.ts        # 中英词典（编译期类型检查）
├── session.ts     # 会话文件序列化（当前 schema 版本定义于此）
└── styles.css     # 全局 CSS（TRAE Minimalist 设计系统）
src-tauri/
└── src/           # Rust 桌面壳（文件关联、对话框、原子保存）
scripts/
├── measure.ts                  # 解析 / 布局 / 渲染基准 -> _build/*.csv
├── aggregate-measurements.py   # 折叠重复运行 -> data/*.csv + MANIFEST.json
└── check-tracked-files.mjs     # 仓库自洽性守卫（npm run check:tracked）
.github/workflows/
├── ci.yml         # lint / typecheck / test / build，覆盖 Ubuntu + macOS + Windows
└── release.yml    # 安装包：在 v* 标签上创建草稿发布，手动运行时产出工作流构件
tsconfig.json      # solution 文件（引用 app / node / test 三个项目）
tsconfig.app.json  # 面向浏览器构建的 src/
tsconfig.node.json # vite.config.ts + scripts/（`tsc -b` 检查脚本时用的也是它）
tsconfig.test.json # *.test.ts(x) 与 src/test/
tsconfig.scripts.json  # `npm run measure` 所需的 jsx/类型设置
vite.config.ts     # 构建 + vitest（含覆盖率）配置
.githooks/pre-commit            # 可选的本地守卫：npm run hooks:install
```

## 开发工作流

### 代码质量

提交拉取请求之前，以下检查必须全部通过：

```bash
npm run typecheck     # tsc -b，TypeScript 严格模式——必须报告 0 errors
npm run lint          # eslint . --max-warnings 0——0 errors 且 0 warnings
npm run lint:fix      # 同样的规则，并自动修复 ESLint 能修的部分
npm test              # vitest run（测试套件持续增长；CI 会打印真实数量）
npm run coverage      # 同样的测试，并在 coverage/ 下输出 text/html/lcov 报告
npm run check:tracked # 被跟踪的文件不得引入未跟踪的文件（见下文）
npm run build         # tsc -b && vite build
```

以及，改动桌面壳时：

```bash
cd src-tauri
cargo fmt --all -- --check
cargo check --all-targets
cargo test --all-targets
cargo clippy --all-targets -- -D warnings
```

本项目**没有独立的代码格式化工具**：ESLint（搭配 `typescript-eslint` 与 React
hooks/refresh 插件）是唯一的风格工具，因此 `npm run lint:fix` 就是自动修复入口。请不要
重排与本次改动无关的文件——样式抖动会让 diff 无法审阅。

`cargo test --all-targets` 是有意为之：裸的 `cargo test` 还会构建 doctest，在没装
`rustdoc` 组件的机器上会失败。

### 保持仓库自洽

一个*没有*纳入 git、却被*已经*纳入 git 的文件所引用的文件，是一个特殊的陷阱：`tsc -b`、
`vite build` 和 `vitest` 在本地全部通过——那个文件就待在工作树里——而每一次全新克隆
（包括 CI）都会失败。更糟的是，未跟踪的测试文件不会让任何东西变红：它只是悄悄缩小了测试
套件，于是 CI 报告绿色，实际测试的却比仓库看起来的更少。

`npm run check:tracked`（`scripts/check-tracked-files.mjs`）捕获这一整类问题：它解析被
跟踪源码里的每一个相对导入，检查 git 报告为未跟踪的测试/源文件，并校验被跟踪 Markdown
中的相对链接。CI 在每个 job 里都运行它，并且会**构建仅含被跟踪文件的 commit 导出**，
所以回归无法蒙混过关。

要在提交之前于本地得到同样的检查：

```bash
npm run hooks:install                       # 每个克隆执行一次：git config core.hooksPath .githooks
git config --unset core.hooksPath           # 撤销该配置
```

钩子是便利手段，不是门禁——`git commit --no-verify` 会跳过它，CI 仍然是权威。

新增文件时，把它和引入它的代码放进同一个提交：

```bash
git add -- src/model/newthing.ts src/samples/new-sample.recphyloxml
```

### 基准复现脚本

`data/` 下发布的基准表来自应用自身的解析器 → 布局 → 渲染器路径，因此可以在全新克隆上
直接复现：

```bash
npm run measure            # -> _build/benchmarks-datasets.csv, benchmarks.csv
npm run measure:aggregate  # 折叠重复运行 -> data/*.csv + data/MANIFEST.json
```

`npm run measure` 经由 `tsx --tsconfig tsconfig.scripts.json` 运行。这个额外的配置之所以
存在，是因为根 `tsconfig.json` 是 solution 风格（`files: []`，没有 `compilerOptions`）：
没有它，tsx 会退回*经典* JSX 转换，依赖图里每个 `.tsx` 模块都会因
`ReferenceError: React is not defined` 而失败。因此 `tsconfig.scripts.json` 设置了
`"jsx": "react-jsx"`，并且必须把 `src/**` 留在它的 `include` 里——tsx 只对配置覆盖到的
文件应用配置。`_build/` 是生成产物，已被 git 忽略；请重新生成而不是提交它。`data/` 下
已提交的 CSV 就是发布的基准表。CI 会运行该脚本，以免它悄悄腐坏。

### 插图与绘图脚本不属于仓库内容

插图、绘制插图的脚本，以及渲染出的 PNG/PDF/SVG 都在本仓库之外——包括那个把随附示例以
印刷可辨识的标签尺寸推过 `Scene` 的辅助脚本。两个原因：

- 插图是编辑产物：它的标签尺寸、线宽和管道色调都是为某一个页宽调好的，修订它们不算对
  软件的改动；
- 这样一份克隆就只包含处于测试之下的代码，仓库的 CI 永不依赖绘图脚本。

依赖只朝一个方向：那些脚本从本仓库读取 `data/*.csv`、`src/samples/` 和
`src/parser/__fixtures__/`。当一张插图需要此处没有的东西时，缺的是*数据*，提交它属于
仓库改动——而不是把绘图脚本搬进仓库的理由。

### 测试

测试用 [Vitest](https://vitest.dev/) 编写，并在 jsdom 下运行：

```bash
npm test            # 一次性运行全部测试
npm run test:watch  # watch 模式
npm run coverage    # + 覆盖率报告（控制台摘要、html、lcov）
```

不要在文档或提交信息里引用测试数量：它一天之内就会过期。运行 `npm test`，读 Vitest 打印
的摘要。

新增功能时，请添加对应的测试。优先领域：
- 解析器边界情况（畸形 XML、深树、空文件、recPhyloXML 的 XSD 所允许的"属性 vs 元素"
  两种写法）
- 状态转换（载入/卸载、撤销/重做、标签页切换）
- 会话往返（序列化 → 解析 → 恢复）
- 任何基准表所度量的东西：`data/` 里的一个数字需要的是一个测试，而不是一次性的脚本运行

### 文档

本仓库的每一份文档都以两种语言发布：英文文件是主版本，同级的 `.zh-CN.md` 文件是它的
译文——`README.md` / `README.zh-CN.md`、`docs/USER_MANUAL.md` /
`docs/USER_MANUAL.zh-CN.md`、`CONTRIBUTING.md` / `CONTRIBUTING.zh-CN.md`、
`SECURITY.md` / `SECURITY.zh-CN.md`，以及 `CODE_OF_CONDUCT.md` /
`CODE_OF_CONDUCT.zh-CN.md`。这些成对文件互为**译文**：每一处正文改动都同时落到两边，
顺序一致、表格一致。GitHub 会把英文文件识别为仓库的社区文档，因此新文件沿用 `.zh-CN.md`
后缀约定，而不是移入 `docs/`。

有三处刻意保持单语言：`LICENSE` 原样收录 MIT 许可文本，因为译文并不承载相同的法律措辞；
`CITATION.cff` 是机器可读的记录而非叙述性正文；`.github/` 下的 GitHub 表单
（`PULL_REQUEST_TEMPLATE.md`、`ISSUE_TEMPLATE/*`）只有一份英文来源，因为 GitHub 对每种
表单只解析一个文件。

手册描述的是代码，因此写作前先对照源码校验。当某个数字很可能变动时，优先描述行为而非
魔法数字（例如"面板会列出它运行的每一项结构检查"，而不是"六项检查"）：必须精确的计数
——会话 schema 版本、DPI 档位——归属 `src/`，并从中引用。

### 代码规范

- **TypeScript 严格模式**：每个文件都做类型检查；`noUnusedLocals` 已开启。`noUncheckedIndexedAccess` 与 `exactOptionalPropertyTypes` **未**开启：目前打开其中任一个都会在 `src/` 各处报出数十条新诊断，所以它们是一件有意独立安排的工作，而不是改一次配置的事。不要在文档中把代码库描述为"完全严格"。
- **不可变模型**：`Reconciliation`、`Positions` 和 `LayoutResult` 永不就地修改。新状态产生新对象。
- **组件中不写硬编码 UI 字符串**：`src/app/`、`src/state/` 和 `src/export/` 中所有面向用户的文本都经由 `src/i18n.ts`，且 `Dict` 接口强制 `zh` 与 `en` 在编译期完整。已知两处例外：`src/samples/index.ts` 中的随附示例标题是中文常量，会进入菜单和导出文件名；`friendlyParseError` 中的解析失败文案仅有英文。
- **单一 store**：全部应用状态都存放在一个 Zustand store（`src/state/store.ts`）中。store 层不应从 `app/` 导入，也不应包含 i18n 字符串。
- **会话文件信任边界**：从会话文件或偏好设置中读入的所有选项，在到达布局/渲染引擎之前必须经过 `sanitizeLayoutOptions` / `sanitizeRenderOptions`。
- **会话 schema 版本**：`src/session.ts` 中的 `CURRENT_SESSION_VERSION` 是唯一事实
  来源。仅当持久化的结构发生变化时才递增它，并让两份用户手册里的"会话包含什么"清单与
  版本说明和代码保持同步（手册引用该数值；别处不定义它）。

### 提交信息

使用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
feat: add support for branched phyloXML events
fix: prevent nested layer from persisting after document switch
docs: update README installation instructions
refactor: extract slider component into shared controls
```

### 拉取请求

1. Fork 本仓库，并从 `main` 创建功能分支。
2. 按照上述代码规范完成你的改动。
3. 确保所有检查通过（`typecheck`、`lint`、`test`、`check:tracked`、`build`；Rust
   桌面壳有改动时还包括 `cargo fmt/check/test/clippy`）。
4. 填写 `.github/PULL_REQUEST_TEMPLATE.md`——它是 CI 无法替你完成的那份清单（两种语言
   之间的文档一致性、格式合规的理由说明）。
5. 若新增渲染/布局选项，请在 `Dict` 接口、侧边栏控件以及两份用户手册中都把它写下来。

## 版本发布

发布由 CI 构建；没有任何东西需要手工编译或上传。

1. 让改动带着一致的版本落到 `main`：`package.json`、`src-tauri/tauri.conf.json`、
   `src-tauri/Cargo.toml`、`CITATION.cff`，以及两份手册中的版本行。
2. 打标签并推送：
   ```bash
   git tag -a vX.Y.Z -m "PhyloRecViewer vX.Y.Z"
   git push origin vX.Y.Z
   ```
3. `.github/workflows/release.yml` 构建 macOS / Windows / Linux 安装包，并创建一个附带
   bundles 的 **草稿** GitHub Release。安装包未签名：macOS 用户需放行一次（右键 →
   打开），Linux 的 `.AppImage` 需要 `chmod +x`。
4. 检查草稿——在它面向的每个平台上打开每个安装包，载入一个示例和一个真实文件，导出
   PNG/SVG/PDF/HTML/NHX，保存并重新载入会话——然后发布它。

要在**不打标签**的情况下验证打包工作，请在该分支上运行
**Actions → Release → Run workflow**：同样构建三个平台并作为工作流构件上传，且不会创建
发布。

### 引用

`CITATION.cff` 是软件的机器可读引用记录。它的 `version` 与 `date-released` 描述的是
正在打标签的那次发布，与 `package.json`、`tauri.conf.json` 和 `Cargo.toml` 中的版本号在
同一个提交里设置；`README.md` 与 `README.zh-CN.md` 中的引用块引用同一个标题与作者。
只有当注册机构确实为某个已发布版本颁发了 `doi` 之后才填写它——绝不要凭空编造。

### Dependabot

`.github/dependabot.yml` 为 npm、Cargo（`src-tauri`）和 GitHub Actions 每周开启更新
PR。依赖升级与其他 PR 一样审阅：CI 必须全绿；对运行时依赖，合并前应当有人跑一遍
`npm run tauri dev` 加上各条导出路径（解析或渲染的回归对测试套件是不可见的）。一次只
合并一个生态，这样回归只有一个原因。

## 新增文件格式解析器

1. 在 `src/parser/` 中实现解析器。
2. 在 `src/parser/formats.ts` 中注册它（`parseReconciliation` 或 `parseMerged`）。
3. 添加测试用例，覆盖结构良好、畸形以及边界情况的输入。
4. 更新 `store.ts` 中的 `friendlyParseError`，提及新格式。

## 新增布局/渲染选项

1. 给 `LayoutOptions` 或 `RenderOptions` 添加字段，并设一个合理的默认值。
2. 把它接入布局流水线（`src/layout/`）或渲染器（`src/render/`）。
3. 在 `Sidebar.tsx` 中添加一个 UI 控件（复用现有的 `Slider` / `Switch` / `Select` 组件）。
4. 在 `session.ts` 中把它加入 `sanitizeLayoutOptions` / `sanitizeRenderOptions`。
5. 把它加入 `SessionData` 与 `SavedTab` 接口。
6. 在 `src/i18n.ts` 中为标签和工具提示添加 i18n 键。

## 许可证与社区

贡献即表示你同意你的贡献将以 MIT 许可证授权（见 [LICENSE](./LICENSE)）。参与行为受
[行为准则](./CODE_OF_CONDUCT.zh-CN.md)约束；安全问题请按
[SECURITY.zh-CN.md](./SECURITY.zh-CN.md) 所述上报，不要开公开 issue。
