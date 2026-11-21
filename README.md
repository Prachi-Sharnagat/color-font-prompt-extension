<div align="center">

# PickType

**Pick any color, identify the exact font, and extract a site's design system, all from one Chrome extension.**

<!-- Replace with your real badges after the first release -->
![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)
![License](https://img.shields.io/badge/license-MIT-green)
![Privacy](https://img.shields.io/badge/data-stays%20local-brightgreen)

<!-- Add a demo GIF here: docs/demo.gif -->

</div>

> **PickType** is a placeholder name. Replace it everywhere before publishing.

---

## What it does

| Tool | What you get |
|---|---|
| **Color Picker** | Click the icon, a magnifier loupe follows your cursor, click any pixel to get HEX, RGB, HSL and OKLCH with one-click copy. |
| **Font Detector** | Hover and click any text to see the font, size, weight, line-height, letter-spacing, color and WCAG contrast. |
| **Exact Font Mode** | Reads the font Chrome actually rendered (the same data as DevTools > Computed > Rendered Fonts), not just the CSS stack. |
| **Page Palette** | The top colors on the current page, ranked by usage. |
| **design.md Generator** | Extracts a site's design system (colors, type scale, spacing, radii, shadows, components) into a markdown file you can paste into any AI model. |
| **Recreation Prompt** *(roadmap)* | Analyzes layout, CSS motion, GSAP and Three.js, and outputs a structured prompt for rebuilding a similar page with placeholders instead of real content. |

---

## Features

### Color Picker
- Screenshot-based sampling with a zoomed pixel loupe
- Correct on retina and zoomed screens (devicePixelRatio aware)
- Native EyeDropper API fallback
- HEX, RGB, HSL and OKLCH output
- Last 20 colors saved locally, with click-to-copy

### Font Detector
- Highlights the element under your cursor
- Shows the full CSS font stack and flags fonts that failed to load
- **Exact mode** (optional `debugger` permission) reports the real rendered font, whether it is a web or system font, and the font source
- Links to Google Fonts when applicable (no font file downloads)
- WCAG AA/AAA contrast check against the effective background
- Handles open shadow roots and same-origin iframes
- Every result is labeled **Exact**, **Estimated** or **Not detectable**

### design.md Generator
- Color roles (background, surface, text, border, accent) clustered by perceptual distance
- Type scale, spacing scale, radii and shadow tokens
- Existing CSS variables and media-query breakpoints
- Button, card, input and nav patterns with hover and focus states
- Exports: Markdown, CSS variables, Tailwind config
- Output describes **style rules only**: no logos, brand images or copyrighted text

---

## Install

### From the Chrome Web Store
*Coming soon:* `https://chromewebstore.google.com/detail/<your-extension-id>`

### From source (development)

**Requirements:** Node.js 20+ and npm (or pnpm).

```bash
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>
npm install
npm run dev
```

Then load the extension in Chrome:

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select the `.output/chrome-mv3` folder

### Build for production

```bash
npm run build
npm run zip
```

The zip file is created in `.output/`.

---

## Usage

1. Open any regular website (extensions can't run on `chrome://` pages, the Chrome Web Store or the PDF viewer).
2. Click the extension icon.
3. Choose a tool:
   - **Pick Color:** move the loupe, click to capture, copy any format.
   - **Detect Font:** hover to highlight, click to open the font card.
   - **Page Palette:** see the top colors on the page.
   - **Generate design.md:** preview, toggle sections, then copy or download.
4. Press **Esc** at any time to exit and remove everything the extension added to the page.

### Enabling Exact Font Mode

Exact mode uses Chrome's `debugger` permission, which is **optional** and requested only when you turn it on. While the font is being read, Chrome briefly shows a "started debugging this browser" banner. PickType attaches only after you click a text element and detaches immediately afterward. If you decline, the extension falls back to an estimated result and labels it clearly.

---

## Permissions

| Permission | Why it's needed |
|---|---|
| `activeTab` | Access the current tab only after you click the icon |
| `scripting` | Inject the picker and detector into that tab |
| `storage` | Save recent colors, settings and generated files locally |
| `clipboardWrite` | Copy colors and generated files |
| `debugger` *(optional)* | Read the exact rendered font via the Chrome DevTools Protocol |

PickType does **not** request `<all_urls>` or broad host access.

---

## Privacy

- All analysis runs locally in your browser.
- No analytics, no tracking, no remote code, no accounts.
- Nothing is sent anywhere unless you explicitly enable the optional AI polish feature with your own API key. In that case, only extracted design tokens (never page text or screenshots) are sent.

See [PRIVACY.md](./PRIVACY.md) for the full policy.

---

## Tech stack

- [WXT](https://wxt.dev) with Vite, Manifest V3
- TypeScript (strict)
- Shadow DOM for all on-page UI, so site CSS can't break it
- Vitest for unit tests, Playwright for end-to-end tests

---

## Project structure

```
├── entrypoints/
│   ├── background/      # service worker (stateless, uses chrome.storage)
│   ├── content/         # injected picker and detector
│   └── popup/           # toolbar popup UI
├── lib/
│   ├── color-conversion # HEX / RGB / HSL / OKLCH
│   ├── contrast         # WCAG contrast math
│   ├── font-resolve     # stack parsing, CDP result mapping
│   ├── extract/         # colors, typography, spacing, components
│   └── storage          # versioned schema + migrations
├── ui/                  # Shadow DOM components
├── tests/               # unit, fixtures, e2e
└── README.md
```

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start WXT with hot reload |
| `npm run build` | Production build |
| `npm run zip` | Package for the Web Store |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | Lint the codebase |
| `npm test` | Run Vitest unit tests |
| `npm run test:e2e` | Run Playwright tests against fixture pages |

---

## Known limitations

- **Restricted pages:** `chrome://` pages, the Chrome Web Store and PDF viewers can't be analyzed.
- **Canvas and WebGL text:** fonts drawn on a canvas can't be read.
- **Cross-origin stylesheets and iframes:** some data is inaccessible and is reported as such rather than guessed.
- **Estimated vs exact:** without the `debugger` permission, font results are best guesses and are labeled that way.
- **Bundled animation libraries:** GSAP and Three.js detection (roadmap) only works when the library is reachable from the page.

---

## Roadmap

- [x] Color picker with history
- [x] Font detector with contrast checker
- [x] Exact font detection via Chrome DevTools Protocol
- [x] Page palette
- [ ] design.md generator with CSS and Tailwind export
- [ ] Recreation prompt: structure, CSS motion, GSAP, Three.js, scroll behavior
- [ ] Optional AI polish (bring your own API key)
- [ ] Chrome Web Store release

Update the checkboxes to match what is actually built.

---

## Responsible use

PickType helps you **learn from and rebuild in your own brand**. Generated files contain design tokens and structure only, with placeholders instead of text, logos or images. You are responsible for making sure your use of any output respects the copyright, trademark and terms of the sites you analyze.

---

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) first, and run `npm run lint && npm run typecheck && npm test` before opening a PR.

---

## License

[MIT](./LICENSE) © `<your name>`

---

## Contact

Questions, bugs or takedown requests: `<your-email>`
