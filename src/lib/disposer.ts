/**
 * Collects teardown callbacks so a mode can clean up everything it created
 * (listeners, timers, observers, DOM nodes) in a single `dispose()` call.
 */
export class Disposer {
  private readonly cleanups: Array<() => void> = [];
  private disposed = false;

  /** Register an arbitrary cleanup. Runs immediately if already disposed. */
  add(cleanup: () => void): void {
    if (this.disposed) {
      cleanup();
      return;
    }
    this.cleanups.push(cleanup);
  }

  /** addEventListener that is removed automatically on dispose. */
  listen<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    handler: (event: WindowEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void;
  listen<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    handler: (event: DocumentEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void;
  listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void;
  listen(
    target: EventTarget,
    type: string,
    handler: (event: Event) => void,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, handler, options);
    this.add(() => target.removeEventListener(type, handler, options));
  }

  timeout(fn: () => void, ms: number): number {
    const id = window.setTimeout(fn, ms);
    this.add(() => window.clearTimeout(id));
    return id;
  }

  frame(fn: FrameRequestCallback): number {
    const id = window.requestAnimationFrame(fn);
    this.add(() => window.cancelAnimationFrame(id));
    return id;
  }

  /** Remove a node from the DOM on dispose. */
  node<T extends Node>(node: T): T {
    this.add(() => node.parentNode?.removeChild(node));
    return node;
  }

  /** Number of pending cleanups; used to verify there are no leaks. */
  get size(): number {
    return this.cleanups.length;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    // Tear down in reverse order of creation.
    while (this.cleanups.length > 0) {
      const cleanup = this.cleanups.pop();
      try {
        cleanup?.();
      } catch {
        // One failing cleanup must not prevent the rest from running.
      }
    }
  }
}
