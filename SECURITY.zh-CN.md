# 安全策略（中文）

**中文** | [English](./SECURITY.md)

## PhyloRecViewer 是什么，以及这意味着什么

PhyloRecViewer 是一款**离线**桌面查看器（Tauri v2），同时提供 Web 构建版本，用于查看基因－物种调和（reconciliation）文件（recPhyloXML、NHX / Newick）。它没有服务器、没有账号、没有遥测，运行时不发起任何网络请求；`src-tauri/tauri.conf.json` 中的 Content Security Policy（内容安全策略，CSP）把 `connect-src` 限制为本地 IPC 端点。因此安全风险集中在以下三处：

1. **解析不可信输入。** 格式错误或恶意的 `.recphyloxml` / `.xml` / `.nhx` / `.nwk` / `.newick` 文件，或恶意的 `.rpvsession.json` 会话文件，都是攻击者可控的数据，会进入解析器、布局流水线（layout pipeline）和 `localStorage`。
2. **导出。** 导出的交互式 HTML 与 SVG 文档会在别处被打开（浏览器、图像查看器、编辑排版软件），因此输入文档中的文件名、基因／物种标签与标注不得变成输出文档中的可执行内容。
3. **原生桥接层。** webview（桌面壳内承载前端的 Web 视图）被刻意**不**授予任何 `fs:*` capability（文件系统能力）；文件读写都要经过应用自身的 Rust 命令，即 `src-tauri/src/lib.rs`，路径校验逻辑就在其中。任何削弱"用户在原生对话框中选择的路径"与"由 Web 内容提供的路径"之间边界的做法，都属于安全缺陷。

## 受支持的版本

| 版本 | 是否受支持 |
|---|---|
| 0.1.x（当前） | ✅ |

本项目由单一维护者维护，而非由公司维护，因此修复以常规发布版本的形式提供。某个版本被更新版本取代后，不保证向后移植（back-port）。

## 报告安全漏洞

**请勿为安全问题创建公开的 issue。**

1. 优先使用 GitHub 的**私密漏洞报告（private vulnerability reporting）**：
   [Report a vulnerability](https://github.com/ZengZichao/PhyloRecViewer/security/advisories/new)。
   这需要仓库所有者已启用
   **Settings → Security → Code security and analysis → Private vulnerability reporting**。
2. 若该表单不可用，请创建一个普通 issue，其**标题只写** `security report`（不含任何细节），然后就此打住；维护者会回复并把对话转到私密渠道。
3. 请附上：应用版本与运行平台、使用的是桌面安装包还是 Web 构建版本，以及最有价值的信息——触发该问题的输入文件（或其精简后的版本）。

### 我们能承诺与不能承诺的

* 首次响应：尽快，通常在 14 天内。这是一个学术项目，没有合同意义上的 SLA。
* 在修复或缓解措施落地之前，我们不会要求你公开披露；对希望获得署名的报告者，我们会予以致谢。
* 修复可能以补丁版本发布；我们也可能发布 GitHub 安全公告，以便通知 dependabot 与使用者。

## 范围

**在范围内**

* 通过精心构造的调和文件、会话文件或自动保存文件实现的远程或本地代码执行。
* 通过导出的 HTML / SVG / PDF / NHX 文档实现的脚本注入。
* 读取或写入用户从未选择过的文件（原生对话框 / IPC 路径处理、拖放、操作系统文件关联）。
* 发布产物中的凭据或密钥泄露，包括 CI 与发布工作流。

**不在范围内**

* 加载体量极大但格式良好的文件所造成的拒绝服务（denial of service）：PhyloRecViewer 是供用户查看自己数据的桌面查看器，"喂给它一棵超大树时机器变慢"是性能反馈，而不是漏洞。（但*导致未保存会话丢失的崩溃*仍然值得报告。）
* 需要物理接触机器，或在已被攻陷的浏览器配置文件中读取用户 `localStorage` / 会话文件的攻击。
* 上游库（`fast-xml-parser`、`jspdf`、`svg2pdf.js`、Tauri 等）中的漏洞——请向上游报告，并在本仓库同时开一个普通 issue，以便本项目锁定（pin）修复版本；Tauri 自身另有[安全策略](https://www.tauri.app)。
* 由自动化扫描工具产生、却没有具体可复现用例的发现。

## 已具备的加固措施（供参考）

* webview 未被授予 `fs:*` capability；对话框由 Rust 侧处理。
* 严格的 CSP（Content Security Policy），并设置 `object-src 'none'`、`base-uri 'none'`、`frame-ancestors 'none'`。
* 打包产物中不包含生产环境的 source map。
* 原子保存（先写入临时文件，再重命名），使被中断的导出不会留下写了一半的文件。
* 会话 / 自动保存的输入在选项抵达布局与渲染引擎之前，会先经过取值钳制与净化（`sanitizeLayoutOptions`、`sanitizeRenderOptions`）。
