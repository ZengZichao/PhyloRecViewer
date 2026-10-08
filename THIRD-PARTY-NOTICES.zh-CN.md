# 第三方声明

[English](./THIRD-PARTY-NOTICES.md) | **中文**

本文件说明 MIT [LICENSE](./LICENSE) **不**覆盖的内容：

1. 随源码归档再分发的一个第三方**数据**文件，其上游仓库未声明任何许可证（§1）；
2. 应用链接的第三方**代码**，以及为什么"以 MIT 许可证发布"并不足以描述一个安装器的
   构成（§2）；
3. 属于作者自己的随附数据，明确列出以示不在讨论范围（§3）；
4. 两项应当被写明、而不该让读者或编辑去推测的未决事项（§4）。

以下所有结论都可用给出的命令复现。字节数与哈希是直接引用的实测值，因为它们是编辑或
审稿人无需征求任何人许可即可核对的锚点。

---

## 1. `src/parser/__fixtures__/9999.nhx.xml`——第三方演示数据，授权尚在办理

### 1.1 它是什么，为什么在本仓库里

这是 NOTUNG 产出的真实 NHX/PhyloXML 调和结果，涉及 63 个现存物种。
应用程序两次使用它：作为解析器/分析测试夹具，以及作为手稿图 2 的参考案例（该图的统计
卡片就是对这个文件调用 `computeStats()` 的输出）。它是我们在源码树中识别出的唯一非作者产出的**数据**文件，也是本文件存在的
原因。仍有一处出处问题需由作者确认：`src-tauri/icons/` 中的图标集与 Tauri 脚手架
一同进入 `a65c8f3` 初始提交，提交历史无法区分它是作者自绘还是脚手架自带的占位图标；若属
后者，其自身的许可条款同样应当并入本文件。

### 1.2 出处与可供第三方固定的锚点

| 项目 | 值 |
|---|---|
| 上游仓库 | <https://github.com/WandrilleD/recPhyloXML>（Duchemin 等，2018；recPhyloXML 项目） |
| 上游路径 | `testFiles/9999.nhx.xml` |
| 上游提交锚点（默认分支 `master` 的 HEAD） | `8c6b2849e219923b9e5da21df4483466724b09c2`——作者时间 2021-01-08T08:27:44Z，提交信息 *"python converter from NOTUNG to xml : proper handling of events following a transferBack"*；仓库 `pushed_at` 2021-01-08T08:28:09Z |
| 上游 git blob id | `93e85800837ccd02277421090efc668110e629fb` |
| 上游文件 | **22,307 字节**，SHA-256 `972579ea48696152c8b0d2ca7b49ab0c707bbef73b9924b8271b1051fe2063a8` |
| 本仓库归档副本 | **22,321 字节**，SHA-256 `fd7ebfc5190268d45cda867440c31d4ca6fdd8f40d672cb186f8d0d8d9ecde34` |
| 复制/最后落盘时间 | 2026-09-25 |
| 2026-10-08 经 GitHub API 复核 | blob id、字节数、提交锚点均未变化；上游自 2021-01-08 起无新提交 |

自行核对（只读，除一次公开 API 请求外不需要任何凭据）：

```bash
shasum -a 256 src/parser/__fixtures__/9999.nhx.xml            # fd7ebfc5…de34，22,321 B
git hash-object src/parser/__fixtures__/9999.nhx.xml          # 与上游 blob 不同：见 1.3 的一处改动
gh api repos/WandrilleD/recPhyloXML/contents/testFiles/9999.nhx.xml \
   --jq '{sha, size}'                                        # 93e85800…，22307
gh api repos/WandrilleD/recPhyloXML/branches/master \
   --jq '.commit.sha, .commit.commit.author.date'             # 8c6b2849…，2021-01-08T08:27:44Z
gh api repos/WandrilleD/recPhyloXML --jq .license             # null → 见 1.4
```

用 `xml.etree.ElementTree` 对本仓库副本重新计数的结果：物种 clade 共 125 个，其中
63 个为物种末端叶；`<recGeneTree>` 恰 1 个（单基因家族）；基因节点 23 个，其中末端叶
12 个；记录的事件为 `speciation` 7、`duplication` 4、`loss` 6、`leaf` 6，且不含任何
转移事件——这是一份只做重复/丢失的调和结果。

### 1.3 唯一的一处改动：14 个字节，以及为什么必须改

归档副本与上游只差一行，即物种树开头那个 `<phylogeny>` 元素：

