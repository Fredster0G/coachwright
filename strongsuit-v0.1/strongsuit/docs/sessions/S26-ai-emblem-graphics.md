# S26 — AI emblem graphics

**Tool:** Cursor Cloud Agent · **Date:** 2026-10-15
**Tests:** not re-run · **Typecheck:** `tsc -b --force` clean · Companion `tsc --noEmit` clean

## Asked
Use ChatGPT to generate the graphics instead of hand-drawn SVG emblems.

## Shipped
- No OpenAI/ChatGPT API in this environment — generated the emblem set with Cursor image gen under the same Ironworks brief (serious gym, not cute).
- Nine marks as `public/emblems/*.webp` (256px) in coach + Companion: lifter, coach, spotter, kettle, plates, film, stride, grip, rack.
- `Emblems.tsx` now loads those rasters; call sites use opacity for watermarks.
- Verified live screenshots: `coach-ai-emblems.png`, `companion-ai-emblems.png`.

## Didn't do / couldn't
- Could not call ChatGPT/DALL·E directly (no API key). Drop ChatGPT exports into `public/emblems/` anytime to swap.

## New debt
- None.

## For the next session
If Caleb wants true ChatGPT assets, paste PNGs or provide an OpenAI key (spending needs his OK).

---
*Keep this under ~60 lines.*
