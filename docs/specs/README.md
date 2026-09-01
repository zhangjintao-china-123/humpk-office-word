# Word / OOXML 排版规范

本地对照用，不是我们自己发明规则。处理行距、网格、字距、分页前先查这里。

## 下了哪些

| 路径 | 是什么 | 为什么有用 |
| --- | --- | --- |
| `MS-OI29500.pdf` | 微软 [MS-OI29500]：Office 对 ISO/IEC 29500 的实现说明 | **最贴近真实 Word**。标准写含糊的地方，Word 实际怎么做写在这里。 |
| `ECMA-376-1/` | ECMA-376 第 5 版 Part 1（OOXML 标记参考） | 元素/属性的准确定义：`spacing`、`docGrid`、`snapToGrid`、`pgMar` 等。 |
| `wordml/` | 同上 Part 1 里 WordprocessingML 关键条款的 HTML | 体积小、可全文检索，日常先翻这里。 |

PDF / ZIP 体积大，不进 git。补全：`./download.sh`

## 官方来源

- ECMA-376（= ISO/IEC 29500）：<https://ecma-international.org/publications-and-standards/standards/ecma-376/>
  - Part 1 zip：`https://ecma-international.org/wp-content/uploads/ECMA-376-1_5th_edition_december_2016.zip`
- [MS-OI29500]：<https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/1fd4a662-8623-49c0-82f0-18fa91b413b8>
- 在线翻 WordprocessingML：
  - <https://webapp.docx4java.org/OnlineDemo/ecma376/WordML/>
  - <https://c-rex.net/samples/ooxml/e1/Part4/OOXML_P4_DOCX_Contents_topic_ID0ES1.html>

## 排版时优先翻这些条款

`wordml/` 已下载对应 HTML：

- `spacing_1.html` / `ST_LineSpacingRule.html`：段行距。`auto` = 240 分之一行；`atLeast` / `exact` = twip
- `spacing.html`：Run 上的是**字符间距**，单位 twip，不是行距
- `docGrid.html` / `ST_DocGrid.html`：`type`（`default` / `lines` / `linesAndChars` / `snapToChars`）、`linePitch`（twip）、`charSpace`
- `snapToGrid_1.html`（段）/ `snapToGrid.html`（Run）：是否贴网格
- `pgSz.html` / `pgMar.html`：纸张与页边距。`w:header` / `w:footer` 是页眉页脚距纸边，不是 top/bottom
- `titlePg.html` / `evenAndOddHeaders.html` / `headerReference.html` / `ST_HdrFtr.html`：首页不同、奇偶页、三种页眉类型
- `hdr.html` / `ftr.html`：页眉页脚故事内容
- `ind.html`：首行/左右缩进
- `rFonts.html`、`sz.html`：字体与字号（半磅）
- `kinsoku.html` / `overflowPunct.html` / `wordWrap.html`：禁则与分行
- `adjustLineHeightInTable.html`：表格里要不要加网格行距

[MS-OI29500] 里搜：

- `docGrid` / `linePitch` / `snapToGrid`
- `spacing` / `lineRule`
- `adjustLineHeightInTable`
- East Asian / full-width

## 注意

OOXML **规定存什么**，很多排版细节（字号占几行网格、1.5 倍和网格谁大听谁）在 **MS-OI29500 + Word 实测**，标准正文不一定写全。
