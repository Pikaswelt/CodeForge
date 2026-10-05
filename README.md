<p align="center">
  <img src="assets/codeforge.png" alt="CodeForge logo" width="112" />
</p>

<h1 align="center">CodeForge</h1>

<p align="center">
  <strong>A desktop workspace for AI coding agents.</strong><br />
  Run Claude Code, Codex and other CLI agents side by side, chat with any LLM API about your projects, and keep all of your work in one place.
</p>

<p align="center">
  <a href="https://github.com/Pikaswelt/CodeForge/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/Pikaswelt/CodeForge?style=flat-square&color=f59e0b" /></a>
  <a href="https://github.com/Pikaswelt/CodeForge/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/Pikaswelt/CodeForge/total?style=flat-square" /></a>
  <a href="https://github.com/Pikaswelt/CodeForge/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/Pikaswelt/CodeForge/ci.yml?branch=main&style=flat-square&label=CI" /></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20Linux-0078d4?style=flat-square" />
</p>

<p align="center">
  <a href="https://github.com/Pikaswelt/CodeForge/releases/latest"><strong>Download for Windows &amp; Linux</strong></a>
  ·
  <a href="#features">Features</a>
  ·
  <a href="#getting-started">Getting started</a>
  ·
  <a href="#development">Development</a>
</p>

---

## Overview

CodeForge is an Electron app that turns your machine into a control center for AI-assisted development. Instead of juggling terminal windows, you start a **workspace** with up to four agent terminals in a grid, or open a **chat** with any Anthropic, OpenAI or OpenAI-compatible model that knows which project you are working on.

Everything runs locally. Your projects, chats and API keys stay on your computer.

## Features

### Workspaces for CLI agents
- Launch **1–4 terminals at once**, as tabs or in a **grid**.
- Pick a **CLI harness** per workspace, for example Claude Code (`claude`), Codex (`codex`) or Antigravity (`agy`).
- Define your own harnesses in the settings with a **name, start command and icon**.
- Full-color terminals (`xterm-256color`, truecolor) powered by xterm.js and node-pty.
- **Drag and drop** files or folders into a terminal to insert their paths.
- Optional prompt prefix/suffix and **trigger-word notifications** when an agent needs attention.

### V-Servers and SFTP
- Save as many **SSH servers** as you like (host, port, user, private key) and add more at any time with **Add server**, on the home screen or from the **+** menu inside a terminal.
- Tick several servers and press **Connect selected** or **Connect to all**. Each server gets its own terminal; up to four open as a grid, more as tabs.
- Mix servers, local shells and CLI harnesses in one workspace. Every tab can talk to a different server.
- **SFTP file browser** for every server: browse folders, upload and download files, create folders, rename and delete. Log in with your key or a password (kept in memory only). Unknown host keys are remembered on first use and connections are refused if the key changes later.

### API chat
- Chat directly with **Anthropic**, **OpenAI** or any **OpenAI-compatible** endpoint (Ollama, OpenRouter, LM Studio, …).
- Save multiple **AI providers** with URL, API key and default model; load the model list with one click.
- Attach a **project** to a chat. CodeForge sends its name, path and file list as context.
- Chats are grouped by project in the sidebar.

### Voice input
- Dictate prompts with the built-in Windows speech recognition, with no cloud service involved. Voice input is Windows-only for now.
- Works in API chats (microphone button) and in terminals: press <kbd>Alt</kbd> + <kbd>S</kbd> to toggle.

### Library
- A home for your projects, programs and mobile apps, with tags, search and one-click launch.
- Customize colors, banner image or video, and banner text.

### Themes
- Create themes with your own colors, animated gradients and **background images or videos**.
- **Background-only themes** swap the wallpaper and keep the rest of the look.
- Glass effects, transparency and corner radius are adjustable.

### Automatic updates
- CodeForge checks GitHub Releases on start and every six hours.
- Updates download in the background and are verified with SHA-512.
- Installation starts with one click, so running agents are never interrupted.

## Getting started

### Install

