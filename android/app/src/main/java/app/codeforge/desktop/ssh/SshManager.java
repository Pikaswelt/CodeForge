package app.codeforge.desktop.ssh;

import com.jcraft.jsch.ChannelExec;
import com.jcraft.jsch.ChannelSftp;
import com.jcraft.jsch.HostKey;
import com.jcraft.jsch.HostKeyRepository;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.KeyPair;
import com.jcraft.jsch.Session;
import com.jcraft.jsch.SftpATTRS;
import com.jcraft.jsch.SftpException;
import com.jcraft.jsch.SftpProgressMonitor;
import com.jcraft.jsch.UserInfo;
import com.jcraft.jsch.UIKeyboardInteractive;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Vector;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * SSH connections to the saved V-Servers: interactive PTY channels (the terminals), one-off
 * commands and SFTP. Plain Java so it can be tested off the device; the Capacitor plugin
 * (SshPlugin) only translates calls and events.
 *
 * Sessions are cached per server id and reused by every terminal, command and SFTP call.
 */
public class SshManager {

    public interface Listener {
        void onShellData(String channelId, String data);

        void onShellExit(String channelId, int exitCode, boolean connectionLost);
    }

    /** Remembers host key fingerprints (trust on first use, like OpenSSH accept-new). */
    public interface HostKeyStore {
        String get(String hostId);

        void put(String hostId, String fingerprint);
    }

    public interface Progress {
        void onProgress(long done, long total);
    }

    public static class ServerConfig {
        public String id;
        public String host;
        public int port = 22;
        public String user;
        /** Private key in OpenSSH or PEM format, or null for password login. */
        public String privateKey;
        /** Passphrase of the key or the account password. Kept in memory only. */
        public String secret;

        String signature() {
            return host + "|" + port + "|" + user + "|" + (privateKey == null ? "" : Integer.toHexString(privateKey.hashCode()));
        }
    }

    /** Errors the UI reacts to: NEED_SECRET asks for a password, HOSTKEY_CHANGED blocks the server. */
    public static class SshError extends Exception {
        public final String code;

        public SshError(String code, String message) {
            super(message);
            this.code = code;
        }
    }

    public static class ExecResult {
        public int exitCode;
        public String stdout;
        public String stderr;
    }

    public static class Entry {
        public String name;
        public String type;
        public long size;
        public long modifiedAt;
        public int mode;
    }

    private static final int CONNECT_TIMEOUT_MS = 15000;

    static {
        // Android has no JDK EdDSA/XDH provider: use the Bouncy Castle implementations shipped with the app.
        JSch.setConfig("xdh", "com.jcraft.jsch.bc.XDH");
        JSch.setConfig("ssh-ed25519", "com.jcraft.jsch.bc.SignatureEd25519");
        JSch.setConfig("ssh-ed448", "com.jcraft.jsch.bc.SignatureEd448");
        JSch.setConfig("keypairgen.eddsa", "com.jcraft.jsch.bc.KeyPairGenEdDSA");
        JSch.setConfig("PreferredAuthentications", "publickey,keyboard-interactive,password");
    }

    private final HostKeyStore hostKeys;
    private final Listener listener;
    private final Map<String, Session> sessions = new ConcurrentHashMap<>();
    private final Map<String, String> sessionSignatures = new ConcurrentHashMap<>();
    private final Map<String, ChannelSftp> sftpChannels = new ConcurrentHashMap<>();
    private final Map<String, Shell> shells = new ConcurrentHashMap<>();

    public SshManager(HostKeyStore hostKeys, Listener listener) {
        this.hostKeys = hostKeys;
        this.listener = listener;
    }

    // ── Sessions ───────────────────────────────────────────────

    private static String validate(ServerConfig config) throws SshError {
        if (config.host == null || !config.host.matches("[A-Za-z0-9._:\\[\\]-]+") || config.host.startsWith("-")) {
            throw new SshError("INVALID", "V-Server: Adresse ist ungueltig.");
        }
        if (config.user == null || !config.user.matches("[A-Za-z0-9._~@-]+") || config.user.startsWith("-")) {
            throw new SshError("INVALID", "V-Server: Benutzername fehlt oder ist ungueltig.");
        }
        if (config.port < 1 || config.port > 65535) throw new SshError("INVALID", "V-Server: Port ist ungueltig.");
        if (config.id == null || config.id.isEmpty()) config.id = config.user + "@" + config.host + ":" + config.port;
        return config.id;
    }

