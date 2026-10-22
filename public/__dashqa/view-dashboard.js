(function(){var __m={exports:{}};(function(module,exports){"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// hz:hz:react
var require_hz_react = __commonJS({
  "hz:hz:react"(exports, module2) {
    module2.exports = globalThis.__HZ__ && globalThis.__HZ__["react"] || {};
  }
});

// hz:hz:jsx
var require_hz_jsx = __commonJS({
  "hz:hz:jsx"(exports, module2) {
    module2.exports = globalThis.__HZ__ && globalThis.__HZ__["jsx"] || {};
  }
});

// hz:hz:api
var require_hz_api = __commonJS({
  "hz:hz:api"(exports, module2) {
    module2.exports = globalThis.__HZ__ && globalThis.__HZ__["api"] || {};
  }
});

// hz:hz:shell
var require_hz_shell = __commonJS({
  "hz:hz:shell"(exports, module2) {
    module2.exports = globalThis.__HZ__ && globalThis.__HZ__["shell"] || {};
  }
});

// hz:hz:cn
var require_hz_cn = __commonJS({
  "hz:hz:cn"(exports, module2) {
    module2.exports = globalThis.__HZ__ && globalThis.__HZ__["cn"] || {};
  }
});

// hz:hz:button
var require_hz_button = __commonJS({
  "hz:hz:button"(exports, module2) {
    module2.exports = globalThis.__HZ__ && globalThis.__HZ__["button"] || {};
  }
});

// hz:hz:input
var require_hz_input = __commonJS({
  "hz:hz:input"(exports, module2) {
    module2.exports = globalThis.__HZ__ && globalThis.__HZ__["input"] || {};
  }
});

// hz:hz:toast
var require_hz_toast = __commonJS({
  "hz:hz:toast"(exports, module2) {
    module2.exports = globalThis.__HZ__ && globalThis.__HZ__["toast"] || {};
  }
});

// hz:hz:jalali
var require_hz_jalali = __commonJS({
  "hz:hz:jalali"(exports, module2) {
    module2.exports = globalThis.__HZ__ && globalThis.__HZ__["jalali"] || {};
  }
});

// hz:hz:dialog
var require_hz_dialog = __commonJS({
  "hz:hz:dialog"(exports, module2) {
    module2.exports = globalThis.__HZ__ && globalThis.__HZ__["dialog"] || {};
  }
});

// hz:hz:card
var require_hz_card = __commonJS({
  "hz:hz:card"(exports, module2) {
    module2.exports = globalThis.__HZ__ && globalThis.__HZ__["card"] || {};
  }
});

// hz:hz:select
var require_hz_select = __commonJS({
  "hz:hz:select"(exports, module2) {
    module2.exports = globalThis.__HZ__ && globalThis.__HZ__["select"] || {};
  }
});

// hz:hz:badge
var require_hz_badge = __commonJS({
  "hz:hz:badge"(exports, module2) {
    module2.exports = globalThis.__HZ__ && globalThis.__HZ__["badge"] || {};
  }
});

// hz:hz:table
var require_hz_table = __commonJS({
  "hz:hz:table"(exports, module2) {
    module2.exports = globalThis.__HZ__ && globalThis.__HZ__["table"] || {};
  }
});

// hz:hz:tabs
var require_hz_tabs = __commonJS({
  "hz:hz:tabs"(exports, module2) {
    module2.exports = globalThis.__HZ__ && globalThis.__HZ__["tabs"] || {};
  }
});

// hz:hz:progress
var require_hz_progress = __commonJS({
  "hz:hz:progress"(exports, module2) {
    module2.exports = globalThis.__HZ__ && globalThis.__HZ__["progress"] || {};
  }
});

// hz:hz:checkbox
var require_hz_checkbox = __commonJS({
  "hz:hz:checkbox"(exports, module2) {
    module2.exports = globalThis.__HZ__ && globalThis.__HZ__["checkbox"] || {};
  }
});

// hz:hz:textarea
var require_hz_textarea = __commonJS({
  "hz:hz:textarea"(exports, module2) {
    module2.exports = globalThis.__HZ__ && globalThis.__HZ__["textarea"] || {};
  }
});

// hz:hz:popover
var require_hz_popover = __commonJS({
  "hz:hz:popover"(exports, module2) {
    module2.exports = globalThis.__HZ__ && globalThis.__HZ__["popover"] || {};
  }
});

// hz:hz/jsx-runtime
var require_jsx_runtime = __commonJS({
  "hz:hz/jsx-runtime"(exports, module2) {
    module2.exports = globalThis.__HZ__ && globalThis.__HZ__["jsx-runtime"] || {};
  }
});

// hz-ext/src/views/dashboard.tsx
var dashboard_exports = {};
__export(dashboard_exports, {
  default: () => DashboardView
});
module.exports = __toCommonJS(dashboard_exports);

// hz-ext/src/lib/hz.ts
var import_hz_react2 = __toESM(require_hz_react());
var import_hz_jsx3 = __toESM(require_hz_jsx());
var import_hz_api = __toESM(require_hz_api());
var import_hz_shell2 = __toESM(require_hz_shell());
var import_hz_cn2 = __toESM(require_hz_cn());
var import_hz_button = __toESM(require_hz_button());
var import_hz_input = __toESM(require_hz_input());
var import_hz_toast = __toESM(require_hz_toast());
var import_hz_jalali2 = __toESM(require_hz_jalali());
var import_hz_dialog = __toESM(require_hz_dialog());
var import_hz_card = __toESM(require_hz_card());
var import_hz_select = __toESM(require_hz_select());
var import_hz_badge = __toESM(require_hz_badge());
var import_hz_table = __toESM(require_hz_table());
var import_hz_tabs = __toESM(require_hz_tabs());
var import_hz_progress = __toESM(require_hz_progress());
var import_hz_checkbox = __toESM(require_hz_checkbox());
var import_hz_textarea = __toESM(require_hz_textarea());
var import_hz_popover = __toESM(require_hz_popover());

// hz-ext/src/lib/icons.tsx
var import_hz_jsx = __toESM(require_hz_jsx());
var P = {
  check: [["path", { d: "M20 6 9 17l-5-5" }]],
  x: [["path", { d: "M18 6 6 18M6 6l12 12" }]],
  plus: [["path", { d: "M5 12h14M12 5v14" }]],
  minus: [["path", { d: "M5 12h14" }]],
  search: [["circle", { cx: 11, cy: 11, r: 8 }], ["path", { d: "m21 21-4.3-4.3" }]],
  printer: [["path", { d: "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" }], ["path", { d: "M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6" }], ["rect", { x: 6, y: 14, width: 12, height: 8, rx: 1 }]],
  calendar: [["rect", { x: 3, y: 4, width: 18, height: 18, rx: 2 }], ["path", { d: "M16 2v4M8 2v4M3 10h18" }]],
  clock: [["circle", { cx: 12, cy: 12, r: 10 }], ["path", { d: "M12 6v6l4 2" }]],
  alertTriangle: [["path", { d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" }], ["path", { d: "M12 9v4M12 17h.01" }]],
  info: [["circle", { cx: 12, cy: 12, r: 10 }], ["path", { d: "M12 16v-4M12 8h.01" }]],
  users: [["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }], ["circle", { cx: 9, cy: 7, r: 4 }], ["path", { d: "M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" }]],
  user: [["path", { d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" }], ["circle", { cx: 12, cy: 7, r: 4 }]],
  package: [["path", { d: "m7.5 4.27 9 5.15" }], ["path", { d: "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" }], ["path", { d: "m3.3 7 8.7 5 8.7-5" }], ["path", { d: "M12 22V12" }]],
  send: [["path", { d: "M22 2 11 13" }], ["path", { d: "M22 2 15 22l-4-9-9-4Z" }]],
  save: [["path", { d: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2" }], ["path", { d: "M17 21v-8H7v8M7 3v5h8" }]],
  clipboard: [["rect", { x: 8, y: 2, width: 8, height: 4, rx: 1 }], ["path", { d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" }]],
  store: [["path", { d: "m2 7 20-5" }], ["path", { d: "M2 7v14h20V9" }], ["path", { d: "M2 7l20-5v7" }], ["path", { d: "M8 21v-6h8v6" }]],
  trendingUp: [["path", { d: "M22 7 13.5 15.5 8.5 10.5 2 17" }], ["path", { d: "M16 7h6v6" }]],
  trendingDown: [["path", { d: "M22 17 13.5 8.5 8.5 13.5 2 7" }], ["path", { d: "M16 17h6v-6" }]],
  chevronDown: [["path", { d: "m6 9 6 6 6-6" }]],
  chevronLeft: [["path", { d: "m15 18-6-6 6-6" }]],
  chevronRight: [["path", { d: "m9 18 6-6-6-6" }]],
  pencil: [["path", { d: "M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" }]],
  trash: [["path", { d: "M3 6h18" }], ["path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" }], ["path", { d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }]],
  loader: [["path", { d: "M21 12a9 9 0 1 1-6.219-8.56" }]],
  barChart: [["path", { d: "M3 3v18h18" }], ["path", { d: "M18 17V9M13 17V5M8 17v-3" }]],
  sparkles: [["path", { d: "M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" }]],
  timer: [["path", { d: "M10 2h4" }], ["path", { d: "m12 14 3-3" }], ["circle", { cx: 12, cy: 14, r: 8 }]],
  circleDot: [["circle", { cx: 12, cy: 12, r: 10 }], ["circle", { cx: 12, cy: 12, r: 1 }]],
  eye: [["path", { d: "M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7" }], ["circle", { cx: 12, cy: 12, r: 3 }]],
  history: [["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" }], ["path", { d: "M3 3v5h5" }], ["path", { d: "M12 7v5l4 2" }]],
  refresh: [["path", { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" }], ["path", { d: "M21 3v5h-5" }], ["path", { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" }], ["path", { d: "M3 21v-5h5" }]],
  carton: [["path", { d: "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" }], ["path", { d: "M12 12 3.3 7M12 12l8.7-5M12 12v10" }]],
  banknote: [["rect", { x: 2, y: 6, width: 20, height: 12, rx: 2 }], ["circle", { cx: 12, cy: 12, r: 2 }], ["path", { d: "M6 12h.01M18 12h.01" }]],
  receipt: [["path", { d: "M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" }], ["path", { d: "M8 7h8M8 11h8M8 15h5" }]],
  filter: [["path", { d: "M22 3H2l8 9.46V19l4 2v-8.54Z" }]],
  settings: [["path", { d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" }], ["circle", { cx: 12, cy: 12, r: 3 }]],
  scan: [["path", { d: "M3 7V5a2 2 0 0 1 2-2h2" }], ["path", { d: "M17 3h2a2 2 0 0 1 2 2v2" }], ["path", { d: "M21 17v2a2 2 0 0 1-2 2h-2" }], ["path", { d: "M7 21H5a2 2 0 0 1-2-2v-2" }], ["path", { d: "M7 12h10" }]],
  wallet: [["path", { d: "M21 12V7H5a2 2 0 0 1 0-4h14v4" }], ["path", { d: "M3 5v14a2 2 0 0 0 2 2h16v-5" }], ["path", { d: "M18 12a2 2 0 0 0 0 4h4v-4Z" }]],
  creditCard: [["rect", { width: 20, height: 14, x: 2, y: 5, rx: 2 }], ["line", { x1: 2, x2: 22, y1: 10, y2: 10 }]],
  packagePlus: [["path", { d: "M16 16h6" }], ["path", { d: "M19 13v6" }], ["path", { d: "M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14" }], ["path", { d: "m7.5 4.27 9 5.15" }], ["polyline", { points: "3.29 7 12 12 20.71 7" }], ["line", { x1: 12, x2: 12, y1: 22, y2: 12 }]],
  chevronUp: [["path", { d: "m18 15-6-6-6 6" }]],
  arrowRight: [["path", { d: "M5 12h14" }], ["path", { d: "m12 5 7 7-7 7" }]],
  arrowLeft: [["path", { d: "M19 12H5" }], ["path", { d: "m12 19-7-7 7-7" }]],
  calendarDays: [["rect", { x: 3, y: 4, width: 18, height: 18, rx: 2 }], ["path", { d: "M16 2v4M8 2v4M3 10h18" }], ["path", { d: "M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" }]],
  play: [["path", { d: "m6 3 14 9-14 9V3" }]],
  layers: [["path", { d: "m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" }], ["path", { d: "m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" }], ["path", { d: "m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" }]],
  layoutGrid: [["rect", { x: 3, y: 3, width: 18, height: 18, rx: 2 }], ["path", { d: "M3 9h18M3 15h18M9 3v18M15 3v18" }]],
  shield: [["path", { d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" }]],
  lock: [["rect", { x: 3, y: 11, width: 18, height: 11, rx: 2 }], ["path", { d: "M7 11V7a5 5 0 0 1 10 0v4" }]],
  keyRound: [["path", { d: "M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" }], ["circle", { cx: 16.5, cy: 7.5, r: 0.5, fill: "currentColor" }]],
  fileDown: [["path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" }], ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }], ["path", { d: "M12 18v-6" }], ["path", { d: "m9 15 3 3 3-3" }]],
  columns: [["rect", { x: 3, y: 3, width: 18, height: 18, rx: 2 }], ["path", { d: "M9 3v18" }], ["path", { d: "M15 3v18" }]],
  keyboard: [["rect", { x: 2, y: 6, width: 20, height: 12, rx: 2 }], ["path", { d: "M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6" }]],
  link: [["path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }], ["path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" }]],
  zap: [["path", { d: "M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" }]],
  shieldCheck: [["path", { d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" }], ["path", { d: "m9 12 2 2 4-4" }]],
  userCheck: [["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }], ["circle", { cx: 9, cy: 7, r: 4 }], ["polyline", { points: "16 11 18 13 22 9" }]],
  bookOpen: [["path", { d: "M12 7v14" }], ["path", { d: "M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" }]],
  penLine: [["path", { d: "M12 20h9" }], ["path", { d: "M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" }]],
  handshake: [["path", { d: "m11 17 2 2a1 1 0 1 0 3-3" }], ["path", { d: "m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" }], ["path", { d: "m21 3 1 11h-2" }], ["path", { d: "M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" }], ["path", { d: "M3 4h8" }]],
  flaskConical: [["path", { d: "M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2" }], ["path", { d: "M8.5 2h7" }], ["path", { d: "M7 16h10" }]]
};
function Icon({ name = "check", className = "", size = 16, strokeWidth = 2 }) {
  const paths = P[name] || P.check;
  return (0, import_hz_jsx.jsxs)(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": strokeWidth,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      class: className,
      "aria-hidden": true,
      children: paths.map(([tag, attrs], i) => (0, import_hz_jsx.jsx)(tag, { ...attrs, key: i }))
    },
    void 0
  );
}
var I = (() => {
  const out = {};
  for (const name of Object.keys(P)) {
    out[name] = (p = {}) => Icon({ ...p, name });
  }
  return out;
})();

// hz-ext/src/lib/ui.tsx
var import_hz_react = __toESM(require_hz_react());
var import_hz_shell = __toESM(require_hz_shell());
var import_hz_cn = __toESM(require_hz_cn());
var import_hz_jalali = __toESM(require_hz_jalali());
var import_jsx_runtime = __toESM(require_jsx_runtime());

// hz-ext/src/lib/docs.tsx
var import_hz_jsx2 = __toESM(require_hz_jsx());
var FONT_FACES = [
  [400, "Regular"],
  [500, "Medium"],
  [600, "SemiBold"],
  [700, "Bold"],
  [800, "ExtraBold"]
].map(([w, n]) => `@font-face{font-family:'Vazirmatn';src:url(/fonts/Vazirmatn-${n}.woff2) format('woff2');font-weight:${w};font-display:swap}`).join("\n");

// hz-ext/src/lib/hz.ts
var { useState: useState2, useEffect: useEffect2, useMemo: useMemo2, useRef: useRef2, useCallback: useCallback2, useReducer, useContext, memo, Fragment } = import_hz_react2.default;
function fa(n) {
  if (n === null || n === void 0 || n === "") return "";
  const s = typeof n === "number" ? n.toLocaleString("en-US") : String(n);
  return s.replace(/\d/g, (d) => "\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9"[+d]);
}

// hz-ext/src/views/dashboard.tsx
var import_jsx_runtime2 = __toESM(require_jsx_runtime());
var MANAGERS = ["OWNER", "GM", "ADMIN", "EXEC"];
var SUPERS = ["OWNER", "GM", "ADMIN"];
var SHIFT_LABEL = { MORNING: "\u0634\u06CC\u0641\u062A \u0635\u0628\u062D", EVENING: "\u0634\u06CC\u0641\u062A \u0639\u0635\u0631", NIGHT: "\u0634\u06CC\u0641\u062A \u0634\u0628" };
var WIDGETS = [
  { key: "mytasks", title: "\u0648\u0638\u0627\u06CC\u0641 \u0645\u0646", icon: "clipboard", group: "day", go: "tasks/tasks", link: "\u0648\u0638\u0627\u06CC\u0641" },
  { key: "mychecklists", title: "\u0686\u06A9\u200C\u0644\u06CC\u0633\u062A\u200C\u0647\u0627\u06CC \u0627\u0645\u0631\u0648\u0632", icon: "check", group: "day", go: "tasks/checklists", link: "\u0686\u06A9\u200C\u0644\u06CC\u0633\u062A\u200C\u0647\u0627" },
  { key: "returnsWait", title: "\u0645\u0631\u062C\u0648\u0639\u06CC\u200C\u0647\u0627", icon: "receipt", group: "day", go: "returns/approvals", link: "\u0645\u0631\u062C\u0648\u0639\u06CC\u200C\u0647\u0627" },
  { key: "problems", title: "\u0645\u0634\u06A9\u0644\u0627\u062A \u0628\u0627\u0632", icon: "alertTriangle", group: "store", go: "tasks/problems", link: "\u0645\u0634\u06A9\u0644\u0627\u062A" },
  { key: "orders", title: "\u0633\u0641\u0627\u0631\u0634\u200C\u0647\u0627\u06CC \u0641\u0639\u0627\u0644", icon: "carton", group: "store", go: "supply/orders", link: "\u0633\u0641\u0627\u0631\u0634\u200C\u0647\u0627" },
  { key: "cheques", title: "\u0686\u06A9\u200C\u0647\u0627\u06CC \u0646\u0632\u062F\u06CC\u06A9", icon: "banknote", group: "store", go: "finance/cheques", link: "\u0686\u06A9\u200C\u0647\u0627" },
  { key: "lowstock", title: "\u06A9\u0645\u200C\u0645\u0648\u062C\u0648\u062F\u0647\u0627", icon: "trendingDown", group: "store", go: "supply/products", link: "\u06A9\u0627\u0644\u0627\u0647\u0627" },
  { key: "handover", title: "\u062A\u062D\u0648\u06CC\u0644 \u0634\u06CC\u0641\u062A", icon: "handshake", group: "team", go: "tasks/reports", link: "\u06AF\u0632\u0627\u0631\u0634\u200C\u0647\u0627" },
  { key: "wall", title: "\u062F\u06CC\u0648\u0627\u0631 \u062E\u0628\u0631\u06CC", icon: "send", group: "team", go: "tasks/wall", link: "\u0646\u0648\u0634\u062A\u0647\u200C\u0647\u0627" }
];
var GROUPS = [
  { key: "day", label: "\u0631\u0648\u0632 \u0645\u0646", dot: "bg-emerald-500", icon: "bg-emerald-100 text-emerald-700" },
  { key: "store", label: "\u0648\u0636\u0639\u06CC\u062A \u0641\u0631\u0648\u0634\u06AF\u0627\u0647", dot: "bg-amber-500", icon: "bg-amber-100 text-amber-700" },
  { key: "team", label: "\u062A\u06CC\u0645 \u0648 \u0627\u0631\u062A\u0628\u0627\u0637\u0627\u062A", dot: "bg-teal-500", icon: "bg-teal-50 text-teal-700" }
];
var QUICK_ACTIONS = [
  { label: "\u062B\u0628\u062A \u0645\u0631\u062C\u0648\u0639\u06CC", icon: "receipt", go: "returns/new", roles: [...MANAGERS, "CASHIER", "HC"] },
  { label: "\u0633\u0641\u0627\u0631\u0634 \u062C\u062F\u06CC\u062F", icon: "packagePlus", go: "supply/orders", roles: [...MANAGERS, "PM", "SK", "ACC"] },
  { label: "\u06A9\u0646\u062A\u0631\u0644 \u0642\u06CC\u0645\u062A", icon: "scan", go: "store/pricecheck", roles: [...MANAGERS, "PM"] },
  { label: "\u0686\u06A9 \u062C\u062F\u06CC\u062F", icon: "banknote", go: "finance/cheques", roles: ["OWNER", "GM", "ADMIN", "ACC"] },
  { label: "\u06AF\u0632\u0627\u0631\u0634 \u0634\u06CC\u0641\u062A", icon: "penLine", go: "tasks/reports", roles: ["*"] }
];
function canSee(user, route, roles) {
  if (!user) return false;
  const r = String(user.role || "");
  if (SUPERS.includes(r)) return true;
  const allow = Array.isArray(user.pageAllow) ? user.pageAllow : [];
  const deny = Array.isArray(user.pageDeny) ? user.pageDeny : [];
  if (allow.includes(route)) return true;
  if (deny.includes(route)) return false;
  return roles.includes("*") || roles.includes(r);
}
var DEFAULT_PREFS = WIDGETS.map((w, i) => ({ key: w.key, visible: true, order: i }));
function mergePrefs(savedRaw) {
  const saved = Array.isArray(savedRaw) ? savedRaw : [];
  const byKey = /* @__PURE__ */ new Map();
  for (const s of saved) if (s && typeof s.key === "string") byKey.set(s.key, s);
  const known = WIDGETS.filter((w) => byKey.has(w.key)).map((w) => ({
    key: w.key,
    visible: byKey.get(w.key).visible !== false,
    order: Number(byKey.get(w.key).order) || 0
  })).sort(
    (a, b) => a.order - b.order || WIDGETS.findIndex((x) => x.key === a.key) - WIDGETS.findIndex((x) => x.key === b.key)
  );
  const knownSet = new Set(known.map((k) => k.key));
  const missing = WIDGETS.filter((w) => !knownSet.has(w.key));
  return [...known, ...missing.map((w, i) => ({ key: w.key, visible: true, order: known.length + i }))];
}
function longFa(dash) {
  const d = (0, import_hz_jalali2.parseJalali)(String(dash || ""));
  return d ? (0, import_hz_jalali2.toFaDigits)((0, import_hz_jalali2.formatJalaliLong)(d)) : (0, import_hz_jalali2.toFaDigits)(String(dash || "\u2014"));
}
function truncFa(s, n = 80) {
  const t = String(s || "");
  return t.length > n ? `${t.slice(0, n)}\u2026` : t;
}
function spanFor(index, count) {
  if (index !== count - 1) return "";
  const sm = 2 - (count - 1) % 2;
  return (0, import_hz_cn2.cn)(sm === 2 && "sm:col-span-2");
}
function Chip({ icon, text, tone }) {
  const tones = {
    rose: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700"
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: (0, import_hz_cn2.cn)("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold", tones[tone]), children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Icon, { name: icon, className: "h-3.5 w-3.5" }),
    text
  ] });
}
function BigNum({ value, suffix, tone }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-baseline gap-1.5", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: (0, import_hz_cn2.cn)("num text-xl font-black", tone || "text-stone-700"), children: value }),
    suffix ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-[11px] text-stone-500", children: suffix }) : null
  ] });
}
function EmptyOk({ text = "\u0645\u0648\u0631\u062F\u06CC \u0646\u06CC\u0633\u062A" }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center gap-1.5 text-sm text-stone-400", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(I.check, { className: "h-4 w-4 text-emerald-500" }),
    text
  ] });
}
function Tile({ def, span, iconCls, meta, onClick, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    import_hz_card.Card,
    {
      className: (0, import_hz_cn2.cn)("group cursor-pointer gap-0 py-0 transition hover:border-emerald-400 hover:shadow-md", span),
      role: "button",
      tabIndex: 0,
      "aria-label": def.title,
      onClick,
      onKeyDown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      },
      children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_hz_card.CardContent, { className: "flex h-full flex-col p-3.5", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center gap-2.5", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: (0, import_hz_cn2.cn)("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", iconCls), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Icon, { name: def.icon, className: "h-4 w-4" }) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "min-w-0 flex-1 truncate text-[13px] font-bold text-stone-700", children: def.title })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mt-2 flex-1", children }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mt-1.5 flex items-end justify-between gap-2", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "min-w-0 truncate text-[11px] leading-5 text-stone-500", children: meta || "" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "flex shrink-0 items-center gap-0.5 text-[11px] font-bold text-stone-400 transition-colors group-hover:text-primary", children: [
            "\u0647\u0645\u0647 ",
            def.link,
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(I.arrowLeft, { size: 12 })
          ] })
        ] })
      ] })
    }
  );
}
function DashboardView() {
  const { user, go } = (0, import_hz_shell2.useShell)();
  const [loading, setLoading] = useState2(true);
  const [loadErr, setLoadErr] = useState2(false);
  const [data, setData] = useState2(null);
  const [prefs, setPrefs] = useState2(DEFAULT_PREFS);
  const [pzOpen, setPzOpen] = useState2(false);
  const [draft, setDraft] = useState2([]);
  const [saving, setSaving] = useState2(false);
  useEffect2(() => {
    void load();
  }, []);
  async function load() {
    setLoading(true);
    setLoadErr(false);
    const [home, prefsR] = await Promise.all([
      (0, import_hz_api.api)("/api/home"),
      (0, import_hz_api.api)("/api/me/prefs")
    ]);
    if (prefsR && prefsR.ok && prefsR.data?.prefs?.dash) {
      try {
        setPrefs(mergePrefs(prefsR.data.prefs.dash.widgets));
      } catch {
      }
    }
    setLoading(false);
    if (!home || !home.ok) {
      setLoadErr(true);
      import_hz_toast.toast.error(home?.error || "\u062E\u0637\u0627 \u062F\u0631 \u062F\u0631\u06CC\u0627\u0641\u062A \u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0645\u06CC\u0632\u06A9\u0627\u0631");
      return;
    }
    setData(home.data || null);
  }
  const isManager = !!user && MANAGERS.includes(String(user.role));
  const today = (0, import_hz_jalali2.todayJalali)();
  const hour = (/* @__PURE__ */ new Date()).getHours();
  const greeting = hour < 12 ? "\u0635\u0628\u062D \u0628\u062E\u06CC\u0631" : hour < 17 ? "\u0638\u0647\u0631 \u0628\u062E\u06CC\u0631" : hour < 20 ? "\u0639\u0635\u0631 \u0628\u062E\u06CC\u0631" : "\u0634\u0628 \u0628\u062E\u06CC\u0631";
  const weekday = String((0, import_hz_jalali2.jalaliWeekday)(/* @__PURE__ */ new Date()) || "");
  const dateLong = (0, import_hz_jalali2.toFaDigits)(String((0, import_hz_jalali2.formatJalaliLong)(/* @__PURE__ */ new Date()) || ""));
  const myShift = useMemo2(() => {
    const shifts = data?.todayShifts || [];
    return shifts.find((s) => s?.user?.id && s.user.id === user?.id) || null;
  }, [data, user]);
  const stats = data?.stats || {};
  const tasks = data?.myTasks || [];
  const tasksOpen = tasks.length;
  const tasksOverdue = tasks.filter((t) => t && t.dueDate && String(t.dueDate) < today).length;
  const tasksInProgress = tasks.filter((t) => t && t.status === "IN_PROGRESS").length;
  const clCards = data?.checklistCards || [];
  const clTotal = clCards.reduce((s, c) => s + (Number(c.total) || 0), 0);
  const clDone = clCards.reduce((s, c) => s + (Number(c.done) || 0), 0);
  const pendingReturns = Number(stats.pendingReturns) || 0;
  const myReturnsToday = Number(stats.myReturnsToday) || 0;
  const problemsOpen = Number(data?.problemsOpen) || 0;
  const activeOrders = Number(stats.activeOrders) || 0;
  const receivingQueue = Number(stats.receivingQueue) || 0;
  const chequesDue = Number(stats.chequesDue) || 0;
  const lowCount = Number(stats.lowStock) || 0;
  const lowTop3 = data?.lowStockTop3 || [];
  const handover = data?.handoverLatest || null;
  const wallPosts = (data?.wall || []).slice(0, 2);
  const myRank = Number(data?.myRank) || 0;
  const actions = QUICK_ACTIONS.filter((a) => canSee(user, a.go, a.roles));
  const orderedDefs = useMemo2(() => {
    return prefs.slice().sort((a, b) => a.order - b.order).filter((p) => p.visible).map((p) => WIDGETS.find((w) => w.key === p.key)).filter(Boolean);
  }, [prefs]);
  function openPz() {
    setDraft(prefs.map((p) => ({ ...p })));
    setPzOpen(true);
  }
  function moveDraft(key, dir) {
    setDraft((prev) => {
      const arr = prev.map((p) => ({ ...p }));
      const i = arr.findIndex((p) => p.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return prev;
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
      return arr;
    });
  }
  function toggleDraft(key, visible) {
    setDraft((prev) => prev.map((p) => p.key === key ? { ...p, visible } : p));
  }
  async function savePz() {
    setSaving(true);
    const payload = draft.map((p, i) => ({ key: p.key, visible: p.visible, order: i }));
    const r = await (0, import_hz_api.api)("/api/me/prefs", { method: "POST", body: { prefs: { dash: { widgets: payload } } } });
    setSaving(false);
    if (!r || !r.ok) return import_hz_toast.toast.error(r?.error || "\u0630\u062E\u06CC\u0631\u0647 \u062A\u0631\u062C\u06CC\u062D\u0627\u062A \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F");
    setPrefs(draft.map((p, i) => ({ ...p, order: i })));
    setPzOpen(false);
    import_hz_toast.toast.success("\u0686\u06CC\u062F\u0645\u0627\u0646 \u0645\u06CC\u0632\u06A9\u0627\u0631 \u0634\u0645\u0627 \u0630\u062E\u06CC\u0631\u0647 \u0634\u062F");
  }
  function renderTile(def, span) {
    const g = GROUPS.find((x) => x.key === def.group);
    let iconCls = g.icon;
    let body = null;
    let meta = "";
    if (def.key === "mytasks") {
      if (tasksOverdue > 0) iconCls = "bg-rose-100 text-rose-700";
      body = tasksOpen === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(EmptyOk, { text: "\u0648\u0638\u06CC\u0641\u0647\u0654 \u0628\u0627\u0632\u06CC \u0646\u062F\u0627\u0631\u06CC\u062F" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(BigNum, { value: `${tasksOpen >= 8 ? "+" : ""}${fa(tasksOpen)}`, suffix: "\u0648\u0638\u06CC\u0641\u0647\u0654 \u0628\u0627\u0632" }),
        tasksOverdue > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mt-1.5", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Chip, { icon: "alertTriangle", tone: "rose", text: `${fa(tasksOverdue)} \u0645\u0648\u0631\u062F \u0627\u0632 \u0633\u0631\u0633\u06CC\u062F \u06AF\u0630\u0634\u062A\u0647` }) }) : null
      ] });
      meta = tasksOverdue > 0 ? "\u0627\u0648\u0644\u0648\u06CC\u062A \u0627\u0648\u0644 \u0627\u0645\u0631\u0648\u0632 \u0634\u0645\u0627" : tasksInProgress > 0 ? `${fa(tasksInProgress)} \u0645\u0648\u0631\u062F \u062F\u0631 \u062D\u0627\u0644 \u0627\u0646\u062C\u0627\u0645` : "\u0628\u0647\u200C\u0631\u0648\u0632";
    } else if (def.key === "mychecklists") {
      body = clTotal === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(EmptyOk, { text: "\u0686\u06A9\u200C\u0644\u06CC\u0633\u062A\u06CC \u0628\u0631\u0627\u06CC \u0627\u0645\u0631\u0648\u0632 \u062B\u0628\u062A \u0646\u0634\u062F\u0647" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(BigNum, { value: `${fa(clDone)} \u0627\u0632 ${fa(clTotal)}`, suffix: "\u0645\u0648\u0631\u062F \u0627\u0646\u062C\u0627\u0645\u200C\u0634\u062F\u0647" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_hz_progress.Progress, { value: Math.round(clDone / Math.max(1, clTotal) * 100), className: "mt-2.5 h-2" })
      ] });
      meta = clTotal > 0 ? `${fa(clTotal - clDone)} \u0645\u0648\u0631\u062F \u0628\u0627\u0642\u06CC\u200C\u0645\u0627\u0646\u062F\u0647` : "\u0627\u0645\u0631\u0648\u0632 \u0686\u06A9\u200C\u0644\u06CC\u0633\u062A\u06CC \u0646\u062F\u0627\u0631\u06CC\u062F";
    } else if (def.key === "returnsWait") {
      if (isManager && pendingReturns > 0) iconCls = "bg-rose-100 text-rose-700";
      body = pendingReturns === 0 ? myReturnsToday === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(EmptyOk, {}) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(BigNum, { value: fa(myReturnsToday), suffix: "\u0645\u0631\u062C\u0648\u0639\u06CC \u0627\u0645\u0631\u0648\u0632 \u0645\u0646" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          BigNum,
          {
            value: fa(pendingReturns),
            suffix: "\u062F\u0631 \u0627\u0646\u062A\u0638\u0627\u0631 \u062A\u0623\u06CC\u06CC\u062F",
            tone: isManager ? "text-rose-600" : "text-amber-700"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mt-1.5", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "button",
          {
            type: "button",
            onClick: (e) => {
              e.stopPropagation();
              go("returns/history");
            },
            className: "inline-flex items-center gap-1 rounded-full bg-stone-50 px-2 py-0.5 text-[11px] font-medium text-stone-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700",
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(I.receipt, { className: "h-3 w-3" }),
              "\u0645\u0631\u062C\u0648\u0639\u06CC \u0627\u0645\u0631\u0648\u0632 \u0645\u0646: ",
              fa(myReturnsToday)
            ]
          }
        ) })
      ] });
      meta = isManager ? pendingReturns > 0 ? "\u0646\u06CC\u0627\u0632\u0645\u0646\u062F \u062A\u0623\u06CC\u06CC\u062F \u0634\u0645\u0627" : "\u0635\u0641 \u062A\u0623\u06CC\u06CC\u062F \u062E\u0627\u0644\u06CC \u0627\u0633\u062A" : "\u0645\u0631\u062C\u0648\u0639\u06CC\u200C\u0647\u0627\u06CC \u062B\u0628\u062A\u200C\u0634\u062F\u0647\u0654 \u0627\u0645\u0631\u0648\u0632 \u0634\u0645\u0627";
    } else if (def.key === "problems") {
      body = problemsOpen === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(EmptyOk, {}) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(BigNum, { value: fa(problemsOpen), suffix: "\u0645\u0634\u06A9\u0644 \u0628\u0627\u0632", tone: "text-amber-700" });
      meta = problemsOpen > 0 ? "\u0628\u0627\u0632 \u06CC\u0627 \u062F\u0631 \u062D\u0627\u0644 \u0628\u0631\u0631\u0633\u06CC" : "\u0645\u0634\u06A9\u0644\u06CC \u0628\u0627\u0632 \u0646\u06CC\u0633\u062A";
    } else if (def.key === "orders") {
      body = activeOrders === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(EmptyOk, {}) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(BigNum, { value: fa(activeOrders), suffix: "\u0633\u0641\u0627\u0631\u0634 \u0641\u0639\u0627\u0644" });
      meta = receivingQueue > 0 ? `${fa(receivingQueue)} \u062F\u0631 \u062D\u0627\u0644 \u062F\u0631\u06CC\u0627\u0641\u062A` : "\u062F\u0631 \u062C\u0631\u06CC\u0627\u0646 \u062A\u0623\u0645\u06CC\u0646";
    } else if (def.key === "cheques") {
      body = chequesDue === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(EmptyOk, {}) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(BigNum, { value: fa(chequesDue), suffix: "\u0686\u06A9 \u062A\u0627 \u06F7 \u0631\u0648\u0632 \u0622\u06CC\u0646\u062F\u0647", tone: "text-amber-700" });
      meta = chequesDue > 0 ? "\u0633\u0631\u0633\u06CC\u062F \u0646\u0632\u062F\u06CC\u06A9 \u2014 \u0628\u0631\u0631\u0633\u06CC \u0645\u0648\u062C\u0648\u062F\u06CC" : "\u0686\u06A9\u06CC \u062F\u0631 \u06F7 \u0631\u0648\u0632 \u0622\u06CC\u0646\u062F\u0647 \u0633\u0631\u0633\u06CC\u062F \u0646\u0645\u06CC\u200C\u0634\u0648\u062F";
    } else if (def.key === "lowstock") {
      if (lowTop3.length > 0 && lowTop3.every((p) => Number(p.stock) <= 0)) iconCls = "bg-rose-100 text-rose-700";
      body = lowCount === 0 && lowTop3.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(EmptyOk, {}) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(BigNum, { value: fa(lowCount || lowTop3.length), suffix: "\u06A9\u0627\u0644\u0627 \u0632\u06CC\u0631 \u0622\u0633\u062A\u0627\u0646\u0647", tone: "text-amber-700" }),
        lowTop3.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mt-2 space-y-1", children: lowTop3.map((p) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center justify-between gap-2 text-[12px] leading-5", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "min-w-0 flex-1 truncate text-stone-600", children: p.name }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: (0, import_hz_cn2.cn)("num shrink-0 font-bold", Number(p.stock) <= 0 ? "text-rose-600" : "text-amber-700"), children: fa(Number(p.stock) || 0) })
        ] }, p.id)) }) : null
      ] });
      meta = "\u0628\u062D\u0631\u0627\u0646\u06CC\u200C\u062A\u0631\u06CC\u0646\u200C\u0647\u0627 \u0628\u0631 \u0627\u0633\u0627\u0633 \u0622\u0633\u062A\u0627\u0646\u0647\u0654 \u0647\u0648\u0634\u0645\u0646\u062F";
    } else if (def.key === "handover") {
      body = !handover ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(EmptyOk, { text: "\u06AF\u0632\u0627\u0631\u0634\u06CC \u062B\u0628\u062A \u0646\u0634\u062F\u0647" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: (0, import_hz_cn2.cn)(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold",
          handover.acknowledged ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
        ), children: [
          handover.acknowledged ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(I.check, { className: "h-3.5 w-3.5" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(I.clock, { className: "h-3.5 w-3.5" }),
          handover.acknowledged ? "\u062A\u062D\u0648\u06CC\u0644 \u062A\u0623\u06CC\u06CC\u062F \u0634\u062F" : "\u062F\u0631 \u0627\u0646\u062A\u0638\u0627\u0631 \u062A\u0623\u06CC\u06CC\u062F \u062F\u0631\u06CC\u0627\u0641\u062A"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mt-2 truncate text-[12px] leading-6 text-stone-600", children: [
          handover.author?.fullName || "\u2014",
          " \xB7 ",
          SHIFT_LABEL[handover.shift] || "\u0634\u06CC\u0641\u062A",
          " \xB7 ",
          longFa(handover.date)
        ] })
      ] });
      meta = handover ? handover.acknowledged ? "\u062F\u0631\u06CC\u0627\u0641\u062A\u200C\u0634\u062F\u0647 \u062A\u0648\u0633\u0637 \u0634\u06CC\u0641\u062A \u0628\u0639\u062F" : "\u062A\u0623\u06CC\u06CC\u062F \u062F\u0631\u06CC\u0627\u0641\u062A \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F\u0647" : "\u0622\u062E\u0631\u06CC\u0646 \u06AF\u0632\u0627\u0631\u0634 \u062A\u062D\u0648\u06CC\u0644 \u0634\u06CC\u0641\u062A";
    } else if (def.key === "wall") {
      body = wallPosts.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(EmptyOk, { text: "\u067E\u0633\u062A\u06CC \u062B\u0628\u062A \u0646\u0634\u062F\u0647" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "space-y-1.5", children: wallPosts.map((p) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "rounded-lg bg-stone-50 px-2.5 py-1.5 text-[12px] leading-5 text-stone-600", children: [
        p.pinned ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "font-bold text-amber-700", children: "\u0633\u0646\u062C\u0627\u0642\u200C\u0634\u062F\u0647 \xB7 " }) : null,
        truncFa(p.content, 80)
      ] }, p.id)) });
      const latestIso = wallPosts.reduce(
        (m, p) => p?.createdAt && String(p.createdAt) > m ? String(p.createdAt) : m,
        ""
      );
      meta = latestIso ? `\u0622\u062E\u0631\u06CC\u0646 \u067E\u0633\u062A: ${longFa((0, import_hz_jalali2.formatJalali)(new Date(latestIso)))}` : "\u0622\u062E\u0631\u06CC\u0646\u200C\u0647\u0627\u06CC \u062F\u06CC\u0648\u0627\u0631 \u062E\u0628\u0631\u06CC";
    }
    const target = def.key === "returnsWait" && !isManager ? "returns/history" : def.go;
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Tile, { def, span, iconCls, meta, onClick: () => go(target), children: body }, def.key);
  }
  if (loading) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mx-auto w-full max-w-6xl space-y-4", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "h-24 animate-pulse rounded-xl bg-stone-100" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-2", children: [1, 2, 3, 4, 5, 6].map((i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "h-32 animate-pulse rounded-xl bg-stone-100" }, i)) })
    ] });
  }
  const rankSuffix = myRank >= 1 && myRank <= 5 ? ` \xB7 \u0631\u062A\u0628\u0647\u0654 ${fa(myRank)}` : "";
  function renderGroup(g) {
    const defs = orderedDefs.filter((d) => d.group === g.key);
    if (defs.length === 0) return null;
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: "space-y-1.5", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("h3", { className: "flex items-center gap-1.5 text-xs font-bold text-stone-500", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: (0, import_hz_cn2.cn)("h-1.5 w-1.5 rounded-full", g.dot) }),
        g.label,
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "text-[10px] font-medium text-stone-400", children: [
          "(",
          fa(defs.length),
          " \u06A9\u0627\u0631\u062A)"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "grid grid-cols-1 gap-2.5 sm:grid-cols-2", children: defs.map((def, i) => renderTile(def, spanFor(i, defs.length))) })
    ] }, g.key);
  }
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mx-auto w-full max-w-6xl space-y-4", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex flex-wrap items-stretch gap-2.5", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_hz_card.Card, { className: "min-w-[240px] flex-1 gap-0 py-0", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_hz_card.CardContent, { className: "p-3.5 sm:p-4", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-start gap-2.5", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(I.sparkles, { className: "h-5 w-5" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "min-w-0 flex-1", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "truncate text-base font-extrabold text-stone-700", children: [
            greeting,
            "\u060C ",
            user?.honorific ? `${user.honorific} ` : "",
            user?.fullName || "\u0647\u0645\u06A9\u0627\u0631 \u06AF\u0631\u0627\u0645\u06CC"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mt-0.5 flex items-center gap-1.5 text-[11px] text-stone-500", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(I.calendarDays, { className: "h-3.5 w-3.5 text-emerald-600" }),
            weekday ? `${weekday} ` : "",
            dateLong
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mt-2 flex flex-wrap gap-1.5", children: [
            user?.roleLabel || user?.title ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[10.5px] font-bold text-stone-600", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(I.userCheck, { className: "h-3 w-3" }),
              user.roleLabel || user.title
            ] }) : null,
            data ? myShift ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(I.clock, { className: "h-3 w-3" }),
              SHIFT_LABEL[myShift.shiftType || myShift.shift] || "\u0634\u06CC\u0641\u062A \u0627\u0645\u0631\u0648\u0632"
            ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[10.5px] font-bold text-stone-400", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(I.clock, { className: "h-3 w-3" }),
              "\u0628\u062F\u0648\u0646 \u0634\u06CC\u0641\u062A \u0627\u0645\u0631\u0648\u0632"
            ] }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-bold text-amber-700", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(I.sparkles, { className: "h-3 w-3" }),
              fa(Number(user?.points) || 0),
              " \u0627\u0645\u062A\u06CC\u0627\u0632",
              rankSuffix
            ] })
          ] })
        ] })
      ] }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex flex-wrap items-start gap-2", children: [
        actions.map((a) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_hz_button.Button, { variant: "outline", size: "sm", className: "gap-1.5", onClick: () => go(a.go), children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Icon, { name: a.icon, size: 14 }),
          a.label
        ] }, a.go)),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_hz_button.Button, { variant: "outline", size: "sm", className: "gap-1.5", onClick: openPz, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(I.settings, { size: 14 }),
          "\u0634\u062E\u0635\u06CC\u200C\u0633\u0627\u0632\u06CC"
        ] })
      ] })
    ] }),
    loadErr ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_hz_card.Card, { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_hz_card.CardContent, { className: "p-8 text-center", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(I.alertTriangle, { className: "mx-auto mb-3 text-amber-500", size: 22 }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-sm text-stone-500", children: "\u062F\u0631\u06CC\u0627\u0641\u062A \u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0645\u06CC\u0632\u06A9\u0627\u0631 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mt-4", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_hz_button.Button, { variant: "outline", size: "sm", className: "gap-1.5", onClick: () => void load(), children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(I.refresh, { size: 14 }),
        "\u062A\u0644\u0627\u0634 \u062F\u0648\u0628\u0627\u0631\u0647"
      ] }) })
    ] }) }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "grid grid-cols-1 gap-4 xl:grid-cols-2", children: [
        renderGroup(GROUPS[0]),
        renderGroup(GROUPS[1])
      ] }),
      renderGroup(GROUPS[2])
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_hz_dialog.Dialog, { open: pzOpen, onOpenChange: setPzOpen, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_hz_dialog.DialogContent, { className: "sm:max-w-md", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_hz_dialog.DialogHeader, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_hz_dialog.DialogTitle, { children: "\u0634\u062E\u0635\u06CC\u200C\u0633\u0627\u0632\u06CC \u0645\u06CC\u0632\u06A9\u0627\u0631" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_hz_dialog.DialogDescription, { children: "\u06A9\u0627\u0631\u062A\u200C\u0647\u0627 \u0631\u0627 \u0646\u0645\u0627\u06CC\u0634 \u06CC\u0627 \u067E\u0646\u0647\u0627\u0646 \u06A9\u0646\u06CC\u062F \u0648 \u0628\u0627 \u067E\u06CC\u06A9\u0627\u0646\u200C\u0647\u0627\u06CC \u0628\u0627\u0644\u0627/\u067E\u0627\u06CC\u06CC\u0646 \u062C\u0627\u0628\u0647\u200C\u062C\u0627 \u06A9\u0646\u06CC\u062F \u2014 \u062A\u0631\u062A\u06CC\u0628 \u0647\u0645\u06CC\u0646 \u0644\u06CC\u0633\u062A\u060C \u062A\u0631\u062A\u06CC\u0628 \u0645\u06CC\u0632\u06A9\u0627\u0631 \u0634\u0645\u0627\u0633\u062A." })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "max-h-[60vh] space-y-1.5 overflow-y-auto", children: draft.map((p, idx) => {
        const def = WIDGETS.find((w) => w.key === p.key);
        if (!def) return null;
        const g = GROUPS.find((x) => x.key === def.group);
        return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center gap-2 rounded-lg border border-stone-200 bg-white p-2", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            import_hz_checkbox.Checkbox,
            {
              checked: p.visible,
              onCheckedChange: (v) => toggleDraft(p.key, v === true),
              "aria-label": `\u0646\u0645\u0627\u06CC\u0634 ${def.title}`
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: (0, import_hz_cn2.cn)("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", g.icon), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Icon, { name: def.icon, className: "h-4 w-4" }) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "min-w-0 flex-1", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: (0, import_hz_cn2.cn)("truncate text-[13px] font-bold text-stone-700", !p.visible && "text-stone-400"), children: def.title }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "text-[10px] text-stone-500", children: g.label })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex shrink-0 flex-col gap-0.5", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              import_hz_button.Button,
              {
                variant: "outline",
                size: "icon",
                className: "size-7",
                disabled: idx === 0,
                onClick: () => moveDraft(p.key, -1),
                "aria-label": `\u062C\u0627\u0628\u0647\u200C\u062C\u0627\u06CC\u06CC ${def.title} \u0628\u0647 \u0628\u0627\u0644\u0627`,
                children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(I.chevronUp, { size: 13 })
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              import_hz_button.Button,
              {
                variant: "outline",
                size: "icon",
                className: "size-7",
                disabled: idx === draft.length - 1,
                onClick: () => moveDraft(p.key, 1),
                "aria-label": `\u062C\u0627\u0628\u0647\u200C\u062C\u0627\u06CC\u06CC ${def.title} \u0628\u0647 \u067E\u0627\u06CC\u06CC\u0646`,
                children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(I.chevronDown, { size: 13 })
              }
            )
          ] })
        ] }, p.key);
      }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-[10px] text-stone-400", children: "\xAB\u062E\u0644\u0627\u0635\u0647\u0654 \u0627\u0645\u0631\u0648\u0632 \u0645\u0646\xBB \u0647\u0645\u06CC\u0634\u0647 \u0628\u0627\u0644\u0627\u06CC \u0645\u06CC\u0632\u06A9\u0627\u0631 \u0646\u0645\u0627\u06CC\u0634 \u062F\u0627\u062F\u0647 \u0645\u06CC\u200C\u0634\u0648\u062F \u0648 \u0642\u0627\u0628\u0644 \u067E\u0646\u0647\u0627\u0646\u200C\u0633\u0627\u0632\u06CC \u0646\u06CC\u0633\u062A." }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_hz_dialog.DialogFooter, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_hz_button.Button, { variant: "outline", onClick: () => setPzOpen(false), children: "\u0627\u0646\u0635\u0631\u0627\u0641" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_hz_button.Button, { onClick: () => void savePz(), disabled: saving, children: saving ? "\u062F\u0631 \u062D\u0627\u0644 \u0630\u062E\u06CC\u0631\u0647\u2026" : "\u0630\u062E\u06CC\u0631\u0647" })
      ] })
    ] }) })
  ] });
}

})(__m,__m.exports);(globalThis.__HZ_VIEW__=(__m.exports&&__m.exports.default)||__m.exports);})();
