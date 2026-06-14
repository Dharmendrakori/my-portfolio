# TODO - Fix projects carousel

## Plan
1. Revert `index.html` to the checkpoint baseline to restore the Skills section.
2. Re-apply a correct carousel markup wrapper for Projects without altering Skills markup.
3. Ensure JS references match HTML IDs (`projectsCarousel`, `projectsTrack`, `projectsPrev`, `projectsNext`, `projectsDots`).
4. Remove any broken/extra markup and ensure HTML structure is valid.
5. Ensure no JS parse errors remain.
6. Quick sanity checks: carousel init executes, dots/prev/next buttons work, Skills render normally.

## Progress
- [x] Investigated `index.html` and identified mismatched carousel structure.
- [x] Attempted to enable carousel JS (caused markup issues).
- [ ] Revert `index.html` back to `index.html.checkpoint-projects-carousel`.
- [ ] Re-implement carousel cleanly.
- [ ] Verify no JS/CSS parsing errors.
- [ ] Confirm Skills section restored.

