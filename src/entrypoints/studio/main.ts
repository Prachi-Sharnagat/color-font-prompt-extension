import { browser } from 'wxt/browser';
import { copyText } from '../../lib/clipboard';
import { summarizeMotion } from '../../lib/analyze/css-motion';
import type { AnalysisModule, AnalysisResults, AnalyzeRequest, AnalyzeResponse } from '../../lib/analyze/messages';
import { renderOutline } from '../../lib/analyze/structure';
import { tokensToCss } from '../../lib/analyze/tokens';
import { reasonFromInjectionError, restrictionMessage } from '../../lib/restricted';

const ANALYZER_FILE = '/content-scripts/analyzer.js';

const STEPS: Array<{ module: AnalysisModule; label: string }> = [
  { module: 'structure', label: 'Page structure' },
  { module: 'tokens', label: 'Design tokens' },
  { module: 'motion', label: 'CSS motion' },
];

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Studio markup is missing #${id}`);
  return el as T;
}

const targetEl = byId<HTMLParagraphElement>('target');
const notice = byId<HTMLParagraphElement>('notice');
const analyzeBtn = byId<HTMLButtonElement>('btn-analyze');
const stepsEl = byId<HTMLOListElement>('steps');
const resultsEl = byId<HTMLElement>('results');
const toastEl = byId<HTMLDivElement>('toast');

const tabId = Number.parseInt(new URLSearchParams(location.search).get('tab') ?? '', 10);
let results: AnalysisResults = {};

let toastTimer: number | undefined;
function showToast(message: string): void {
  toastEl.textContent = message;
  toastEl.classList.add('toast--show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('toast--show'), 1600);
}

function showNotice(text: string): void {
  notice.textContent = text;
  notice.hidden = false;
}

type StepState = 'pending' | 'running' | 'done' | 'error';
const ICONS: Record<StepState, string> = { pending: '○', running: '…', done: '✓', error: '✗' };

function renderSteps(states: Record<AnalysisModule, { state: StepState; summary: string; ms?: number }>): void {
  stepsEl.replaceChildren(
    ...STEPS.map(({ module, label }) => {
      const s = states[module];
      const li = document.createElement('li');
      li.className = `step step--${s.state}`;
      const icon = document.createElement('span');
      icon.className = 'step__icon';
      icon.textContent = ICONS[s.state];
      icon.setAttribute('aria-label', s.state);
      const name = document.createElement('span');
      name.className = 'step__name';
      name.textContent = label;
      const summary = document.createElement('span');
      summary.className = 'step__summary';
      summary.textContent = s.summary;
      const ms = document.createElement('span');
      ms.className = 'step__ms';
      ms.textContent = s.ms !== undefined ? `${s.ms} ms` : '';
      li.append(icon, name, summary, ms);
      return li;
    }),
  );
}

function summarize(module: AnalysisModule, result: AnalysisResults): string {
  if (module === 'structure' && result.structure) {
    const s = result.structure;
    return `${s.sections.length} sections, ${s.stats.keptNodes} nodes kept of ${s.stats.rawNodes}, ${s.stats.mergedGroups} repeated groups merged`;
  }
  if (module === 'tokens' && result.tokens) {
    const t = result.tokens;
    return `${t.colors.length} colors, ${t.typeScale.length} type sizes, ${t.spacing.scale.length} spacing values${t.spacing.base ? ` (${t.spacing.base}px grid)` : ''}, ${t.breakpoints.length} breakpoints`;
  }
  if (module === 'motion' && result.motion) return summarizeMotion(result.motion);
  return '';
}

function renderResults(): void {
  byId('out-structure').textContent = results.structure ? renderOutline(results.structure) : 'Not available.';
  byId('out-tokens').textContent = results.tokens ? tokensToCss(results.tokens) : 'Not available.';
  byId('out-motion').textContent = results.motion ? JSON.stringify(results.motion, null, 2) : 'Not available.';
  resultsEl.hidden = false;
}

async function analyze(): Promise<void> {
  notice.hidden = true;
  analyzeBtn.disabled = true;
  results = {};
  const states = Object.fromEntries(STEPS.map((s) => [s.module, { state: 'pending' as StepState, summary: '' }])) as Record<
    AnalysisModule,
    { state: StepState; summary: string; ms?: number }
  >;
  renderSteps(states);

  try {
    await browser.scripting.executeScript({ target: { tabId }, files: [ANALYZER_FILE] });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showNotice(restrictionMessage(reasonFromInjectionError(message)));
    analyzeBtn.disabled = false;
    return;
  }

  for (const { module } of STEPS) {
    states[module] = { state: 'running', summary: 'Working…' };
    renderSteps(states);
    try {
      const request: AnalyzeRequest = { type: 'pt:analyze', module };
      const response = (await browser.tabs.sendMessage(tabId, request, { frameId: 0 })) as AnalyzeResponse | undefined;
      if (!response) throw new Error('No response from the page.');
      if (!response.ok) throw new Error(response.error);
      results = { ...results, ...response.result };
      states[module] = { state: 'done', summary: summarize(module, response.result), ms: response.ms };
    } catch (error) {
      states[module] = { state: 'error', summary: error instanceof Error ? error.message : String(error) };
    }
    renderSteps(states);
  }

  renderResults();
  analyzeBtn.disabled = false;
}

async function init(): Promise<void> {
  if (!Number.isFinite(tabId)) {
    showNotice('Open the Studio from the PickType toolbar popup on the page you want to analyze.');
    analyzeBtn.disabled = true;
    return;
  }
  try {
    const tab = await browser.tabs.get(tabId);
    targetEl.textContent = tab.url ? new URL(tab.url).host + new URL(tab.url).pathname : `Tab ${tabId}`;
  } catch {
    showNotice('The page this Studio was opened for has been closed.');
    analyzeBtn.disabled = true;
    return;
  }
  analyzeBtn.addEventListener('click', () => void analyze());
  byId<HTMLButtonElement>('btn-copy-json').addEventListener('click', () => {
    void copyText(JSON.stringify(results, null, 2)).then((ok) => showToast(ok ? 'Copied analysis JSON' : 'Copy failed'));
  });
  void analyze();
}

void init();
