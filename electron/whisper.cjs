/**
 * Local Whisper speech-to-text (whisper.cpp).
 *
 * The user installs it on demand: CodeForge downloads the whisper.cpp binaries
 * plus a ggml model into userData/whisper. Transcription runs through a local
 * whisper-server process that keeps the model loaded, so each utterance takes
 * about a second instead of reloading the model every time.
 */
const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const WHISPER_VERSION = 'v1.9.2';
const BIN_URLS = {
  win32: `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_VERSION}/whisper-bin-x64.zip`,
  linux: `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_VERSION}/whisper-bin-ubuntu-x64.tar.gz`,
};
const MODELS = {
  base: { file: 'ggml-base.bin', label: 'Base (148 MB, schnell)', size: 147951465 },
  small: { file: 'ggml-small.bin', label: 'Small (488 MB, genauer)', size: 487601967 },
};
const MODEL_BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/';

// Phrases whisper invents on silence or noise (mostly subtitle credits).
const HALLUCINATIONS = [
  /untertitel (der|von|im auftrag)[^.]*\.?/gi,
  /amara\.org[^.]*\.?/gi,
  /vielen dank (fürs|für's|für das) zuschauen\.?/gi,
  /thanks? for watching[.!]?/gi,
  /\[(blank_audio|music|musik|applaus|stille)\]/gi,
  /\((musik|applaus|stille|lachen|music)\)/gi,
  /\*[^*]{0,40}\*/g,
];

function setupWhisper({ app, getWindow }) {
  const rootDir = () => path.join(app.getPath('userData'), 'whisper');
  const binDir = () => path.join(rootDir(), 'bin');
  const modelsDir = () => path.join(rootDir(), 'models');
  const serverExe = () => {
    const name = process.platform === 'win32' ? 'whisper-server.exe' : 'whisper-server';
    return findFile(binDir(), name);
  };

  let installing = null;
  let server = null; // { child, port, model, ready }

  function send(payload) {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('whisper:progress', payload);
  }

  function status() {
    const models = Object.fromEntries(
      Object.keys(MODELS).map((id) => [id, fs.existsSync(path.join(modelsDir(), MODELS[id].file))]),
    );
    return {
      supported: Boolean(BIN_URLS[process.platform]),
      binaryInstalled: Boolean(serverExe()),
      models,
      installed: Boolean(serverExe()) && Object.values(models).some(Boolean),
      installing: Boolean(installing),
      modelOptions: Object.entries(MODELS).map(([id, model]) => ({ id, label: model.label, size: model.size })),
    };
  }

  async function downloadFile(url, target, label, weight, offset) {
    const response = await fetch(url);
    if (!response.ok || !response.body) throw new Error(`${label} konnte nicht geladen werden (${response.status}).`);
    const total = Number(response.headers.get('content-length')) || 0;
    const temp = `${target}.part`;
    const out = fs.createWriteStream(temp);
    const reader = response.body.getReader();
    let received = 0;
    let lastSent = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        if (!out.write(Buffer.from(value))) await new Promise((resolve) => out.once('drain', resolve));
        const now = Date.now();
        if (now - lastSent > 150) {
          lastSent = now;
          const part = total ? received / total : 0;
          send({ type: 'progress', label, received, total, percent: Math.round((offset + part * weight) * 100) });
        }
      }
      await new Promise((resolve, reject) => out.end((error) => (error ? reject(error) : resolve())));
    } catch (error) {
      out.destroy();
      fs.rmSync(temp, { force: true });
      throw error;
    }
    fs.renameSync(temp, target);
  }

  function extract(archive, targetDir) {
    fs.mkdirSync(targetDir, { recursive: true });
    return new Promise((resolve, reject) => {
      const done = (error) => (error ? reject(new Error(`Entpacken fehlgeschlagen: ${error.message}`)) : resolve());
      if (process.platform === 'win32') {
        const ps = (value) => value.replace(/'/g, "''");
        execFile(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${ps(archive)}' -DestinationPath '${ps(targetDir)}' -Force`],
          { windowsHide: true },
          done,
        );
      } else {
        execFile('tar', ['-xzf', archive, '-C', targetDir], done);
      }
    });
  }

  async function install(_event, input = {}) {
    if (installing) return installing;
    const modelId = MODELS[input.model] ? input.model : 'base';
    installing = (async () => {
      try {
        if (!BIN_URLS[process.platform]) throw new Error('Whisper ist auf diesem System nicht verfuegbar.');
        fs.mkdirSync(modelsDir(), { recursive: true });
        const needBinary = !serverExe();
        const modelPath = path.join(modelsDir(), MODELS[modelId].file);
        const needModel = !fs.existsSync(modelPath);
        const binWeight = needBinary ? (needModel ? 0.06 : 1) : 0;

        if (needBinary) {
          send({ type: 'progress', label: 'Whisper-Programm', percent: 0 });
          const archive = path.join(rootDir(), path.basename(BIN_URLS[process.platform]));
          await downloadFile(BIN_URLS[process.platform], archive, 'Whisper-Programm', binWeight, 0);
          send({ type: 'progress', label: 'Entpacke...', percent: Math.round(binWeight * 100) });
          fs.rmSync(binDir(), { recursive: true, force: true });
          await extract(archive, binDir());
          fs.rmSync(archive, { force: true });
          const exe = serverExe();
          if (!exe) throw new Error('whisper-server wurde im Download nicht gefunden.');
          if (process.platform !== 'win32') fs.chmodSync(exe, 0o755);
        }
        if (needModel) {
          await downloadFile(`${MODEL_BASE_URL}${MODELS[modelId].file}`, modelPath, `Modell ${modelId}`, 1 - binWeight, binWeight);
        }
        send({ type: 'done', percent: 100 });
        return { ok: true, status: status() };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        send({ type: 'error', error: message });
        return { ok: false, error: message, status: status() };
      } finally {
        installing = null;
      }
    })();
    return installing;
  }

  function freePort() {
    return new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.once('error', reject);
      probe.listen(0, '127.0.0.1', () => {
        const { port } = probe.address();
        probe.close(() => resolve(port));
      });
    });
  }

  function stopServer() {
    if (server?.child && !server.child.killed) {
      try { server.child.kill(); } catch (_) {}
    }
    server = null;
  }

  async function ensureServer(modelId) {
    const id = MODELS[modelId] && fs.existsSync(path.join(modelsDir(), MODELS[modelId].file))
      ? modelId
      : Object.keys(MODELS).find((key) => fs.existsSync(path.join(modelsDir(), MODELS[key].file)));
    if (!id) throw new Error('Kein Whisper-Modell installiert.');
    if (server && server.model === id && !server.child.killed) return server.ready;
    stopServer();

    const exe = serverExe();
    if (!exe) throw new Error('Whisper ist nicht installiert.');
    const port = await freePort();
    const threads = Math.max(2, Math.min(8, (os.cpus()?.length || 4) - 1));
    const child = spawn(exe, ['-m', path.join(modelsDir(), MODELS[id].file), '--host', '127.0.0.1', '--port', String(port), '-t', String(threads), '-l', 'auto'], {
      cwd: path.dirname(exe),
      // Linux build ships its shared libraries next to the binary.
      env: { ...process.env, LD_LIBRARY_PATH: [path.dirname(exe), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') },
      windowsHide: true,
      stdio: 'ignore',
    });
    const current = { child, port, model: id, ready: null };
    current.ready = (async () => {
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        if (child.exitCode !== null) throw new Error('whisper-server wurde unerwartet beendet.');
        try {
          await fetch(`http://127.0.0.1:${port}/`);
          return current;
        } catch (_) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
      throw new Error('whisper-server startet nicht.');
    })();
    child.on('exit', () => {
      if (server === current) server = null;
    });
    server = current;
    try {
      return await current.ready;
    } catch (error) {
      stopServer();
      throw error;
    }
  }

  async function transcribe(_event, input = {}) {
    try {
      const running = await ensureServer(input.model);
      const form = new FormData();
      form.append('file', new Blob([Buffer.from(input.audio)], { type: 'audio/wav' }), 'speech.wav');
      form.append('response_format', 'json');
      form.append('temperature', '0');
      form.append('language', String(input.language || 'de').replace(/[^a-z-]/gi, '') || 'auto');
      if (input.prompt) form.append('prompt', String(input.prompt).slice(0, 200));
      const response = await fetch(`http://127.0.0.1:${running.port}/inference`, { method: 'POST', body: form });
      if (!response.ok) throw new Error(`Whisper-Fehler (${response.status}).`);
      const data = await response.json();
      return { ok: true, text: cleanText(data.text || '') };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  function remove() {
    stopServer();
    fs.rmSync(rootDir(), { recursive: true, force: true });
    return status();
  }

  return { status, install, transcribe, remove, stopServer, warmUp: (model) => ensureServer(model).then(() => true, () => false) };
}

function cleanText(text) {
  let result = String(text).replace(/\s+/g, ' ');
  for (const pattern of HALLUCINATIONS) result = result.replace(pattern, ' ');
  return result.replace(/\s+/g, ' ').trim();
}

function findFile(dir, name) {
  if (!fs.existsSync(dir)) return '';
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === name) return full;
    if (entry.isDirectory()) {
      const found = findFile(full, name);
      if (found) return found;
    }
  }
  return '';
}

module.exports = { setupWhisper };
