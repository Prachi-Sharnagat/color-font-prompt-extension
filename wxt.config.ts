import { defineConfig } from 'wxt';

// https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  // Explicit imports only: keeps the code readable without WXT's auto-import magic.
  imports: false,
  manifest: {
    name: 'PickType',
    description: 'Pick colors and detect fonts on any page. Everything stays on your device.',
    // Keep this list minimal. No host permissions: activeTab grants temporary
    // access to the current tab when the user clicks the toolbar icon.
    permissions: ['activeTab', 'scripting', 'storage', 'clipboardWrite'],
    action: {
      default_title: 'PickType',
    },
  },
});
