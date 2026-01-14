# Repository Guidelines

## Project Structure & Module Organization

- `src/` contains the app code.
  - `src/main.ts` bootstraps Phaser, wires the event entry points, and exposes `window.codexViz`.
  - `src/visualizer.ts` defines the Phaser scene, agent state machine, and asset slicing.
- `public/assets/` stores CC0 sprites used by the visualizer.
- `index.html` and `src/style.css` define the page shell and HUD overlay.
- `ASSET_LICENSES.md` documents asset sources and licenses.

## Build, Test, and Development Commands

- `bun install` installs dependencies.
- `bun run dev` starts the Vite dev server for local development.
- `bun run build` produces a production build in `dist/`.
- `bun run preview` serves the production build locally.

## Coding Style & Naming Conventions

- TypeScript is used throughout. Indentation is 2 spaces.
- Classes use PascalCase (e.g., `CodexScene`), functions and variables use camelCase.
- Keep Phaser logic inside the scene or helper classes; avoid DOM manipulation beyond the HUD.
- No formatter or linter is configured. Keep changes consistent with existing files.

## Testing Guidelines

- There is no test framework or test suite in this repository yet.
- If adding tests, document the framework and add a `bun run test` script in `package.json`.

## Commit & Pull Request Guidelines

- Existing commits use short, imperative titles (e.g., "Initial visualizer", "Ignore env files").
- Keep commit messages concise and focused on a single change.
- For pull requests: include a short summary, steps to test (commands and expected output),
  and screenshots or a short video if the visual output changes.

## Security & Configuration Tips

- This is a public repo. Never commit secrets or local config.
- `.env` and `.env.*` are ignored; keep credentials in those files only.
- Asset sources must be commercial-safe; update `ASSET_LICENSES.md` when adding new assets.
