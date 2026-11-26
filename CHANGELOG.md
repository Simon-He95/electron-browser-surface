# Changelog

All notable changes to this project are documented here. Releases follow
Semantic Versioning and are prepared with `bumpp`.

## 0.2.0

- Keep never-shown surfaces at a positive `1280x800` viewport and add
  `ViewportEmulationGuard` for clearing agent CDP device-metrics/page-scale
  overrides before a user-visible surface inherits them.

## 0.1.0

- Initial extraction of the CDP browser recipes, accessibility snapshot, event
  buffers, Electron `WebContentsView` adapter and refresh policy.
- Added a runnable Electron demo and integration/CUA documentation.
