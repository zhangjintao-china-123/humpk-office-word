const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"';

function svg(body: string): string {
  return `<svg class="ho-word-icon" viewBox="0 0 16 16" aria-hidden="true">${body}</svg>`;
}

const ACCENT = "#285f9b";
const AMBER = "#976217";
const VIOLET = "#795095";
const PAGE_FILL = "#eaf2fb";
const FOLDED_PAGE = "M5.7 2.5h5.4l4.9 4.8v8.7a1.5 1.5 0 0 1-1.5 1.5H5.7A1.5 1.5 0 0 1 4.2 16V4a1.5 1.5 0 0 1 1.5-1.5Z";
const PAGE_FOLD = "M11.1 2.6v3.5a1.2 1.2 0 0 0 1.2 1.2h3.5";
const PAGE_FRAME = '<rect x="4.2" y="2.5" width="11.6" height="15" rx="1.45"/>';

function ribbonIcon(body: string): string {
  return `<svg class="ho-word-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export const RibbonIcons = {
  paste: ribbonIcon(
    `<path d="M6.2 4.5H5a1.5 1.5 0 0 0-1.5 1.5v10.2A1.5 1.5 0 0 0 5 17.7h10a1.5 1.5 0 0 0 1.5-1.5V6A1.5 1.5 0 0 0 15 4.5h-1.2"/>
     <path d="M6.7 3.9h1.5a1.8 1.8 0 0 1 3.6 0h1.5v2.7H6.7z" fill="#e7effa" stroke="${ACCENT}"/>
     <path d="M7 10h6M7 13.5h4.5"/>`,
  ),
  cut: ribbonIcon(
    `<path d="m7.6 12.6 8.2-9.7M12.4 12.6 4.2 2.9"/>
     <circle cx="5.9" cy="14.6" r="2.5" stroke="${ACCENT}"/>
     <circle cx="14.1" cy="14.6" r="2.5" stroke="${ACCENT}"/>
     <circle cx="10" cy="9.8" r=".72" fill="currentColor" stroke="none"/>`,
  ),
  copy: ribbonIcon(
    `<path d="M5.5 14.4H4.2A1.5 1.5 0 0 1 2.7 13V4.2a1.5 1.5 0 0 1 1.5-1.5h7.1c.8 0 1.4.6 1.4 1.4" stroke="${ACCENT}"/>
     <path d="M8.4 5.8h5.2l3.5 3.5v6.9a1.5 1.5 0 0 1-1.5 1.5H8.4a1.5 1.5 0 0 1-1.5-1.5V7.3a1.5 1.5 0 0 1 1.5-1.5Z"/>
     <path d="M13.4 5.9v3.6h3.5M10 12.6h4M10 15.1h2.8" stroke-width="1.35"/>`,
  ),
  formatPainter: ribbonIcon(
    `<g transform="rotate(42 10 10)">
       <path d="M8.4 7.7V3.3a1.6 1.6 0 1 1 3.2 0v4.4" fill="#e7effa" stroke="${ACCENT}"/>
       <path d="M7 8h6v3.1H7z" fill="#f8ead2" stroke="${AMBER}"/>
       <path d="M7.4 11.2h5.2v2.4c0 1.9-1.6 3.3-5.7 3.7.7-1 .5-2.4.5-3.8zM10 11.3v2.4"/>
     </g>`,
  ),
  growFont: ribbonIcon(
    `<path d="m2.3 15.7 4.2-10 4.2 10M3.7 12.4h5.6"/>
     <path d="M15 13.1V4.2m-2.6 2.5L15 4.2l2.5 2.5" stroke="${ACCENT}"/>`,
  ),
  shrinkFont: ribbonIcon(
    `<path d="m2.3 15.7 4.2-10 4.2 10M3.7 12.4h5.6"/>
     <path d="M15 4.7v8.8m-2.6-2.5 2.6 2.5 2.5-2.5" stroke="${ACCENT}"/>`,
  ),
  changeCase: ribbonIcon(
    `<path d="m2.1 14.8 3.8-9.7 3.9 9.7M3.4 11.7h5.1"/>
     <path d="M12.2 9.8a3.6 3.6 0 0 1 2.3-.7c1.4 0 2.4.7 2.4 2v3.7m0-2.6h-2.6c-1.5 0-2.2.6-2.2 1.4 0 1 .7 1.5 1.8 1.5 1.2 0 2.4-.6 3-1.4" stroke="${ACCENT}" stroke-width="1.45"/>`,
  ),
  clearFormat: ribbonIcon(
    `<path d="m2.2 13.9 4.1-10.4 3.1 7.9M3.8 9.9h5"/>
     <path d="m9.4 13.8 4.6-5a1.1 1.1 0 0 1 1.5-.1l2.1 1.9a1.1 1.1 0 0 1 .1 1.5l-4.1 4.5h-2.2l-2-1.7a.8.8 0 0 1 0-1.1Z" fill="#efe6f5" stroke="${VIOLET}"/>
     <path d="m11.5 11.6 4.4 3.8" stroke="${VIOLET}" stroke-width="1.25"/>`,
  ),
  bold: ribbonIcon(
    `<path fill="currentColor" fill-rule="evenodd" stroke="none" d="M5.3 3.6h5.4c2.5 0 4 1.3 4 3.3 0 1.3-.7 2.2-1.8 2.7a3.1 3.1 0 0 1 2.6 3.1c0 2.3-1.7 3.7-4.5 3.7H5.3zm2.4 2v3.1h2.7c1.2 0 1.9-.6 1.9-1.6s-.7-1.5-1.9-1.5zm0 5.1v3.6h3c1.5 0 2.3-.6 2.3-1.8s-.8-1.8-2.3-1.8z"/>`,
  ),
  italic: ribbonIcon(
    `<path d="M8.6 4.3h6.3M5.1 15.7h6.3m.4-11.4L8.2 15.7" stroke-width="1.9"/>`,
  ),
  underline: ribbonIcon(
    `<path d="M5.7 3.8v6.1a4.3 4.3 0 0 0 8.6 0V3.8" stroke-width="1.85"/>
     <path d="M4.3 16.7h11.4" stroke="${ACCENT}"/>`,
  ),
  strike: ribbonIcon(
    `<path d="M13.8 6.2A5 5 0 0 0 10 4.5c-2.1 0-3.6 1.1-3.6 2.6 0 1.7 1.9 2.3 3.7 2.9 1.9.6 3.6 1.1 3.6 2.8 0 1.6-1.6 2.7-3.8 2.7a5.5 5.5 0 0 1-4.1-1.8"/>
     <path d="M3.3 10h13.4" stroke="${ACCENT}"/>`,
  ),
  subscript: ribbonIcon(
    `<path d="m3.1 5.4 7 7.6m0-7.6-7 7.6"/>
     <path d="M12.6 12.2a2.1 2.1 0 0 1 1.9-1.1c1.1 0 1.8.6 1.8 1.5s-.5 1.3-1.3 2l-2.4 2.2h3.9" stroke="${ACCENT}" stroke-width="1.35"/>`,
  ),
  superscript: ribbonIcon(
    `<path d="m3.1 8 7 7.6m0-7.6-7 7.6"/>
     <path d="M12.6 4.2a2.1 2.1 0 0 1 1.9-1.1c1.1 0 1.8.6 1.8 1.5s-.5 1.3-1.3 2l-2.4 2.2h3.9" stroke="${ACCENT}" stroke-width="1.35"/>`,
  ),
  highlight: ribbonIcon(
    `<g transform="rotate(40 10 10)">
       <path d="M7.2 10.6V3.1c0-.8.6-1.4 1.4-1.4h2.8c.8 0 1.4.6 1.4 1.4v7.5z" fill="#fcf0cc"/>
       <path d="M7.2 7.8h5.6" stroke="${AMBER}"/>
       <path d="M8.3 10.6h3.4v3l-3.4 1.9z" fill="#f2d16d" stroke="${AMBER}"/>
     </g>`,
  ),
  fontColor: ribbonIcon(
    `<path d="m4.5 15.2 5.5-11.8 5.5 11.8m-9.3-3.7h7.6" stroke-width="1.85"/>`,
  ),
  charShading: ribbonIcon(
    `<rect x="2.8" y="2.8" width="14.4" height="14.4" rx="2.2" fill="#e5eef9" stroke="${ACCENT}"/>
     <path d="m6.1 13.8 3.9-8.1 3.9 8.1m-6.6-2.7h5.4" stroke-width="1.5"/>`,
  ),
  enclosedChar: ribbonIcon(
    `<circle cx="10" cy="10" r="7.6" stroke="${ACCENT}"/>
     <path d="m9.7 5.2.7 1M5.9 8.5V7h8.2v1.5M7.7 9.1h4.5l-2.2 2v2.7c0 .5-.4.8-.9.8H8.2m-2-3h7.6" stroke-width="1.25"/>`,
  ),
  bullet: ribbonIcon(
    `<path d="M7.4 4.6h9.9M7.4 10h9.9m-9.9 5.4h9.9"/>
     <g fill="${ACCENT}" stroke="none"><circle cx="3.7" cy="4.6" r="1.3"/><circle cx="3.7" cy="10" r="1.3"/><circle cx="3.7" cy="15.4" r="1.3"/></g>`,
  ),
  numbering: ribbonIcon(
    `<path d="M8.3 4.5h9M8.3 10h9m-9 5.5h9"/>
     <path d="m2.9 3.8 1.2-1v3.4m-1.2 0h2.3M2.9 9.2c.2-.6.6-.9 1.2-.9.7 0 1 .4 1 .9 0 .7-.8 1.3-2.2 2.6h2.4m-2.4 2.2c.8-.8 2.2-.5 2.2.4 0 .5-.4.8-1 .9.7 0 1.2.3 1.2.9 0 1-1.6 1.3-2.5.6" stroke="${ACCENT}" stroke-width="1.25"/>`,
  ),
  list: ribbonIcon(
    `<path d="M6.3 4.6h11m-8.5 5.4h8.5m-6 5.4h6"/>
     <path d="M2.8 4.6h.8M5.3 10h.8m1.7 5.4h.8" stroke="${ACCENT}" stroke-width="2.2"/>`,
  ),
  indentLess: ribbonIcon(
    `<path d="M3 4.2h14M10.5 8.1H17m-6.5 3.8H17M3 15.8h14"/>
     <path d="M8 10H3l2-2.2M3 10l2 2.2" stroke="${ACCENT}"/>`,
  ),
  indentMore: ribbonIcon(
    `<path d="M3 4.2h14M10.5 8.1H17m-6.5 3.8H17M3 15.8h14"/>
     <path d="M3 10h5L6 7.8M8 10l-2 2.2" stroke="${ACCENT}"/>`,
  ),
  firstLine: ribbonIcon(
    `<path d="M8 4.2h9" stroke="${ACCENT}"/>
     <path d="M3 8.1h14M3 12h11.1M3 15.9h14"/>
     <path d="M3 4.2h1.9" stroke="${ACCENT}" stroke-width="1.3"/>`,
  ),
  alignLeft: ribbonIcon(`<path d="M3 4.2h14M3 8.1h9.6M3 12h14M3 15.9h7.3"/>`),
  alignCenter: ribbonIcon(`<path d="M3 4.2h14M5.2 8.1h9.6M3 12h14M6.35 15.9h7.3"/>`),
  alignRight: ribbonIcon(`<path d="M3 4.2h14m-9.6 3.9H17M3 12h14m-7.3 3.9H17"/>`),
  alignBoth: ribbonIcon(`<path d="M3 4.2h14M3 8.1h14M3 12h14M3 15.9h14"/>`),
  spacing: ribbonIcon(
    `<path d="M5 3.7v12.6m-2.3-10L5 3.7l2.3 2.6m-4.6 7.4L5 16.3l2.3-2.6" stroke="${ACCENT}"/>
     <path d="M10.4 4.2h6.9m-6.9 5.8h6.9m-6.9 5.8h6.9"/>`,
  ),
  asianLayout: ribbonIcon(
    `<path d="M3.4 12h13.2m-6.5-1.2-.9-1.6m4.6 3c-1.7 3.3-4.8 5-9 5.6m2.1-5.6c1.6 2.8 4.6 4.9 8.8 5.6" stroke-width="1.4"/>
     <path d="M3.3 5.3h13.4M5.3 3.4 3.3 5.3l2 1.9m9.4-3.8 2 1.9-2 1.9" stroke="${ACCENT}"/>`,
  ),
  sort: ribbonIcon(
    `<path d="m2.7 9 2.5-5.5L7.7 9M3.6 7.2h3.2m-3.9 4.7h4.6l-4.6 4.8h4.7" stroke-width="1.4"/>
     <path d="M13.8 3.4v13.1m-3-3.3 3 3.3 3-3.3" stroke="${ACCENT}"/>`,
  ),
  showMarks: ribbonIcon(
    `<path d="M15.7 3.5H9.1a4.1 4.1 0 0 0 0 8.2h1V3.5m3.3.2v13.1m-3.3-5.1v5.1" stroke-width="1.7"/>
     <path d="M9.2 4.2a3.4 3.4 0 1 0 0 6.8h.3V4.2z" fill="${ACCENT}" fill-opacity=".24" stroke="none"/>`,
  ),
  paraShading: ribbonIcon(
    `<path d="m3 10.9 5.9-6 5.9 5.9-5.5 5.6a.9.9 0 0 1-1.3 0L3 11.9a.7.7 0 0 1 0-1Z" fill="#e7effa"/>
     <path d="M6.4 3c0-.7.9-1.1 1.5-.6l3.4 3.4c.7.7.2 1.8-.6 1.8-.3 0-.6-.2-.9-.4L7 4.4"/>
     <path d="M3.7 10.8h10" stroke="${ACCENT}" stroke-width="1.3"/>
     <path d="M16.1 11.8c-.8 1.1-1.4 1.8-1.4 2.6a1.4 1.4 0 0 0 2.8 0c0-.8-.6-1.5-1.4-2.6Z" fill="${ACCENT}" stroke="none"/>`,
  ),
  find: ribbonIcon(
    `<circle cx="8.4" cy="8.4" r="4.9" fill="#eaf1f9"/>
     <path d="m12 12 4.5 4.5" stroke="${ACCENT}" stroke-width="2.1"/>`,
  ),
  replace: ribbonIcon(
    `<path d="M3.3 6.3a3.3 3.3 0 0 1 1.8-.5c1.3 0 2 .6 2 1.7v2.8m0-2.2H5c-1.2 0-1.9.4-1.9 1.1s.6 1.1 1.4 1.1c1 0 1.8-.4 2.6-1.1m6-1.1v7.3m0-3.4a2.2 2.2 0 1 1 0 2.6" stroke-width="1.45"/>
     <path d="M9.6 5.1h7.1m-2-2 2 2-2 2M10.1 14.7H3.3m2-2-2 2 2 2" stroke="${ACCENT}" stroke-width="1.45"/>`,
  ),
  palette: ribbonIcon(
    `<path d="M10 2.9a7.1 7.1 0 1 0 0 14.2h1a1.5 1.5 0 0 0 1-2.6 1.2 1.2 0 0 1 .8-2.1h1.8a2.5 2.5 0 0 0 2.5-2.5A7.1 7.1 0 0 0 10 2.9Z"/>
     <g stroke="none">
       <circle cx="6.1" cy="10.6" r="1.2" fill="${ACCENT}"/>
       <circle cx="7.5" cy="7.3" r="1.2" fill="#be7d28"/>
       <circle cx="11.2" cy="6.4" r="1.2" fill="${VIOLET}"/>
     </g>`,
  ),
  chevronDown: '<svg class="ho-word-menu-caret" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="m2.1 3.7 2.9 2.8 2.9-2.8" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  check: '<svg class="ho-word-border-check" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="m2 6 2.7 2.5L10 3.3" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  coverPage: ribbonIcon(
    `<path d="${FOLDED_PAGE}"/>
     <path d="${PAGE_FOLD}" fill="${PAGE_FILL}" stroke="${ACCENT}" stroke-width="1.35"/>
     <rect x="6.6" y="8.5" width="7" height="3" rx=".65" fill="${PAGE_FILL}" stroke="none"/>
     <path d="M7.7 10h4.8m-5.4 3.6h5.5m-5.5 2h3.6" stroke="${ACCENT}" stroke-width="1.25"/>`,
  ),
  removeCover: ribbonIcon(
    `<path d="M9.2 17.2H5.1a1.4 1.4 0 0 1-1.4-1.4V4a1.4 1.4 0 0 1 1.4-1.4h4.6l4.5 4.5v2.3"/>
     <path d="M9.7 2.7v3.2A1.2 1.2 0 0 0 11 7.1h3.1M6 9.8h4.7M6 12.6h2.8" stroke="${ACCENT}" stroke-width="1.3"/>
     <circle cx="14.5" cy="14.6" r="3.35" fill="#faece9" stroke="none"/>
     <path d="m13 13.1 3 3m0-3-3 3" stroke="#a4473e" stroke-width="1.45"/>`,
  ),
  textBox: ribbonIcon(
    `<rect x="3.4" y="3.7" width="13.2" height="12.6" rx=".8" stroke-width="1.25"/>
     <path d="m6.9 13 3.1-6 3.1 6m-4.9-2.15h3.6" stroke="${ACCENT}"/>
     <path d="M2.6 2.9h1.7v1.7H2.6zm13.1 0h1.7v1.7h-1.7zM2.6 15.4h1.7v1.7H2.6zm13.1 0h1.7v1.7h-1.7z" fill="${PAGE_FILL}" stroke="${ACCENT}" stroke-width=".9"/>`,
  ),
  verticalTextBox: ribbonIcon(
    `<rect x="4.4" y="2.8" width="11.2" height="14.4" rx=".8" stroke-width="1.25"/>
     <path d="M7.3 6.3h5.4M7.3 9h5.4m-4.2 0c.3 2.2 1.8 3.55 4 4.4m-1-4.4c-.3 2.2-1.8 3.55-4 4.4m2-8.1.65.95" stroke="${ACCENT}" stroke-width="1.25"/>
     <path d="M3.6 2h1.6v1.6H3.6zm11.2 0h1.6v1.6h-1.6zM3.6 16.4h1.6V18H3.6zm11.2 0h1.6V18h-1.6z" fill="${PAGE_FILL}" stroke="${ACCENT}" stroke-width=".9"/>`,
  ),
  shapeOutline: ribbonIcon(
    `<rect x="3.2" y="4.2" width="13.6" height="12.5" rx="1.4" stroke="${ACCENT}"/>
     <path d="M3.2 10.4V5.6a1.4 1.4 0 0 1 1.4-1.4h6.2" stroke-width="2.4"/>`,
  ),
  textDirection: ribbonIcon(
    `<path d="m4.1 11 2.7-6.5L9.5 11M5.1 8.7h3.4"/>
     <path d="M4.2 15.3h10.6m-2.4-2.4 2.4 2.4-2.4 2.4M14.8 4v6.3" stroke="${ACCENT}"/>`,
  ),
  textBoxAlign: ribbonIcon(
    `<rect x="2.9" y="3.4" width="14.2" height="13.2" rx="1.2"/>
     <path d="M5.8 8.1h8.4m-8.4 3.8h6.1" stroke="${ACCENT}"/>`,
  ),
  changeShape: ribbonIcon(
    `<rect x="3" y="6.8" width="9" height="9" rx="1.2"/>
     <path d="M12.2 3.2 16.8 11H7.6Z" fill="${PAGE_FILL}" stroke="${ACCENT}" stroke-width="1.35"/>`,
  ),
  shapeStyle: ribbonIcon(
    `<rect x="3.2" y="3.8" width="13.6" height="12.4" rx="1.5" fill="${PAGE_FILL}" stroke="${ACCENT}"/>
     <path d="M7.1 12.6 10 6.8l2.9 5.8m-4.7-1.9h3.6" stroke="${ACCENT}" stroke-width="1.35"/>`,
  ),
  bringForward: ribbonIcon(
    `<rect x="7.4" y="7.4" width="8.6" height="8.6" rx="1.1"/>
     <rect x="3.8" y="3.8" width="8.8" height="8.8" rx="1.1" fill="${PAGE_FILL}" stroke="${ACCENT}" stroke-width="1.4"/>`,
  ),
  sendBackward: ribbonIcon(
    `<rect x="3.8" y="3.8" width="8.8" height="8.8" rx="1.1" fill="${PAGE_FILL}" stroke="${ACCENT}" stroke-width="1.4"/>
     <rect x="7.4" y="7.4" width="8.6" height="8.6" rx="1.1" fill="#fff"/>`,
  ),
  selectionPane: ribbonIcon(
    `<path d="M3.5 5.5h6.8M3.5 10h6.8M3.5 14.5h6.8" stroke-width="1.5"/>
     <path d="M10.8 10s1.7-3 4-3 4 3 4 3-1.7 3-4 3-4-3-4-3Z" stroke="${ACCENT}" stroke-width="1.3"/>
     <circle cx="14.8" cy="10" r="1.2" fill="${ACCENT}" stroke="none"/>`,
  ),
  alignObjects: ribbonIcon(
    `<path d="M3.5 3.4v13.2" stroke="${ACCENT}" stroke-width="1.6"/>
     <rect x="6" y="4.8" width="9.8" height="3.8" rx=".8" fill="${PAGE_FILL}"/>
     <rect x="6" y="11.2" width="6.5" height="3.8" rx=".8"/>`,
  ),
  rotateObject: ribbonIcon(
    `<path d="M15.4 9.5a5.4 5.4 0 1 1-1.9-4.1" stroke="${ACCENT}" stroke-width="1.45"/>
     <path d="M15.7 3.8v3.6h-3.6" stroke="${ACCENT}" stroke-width="1.45"/>
     <path d="m7.2 13 3-5.2 3 5.2Z" fill="${PAGE_FILL}"/>`,
  ),
  eyeOpen: svg(
    `<path d="M2 8s2.4-4 6-4 6 4 6 4-2.4 4-6 4-6-4-6-4z" ${STROKE}/><circle cx="8" cy="8" r="1.6" fill="currentColor"/>`,
  ),
  eyeClosed: svg(
    `<path d="M2 8s2.4-3.5 6-3.5S14 8 14 8M3 12.5l10-9" ${STROKE}/>`,
  ),
  blankPage: ribbonIcon(
    `<path d="${FOLDED_PAGE}"/>
     <path d="${PAGE_FOLD}" fill="${PAGE_FILL}" stroke="${ACCENT}" stroke-width="1.35"/>
     <circle cx="15.1" cy="15.25" r="3.75" fill="white" stroke="none"/>
     <circle cx="15.1" cy="15.25" r="2.85" fill="${PAGE_FILL}" stroke="${ACCENT}" stroke-width="1.2"/>
     <path d="M13.7 15.25h2.8m-1.4-1.4v2.8" stroke="${ACCENT}" stroke-width="1.1"/>`,
  ),
  pageBreak: ribbonIcon(
    `<path d="M4.1 7.5V4a1.3 1.3 0 0 1 1.3-1.3h9.2A1.3 1.3 0 0 1 15.9 4v3.5m0 5v3.5a1.3 1.3 0 0 1-1.3 1.3H5.4A1.3 1.3 0 0 1 4.1 16v-3.5"/>
     <path d="M7 5.8h6M7 14.2h4.1" stroke="${ACCENT}" stroke-width="1.25"/>
     <path d="M2.4 10h15.2" stroke="${ACCENT}" stroke-dasharray="1.6 2"/>`,
  ),
  picture: ribbonIcon(
    `<rect x="2.7" y="3.6" width="14.6" height="12.8" rx="1.45" fill="#f3f7fc" stroke="none"/>
     <path d="m3 13.8 4.3-4.2 3.2 3.1 1.8-1.7 4.7 4.1v.7H3Z" fill="#aac8e5" stroke="none"/>
     <path d="m3 13.8 4.3-4.2 3.2 3.1 1.8-1.7 4.7 4.1" stroke="${ACCENT}" stroke-width="1.3"/>
     <circle cx="13.1" cy="7.3" r="1.65" fill="#edb565" stroke="none"/>
     <rect x="2.7" y="3.6" width="14.6" height="12.8" rx="1.45"/>`,
  ),
  wrap: svg(
    `<rect x="3" y="2.5" width="7" height="5.5" ${STROKE}/>
     <path d="M12 3.5h2M12 5.5h2M3 10h10M3 12.5h10" ${STROKE}/>`,
  ),
  position: svg(
    `<rect x="3" y="2.5" width="10" height="11" ${STROKE}/>
     <rect x="4.5" y="4" width="4" height="3" fill="currentColor" opacity="0.35"/>`,
  ),
  table: ribbonIcon(
    `<path d="M4.3 3.8h11.4a1.4 1.4 0 0 1 1.4 1.4V8H2.9V5.2a1.4 1.4 0 0 1 1.4-1.4Z" fill="${PAGE_FILL}" stroke="none"/>
     <rect x="2.9" y="3.8" width="14.2" height="12.5" rx="1.4"/>
     <path d="M2.9 8h14.2M2.9 12.15h14.2M7.65 3.8v12.5M12.35 3.8v12.5" stroke="${ACCENT}" stroke-width="1.25"/>`,
  ),
  link: ribbonIcon(
    `<path d="m8.85 6.6 2.5-2.5a3.2 3.2 0 0 1 4.55 4.5l-2.5 2.5" stroke="${ACCENT}"/>
     <path d="m11.15 13.4-2.5 2.5a3.2 3.2 0 0 1-4.55-4.5l2.5-2.5"/>
     <path d="m7.85 12.15 4.3-4.3" stroke="${ACCENT}" stroke-width="1.8"/>`,
  ),
  comment: ribbonIcon(
    `<path d="M4.5 3.8h11a1.8 1.8 0 0 1 1.8 1.8v6a1.8 1.8 0 0 1-1.8 1.8H9l-4.15 3.2v-3.2H4.5a1.8 1.8 0 0 1-1.8-1.8v-6a1.8 1.8 0 0 1 1.8-1.8Z" fill="${PAGE_FILL}"/>
     <path d="M6 7.1h8M6 10h5.5" stroke="${ACCENT}" stroke-width="1.4"/>`,
  ),
  header: ribbonIcon(
    `<path d="M5.6 2.5h8.8a1.4 1.4 0 0 1 1.4 1.4v3.2H4.2V3.9a1.4 1.4 0 0 1 1.4-1.4Z" fill="${PAGE_FILL}" stroke="none"/>
     ${PAGE_FRAME}
     <path d="M4.3 7.15h11.4M7 4.85h5.5" stroke="${ACCENT}" stroke-width="1.35"/>
     <path d="M7 10.2h6M7 12.95h4.3" stroke="#8b9db1" stroke-width="1.2"/>`,
  ),
  footer: ribbonIcon(
    `<path d="M4.2 12.9h11.6v3.2a1.4 1.4 0 0 1-1.4 1.4H5.6a1.4 1.4 0 0 1-1.4-1.4Z" fill="${PAGE_FILL}" stroke="none"/>
     ${PAGE_FRAME}
     <path d="M4.3 12.85h11.4M7 15.15h5.5" stroke="${ACCENT}" stroke-width="1.35"/>
     <path d="M7 7.05h6M7 9.8h4.3" stroke="#8b9db1" stroke-width="1.2"/>`,
  ),
  pageNumber: ribbonIcon(
    `${PAGE_FRAME}
     <path d="M7.2 5.75h5.6M7.2 8h4" stroke="#8b9db1" stroke-width="1.2"/>
     <rect x="7.15" y="10" width="5.7" height="5.35" rx="1.1" fill="${PAGE_FILL}" stroke="none"/>
     <path d="m8.95 11.85 1.15-.8v3.35m-1.05 0h2.1" stroke="${ACCENT}" stroke-width="1.35"/>`,
  ),
};

export function iconButton(act: string, title: string, icon: string): string {
  return `<button type="button" data-act="${act}" title="${title}">${icon}</button>`;
}