Download the package for your system from the [latest release](https://github.com/Pikaswelt/CodeForge/releases/latest).

**Windows:** run `CodeForge-Setup-<version>.exe`. CodeForge installs per user and needs no admin rights.

**Linux (AppImage, any distribution):**

```bash
chmod +x CodeForge-<version>-x86_64.AppImage
./CodeForge-<version>-x86_64.AppImage
```

The AppImage updates itself.

**Debian / Ubuntu:**

```bash
sudo apt install ./CodeForge-<version>-amd64.deb
```

With the `.deb` package, CodeForge downloads updates and opens them in your system installer.

### Requirements

- Windows 10/11 (x64) or a 64-bit Linux desktop (x86_64)
- For workspaces, at least one agent CLI on your `PATH`, for example:
  - [Claude Code](https://docs.claude.com/en/docs/claude-code) (`claude`)
  - [Codex CLI](https://github.com/openai/codex) (`codex`)
  - Google Antigravity (`agy`)
- For API chats, an API key from your provider. A local OpenAI-compatible server such as Ollama needs no key.
- For voice input (Windows only), a Windows language pack with speech recognition, for example German or English.

### First steps

The interface is currently in German. Labels in parentheses show the exact text in the app.

1. If you want to use API chats, open **Settings → General → AI providers** (*Einstellungen → Allgemein → AI-Anbieter*) and add a provider.
2. Go to **Home** and choose **Start workspace** (*Workspace starten*) or **Start chat** (*Chat starten*).
3. Select a project folder, or start without one, and get to work.

## CLI for servers (Linux)

`cli/codeforge` brings the Antigravity account switcher to a terminal, e.g. on a V-Server over SSH.

```bash
sudo install -m 755 cli/codeforge /usr/local/bin/codeforge
codeforge
```

The menu offers `1` agy with the main login, `2` one of the saved accounts, `3` add an account (and sign in right away) and `4` delete one. agy always starts with `--dangerously-skip-permissions`. Every account has its own home folder under `~/.codeforge/agy-accounts/`, so each keeps its own login; settings, skills and MCP servers are shared with the main login. Shortcuts: `codeforge start 2`, `codeforge add`, `codeforge list`.

## Development

```bash
git clone https://github.com/Pikaswelt/CodeForge.git
cd CodeForge
npm install

npm run dev        # Vite dev server + Electron with hot reload
npm run lint       # TypeScript type check
npm run dist:win   # Build the Windows installer into release/
npm run dist:linux # Build AppImage + .deb (run on Linux)
```

### Tech stack

| Layer | Technology |
| --- | --- |
| Shell | Electron |
| UI | React 19, Vite, Tailwind CSS 4, Motion |
| Terminals | xterm.js, node-pty (ConPTY) |
| SFTP | ssh2 |
| Speech | Windows `System.Speech` via a PowerShell worker |
| Packaging | electron-builder (NSIS) |

### Project structure

```text
electron/
  main.cjs       Main process: windows, IPC, PTY sessions, API chat, speech
  preload.cjs    Secure bridge exposed as window.agentWorkspace
  updater.cjs    GitHub Releases auto-updater
  sftp.cjs       SFTP client for saved V-Servers (ssh2)
src/
  App.tsx        Layout, theme backdrop, modals
  AppContext.tsx Application state and persistence
  components/    Home, workspaces, API chat, library, settings, …
```

### Releasing

1. Bump `version` in `package.json`.
2. Run `npm run dist:win`.
3. Create a GitHub release `v<version>` and attach `CodeForge-Setup-<version>.exe`, its `.blockmap` and `latest.yml`.
4. The **Linux release** workflow builds the AppImage and `.deb` on GitHub Actions and attaches them, together with `latest-linux.yml`.

Installed apps pick up the new version automatically.

## Privacy

- CodeForge has no telemetry.
- API keys, chats and settings are stored locally in the app's data folder.
- Network requests go to the AI providers you configure and to GitHub for update checks.
- If you enable the optional Spotify widget, it looks up album artwork on Deezer or iTunes.

## Contributing

Issues and pull requests are welcome. Please run `npm run lint` before opening a PR.
