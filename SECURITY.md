# Security policy

## Reporting

Please report suspected vulnerabilities privately through the repository's
GitHub Security Advisory flow. Do not open a public issue for an unfixed
vulnerability.

## Browser surface threat model

The library gives a host app a native browser surface. It does not make an
untrusted page safe by itself.

Hosts should:

- use a dedicated Electron partition for the browser;
- keep `contextIsolation`, `sandbox` and `webSecurity` enabled;
- keep CDP/debugger access in the main process;
- validate navigation URLs and block unsupported protocols;
- never expose raw CDP methods to remote page content;
- bound screenshot, wait and page-operation timeouts;
- treat console output, page text, snapshots and screenshots as untrusted.

The package blocks browser-level `Browser.*` and `Target.*` CDP methods in its
`cdp` escape hatch, but a host exposing the raw `CdpSend` directly is
responsible for its own policy.

## Focus and input

CDP input is delivered to the browser page target. It should not be used to
steal OS focus. If a host deliberately focuses the page, it should restore the
host focus when a composer, search field or dialog takes over.
