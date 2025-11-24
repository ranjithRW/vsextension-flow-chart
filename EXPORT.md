Exporting wholeflow to SVG
==========================

This project provides a helper script to convert the generated Mermaid block in `wholeflow.mmd` into an SVG using the Mermaid CLI.

Steps
1. Generate the mermaid file (if not already):

```powershell
npm run generate-flow
```

2. Export to SVG (this will write `wholeflow_raw.mmd` and `wholeflow.svg`):

```powershell
npm run export-flow
```

Notes
- The helper uses `npx mmdc` to run Mermaid CLI. If you prefer, install the CLI locally:

```powershell
npm install -D @mermaid-js/mermaid-cli
```

- If the script fails, check the output for errors. Make sure `wholeflow.mmd` exists in the workspace root.
