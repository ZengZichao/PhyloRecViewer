import type { Locale } from "./i18n";

/**
 * Display-layer translations for the English diagnostics produced by the
 * parsers, the session reader and the exporters. The parsers stay locale-free
 * on purpose: their output is the machine-readable canonical form that tests,
 * the QC report and exported files rely on. The UI localises on the way out.
 *
 * Each rule matches one canonical message; `zh` may use $1..$n.
 */
type Rule = { re: RegExp; zh: string };

const RULES: Rule[] = [
  // ---- recPhyloXML ----
  {
    re: /^The file is empty \(no recPhyloXML content\)\.$/,
    zh: "文件为空（没有 recPhyloXML 内容）。",
  },
  {
    re: /^The file declares a <!DOCTYPE> with a DTD\.[\s\S]*$/,
    zh: "文件声明了带 DTD 的 <!DOCTYPE>。recPhyloXML 不使用 DTD，且 DTD 实体扩展是已知的 XML 攻击途径，因此未解析该文件。请删除 DOCTYPE 声明后重试。",
  },
  {
    re: /^No <recPhylo> root element was found\.[\s\S]*$/,
    zh: "未找到 <recPhylo> 根元素，此文件不像 recPhyloXML；如果它是 Newick/NHX 树，请以 .nwk/.nhx 扩展名保存，或添加 [&&NHX:S=…] 标注。",
  },
  {
    re: /^The species tree declares rooted="false"[\s\S]*$/,
    zh: '物种树声明 rooted="false"，但调和树必须有根：PhyloRecViewer 无法绘制无根树。请重新为物种树定根（recPhyloXML 架构要求 rooted="true"）。',
  },
  {
    re: /^The gene tree "(.+?)" declares rooted="false"[\s\S]*$/,
    zh: '基因树 "$1" 声明 rooted="false"，但调和树必须有根：PhyloRecViewer 无法绘制无根树。请重新为该基因树定根（recPhyloXML 架构要求 rooted="true"）。',
  },
  {
    re: /^Species tree \(<spTree>\) has no clades\.$/,
    zh: "物种树（<spTree>）不含任何分支。",
  },
  {
    re: /^Species tree contains duplicate species names; references resolve to the first occurrence\.$/,
    zh: "物种树含重复的物种名；引用将解析到首次出现者。",
  },
  {
    re: /^No reconciled gene trees \(<recGeneTree>\) were found\.$/,
    zh: "未找到已调和的基因树（<recGeneTree>）。",
  },
  {
    re: /^Species tree is nested too deep \(possible malformed input\)\.$/,
    zh: "物种树嵌套过深（可能是畸形输入）。",
  },
  {
    re: /^Gene tree is nested too deep \(possible malformed input\)\.$/,
    zh: "基因树嵌套过深（可能是畸形输入）。",
  },
  {
    re: /^The document declares the XML namespace "(.+?)" instead of the recPhyloXML namespace "http:\/\/www\.recg\.org"; parsing proceeded, but this may not be a recPhyloXML file\.$/,
    zh: '文档声明的 XML 命名空间为 "$1"，而非 recPhyloXML 的 "http://www.recg.org"；已继续解析，但这可能不是 recPhyloXML 文件。',
  },
  {
    re: /^Species tree \(<spTree>\) contains (\d+) <phylogeny> elements; only the first is used\.$/,
    zh: "物种树（<spTree>）含 $1 个 <phylogeny> 元素；仅使用第一个。",
  },
  {
    re: /^Species tree contains (\d+) root <clade> elements; only the first is used\.$/,
    zh: "物种树含 $1 个根 <clade> 元素；仅使用第一个。",
  },
  {
    re: /^Gene tree phylogeny contains (\d+) root <clade> elements; only the first is used\.$/,
    zh: "基因树 phylogeny 含 $1 个根 <clade> 元素；仅使用第一个。",
  },
  {
    re: /^The species tree <phylogeny> omits the schema-required rooted="true" attribute; assuming a rooted tree\.$/,
    zh: '物种树 <phylogeny> 缺少架构要求的 rooted="true" 属性；按有根树处理。',
  },
  {
    re: /^(\d+) gene tree <phylogeny> element\(s\) omit the schema-required rooted="true" attribute; assuming rooted trees\.$/,
    zh: '$1 个基因树 <phylogeny> 元素缺少架构要求的 rooted="true" 属性；按有根树处理。',
  },
  {
    re: /^Species "(.+?)" declares a negative branch length \((.+?)\); it is clamped to 0 for drawing\.$/,
    zh: '物种 "$1" 声明了负枝长（$2）；绘图时按 0 处理。',
  },
  {
    re: /^Species "(.+?)" carries support (.+?), which looks like a 0-100 percentage rather than a 0-1 probability\.$/,
    zh: '物种 "$1" 携带支持度 $2，看起来是 0–100 百分比而非 0–1 概率。',
  },
  {
    re: /^Gene node "(.+?)" carries (\d+) <transferBack> arrivals;[\s\S]*$/,
    zh: '基因节点 "$1" 含 $2 个 <transferBack> 到达事件；节点的物种与 NHX 导出使用第一个（$3）。',
  },
  {
    re: /^Gene node "(.+?)" carries multiple terminal events \((.+?) \+ (.+?)\); keeping "(.+?)"\.$/,
    zh: '基因节点 "$1" 含多个终止事件（$2 + $3）；保留 "$4"。',
  },
  {
    re: /^Gene node "(.+?)" has an unrecognised <eventsRec> child "(.+?)"([\s\S]*)$/,
    zh: '基因节点 "$1" 含无法识别的 <eventsRec> 子元素 "$2"$3（recPhyloXML 事件名区分大小写）；未按事件读取，因此该节点的事件列表可能不完整。',
  },
  {
    re: /^Gene node "(.+?)" has (\d+) <eventsRec> blocks; using the first\.$/,
    zh: '基因节点 "$1" 含 $2 个 <eventsRec> 块；使用第一个。',
  },
  {
    re: /^Gene node "(.+?)" has no terminal event; treated as a leaf\.$/,
    zh: '基因节点 "$1" 无终止事件；按叶节点处理。',
  },
  {
    re: /^Gene node "(.+?)" declares conflicting arrival species:[\s\S]*$/,
    zh: '基因节点 "$1" 声明了冲突的到达物种：<transferBack destinationSpecies="$2"/> 与终止事件的 speciesLocation="$3" 不一致；节点及其转移边置于 "$4"。',
  },
  {
    re: /^Gene node "(.+?)" references unknown species "(.+?)"\.$/,
    zh: '基因节点 "$1" 引用了未知物种 "$2"。',
  },
  {
    re: /^Gene node "(.+?)" carries support (.+?), which looks like a 0-100 percentage rather than a 0-1 probability\.$/,
    zh: '基因节点 "$1" 携带支持度 $2，看起来是 0–100 百分比而非 0–1 概率。',
  },
  {
    re: /^Gene node "(.+?)" declares a negative branch length \((.+?)\); it is clamped to 0 for drawing\.$/,
    zh: '基因节点 "$1" 声明了负枝长（$2）；绘图时按 0 处理。',
  },
  {
    re: /^Clade "(.+?)" carries a <(.+?)> element this reader does not interpret; its content was not imported\.$/,
    zh: '分支 "$1" 含本读取器无法解析的 <$2> 元素；其内容未导入。',
  },
  {
    re: /^The tree is nested more deeply than this version supports \(up to about (\d+) clade levels\): ([\s\S]+)$/,
    zh: "树嵌套深度超过本版本支持（约 $1 层分支）：$2",
  },
  {
    re: /^XML could not be parsed \(is this well-formed recPhyloXML\?\): ([\s\S]+)$/,
    zh: "XML 解析失败（是否为格式良好的 recPhyloXML？）：$1",
  },

  // ---- NHX ----
  {
    re: /^Gene node "(.+?)" carries conflicting event tags \((.+?)\); keeping "(.+?)"[\s\S]*$/,
    zh: '基因节点 "$1" 携带冲突的事件标签（$2）；保留 "$3"（与 recPhyloXML 相同的优先级）。',
  },
  {
    re: /^Gene node "(.+?)" is a terminal Newick leaf but carries an internal-event tag; it is kept as a (.+?) \(an upstream tool may have pruned it\)\.$/,
    zh: '基因节点 "$1" 是 Newick 末端叶，却携带内部事件标签；仍按 $2 处理（上游工具可能已剪枝）。',
  },
  {
    re: /^Gene node "(.+?)" has an NHX comment fragment with no key \("(.+?)"\);[\s\S]*$/,
    zh: '基因节点 "$1" 的 NHX 注释含无键片段（"$2"）；未解码，因此其标注的内容在本调和结果中缺失。',
  },
  {
    re: /^Gene node "(.+?)" is an internal node with a single child;[\s\S]*$/,
    zh: '基因节点 "$1" 是只有一个子节点的内部节点；按物种形成处理，但通常意味着树被重新定根或折叠过。',
  },
  {
    re: /^Gene node "(.+?)" declares both BL=(.+?) and a Newick branch length \(:(.+?)\);[\s\S]*$/,
    zh: '基因节点 "$1" 同时声明 BL=$2 与 Newick 枝长（:$3）；两者不一致，保留 BL=$2。',
  },
  {
    re: /^An internal node label \("(.+?)"\) was interpreted as a statistical support value, not a gene name;[\s\S]*$/,
    zh: '内部节点标签（"$1"）被解释为统计支持值而非基因名；若它确实是名称，请添加 S=/D= 标签或改用 recPhyloXML 导出。',
  },
  {
    re: /^No Newick\/NHX tree was found in this file\.$/,
    zh: "此文件中未找到 Newick/NHX 树。",
  },
  {
    re: /^This Newick\/NHX tree is marked unrooted \(\[&U\]\)\.[\s\S]*$/,
    zh: "该 Newick/NHX 树标记为无根（[&U]）。调和需要带根的基因树：请重新定根（外群或中点）后重新导出，或在树确有根时移除 [&U] 标记。",
  },
  {
    re: /^This NHX file uses (\d+) tag key\(s\) this reader does not interpret and has dropped: ([\s\S]+)$/,
    zh: "此 NHX 文件使用了 $1 个本读取器不解释并已丢弃的标签：$2",
  },
  {
    re: /^This NHX file carries no L=, BO=, BC= or TB= markers,[\s\S]*$/,
    zh: "此 NHX 文件不含 L=、BO=、BC= 或 TB= 标记，因此无法表示丢失或水平转移：未标注的末端节点按基因叶处理，未标注的内部节点按物种形成处理。若调和结果含丢失或转移，请改用 recPhyloXML 导出，或补上这些标记。",
  },
  {
    re: /^This NHX file carries no event markers at all \(no D=, L=, BO=, BC= or TB=\)[\s\S]*$/,
    zh: "此 NHX 文件不含任何事件标记（无 D=、L=、BO=、BC= 或 TB=）；所有内部节点按物种形成、所有末端节点按基因叶读取。来自重复/丢失工具的调和 NHX 至少需要 D=，丢失与转移还需要 L=/BO=/BC=/TB=。",
  },
  {
    re: /^NHX internal nodes lack species \(S=\) annotations,[\s\S]*$/,
    zh: "NHX 内部节点缺少物种（S=）标注，无法从该文件重建物种树。请为每个内部节点添加 S=<物种> 标签，先载入物种树（文件 → 载入物种树（Newick）…）再打开基因树，或将调和结果导出为 recPhyloXML。",
  },
  {
    re: /^Species tree taken from the separately provided file;[\s\S]*$/,
    zh: "物种树取自单独提供的文件；无 S= 的 NHX 内部节点解析为无物种。",
  },
  {
    re: /^Species "(.+?)" is annotated under conflicting parents \("(.+?)" and "(.+?)"\); kept "(.+?)"[\s\S]*$/,
    zh: '物种 "$1" 被标注在冲突的父节点下（"$2" 与 "$3"）；保留 "$4"。NHX 格式并不总能区分垂直祖先与未标注的水平转移，因此重建的物种树可能与真实树不同。',
  },
  {
    re: /^No species \(S=\) annotations found in the NHX file\.$/,
    zh: "NHX 文件中未找到物种（S=）标注。",
  },
  {
    re: /^Species "(.+?)" cannot be attached to the species tree \(disconnected annotations\);[\s\S]*$/,
    zh: '物种 "$1" 无法挂接到物种树（标注不连通）；置于其中的基因节点将被报告为未知物种。',
  },
  {
    re: /^Gene node references unknown species "(.+?)"\.$/,
    zh: '基因节点引用了未知物种 "$1"。',
  },
  {
    re: /^Species tree reconstructed from NHX species \(S=\) annotations;[\s\S]*$/,
    zh: "物种树由 NHX 物种（S=）标注重建；TB= 所载的水平转移已排除在祖先关系之外。若文件还含有不带 TB= 标记的 HGT，请在每个转移到达处补 TB= 标注（或改用 recPhyloXML）后重新导出，因为此处无法把未标注的转移与物种形成区分开。",
  },
  {
    re: /^Species tree is nested too deep\.$/,
    zh: "物种树嵌套过深。",
  },

  // ---- Newick ----
  {
    re: /^Newick nesting is too deep \(possible malformed input\)\.$/,
    zh: "Newick 嵌套过深（可能是畸形输入）。",
  },
  {
    re: /^Newick has too many nodes \(possible malformed input\)\.$/,
    zh: "Newick 节点过多（可能是畸形输入）。",
  },
  {
    re: /^Unbalanced parentheses in Newick([\s\S]*)$/,
    zh: "Newick 括号不配对$1",
  },
  {
    re: /^Malformed Newick \(parser made no progress\)([\s\S]*)$/,
    zh: "Newick 格式错误（解析器未取得进展）$1",
  },
  {
    re: /^Too many trees in one file \(> (\d+)\); aborting rather than silently dropping the rest\.$/,
    zh: "单文件树过多（> $1）；已中止，以免静默丢弃其余树。",
  },

  // ---- species tree file ----
  {
    re: /^The species tree is not valid Newick: ([\s\S]+)$/,
    zh: "物种树不是有效的 Newick：$1",
  },
  {
    re: /^The species tree file contains no tree\.$/,
    zh: "物种树文件不含任何树。",
  },

  // ---- merged input ----
  {
    re: /^No files to load\.$/,
    zh: "没有要载入的文件。",
  },
  {
    re: /^(\d+) species referenced by merged families are absent from the first file's species tree\.$/,
    zh: "合并家族引用的 $1 个物种不在首个文件的物种树中。",
  },
  {
    re: /^(.+?): its species tree has (\d+) branch\(es\) that differ from the first file's species tree;[\s\S]*$/,
    zh: "$1：其物种树有 $2 个分支与首个文件不同；合并视图仅绘制在首个文件的物种树上。",
  },
  {
    re: /^(.+?): its species tree is missing (\d+) branch\(es\) present in the first file's species tree[\s\S]*$/,
    zh: "$1：其物种树缺少首个文件物种树中的 $2 个分支；合并视图仅绘制在首个文件的物种树上。",
  },
  {
    re: /^This file does not appear to be UTF-8 text \(it contains NUL bytes,[\s\S]*$/,
    zh: "此文件不像 UTF-8 文本（含 NUL 字节，UTF-16 文件按 UTF-8 解码时即如此）。请重新导出为 UTF-8 后重试。",
  },
  {
    re: /^The XML declaration says encoding="(.+?)" but the file was decoded as UTF-8\.[\s\S]*$/,
    zh: 'XML 声明为 encoding="$1"，但文件按 UTF-8 解码。不支持非 UTF-8 文件（如 $1）；请另存为 UTF-8。',
  },
  {
    re: /^This file could not be decoded as UTF-8 \(it starts with a replacement character\)\.[\s\S]*$/,
    zh: "此文件无法按 UTF-8 解码（以替换字符开头）。请另存为 UTF-8。",
  },

  // ---- session ----
  { re: /^Session file is not valid JSON$/, zh: "会话文件不是有效的 JSON。" },
  { re: /^Not a PhyloRecViewer session file$/, zh: "不是 PhyloRecViewer 会话文件。" },
  {
    re: /^This session was created by a newer version of PhyloRecViewer \(v(.+?)\); please update to open it\.$/,
    zh: "此会话由较新版本的 PhyloRecViewer（v$1）创建；请更新后再打开。",
  },

  // ---- exporters ----
  { re: /^Failed to rasterize SVG$/, zh: "SVG 栅格化失败。" },
  { re: /^Canvas 2D context unavailable$/, zh: "无法获取 Canvas 2D 上下文。" },
  { re: /^Failed to encode PNG$/, zh: "PNG 编码失败。" },

  // ---- NHX export disclosure ----
  {
    re: /^(\d+) node\(s\) carry multiple transfer arrivals; only the first can be written to NHX$/,
    zh: "$1 个节点携带多个转移到达事件；NHX 只能写入第一个。",
  },
  {
    re: /^(\d+) timeSlice value\(s\) are not representable in NHX$/,
    zh: "$1 个时间片（timeSlice）值无法在 NHX 中表示。",
  },
  {
    re: /^(\d+) event confidence value\(s\) are not representable in NHX$/,
    zh: "$1 个事件置信度无法在 NHX 中表示。",
  },
  {
    re: /^(\d+) species tree taxa are not sampled by any gene tree and would disappear from the NHX species reconstruction$/,
    zh: "物种树中有 $1 个分类单元未被任何基因树采样，将在 NHX 物种重建中消失。",
  },
  {
    re: /^(\d+) species branch length\(s\) are not carried by the NHX species tree$/,
    zh: "$1 个物种枝长未被 NHX 物种树保留。",
  },
  {
    re: /^(\d+) gene tree name\(s\) are not written to NHX$/,
    zh: "$1 个基因树名称未写入 NHX。",
  },
];

const NEWICK_HEADS: [RegExp, string][] = [
  [/^Unterminated node comment \(missing "\]" \)/, "节点注释未闭合（缺少 \"]\"）"],
  [/^Unbalanced parentheses in Newick/, "Newick 括号不配对"],
  [/^Malformed Newick \(parser made no progress\)/, "Newick 格式错误（解析器未取得进展）"],
];

/** Newick errors carry an "(at offset N, near \"…\")" tail; translate it too. */
function localizeNewick(raw: string): string | null {
  for (const [re, zh] of NEWICK_HEADS) {
    if (!re.test(raw)) continue;
    return raw
      .replace(re, zh)
      .replace(/\(at offset (\d+)/, "（偏移 $1")
      .replace(/\(end of input\)/, "（输入结束）")
      .replace(/, near "/, '，附近 "')
      .replace(/\)\.$/, "）。");
  }
  return null;
}

/** Translate one canonical diagnostic for display; unknown text passes through. */
export function localizeDiagnostic(raw: string, locale: Locale): string {
  if (locale !== "zh") return raw;
  const newick = localizeNewick(raw);
  if (newick) return newick;
  for (const { re, zh } of RULES) {
    if (re.test(raw)) return raw.replace(re, zh);
  }
  return raw;
}

/** Translate the compact "example cell" strings built by the validator. */
export function localizeExample(raw: string, locale: Locale): string {
  if (locale !== "zh") return raw;
  return raw
    .replace(/\(unnamed\)/g, "（未命名）")
    .replace(/ @depth /g, "，深度 ")
    .replace(/: timeSlice /g, "：时间片 ")
    .replace(/: confidence /g, "：置信度 ")
    .replace(/: branch /g, "：枝长 ")
    .replace(/\(into ancestor (.+?)\)/g, "（进入祖先 $1）")
    .replace(/\(timeSlice (.+?) < (.+?)\)/g, "（时间片 $1 < $2）");
}
