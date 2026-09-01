# humpk-office Word

浏览器里的 Word 文档编辑器，面向 `.docx`（Office Open XML）。打开本地文件后按页排版、编辑正文，再保存回 docx。

当前是开发中的本地演示，不是完整的 Microsoft Word 替代品。

## 功能

- **打开 / 新建 / 保存**：打开本地 `.docx`，新建空白文档，将正文导出为 `.docx`（`Ctrl/Cmd+S`）
- **分页预览**：按纸张尺寸、页边距、页眉页脚几何分页绘制
- **正文编辑**：输入、删除、撤销 / 重做，中文输入法组字
- **选区**：鼠标拖选；`Shift` + 方向键 / Home / End 扩展文字选区；表格内可矩形选格
- **字体与段落**：字体、字号、加粗 / 倾斜 / 下划线 / 删除线、字体颜色、底纹、对齐
- **表格**：读取并绘制表格与边框；Ribbon 可改框线；复制粘贴可保留子表
- **剪贴板**：剪切 / 复制 / 粘贴 / 删除（右键菜单，以及 `Ctrl/Cmd+C` / `X` / `V`），粘贴尽量保留文字样式
- **页眉页脚**：读取并按首页不同、奇偶页不同显示（当前主要是查看，不支持写入）

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

1. 打开页面后是一份空白文档，可以直接打字。
2. 点 Ribbon **打开**，选择本机 `.docx`。仓库里的 `docsample/` 可作为样张。
3. 用 Ribbon 改字体、对齐、表格框线；用右键菜单做剪切 / 复制 / 粘贴。
4. 点 **保存** 或 `Ctrl/Cmd+S` 下载当前文档。

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