```diff
     <recPhylo>
       <spTree>
-        <phylogeny>
+        <phylogeny rooted="true">
```

`diff` 只报出一行变化（`grep -c '^[<>]'` → 2，即一行删除、一行新增），文件其余部分完全
一致。字节差的算术是 1 个前导空格加上 `rooted="true"` 的 13 字节：
`22,307 + 14 = 22,321`。

为什么需要这一改动：文件里有**两个** `<phylogeny>` 元素——`<spTree>` 下的物种树与
`<recGeneTree>` 下的基因树——上游在基因树那个元素上已带 `rooted="true"`，只在物种树
那个元素上缺失。而两份模式都把这个属性声明为必填
（`xsd/recSpeciesTreeXML.xsd:47` 与 `xsd/recGeneTreeXML.xsd:46`，
`<xsd:attribute name="rooted" type="xsd:boolean" use="required"/>`，并注释说明与调和树
关联的物种树必定是有根的）。因此未经修改的上游文件不符合模式，应用自身的数据检查会
拒绝这个用来演示这些检查的文件。新增的属性只是陈述了上游作者在自己的基因树元素上已经
陈述的事实，不改变任何拓扑、名称、注释或事件。

归档副本刻意**没有**就地加注说明：手稿引用了它的字节数与 SHA-256，若在 XML 里加一段
头注释，审稿人要核对的那两个数字就会失效。出处信息因此写在本文件里，
`docs/USER_MANUAL.md` 第 15 节指向此处。

### 1.4 许可证状态，以及两种收口方式

* 上游仓库**完全没有声明许可证**：GitHub API 返回 `license: null`，且上述提交下的仓库
  根目录只有 `README.md cpp python python3 recPhyloXML-Bioinformatics.pdf testFiles xsd`，
  没有 `LICENSE`、`COPYING` 或任何等价文件。recPhyloXML 的论文与项目页面分发这些测试
  文件，但"分发"不等于"授权他人再分发"。
* **正在向权利持有人申请授权**（Wandrille Duchemin 与 recPhyloXML 项目作者），请求允许
  在本仓库的 MIT 许可证下再分发该文件并注明出处。在该授权正式存档到编辑部之前，本仓库
  的 MIT 许可证不覆盖 §1 这个文件，任何"稿件全部材料均已在许可下公开可得"的说法都会
  强于已知事实。本文件就是记录这个缺口的位置。
* **备选方案**（若授权未获批准）：以许可证清晰的等价文件替换该夹具——要么由作者生成一份
  合成 NHX/PhyloXML 调和结果（`scripts/measure.ts` 里已有用固定种子确定性生成合成调和树
  的做法），要么改用明确声明了数据许可证的来源。替换件必须保持手稿为该文件引用的量
  （63 个物种叶、125 个物种 clade、单基因家族、23 个基因节点、12 个基因叶、无转移事件），
  并能复现图 2 的统计卡片；届时 §1.2 中的字节数、SHA-256 与出处一并替换。
* **备选方案无法撤销的一件事**：版本 DOI `10.5281/zenodo.23053318` 归档的是提交
  `a65c8f3`（标签 `v0.1.0`），那份不可变快照里已经含有这份 22,321 字节的副本。替换件只能
  出现在概念 DOI `10.5281/zenodo.23053317` 之下的**后续版本**中，v0.1.0 归档无法修改。

---

## 2. 第三方代码，以及安装器的实际构成

应用自身的代码以 MIT 许可证写作，但编译出的二进制并不只含本仓库的代码：它静态链接了一
整个依赖树，其中若干组件的许可证是 Apache-2.0 或 ISC。因此"以 MIT 许可证发布"描述的是
*源码*，而不是 `.dmg` / `.msi` / `.AppImage` 的内容。

用已提交的 `package-lock.json` 与 `npm ls --prod --all --parseable` 统计，随附发布的
运行时依赖树为 **49 个包**。直接从已安装树中读出的直接依赖（版本以锁文件解析结果为准）：

| 包 | 解析版本 | 许可证 |
|---|---|---|
| `react`、`react-dom` | 18.3.1 | MIT |
| `zustand` | 4.5.7 | MIT |
| `fast-xml-parser`（含其 `strnum`） | 4.5.7 | MIT |
| `jspdf` | 2.5.2 | MIT |
| `svg2pdf.js` | 2.7.0 | MIT |
| `d3-selection`、`d3-zoom`（含 `d3-*` 闭包） | 3.0.0 | ISC |
| `@tauri-apps/api` | 2.11.1 | Apache-2.0 OR MIT |
| `@tauri-apps/plugin-dialog` | 2.7.2 | MIT OR Apache-2.0 |

