# Analyzer test pages

Local pages for checking the recreation-prompt analyzer. Serve them with:

```
npm run fixtures
```

then open http://localhost:5178/ and run **Generate Recreation Prompt** from the PickType popup.

## css-only.html

| Module | Expected |
|---|---|
| Structure | Sections: sticky `header.site-header`, hero (2-column grid), `section#features` with `article.card × 6` in a 3-column grid, `section#showcase` (16:9 graphic + copy), `section#pricing` with 3 plans (featured one scaled), footer |
| Tokens | Dark palette (`#0B0D12` bg, `#151922` surface, `#E8EBF2` text, `#7C5CFF` accent), 16px base, 56/44/36/20/18px sizes, 8px spacing grid, radii 12/16/24/full, breakpoints 640 and 1024 |
| CSS motion | `float` (6s, infinite, alternate, on `span.blob` ×3), `fade-up` (0.8s on `.reveal`), hover states on `.btn`, `.card`, `.nav a` with their transitions, `:focus-visible` on `.btn` |

GSAP and Three.js pages are added in later phases.
