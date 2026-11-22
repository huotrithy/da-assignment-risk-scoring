// Render the slide icons (simple line drawings defined below) to white-on-transparent PNGs in docs/img/icons.
// generate_slides.js places them on coloured circles. Usage: node new_version_berka/scripts/make_icons.js   (needs Microsoft Edge)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const OUT = path.join(__dirname, '..', '..', 'docs', 'img', 'icons');

// 24 x 24 grid, drawn with a round 2 px stroke.
const ICONS = {
  alert: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.3v.1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  bank: '<path d="M3 10 12 4l9 6z"/><path d="M5.5 10v7.5M10 10v7.5M14 10v7.5M18.5 10v7.5M3 20.5h18"/>',
  eye: '<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6.5"/>',
  database: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17.5 14.2c2.4.5 4 2.6 4 5.3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  money: '<rect x="2.5" y="6.5" width="19" height="11" rx="1.5"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.1M18 12h.1"/>',
  scale: '<path d="M12 4v16M7.5 20h9M5 7h14"/><path d="m5 7-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z"/>',
  layers: '<path d="m12 3 9 4.5-9 4.5-9-4.5z"/><path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5v-3a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 7.5h7M8.5 12h.1M12 12h.1M15.5 12h.1M8.5 16h.1M12 16h.1M15.5 16h.1"/>',
  download: '<path d="M12 3v12M7 10.5l5 5 5-5M4 20.5h16"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M10 4v16"/>',
  bars: '<path d="M3 20.5h18M7 20v-7M12 20V5M17 20V10"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20.5h8M12 16v4.5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20.5 20.5-5.3-5.3"/>',
  flask: '<path d="M9 3h6M10 3v6l-5.5 9.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3M7.5 15h9"/>',
  refresh: '<path d="M20 11A8 8 0 0 0 5.5 7L4 9M4 4v5h5M4 13a8 8 0 0 0 14.5 4L20 15M20 20v-5h-5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3.5 3 3.5 15 0 18M12 3c-3.5 3-3.5 15 0 18"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 256, height: 256 } });
  for (const [name, body] of Object.entries(ICONS)) {
    await page.setContent(`<body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg></body>`);
    await page.screenshot({ path: path.join(OUT, `${name}.png`), omitBackground: true });
  }
  await browser.close();
  console.log(`saved ${Object.keys(ICONS).length} icons to docs/img/icons`);
})().catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; });
