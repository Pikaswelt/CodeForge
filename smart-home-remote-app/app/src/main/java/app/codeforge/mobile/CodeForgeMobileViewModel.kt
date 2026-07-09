package app.codeforge.mobile

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

enum class AppState {
    LOADING, SETUP_PIN, LOGIN, SETUP_WIZARD, DASHBOARD
}

data class RemoteConfig(
    val serverUrl: String = "",
    val serverToken: String = "",
    val provider: String = "openai",
    val model: String = "gpt-5.5",
    val remoteProjectPath: String = "/root/codeforge-project",
    val systemPrompt: String = "",
    val accessMode: String = "workspace-write",
    val reasoningEffort: String = "medium",
    val outputLimit: Int = 12000
)

data class ChatEntry(
    val id: String = java.util.UUID.randomUUID().toString(),
    val prompt: String,
    val response: String,
    val ok: Boolean,
    val timestamp: Long = System.currentTimeMillis()
)

data class ChatSession(
    val id: String,
    val title: String,
    val entries: List<ChatEntry> = emptyList(),
    val updatedAt: Long = System.currentTimeMillis()
)

data class UiNotice(
    val message: String,
    val success: Boolean,
    val id: Long = System.currentTimeMillis()
)

class CodeForgeMobileViewModel(application: Application) : AndroidViewModel(application) {
    private val userPrefs = UserPreferences(application)
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.MINUTES)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    val currentPin: StateFlow<String> = userPrefs.pin.stateIn(
        scope = viewModelScope,
        started = SharingStarted.Eagerly,
        initialValue = ""
    )

    private val _isAuthenticated = MutableStateFlow(false)

    val hasCompletedSetup: StateFlow<Boolean> = userPrefs.hasCompletedSetup.stateIn(viewModelScope, SharingStarted.Eagerly, false)

    val appState: StateFlow<AppState> = combine(currentPin, _isAuthenticated, hasCompletedSetup) { pin, auth, setupDone ->
        when {
            pin.isEmpty() -> AppState.SETUP_PIN
            !auth -> AppState.LOGIN
            !setupDone -> AppState.SETUP_WIZARD
            else -> AppState.DASHBOARD
        }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, AppState.LOADING)

    val darkModeEnabled: StateFlow<Boolean> = userPrefs.darkModeEnabled.stateIn(viewModelScope, SharingStarted.Eagerly, true)
    val selectedThemeId: StateFlow<String> = userPrefs.selectedThemeId.stateIn(viewModelScope, SharingStarted.Eagerly, "modern-dark")

    val remoteConfig: StateFlow<RemoteConfig> = combine(
        userPrefs.serverUrl,
        userPrefs.serverToken,
        userPrefs.provider,
        userPrefs.model,
        userPrefs.remoteProjectPath,
        userPrefs.systemPrompt,
        userPrefs.accessMode,
        userPrefs.reasoningEffort,
        userPrefs.outputLimit
    ) { values: Array<Any> ->
        RemoteConfig(
            serverUrl = values[0] as String,
            serverToken = values[1] as String,
            provider = values[2] as String,
            model = values[3] as String,
            remoteProjectPath = values[4] as String,
            systemPrompt = values[5] as String,
            accessMode = values[6] as String,
            reasoningEffort = values[7] as String,
            outputLimit = values[8] as Int
        )
    }.stateIn(viewModelScope, SharingStarted.Eagerly, RemoteConfig())

    private val _isBusy = MutableStateFlow(false)
    val isBusy: StateFlow<Boolean> = _isBusy

    private val _status = MutableStateFlow<String?>(null)
    val status: StateFlow<String?> = _status

    val chatSessions: StateFlow<List<ChatSession>> = userPrefs.chatSessionsJson
        .map(::decodeChatSessions)
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    val activeChatId: StateFlow<String> = userPrefs.activeChatId.stateIn(viewModelScope, SharingStarted.Eagerly, "")

    val chatEntries: StateFlow<List<ChatEntry>> = combine(chatSessions, activeChatId) { sessions, activeId ->
        if (activeId.isBlank()) emptyList() else sessions.firstOrNull { it.id == activeId }?.entries ?: emptyList()
    }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    val backgroundMediaUri: StateFlow<String> = userPrefs.backgroundMediaUri.stateIn(viewModelScope, SharingStarted.Eagerly, "")
    val backgroundMediaIsVideo: StateFlow<Boolean> = userPrefs.backgroundMediaIsVideo.stateIn(viewModelScope, SharingStarted.Eagerly, false)
    val uiTransparency: StateFlow<Int> = userPrefs.uiTransparency.stateIn(viewModelScope, SharingStarted.Eagerly, 18)
    val backgroundZoom: StateFlow<Int> = userPrefs.backgroundZoom.stateIn(viewModelScope, SharingStarted.Eagerly, 110)
    val backgroundVideoSound: StateFlow<Boolean> = userPrefs.backgroundVideoSound.stateIn(viewModelScope, SharingStarted.Eagerly, false)

    private val _notice = MutableStateFlow<UiNotice?>(null)
    val notice: StateFlow<UiNotice?> = _notice

    val responseDisplayMode: StateFlow<String> = userPrefs.responseDisplayMode.stateIn(viewModelScope, SharingStarted.Eagerly, "bullets")
    val tokenLimit: StateFlow<Int> = userPrefs.tokenLimit.stateIn(viewModelScope, SharingStarted.Eagerly, 0)
    val totalTokensUsed: StateFlow<Int> = userPrefs.totalTokensUsed.stateIn(viewModelScope, SharingStarted.Eagerly, 0)

    fun setupPin(newPin: String) {
        viewModelScope.launch {
            userPrefs.savePin(newPin)
            _isAuthenticated.value = true
        }
    }

    fun login(pinAttempt: String): Boolean {
        return if (pinAttempt == currentPin.value) {
            _isAuthenticated.value = true
            true
        } else {
            false
        }
    }

    fun logout() {
        _isAuthenticated.value = false
    }

    fun saveServerConfig(serverUrl: String, token: String) {
        viewModelScope.launch {
            userPrefs.saveServerConfig(serverUrl, token)
            _status.value = "Serverdaten gespeichert."
            showNotice("Serverdaten gespeichert.", true)
        }
    }

    fun saveAgentConfig(
        provider: String,
        model: String,
        remoteProjectPath: String,
        systemPrompt: String,
        accessMode: String,
        reasoningEffort: String,
        outputLimit: Int
    ) {
        viewModelScope.launch {
            userPrefs.saveAgentConfig(provider, model, remoteProjectPath, systemPrompt, accessMode, reasoningEffort, outputLimit)
            _status.value = "Agent-Konfiguration gespeichert."
            showNotice("Agent-Konfiguration gespeichert.", true)
        }
    }

    fun saveDarkMode(enabled: Boolean) {
        viewModelScope.launch {
            userPrefs.saveDarkMode(enabled)
        }
    }

    fun saveTheme(themeId: String) {
        viewModelScope.launch {
            userPrefs.saveTheme(themeId)
        }
    }

    fun saveBackgroundMedia(uri: String, isVideo: Boolean) {
        viewModelScope.launch {
            userPrefs.saveBackgroundMedia(uri, isVideo)
        }
    }

    fun clearBackgroundMedia() {
        viewModelScope.launch {
            userPrefs.saveBackgroundMedia("", false)
        }
    }

    fun saveUiTransparency(value: Int) {
        viewModelScope.launch {
            userPrefs.saveUiTransparency(value)
        }
    }

    fun saveBackgroundZoom(value: Int) {
        viewModelScope.launch {
            userPrefs.saveBackgroundZoom(value)
        }
    }

    fun saveBackgroundVideoSound(enabled: Boolean) {
        viewModelScope.launch {
            userPrefs.saveBackgroundVideoSound(enabled)
        }
    }

    fun saveResponseDisplayMode(mode: String) {
        viewModelScope.launch {
            userPrefs.saveResponseDisplayMode(mode)
        }
    }

    fun completeSetup() {
        viewModelScope.launch {
            userPrefs.saveHasCompletedSetup(true)
        }
    }

    fun saveTokenLimit(limit: Int) {
        viewModelScope.launch {
            userPrefs.saveTokenLimit(limit)
        }
    }

    fun addTokenUsage(tokens: Int) {
        viewModelScope.launch {
            userPrefs.addTokenUsage(tokens)
        }
    }

    fun resetTokenUsage() {
        viewModelScope.launch {
            userPrefs.saveTotalTokensUsed(0)
        }
    }

    fun newChat() {
        viewModelScope.launch {
            userPrefs.saveActiveChatId("")
            _status.value = "Neuer Chat bereit."
        }
    }

    fun selectChat(chatId: String) {
        viewModelScope.launch {
            userPrefs.saveActiveChatId(chatId)
        }
    }

    fun deleteChat(chatId: String) {
        viewModelScope.launch {
            val next = chatSessions.value.filterNot { it.id == chatId }
            userPrefs.saveChatSessions(encodeChatSessions(next))
            if (activeChatId.value == chatId) userPrefs.saveActiveChatId(next.firstOrNull()?.id.orEmpty())
            _status.value = "Chat geloescht."
        }
    }

    fun clearStatus() {
        _status.value = null
    }

    fun clearNotice() {
        _notice.value = null
    }

    fun testServer() {
        val config = remoteConfig.value
        if (!validateServerConfig(config)) return
        viewModelScope.launch {
            _isBusy.value = true
            _status.value = "Teste Verbindung..."
            val result = withContext(Dispatchers.IO) { callHealth(config) }
            val ok = result.startsWith("Verbindung ok")
            _status.value = result
            showNotice(if (ok) "Verbindung erfolgreich." else "Verbindung fehlgeschlagen.", ok)
            _isBusy.value = false
        }
    }

    private var activeJob: kotlinx.coroutines.Job? = null

    fun cancelActiveJob() {
        activeJob?.cancel()
        activeJob = null
        _isBusy.value = false
        _status.value = "Vorgang abgebrochen."
        showNotice("Vorgang abgebrochen.", false)
        
        // Find the last temp entry with response "..." in the active chat and mark it as cancelled
        val sessions = chatSessions.value
        val selectedId = activeChatId.value
        val updatedSessions = sessions.map { session ->
            if (session.id == selectedId) {
                val updatedEntries = session.entries.map { entry ->
                    if (entry.response == "...") {
                        entry.copy(
                            response = "Vorgang abgebrochen.",
                            ok = false,
                            timestamp = System.currentTimeMillis()
                        )
                    } else {
                        entry
                    }
                }
                session.copy(entries = updatedEntries, updatedAt = System.currentTimeMillis())
            } else {
                session
            }
        }
        viewModelScope.launch {
            userPrefs.saveChatSessions(encodeChatSessions(updatedSessions))
        }
    }

    private val _usageText = MutableStateFlow("")
    val usageText: StateFlow<String> = _usageText

    fun fetchUsage() {
        val config = remoteConfig.value
        if (!validateServerConfig(config)) return
        viewModelScope.launch {
            _isBusy.value = true
            _usageText.value = "Lade Auslastungsdaten..."
            val result = withContext(Dispatchers.IO) {
                try {
                    val request = Request.Builder()
                        .url("${normalizeBaseUrl(config.serverUrl)}/usage")
                        .addHeader("Authorization", "Bearer ${config.serverToken}")
                        .get()
                        .build()
                    httpClient.newCall(request).execute().use { response ->
                        val body = response.body?.string().orEmpty()
                        if (response.isSuccessful) {
                            val parsed = JSONObject(body)
                            parsed.optString("output", "Keine Ausgabe vom Server.")
                        } else {
                            "Fehler ${response.code}: $body"
                        }
                    }
                } catch (e: Exception) {
                    "Fehler beim Laden: ${e.message}"
                }
            }
            _usageText.value = result
            _isBusy.value = false
        }
    }

    fun sendPrompt(prompt: String) {
        val trimmed = prompt.trim()
        val config = remoteConfig.value
        if (trimmed.isBlank()) {
            _status.value = "Bitte gib eine Aufgabe ein."
            showNotice("Bitte gib eine Aufgabe ein.", false)
            return
        }
        if (!validateServerConfig(config)) return
        activeJob = viewModelScope.launch {
            val tempEntry = ChatEntry(prompt = trimmed, response = "...", ok = true)
            val tempId = tempEntry.id
            saveResponseToActiveChat(trimmed, tempEntry)
            
            _isBusy.value = true
            _status.value = "Agent laeuft auf dem VServer..."
            try {
                val response = withContext(Dispatchers.IO) { callRun(config, trimmed, tempId) }
                updateActiveChatEntry(tempId, response)
                _status.value = if (response.ok) "Fertig." else "Fehlgeschlagen."
                showNotice(if (response.ok) "Agent erfolgreich fertig." else "Agent fehlgeschlagen.", response.ok)
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } finally {
                _isBusy.value = false
                activeJob = null
            }
        }
    }

    fun clearHistory() {
        viewModelScope.launch {
            val selectedId = resolveActiveChatId()
            val next = chatSessions.value.map { session ->
                if (session.id == selectedId) session.copy(entries = emptyList(), updatedAt = System.currentTimeMillis()) else session
            }
            userPrefs.saveChatSessions(encodeChatSessions(next))
            _status.value = "Verlauf geloescht."
        }
    }

    private suspend fun saveResponseToActiveChat(prompt: String, response: ChatEntry) {
        val now = System.currentTimeMillis()
        val sessions = chatSessions.value
        val selectedId = activeChatId.value
        val existing = sessions.firstOrNull { it.id == selectedId }
        val sessionId = existing?.id ?: newId()
        val updatedSession = ChatSession(
            id = sessionId,
            title = existing?.title ?: prompt.toChatTitle(),
            entries = listOf(response) + (existing?.entries ?: emptyList()).take(24),
            updatedAt = now
        )
        val next = listOf(updatedSession) + sessions.filterNot { it.id == sessionId }
        userPrefs.saveChatSessions(encodeChatSessions(next.take(40)))
        userPrefs.saveActiveChatId(sessionId)
    }

    private fun updateActiveChatEntry(entryId: String, finalResponse: ChatEntry) {
        val sessions = chatSessions.value
        val selectedId = activeChatId.value
        val updatedSessions = sessions.map { session ->
            if (session.id == selectedId) {
                val updatedEntries = session.entries.map { entry ->
                    if (entry.id == entryId) {
                        entry.copy(
                            response = finalResponse.response,
                            ok = finalResponse.ok,
                            timestamp = finalResponse.timestamp
                        )
                    } else {
                        entry
                    }
                }
                session.copy(entries = updatedEntries, updatedAt = System.currentTimeMillis())
            } else {
                session
            }
        }
        viewModelScope.launch {
            userPrefs.saveChatSessions(encodeChatSessions(updatedSessions))
        }
    }

    private fun resolveActiveChatId(): String {
        val selectedId = activeChatId.value
        if (chatSessions.value.any { it.id == selectedId }) return selectedId
        return chatSessions.value.firstOrNull()?.id.orEmpty()
    }

    private fun validateServerConfig(config: RemoteConfig): Boolean {
        if (config.serverUrl.isBlank()) {
            _status.value = "Bitte Server-URL eintragen."
            showNotice("Bitte Server-URL eintragen.", false)
            return false
        }
        if (config.serverToken.isBlank()) {
            _status.value = "Bitte API-Token eintragen."
            showNotice("Bitte API-Token eintragen.", false)
            return false
        }
        if (config.remoteProjectPath.isBlank()) {
            _status.value = "Bitte Remote-Projektpfad eintragen."
            showNotice("Bitte Remote-Projektpfad eintragen.", false)
            return false
        }
        return true
    }

    private fun showNotice(message: String, success: Boolean) {
        _notice.value = UiNotice(message = message, success = success)
    }

    private fun callHealth(config: RemoteConfig): String {
        return try {
            val request = Request.Builder()
                .url("${normalizeBaseUrl(config.serverUrl)}/health")
                .addHeader("Authorization", "Bearer ${config.serverToken}")
                .get()
                .build()
            httpClient.newCall(request).execute().use { response ->
                val body = response.body?.string().orEmpty()
                if (response.isSuccessful) {
                    "Verbindung ok: ${body.ifBlank { "Remote-API erreichbar." }}"
                } else {
                    "Fehler ${response.code}: ${body.ifBlank { response.message }}"
                }
            }
        } catch (error: Exception) {
            "Verbindung fehlgeschlagen: ${error.message}"
        }
    }

    private fun callRun(config: RemoteConfig, prompt: String, entryId: String): ChatEntry {
        return try {
            val json = JSONObject()
                .put("provider", config.provider)
                .put("model", config.model)
                .put("prompt", prompt)
                .put("projectPath", config.remoteProjectPath)
                .put("systemPrompt", config.systemPrompt)
                .put("access", config.accessMode)
                .put("reasoningEffort", config.reasoningEffort)
                .put("outputLimit", config.outputLimit)
                .put("stream", true)
            val request = Request.Builder()
                .url("${normalizeBaseUrl(config.serverUrl)}/run")
                .addHeader("Authorization", "Bearer ${config.serverToken}")
                .addHeader("Accept", "application/x-ndjson")
                .post(json.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
                .build()
            httpClient.newCall(request).execute().use { response ->
                val contentType = response.header("content-type").orEmpty()
                if (contentType.contains("application/x-ndjson", ignoreCase = true)) {
                    readRunStream(response, prompt, entryId)
                } else {
                    val body = response.body?.string().orEmpty()
                    val parsed = body.takeIf { it.isNotBlank() }?.let { JSONObject(it) }
                    val ok = response.isSuccessful && parsed?.optBoolean("ok", false) == true
                    val output = parsed?.optString("output").orEmpty()
                    val error = parsed?.optString("error").orEmpty()
                    ChatEntry(
                        prompt = prompt,
                        response = listOf(output, error).filter { it.isNotBlank() }.joinToString("\n").ifBlank {
                            "Leere Antwort vom Server."
                        },
                        ok = ok
                    )
                }
            }
        } catch (error: Exception) {
            ChatEntry(prompt = prompt, response = "Fehler: ${error.message}", ok = false)
        }
    }

    private fun readRunStream(response: okhttp3.Response, prompt: String, entryId: String): ChatEntry {
        val source = response.body?.source() ?: return ChatEntry(prompt = prompt, response = "Leere Antwort vom Server.", ok = false)
        val output = StringBuilder()
        var finalOutput = ""
        var finalError = ""
        var finalOk = false
        var sawDone = false
        var lastUiUpdate = 0L

        while (true) {
            val line = source.readUtf8Line() ?: break
            if (line.isBlank()) continue
            val event = runCatching { JSONObject(line) }.getOrNull() ?: continue
            when (event.optString("type")) {
                "output" -> {
                    val chunk = event.optString("chunk")
                    if (chunk.isNotBlank()) {
                        output.append(chunk)
                        val now = System.currentTimeMillis()
                        if (now - lastUiUpdate > 350) {
                            updateActiveChatEntry(entryId, ChatEntry(prompt = prompt, response = output.toString().trim().ifBlank { "Agent laeuft..." }, ok = true))
                            lastUiUpdate = now
                        }
                    }
                }
                "done" -> {
                    sawDone = true
                    finalOk = event.optBoolean("ok", false)
                    finalOutput = event.optString("output")
                    finalError = event.optString("error")
                }
            }
        }

        val finalText = listOf(finalOutput, finalError)
            .filter { it.isNotBlank() }
            .joinToString("\n")
            .ifBlank { output.toString().trim() }
            .ifBlank { if (sawDone) "Leere Antwort vom Server." else "Stream wurde ohne Abschluss beendet." }
        return ChatEntry(prompt = prompt, response = finalText, ok = response.isSuccessful && sawDone && finalOk)
    }

    private fun normalizeBaseUrl(value: String): String {
        return value.trim().trimEnd('/')
    }

    private fun newId(): String = "chat-${System.currentTimeMillis()}-${(1000..9999).random()}"

    private fun String.toChatTitle(): String {
        val compact = trim().replace(Regex("\\s+"), " ")
        return compact.take(42).ifBlank { "Neuer Chat" }
    }

    private fun decodeChatSessions(json: String): List<ChatSession> {
        return try {
            val array = JSONArray(json)
            buildList {
                for (index in 0 until array.length()) {
                    val item = array.optJSONObject(index) ?: continue
                    val entriesArray = item.optJSONArray("entries") ?: JSONArray()
                    val entries = buildList {
                        for (entryIndex in 0 until entriesArray.length()) {
                            val entry = entriesArray.optJSONObject(entryIndex) ?: continue
                            add(
                                ChatEntry(
                                    id = entry.optString("id", java.util.UUID.randomUUID().toString()),
                                    prompt = entry.optString("prompt"),
                                    response = entry.optString("response"),
                                    ok = entry.optBoolean("ok", false),
                                    timestamp = entry.optLong("timestamp", System.currentTimeMillis())
                                )
                            )
                        }
                    }
                    add(
                        ChatSession(
                            id = item.optString("id"),
                            title = item.optString("title", "Chat"),
                            entries = entries,
                            updatedAt = item.optLong("updatedAt", System.currentTimeMillis())
                        )
                    )
                }
            }.filter { it.id.isNotBlank() }.sortedByDescending { it.updatedAt }
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun encodeChatSessions(sessions: List<ChatSession>): String {
        val array = JSONArray()
        sessions.forEach { session ->
            val entriesArray = JSONArray()
            session.entries.forEach { entry ->
                entriesArray.put(
                    JSONObject()
                        .put("id", entry.id)
                        .put("prompt", entry.prompt)
                        .put("response", entry.response)
                        .put("ok", entry.ok)
                        .put("timestamp", entry.timestamp)
                )
            }
            array.put(
                JSONObject()
                    .put("id", session.id)
                    .put("title", session.title)
                    .put("updatedAt", session.updatedAt)
                    .put("entries", entriesArray)
            )
        }
        return array.toString()
    }
}
