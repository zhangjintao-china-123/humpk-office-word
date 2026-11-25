const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"';

function svg(body: string): string {
  return `<svg class="ho-word-icon" viewBox="0 0 16 16" aria-hidden="true">${body}</svg>`;
}

export const MenuIcons = {
  trash: svg(`<path d="M3.5 4.5h9M6.2 4.4V3.2h3.6v1.2M5.2 4.5l.5 8.3h4.6l.5-8.3" ${STROKE}/>`),
  font: svg(`<path d="M3.5 13 8 3l4.5 10M5.2 9.4h5.6" ${STROKE}/>`),
  row: svg(`<rect x="2.5" y="3" width="11" height="10" ${STROKE}/><path d="M2.5 8h11" ${STROKE}/>`),
  col: svg(`<rect x="2.5" y="3" width="11" height="10" ${STROKE}/><path d="M8 3v10" ${STROKE}/>`),
  merge: svg(`<rect x="2.5" y="3" width="11" height="10" ${STROKE}/><path d="M8 6.2v3.6M6.2 8h3.6" ${STROKE}/>`),
  split: svg(`<rect x="2.5" y="3" width="11" height="10" ${STROKE}/><path d="M8 3v10M2.5 8h11" ${STROKE}/>`),
};
