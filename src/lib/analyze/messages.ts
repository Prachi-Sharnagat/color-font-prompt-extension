/**
 * Messages between the Studio page and the analyzer content script.
 */
import type { MotionReport } from './css-motion';
import type { PageStructure } from './structure';
import type { DesignTokens } from './tokens';

export type AnalysisModule = 'structure' | 'tokens' | 'motion';

export interface AnalyzeRequest {
  type: 'pt:analyze';
  module: AnalysisModule;
}

export interface AnalysisResults {
  structure?: PageStructure;
  tokens?: DesignTokens;
  motion?: MotionReport;
}

export type AnalyzeResponse =
  | { ok: true; module: AnalysisModule; ms: number; result: AnalysisResults }
  | { ok: false; module: AnalysisModule; error: string };

export function isAnalyzeRequest(value: unknown): value is AnalyzeRequest {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { type?: unknown; module?: unknown };
  return v.type === 'pt:analyze' && (v.module === 'structure' || v.module === 'tokens' || v.module === 'motion');
}
