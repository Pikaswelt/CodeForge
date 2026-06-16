CodeForge


Electron desktop app for local coding agents:


React UI
  -> secure Electron IPC bridge
  -> Node child_process
  -> Antigravity CLI, Codex CLI, or Claude Code
  -> selected project folder



Requirements




Node.js 20 or newer


At least one installed and authenticated CLI:



agy for Google Antigravity


codex for OpenAI Codex


claude for Anthropic Claude Code






Optional: Git for branch selection




Development


npm install
npm run dev



Check and Build


npm run lint
npm run build
npm run dist



npm run dist creates the Windows installer in release/.


Security


The renderer has no direct Node access. File operations, Git, npm, window controls, and agent processes run exclusively through the restricted preload API. The access mode can be set per request to read-only, project access, or full access.

