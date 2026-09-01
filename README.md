# humpk-office Word

浏览器里的 Word 文档查看与编辑器，面向 `.docx`（Office Open XML）。打开本地文件后按页排版绘制，再在画布上做有限编辑。

当前阶段**浏览能力强于编辑**：打开常见公文、论文类 docx 后，纸张、分页、页眉页脚、表格和浮动图的观感更接近 Word。编辑与写回仍在补。不是完整的 Microsoft Word 替代品。

## 浏览

打开 `.docx` 后在浏览器里按页预览，排版尽量跟着 OOXML / Word 实现（对照 [`docs/specs`](docs/specs/README.md)）。

- **整页预览**：按节属性里的纸张尺寸、页边距分页，多页纵向铺开，可滚动查看
- **页眉页脚**：读取首页不同（`titlePg`）、奇偶页不同（`evenAndOddHeaders`），缺省时按节继承；正文顶/底按 `pgMar` 的 top/bottom 与距纸边 header/footer、页眉页脚内容高度计算
- **中文排版**：中西文混排加间隔；行尾全角标点可压缩；文档网格（`docGrid` / `snapToGrid`）约束行高；段前段后、多倍 / 最小值 / 固定行距；孤行控制
- **文字样式**：`styles.xml` 样式继承；中英文字体分流（ascii / eastAsia / hAnsi）；字号、加粗、倾斜、下划线、删除线、颜色、底纹、对齐、首行/左右缩进
- **列表编号**：读取 `numbering.xml`，显示多级编号与项目符号
- **表格**：列宽、单元格内容排版、跨行跨列合并、按行拆到下一页；表级 / 单元格边框（无显式边框时回退 Table Grid 细黑线）
- **图片**：嵌入式图片；浮动图按锚点定位，支持四周型 / 紧密型 / 穿越型 / 上下型等绕排
- **样张**：仓库 `docsample/` 可直接打开对照

浏览不做的事：PAGE 等域不按真实页码刷新；复杂 SmartArt / 公式 / 批注等未覆盖。

## 编辑

- **打开 / 新建 / 保存**：打开本地 `.docx`，新建空白文档，将**正文**导出为 `.docx`（`Ctrl/Cmd+S`）
- **正文输入**：输入、删除、撤销 / 重做，中文输入法组字
- **选区**：鼠标拖选；`Shift` + 方向键 / Home / End 扩展文字选区；表格内可矩形选格
- **格式**：Ribbon 改字体、字号、加粗 / 倾斜 / 下划线 / 删除线、颜色、底纹、对齐；表格可选框线
- **剪贴板**：剪切 / 复制 / 粘贴 / 删除（右键菜单，以及 `Ctrl/Cmd+C` / `X` / `V`）；内部剪贴板尽量保留文字样式和子表

## 环境

- Node.js 20 或更高
- npm

## 安装与运行

```bash
git clone https://github.com/zhangjintao-china-123/humpk-office-word.git
cd humpk-office-word
npm install
npm run dev
```

终端会打印本地地址，一般是 `http://127.0.0.1:5173/`。若 5173 已被占用，Vite 会改用下一个端口（例如 `5174`）。用浏览器打开该地址即可。

### 其他命令

```bash
npm test          # 跑一遍单元测试
npm run test:watch
npm run build     # 类型检查并打包
```

## 怎么用

1. 点 Ribbon **打开**，选择本机 `.docx`（`docsample/` 里有样张）。先滚动看分页、页眉页脚、表格和图片。
2. 需要改字时再点进正文编辑；Ribbon 改字体、对齐、表格框线；右键做剪切 / 复制 / 粘贴。
3. 点 **保存** 或 `Ctrl/Cmd+S` 下载当前文档（目前只写回正文）。
4. 点 **新建** 得到空白文档。

常用快捷键：

| 操作 | Windows / Linux | macOS |
| --- | --- | --- |
| 撤销 / 重做 | `Ctrl+Z` / `Ctrl+Y` | `Cmd+Z` / `Cmd+Y` |
| 剪切 / 复制 / 粘贴 | `Ctrl+X` / `C` / `V` | `Cmd+X` / `C` / `V` |
| 保存 | `Ctrl+S` | `Cmd+S` |
| 加粗 / 倾斜 / 下划线 | `Ctrl+B` / `I` / `U` | `Cmd+B` / `I` / `U` |

## 当前限制

- 保存只写回正文，页眉页脚、部分表格边框等尚未完整写回
- 系统剪贴板目前带纯文本；带样式的复制粘贴主要走编辑器内部剪贴板
- 未做插删行列、单元格合并拆分、PAGE 域、双击进入页眉编辑

排版对照规范见 [`docs/specs/README.md`](docs/specs/README.md)。
