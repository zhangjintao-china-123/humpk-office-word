const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"';

function svg(body: string): string {
  return `<svg class="ho-word-icon" viewBox="0 0 16 16" aria-hidden="true">${body}</svg>`;
}

export const RibbonIcons = {
  paste: svg(
    `<rect x="5" y="3.5" width="8" height="10.5" rx="1" ${STROKE}/>
     <rect x="3" y="1.5" width="6.5" height="4" rx="0.8" fill="#fff" ${STROKE}/>
     <path d="M7 8.5h4M7 11h3" ${STROKE}/>`,
  ),
  cut: svg(`<circle cx="5" cy="12" r="2" ${STROKE}/><circle cx="11" cy="12" r="2" ${STROKE}/><path d="M6.6 10.6 12 2.5M9.4 10.6 4 2.5" ${STROKE}/>`),
  copy: svg(
    `<rect x="5.5" y="4" width="7" height="9" rx="1" ${STROKE}/>
     <rect x="3.5" y="2" width="7" height="9" rx="1" fill="#fff" ${STROKE}/>`,
  ),
  highlight: svg(
    `<path d="M3 12.5h4.2L13 6.7 9.3 3 3.5 8.8v3.7z" ${STROKE}/>
     <path d="M8.6 3.7 12.3 7.4" ${STROKE}/>
     <path d="M2.5 13.5h6" ${STROKE}/>`,
  ),
  list: svg(
    `<path d="M3 3.5h1.2M3 8h1.2M3 12.5h1.2" ${STROKE}/>
     <path d="M6.5 3.5h7M7.5 8h6M8.5 12.5h5" ${STROKE}/>`,
  ),
  indentLess: svg(`<path d="M8 3.5H14M8 8h6M8 12.5h6M2.5 8h4M4.5 6l-2 2 2 2" ${STROKE}/>`),
  indentMore: svg(`<path d="M2 3.5h6M2 8h6M2 12.5h6M9.5 8h4M11.5 6l2 2-2 2" ${STROKE}/>`),
  firstLine: svg(`<path d="M7 3.5h7M2 8h12M2 12.5h12" ${STROKE}/>`),
  alignLeft: svg(`<path d="M2 3.5h12M2 6.8h8M2 10.1h12M2 13.4h7" ${STROKE}/>`),
  alignCenter: svg(`<path d="M2 3.5h12M4 6.8h8M2 10.1h12M4.5 13.4h7" ${STROKE}/>`),
  alignRight: svg(`<path d="M2 3.5h12M6 6.8h8M2 10.1h12M7 13.4h7" ${STROKE}/>`),
  alignBoth: svg(`<path d="M2 3.5h12M2 6.8h12M2 10.1h12M2 13.4h12" ${STROKE}/>`),
  spacing: svg(
    `<path d="M3 5.2 5 3.2 7 5.2M5 3.5v9M3 10.8 5 12.8 7 10.8" ${STROKE}/>
     <path d="M9 4.2h5M9 8h5M9 11.8h5" ${STROKE}/>`,
  ),
  find: svg(`<circle cx="7" cy="7" r="3.6" ${STROKE}/><path d="M9.7 9.7 13.5 13.5" ${STROKE}/>`),
  replace: svg(
    `<circle cx="6.2" cy="6.2" r="3.1" ${STROKE}/>
     <path d="M8.5 8.5 12.2 12.2M3.5 13h9" ${STROKE}/>`,
  ),
  blankPage: svg(
    `<rect x="3.5" y="2" width="9" height="12" ${STROKE}/>
     <path d="M6.5 8h3" ${STROKE}/>`,
  ),
  pageBreak: svg(
    `<path d="M4 2.5h8v4.5H4zM4 9h8v4.5H4z" ${STROKE}/>
     <path d="M2.5 8h11" stroke-dasharray="1.6 1.4" ${STROKE}/>`,
  ),
  picture: svg(
    `<rect x="2.5" y="3.5" width="11" height="9" ${STROKE}/>
     <path d="M2.5 10.5 6 7.2 8.2 9.4 10 8.1 13.5 11.2" ${STROKE}/>
     <circle cx="5.2" cy="6.2" r="0.9" fill="currentColor"/>`,
  ),
  wrap: svg(
    `<rect x="3" y="2.5" width="7" height="5.5" ${STROKE}/>
     <path d="M12 3.5h2M12 5.5h2M3 10h10M3 12.5h10" ${STROKE}/>`,
  ),
  position: svg(
    `<rect x="3" y="2.5" width="10" height="11" ${STROKE}/>
     <rect x="4.5" y="4" width="4" height="3" fill="currentColor" opacity="0.35"/>`,
  ),
  table: svg(
    `<rect x="2.5" y="2.5" width="11" height="11" ${STROKE}/>
     <path d="M2.5 6.5h11M2.5 10.5h11M6.5 2.5v11M10.5 2.5v11" ${STROKE}/>`,
  ),
  link: svg(`<path d="M6.2 9.4 9.4 6.2M7 11.2l-1.4 1.4a2.2 2.2 0 1 1-3.1-3.1L4 8M9 4.8l1.4-1.4a2.2 2.2 0 1 1 3.1 3.1L12 8" ${STROKE}/>`),
  comment: svg(
    `<path d="M3 3.5h10v7.5H7.2L4.2 13.5V11H3z" ${STROKE}/>
     <path d="M6 6.4h4M6 8.6h2.8" ${STROKE}/>`,
  ),
  header: svg(
    `<rect x="3.5" y="2" width="9" height="12" ${STROKE}/>
     <path d="M3.5 5.5h9" ${STROKE}/>`,
  ),
  footer: svg(
    `<rect x="3.5" y="2" width="9" height="12" ${STROKE}/>
     <path d="M3.5 10.5h9" ${STROKE}/>`,
  ),
  pageNumber: svg(
    `<rect x="3.5" y="2" width="9" height="12" ${STROKE}/>
     <path d="M6.2 9.8V6.2h1.6c.8 0 1.3.5 1.3 1.2S8.6 8.6 7.8 8.6H6.8M6.2 9.8h3.6" ${STROKE}/>`,
  ),
};

export function iconButton(act: string, title: string, icon: string): string {
  return `<button type="button" data-act="${act}" title="${title}">${icon}</button>`;
}
