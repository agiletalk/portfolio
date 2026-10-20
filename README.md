# portfolio

**English** | [한국어](README.ko.md)

Personal portfolio of Chanju Jeon — iOS engineer for 15 years, now redesigning how software gets made with AI agents.

**→ https://agiletalk.github.io/portfolio/**

The site is a living terminal: an ASCII aquarium swims under `$ whoami`, the water ripples around your cursor, and a click drops food that the fish chase. Sections arrive as CLI output (`cat about.md`, `git log --career --graph`, `ls -l projects/`) and decode from scrambled glyphs as you scroll. Korean and English, switchable in place.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # → dist/
```

## Structure

| Path | What |
|------|------|
| `index.html`, `terminal/` | The site (Living Terminal) |
| `src/content/` | All copy and numbers — `ko.ts` / `en.ts` share one schema, numbers live in `shared.ts` |
| `src/i18n.ts` | Language toggle, remembered across pages |
| `src/lib/motion.ts` | Shared motion safety: reduced motion, pause when hidden or offscreen, device tiers |
| `concepts/` | Two earlier concept drafts (Deep Dive, Commit Museum), kept for reference — dev server only, not deployed. `npm run concepts` |
| `scripts/check.mjs` | Screenshot + console/overflow/i18n check at 1440 and 390px, with and without reduced motion |

Motion respects `prefers-reduced-motion`: the aquarium renders a single still frame and all text appears immediately.

## Credits

- [Pretendard](https://github.com/orioncactus/pretendard) is bundled under the SIL Open Font License — see `src/fonts/OFL.txt`.
- [GSAP](https://gsap.com) · [Lenis](https://lenis.darkroom.engineering) · [Vite](https://vite.dev)
