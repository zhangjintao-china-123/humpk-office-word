import type { DocumentStats } from "../../edit/DocumentStats";
import { RibbonIcons } from "./RibbonIcons";

export interface ReviewState {
  hasComments: boolean;
  commentsVisible: boolean;
  canDeleteComment: boolean;
  hasRevisions: boolean;
  canResolveRevision: boolean;
  trackingRevisions: boolean;
}

export type ReviewStats = DocumentStats & { pages: number };

const STATS_LABELS: Record<keyof ReviewStats, string> = {
  pages: "页数",
  words: "字数",
  characters: "字符数（不含空白）",
  charactersWithSpaces: "字符数（含空白）",
  paragraphs: "段落数",
};

export const REVIEW_STATS = Object.keys(STATS_LABELS) as (keyof ReviewStats)[];

export function reviewMarkup(): string {
  return `
    <div class="ho-word-ribbon-page ho-word-review-page" data-page="review" hidden>
      <section class="ho-word-group">
        <div class="ho-word-group-body">${button("word-count", "字数统计", RibbonIcons.wordCount)}</div>
        <span>校对</span>
      </section>
      <section class="ho-word-group">
        <div class="ho-word-group-body">
          ${button("new-comment", "新建批注", RibbonIcons.newComment)}
          ${button("delete-comment", "删除批注", RibbonIcons.deleteComment)}
          ${button("previous-comment", "上一条批注", RibbonIcons.previousReview)}
          ${button("next-comment", "下一条批注", RibbonIcons.nextReview)}
          ${button("show-comments", "显示批注", RibbonIcons.comment, true)}
        </div>
        <span>批注</span>
      </section>
      <section class="ho-word-group">
        <div class="ho-word-group-body">
          ${button("track-revisions", "修订", RibbonIcons.trackRevisions, true)}
          ${button("previous-revision", "上一条修订", RibbonIcons.previousReview)}
          ${button("next-revision", "下一条修订", RibbonIcons.nextReview)}
          ${button("accept-revision", "接受修订", RibbonIcons.acceptReview)}
          ${button("reject-revision", "拒绝修订", RibbonIcons.rejectReview)}
        </div>
        <span>修订</span>
      </section>
    </div>`;
}

function button(action: string, label: string, icon: string, toggle = false): string {
  return `<button type="button" class="ho-word-big" title="${label}" data-act="${action}"${toggle ? ' aria-pressed="false"' : ""}>${icon}<span>${label}</span></button>`;
}

export function wordCountMarkup(): string {
  return `
    <dialog class="ho-word-review-stats" aria-label="字数统计">
      <h2>字数统计</h2>
      <p>统计正文、表格和文本框</p>
      <dl>${REVIEW_STATS.map((key) => `<dt>${STATS_LABELS[key]}</dt><dd data-review-stat="${key}"></dd>`).join("")}</dl>
      <form method="dialog"><button type="submit" autofocus>关闭</button></form>
    </dialog>`;
}
