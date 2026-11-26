---
"@simon_he/electron-browser-surface": minor
---

Keep never-shown surfaces at a positive `1280x800` viewport and add
`ViewportEmulationGuard` for clearing agent CDP device-metrics/page-scale
overrides before a user-visible surface inherits them.
