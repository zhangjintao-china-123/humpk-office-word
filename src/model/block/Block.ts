import type { FieldKind } from "../document/PageLabel";
import type { TextLink } from "../field/TextLink";
import type { Drawing } from "../inline/Drawing";
import type { MathExpr, MathView } from "../math/MathExpr";
import type { RevisionMark } from "../review/Review";
import { resolveFontFamily, type RunStyle } from "../style/RunStyle";

export class Block {
  text = "";
  style: RunStyle = {};
  drawing?: Drawing;
  charType?: string;
  field?: FieldKind;
  /** 域指令原文，写回时用。 */
  fieldInstr?: string;
  link?: TextLink;
  revision?: RevisionMark;
  /** 这段文字被哪些批注包住，按出现顺序。 */
  commentIds?: string[];
  /** 批注引用上标，对应 comments.xml 的 id。 */
  commentRef?: string;
  /** 脚注引用上标，对应 footnotes.xml 的 id。 */
  footnoteId?: string;
  /** OMML 公式。整条公式在行里占一个盒子。 */
  math?: MathExpr;
  /** 公式原文，写回时原样放回，避免丢掉没排的结构。 */
  mathXml?: string;
  /** 排版后的公式，绘制时用。 */
  mathView?: MathView;

  get isDrawing(): boolean {
    return this.drawing != null;
  }

  getStyle(charCode = 0): RunStyle {
    return {
      ...this.style,
      fontFamily: resolveFontFamily(this.style, charCode),
    };
  }
}