    /** Returns a connected session for the server, opening one when needed. */
    public Session session(ServerConfig config) throws SshError {
        String id = validate(config);
        synchronized (lockFor(id)) {
            Session existing = sessions.get(id);
            if (existing != null && existing.isConnected() && config.signature().equals(sessionSignatures.get(id))) {
                return existing;
            }
            if (existing != null) disconnect(id);
            Session session = open(config);
            sessions.put(id, session);
            sessionSignatures.put(id, config.signature());
            return session;
        }
    }

    private final Map<String, Object> locks = new ConcurrentHashMap<>();

    private Object lockFor(String id) {
        return locks.computeIfAbsent(id, key -> new Object());
    }

    private Session open(ServerConfig config) throws SshError {
        JSch jsch = new JSch();
        final String hostId = config.host + ":" + config.port;
        final boolean[] changed = {false};
        jsch.setHostKeyRepository(new TofuRepository(hostId, changed));
        boolean hasKey = config.privateKey != null && !config.privateKey.trim().isEmpty();
        try {
            if (hasKey) {
                byte[] key = config.privateKey.replace("\r\n", "\n").getBytes(StandardCharsets.UTF_8);
                byte[] passphrase = config.secret == null || config.secret.isEmpty() ? null : config.secret.getBytes(StandardCharsets.UTF_8);
                KeyPair parsed = KeyPair.load(jsch, key, null);
                boolean encrypted = parsed.isEncrypted();
                parsed.dispose();
                if (encrypted && passphrase == null) {
                    throw new SshError("NEED_SECRET", "Der Key ist mit einer Passphrase geschuetzt. Bitte Passphrase eingeben.");
                }
                jsch.addIdentity(config.id, key, null, passphrase);
            } else if (config.secret == null || config.secret.isEmpty()) {
                throw new SshError("NEED_SECRET", "Kein Key hinterlegt. Bitte Passwort eingeben.");
            }
            Session session = jsch.getSession(config.user, config.host, config.port);
            session.setConfig("StrictHostKeyChecking", "yes");
            session.setServerAliveInterval(20000);
            session.setServerAliveCountMax(3);
            if (!hasKey) {
                session.setUserInfo(new SecretUserInfo(config.secret));
            }
            session.connect(CONNECT_TIMEOUT_MS);
            return session;
        } catch (SshError error) {
            throw error;
        } catch (JSchException error) {
            if (changed[0]) {
                throw new SshError("HOSTKEY_CHANGED",
                        "Der Server-Schluessel hat sich geaendert. Verbindung aus Sicherheitsgruenden abgebrochen (moeglicher Angriff oder Server neu installiert).");
            }
            throw friendly(error, hasKey);
        }
    }

    static SshError friendly(Exception error, boolean hasKey) {
        String message = String.valueOf(error.getMessage());
        Throwable cause = error.getCause();
        String causeText = cause == null ? "" : cause.getClass().getSimpleName() + " " + cause.getMessage();
        if (message.contains("invalid privatekey") || message.contains("invalid private key")) {
            return new SshError("INVALID_KEY", "Der Key konnte nicht gelesen werden. Erwartet wird ein privater OpenSSH-Key (z.B. id_ed25519).");
        }
        if (message.contains("Auth fail") || message.contains("Auth cancel") || message.contains("USERAUTH fail")
                || message.contains("Too many authentication failures")) {
            return new SshError("NEED_SECRET", hasKey
                    ? "Anmeldung fehlgeschlagen. Key oder Passphrase stimmt nicht."
                    : "Anmeldung fehlgeschlagen. Bitte Passwort pruefen.");
        }
        if (causeText.contains("UnknownHost") || message.contains("UnknownHost")) {
            return new SshError("NETWORK", "Server nicht gefunden. Adresse pruefen.");
        }
        if (causeText.contains("ConnectException") || message.contains("Connection refused")) {
            return new SshError("NETWORK", "Verbindung abgelehnt. Laeuft SSH auf diesem Port?");
        }
        if (message.contains("timeout") || message.contains("timed out") || causeText.contains("Timeout")) {
            return new SshError("NETWORK", "Zeitueberschreitung beim Verbinden. Internetverbindung pruefen.");
        }
        if (causeText.contains("NoRouteToHost") || causeText.contains("SocketException") || message.contains("socket is not established")) {
            return new SshError("NETWORK", "Keine Verbindung zum Server. Internetverbindung pruefen.");
        }
        return new SshError("SSH", message);
    }

