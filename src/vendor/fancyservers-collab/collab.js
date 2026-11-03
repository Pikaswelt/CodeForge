var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/client.ts
var DEFAULT_HUB = "https://fancyagent.crazymine.de";
var HubError = class extends Error {
  constructor(message, status, code) {
    super(message);
    __publicField(this, "status");
    __publicField(this, "code");
    this.status = status;
    this.code = code;
  }
};
async function registerDevice(opts) {
  const f = opts.fetch || fetch.bind(globalThis);
  const r = await f(`${opts.hub || DEFAULT_HUB}/api/app/session`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${opts.accountToken}` },
    body: JSON.stringify({ app: opts.app, name: opts.name })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new HubError(data.error || `FancyAgent antwortet mit ${r.status}`, r.status, data.code);
  return data;
}
var CollabClient = class {
  constructor(opts) {
    __publicField(this, "hub");
    __publicField(this, "mode");
    __publicField(this, "token");
    __publicField(this, "csrf");
    __publicField(this, "state", null);
    __publicField(this, "connected", false);
    __publicField(this, "approved", false);
    __publicField(this, "ws", null);
    __publicField(this, "listeners", /* @__PURE__ */ new Map());
    __publicField(this, "subs", /* @__PURE__ */ new Set());
    __publicField(this, "docs", /* @__PURE__ */ new Map());
    __publicField(this, "retry", 0);
    __publicField(this, "stopped", false);
    __publicField(this, "pingTimer", null);
    __publicField(this, "reconnectTimer", null);
    __publicField(this, "f");
    __publicField(this, "WS");
    this.hub = (opts.hub || DEFAULT_HUB).replace(/\/+$/, "");
    this.mode = opts.mode;
    this.token = opts.token || null;
    this.csrf = opts.csrf || "";
    this.f = opts.fetch || fetch.bind(globalThis);
    this.WS = opts.WebSocket || WebSocket;
  }
  // ------------------------------------------------------------ Ereignisse
  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, /* @__PURE__ */ new Set());
    this.listeners.get(type).add(fn);
    return () => this.listeners.get(type)?.delete(fn);
  }
  emit(type, msg) {
    for (const fn of this.listeners.get(type) || []) {
      try {
        fn(msg);
      } catch (err) {
        console.error("[collab]", err);
      }
    }
    if (type !== "*") for (const fn of this.listeners.get("*") || []) fn(msg);
  }
  // ------------------------------------------------------------ REST
  async api(method, path, body) {
    const headers = {};
    if (body !== void 0) headers["content-type"] = "application/json";
    if (this.mode === "device" && this.token) headers.authorization = `Bearer ${this.token}`;
    if (this.mode === "cookie" && method !== "GET") headers["x-csrf-token"] = this.csrf;
    const r = await this.f(`${this.hub}/api${path}`, {
      method,
      headers,
      body: body === void 0 ? void 0 : JSON.stringify(body),
      credentials: this.mode === "cookie" ? "same-origin" : "omit"
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = new HubError(data.error || `Fehler ${r.status}`, r.status, data.code);
      if (r.status === 401) this.emit("auth-lost", err);
      throw err;
    }
    return data;
  }
  async loadState() {
    this.state = await this.api("GET", "/app/state");
    this.approved = this.mode === "cookie" || Boolean(this.state.device?.approved);
    this.emit("state", this.state);
    return this.state;
  }
  /** App bittet um Verbindung – bestätigt wird in FancyAgent (Popup). */
  requestLink() {
    return this.api("POST", "/app/link");
  }
  answerLink(requestId, accept) {
    return this.api("POST", `/app/link/${encodeURIComponent(requestId)}/answer`, { accept });
  }
  answerInvite(projectId, accept) {
    return this.api("POST", `/projects/${projectId}/invite-answer`, { accept });
  }
  dismiss(notificationId) {
    return this.api("POST", `/notifications/${notificationId}/dismiss`);
  }
  // ------------------------------------------------------------ Medien (R2-Multipart)
  /**
   * Lädt eine Datei hoch. Für Videos vorher komprimieren (Kuroi Studio macht das mit FFmpeg).
   * onProgress bekommt 0..1.
   */
  async upload(file, opts) {
    const media = await this.api("POST", opts.projectId ? `/projects/${opts.projectId}/media` : "/media", {
      kind: opts.kind,
      name: opts.name,
      mime: file.type || "application/octet-stream",
      size: file.size,
      meta: opts.meta || {}
    });
    const start = await this.raw("POST", `/media/${media.id}/upload/start`);
    const partSize = start.part_size || 20 * 1024 * 1024;
    const parts = [];
    let n = 1;
    for (let off = 0; off < file.size; off += partSize, n++) {
      const chunk = file.slice(off, Math.min(file.size, off + partSize));
      parts.push(await this.raw("PUT", `/media/${media.id}/upload/part?upload=${encodeURIComponent(start.upload_id)}&n=${n}`, chunk));
      opts.onProgress?.(Math.min(1, (off + chunk.size) / file.size));
    }
    return this.raw("POST", `/media/${media.id}/upload/complete`, JSON.stringify({ upload_id: start.upload_id, parts }), "application/json");
  }
  mediaUrl(id) {
    return `${this.hub}/api/media/${id}/raw`;
  }
  /** Medien mit Geräte-Token als Blob-URL laden (img/video können keinen Authorization-Header schicken). */
  async mediaBlobUrl(id) {
    if (this.mode === "cookie") return this.mediaUrl(id);
    const r = await this.f(this.mediaUrl(id), { headers: { authorization: `Bearer ${this.token}` } });
    if (!r.ok) throw new HubError("Datei nicht verf\xFCgbar", r.status);
    return URL.createObjectURL(await r.blob());
  }
  async raw(method, path, body, type) {
    const headers = {};
    if (type) headers["content-type"] = type;
    if (this.mode === "device" && this.token) headers.authorization = `Bearer ${this.token}`;
    if (this.mode === "cookie") headers["x-csrf-token"] = this.csrf;
    const r = await this.f(`${this.hub}/api${path}`, { method, headers, body, credentials: this.mode === "cookie" ? "same-origin" : "omit" });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new HubError(data.error || `Upload-Fehler ${r.status}`, r.status);
    return data;
  }
  // ------------------------------------------------------------ Echtzeit
  connect() {
    this.stopped = false;
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    const url = `${this.hub.replace(/^http/, "ws")}/rt`;
    const protocols = this.mode === "device" && this.token ? ["fancyagent", `fad.${this.token.slice(4)}`] : void 0;
    let ws;
    try {
      ws = protocols ? new this.WS(url, protocols) : new this.WS(url);
    } catch {
      return this.scheduleReconnect();
    }
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this.retry = 0;
      this.emit("connection", { connected: true });
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.rawSend('{"t":"ping"}'), 25e3);
    };
    ws.onmessage = (e) => {
      let m;
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (m.t === "hello") {
        this.approved = Boolean(m.approved);
        if (m.state) {
          this.state = { ...this.state || {}, ...m.state };
          this.emit("state", this.state);
        }
        if (this.approved) {
          for (const p of this.subs) this.send({ t: "sub", project: p });
          for (const [key, d] of this.docs) {
            const [project, ...rest] = key.split(":");
            this.send({ t: "doc-join", project: Number(project), doc: rest.join(":"), ...d });
          }
        }
      }
      if (m.t === "device" && this.state?.device && m.device?.id === this.state.device.id) {
        this.approved = Boolean(m.device.approved);
        this.state.device = m.device;
        if (this.approved) for (const p of this.subs) this.send({ t: "sub", project: p });
      }
      if (m.t === "revoked") {
        this.stopped = true;
        this.emit("auth-lost", new HubError("Die Verbindung wurde in FancyAgent getrennt.", 401, "revoked"));
      }
      this.emit(m.t, m);
    };
    ws.onclose = (e) => {
      this.connected = false;
      clearInterval(this.pingTimer);
      this.emit("connection", { connected: false, code: e.code });
      if (e.code === 4001 || e.code === 4003) {
        this.stopped = true;
        this.emit("auth-lost", new HubError("Abgemeldet.", 401));
        return;
      }
      this.scheduleReconnect();
    };
    ws.onerror = () => {
    };
  }
  scheduleReconnect() {
    if (this.stopped) return;
    clearTimeout(this.reconnectTimer);
    const delay = Math.min(3e4, 1e3 * 2 ** Math.min(this.retry++, 5)) + Math.random() * 500;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
  disconnect() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.pingTimer);
    this.ws?.close(1e3, "bye");
    this.ws = null;
  }
  rawSend(text) {
    if (this.ws?.readyState === 1) this.ws.send(text);
  }
  send(msg) {
    this.rawSend(JSON.stringify(msg));
  }
  subscribe(projectId) {
    this.subs.add(projectId);
    if (this.approved) this.send({ t: "sub", project: projectId });
  }
  unsubscribe(projectId) {
    this.subs.delete(projectId);
    this.send({ t: "unsub", project: projectId });
  }
  presence(projectId, activity, doc) {
    this.send({ t: "presence", project: projectId, activity, doc });
  }
  joinDoc(projectId, doc, opts = {}) {
    this.docs.set(`${projectId}:${doc}`, opts);
    this.send({ t: "doc-join", project: projectId, doc, ...opts });
  }
  leaveDoc(projectId, doc) {
    this.docs.delete(`${projectId}:${doc}`);
    this.send({ t: "doc-leave", project: projectId, doc });
  }
};
function timeLabel(ts) {
  const d = new Date(ts);
  const diff = Date.now() - ts;
  if (diff < 6e4) return "gerade eben";
  if (diff < 36e5) return `vor ${Math.floor(diff / 6e4)} Min.`;
  const hm = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const today = /* @__PURE__ */ new Date();
  if (d.toDateString() === today.toDateString()) return `heute ${hm}`;
  const y = new Date(today.getTime() - 864e5);
  if (d.toDateString() === y.toDateString()) return `gestern ${hm}`;
  return `${d.toLocaleDateString("de-DE")} ${hm}`;
}

// src/logos.ts
var BRANDS = {
  fancycode: { key: "fancycode", name: "FancyCode Desktop", letters: ["F", "c"], accent: "#3b82f6", from: "#60a5fa", to: "#1d4ed8", light: "#bfdbfe" },
  fancyagent: { key: "fancyagent", name: "FancyAgent", letters: ["F", "a"], accent: "#8b5cf6", from: "#a78bfa", to: "#6d28d9", light: "#ddd6fe" },
  kuroi: { key: "kuroi", name: "Kuroi Studio", letters: ["K", "s"], accent: "#ec4868", from: "#fb7185", to: "#be185d", light: "#fecdd3" },
  fancygames: { key: "fancygames", name: "FancyGames Studio", letters: ["F", "g"], accent: "#5b5cf6", from: "#34d399", to: "#4f46e5", light: "#c7d2fe" }
};
function brandOf(app) {
  if (app === "kuroi") return BRANDS.kuroi;
  if (app === "fancygames") return BRANDS.fancygames;
  if (app === "fancycode" || app === "fancycode-cli") return BRANDS.fancycode;
  return BRANDS.fancyagent;
}
function logoSvg(app, size = 512) {
  const b = brandOf(app);
  const id = `fs-${b.key}`;
  const [big, small] = b.letters;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512" role="img" aria-label="${b.name}">
  <defs>
    <linearGradient id="${id}-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${b.from}"/>
      <stop offset="1" stop-color="${b.to}"/>
    </linearGradient>
    <linearGradient id="${id}-gloss" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.38"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${id}-edge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.25"/>
    </linearGradient>
    <filter id="${id}-shadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="${b.to}" flood-opacity="0.45"/>
    </filter>
    <filter id="${id}-text" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000000" flood-opacity="0.28"/>
    </filter>
  </defs>
  <g filter="url(#${id}-shadow)">
    <rect x="32" y="24" width="448" height="448" rx="104" fill="url(#${id}-bg)"/>
    <rect x="33.5" y="25.5" width="445" height="445" rx="102.5" fill="none" stroke="url(#${id}-edge)" stroke-width="3"/>
    <path d="M136 24h240a104 104 0 0 1 104 104v40c-80 34-176 50-252 50-72 0-132-10-196-32v-58A104 104 0 0 1 136 24z" fill="url(#${id}-gloss)"/>
  </g>
  <text x="256" y="326" text-anchor="middle" font-family="'Inter','Segoe UI','Helvetica Neue',Arial,sans-serif" font-weight="800" letter-spacing="-8" fill="#ffffff" filter="url(#${id}-text)"><tspan font-size="232">${big}</tspan><tspan font-size="196" dx="4">${small}</tspan></text>
</svg>`;
}
function logoDataUrl(app) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoSvg(app, 64))}`;
}

// src/dom.ts
function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === void 0 || v === null || v === false) continue;
      if (k === "class") el.className = String(v);
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "html") el.innerHTML = String(v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children) {
    if (c === null || c === void 0 || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
}
function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}
function avatar(p, size = 36) {
  const name = p?.name || p?.login || "?";
  if (p?.avatar_url && /^https:\/\//.test(p.avatar_url)) {
    return h("img", { class: "fsc-avatar", src: p.avatar_url, alt: "", width: size, height: size, style: { width: `${size}px`, height: `${size}px` }, referrerpolicy: "no-referrer" });
  }
  let hash = 0;
  for (const ch of name) hash = hash * 31 + ch.charCodeAt(0) | 0;
  const hue = Math.abs(hash) % 360;
  return h(
    "span",
    { class: "fsc-avatar fsc-avatar-letter", style: { width: `${size}px`, height: `${size}px`, background: `hsl(${hue} 55% 45%)`, fontSize: `${Math.round(size * 0.42)}px` } },
    name.trim().charAt(0).toUpperCase()
  );
}
function richText(text, meLogin) {
  const root = document.createDocumentFragment();
  const parts = text.split(/```/);
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      const code = part.replace(/^[a-zA-Z0-9_+-]*\n/, "");
      root.appendChild(h("pre", { class: "fsc-code" }, h("code", null, code.replace(/\n$/, ""))));
      return;
    }
    const lines = part.split("\n");
    lines.forEach((line, li) => {
      inline(root, line, meLogin);
      if (li < lines.length - 1) root.appendChild(document.createElement("br"));
    });
  });
  return root;
}
function inline(parent, text, meLogin) {
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(https?:\/\/[^\s<>"')]+)|((?:^|(?<=[\s(]))@[A-Za-z0-9_.-]{2,39})/g;
  let last = 0;
  let m;
  while (m = re.exec(text)) {
    if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
    const t = m[0];
    if (m[1]) parent.appendChild(h("code", { class: "fsc-inline-code" }, t.slice(1, -1)));
    else if (m[2]) parent.appendChild(h("strong", null, t.slice(2, -2)));
    else if (m[3]) parent.appendChild(h("em", null, t.slice(1, -1)));
    else if (m[4]) parent.appendChild(h("a", { href: t, target: "_blank", rel: "noopener noreferrer nofollow" }, t));
    else if (m[5]) {
      const login = t.slice(1).toLowerCase();
      parent.appendChild(h("span", { class: `fsc-mention${meLogin && (login === meLogin.toLowerCase() || login === "alle") ? " fsc-mention-me" : ""}` }, t));
    }
    last = m.index + t.length;
  }
  if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
}
function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(n < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

// src/popups.ts
var PopupHost = class {
  constructor(opts) {
    __publicField(this, "el");
    __publicField(this, "opts");
    __publicField(this, "shown", /* @__PURE__ */ new Map());
    __publicField(this, "off", []);
    this.opts = opts;
    this.el = h("div", { class: "fsc-root fsc-popups", "aria-live": "polite" });
    this.el.style.setProperty("--fsc-accent", brandOf(opts.app).accent);
    (opts.container || document.body).appendChild(this.el);
    const c = opts.client;
    this.off.push(
      c.on("state", (s) => s?.notifications?.forEach((n) => this.fromNotification(n))),
      c.on("notify", (m) => this.fromNotification(m.notification)),
      c.on("notify-closed", (m) => this.close(`n${m.id}`)),
      c.on("agent-ask", (m) => this.agentAsk(m)),
      c.on("dm", (m) => this.dm(m))
    );
  }
  destroy() {
    this.off.forEach((f) => f());
    this.el.remove();
  }
  // ------------------------------------------------------------ Arten
  fromNotification(n) {
    if (!n || n.state !== "open") return;
    const c = this.opts.client;
    const key = `n${n.id}`;
    const dismiss = () => c.dismiss(n.id).catch(() => {
    });
    switch (n.kind) {
      case "project_invite":
        return this.show({
          key,
          person: n.from,
          title: "Einladung zu einem Projekt",
          text: `${n.from?.name || "Jemand"} l\xE4dt dich zu \u201E${n.project}\u201C ein (Rolle: ${roleLabel(n.role)}).`,
          actions: [
            { label: "Annehmen", primary: true, run: async () => {
              await c.answerInvite(n.project_id, true);
              await c.loadState().catch(() => {
              });
              this.opts.onOpen?.({ kind: "project", project_id: n.project_id });
            } },
            { label: "Ablehnen", run: () => c.answerInvite(n.project_id, false) }
          ]
        });
      case "link_request": {
        const forFancyAgent = n.target === "web";
        if (forFancyAgent !== (this.opts.app === "fancyagent")) return;
        const dev = `${n.app_name}${n.device_name ? ` (\u201E${n.device_name}\u201C)` : ""}`;
        return this.show({
          key,
          logo: "pair",
          pairApp: n.app,
          title: forFancyAgent ? `${n.app_name} verbinden?` : "Mit FancyAgent verbinden?",
          text: forFancyAgent ? `${dev} m\xF6chte sich mit deinem FancyAgent-Konto verbinden.` : `FancyAgent m\xF6chte sich mit ${dev} verbinden. Danach siehst du hier Chat, Projekte und Live-Arbeit.`,
          actions: [
            { label: "Verbinden", primary: true, run: () => c.answerLink(n.request_id, true) },
            { label: "Ablehnen", run: () => c.answerLink(n.request_id, false) }
          ]
        });
      }
      case "mention":
        return this.show({
          key,
          person: n.from,
          title: `${n.from?.name || "Jemand"} hat dich erw\xE4hnt`,
          text: `#${n.channel} \xB7 ${n.project}: ${n.text}`,
          timeout: 15e3,
          actions: [
            { label: "\xD6ffnen", primary: true, run: () => {
              dismiss();
              this.opts.onOpen?.({ kind: "channel", project_id: n.project_id, channel_id: n.channel_id });
            } },
            { label: "Schlie\xDFen", run: dismiss }
          ]
        });
      case "media_comment":
        return this.show({
          key,
          person: n.from,
          title: `Kommentar zu \u201E${n.name}\u201C`,
          text: `${n.from?.name}: ${n.text}`,
          timeout: 15e3,
          actions: [
            { label: "Ansehen", primary: true, run: () => {
              dismiss();
              this.opts.onOpen?.({ kind: "media", project_id: n.project_id, media_id: n.media_id, at_ms: n.at_ms });
            } },
            { label: "Schlie\xDFen", run: dismiss }
          ]
        });
      default:
        return this.show({ key, title: "FancyAgent", text: n.text || "", timeout: 8e3, actions: [{ label: "OK", run: dismiss }] });
    }
  }
  agentAsk(m) {
    this.show({
      key: `ask${m.id}`,
      person: m.from,
      title: `${m.from?.name || "Jemand"} m\xF6chte deinem Agent einen Auftrag geben`,
      text: m.text,
      actions: [
        { label: "Ausf\xFChren", primary: true, run: () => {
          this.opts.client.send({ t: "agent-answer", id: m.id, accept: true });
          this.opts.onAgentTask?.({ project: m.project, doc: m.doc, text: m.text, from: m.from });
        } },
        { label: "Ablehnen", danger: true, run: () => this.opts.client.send({ t: "agent-answer", id: m.id, accept: false }) }
      ]
    });
  }
  dm(m) {
    const me = this.opts.client.state?.me?.id;
    if (!m.message || m.message.author?.id === me) return;
    if (this.opts.isVisible?.({ thread_id: m.thread })) return;
    this.show({
      key: `dm${m.thread}`,
      person: m.message.author,
      title: `Nachricht von ${m.message.author?.name}`,
      text: m.message.body || "Anhang",
      timeout: 1e4,
      actions: [{ label: "Antworten", primary: true, run: () => this.opts.onOpen?.({ kind: "dm", thread_id: m.thread }) }]
    });
  }
  // ------------------------------------------------------------ Darstellung
  show(card) {
    this.close(card.key);
    const busy = (on) => el.querySelectorAll("button").forEach((b) => b.disabled = on);
    const err = h("div", { class: "fsc-pop-error" });
    let icon;
    if (card.logo === "pair") {
      icon = h("div", { class: "fsc-pop-pair" }, h("span", { html: logoSvg(brandOf(card.pairApp).key, 36) }), h("span", { class: "fsc-pop-pair-arrow" }, "\u21C4"), h("span", { html: logoSvg("fancyagent", 36) }));
    } else if (card.person) icon = avatar(card.person, 36);
    else icon = h("span", { html: logoSvg(card.logo || "fancyagent", 36) });
    const el = h(
      "div",
      { class: "fsc-pop", role: "dialog", "aria-label": card.title },
      h("div", { class: "fsc-pop-head" }, icon, h("div", { class: "fsc-pop-title" }, card.title), h("button", { class: "fsc-pop-x", "aria-label": "Schlie\xDFen", onclick: () => this.close(card.key) }, "\xD7")),
      card.text ? h("div", { class: "fsc-pop-text" }, card.text) : null,
      err,
      h(
        "div",
        { class: "fsc-pop-actions" },
        card.actions.map(
          (a) => h(
            "button",
            {
              class: `fsc-btn${a.primary ? " fsc-btn-primary" : ""}${a.danger ? " fsc-btn-danger" : ""}`,
              onclick: async () => {
                busy(true);
                try {
                  await a.run();
                  this.close(card.key);
                } catch (e) {
                  err.textContent = e?.message || "Das hat nicht geklappt.";
                  busy(false);
                }
              }
            },
            a.label
          )
        )
      )
    );
    this.el.appendChild(el);
    this.shown.set(card.key, el);
    requestAnimationFrame(() => el.classList.add("fsc-pop-in"));
    if (card.timeout) setTimeout(() => this.close(card.key), card.timeout);
  }
  close(key) {
    const el = this.shown.get(key);
    if (!el) return;
    this.shown.delete(key);
    el.classList.remove("fsc-pop-in");
    setTimeout(() => el.remove(), 200);
  }
};
function roleLabel(role) {
  return { contributor: "Mitarbeit", reviewer: "Review", maintainer: "Verwaltung", owner: "Besitzer" }[role] || role;
}

// src/chat.ts
var QUICK = ["\u{1F44D}", "\u2764\uFE0F", "\u{1F602}", "\u{1F525}", "\u{1F389}", "\u{1F440}", "\u2705", "\u{1F64F}"];
var DOC_LABEL = { text: "Datei", "kuroi-timeline": "Kuroi-Cut-Schnitt", "agent-session": "Agent-Session" };
var CollabChat = class {
  constructor(container, opts) {
    __publicField(this, "el");
    __publicField(this, "c");
    __publicField(this, "o");
    __publicField(this, "view", { type: "home" });
    __publicField(this, "rail", h("nav", { class: "fsc-rail", "aria-label": "Projekte" }));
    __publicField(this, "side", h("aside", { class: "fsc-side" }));
    __publicField(this, "main", h("section", { class: "fsc-main" }));
    __publicField(this, "members", h("aside", { class: "fsc-members" }));
    __publicField(this, "list", null);
    __publicField(this, "typingEl", null);
    __publicField(this, "composer", null);
    __publicField(this, "replyTo", null);
    __publicField(this, "messages", []);
    __publicField(this, "hasMore", false);
    __publicField(this, "presence", /* @__PURE__ */ new Map());
    __publicField(this, "channels", /* @__PURE__ */ new Map());
    __publicField(this, "typing", /* @__PURE__ */ new Map());
    __publicField(this, "lastTypingSent", 0);
    __publicField(this, "off", []);
    __publicField(this, "blobUrls", []);
    __publicField(this, "pendingFiles", []);
    this.c = opts.client;
    this.o = opts;
    const b = brandOf(opts.app);
    this.el = h("div", { class: "fsc-root fsc-app" }, this.rail, this.side, this.main, this.members);
    this.el.style.setProperty("--fsc-accent", b.accent);
    this.el.style.setProperty("--fsc-accent-light", b.light);
    container.appendChild(this.el);
    const c = this.c;
    this.off.push(
      c.on("state", (st) => {
        for (const p of st?.projects || []) {
          this.c.subscribe(p.id);
          if (!this.channels.has(p.id)) this.loadChannels(p.id).then(() => this.renderRail()).catch(() => {
          });
        }
        this.renderAll();
      }),
      c.on("message", (m) => this.onMessage(m)),
      c.on("message-update", (m) => this.onMessageUpdate(m.message, "m")),
      c.on("dm", (m) => this.onDm(m)),
      c.on("dm-update", (m) => this.onMessageUpdate(m.message, "d")),
      c.on("typing", (m) => this.onTyping(m)),
      c.on("presence", (m) => {
        this.presence.set(m.project, { users: m.users, terms: m.terms || [] });
        if (this.view.type === "channel" && this.view.project === m.project) {
          this.renderMembers();
          this.renderSide();
        }
      }),
      c.on("channels", (m) => this.reloadChannels(m.project)),
      c.on("docs", (m) => this.view.type === "channel" && this.view.project === m.project && this.renderSide()),
      c.on("refresh", (m) => {
        if (m.what === "members" && this.view.type === "channel" && this.view.project === m.project) this.renderMembers();
        if (m.what === "messages" && this.view.type === "channel" && this.view.project === m.project) this.fetchNewer();
      }),
      c.on("connection", () => this.renderStatus())
    );
    setInterval(() => this.renderTyping(), 1500);
    this.renderAll();
  }
  destroy() {
    this.off.forEach((f) => f());
    this.blobUrls.forEach((u) => URL.revokeObjectURL(u));
    this.el.remove();
  }
  /** Von außen öffnen (Popup „Öffnen“, Deep-Link). */
  async open(target) {
    if (target.kind === "dm" && target.thread_id) return this.go({ type: "dm", thread: target.thread_id });
    if (target.project_id) {
      const chans = await this.loadChannels(target.project_id);
      return this.go({ type: "channel", project: target.project_id, channel: target.channel_id || chans[0]?.id });
    }
  }
  // ------------------------------------------------------------ Navigation
  async go(v) {
    if (this.view.type === "channel" && (v.type !== "channel" || v.project !== this.view.project)) {
    }
    this.view = v;
    this.replyTo = null;
    this.messages = [];
    if (v.type === "channel") {
      this.c.subscribe(v.project);
      this.c.presence(v.project, `liest #${this.channelName(v.project, v.channel)}`);
    }
    this.renderAll();
    await this.loadMessages();
  }
  channelName(project, id) {
    return this.channels.get(project)?.find((c) => c.id === id)?.name || "kanal";
  }
  async loadChannels(project) {
    const list = await this.c.api("GET", `/projects/${project}/channels`);
    this.channels.set(project, list);
    return list;
  }
  async reloadChannels(project) {
    await this.loadChannels(project).catch(() => {
    });
    if (this.view.type === "channel" && this.view.project === project) this.renderSide();
  }
  // ------------------------------------------------------------ Rendern
  renderAll() {
    const st = this.c.state;
    if (st && this.c.mode === "device" && !this.c.approved) this.view = { type: "link" };
    else if (this.view.type === "link" && this.c.approved) this.view = { type: "home" };
    this.el.classList.toggle("fsc-linking", this.view.type === "link");
    this.renderRail();
    this.renderSide();
    this.renderMain();
    this.renderMembers();
  }
  renderStatus() {
    this.el.classList.toggle("fsc-offline", !this.c.connected);
  }
  renderRail() {
    clear(this.rail);
    const st = this.c.state;
    if (!st || this.view.type === "link") return;
    const dmUnread = st.dms?.reduce((n, d) => n + (d.unread || 0), 0) || 0;
    this.rail.appendChild(
      h(
        "button",
        { class: `fsc-rail-item fsc-rail-home${this.view.type !== "channel" ? " active" : ""}`, title: "Direktnachrichten", onclick: () => this.go({ type: "home" }) },
        h("span", { html: logoSvg(this.o.app, 44) }),
        dmUnread ? h("span", { class: "fsc-badge" }, dmUnread > 99 ? "99+" : dmUnread) : null
      )
    );
    this.rail.appendChild(h("div", { class: "fsc-rail-sep" }));
    for (const p of st.projects || []) {
      const active = this.view.type === "channel" && this.view.project === p.id;
      const unread = (this.channels.get(p.id) || []).reduce((n, c) => n + (c.unread || 0), 0);
      this.rail.appendChild(
        h(
          "button",
          {
            class: `fsc-rail-item${active ? " active" : ""}`,
            title: p.name,
            onclick: async () => {
              const chans = this.channels.get(p.id) || await this.loadChannels(p.id);
              this.go({ type: "channel", project: p.id, channel: chans[0]?.id });
            }
          },
          h("span", { class: "fsc-rail-letter" }, initials(p.name)),
          unread ? h("span", { class: "fsc-dot" }) : null
        )
      );
    }
    this.rail.appendChild(
      h("button", { class: "fsc-rail-item fsc-rail-add", title: "Projekt erstellen oder beitreten (FancyAgent)", onclick: () => this.external(`${this.c.hub}/app/projects`) }, "+")
    );
  }
  renderSide() {
    clear(this.side);
    const st = this.c.state;
    if (!st || this.view.type === "link") return;
    if (this.view.type !== "channel") {
      this.side.appendChild(h("div", { class: "fsc-side-head" }, "Direktnachrichten", h("button", { class: "fsc-icon-btn", title: "Neue Nachricht", onclick: () => this.newDmDialog() }, "+")));
      const list2 = h("div", { class: "fsc-side-list" });
      for (const d of st.dms || []) {
        list2.appendChild(
          h(
            "button",
            { class: `fsc-side-item${this.view.type === "dm" && this.view.thread === d.id ? " active" : ""}${d.unread ? " unread" : ""}`, onclick: () => this.go({ type: "dm", thread: d.id }) },
            avatar(d.with, 28),
            h("span", { class: "fsc-side-name" }, d.with.name),
            d.unread ? h("span", { class: "fsc-badge" }, d.unread) : null
          )
        );
      }
      if (!(st.dms || []).length) list2.appendChild(h("div", { class: "fsc-empty-small" }, "Noch keine Unterhaltungen. Schreib jemandem aus deinen Projekten."));
      this.side.appendChild(list2);
      this.side.appendChild(this.meBar());
      return;
    }
    const v = this.view;
    const project = st.projects.find((p) => p.id === v.project);
    const canManage = ["maintainer", "owner"].includes(project?.my_role || "");
    this.side.appendChild(
      h(
        "div",
        { class: "fsc-side-head" },
        h("span", { class: "fsc-ellipsis" }, project?.name || "Projekt"),
        h("button", { class: "fsc-icon-btn", title: "Leute einladen", onclick: () => this.inviteDialog(v.project, canManage) }, "\u{1F464}+")
      )
    );
    const list = h("div", { class: "fsc-side-list" });
    list.appendChild(h("div", { class: "fsc-side-group" }, "Kan\xE4le", canManage ? h("button", { class: "fsc-icon-btn", title: "Kanal erstellen", onclick: () => this.newChannelDialog(v.project) }, "+") : null));
    for (const ch of this.channels.get(v.project) || []) {
      list.appendChild(
        h(
          "button",
          { class: `fsc-side-item${v.channel === ch.id ? " active" : ""}${ch.unread ? " unread" : ""}`, onclick: () => this.go({ type: "channel", project: v.project, channel: ch.id }) },
          h("span", { class: "fsc-hash" }, "#"),
          h("span", { class: "fsc-side-name" }, ch.name),
          ch.unread && v.channel !== ch.id ? h("span", { class: "fsc-badge" }, ch.unread) : null
        )
      );
    }
    const live = h("div", { class: "fsc-live" });
    list.appendChild(h("div", { class: "fsc-side-group" }, "Live"));
    list.appendChild(live);
    const pres = this.presence.get(v.project);
    for (const t of pres?.terms || []) {
      live.appendChild(
        h(
          "button",
          { class: "fsc-side-item", title: `Terminal von ${t.owner.name} (nur zuschauen)`, onclick: () => this.o.onOpenTerminal?.({ project: v.project, sid: t.sid, title: t.title, owner: t.owner }) },
          h("span", { class: "fsc-live-icon" }, "\u25B6"),
          h("span", { class: "fsc-side-name" }, `${t.title} \xB7 ${t.owner.name}`)
        )
      );
    }
    this.c.api("GET", `/projects/${v.project}/docs`).then((docs) => {
      for (const d of docs.slice(0, 30)) {
        const openable = !this.o.docKinds || this.o.docKinds.includes(d.kind);
        live.appendChild(
          h(
            "button",
            {
              class: `fsc-side-item${openable ? "" : " disabled"}`,
              title: openable ? `${DOC_LABEL[d.kind] || d.kind} \xF6ffnen` : `${DOC_LABEL[d.kind] || d.kind} \u2013 \xF6ffnet sich in der passenden App`,
              onclick: () => openable && this.o.onOpenDoc?.({ project: v.project, doc: d.doc, kind: d.kind, title: d.title })
            },
            h("span", { class: "fsc-live-icon" }, d.kind === "kuroi-timeline" ? "\u{1F3AC}" : d.kind === "agent-session" ? "\u{1F916}" : "\u{1F4C4}"),
            h("span", { class: "fsc-side-name" }, d.title)
          )
        );
      }
      if (!docs.length && !(pres?.terms || []).length) live.appendChild(h("div", { class: "fsc-empty-small" }, "Noch nichts live geteilt."));
    }).catch(() => {
    });
    this.side.appendChild(list);
    this.side.appendChild(this.meBar());
  }
  meBar() {
    const st = this.c.state;
    return h(
      "div",
      { class: "fsc-me" },
      avatar(st.me, 32),
      h("div", { class: "fsc-me-text" }, h("div", { class: "fsc-me-name" }, st.me.name), h("div", { class: "fsc-me-sub" }, `${st.plan.toUpperCase()} \xB7 ${this.c.connected ? "online" : "verbinde \u2026"}`))
    );
  }
  renderMain() {
    clear(this.main);
    this.list = null;
    this.composer = null;
    const st = this.c.state;
    if (!st) {
      this.main.appendChild(h("div", { class: "fsc-empty" }, h("div", { class: "fsc-spinner" }), "Verbinde mit FancyAgent \u2026"));
      return;
    }
    if (this.view.type === "link") return this.renderLink();
    if (this.view.type === "home") {
      this.main.appendChild(
        h(
          "div",
          { class: "fsc-empty fsc-welcome" },
          h("span", { html: logoSvg(this.o.app, 72) }),
          h("h2", null, `Hallo ${st.me.name}!`),
          h("p", null, "W\xE4hle links ein Projekt oder eine Unterhaltung. Projekte erstellst du in FancyAgent; Einladungen erscheinen hier als Popup.")
        )
      );
      return;
    }
    const v = this.view;
    let title;
    if (v.type === "channel") {
      const ch = this.channels.get(v.project)?.find((c) => c.id === v.channel);
      title = h("div", { class: "fsc-main-title" }, h("span", { class: "fsc-hash" }, "#"), h("b", null, ch?.name || ""), ch?.topic ? h("span", { class: "fsc-topic" }, ch.topic) : null);
    } else {
      const d = st.dms.find((x) => x.id === v.thread);
      title = h("div", { class: "fsc-main-title" }, d ? avatar(d.with, 24) : null, h("b", null, d?.with?.name || "Unterhaltung"));
    }
    this.list = h("div", { class: "fsc-messages", role: "log" });
    this.list.addEventListener("scroll", () => {
      if (this.list.scrollTop < 60 && this.hasMore) this.loadOlder();
    });
    this.typingEl = h("div", { class: "fsc-typing" });
    this.main.appendChild(h("header", { class: "fsc-main-head" }, title));
    this.main.appendChild(this.list);
    this.main.appendChild(this.typingEl);
    this.main.appendChild(this.renderComposer());
  }
  renderLink() {
    const b = brandOf(this.o.app);
    const status = h("p", { class: "fsc-link-status" });
    const btn = h(
      "button",
      {
        class: "fsc-btn fsc-btn-primary fsc-btn-big",
        onclick: async () => {
          btn.disabled = true;
          try {
            await this.c.requestLink();
            status.textContent = "Anfrage gesendet. Best\xE4tige sie jetzt in FancyAgent (Popup) \u2013 im Browser oder in der FancyAgent-App.";
            openBtn.style.display = "";
          } catch (e) {
            status.textContent = e.message;
          }
          btn.disabled = false;
        }
      },
      "Mit FancyAgent verbinden"
    );
    const openBtn = h("button", { class: "fsc-btn", style: { display: "none" }, onclick: () => this.external(`${this.c.hub}/app/settings`) }, "FancyAgent \xF6ffnen");
    this.main.appendChild(
      h(
        "div",
        { class: "fsc-empty fsc-link" },
        h("div", { class: "fsc-link-logos" }, h("span", { html: logoSvg(b.key, 84) }), h("span", { class: "fsc-link-arrow" }, "\u21C4"), h("span", { html: logoSvg("fancyagent", 84) })),
        h("h2", null, `${b.name} mit FancyAgent verbinden`),
        h("p", null, "Danach arbeitest du hier mit anderen zusammen: Chat wie bei Discord, Einladungen, Live-Bearbeitung und geteilte Agent-Sessions."),
        h("div", { class: "fsc-row" }, btn, openBtn),
        status,
        h("p", { class: "fsc-hint" }, "Du kannst die Verbindung auch in FancyAgent unter Einstellungen \u2192 Apps starten \u2013 dann erscheint hier ein Popup zum Best\xE4tigen.")
      )
    );
  }
  renderMembers() {
    clear(this.members);
    this.members.style.display = this.view.type === "channel" ? "" : "none";
    if (this.view.type !== "channel") return;
    const v = this.view;
    const pres = this.presence.get(v.project)?.users || [];
    const online = /* @__PURE__ */ new Map();
    for (const p of pres) online.set(p.user.id, [...online.get(p.user.id) || [], p]);
    this.members.appendChild(h("div", { class: "fsc-side-group" }, `Online \u2013 ${online.size}`));
    for (const [, entries] of online) {
      const u = entries[0].user;
      this.members.appendChild(
        h(
          "div",
          { class: "fsc-member", title: entries.map((e) => `${e.app_name}${e.activity ? `: ${e.activity}` : ""}`).join("\n") },
          h("span", { class: "fsc-member-av" }, avatar(u, 30), h("span", { class: "fsc-online" })),
          h(
            "div",
            { class: "fsc-member-text" },
            h("div", { class: "fsc-member-name" }, u.name),
            h("div", { class: "fsc-member-sub" }, entries.map((e) => h("span", { class: "fsc-app-chip", html: logoSvg(brandOf(e.app === "web" ? "fancyagent" : e.app).key, 14) }))),
            entries.find((e) => e.activity) ? h("div", { class: "fsc-member-act" }, entries.find((e) => e.activity).activity) : null
          )
        )
      );
    }
    this.c.api("GET", `/projects/${v.project}/members`).then((m) => {
      const off = (m.members || []).filter((x) => !online.has(x.id));
      if (!off.length) return;
      this.members.appendChild(h("div", { class: "fsc-side-group" }, `Offline \u2013 ${off.length}`));
      for (const u of off) {
        this.members.appendChild(
          h("div", { class: "fsc-member offline", title: roleLabel(u.role) }, h("span", { class: "fsc-member-av" }, avatar(u, 30)), h("div", { class: "fsc-member-text" }, h("div", { class: "fsc-member-name" }, u.name || u.login), h("div", { class: "fsc-member-act" }, roleLabel(u.role))))
        );
      }
    }).catch(() => {
    });
  }
  // ------------------------------------------------------------ Nachrichten
  historyPath(extra = "") {
    const v = this.view;
    if (v.type === "channel") return `/projects/${v.project}/channels/${v.channel}/messages${extra}`;
    if (v.type === "dm") return `/dms/${v.thread}/messages${extra}`;
    return "";
  }
  async loadMessages() {
    if (this.view.type !== "channel" && this.view.type !== "dm") return;
    const view = this.view;
    try {
      const r = await this.c.api("GET", this.historyPath("?limit=50"));
      if (this.view !== view) return;
      this.messages = r.messages;
      this.hasMore = r.has_more;
      this.renderMessages(true);
      this.markRead();
    } catch (e) {
      this.list?.appendChild(h("div", { class: "fsc-error" }, e.message));
    }
  }
  async loadOlder() {
    if (!this.messages.length || !this.list) return;
    this.hasMore = false;
    const view = this.view;
    const r = await this.c.api("GET", this.historyPath(`?limit=50&before=${this.messages[0].id}`));
    if (this.view !== view) return;
    const prevHeight = this.list.scrollHeight;
    this.messages = [...r.messages, ...this.messages];
    this.hasMore = r.has_more;
    this.renderMessages(false);
    this.list.scrollTop = this.list.scrollHeight - prevHeight;
  }
  async fetchNewer() {
    const last = this.messages.at(-1)?.id || 0;
    const r = await this.c.api("GET", this.historyPath(`?after=${last}`)).catch(() => null);
    if (!r) return;
    for (const m of r.messages) if (!this.messages.some((x) => x.id === m.id)) this.messages.push(m);
    this.renderMessages(true);
  }
  markRead() {
    const last = this.messages.at(-1)?.id;
    if (!last) return;
    const v = this.view;
    const key = v.type === "channel" ? `c:${v.channel}` : v.type === "dm" ? `d:${v.thread}` : "";
    if (!key) return;
    this.c.api("POST", "/read", { key, last_id: last }).catch(() => {
    });
    if (v.type === "channel") {
      const ch = this.channels.get(v.project)?.find((c) => c.id === v.channel);
      if (ch?.unread) {
        ch.unread = 0;
        this.renderSide();
        this.renderRail();
      }
    } else if (v.type === "dm") {
      const d = this.c.state?.dms.find((x) => x.id === v.thread);
      if (d?.unread) {
        d.unread = 0;
        this.renderSide();
        this.renderRail();
      }
    }
  }
  renderMessages(scrollToEnd) {
    if (!this.list) return;
    const nearBottom = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 120;
    clear(this.list);
    if (!this.messages.length) {
      this.list.appendChild(h("div", { class: "fsc-empty-small fsc-first" }, "Hier ist noch nichts. Schreib die erste Nachricht!"));
      return;
    }
    if (this.hasMore) this.list.appendChild(h("div", { class: "fsc-more" }, "\xC4ltere Nachrichten laden \u2026"));
    let prev = null;
    for (const m of this.messages) {
      const day = new Date(m.at).toDateString();
      if (!prev || new Date(prev.at).toDateString() !== day) this.list.appendChild(h("div", { class: "fsc-day" }, h("span", null, new Date(m.at).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" }))));
      const grouped = prev && !m.reply && prev.author?.type === m.author?.type && prev.author?.id === m.author?.id && m.at - prev.at < 5 * 6e4 && new Date(prev.at).toDateString() === day;
      this.list.appendChild(this.messageEl(m, grouped));
      prev = m;
    }
    if (scrollToEnd || nearBottom) this.list.scrollTop = this.list.scrollHeight;
  }
  messageEl(m, grouped) {
    const me = this.c.state?.me;
    const scope = this.view.type === "dm" ? "d" : "m";
    const mine = m.author?.type === "user" && m.author.id === me?.id;
    const v = this.view;
    const projectRole = v.type === "channel" ? this.c.state?.projects.find((p) => p.id === v.project)?.my_role : "";
    const canDelete = mine || scope === "m" && ["maintainer", "owner"].includes(projectRole || "");
    const isAgent = m.author?.type === "agent";
    const mentionsMe = me && !mine && new RegExp(`(^|\\s)@(${escapeRe(me.login)}|alle)\\b`, "i").test(m.body || "");
    const body = h("div", { class: "fsc-msg-body" });
    if (m.deleted) body.appendChild(h("span", { class: "fsc-deleted" }, "Nachricht gel\xF6scht"));
    else {
      body.appendChild(richText(m.body || "", me?.login));
      if (m.edited_at) body.appendChild(h("span", { class: "fsc-edited", title: timeLabel(m.edited_at) }, " (bearbeitet)"));
    }
    const atts = h("div", { class: "fsc-atts" });
    for (const a of m.attachments || []) atts.appendChild(this.attachmentEl(a));
    const reacts = h("div", { class: "fsc-reacts" });
    for (const r of m.reactions || []) {
      reacts.appendChild(
        h("button", { class: `fsc-react${r.me ? " me" : ""}`, title: r.users.join(", "), onclick: () => this.react(scope, m.id, r.emoji, !r.me) }, `${r.emoji} ${r.count}`)
      );
    }
    const tools = m.deleted ? null : h(
      "div",
      { class: "fsc-msg-tools" },
      QUICK.slice(0, 4).map((e) => h("button", { class: "fsc-tool", title: `Mit ${e} reagieren`, onclick: () => this.react(scope, m.id, e, true) }, e)),
      h("button", { class: "fsc-tool", title: "Mehr Reaktionen", onclick: (ev) => this.emojiPicker(ev.currentTarget, (e) => this.react(scope, m.id, e, true)) }, "\u{1F600}+"),
      h("button", { class: "fsc-tool", title: "Antworten", onclick: () => this.setReply(m) }, "\u21A9"),
      mine ? h("button", { class: "fsc-tool", title: "Bearbeiten", onclick: () => this.editMessage(m, body) }, "\u270E") : null,
      canDelete ? h("button", { class: "fsc-tool fsc-tool-danger", title: "L\xF6schen", onclick: () => this.deleteMessage(scope, m) }, "\u{1F5D1}") : null
    );
    const reply = m.reply ? h("div", { class: "fsc-reply-ref", onclick: () => this.scrollTo(m.reply.id) }, h("span", { class: "fsc-reply-line" }), h("b", null, m.reply.author?.name || ""), " ", m.reply.deleted ? h("i", null, "gel\xF6scht") : (m.reply.body || "").slice(0, 120)) : null;
    return h(
      "div",
      { class: `fsc-msg${grouped ? " grouped" : ""}${mentionsMe ? " mention" : ""}`, "data-id": m.id },
      reply,
      h(
        "div",
        { class: "fsc-msg-row" },
        grouped ? h("span", { class: "fsc-msg-time-side" }, new Date(m.at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })) : isAgent ? h("span", { class: "fsc-agent-av" }, "\u{1F916}") : avatar(m.author, 40),
        h(
          "div",
          { class: "fsc-msg-main" },
          grouped ? null : h(
            "div",
            { class: "fsc-msg-head" },
            h("span", { class: "fsc-msg-name" }, m.author?.name || "?"),
            isAgent ? h("span", { class: "fsc-tag" }, "AGENT") : null,
            m.to_agent ? h("span", { class: "fsc-msg-to" }, `\u2192 ${m.to_agent.name}`) : null,
            h("span", { class: "fsc-msg-time", title: new Date(m.at).toLocaleString("de-DE") }, timeLabel(m.at))
          ),
          body,
          atts.childNodes.length ? atts : null,
          reacts.childNodes.length ? reacts : null
        )
      ),
      tools
    );
  }
  attachmentEl(a) {
    const holder = h("div", { class: "fsc-att" });
    const load = async (el) => {
      try {
        const url = await this.c.mediaBlobUrl(a.id);
        if (url.startsWith("blob:")) this.blobUrls.push(url);
        el.src = url;
      } catch {
        holder.textContent = `${a.name} (nicht verf\xFCgbar)`;
      }
    };
    if (a.kind === "image") {
      const img = h("img", { alt: a.name, loading: "lazy" });
      load(img);
      holder.appendChild(img);
    } else if (a.kind === "video") {
      const vid = h("video", { controls: true, preload: "metadata" });
      load(vid);
      holder.appendChild(vid);
      holder.appendChild(
        h("div", { class: "fsc-att-name" }, `\u{1F3AC} ${a.name} \xB7 ${formatBytes(a.size)} `, h("button", { class: "fsc-linkbtn", onclick: () => this.openMedia(a.id) }, "\u{1F4AC} Kommentare mit Zeitstempel"))
      );
    } else {
      holder.appendChild(
        h("button", { class: "fsc-att-file", onclick: async () => this.external(await this.c.mediaBlobUrl(a.id)) }, `\u{1F4CE} ${a.name} \xB7 ${formatBytes(a.size)}`)
      );
    }
    return holder;
  }
  /** Video mit Kommentaren an Zeitstempeln (Feedback zu geteilten Kuroi-Videos). */
  async openMedia(id, atMs) {
    let media;
    try {
      media = await this.c.api("GET", `/media/${id}`);
    } catch (e) {
      return this.toast(e.message);
    }
    const vid = h("video", { controls: true, preload: "metadata", class: "fsc-media-video" });
    this.c.mediaBlobUrl(id).then((u) => {
      if (u.startsWith("blob:")) this.blobUrls.push(u);
      vid.src = u;
      if (atMs) vid.currentTime = atMs / 1e3;
    }).catch(() => {
    });
    const list = h("div", { class: "fsc-comments" });
    const fmt = (ms) => `${Math.floor(ms / 6e4)}:${String(Math.floor(ms / 1e3) % 60).padStart(2, "0")}`;
    const render = (items) => {
      clear(list);
      if (!items.length) list.appendChild(h("div", { class: "fsc-empty-small" }, "Noch kein Feedback. Spiel das Video ab, pausiere an einer Stelle und schreib, was dir auff\xE4llt."));
      for (const c of items) {
        list.appendChild(
          h(
            "div",
            { class: "fsc-comment" },
            avatar(c.author, 24),
            h(
              "div",
              { class: "fsc-comment-main" },
              h("div", null, h("b", null, c.author.name), " ", c.at_ms !== null ? h("button", { class: "fsc-ts", onclick: () => {
                vid.currentTime = c.at_ms / 1e3;
                vid.play().catch(() => {
                });
              } }, fmt(c.at_ms)) : null, " ", h("span", { class: "fsc-muted" }, timeLabel(c.created_at))),
              h("div", null, c.body)
            )
          )
        );
      }
    };
    const input = h("input", { class: "fsc-field", placeholder: "Feedback an der aktuellen Stelle \u2026", maxlength: 2e3 });
    const post = async () => {
      if (!input.value.trim()) return;
      try {
        render(await this.c.api("POST", `/media/${id}/comments`, { body: input.value, at_ms: Math.round(vid.currentTime * 1e3) }));
        input.value = "";
      } catch (e) {
        this.toast(e.message);
      }
    };
    input.addEventListener("keydown", (e) => e.key === "Enter" && post());
    this.modal(media.name, h("div", { class: "fsc-form fsc-media" }, vid, list, h("div", { class: "fsc-row" }, input, h("button", { class: "fsc-btn fsc-btn-primary", onclick: post }, "Senden"))));
    this.el.querySelector(".fsc-modal")?.classList.add("wide");
    render(await this.c.api("GET", `/media/${id}/comments`).catch(() => []));
  }
  scrollTo(id) {
    const el = this.list?.querySelector(`[data-id="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 1500);
  }
  async react(scope, id, emoji, on) {
    try {
      const view = await this.c.api("POST", `/chat/${scope}/${id}/react`, { emoji, on });
      this.replaceMessage(view);
    } catch (e) {
      this.toast(e.message);
    }
  }
  replaceMessage(view) {
    const i = this.messages.findIndex((x) => x.id === view.id);
    if (i < 0) return;
    this.messages[i] = view;
    this.renderMessages(false);
  }
  editMessage(m, body) {
    const ta = h("textarea", { class: "fsc-edit", rows: 2 });
    ta.value = m.body;
    const save = async () => {
      try {
        this.replaceMessage(await this.c.api("PATCH", `/chat/${this.view.type === "dm" ? "d" : "m"}/${m.id}`, { text: ta.value }));
      } catch (e) {
        this.toast(e.message);
      }
    };
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        save();
      }
      if (e.key === "Escape") this.renderMessages(false);
    });
    clear(body);
    body.appendChild(ta);
    body.appendChild(h("div", { class: "fsc-hint" }, "Enter = speichern \xB7 Esc = abbrechen"));
    ta.focus();
  }
  async deleteMessage(scope, m) {
    if (!await this.confirm("Nachricht l\xF6schen?", "Das kann nicht r\xFCckg\xE4ngig gemacht werden.")) return;
    try {
      this.replaceMessage(await this.c.api("DELETE", `/chat/${scope}/${m.id}`));
    } catch (e) {
      this.toast(e.message);
    }
  }
  setReply(m) {
    this.replyTo = m;
    this.renderMain();
    this.renderMessages(false);
    this.composer?.focus();
  }
  // ------------------------------------------------------------ Eingabe
  renderComposer() {
    const v = this.view;
    const placeholder = v.type === "channel" ? `Nachricht an #${this.channelName(v.project, v.channel)}` : "Nachricht schreiben";
    const ta = h("textarea", { class: "fsc-input", rows: 1, placeholder, "aria-label": placeholder, maxlength: 4e3 });
    this.composer = ta;
    const suggest = h("div", { class: "fsc-suggest" });
    ta.addEventListener("input", () => {
      ta.style.height = "auto";
      ta.style.height = `${Math.min(200, ta.scrollHeight)}px`;
      this.sendTyping();
      this.mentionSuggest(ta, suggest);
    });
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        this.submit(ta);
      }
      if (e.key === "Escape" && this.replyTo) {
        this.replyTo = null;
        this.renderMain();
        this.renderMessages(true);
      }
    });
    const files = h("div", { class: "fsc-pending" });
    this.renderPending(files);
    const fileInput = h("input", { type: "file", multiple: true, style: { display: "none" } });
    fileInput.addEventListener("change", () => {
      for (const f of Array.from(fileInput.files || [])) this.pendingFiles.push({ file: f, progress: 0 });
      fileInput.value = "";
      this.renderPending(files);
    });
    const mediaOn = this.c.state?.media?.enabled !== false;
    return h(
      "div",
      { class: "fsc-composer" },
      this.replyTo ? h("div", { class: "fsc-replying" }, "Antwort an ", h("b", null, this.replyTo.author?.name), h("button", { class: "fsc-icon-btn", title: "Abbrechen", onclick: () => {
        this.replyTo = null;
        this.renderMain();
        this.renderMessages(true);
      } }, "\xD7")) : null,
      files,
      suggest,
      h(
        "div",
        { class: "fsc-input-row" },
        mediaOn ? h("button", { class: "fsc-icon-btn fsc-attach", title: "Datei anh\xE4ngen", onclick: () => fileInput.click() }, "+") : null,
        fileInput,
        ta,
        h("button", { class: "fsc-icon-btn", title: "Emoji", onclick: (ev) => this.emojiPicker(ev.currentTarget, (e) => {
          ta.value += e;
          ta.focus();
        }) }, "\u{1F600}"),
        h("button", { class: "fsc-btn fsc-btn-primary fsc-send", title: "Senden (Enter)", onclick: () => this.submit(ta) }, "Senden")
      )
    );
  }
  renderPending(box) {
    clear(box);
    for (const p of this.pendingFiles) {
      box.appendChild(
        h(
          "div",
          { class: `fsc-pending-item${p.error ? " error" : ""}` },
          `\u{1F4CE} ${p.file.name} (${formatBytes(p.file.size)})`,
          p.progress > 0 && p.progress < 1 ? h("span", { class: "fsc-progress" }, `${Math.round(p.progress * 100)} %`) : null,
          p.error ? h("span", null, ` \u2013 ${p.error}`) : null,
          h("button", { class: "fsc-icon-btn", onclick: () => {
            this.pendingFiles = this.pendingFiles.filter((x) => x !== p);
            this.renderPending(box);
          } }, "\xD7")
        )
      );
    }
  }
  async submit(ta) {
    const text = ta.value.trim();
    if (!text && !this.pendingFiles.length) return;
    const v = this.view;
    const project = v.type === "channel" ? v.project : null;
    const box = ta.closest(".fsc-composer")?.querySelector(".fsc-pending");
    ta.disabled = true;
    try {
      const attachments = [];
      for (const p of this.pendingFiles) {
        if (p.id) {
          attachments.push(p.id);
          continue;
        }
        const kind = p.file.type.startsWith("image/") ? "image" : p.file.type.startsWith("video/") ? "video" : p.file.type.startsWith("audio/") ? "audio" : "file";
        try {
          const media = await this.c.upload(p.file, { projectId: project, kind, name: p.file.name, onProgress: (x) => {
            p.progress = x;
            this.renderPending(box);
          } });
          p.id = media.id;
          attachments.push(media.id);
        } catch (e) {
          p.error = e.message;
          this.renderPending(box);
          throw e;
        }
      }
      const body = { text, reply_to: this.replyTo?.id || null, attachments };
      const msg = await this.c.api("POST", this.historyPath(), body);
      if (!this.messages.some((x) => x.id === msg.id)) this.messages.push(msg);
      ta.value = "";
      ta.style.height = "auto";
      this.pendingFiles = [];
      this.renderPending(box);
      if (this.replyTo) {
        this.replyTo = null;
        this.renderMain();
      }
      this.renderMessages(true);
    } catch (e) {
      this.toast(e instanceof HubError ? e.message : "Senden fehlgeschlagen.");
    } finally {
      ta.disabled = false;
      (this.composer || ta).focus();
    }
  }
  sendTyping() {
    const now = Date.now();
    if (now - this.lastTypingSent < 3e3) return;
    this.lastTypingSent = now;
    const v = this.view;
    if (v.type === "channel") this.c.send({ t: "typing", project: v.project, channel: v.channel });
    if (v.type === "dm") this.c.send({ t: "typing", thread: v.thread });
  }
  async mentionSuggest(ta, box) {
    clear(box);
    const v = this.view;
    if (v.type !== "channel") return;
    const m = /(^|\s)@([A-Za-z0-9_.-]{0,20})$/.exec(ta.value.slice(0, ta.selectionStart));
    if (!m) return;
    const q = m[2].toLowerCase();
    const members = await this.c.api("GET", `/projects/${v.project}/members`).catch(() => null);
    const hits = [{ login: "alle", name: "Alle im Projekt" }, ...members?.members || []].filter((u) => u.login.toLowerCase().startsWith(q) || (u.name || "").toLowerCase().startsWith(q)).slice(0, 6);
    for (const u of hits) {
      box.appendChild(
        h("button", { class: "fsc-suggest-item", onclick: () => {
          const pos = ta.selectionStart;
          const before = ta.value.slice(0, pos).replace(/@[A-Za-z0-9_.-]*$/, `@${u.login} `);
          ta.value = before + ta.value.slice(pos);
          ta.focus();
          clear(box);
        } }, u.login === "alle" ? null : avatar(u, 20), h("b", null, `@${u.login}`), " ", h("span", { class: "fsc-muted" }, u.name || ""))
      );
    }
  }
  // ------------------------------------------------------------ Live-Ereignisse
  onMessage(m) {
    const v = this.view;
    if (v.type === "channel" && v.project === m.project && v.channel === m.channel) {
      if (!this.messages.some((x) => x.id === m.message.id)) {
        this.messages.push(withMe(m.message, this.c.state?.me?.id));
        this.typing.delete(`u${m.message.author?.id}`);
        this.renderMessages(false);
        if (document.hasFocus()) this.markRead();
      }
      return;
    }
    const ch = this.channels.get(m.project)?.find((c) => c.id === m.channel);
    if (ch && m.message.author?.id !== this.c.state?.me?.id) {
      ch.unread = (ch.unread || 0) + 1;
      this.renderRail();
      if (v.type === "channel" && v.project === m.project) this.renderSide();
    }
  }
  onDm(m) {
    const st = this.c.state;
    if (!st) return;
    const v = this.view;
    const mine = m.message.author?.id === st.me.id;
    let d = st.dms.find((x) => x.id === m.thread);
    if (!d) {
      this.c.api("GET", "/dms").then((dms) => {
        st.dms = dms;
        this.renderRail();
        if (this.view.type !== "channel") this.renderSide();
      });
    } else {
      d.last_at = m.message.at;
      st.dms.sort((a, b) => b.last_at - a.last_at);
    }
    if (v.type === "dm" && v.thread === m.thread) {
      if (!this.messages.some((x) => x.id === m.message.id)) {
        this.messages.push(m.message);
        this.renderMessages(false);
        this.markRead();
      }
    } else if (d && !mine) {
      d.unread = (d.unread || 0) + 1;
      this.renderRail();
      if (v.type !== "channel") this.renderSide();
    }
  }
  onMessageUpdate(view, scope) {
    if (scope === "d" !== (this.view.type === "dm")) return;
    const i = this.messages.findIndex((x) => x.id === view.id);
    if (i < 0) return;
    const old = this.messages[i];
    view.reactions = (view.reactions || []).map((r) => ({ ...r, me: r.users?.includes(this.c.state?.me?.name) ?? old.reactions?.find((o) => o.emoji === r.emoji)?.me ?? false }));
    this.messages[i] = view;
    this.renderMessages(false);
  }
  onTyping(m) {
    const v = this.view;
    const here = m.thread && v.type === "dm" && v.thread === m.thread || m.project && v.type === "channel" && v.project === m.project && v.channel === m.channel;
    if (!here || m.user?.id === this.c.state?.me?.id) return;
    this.typing.set(`u${m.user.id}`, { name: m.user.name, until: Date.now() + 6e3 });
    this.renderTyping();
  }
  renderTyping() {
    if (!this.typingEl) return;
    const now = Date.now();
    const names = [...this.typing.entries()].filter(([k, t]) => t.until > now ? true : (this.typing.delete(k), false)).map(([, t]) => t.name);
    this.typingEl.textContent = names.length ? `${names.slice(0, 3).join(", ")} ${names.length === 1 ? "tippt" : "tippen"} \u2026` : "";
  }
  // ------------------------------------------------------------ Dialoge
  modal(title, body, actions = []) {
    const close = () => wrap.remove();
    const wrap = h(
      "div",
      { class: "fsc-modal-wrap", onclick: (e) => e.target === wrap && close() },
      h("div", { class: "fsc-modal", role: "dialog", "aria-label": title }, h("div", { class: "fsc-modal-head" }, h("b", null, title), h("button", { class: "fsc-icon-btn", onclick: close, "aria-label": "Schlie\xDFen" }, "\xD7")), body, actions.length ? h("div", { class: "fsc-modal-actions" }, actions) : null)
    );
    wrap.addEventListener("keydown", (e) => e.key === "Escape" && close());
    this.el.appendChild(wrap);
    return close;
  }
  confirm(title, text) {
    return new Promise((resolve) => {
      const close = this.modal(title, h("p", null, text), [
        h("button", { class: "fsc-btn", onclick: () => {
          close();
          resolve(false);
        } }, "Abbrechen"),
        h("button", { class: "fsc-btn fsc-btn-danger", onclick: () => {
          close();
          resolve(true);
        } }, "L\xF6schen")
      ]);
    });
  }
  toast(text) {
    const t = h("div", { class: "fsc-toast" }, text);
    this.el.appendChild(t);
    setTimeout(() => t.remove(), 4e3);
  }
  newChannelDialog(project) {
    const name = h("input", { class: "fsc-field", placeholder: "z. B. schnitt-ideen", maxlength: 32 });
    const topic = h("input", { class: "fsc-field", placeholder: "Thema (optional)", maxlength: 200 });
    const err = h("div", { class: "fsc-error" });
    const close = this.modal("Kanal erstellen", h("div", { class: "fsc-form" }, h("label", null, "Name", name), h("label", null, "Thema", topic), err), [
      h("button", { class: "fsc-btn", onclick: () => close() }, "Abbrechen"),
      h("button", { class: "fsc-btn fsc-btn-primary", onclick: async () => {
        try {
          const ch = await this.c.api("POST", `/projects/${project}/channels`, { name: name.value, topic: topic.value });
          close();
          await this.loadChannels(project);
          this.go({ type: "channel", project, channel: ch.id });
        } catch (e) {
          err.textContent = e.message;
        }
      } }, "Erstellen")
    ]);
    name.focus();
  }
  newDmDialog() {
    const q = h("input", { class: "fsc-field", placeholder: "Benutzername suchen \u2026" });
    const results = h("div", { class: "fsc-results" });
    let timer;
    q.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        clear(results);
        const users = await this.c.api("GET", `/users/search?q=${encodeURIComponent(q.value)}`).catch(() => []);
        for (const u of users) {
          results.appendChild(
            h("button", { class: "fsc-result", onclick: async () => {
              try {
                const t = await this.c.api("POST", "/dms", { user_id: u.id });
                close();
                await this.c.loadState();
                this.go({ type: "dm", thread: t.id });
              } catch (e) {
                results.prepend(h("div", { class: "fsc-error" }, e.message));
              }
            } }, avatar(u, 28), h("b", null, u.name), h("span", { class: "fsc-muted" }, ` @${u.login}`))
          );
        }
        if (!users.length && q.value.length >= 2) results.appendChild(h("div", { class: "fsc-empty-small" }, "Niemand gefunden."));
      }, 250);
    });
    const close = this.modal("Neue Direktnachricht", h("div", { class: "fsc-form" }, q, results, h("p", { class: "fsc-hint" }, "Direktnachrichten gehen an Leute, mit denen du ein Projekt teilst.")));
    q.focus();
  }
  inviteDialog(project, canManage) {
    const body = h("div", { class: "fsc-form" });
    if (!canManage) {
      body.appendChild(h("p", null, "Nur Maintainer und der Besitzer k\xF6nnen einladen. Frag im Projekt nach einem Einladungslink."));
      this.modal("Leute einladen", body);
      return;
    }
    const q = h("input", { class: "fsc-field", placeholder: "Benutzername oder GitHub-Name \u2026" });
    const role = h("select", { class: "fsc-field" }, ["contributor", "reviewer", "maintainer"].map((r) => h("option", { value: r }, roleLabel(r))));
    const results = h("div", { class: "fsc-results" });
    const msg = h("div", { class: "fsc-hint" });
    const invite = async (payload) => {
      try {
        await this.c.api("POST", `/projects/${project}/invites/user`, { ...payload, role: role.value });
        msg.textContent = "Eingeladen \u2013 die Person bekommt ein Popup.";
      } catch (e) {
        if (e.status === 404 && payload.login && /^[A-Za-z0-9-]{1,39}$/.test(payload.login)) {
          try {
            await this.c.api("POST", `/projects/${project}/members`, { github_login: payload.login, role: role.value });
            msg.textContent = `GitHub-Einladung f\xFCr ${payload.login} gespeichert.`;
            return;
          } catch (e2) {
            msg.textContent = e2.message;
            return;
          }
        }
        msg.textContent = e.message;
      }
    };
    let timer;
    q.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        clear(results);
        const users = await this.c.api("GET", `/users/search?q=${encodeURIComponent(q.value)}`).catch(() => []);
        for (const u of users) results.appendChild(h("button", { class: "fsc-result", onclick: () => invite({ user_id: u.id }) }, avatar(u, 28), h("b", null, u.name), h("span", { class: "fsc-muted" }, ` @${u.login}`), h("span", { class: "fsc-result-act" }, "Einladen")));
      }, 250);
    });
    q.addEventListener("keydown", (e) => e.key === "Enter" && q.value.trim() && invite({ login: q.value.trim().replace(/^@/, "") }));
    const linkOut = h("div", { class: "fsc-linkbox" });
    const makeLink = async () => {
      try {
        const l = await this.c.api("POST", `/projects/${project}/invite-links`, { role: role.value, expires_hours: Number(exp.value), max_uses: Number(uses.value) });
        clear(linkOut);
        const input = h("input", { class: "fsc-field", readonly: true, value: l.url });
        linkOut.appendChild(input);
        linkOut.appendChild(h("button", { class: "fsc-btn", onclick: async () => {
          await navigator.clipboard?.writeText(l.url).catch(() => input.select());
          msg.textContent = "Link kopiert.";
        } }, "Kopieren"));
      } catch (e) {
        msg.textContent = e.message;
      }
    };
    const exp = h("select", { class: "fsc-field" }, [["24", "1 Tag"], ["168", "7 Tage"], ["720", "30 Tage"], ["0", "Nie"]].map(([v, l]) => h("option", { value: v, selected: v === "168" }, l)));
    const uses = h("select", { class: "fsc-field" }, [["0", "Unbegrenzt"], ["1", "1\xD7"], ["5", "5\xD7"], ["25", "25\xD7"]].map(([v, l]) => h("option", { value: v }, l)));
    body.append(
      h("label", null, "Rolle", role),
      h("label", null, "Person einladen", q),
      results,
      h("div", { class: "fsc-sep" }, "oder Einladungslink"),
      h("div", { class: "fsc-row" }, h("label", null, "G\xFCltig", exp), h("label", null, "Nutzungen", uses), h("button", { class: "fsc-btn fsc-btn-primary", onclick: makeLink }, "Link erstellen")),
      linkOut,
      msg,
      h("p", { class: "fsc-hint" }, "Neue Leute brauchen ein FancyServers-Konto (mit Einladungscode). Wer schon eins hat, bekommt sofort ein Popup in allen Apps.")
    );
    this.modal("Leute einladen", body);
    q.focus();
  }
  emojiPicker(anchor, pick) {
    this.el.querySelector(".fsc-emoji-pop")?.remove();
    const all = [...QUICK, "\u{1F600}", "\u{1F605}", "\u{1F60D}", "\u{1F914}", "\u{1F62E}", "\u{1F622}", "\u{1F621}", "\u{1F973}", "\u{1F4AF}", "\u{1F680}", "\u2B50", "\u{1F4A1}", "\u{1F41B}", "\u2728", "\u{1F3AC}", "\u{1F3B5}", "\u{1F58C}\uFE0F", "\u26A1", "\u{1F44F}", "\u{1F64C}", "\u{1F480}", "\u{1F91D}", "\u274C", "\u23F3"];
    const pop = h("div", { class: "fsc-emoji-pop" }, all.map((e) => h("button", { class: "fsc-emoji", onclick: () => {
      pop.remove();
      pick(e);
    } }, e)));
    const r = anchor.getBoundingClientRect();
    const root = this.el.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(r.left - root.left - 120, root.width - 260))}px`;
    pop.style.top = `${Math.max(8, r.top - root.top - 150)}px`;
    this.el.appendChild(pop);
    setTimeout(() => document.addEventListener("click", function closer(ev) {
      if (!pop.contains(ev.target)) {
        pop.remove();
        document.removeEventListener("click", closer);
      }
    }), 0);
  }
  external(url) {
    if (this.o.openExternal) this.o.openExternal(url);
    else window.open(url, "_blank", "noopener");
  }
};
function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || parts[0]?.[1] || "")).toUpperCase();
}
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function withMe(m, meId) {
  return { ...m, reactions: (m.reactions || []).map((r) => ({ ...r, me: r.me ?? false })), _me: meId };
}

// src/apppopups.ts
var fmtDate = (t) => new Date(t).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
var planName = (p) => p === "max" ? "Galaxy" : p === "pro" ? "Nova" : p === "mini" ? "Spark" : "";
var APP_NAME = { fancycode: "FancyCode", fancygames: "FancyGames", fancyagent: "FancyAgent", kuroi: "Kuroi Studio" };
function giftText(p, app) {
  const parts = [];
  if (p.plan && p.days) parts.push(`${APP_NAME[app]} ${planName(p.plan)}`);
  if (p.resets) parts.push(`${p.resets} Limit-Reset${p.resets === 1 ? "" : "s"}`);
  if (p.supermode) parts.push("Supermode bis heute Nacht");
  const what = parts.join(" + ") || "ein Geschenk";
  const dur = p.plan && p.days ? p.days % 30 === 0 ? `${p.days / 30} ${p.days === 30 ? "Monat" : "Monate"}` : `${p.days} Tage` : p.resets ? "sofort nutzbar" : "";
  return { what, dur };
}
function pageTheme() {
  for (const el of [document.body, document.documentElement, document.querySelector("#root, #app")]) {
    if (!el) continue;
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(getComputedStyle(el).backgroundColor);
    if (!m || m[4] !== void 0 && Number(m[4]) < 0.5) continue;
    const [r, g, b] = [m[1], m[2], m[3]].map(Number);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140 ? "light" : "dark";
  }
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}
function startAppPopups(o) {
  const f = o.fetch || ((...a) => fetch(...a));
  const root = h("div", { class: "fsp-root", "data-app": o.app });
  (o.container || document.body).appendChild(root);
  const theme = () => o.theme?.() || pageTheme();
  const abs = (u) => !u ? "" : /^https:\/\//.test(u) ? u : u.startsWith("/") ? `${o.apiBase.replace(/\/+$/, "")}${u}` : "";
  const open = (url) => o.openExternal ? o.openExternal(url) : window.open(url, "_blank", "noopener");
  let status = null;
  const queue = [];
  const handled = /* @__PURE__ */ new Set();
  let shown = "";
  let stopped = false;
  if (!["fancycode", "fancygames", "fancyagent", "kuroi"].includes(o.app)) {
    const brand = BRANDS[o.app] || BRANDS.fancyagent;
    root.style.setProperty("--fsp-accent", brand.accent);
    root.style.setProperty("--fsp-from", brand.from);
    root.style.setProperty("--fsp-to", brand.to);
  }
  const art = (img) => img ? h("div", { class: "fsp-art" }, h("img", { src: img, alt: "", onerror: (e) => e.target.parentElement.style.display = "none" })) : null;
  function full(kind, img, title, body, actions) {
    return h(
      "div",
      { class: `fsp-full fsp-${kind}`, role: "alertdialog", "aria-modal": "true" },
      h("div", { class: "fsp-full-card" }, art(img), h("h1", {}, title), ...body, actions.length ? h("div", { class: "fsp-actions" }, ...actions) : null)
    );
  }
  function giftCard(p, close) {
    const { what, dur } = giftText(p, o.app);
    const img = abs(theme() === "light" ? p.imageLight || p.image : p.imageDark || p.image);
    return h(
      "div",
      { class: "fsp-backdrop" },
      h(
        "div",
        { class: "fsp-card fsp-gift", role: "dialog", "aria-modal": "true" },
        h("button", { class: "fsp-x", title: "Schlie\xDFen", "aria-label": "Schlie\xDFen", onclick: close }, "\xD7"),
        art(img),
        h("h2", {}, p.title && !/^geschenk!?$/i.test(p.title) ? p.title : "Du hast ein ", p.title && !/^geschenk!?$/i.test(p.title) ? "" : h("em", {}, "Geschenk"), p.title && !/^geschenk!?$/i.test(p.title) ? "" : " erhalten!"),
        h("p", { class: "fsp-sub" }, p.message || `F\xFCr dich: ${what}.`),
        h(
          "div",
          { class: "fsp-giftrow" },
          h("span", { class: "fsp-crown", "aria-hidden": "true" }, "\u265B"),
          h("div", {}, h("b", {}, what), dur ? h("small", {}, `Dauer: ${dur}`) : null),
          h("span", { class: "fsp-from" }, "Von: FancyServers \u2665")
        ),
        h("p", { class: "fsp-enjoy" }, "\u2726 Viel Spa\xDF mit den neuen Funktionen!"),
        h("button", { class: "fsp-btn", onclick: close }, "Super!", h("span", { "aria-hidden": "true" }, " \u203A"))
      )
    );
  }
  function noticeCard(p, close) {
    const img = abs(theme() === "light" ? p.imageLight || p.image : p.imageDark || p.image);
    const cta = p.cta ? h("button", { class: "fsp-btn", onclick: () => open(p.cta.url) }, p.cta.label) : null;
    if (p.blocking) return full("blocking", img, p.title || "Hinweis", [h("p", { class: "fsp-sub" }, p.message)], cta ? [cta] : []);
    return h(
      "div",
      { class: "fsp-backdrop" },
      h(
        "div",
        { class: "fsp-card", role: "dialog", "aria-modal": "true" },
        h("button", { class: "fsp-x", title: "Schlie\xDFen", "aria-label": "Schlie\xDFen", onclick: close }, "\xD7"),
        art(img),
        h("h2", {}, p.title || "Hinweis"),
        p.message ? h("p", { class: "fsp-sub fsp-pre" }, p.message) : null,
        h("div", { class: "fsp-actions" }, cta, h("button", { class: cta ? "fsp-btn ghost" : "fsp-btn", onclick: close }, "Okay"))
      )
    );
  }
  function render() {
    if (stopped) return;
    root.setAttribute("data-theme", theme());
    let node = null;
    let key = "";
    const m = status?.maintenance;
    const u = status?.update;
    if (m?.active) {
      key = `m:${m.title}:${m.message}:${m.until}`;
      node = full("maint", abs(m.image), m.title, [h("p", { class: "fsp-sub fsp-pre" }, m.message), m.until ? h("p", { class: "fsp-until" }, `Voraussichtlich bis ${fmtDate(m.until)}`) : h("p", { class: "fsp-until" }, "Die App pr\xFCft regelm\xE4\xDFig, ob es weitergeht.")], [h("button", { class: "fsp-btn ghost", onclick: () => void check() }, "Erneut pr\xFCfen")]);
    } else if (u?.required) {
      key = `u:${u.minVersion}`;
      const btn = h("button", { class: "fsp-btn", onclick: async () => {
        btn.setAttribute("disabled", "");
        btn.textContent = "Update l\xE4uft \u2026";
        try {
          if (o.onUpdate) await o.onUpdate(u);
          else if (u.url) open(u.url);
        } finally {
          setTimeout(() => {
            btn.removeAttribute("disabled");
            btn.textContent = "Jetzt aktualisieren";
          }, 4e3);
        }
      } }, "Jetzt aktualisieren");
      node = full(
        "update",
        abs(`/popups/${o.app}-gift-${theme()}.webp`),
        "Update erforderlich",
        [h("p", { class: "fsp-sub" }, `Diese Version (${o.version}) wird nicht mehr unterst\xFCtzt. Bitte aktualisiere auf ${u.latest || u.minVersion} oder neuer, um ${APP_NAME[o.app]} weiter zu nutzen.`), u.notes ? h("p", { class: "fsp-notes fsp-pre" }, u.notes) : null].filter(Boolean),
        [btn, ...u.url && o.onUpdate ? [h("button", { class: "fsp-btn ghost", onclick: () => open(u.url) }, "Download-Seite")] : []]
      );
    } else {
      const blocking = queue.find((p2) => p2.blocking);
      const p = blocking || queue[0];
      if (p) {
        key = `p:${p.id}:${theme()}`;
        const close = () => {
          if (p.blocking) return;
          handled.add(p.id);
          queue.splice(queue.indexOf(p), 1);
          void o.markSeen?.([p.id]);
          render();
        };
        node = p.kind === "gift" && !p.blocking ? giftCard(p, close) : noticeCard(p, close);
      }
    }
    if (key === shown) return;
    shown = key;
    root.replaceChildren(...node ? [node] : []);
  }
  async function check() {
    try {
      const r = await f(`${o.apiBase.replace(/\/+$/, "")}/v1/app/status?app=${encodeURIComponent(o.app)}&version=${encodeURIComponent(o.version)}`, { cache: "no-store" });
      if (r.ok) status = await r.json();
    } catch {
    }
    try {
      const items = await o.fetchPopups?.() || [];
      const live = new Set(items.map((p) => p.id));
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i].blocking && !live.has(queue[i].id)) queue.splice(i, 1);
      for (const p of items) if (!handled.has(p.id) && !queue.some((q) => q.id === p.id)) queue.push(p);
    } catch {
    }
    render();
  }
  const onFocus = () => void check();
  window.addEventListener("focus", onFocus);
  const timer = setInterval(() => document.visibilityState === "visible" && void check(), o.pollMs || 5 * 6e4);
  const fast = setInterval(() => (status?.maintenance?.active || status?.update?.required) && void check(), 3e4);
  void check();
  return {
    check,
    /** Nach Theme-Wechsel neu zeichnen. */
    refresh: () => {
      shown = "";
      render();
    },
    get blocked() {
      return Boolean(status?.maintenance?.active || status?.update?.required || queue.some((p) => p.blocking));
    },
    stop() {
      stopped = true;
      clearInterval(timer);
      clearInterval(fast);
      window.removeEventListener("focus", onFocus);
      root.remove();
    }
  };
}

// src/plan-catalog.generated.ts
var FALLBACK_CATALOG = {
  "version": 1,
  "order": [
    "free",
    "mini",
    "pro",
    "max"
  ],
  "yearlyDiscount": 0.2,
  "currency": "EUR",
  "upgradeUrl": "https://fancyservers.crazymine.de/#plaene",
  "plans": [
    {
      "id": "free",
      "name": "Free",
      "tagline": "Zum Reinschnuppern",
      "icon": "star",
      "badge": "",
      "price": {
        "month": 0,
        "yearMonthly": 0,
        "year": 0
      },
      "tokens": {
        "fiveHour": 0,
        "weekly": 0
      },
      "monthlyResets": 0,
      "perks": [
        "Konto f\xFCr alle FancyServers-Apps",
        "Kein KI-Kontingent \u2013 KI gibt es ab Spark",
        "Community-Support im Discord"
      ],
      "apps": {
        "fancycode": [
          "2 Terminals",
          "1 V-Server",
          "FancyCode-Agent",
          "MCP ohne Server-Limit"
        ],
        "fancygames": [
          "FancyCode-Agent & Engine-Tools",
          "MCP ohne Server-Limit"
        ],
        "fancyagent": [
          "2 Projekte",
          "1 Agent",
          "1 Mitglied/Projekt",
          "100 Aufrufe/Tag & Projekt",
          "100 MB Speicher"
        ],
        "kuroi": [
          "Schneiden, Effekte, Export",
          "MCP: Projekte, Ops, Beats, Export",
          "Videos bis 50 MB im Team"
        ]
      }
    },
    {
      "id": "mini",
      "name": "Spark",
      "tagline": "Mehr Power f\xFCr Kreative",
      "icon": "bolt",
      "badge": "Spark",
      "price": {
        "month": 2.99,
        "yearMonthly": 2.39,
        "year": 28.7
      },
      "tokens": {
        "fiveHour": 6e5,
        "weekly": 3e6
      },
      "monthlyResets": 0,
      "perks": [
        "600.000 Tokens / 5 h \xB7 3 Mio. / Woche",
        "Auto: w\xE4hlt immer ein freies Modell \u2013 kein Abbruch bei Engp\xE4ssen",
        "Claude direkt in allen Apps",
        "Spark-Badge im Profil"
      ],
      "apps": {
        "fancycode": [
          "4 Terminals",
          "2 V-Server",
          "Animierte & eigene Themes",
          "Eigene Harnesses",
          "Plugins & Skills",
          "Spracheingabe & Spotify-Widget"
        ],
        "fancygames": [
          "Claude direkt im Agent",
          "Live teilen im Team",
          "Eigene Harnesses",
          "Eigene Themes"
        ],
        "fancyagent": [
          "5 Projekte",
          "5 Agents",
          "5 Mitglieder/Projekt",
          "2.000 Aufrufe/Tag & Projekt",
          "1 GB Speicher"
        ],
        "kuroi": [
          "MCP: Auto-Untertitel, Beat-Schnitt, URL-Download",
          "MCP: Presets & Schriften speichern",
          "KI-Agent beim Schneiden (FancyCode & Claude)",
          "KI-Texte f\xFCr TikTok & YouTube Shorts",
          "Videos bis 150 MB im Team"
        ]
      }
    },
    {
      "id": "pro",
      "name": "Nova",
      "tagline": "F\xFCr alle, die ernsthaft bauen",
      "icon": "crown",
      "popular": true,
      "badge": "Nova",
      "price": {
        "month": 7.99,
        "yearMonthly": 6.39,
        "year": 76.7
      },
      "tokens": {
        "fiveHour": 15e5,
        "weekly": 75e5
      },
      "monthlyResets": 0,
      "perks": [
        "1,5 Mio. Tokens / 5 h \xB7 7,5 Mio. / Woche",
        "Auto: w\xE4hlt immer ein freies Modell \u2013 kein Abbruch bei Engp\xE4ssen",
        "Alles aus Spark",
        "Animierte Themes & Hintergr\xFCnde",
        "Fr\xFCher Zugang zu Beta-Funktionen",
        "Nova-Badge im Profil"
      ],
      "apps": {
        "fancycode": [
          "8 Terminals",
          "5 V-Server"
        ],
        "fancygames": [
          "Mehr Agent-Budget f\xFCr gro\xDFe Projekte"
        ],
        "fancyagent": [
          "10 Projekte",
          "25 Agents",
          "25 Mitglieder/Projekt",
          "10.000 Aufrufe/Tag & Projekt",
          "5 GB Speicher"
        ],
        "kuroi": [
          "MCP: Referenz 1:1 nachbauen (Vergleich, Schrift-Erkennung)",
          "MCP: Fensteraufnahme",
          "Video-Stats: 20 Videos tracken, Update alle 6 h",
          "Claude kennt deine Stats (MCP, 30 Abfragen/h)",
          "Videos bis 300 MB im Team",
          "10 GB Team-Speicher"
        ]
      }
    },
    {
      "id": "max",
      "name": "Galaxy",
      "tagline": "Das volle Erlebnis",
      "icon": "gem",
      "badge": "Galaxy",
      "price": {
        "month": 19.99,
        "yearMonthly": 15.99,
        "year": 191.9
      },
      "tokens": {
        "fiveHour": 6e6,
        "weekly": 3e7
      },
      "monthlyResets": 0,
      "perks": [
        "6 Mio. Tokens / 5 h \xB7 30 Mio. / Woche",
        "Alles aus Nova",
        "Freie Modellwahl: Auto oder jedes Modell fest",
        "Bevorzugter Support",
        "Galaxy-Badge im Profil"
      ],
      "apps": {
        "fancycode": [
          "12 Terminals",
          "20 V-Server"
        ],
        "fancygames": [
          "H\xF6chstes Agent-Budget"
        ],
        "fancyagent": [
          "Unbegrenzt Projekte & Agents",
          "200.000 Aufrufe/Tag & Projekt",
          "100 GB Speicher"
        ],
        "kuroi": [
          "MCP: alle Werkzeuge inkl. Referenz & Aufnahme",
          "Video-Stats: unbegrenzt, Update jede Stunde",
          "Claude kennt deine Stats (MCP, 120 Abfragen/h)",
          "Videos bis 1 GB im Team",
          "50 GB Team-Speicher"
        ]
      }
    }
  ],
  "features": {
    "fancycode.claude": {
      "app": "fancycode",
      "label": "Claude direkt im Agent",
      "minPlan": "mini"
    },
    "fancycode.animated": {
      "app": "fancycode",
      "label": "Animierte Hintergr\xFCnde",
      "minPlan": "mini"
    },
    "fancygames.claude": {
      "app": "fancygames",
      "label": "Claude direkt im Agent",
      "minPlan": "mini"
    },
    "fancygames.share": {
      "app": "fancygames",
      "label": "Live teilen im Team",
      "minPlan": "mini"
    },
    "fancycode.harness": {
      "app": "fancycode",
      "label": "Eigene KI-Clients (Harnesses)",
      "minPlan": "mini"
    },
    "fancycode.plugins": {
      "app": "fancycode",
      "label": "Plugins & eigene Skills",
      "minPlan": "mini"
    },
    "fancycode.voice": {
      "app": "fancycode",
      "label": "Spracheingabe (Whisper)",
      "minPlan": "mini"
    },
    "fancycode.spotify": {
      "app": "fancycode",
      "label": "Spotify-Widget",
      "minPlan": "mini"
    },
    "fancycode.themes": {
      "app": "fancycode",
      "label": "Eigene Themes",
      "minPlan": "mini"
    },
    "fancygames.harness": {
      "app": "fancygames",
      "label": "Eigene KI-Clients (Harnesses)",
      "minPlan": "mini"
    },
    "fancygames.themes": {
      "app": "fancygames",
      "label": "Eigene Themes",
      "minPlan": "mini"
    },
    "kuroi.agent": {
      "app": "kuroi",
      "label": "KI-Agent beim Schneiden (FancyCode & Claude)",
      "minPlan": "mini"
    },
    "kuroi.mcp.captions": {
      "app": "kuroi",
      "label": "MCP: Auto-Untertitel (editor_captions)",
      "minPlan": "mini"
    },
    "kuroi.mcp.beatcut": {
      "app": "kuroi",
      "label": "MCP: Beat-Schnitt (editor_beat_cut)",
      "minPlan": "mini"
    },
    "kuroi.mcp.download": {
      "app": "kuroi",
      "label": "MCP: Video/Audio von URLs laden (editor_download)",
      "minPlan": "mini"
    },
    "kuroi.mcp.library": {
      "app": "kuroi",
      "label": "MCP: Presets & Schriften speichern (editor_preset_save, editor_font_add)",
      "minPlan": "mini"
    },
    "kuroi.mcp.reference": {
      "app": "kuroi",
      "label": "MCP: Referenz 1:1 nachbauen (editor_reference*, font_match, compare)",
      "minPlan": "pro"
    },
    "kuroi.mcp.record": {
      "app": "kuroi",
      "label": "MCP: Fensteraufnahme (editor_record_window)",
      "minPlan": "pro"
    },
    "kuroi.publish": {
      "app": "kuroi",
      "label": "KI-Texte f\xFCr TikTok & YouTube Shorts (Titel, Beschreibung, Hashtags)",
      "minPlan": "mini"
    },
    "kuroi.stats": {
      "app": "kuroi",
      "label": "Video-Stats: Aufrufe, Likes, Verlauf & Vergleich",
      "minPlan": "pro"
    },
    "kuroi.mcp.stats": {
      "app": "kuroi",
      "label": "MCP: Video-Stats abfragen (editor_video_stats) + Claude im Statistik-Tab fragen",
      "minPlan": "pro"
    },
    "models.paid": {
      "app": "*",
      "label": "Bessere KI-Modelle",
      "minPlan": "mini"
    },
    "beta": {
      "app": "*",
      "label": "Fr\xFCher Zugang zu Beta-Funktionen",
      "minPlan": "pro"
    }
  }
};

// src/plans.ts
var DEFAULT_API = "https://account.crazymine.de";
var catalog = FALLBACK_CATALOG;
var loading = null;
function loadPlanCatalog(apiBase = DEFAULT_API, f) {
  if (loading) return loading;
  const doFetch = f || ((...a) => fetch(...a));
  loading = doFetch(`${apiBase.replace(/\/+$/, "")}/v1/plans`).then((r) => r.ok ? r.json() : null).then((c) => {
    if (c && Array.isArray(c.plans) && c.plans.length) catalog = c;
    return catalog;
  }).catch(() => catalog);
  return loading;
}
function planCatalogSync() {
  return catalog;
}
function normalizePlan(p) {
  return p === "mini" || p === "pro" || p === "max" ? p : "free";
}
function planRank(p) {
  return ["free", "mini", "pro", "max"].indexOf(normalizePlan(p));
}
function planAtLeast(p, min) {
  return planRank(p) >= planRank(min);
}
function planLabel(p) {
  const id = normalizePlan(p);
  return catalog.plans.find((x) => x.id === id)?.name || "Free";
}
function featureMinPlan(feature) {
  return catalog.features[feature]?.minPlan || "free";
}
function featureAllowed(p, feature) {
  return planAtLeast(p, featureMinPlan(feature));
}
function planBadge(p) {
  const id = normalizePlan(p);
  return h("span", { class: `fsx-badge fsx-badge-${id}`, title: `Plan: ${planLabel(id)}` }, planLabel(id));
}
var ICONS = {
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3 6.9 7.5.7-5.7 5 1.7 7.4L12 18.2 5.5 22l1.7-7.4L1.5 9.6 9 8.9z"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
  crown: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z"/></svg>',
  gem: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 3h12l4 6-10 12L2 9z"/></svg>'
};
var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
var eur = (n) => `${n.toLocaleString("de-DE", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} \u20AC`;
var num = (n) => n >= 1e6 ? `${(n / 1e6).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Mio.` : n.toLocaleString("de-DE");
var clock = (t) => new Date(t).toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
function shell(o) {
  const root = h("div", { class: "fsp-root fsx-root", "data-app": o.app, "data-theme": o.theme?.() || pageTheme() });
  (o.container || document.body).appendChild(root);
  return root;
}
function openUrl(o, url) {
  if (o.openExternal) o.openExternal(url);
  else window.open(url, "_blank", "noopener");
}
function upgradeUrl(o, plan) {
  const base = catalog.upgradeUrl || "https://fancyservers.crazymine.de/#plaene";
  const [u, hash] = base.split("#");
  return `${u}${u.includes("?") ? "&" : "?"}plan=${plan}&app=${o.app}${hash ? `#${hash}` : ""}`;
}
function openPlans(o, tab = "plans") {
  const root = shell(o);
  let yearly = false;
  let usage = null;
  let extra = [];
  let busy = false;
  let current = normalizePlan(o.plan?.());
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey);
    root.remove();
    o.onClose?.();
  };
  const onKey = (e) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);
  const body = h("div", { class: "fsx-body" });
  const tabs = h("div", { class: "fsx-tabs", role: "tablist" });
  const toggle = h("div", { class: "fsx-toggle" });
  const brand = BRANDS[o.app];
  const card = h(
    "div",
    { class: "fsx-card", role: "dialog", "aria-modal": "true", "aria-label": "Pl\xE4ne & Nutzung" },
    h("button", { class: "fsp-x", "aria-label": "Schlie\xDFen", onclick: close }, "\xD7"),
    h("div", { class: "fsx-glow" }),
    h("div", { class: "fsx-brand" }, h("img", { src: logoDataUrl(o.app), alt: "", width: 30, height: 30 }), h("span", null, brand.name)),
    h(
      "div",
      { class: "fsx-top" },
      h(
        "div",
        null,
        h("h2", { class: "fsx-title" }, "Pl\xE4ne & ", h("em", null, "Nutzung")),
        h("p", { class: "fsx-sub" }, "Ein Abo f\xFCr alle FancyServers-Apps \u2013 such dir den passenden Plan aus."),
        h("div", { class: "fsx-line" })
      ),
      toggle
    ),
    tabs,
    body
  );
  const backdrop = h("div", { class: "fsp-backdrop fsx-backdrop", onclick: (e) => e.target === backdrop && close() }, card);
  root.appendChild(backdrop);
  const renderTabs = () => {
    clear(tabs);
    for (const [id, label] of [["plans", "Pl\xE4ne"], ["usage", "Nutzung"]]) {
      tabs.appendChild(h("button", { class: tab === id ? "on" : "", role: "tab", "aria-selected": String(tab === id), onclick: () => {
        tab = id;
        render();
      } }, label));
    }
    clear(toggle);
    if (tab !== "plans") return;
    toggle.appendChild(h("button", { class: yearly ? "" : "on", onclick: () => {
      yearly = false;
      render();
    } }, "Monatlich"));
    toggle.appendChild(h("button", { class: yearly ? "on" : "", onclick: () => {
      yearly = true;
      render();
    } }, "J\xE4hrlich ", h("span", { class: "fsx-save" }, `-${Math.round(catalog.yearlyDiscount * 100)} %`)));
  };
  const planCard = (p) => {
    const rank = planRank(current);
    const mine = p.id === current;
    const lower = planRank(p.id) < rank;
    const appPerks = p.apps[o.app] || [];
    const price = yearly ? p.price.yearMonthly : p.price.month;
    const btn = mine ? h("button", { class: "fsx-btn ghost", disabled: true }, "Aktueller Plan") : lower ? h("button", { class: "fsx-btn ghost", disabled: true }, "Enthalten") : h("button", { class: `fsx-btn ${p.popular ? "" : "outline"}`, onclick: () => openUrl(o, upgradeUrl(o, p.id)) }, p.id === "max" ? h("span", { class: "fsx-ic-s", html: ICONS.crown }) : null, `Upgrade auf ${p.name}`, p.popular ? " \u203A" : "");
    const prev = catalog.plans[catalog.plans.indexOf(p) - 1];
    return h(
      "div",
      { class: `fsx-plan${p.popular ? " pop" : ""}${mine ? " mine" : ""}`, "data-plan": p.id },
      p.popular ? h("div", { class: "fsx-tag" }, "\u2605 Beliebt") : null,
      h("div", { class: "fsx-phead" }, h("div", { class: "fsx-ic", html: ICONS[p.icon] }), h("div", null, h("b", null, p.name), h("small", null, p.tagline))),
      h("div", { class: "fsx-price" }, eur(price), h("span", null, " / Monat")),
      h("div", { class: "fsx-yearly" }, yearly && p.price.year ? `${eur(p.price.year)} j\xE4hrlich` : p.price.month ? "" : "f\xFCr immer"),
      h(
        "ul",
        null,
        prev ? h("li", { class: "strong" }, h("i", { html: CHECK }), `Alles aus ${prev.name}`) : null,
        [...p.perks.filter((x) => !/^Alles aus /.test(x)), ...appPerks].map((x) => h("li", null, h("i", { html: CHECK }), x))
      ),
      btn
    );
  };
  const bar = (label, w, unit) => {
    if (!w) return null;
    const pct = w.limit ? Math.min(100, Math.round(w.used / w.limit * 100)) : 0;
    return h(
      "div",
      { class: "fsx-use" },
      h("div", { class: "fsx-use-row" }, h("b", null, label), h("span", null, `${num(w.used)} / ${num(w.limit)} ${unit}`)),
      h("div", { class: `fsx-meter${pct >= 90 ? " hot" : ""}` }, h("i", { style: { width: `${pct}%` } })),
      h("small", null, w.used && w.resetAt ? `Wieder Platz ab ${clock(w.resetAt)}` : "Noch nichts verbraucht")
    );
  };
  const renderUsage = () => {
    const p = catalog.plans.find((x) => x.id === current) || catalog.plans[0];
    const next = catalog.plans[catalog.plans.indexOf(p) + 1];
    const unit = usage?.unit === "tokens" || !usage?.unit ? "Tokens" : "Nachrichten";
    const gifts = Math.max(0, Number(usage?.resets || 0) - Number(usage?.planResets?.left || 0));
    const totalResets = Number(usage?.resets || 0);
    const box = h(
      "div",
      { class: "fsx-usage" },
      h(
        "div",
        { class: "fsx-cur" },
        h("div", { class: "fsx-ic", html: ICONS[p.icon] }),
        h("div", { class: "grow" }, h("small", null, "Dein Plan"), h("b", null, p.name), h("small", null, "Gilt in allen FancyServers-Apps")),
        next ? h("button", { class: "fsx-btn", onclick: () => {
          tab = "plans";
          render();
        } }, `Auf ${next.name} upgraden`) : h("span", { class: "fsx-badge fsx-badge-max" }, "H\xF6chster Plan")
      ),
      !usage ? h("div", { class: "fsx-empty" }, o.fetchUsage ? "Verbrauch wird geladen \u2026" : "Melde dich an, um deinen Verbrauch zu sehen.") : h(
        "div",
        { class: "fsx-grid2" },
        bar("KI-Limit \xB7 5 Stunden", usage.fiveHour, unit),
        bar("KI-Limit \xB7 7 Tage", usage.weekly, unit)
      ),
      usage ? h(
        "div",
        { class: "fsx-resets" },
        h(
          "div",
          { class: "grow" },
          h("b", null, `${totalResets} Limit-Reset${totalResets === 1 ? "" : "s"} verf\xFCgbar`),
          h(
            "small",
            null,
            usage.planResets?.total ? `${usage.planResets.left} von ${usage.planResets.total} aus deinem Plan (diesen Monat)` : `${p.name} hat keine Monats-Resets`,
            gifts ? ` \xB7 ${gifts} geschenkt` : ""
          )
        ),
        o.resetUsage ? h("button", {
          class: "fsx-btn outline",
          disabled: busy || !totalResets,
          onclick: async () => {
            if (!o.resetUsage || busy) return;
            busy = true;
            render();
            try {
              usage = { ...usage, ...await o.resetUsage() || {} };
            } finally {
              busy = false;
              render();
            }
          }
        }, busy ? "Setze zur\xFCck \u2026" : "Limit jetzt zur\xFCcksetzen") : null
      ) : null,
      extra.length ? h("div", { class: "fsx-extra" }, extra.map((r) => {
        const pct = r.limit ? Math.min(100, Math.round(r.used / r.limit * 100)) : 0;
        return h(
          "div",
          { class: "fsx-use" },
          h("div", { class: "fsx-use-row" }, h("b", null, r.label), h("span", null, `${num(r.used)} / ${r.limit === null ? "\u221E" : num(r.limit)}${r.unit ? ` ${r.unit}` : ""}`)),
          h("div", { class: `fsx-meter${pct >= 90 ? " hot" : ""}` }, h("i", { style: { width: `${r.limit === null ? 4 : pct}%` } }))
        );
      })) : null,
      usage?.supermodeUntil && usage.supermodeUntil > Date.now() ? h("div", { class: "fsx-note" }, `\u26A1 Supermode aktiv bis ${clock(usage.supermodeUntil)} \u2013 keine Limits.`) : null,
      h("div", { class: "fsx-note" }, "Das KI-Limit gilt gemeinsam f\xFCr KI-Chats und den FancyCode-Agent in allen Apps. Die Fenster laufen rollierend.")
    );
    return box;
  };
  const render = () => {
    renderTabs();
    clear(body);
    if (tab === "plans") {
      body.appendChild(h("div", { class: "fsx-plans" }, catalog.plans.map(planCard)));
      body.appendChild(h(
        "div",
        { class: "fsx-trust" },
        h("div", null, h("i", { html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5L16 9.5"/></svg>' }), h("div", null, h("b", null, "Sicher & zuverl\xE4ssig"), h("small", null, "Deine Daten bleiben gesch\xFCtzt."))),
        h("div", null, h("i", { html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 8c-2.8 0-4.5 1.8-4.5 4s1.7 4 4.5 4c4 0 6-8 10-8 2.8 0 4.5 1.8 4.5 4s-1.7 4-4.5 4c-4 0-6-8-10-8z"/></svg>' }), h("div", null, h("b", null, "Jederzeit k\xFCndbar"), h("small", null, "Keine lange Bindung."))),
        h("div", null, h("i", { html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/></svg>' }), h("div", null, h("b", null, "Support im Discord"), h("small", null, "Wir sind f\xFCr dich da.")))
      ));
      body.appendChild(h("p", { class: "fsx-fine" }, "Online-Bezahlung kommt bald. Bis dahin schaltet der Betreiber Upgrades \xFCber das FancyServers-Portal frei."));
    } else {
      body.appendChild(renderUsage());
    }
  };
  render();
  void loadPlanCatalog(o.apiBase || DEFAULT_API, o.fetch).then(render);
  if (o.fetchUsage) {
    void o.fetchUsage().then((u) => {
      usage = u;
      if (u?.plan) current = normalizePlan(u.plan);
      render();
    }).catch(() => render());
  }
  if (o.extraUsage) void Promise.resolve(o.extraUsage()).then((r) => {
    extra = r || [];
    render();
  }).catch(() => {
  });
  return { close };
}
function requireFeature(o, feature, plan) {
  const p = plan === void 0 ? o.plan?.() : plan;
  if (featureAllowed(p, feature)) return true;
  showLocked(o, feature);
  return false;
}
function showLocked(o, feature) {
  const f = catalog.features[feature];
  const min = catalog.plans.find((x) => x.id === (f?.minPlan || "mini")) || catalog.plans[1];
  const root = shell(o);
  const close = () => root.remove();
  const card = h(
    "div",
    { class: "fsp-card fsx-lock", role: "dialog", "aria-modal": "true" },
    h("button", { class: "fsp-x", "aria-label": "Schlie\xDFen", onclick: close }, "\xD7"),
    h("div", { class: "fsx-ic big", html: ICONS[min.icon] }),
    h("h2", null, "Ab ", h("em", null, min.name)),
    h("p", { class: "fsp-sub" }, `${f?.label || "Diese Funktion"} gibt es ab dem Plan ${min.name} (${eur(min.price.month)} / Monat).`),
    h("ul", { class: "fsx-lock-list" }, [...min.perks.slice(0, 4), ...(min.apps[o.app] || []).slice(0, 2)].map((x) => h("li", null, h("i", { html: CHECK }), x))),
    h(
      "div",
      { class: "fsp-actions" },
      h("button", { class: "fsp-btn", onclick: () => {
        close();
        openPlans(o, "plans");
      } }, "Pl\xE4ne ansehen"),
      h("button", { class: "fsp-btn ghost", onclick: close }, "Sp\xE4ter")
    )
  );
  const backdrop = h("div", { class: "fsp-backdrop", onclick: (e) => e.target === backdrop && close() }, card);
  root.appendChild(backdrop);
  void loadPlanCatalog(o.apiBase || DEFAULT_API, o.fetch);
  return { close };
}

// src/index.ts
function startCollab(o) {
  let chat = o.container ? new CollabChat(o.container, { client: o.client, app: o.app, ...o.chat || {} }) : null;
  const popups = new PopupHost({
    client: o.client,
    app: o.app,
    container: o.popupContainer,
    onAgentTask: o.onAgentTask,
    onOpen: (t) => {
      o.onShowChat?.();
      if (t.kind === "media") {
        if (!t.media_id) return;
        if (o.chat?.onOpenMedia && t.project_id) o.chat.onOpenMedia({ project: t.project_id, media: { id: t.media_id }, at_ms: t.at_ms });
        else chat?.openMedia(t.media_id, t.at_ms);
        return;
      }
      chat?.open(t);
    },
    isVisible: () => Boolean(chat && chat.el.offsetParent !== null && document.hasFocus())
  });
  const ready = o.client.loadState().then(() => o.client.connect()).catch((e) => {
    o.client.emit("error", e);
    o.client.connect();
  });
  return {
    client: o.client,
    popups,
    ready,
    get chat() {
      return chat;
    },
    /** Chat später einhängen (z. B. wenn der Tab geöffnet wird). */
    mountChat(container) {
      chat?.destroy();
      chat = new CollabChat(container, { client: o.client, app: o.app, ...o.chat || {} });
      if (o.client.state) o.client.emit("state", o.client.state);
      return chat;
    },
    stop() {
      chat?.destroy();
      popups.destroy();
      o.client.disconnect();
    }
  };
}
export {
  BRANDS,
  CollabChat,
  CollabClient,
  DEFAULT_HUB,
  HubError,
  PopupHost,
  avatar,
  brandOf,
  featureAllowed,
  featureMinPlan,
  formatBytes,
  h,
  loadPlanCatalog,
  logoDataUrl,
  logoSvg,
  normalizePlan as normalizePlanId,
  openPlans,
  pageTheme,
  planAtLeast,
  planBadge,
  planCatalogSync,
  planLabel,
  planRank,
  registerDevice,
  requireFeature,
  richText,
  roleLabel,
  showLocked,
  startAppPopups,
  startCollab,
  timeLabel
};
