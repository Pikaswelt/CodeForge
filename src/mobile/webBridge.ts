import { WebPlugin } from '@capacitor/core';

// Development stand-in for the native plugin: forwards every call over a WebSocket to
// scripts/mobile-dev-bridge.mjs, which does the SSH work with ssh2. Lets the mobile UI run
// in a desktop browser (npm run mobile:dev). Not used inside the APK.

type Pending = { resolve: (value: any) => void; reject: (error: Error) => void };

export class WebBridge extends WebPlugin {
  private socket: WebSocket | null = null;
  private opening: Promise<WebSocket> | null = null;
  private pending = new Map<string, Pending>();
  private counter = 0;

  private open(): Promise<WebSocket> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return Promise.resolve(this.socket);
    if (this.opening) return this.opening;
    const port = new URLSearchParams(location.search).get('bridge') || '8790';
    this.opening = new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://${location.hostname || '127.0.0.1'}:${port}`);
      socket.onopen = () => {
        this.socket = socket;
        this.opening = null;
        resolve(socket);
      };
      socket.onerror = () => {
        this.opening = null;
        reject(new Error('Dev-Bridge nicht erreichbar. Starte "npm run mobile:bridge".'));
      };
      socket.onclose = () => {
        this.socket = null;
        for (const item of this.pending.values()) item.reject(new Error('Dev-Bridge getrennt.'));
        this.pending.clear();
      };
      socket.onmessage = (message) => {
        const payload = JSON.parse(String(message.data));
        if (payload.event) {
          this.notifyListeners(payload.event, payload.data);
          return;
        }
        const item = this.pending.get(payload.id);
        if (!item) return;
        this.pending.delete(payload.id);
        if (payload.error) item.reject(Object.assign(new Error(payload.error.message), { code: payload.error.code }));
        else item.resolve(payload.result);
      };
    });
    return this.opening;
  }

  private async call(method: string, args: unknown = {}) {
    const socket = await this.open();
    const id = String(++this.counter);
    return new Promise<any>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, args }));
    });
  }

  private pickFiles(accept: string, multiple: boolean): Promise<File[]> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.multiple = multiple;
      input.onchange = () => resolve(Array.from(input.files || []));
      input.oncancel = () => resolve([]);
      input.click();
    });
  }

  private static toBase64(buffer: ArrayBuffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }

  saveKey(args: any) { return this.call('saveKey', args); }
  generateKey(args: any) { return this.call('generateKey', args); }
  getPublicKey(args: any) { return this.call('getPublicKey', args); }
  deleteKey(args: any) { return this.call('deleteKey', args); }
  forgetHost(args: any) { return this.call('forgetHost', args); }
  connect(args: any) { return this.call('connect', args); }
  disconnect(args: any) { return this.call('disconnect', args); }
  isConnected(args: any) { return this.call('isConnected', args); }
  exec(args: any) { return this.call('exec', args); }
  openShell(args: any) { return this.call('openShell', args); }
  write(args: any) { return this.call('write', args); }
  resize(args: any) { return this.call('resize', args); }
  closeShell(args: any) { return this.call('closeShell', args); }
  sftpList(args: any) { return this.call('sftpList', args); }
  sftpMkdir(args: any) { return this.call('sftpMkdir', args); }
  sftpRename(args: any) { return this.call('sftpRename', args); }
  sftpDelete(args: any) { return this.call('sftpDelete', args); }
  sftpReadText(args: any) { return this.call('sftpReadText', args); }
  sftpWriteText(args: any) { return this.call('sftpWriteText', args); }

  async sftpUpload(args: any) {
    const files = await this.pickFiles('*/*', true);
    if (!files.length) return { canceled: true, uploaded: [] };
    const uploaded: string[] = [];
    for (const file of files) {
      const data = WebBridge.toBase64(await file.arrayBuffer());
      await this.call('sftpUploadData', { ...args, name: file.name, data });
      uploaded.push(file.name);
    }
    return { canceled: false, uploaded };
  }

  async sftpDownload(args: any) {
    const { data, name } = await this.call('sftpDownloadData', args);
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes]));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return { canceled: false, uri: name };
  }

  async sftpOpen(args: any) {
    await this.sftpDownload(args);
  }

  async importMedia(args: { kind: 'image' | 'video' | 'any' }) {
    const accept = args.kind === 'image' ? 'image/*' : args.kind === 'video' ? 'video/*' : 'image/*,video/*';
    const [file] = await this.pickFiles(accept, false);
    if (!file) return { canceled: true };
    return { canceled: false, path: URL.createObjectURL(file), name: file.name, mime: file.type, size: file.size };
  }

  async deleteMedia() {
    return { deleted: true };
  }

  async openUrl(args: { url: string }) {
    window.open(args.url, '_blank', 'noopener');
  }

  async copyText(args: { text: string }) {
    await navigator.clipboard?.writeText(args.text);
  }

  async readClipboard() {
    return { text: (await navigator.clipboard?.readText?.().catch(() => '')) || '' };
  }

  async requestNotifications() {
    if (typeof Notification === 'undefined') return { granted: false };
    return { granted: (await Notification.requestPermission()) === 'granted' };
  }

  async notify(args: { title: string; body: string }) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return { shown: false };
    new Notification(args.title, { body: args.body });
    return { shown: true };
  }
}