    public boolean isConnected(String id) {
        Session session = sessions.get(id);
        return session != null && session.isConnected();
    }

    public void disconnect(String id) {
        ChannelSftp sftp = sftpChannels.remove(id);
        if (sftp != null) {
            try {
                sftp.disconnect();
            } catch (Exception ignored) {
            }
        }
        Session session = sessions.remove(id);
        sessionSignatures.remove(id);
        if (session != null) {
            try {
                session.disconnect();
            } catch (Exception ignored) {
            }
        }
    }

    public void disconnectAll() {
        for (String id : new ArrayList<>(sessions.keySet())) disconnect(id);
    }

    public static String fingerprint(byte[] key) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(key);
            return Base64.getEncoder().encodeToString(digest);
        } catch (Exception error) {
            return "";
        }
    }

    public String knownFingerprint(ServerConfig config) {
        return hostKeys.get(config.host + ":" + config.port);
    }

    /** Trust on first use: a new host is stored, a changed key is refused. */
    private class TofuRepository implements HostKeyRepository {
        private final String hostId;
        private final boolean[] changed;

        TofuRepository(String hostId, boolean[] changed) {
            this.hostId = hostId;
            this.changed = changed;
        }

        @Override
        public int check(String host, byte[] key) {
            String fingerprint = fingerprint(key);
            String known = hostKeys.get(hostId);
            if (known == null || known.isEmpty()) {
                hostKeys.put(hostId, fingerprint);
                return OK;
            }
            if (known.equals(fingerprint)) return OK;
            changed[0] = true;
            return CHANGED;
        }

        @Override
        public void add(HostKey hostkey, UserInfo ui) {
        }

        @Override
        public void remove(String host, String type) {
        }

        @Override
        public void remove(String host, String type, byte[] key) {
        }

        @Override
        public String getKnownHostsRepositoryID() {
            return "codeforge";
        }

        @Override
        public HostKey[] getHostKey() {
            return new HostKey[0];
        }

        @Override
        public HostKey[] getHostKey(String host, String type) {
            return new HostKey[0];
        }
    }

    /** Answers password and keyboard-interactive prompts with the stored secret. */
    private static class SecretUserInfo implements UserInfo, UIKeyboardInteractive {
        private final String secret;
        // Each method gets the secret once: a wrong password must fail instead of being retried.
        private boolean passwordAsked;
        private boolean keyboardAsked;

        SecretUserInfo(String secret) {
            this.secret = secret;
        }

        @Override
        public String getPassphrase() {
            return secret;
        }

        @Override
        public String getPassword() {
            return secret;
        }

        @Override
        public boolean promptPassword(String message) {
            if (passwordAsked) return false;
            passwordAsked = true;
            return true;
        }

        @Override
        public boolean promptPassphrase(String message) {
            return true;
        }

        @Override
        public boolean promptYesNo(String message) {
            return false;
        }

        @Override
        public void showMessage(String message) {
        }

        @Override
        public String[] promptKeyboardInteractive(String destination, String name, String instruction, String[] prompt, boolean[] echo) {
            if (keyboardAsked) return null;
            keyboardAsked = true;
            String[] answers = new String[prompt.length];
            for (int i = 0; i < prompt.length; i++) answers[i] = secret;
            return answers;
        }
    }

    // ── Commands ───────────────────────────────────────────────

    public ExecResult exec(ServerConfig config, String command, String stdin, long timeoutMs, int outputLimit) throws SshError {
        Session session = session(config);
        ChannelExec channel = null;
        try {
            channel = (ChannelExec) session.openChannel("exec");
            channel.setCommand(command);
            channel.setInputStream(null);
            InputStream out = channel.getInputStream();
            InputStream err = channel.getErrStream();
            OutputStream in = channel.getOutputStream();
            channel.connect(CONNECT_TIMEOUT_MS);
            if (stdin != null && !stdin.isEmpty()) in.write(stdin.getBytes(StandardCharsets.UTF_8));
            in.flush();
            in.close();
            ByteArrayOutputStream stdout = new ByteArrayOutputStream();
            ByteArrayOutputStream stderr = new ByteArrayOutputStream();
            byte[] buffer = new byte[16384];
            long deadline = System.currentTimeMillis() + timeoutMs;
            while (true) {
                boolean read = drain(out, stdout, buffer, outputLimit) | drain(err, stderr, buffer, outputLimit);
                if (channel.isClosed() && out.available() == 0 && err.available() == 0) break;
                if (System.currentTimeMillis() > deadline) {
                    throw new SshError("TIMEOUT", "Der Befehl hat zu lange gedauert.");
                }
                if (!read) Thread.sleep(15);
            }
            ExecResult result = new ExecResult();
            result.exitCode = channel.getExitStatus();
            result.stdout = new String(stdout.toByteArray(), StandardCharsets.UTF_8);
            result.stderr = new String(stderr.toByteArray(), StandardCharsets.UTF_8);
            return result;
        } catch (SshError error) {
            throw error;
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new SshError("SSH", "Abgebrochen.");
        } catch (Exception error) {
            dropIfDead(config.id);
            throw friendly(error, config.privateKey != null);
        } finally {
            if (channel != null) channel.disconnect();
        }
    }

    private static boolean drain(InputStream stream, ByteArrayOutputStream target, byte[] buffer, int limit) throws IOException {
        boolean any = false;
        while (stream.available() > 0) {
            int count = stream.read(buffer, 0, Math.min(buffer.length, stream.available()));
            if (count < 0) break;
            any = true;
            int room = limit - target.size();
            if (room > 0) target.write(buffer, 0, Math.min(room, count));
        }
        return any;
    }

    private void dropIfDead(String id) {
        Session session = sessions.get(id);
        if (session != null && !session.isConnected()) disconnect(id);
    }

    // ── Interactive terminals ──────────────────────────────────

    private class Shell {
        final String channelId;
        final String serverId;
        final ChannelExec channel;
        final OutputStream stdin;
        final ExecutorService writer = Executors.newSingleThreadExecutor();
        volatile boolean closedByUser;

        Shell(String channelId, String serverId, ChannelExec channel, OutputStream stdin) {
            this.channelId = channelId;
            this.serverId = serverId;
            this.channel = channel;
            this.stdin = stdin;
        }
    }

    /**
     * Starts a command with a PTY (the terminal tab). Output arrives through the listener;
     * the command itself decides about tmux, so closing the channel keeps the tmux session.
     */
    public void openShell(ServerConfig config, String channelId, String command, int cols, int rows) throws SshError {
        closeShell(channelId);
        Session session = session(config);
        try {
            ChannelExec channel = (ChannelExec) session.openChannel("exec");
            channel.setCommand(command);
            channel.setPty(true);
            channel.setPtyType("xterm-256color", Math.max(cols, 20), Math.max(rows, 5), 0, 0);
            InputStream out = channel.getInputStream();
            OutputStream in = channel.getOutputStream();
            channel.connect(CONNECT_TIMEOUT_MS);
            Shell shell = new Shell(channelId, config.id, channel, in);
            shells.put(channelId, shell);
            Thread reader = new Thread(() -> pump(shell, out), "ssh-shell-" + channelId);
            reader.setDaemon(true);
            reader.start();
        } catch (Exception error) {
            dropIfDead(config.id);
            throw friendly(error, config.privateKey != null);
        }
    }

    private void pump(Shell shell, InputStream out) {
        CharsetDecoder decoder = StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPLACE)
                .onUnmappableCharacter(CodingErrorAction.REPLACE);
        ByteBuffer bytes = ByteBuffer.allocate(65536);
        CharBuffer chars = CharBuffer.allocate(65536);
        try {
            while (true) {
                int count = out.read(bytes.array(), bytes.position(), bytes.remaining());
                if (count < 0) break;
                bytes.position(bytes.position() + count);
                bytes.flip();
                // Incomplete UTF-8 sequences at the end stay in the buffer for the next read.
                decoder.decode(bytes, chars, false);
                bytes.compact();
                chars.flip();
                if (chars.hasRemaining()) listener.onShellData(shell.channelId, chars.toString());
                chars.clear();
            }
        } catch (IOException ignored) {
            // Channel closed or connection lost; reported below.
        }
        shells.remove(shell.channelId, shell);
        shell.writer.shutdown();
        int waited = 0;
        while (!shell.channel.isClosed() && waited < 1000) {
            try {
                Thread.sleep(20);
            } catch (InterruptedException error) {
                break;
            }
            waited += 20;
        }
        int code = shell.channel.getExitStatus();
        boolean lost = !shell.closedByUser && !isConnected(shell.serverId);
        shell.channel.disconnect();
        if (lost) dropIfDead(shell.serverId);
        listener.onShellExit(shell.channelId, code, lost);
    }

    public boolean write(String channelId, String data) {
        Shell shell = shells.get(channelId);
        if (shell == null) return false;
        byte[] bytes = data.getBytes(StandardCharsets.UTF_8);
        shell.writer.execute(() -> {
            try {
                shell.stdin.write(bytes);
                shell.stdin.flush();
            } catch (IOException ignored) {
            }
        });
        return true;
    }

    public boolean resize(String channelId, int cols, int rows) {
        Shell shell = shells.get(channelId);
        if (shell == null) return false;
        shell.channel.setPtySize(Math.max(cols, 20), Math.max(rows, 5), 0, 0);
        return true;
    }

    public boolean closeShell(String channelId) {
        Shell shell = shells.remove(channelId);
        if (shell == null) return false;
        shell.closedByUser = true;
        shell.writer.shutdownNow();
        shell.channel.disconnect();
        return true;
    }

    public List<String> shellIds() {
        return new ArrayList<>(shells.keySet());
    }

    // ── SFTP ───────────────────────────────────────────────────

    private ChannelSftp sftp(ServerConfig config) throws SshError {
        Session session = session(config);
        synchronized (lockFor(config.id)) {
            ChannelSftp existing = sftpChannels.get(config.id);
            if (existing != null && existing.isConnected() && !existing.isClosed()) return existing;
            try {
                ChannelSftp channel = (ChannelSftp) session.openChannel("sftp");
                channel.connect(CONNECT_TIMEOUT_MS);
                sftpChannels.put(config.id, channel);
                return channel;
            } catch (JSchException error) {
                dropIfDead(config.id);
                throw friendly(error, config.privateKey != null);
            }
        }
    }

    private static SshError sftpError(Exception error) {
        if (error instanceof SftpException) {
            int id = ((SftpException) error).id;
            if (id == ChannelSftp.SSH_FX_NO_SUCH_FILE) return new SshError("NOT_FOUND", "Datei oder Ordner nicht gefunden.");
            if (id == ChannelSftp.SSH_FX_PERMISSION_DENIED) return new SshError("DENIED", "Keine Berechtigung.");
            if (id == ChannelSftp.SSH_FX_FAILURE) return new SshError("SFTP", "Aktion fehlgeschlagen (existiert der Name schon oder ist der Ordner nicht leer?).");
        }
        return new SshError("SFTP", String.valueOf(error.getMessage()));
    }

    public String home(ServerConfig config) throws SshError {
        ChannelSftp sftp = sftp(config);
        synchronized (lockFor("sftp:" + config.id)) {
            try {
                return sftp.realpath(".");
            } catch (SftpException error) {
                throw sftpError(error);
            }
        }
    }

    public static String joinRemote(String dir, String name) {
        return "/".equals(dir) ? "/" + name : dir.replaceAll("/+$", "") + "/" + name;
    }

    private static String typeOf(SftpATTRS attrs) {
        if (attrs.isDir()) return "dir";
        if (attrs.isLink()) return "link";
        return "file";
    }

    public String list(ServerConfig config, String path, List<Entry> target) throws SshError {
        ChannelSftp sftp = sftp(config);
        synchronized (lockFor("sftp:" + config.id)) {
            try {
                String resolved = sftp.realpath(path == null || path.trim().isEmpty() ? "." : path);
                @SuppressWarnings("unchecked")
                Vector<ChannelSftp.LsEntry> items = sftp.ls(resolved);
                for (ChannelSftp.LsEntry item : items) {
                    String name = item.getFilename();
                    if (".".equals(name) || "..".equals(name)) continue;
                    SftpATTRS attrs = item.getAttrs();
                    Entry entry = new Entry();
                    entry.name = name;
                    entry.type = typeOf(attrs);
                    if ("link".equals(entry.type)) {
                        try {
                            entry.type = sftp.stat(joinRemote(resolved, name)).isDir() ? "dir" : "file";
                        } catch (SftpException ignored) {
                            entry.type = "file";
                        }
                    }
                    entry.size = attrs.getSize();
                    entry.modifiedAt = attrs.getMTime() * 1000L;
                    entry.mode = attrs.getPermissions();
                    target.add(entry);
                }
                Collections.sort(target, (a, b) -> {
                    int dirs = ("dir".equals(a.type) ? 0 : 1) - ("dir".equals(b.type) ? 0 : 1);
                    return dirs != 0 ? dirs : a.name.compareToIgnoreCase(b.name);
                });
                return resolved;
            } catch (SftpException error) {
                throw sftpError(error);
            }
        }
    }

    public long size(ServerConfig config, String path) throws SshError {
        ChannelSftp sftp = sftp(config);
        synchronized (lockFor("sftp:" + config.id)) {
            try {
                return sftp.stat(path).getSize();
            } catch (SftpException error) {
                throw sftpError(error);
            }
        }
    }

    public void mkdir(ServerConfig config, String path) throws SshError {
        ChannelSftp sftp = sftp(config);
        synchronized (lockFor("sftp:" + config.id)) {
            try {
                sftp.mkdir(path);
            } catch (SftpException error) {
                throw sftpError(error);
            }
        }
    }

    public void rename(ServerConfig config, String from, String to) throws SshError {
        ChannelSftp sftp = sftp(config);
        synchronized (lockFor("sftp:" + config.id)) {
            try {
                sftp.rename(from, to);
            } catch (SftpException error) {
                throw sftpError(error);
            }
        }
    }

    public void delete(ServerConfig config, String path) throws SshError {
        String target = path == null ? "" : path.trim();
        // Refuse to wipe the root or a top-level system folder by accident (same rule as the desktop app).
        if (target.isEmpty() || "/".equals(target) || ".".equals(target) || "~".equals(target) || target.matches("^/[^/]+/?$")) {
            throw new SshError("DENIED", "Dieser Pfad kann aus Sicherheitsgruenden nicht geloescht werden.");
        }
        ChannelSftp sftp = sftp(config);
        synchronized (lockFor("sftp:" + config.id)) {
            try {
                removeRecursive(sftp, target, 0);
            } catch (SftpException error) {
                throw sftpError(error);
            }
        }
    }

    private static void removeRecursive(ChannelSftp sftp, String target, int depth) throws SftpException, SshError {
        if (depth > 40) throw new SshError("SFTP", "Verzeichnis zu tief verschachtelt.");
        SftpATTRS attrs = sftp.lstat(target);
        if (attrs.isDir()) {
            @SuppressWarnings("unchecked")
            Vector<ChannelSftp.LsEntry> items = sftp.ls(target);
            for (ChannelSftp.LsEntry item : items) {
                String name = item.getFilename();
                if (".".equals(name) || "..".equals(name)) continue;
                removeRecursive(sftp, joinRemote(target, name), depth + 1);
            }
            sftp.rmdir(target);
        } else {
            sftp.rm(target);
        }
    }

    private static SftpProgressMonitor monitor(Progress progress, long knownTotal) {
        return new SftpProgressMonitor() {
            long done;
            long total = knownTotal;
            long lastReport;

            @Override
            public void init(int op, String src, String dest, long max) {
                if (max > 0) total = max;
            }

            @Override
            public boolean count(long count) {
                done += count;
                long now = System.currentTimeMillis();
                if (progress != null && now - lastReport > 150) {
                    lastReport = now;
                    progress.onProgress(done, total);
                }
                return true;
            }

            @Override
            public void end() {
                if (progress != null) progress.onProgress(done, total);
            }
        };
    }

    public void download(ServerConfig config, String remotePath, OutputStream target, Progress progress) throws SshError {
        ChannelSftp sftp = sftp(config);
        synchronized (lockFor("sftp:" + config.id)) {
            try {
                long total = sftp.stat(remotePath).getSize();
                sftp.get(remotePath, target, monitor(progress, total));
            } catch (SftpException error) {
                throw sftpError(error);
            }
        }
    }

    public void upload(ServerConfig config, InputStream source, long size, String remotePath, Progress progress) throws SshError {
        ChannelSftp sftp = sftp(config);
        synchronized (lockFor("sftp:" + config.id)) {
            try {
                sftp.put(source, remotePath, monitor(progress, size), ChannelSftp.OVERWRITE);
            } catch (SftpException error) {
                throw sftpError(error);
            }
        }
    }

    public String readText(ServerConfig config, String remotePath, int maxBytes) throws SshError {
        if (size(config, remotePath) > maxBytes) {
            throw new SshError("TOO_LARGE", "Die Datei ist zu gross fuer den Editor.");
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        download(config, remotePath, out, null);
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    public void writeText(ServerConfig config, String remotePath, String content) throws SshError {
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        upload(config, new java.io.ByteArrayInputStream(bytes), bytes.length, remotePath, null);
    }

    // ── Keys ───────────────────────────────────────────────────

    /** Creates an Ed25519 key pair: [private key (OpenSSH format), public key line]. */
    public static String[] generateKey(String comment) throws SshError {
        try {
            JSch jsch = new JSch();
            KeyPair pair = KeyPair.genKeyPair(jsch, KeyPair.ED25519);
            ByteArrayOutputStream privateKey = new ByteArrayOutputStream();
            pair.writeOpenSSHv1PrivateKey(privateKey, null);
            ByteArrayOutputStream publicKey = new ByteArrayOutputStream();
            pair.writePublicKey(publicKey, comment == null ? "codeforge-android" : comment);
            pair.dispose();
            return new String[] {
                    new String(privateKey.toByteArray(), StandardCharsets.UTF_8),
                    new String(publicKey.toByteArray(), StandardCharsets.UTF_8).trim(),
            };
        } catch (Exception error) {
            throw new SshError("KEYGEN", "Key konnte nicht erzeugt werden: " + error.getMessage());
        }
    }

    /** Public key line of a private key, or null when it cannot be read (e.g. encrypted). */
    public static String publicKeyOf(String privateKey, String passphrase, String comment) {
        try {
            JSch jsch = new JSch();
            KeyPair pair = KeyPair.load(jsch, privateKey.replace("\r\n", "\n").getBytes(StandardCharsets.UTF_8), null);
            if (pair.isEncrypted() && (passphrase == null || !pair.decrypt(passphrase))) {
                pair.dispose();
                return null;
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            pair.writePublicKey(out, comment == null ? "" : comment);
            pair.dispose();
            return new String(out.toByteArray(), StandardCharsets.UTF_8).trim();
        } catch (Exception error) {
            return null;
        }
    }

    /** Checks that a pasted or picked file is a usable private key; returns whether it needs a passphrase. */
    public static boolean checkPrivateKey(String privateKey) throws SshError {
        if (privateKey == null || !privateKey.contains("PRIVATE KEY")) {
            if (privateKey != null && privateKey.contains("PuTTY-User-Key-File")) {
                throw new SshError("INVALID_KEY", "PuTTY-Keys (.ppk) werden nicht unterstuetzt. In PuTTYgen: Conversions > Export OpenSSH key.");
            }
            throw new SshError("INVALID_KEY", "Das ist kein privater SSH-Key (erwartet z.B. id_ed25519 oder id_rsa, nicht die .pub-Datei).");
        }
        try {
            KeyPair pair = KeyPair.load(new JSch(), privateKey.replace("\r\n", "\n").getBytes(StandardCharsets.UTF_8), null);
            boolean encrypted = pair.isEncrypted();
            pair.dispose();
            return encrypted;
        } catch (JSchException error) {
            throw new SshError("INVALID_KEY", "Der Key konnte nicht gelesen werden: " + error.getMessage());
        }
    }
}