该依赖树中有两个包带**双重**许可证，本文件明确记录采用的是哪一选项，而不留给读者猜：

* `dompurify@2.5.9`（经 `jspdf`）——`(MPL-2.0 OR Apache-2.0)`，按 **Apache-2.0** 选项采用，
  因此 MPL 的文件级条款不附加到发布物上；
* `rgbcolor@1.0.1`（经 `canvg` ← `jspdf`）——`MIT OR SEE LICENSE IN FEEL-FREE.md`，
  按 **MIT** 选项采用。

其余以 MIT 为主，其中 `@babel/runtime` 与 `core-js` 为 Apache-2.0、`cssesc` 为 ISC。
对所有已安装 `package.json`（360 个，`node_modules/**/package.json`）的许可证字段扫描
显示**没有 GPL / AGPL / LGPL / SSPL / EPL / CPOL / 非商业条款**；两个需要点名的条目只在
构建期出现、不进入发布物——`caniuse-lite@1.0.30001806`（CC-BY-4.0，经 `browserslist`）
与 `argparse@2.0.1`（Python-2.0）。复现扫描：

```bash
npm ls --prod --all --parseable | sed 's#.*/node_modules/##' | sort -u   # 实际发布的依赖闭包
npx --yes license-checker --production --summary                          # 同一闭包的许可证清单
```

**本次未能核验、并已记为未决事项的部分**：Rust 侧。`src-tauri/Cargo.lock` 固定了 433 个
`[[package]]` 条目，但 Cargo 锁文件不记录许可证字段，因此逐 crate 的许可证报告需要
crates.io 索引，无法只靠已提交内容离线生成。分发二进制前请用
`cargo install cargo-about` 与 `cargo about generate <template.hbs>` 生成；Tauri 的构建
输出可以把生成的声明文件一并嵌入。

在 Linux 上，桌面版还会链接系统的 WebKitGTK / GTK / GLib 栈。这些由发行版本身提供
（GNU LGPL 以及 BSD/MIT 类条款），不由本仓库再分发，也正是文档把 Linux 前提写成
"WebKitGTK 4.1+"而不是"自带运行时"的原因。

---

## 3. 属于作者自己的随附数据

以下文件没有任何第三方权利主张，它们与仓库其余部分一样受 MIT 许可证覆盖：

* `src/samples/` 下的六份演示调和结果（`showcase`、`all-events`、三层演示的
  `nested-*` 一对，以及 `compare-tool-a` / `compare-tool-b` 一对）；
* `src/parser/__fixtures__/conformant-minimal.recphyloxml`（2,380 字节），其自带的头部
  注释就说明这是一份手写的、严格符合模式的最小文档，用于钉住解析器读取
  recGeneTreeXML / recSpeciesTreeXML 一致方言的方式。

---

## 4. 未决事项

| # | 事项 | 状态 | 记录位置 |
|---|---|---|---|
| 1 | 再分发 `9999.nhx.xml` 的书面授权（§1.4） | 已申请，尚未存档 | 本文件；稿件 Data availability 段 |
| 2 | 若授权被拒，用许可证清晰的等价文件替换夹具 | 方案已记录，未开始 | §1.4 |
| 3 | 手稿正图的 PDF 内嵌已子集化的 TrueType 字形程序（HelveticaNeue，Apple/Monotype 授权）——2026-10-08 实测七份 PDF 共 25 个，稿件补充说明 Note S6.2 引用的即此数；这些载体若要再分发，需要改用可自由再分发的字体（如 Arimo / Liberation Sans）或由出版商代为处理字体 | 未决；绘图流水线尚未进入本仓库；该数字来自仍在进行的图件重建 | `figures/README.md`、`docs/FIGURE_REPRODUCTION.md` |
| 4 | 把绘图脚本导入 `figures/`，使"作者产出的全部材料均已版本控制"这句话对图件同样成立 | 待办（修订中另有人在处理） | `figures/README.md` |
| 5 | 为 `src-tauri/Cargo.lock` 的 433 个条目生成逐 crate 许可证报告（§2）——离线不可得 | 未决；分发二进制前需要 | §2 |

*最近一次复核：2026-10-08，对应同一天的稿件修订。*
