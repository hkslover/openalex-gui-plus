# Local App Distribution

This project can run as a browser-based local app instead of a public web service.

## Local run

```bash
npm run build
npm run start:local
```

By default the local app binds to `127.0.0.1:18400`.

Environment variables:

- `OPENALEX_GUI_HOST`
- `OPENALEX_GUI_PORT`

Example:

```bash
OPENALEX_GUI_PORT=19400 npm run start:local
```

## Local executable packaging

The packaging path uses Node.js Single Executable Applications (SEA).

```bash
nvm use 25
npm run package:local
```

Output:

- `release/<platform>-<arch>/openalex-gui-plus`
- `release/<platform>-<arch>/openalex-gui-plus.exe` on Windows

Notes:

- Packaging requires a Node.js version that supports `node --build-sea`.
- On macOS the generated binary must be signed. The packaging script applies an ad-hoc `codesign` step automatically.
- Regular development still works with the repository's normal Node workflow.
- The packaged app keeps serving the frontend locally and can still talk to the local Zotero connector.
