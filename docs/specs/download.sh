#!/bin/sh
set -e
cd "$(dirname "$0")"

echo "下载 [MS-OI29500]（Word 对 OOXML 的实现说明）…"
curl -L --fail --retry 5 --retry-delay 2 -o "MS-OI29500.pdf" \
  "https://officeprotocoldocs-f5hpbjgea6b8gneq.b02.azurefd.net/files/MS-OI29500/%5bMS-OI29500%5d.pdf"

echo "下载 ECMA-376 Part 1（OOXML 标记参考，约 41 MB）…"
curl -L --fail --retry 5 --retry-delay 2 -o "ECMA-376-1.zip" \
  "https://ecma-international.org/wp-content/uploads/ECMA-376-1_5th_edition_december_2016.zip"

echo "解压 Part 1…"
rm -rf "ECMA-376-1"
mkdir -p "ECMA-376-1"
unzip -o -q "ECMA-376-1.zip" -d "ECMA-376-1"

echo "下载 WordprocessingML 关键条款 HTML…"
mkdir -p wordml
BASE="https://webapp.docx4java.org/OnlineDemo/ecma376/WordML"
for f in \
  spacing_1.html spacing.html \
  docGrid.html ST_DocGrid.html \
  snapToGrid.html snapToGrid_1.html \
  ST_LineSpacingRule.html \
  pgSz.html pgMar.html ind.html \
  kinsoku.html overflowPunct.html wordWrap.html \
  adjustLineHeightInTable.html \
  sectPr.html sectPr_1.html \
  rFonts.html sz.html jc.html \
  titlePg.html evenAndOddHeaders.html \
  headerReference.html footerReference.html \
  hdr.html ftr.html pgNumType.html ST_HdrFtr.html
do
  curl -fsSL --retry 3 --retry-delay 1 -o "wordml/$f" "$BASE/$f"
done

echo "完成。"
ls -lh "MS-OI29500.pdf" "ECMA-376-1.zip"
find "ECMA-376-1" -iname "*.pdf" | head
ls wordml | wc -l
