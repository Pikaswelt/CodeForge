# CodeForge

Electron desktop app for local coding agents:

```text
React UI
  -> secure Electron IPC bridge
  -> Node child_process
  -> Antigravity CLI, Codex CLI, Claude Code, Cursor Agent, or OpenCode
  -> selected project folder
```

## Requirements

- Node.js 20 or newer
- At least one installed and authenticated CLI:
  - `agy` for Google Antigravity
  - `codex` for OpenAI Codex
  - `claude` for Anthropic Claude Code
  - `agent` or `cursor-agent` for Cursor Agent
  - `opencode` for OpenCode
- Optional: Git for branch selection

## Development

```powershell
npm install
npm run dev
```

## Check and Build

```powershell
npm run lint
npm run build
npm run dist
```

`npm run dist` creates the Windows installer in `release/`.

## External Server

The settings screen includes an **External Server** section. It lets the desktop
app run on the PC while the selected CLI runs over SSH on a Debian or Linux
server.

Quick flow:

1. Install and authenticate Codex or the selected CLI on the server.
2. Clone or copy the project into a fixed folder on the server.
3. Enter the host, SSH user, port, and remote project path in CodeForge.
4. Click **Test**, then enable **Active**.

The local project folder remains the CodeForge selection. Files that the agent
should edit must also exist in the remote project path.

## Mobile App

The Android app in `smart-home-remote-app/` is CodeForge Mobile. It is optimized
for phone screens and works remotely against the Debian VPS. Unlike the desktop
app, it does not use local SSH; it calls a small HTTP/HTTPS API on the server:

```bash
bash server-setup-codeforge.sh
codex login
```

The app stores the server URL, token, provider, model, remote project path,
system prompt, access mode, and reasoning level. The tutorial is built directly
into the app under the **Tutorial** tab.

The current debug APK is preconfigured for `http://88.214.56.241:8787` and the
token from `server-setup-codeforge.sh`. For now, the mobile app exposes Codex
and Antigravity.

## Security

The renderer has no direct Node access. File operations, Git, npm, window
controls, and agent processes run exclusively through the restricted preload
API. The access mode can be set per request to read-only, project access, or
full access. For the mobile app, expose the remote API through HTTPS, VPN, or a
private network.
