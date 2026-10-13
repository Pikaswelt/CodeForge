package app.codeforge.desktop;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;

import androidx.activity.result.ActivityResult;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import app.codeforge.desktop.ssh.SshManager;

/**
 * Native side of the Android app: SSH to the V-Servers (terminals, commands, SFTP) plus the
 * phone features the web view cannot do on its own (file pickers, media for themes,
 * notifications, clipboard, opening links).
 *
 * Events: "shellData" {channelId, data}, "shellExit" {channelId, code, lost},
 * "transfer" {transferId, name, done, total}.
 */
@CapacitorPlugin(name = "CodeForgeNative")
public class CodeForgePlugin extends Plugin {

    private static final String KEY_ID_PATTERN = "[a-z0-9-]{1,64}";
    private static final String CHANNEL_ID = "codeforge-terminal";

    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final AtomicInteger notificationIds = new AtomicInteger(100);
    private SshManager ssh;

    @Override
    public void load() {
        SharedPreferences prefs = getContext().getSharedPreferences("codeforge-known-hosts", Context.MODE_PRIVATE);
        ssh = new SshManager(new SshManager.HostKeyStore() {
            @Override
            public String get(String hostId) {
                return prefs.getString(hostId, null);
            }

            @Override
            public void put(String hostId, String fingerprint) {
                prefs.edit().putString(hostId, fingerprint).apply();
            }
        }, new SshManager.Listener() {
            @Override
            public void onShellData(String channelId, String data) {
                JSObject event = new JSObject();
                event.put("channelId", channelId);
                event.put("data", data);
                notifyListeners("shellData", event);
            }

            @Override
            public void onShellExit(String channelId, int exitCode, boolean connectionLost) {
                JSObject event = new JSObject();
                event.put("channelId", channelId);
                event.put("code", exitCode);
                event.put("lost", connectionLost);
                notifyListeners("shellExit", event);
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (ssh != null) ssh.disconnectAll();
        executor.shutdownNow();
        super.handleOnDestroy();
    }

    // ── Helpers ────────────────────────────────────────────────

    private interface Task {
        void run() throws Exception;
    }

    /** Runs blocking work off the plugin thread so terminal input never waits behind a connect. */
    private void background(PluginCall call, Task task) {
        executor.execute(() -> {
            try {
                task.run();
            } catch (SshManager.SshError error) {
                call.reject(error.getMessage(), error.code);
            } catch (Exception error) {
                call.reject(String.valueOf(error.getMessage()), "ERROR");
            }
        });
    }

    private File keyDir() {
        File dir = new File(getContext().getFilesDir(), "ssh-keys");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    private File keyFile(String keyId) throws SshManager.SshError {
        if (keyId == null || !keyId.matches(KEY_ID_PATTERN)) throw new SshManager.SshError("INVALID", "Ungueltige Key-ID.");
        return new File(keyDir(), keyId);
    }

    private static String readFile(File file) throws java.io.IOException {
        try (InputStream in = new FileInputStream(file)) {
            return new String(readAll(in), StandardCharsets.UTF_8);
        }
    }

    private static byte[] readAll(InputStream in) throws java.io.IOException {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        byte[] buffer = new byte[16384];
        int count;
        while ((count = in.read(buffer)) >= 0) out.write(buffer, 0, count);
        return out.toByteArray();
    }

    private static void writeFile(File file, String content) throws java.io.IOException {
        try (OutputStream out = new FileOutputStream(file)) {
            out.write(content.getBytes(StandardCharsets.UTF_8));
        }
    }

    private SshManager.ServerConfig server(PluginCall call) throws Exception {
        JSObject input = call.getObject("server");
        if (input == null) throw new SshManager.SshError("INVALID", "V-Server fehlt.");
        SshManager.ServerConfig config = new SshManager.ServerConfig();
        config.id = input.getString("id");
        config.host = input.getString("host", "").trim();
        config.port = input.getInteger("port", 22);
        config.user = input.getString("user", "").trim();
        config.secret = input.getString("secret");
        String keyId = input.getString("keyId");
        if (keyId != null && !keyId.isEmpty()) {
            File file = keyFile(keyId);
            if (!file.exists()) throw new SshManager.SshError("NO_KEY", "V-Server: Key fehlt auf diesem Geraet. Bitte Key neu hinterlegen.");
            config.privateKey = readFile(file);
        }
        return config;
    }

    private void emitTransfer(String transferId, String name, long done, long total) {
        if (transferId == null) return;
        JSObject event = new JSObject();
        event.put("transferId", transferId);
        event.put("name", name);
        event.put("done", done);
        event.put("total", total);
        notifyListeners("transfer", event);
    }

    private String displayName(Uri uri) {
        try (Cursor cursor = getContext().getContentResolver().query(uri, new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                String name = cursor.getString(0);
                if (name != null && !name.isEmpty()) return name;
            }
        } catch (Exception ignored) {
        }
        String last = uri.getLastPathSegment();
        return last == null ? "datei" : last.replaceAll(".*/", "");
    }

    private long contentSize(Uri uri) {
        try (Cursor cursor = getContext().getContentResolver().query(uri, new String[] {OpenableColumns.SIZE}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) return cursor.getLong(0);
        } catch (Exception ignored) {
        }
        return -1;
    }

    private static String safeName(String name) {
        String cleaned = name == null ? "" : name.replaceAll("[/\\\\\\x00]", "_").trim();
        return cleaned.isEmpty() || ".".equals(cleaned) || "..".equals(cleaned) ? "datei" : cleaned;
    }

    private static String mimeFor(String name) {
        int dot = name.lastIndexOf('.');
        String ext = dot >= 0 ? name.substring(dot + 1).toLowerCase(Locale.US) : "";
        String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        if (mime != null) return mime;
        if (ext.matches("txt|md|log|json|js|ts|tsx|jsx|py|sh|yml|yaml|toml|ini|conf|cfg|env|css|html|xml|csv|java|kt|go|rs|c|h|cpp")) return "text/plain";
        return "application/octet-stream";
    }

    // ── Keys ───────────────────────────────────────────────────

    @PluginMethod
    public void saveKey(PluginCall call) {
        background(call, () -> {
            String privateKey = call.getString("privateKey", "");
            boolean encrypted = SshManager.checkPrivateKey(privateKey);
            File file = keyFile(call.getString("keyId"));
            writeFile(file, privateKey.replace("\r\n", "\n").replaceAll("\n*$", "\n"));
            JSObject result = new JSObject();
            result.put("encrypted", encrypted);
            result.put("publicKey", encrypted ? null : SshManager.publicKeyOf(privateKey, null, "codeforge-android"));
            call.resolve(result);
        });
    }

    @PluginMethod
    public void generateKey(PluginCall call) {
        background(call, () -> {
            String[] pair = SshManager.generateKey(call.getString("comment", "codeforge-android"));
            writeFile(keyFile(call.getString("keyId")), pair[0]);
            JSObject result = new JSObject();
            result.put("publicKey", pair[1]);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void getPublicKey(PluginCall call) {
        background(call, () -> {
            File file = keyFile(call.getString("keyId"));
            if (!file.exists()) throw new SshManager.SshError("NO_KEY", "Key nicht gefunden.");
            String publicKey = SshManager.publicKeyOf(readFile(file), call.getString("passphrase"), "codeforge-android");
            if (publicKey == null) throw new SshManager.SshError("NEED_SECRET", "Der Key ist mit einer Passphrase geschuetzt.");
            JSObject result = new JSObject();
            result.put("publicKey", publicKey);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void deleteKey(PluginCall call) {
        background(call, () -> {
            File file = keyFile(call.getString("keyId"));
            JSObject result = new JSObject();
            result.put("deleted", file.delete());
            call.resolve(result);
        });
    }

    @PluginMethod
    public void forgetHost(PluginCall call) {
        String host = call.getString("host", "");
        int port = call.getInt("port", 22);
        getContext().getSharedPreferences("codeforge-known-hosts", Context.MODE_PRIVATE).edit().remove(host + ":" + port).apply();
        call.resolve();
    }

    // ── SSH ────────────────────────────────────────────────────

    @PluginMethod
    public void connect(PluginCall call) {
        background(call, () -> {
            SshManager.ServerConfig config = server(call);
            String home = ssh.home(config);
            JSObject result = new JSObject();
            result.put("home", home);
            result.put("fingerprint", "SHA256:" + ssh.knownFingerprint(config));
            call.resolve(result);
        });
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        String id = call.getString("id", "");
        executor.execute(() -> ssh.disconnect(id));
        call.resolve();
    }

    @PluginMethod
    public void isConnected(PluginCall call) {
        JSObject result = new JSObject();
        result.put("connected", ssh.isConnected(call.getString("id", "")));
        call.resolve(result);
    }

    @PluginMethod
    public void exec(PluginCall call) {
        background(call, () -> {
            SshManager.ExecResult run = ssh.exec(
                    server(call),
                    call.getString("command", ""),
                    call.getString("stdin"),
                    call.getInt("timeoutMs", 30000),
                    call.getInt("outputLimit", 2_000_000));
            JSObject result = new JSObject();
            result.put("exitCode", run.exitCode);
            result.put("stdout", run.stdout);
            result.put("stderr", run.stderr);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void openShell(PluginCall call) {
        background(call, () -> {
            ssh.openShell(server(call), call.getString("channelId", ""), call.getString("command", "exec bash -l"),
                    call.getInt("cols", 80), call.getInt("rows", 24));
            call.resolve();
        });
    }

    @PluginMethod
    public void write(PluginCall call) {
        JSObject result = new JSObject();
        result.put("ok", ssh.write(call.getString("channelId", ""), call.getString("data", "")));
        call.resolve(result);
    }

    @PluginMethod
    public void resize(PluginCall call) {
        JSObject result = new JSObject();
        result.put("ok", ssh.resize(call.getString("channelId", ""), call.getInt("cols", 80), call.getInt("rows", 24)));
        call.resolve(result);
    }

    @PluginMethod
    public void closeShell(PluginCall call) {
        String channelId = call.getString("channelId", "");
        executor.execute(() -> ssh.closeShell(channelId));
        call.resolve();
    }

    // ── SFTP ───────────────────────────────────────────────────

    @PluginMethod
    public void sftpList(PluginCall call) {
        background(call, () -> {
            List<SshManager.Entry> entries = new ArrayList<>();
            String path = ssh.list(server(call), call.getString("path", "."), entries);
            JSArray list = new JSArray();
            for (SshManager.Entry entry : entries) {
                JSObject item = new JSObject();
                item.put("name", entry.name);
                item.put("type", entry.type);
                item.put("size", entry.size);
                item.put("modifiedAt", entry.modifiedAt);
                item.put("mode", entry.mode);
                list.put(item);
            }
            JSObject result = new JSObject();
            result.put("path", path);
            result.put("entries", list);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void sftpMkdir(PluginCall call) {
        background(call, () -> {
            ssh.mkdir(server(call), call.getString("path", ""));
            call.resolve();
        });
    }

    @PluginMethod
    public void sftpRename(PluginCall call) {
        background(call, () -> {
            ssh.rename(server(call), call.getString("from", ""), call.getString("to", ""));
            call.resolve();
        });
    }

    @PluginMethod
    public void sftpDelete(PluginCall call) {
        background(call, () -> {
            ssh.delete(server(call), call.getString("path", ""));
            call.resolve();
        });
    }

    @PluginMethod
    public void sftpReadText(PluginCall call) {
        background(call, () -> {
            String text = ssh.readText(server(call), call.getString("path", ""), call.getInt("maxBytes", 2_000_000));
            JSObject result = new JSObject();
            result.put("content", text);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void sftpWriteText(PluginCall call) {
        background(call, () -> {
            ssh.writeText(server(call), call.getString("path", ""), call.getString("content", ""));
            call.resolve();
        });
    }

    /** Lets the user pick files on the phone and uploads them into remoteDir. */
    @PluginMethod
    public void sftpUpload(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        startActivityForResult(call, intent, "uploadPicked");
    }

    @ActivityCallback
    private void uploadPicked(PluginCall call, ActivityResult picked) {
        if (call == null) return;
        if (picked.getResultCode() != Activity.RESULT_OK || picked.getData() == null) {
            JSObject result = new JSObject();
            result.put("canceled", true);
            result.put("uploaded", new JSArray());
            call.resolve(result);
            return;
        }
        Intent data = picked.getData();
        List<Uri> uris = new ArrayList<>();
        if (data.getClipData() != null) {
            for (int i = 0; i < data.getClipData().getItemCount(); i++) uris.add(data.getClipData().getItemAt(i).getUri());
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }
        background(call, () -> {
            SshManager.ServerConfig config = server(call);
            String remoteDir = call.getString("remoteDir", ".");
            String transferId = call.getString("transferId");
            JSArray uploaded = new JSArray();
            for (Uri uri : uris) {
                String name = safeName(displayName(uri));
                long size = contentSize(uri);
                try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
                    if (in == null) continue;
                    ssh.upload(config, in, size, SshManager.joinRemote(remoteDir, name), (done, total) -> emitTransfer(transferId, name, done, total));
                }
                uploaded.put(name);
            }
            JSObject result = new JSObject();
            result.put("canceled", false);
            result.put("uploaded", uploaded);
            call.resolve(result);
        });
    }

    /** Asks where to save on the phone (system dialog) and downloads the remote file there. */
    @PluginMethod
    public void sftpDownload(PluginCall call) {
        String path = call.getString("path", "");
        String name = safeName(path.replaceAll(".*/", ""));
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeFor(name));
        intent.putExtra(Intent.EXTRA_TITLE, name);
        startActivityForResult(call, intent, "downloadTargetPicked");
    }

    @ActivityCallback
    private void downloadTargetPicked(PluginCall call, ActivityResult picked) {
        if (call == null) return;
        if (picked.getResultCode() != Activity.RESULT_OK || picked.getData() == null || picked.getData().getData() == null) {
            JSObject result = new JSObject();
            result.put("canceled", true);
            call.resolve(result);
            return;
        }
        Uri target = picked.getData().getData();
        background(call, () -> {
            String path = call.getString("path", "");
            String name = path.replaceAll(".*/", "");
            String transferId = call.getString("transferId");
            try (OutputStream out = getContext().getContentResolver().openOutputStream(target, "wt")) {
                if (out == null) throw new SshManager.SshError("SFTP", "Zieldatei konnte nicht geoeffnet werden.");
                ssh.download(server(call), path, out, (done, total) -> emitTransfer(transferId, name, done, total));
            }
            JSObject result = new JSObject();
            result.put("canceled", false);
            result.put("uri", target.toString());
            call.resolve(result);
        });
    }

    /** Downloads a remote file into the cache and opens it with a matching app on the phone. */
    @PluginMethod
    public void sftpOpen(PluginCall call) {
        background(call, () -> {
            String path = call.getString("path", "");
            String name = safeName(path.replaceAll(".*/", ""));
            File dir = new File(getContext().getCacheDir(), "open");
            if (!dir.exists()) dir.mkdirs();
            File target = new File(dir, name);
            try (OutputStream out = new FileOutputStream(target)) {
                ssh.download(server(call), path, out, (done, total) -> emitTransfer(call.getString("transferId"), name, done, total));
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", target);
            Intent view = new Intent(Intent.ACTION_VIEW);
            view.setDataAndType(uri, mimeFor(name));
            view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                getContext().startActivity(Intent.createChooser(view, name).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (Exception error) {
                throw new SshManager.SshError("NO_APP", "Keine App zum Oeffnen dieser Datei gefunden.");
            }
            call.resolve();
        });
    }

    // ── Media for themes ───────────────────────────────────────

    /** Picks an image or video from the phone and copies it into app storage (survives restarts). */
    @PluginMethod
    public void importMedia(PluginCall call) {
        String kind = call.getString("kind", "any");
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        if ("image".equals(kind)) {
            intent.setType("image/*");
        } else if ("video".equals(kind)) {
            intent.setType("video/*");
        } else {
            intent.setType("*/*");
            intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {"image/*", "video/*"});
        }
        startActivityForResult(call, intent, "mediaPicked");
    }

    @ActivityCallback
    private void mediaPicked(PluginCall call, ActivityResult picked) {
        if (call == null) return;
        if (picked.getResultCode() != Activity.RESULT_OK || picked.getData() == null || picked.getData().getData() == null) {
            JSObject result = new JSObject();
            result.put("canceled", true);
            call.resolve(result);
            return;
        }
        Uri source = picked.getData().getData();
        background(call, () -> {
            String name = displayName(source);
            String mime = getContext().getContentResolver().getType(source);
            if (mime == null) mime = mimeFor(name);
            String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
            if (ext == null) {
                int dot = name.lastIndexOf('.');
                ext = dot >= 0 ? name.substring(dot + 1).toLowerCase(Locale.US) : "bin";
            }
            if ("quicktime".equals(ext)) ext = "mov";
            File dir = new File(getContext().getFilesDir(), "media");
            if (!dir.exists()) dir.mkdirs();
            File target = new File(dir, UUID.randomUUID().toString() + "." + ext);
            long size = 0;
            try (InputStream in = getContext().getContentResolver().openInputStream(source); OutputStream out = new FileOutputStream(target)) {
                if (in == null) throw new SshManager.SshError("MEDIA", "Datei konnte nicht gelesen werden.");
                byte[] buffer = new byte[65536];
                int count;
                while ((count = in.read(buffer)) >= 0) {
                    out.write(buffer, 0, count);
                    size += count;
                }
            }
            JSObject result = new JSObject();
            result.put("canceled", false);
            result.put("path", target.getAbsolutePath());
            result.put("name", name);
            result.put("mime", mime);
            result.put("size", size);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void deleteMedia(PluginCall call) {
        File dir = new File(getContext().getFilesDir(), "media");
        File target = new File(call.getString("path", ""));
        boolean deleted = false;
        try {
            if (target.getCanonicalPath().startsWith(dir.getCanonicalPath() + File.separator)) deleted = target.delete();
        } catch (Exception ignored) {
        }
        JSObject result = new JSObject();
        result.put("deleted", deleted);
        call.resolve(result);
    }

    // ── Phone helpers ──────────────────────────────────────────

    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.matches("(?i)^https?://.+")) {
            call.reject("Nur http(s)-Links koennen geoeffnet werden.");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Kein Browser gefunden.");
        }
    }

    @PluginMethod
    public void copyText(PluginCall call) {
        ClipboardManager clipboard = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
        clipboard.setPrimaryClip(ClipData.newPlainText("CodeForge", call.getString("text", "")));
        call.resolve();
    }

    @PluginMethod
    public void readClipboard(PluginCall call) {
        getBridge().executeOnMainThread(() -> {
            ClipboardManager clipboard = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
            String text = "";
            if (clipboard.hasPrimaryClip() && clipboard.getPrimaryClip() != null && clipboard.getPrimaryClip().getItemCount() > 0) {
                CharSequence value = clipboard.getPrimaryClip().getItemAt(0).coerceToText(getContext());
                text = value == null ? "" : value.toString();
            }
            JSObject result = new JSObject();
            result.put("text", text);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(getActivity(), new String[] {Manifest.permission.POST_NOTIFICATIONS}, 4711);
        }
        JSObject result = new JSObject();
        result.put("granted", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        call.resolve(result);
    }

    @PluginMethod
    public void notify(PluginCall call) {
        Context context = getContext();
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager.getNotificationChannel(CHANNEL_ID) == null) {
                manager.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "Terminal-Hinweise", NotificationManager.IMPORTANCE_HIGH));
            }
        }
        Intent open = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(call.getString("title", "CodeForge"))
                .setContentText(call.getString("body", ""))
                .setStyle(new NotificationCompat.BigTextStyle().bigText(call.getString("body", "")))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pending);
        boolean shown = false;
        if (Build.VERSION.SDK_INT < 33
                || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            try {
                NotificationManagerCompat.from(context).notify(notificationIds.incrementAndGet(), builder.build());
                shown = true;
            } catch (SecurityException ignored) {
            }
        }
        JSObject result = new JSObject();
        result.put("shown", shown);
        call.resolve(result);
    }
}
