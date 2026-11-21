import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { collectMotion } from '../content/analyze/collect-motion';
import { collectStructure } from '../content/analyze/collect-structure';
import { collectTokenSamples } from '../content/analyze/collect-tokens';
import { normalizeMotion } from '../lib/analyze/css-motion';
import { isAnalyzeRequest, type AnalysisModule, type AnalysisResults, type AnalyzeResponse } from '../lib/analyze/messages';
import { simplifyStructure } from '../lib/analyze/structure';
import { buildTokens } from '../lib/analyze/tokens';

type FlaggedGlobal = typeof globalThis & { __pickTypeAnalyzerTeardown?: () => void };

function run(module: AnalysisModule): AnalysisResults {
  switch (module) {
    case 'structure': {
      const raw = collectStructure(document);
      return { structure: simplifyStructure(raw.root, raw.viewport, raw.page) };
    }
    case 'tokens':
      return { tokens: buildTokens(collectTokenSamples(document)) };
    case 'motion':
      return { motion: normalizeMotion(collectMotion(document)) };
  }
}

/**
 * Read-only page analysis for the recreation prompt. Injected on demand from
 * the Studio page (activeTab). Runs in the isolated world: it reads the DOM
 * and computed styles but never modifies the page.
 */
export default defineContentScript({
  registration: 'runtime',
  main() {
    const global = globalThis as FlaggedGlobal;
    try {
      global.__pickTypeAnalyzerTeardown?.();
    } catch {
      // Previous copy belongs to an invalidated extension context.
    }

    const listener = (message: unknown, _sender: unknown, sendResponse: (response: AnalyzeResponse) => void): false => {
      if (!isAnalyzeRequest(message)) return false;
      const started = performance.now();
      try {
        const result = run(message.module);
        sendResponse({ ok: true, module: message.module, ms: Math.round(performance.now() - started), result });
      } catch (error) {
        sendResponse({ ok: false, module: message.module, error: error instanceof Error ? error.message : String(error) });
      }
      return false;
    };
    browser.runtime.onMessage.addListener(listener);
    global.__pickTypeAnalyzerTeardown = () => browser.runtime.onMessage.removeListener(listener);
  },
});
