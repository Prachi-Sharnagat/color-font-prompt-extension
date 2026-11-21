import type { Disposer } from '../lib/disposer';
import type { ToolMode } from '../lib/messages';
import type { ShadowUI } from '../ui/shadow-host';
import type { Toolbar } from '../ui/toolbar';

export interface ModeContext {
  ui: ShadowUI;
  toolbar: Toolbar;
  /** Everything the mode creates must be registered here. */
  disposer: Disposer;
  /** Exit the current mode and remove all injected UI. */
  exit: () => void;
}

export interface ModeDefinition {
  id: ToolMode;
  title: string;
  hint: string;
  start(ctx: ModeContext): void;
}
