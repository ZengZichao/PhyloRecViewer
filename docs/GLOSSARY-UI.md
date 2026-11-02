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
| 事件：转移供体 | Transfer donor | 转移供体 | Transfer (donor)、branching-out |
| 事件：转移到达 | Transfer arrival | 转移到达 | Transfer (arrival)、recipient node |
| 事件：二叉输出 | Bifurcation donor | 二叉输出 | Bifurcation、Bifurcation out、树外分叉、二分裂、二歧 |
| 事件：现存基因 | Extant gene | 现存基因 | leaf、tip |
| 转移方向 | donor → recipient | 供体 → 受体 | destination、recip、host |
| 转移计数 | Incoming transfers | 转入事件 | arrivals（显示层） |
| 折叠的演化支 | Collapsed clade | 折叠分支 | Collapsed（裸词）、clade（裸词） |
| 镜像显示 | Mirror / mirroring | 镜像 | swap、flip、换枝 |
| 支持度 | Support | 支持度 | bootstrap/posterior/alrt（原样枚举） |
| 置信度 | Confidence (0–1) | 置信度（0–1） | confidence（camel 裸词） |
| 时间片 | Time slice | 时间片 | timeSlice、t= |
| 批注 | note / annotation（集合） | 批注 | 标注、信息标注、备注 |
| 批注模式 | annotation mode | 批注模式 | annotate mode（中文界面） |
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

## 使用规则

1. 表内“唯一”列是界面、tooltip、图例、导出图共用的写法；导出物中的机器可读字段（CSV 列名、XML 标签、provenance 键）不受此表约束，但不得在人读文本中复述这些内部标识。
2. 同一概念不得因控件类型（按钮/标题/tooltip）而改变名词；动词可不同（`Rename` vs `Rename labels`）。
3. 新增事件类型时，必须同时更新本表、`src/i18n.ts` 的 `event` 映射、`src/i18nDiagnostics.ts`（若解析器会产出相关消息）与图例测试。
