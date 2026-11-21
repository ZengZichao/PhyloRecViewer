# PhyloRecViewer 界面术语表（zh / en）

唯一用词来源（K4）。左列为概念，其后为界面唯一允许的英文/中文写法；右列为禁止使用的别名。新增文案必须查表；需要新术语时先改本表。

| 概念 | English（唯一） | 中文（唯一） | 禁止别名 |
|---|---|---|---|
| 产物 / 程序 | PhyloRecViewer | PhyloRecViewer | PhylorecViewer、PHYLORECVIEWER、phylorecviewer（除包名/文件名） |
| 调和结果 | reconciliation | 调和结果 | reco、recon（界面） |
| 基因家族 | gene family | 基因家族 | fam、cluster、gene-tree family |
| 基因树 | gene tree | 基因树 | tree（裸词） |
| 物种树 | species tree | 物种树 | species-tree、host tree |
| 嵌套第三层 | host | 宿主 | host species tree |
| 事件：物种形成 | Speciation | 物种形成 | speciation event |
| 事件：基因重复 | Duplication | 基因重复 | duplication event |
| 事件：基因丢失 | Loss | 基因丢失 | loss event |
| 事件：出枝转移 | Branching out | 出枝转移 | Transfer donor、转移供体（作事件名时）、branching-out（界面） |
| 事件：转移到达 | Transfer arrival | 转移到达 | transferBack（界面）、recipient node |
| 事件：树外分叉 | Bifurcation out | 树外分叉 | Bifurcation donor、二叉输出、二分裂、二歧 |
| 事件：现存基因 | Extant gene | 现存基因 | leaf、tip |
| 转移方向 | donor → recipient | 供体 → 受体 | destination、recip、host |
| 转移到达计数 | Transfer arrivals | 转移到达 | Incoming transfers、转入事件、arrivals（显示层） |
| 折叠的演化支 | Collapsed clade | 折叠演化支 | 分支、Collapsed（裸词）、clade（裸词） |
| 镜像显示 | Mirror / mirroring | 镜像 | swap、flip、换枝 |
| 支持度 | Support | 支持度 | Support value、支持值 |
| 置信度 | Confidence (0–1) | 置信度（0–1） | confidence（camel 裸词） |
| 时间片 | Time slice | 时间片 | timeSlice、t= |
| 用户备注 | note | 批注 | annotation（指用户备注时）、标注、信息标注、备注 |
| 批注模式 | annotation mode | 批注模式 | annotate mode（中文界面） |
| 数据注释 | annotation（文件/数据） | 注释 | 批注（用于文件数据注释时） |
| 标签 | label | 标签 | name（当指标签时） |
| 文档层级 | tab / document | 标签页 / 文档 | workspace、tab document |
| 会话 | session | 会话 | workspace（除历史文件名） |
| 载入示例 | Samples / Load sample | 示例 / 装入示例 | Load sample…、加载示例（无冒号） |
| 适应窗口 | Fit to window | 适应窗口 | Fit to view、适配视图 |
| 导出图像 | Export image (PNG / SVG / PDF) | 导出图像 | Image / page |
| 数据检查 | Data checks | 数据检查 | QC（未展开时）、Checks |
| 空值 | — | — | ?、N/A、none、unnamed、no species |
| 缺失物种行 | (no species) | （无物种） | unknown species（作为行名时） |
| 示例排序 | Top {n} of {total} species | 前 {n} / 共 {total} 个物种 | top {n} |
| 摘要 | Summary | 汇总 | Totals、Total（作分区标题时） |
| 批量重命名 | Rename labels | 批量重命名标签 | Rename Labels |
| 搜索与筛选 | Search & filter | 搜索与筛选 | 搜索过滤、检索（作面板名时） |
| 水平基因转移 | horizontal gene transfer (HGT) / transfer | 水平基因转移（HGT）/ 转移 | gene transfer（未限定水平时）、基因转移 |
| 演化支 | clade | 演化支 | 分支（指 clade 时） |
| 谱系 | lineage | 谱系 | —（定义：单条祖先→后代世代延续链，不等于“祖先 + 整棵子树”） |
| 支持类型 | support type | 支持类型 | Bootstrap、Posterior、aLRT（仅作类型名出现时） |

## 使用规则

1. 表内“唯一”列是界面、tooltip、图例、导出图共用的写法；导出物中的机器可读字段（CSV 列名、XML 标签、provenance 键）不受此表约束，但不得在人读文本中复述这些内部标识。
2. 同一概念不得因控件类型（按钮/标题/tooltip）而改变名词；动词可不同（`Rename` vs `Rename labels`）。
3. 新增事件类型时，必须同时更新本表、`src/i18n.ts` 的 `event` 映射、`src/i18nDiagnostics.ts`（若解析器会产出相关消息）与图例测试。
   “支持类型”行允许在支持度数值后以限定词形式出现 `Bootstrap`、`Posterior`、`aLRT`（如 “95 (bootstrap support)”），这不属于把 Support 改名为 bootstrap。
4. 有些行的写法列是**记号**而不是词：转移方向（`donor → recipient`）、空值（`—`）、置信度（`Confidence (0–1)` / 「置信度（0–1）」）。这些行规定的是符号本身，不参与翻译，也不受文案排版规则约束（风格指南 §2.5 的破折号与区间、§2.9 的空格都不适用于它们）；用词与样式扫描应跳过记号行，而不是把它们报成别名违规或破折号违规。
