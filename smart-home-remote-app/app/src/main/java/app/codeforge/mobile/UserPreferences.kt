package app.codeforge.mobile

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "codeforge_mobile_settings")

class UserPreferences(private val context: Context) {
    companion object {
        private val PIN_KEY = stringPreferencesKey("user_pin")
        private val SERVER_URL_KEY = stringPreferencesKey("server_url")
        private val SERVER_TOKEN_KEY = stringPreferencesKey("server_token")
        private val PROVIDER_KEY = stringPreferencesKey("provider")
        private val MODEL_KEY = stringPreferencesKey("model")
        private val REMOTE_PROJECT_PATH_KEY = stringPreferencesKey("remote_project_path")
        private val SYSTEM_PROMPT_KEY = stringPreferencesKey("system_prompt")
        private val ACCESS_MODE_KEY = stringPreferencesKey("access_mode")
        private val REASONING_EFFORT_KEY = stringPreferencesKey("reasoning_effort")
        private val DARK_MODE_ENABLED_KEY = booleanPreferencesKey("dark_mode_enabled")
        private val OUTPUT_LIMIT_KEY = intPreferencesKey("output_limit")
        private val THEME_ID_KEY = stringPreferencesKey("theme_id")
        private val CHAT_SESSIONS_KEY = stringPreferencesKey("chat_sessions")
        private val ACTIVE_CHAT_ID_KEY = stringPreferencesKey("active_chat_id")
        private val BACKGROUND_MEDIA_URI_KEY = stringPreferencesKey("background_media_uri")
        private val BACKGROUND_MEDIA_IS_VIDEO_KEY = booleanPreferencesKey("background_media_is_video")
        private val UI_TRANSPARENCY_KEY = intPreferencesKey("ui_transparency")
        private val BACKGROUND_ZOOM_KEY = intPreferencesKey("background_zoom")
        private val BACKGROUND_VIDEO_SOUND_KEY = booleanPreferencesKey("background_video_sound")
        private val RESPONSE_DISPLAY_MODE_KEY = stringPreferencesKey("response_display_mode")
        private val HAS_COMPLETED_SETUP_KEY = booleanPreferencesKey("has_completed_setup")
        private val TOKEN_LIMIT_KEY = intPreferencesKey("token_limit")
        private val TOTAL_TOKENS_USED_KEY = intPreferencesKey("total_tokens_used")
    }

    val pin: Flow<String> = context.dataStore.data.map { it[PIN_KEY] ?: "" }
    val serverUrl: Flow<String> = context.dataStore.data.map { it[SERVER_URL_KEY] ?: "http://88.214.56.241:8787" }
    val serverToken: Flow<String> = context.dataStore.data.map { it[SERVER_TOKEN_KEY] ?: "HsuBh3M5p1ka24QUzWqGgLDXyZYTm0leSK86FwJfnrCbtVAR" }
    val provider: Flow<String> = context.dataStore.data.map { it[PROVIDER_KEY] ?: "openai" }
    val model: Flow<String> = context.dataStore.data.map { it[MODEL_KEY] ?: "gpt-5.5" }
    val remoteProjectPath: Flow<String> = context.dataStore.data.map { it[REMOTE_PROJECT_PATH_KEY] ?: "/root/codeforge-project" }
    val systemPrompt: Flow<String> = context.dataStore.data.map {
        it[SYSTEM_PROMPT_KEY]
            ?: "Du bist ein sorgfaeltiger Coding-Agent auf einem Debian-VServer. Arbeite im angegebenen Projektordner, schuetze bestehende Nutzerarbeit und antworte knapp auf Deutsch."
    }
    val accessMode: Flow<String> = context.dataStore.data.map { it[ACCESS_MODE_KEY] ?: "workspace-write" }
    val reasoningEffort: Flow<String> = context.dataStore.data.map { it[REASONING_EFFORT_KEY] ?: "medium" }
    val darkModeEnabled: Flow<Boolean> = context.dataStore.data.map { it[DARK_MODE_ENABLED_KEY] ?: true }
    val outputLimit: Flow<Int> = context.dataStore.data.map { it[OUTPUT_LIMIT_KEY] ?: 12000 }
    val selectedThemeId: Flow<String> = context.dataStore.data.map { it[THEME_ID_KEY] ?: "modern-dark" }
    val chatSessionsJson: Flow<String> = context.dataStore.data.map { it[CHAT_SESSIONS_KEY] ?: "[]" }
    val activeChatId: Flow<String> = context.dataStore.data.map { it[ACTIVE_CHAT_ID_KEY] ?: "" }
    val backgroundMediaUri: Flow<String> = context.dataStore.data.map { it[BACKGROUND_MEDIA_URI_KEY] ?: "" }
    val backgroundMediaIsVideo: Flow<Boolean> = context.dataStore.data.map { it[BACKGROUND_MEDIA_IS_VIDEO_KEY] ?: false }
    val uiTransparency: Flow<Int> = context.dataStore.data.map { it[UI_TRANSPARENCY_KEY] ?: 18 }
    val backgroundZoom: Flow<Int> = context.dataStore.data.map { it[BACKGROUND_ZOOM_KEY] ?: 110 }
    val backgroundVideoSound: Flow<Boolean> = context.dataStore.data.map { it[BACKGROUND_VIDEO_SOUND_KEY] ?: false }
    val responseDisplayMode: Flow<String> = context.dataStore.data.map { it[RESPONSE_DISPLAY_MODE_KEY] ?: "bullets" }
    val hasCompletedSetup: Flow<Boolean> = context.dataStore.data.map { it[HAS_COMPLETED_SETUP_KEY] ?: false }
    val tokenLimit: Flow<Int> = context.dataStore.data.map { it[TOKEN_LIMIT_KEY] ?: 0 }
    val totalTokensUsed: Flow<Int> = context.dataStore.data.map { it[TOTAL_TOKENS_USED_KEY] ?: 0 }

    suspend fun savePin(pin: String) {
        context.dataStore.edit { it[PIN_KEY] = pin }
    }

    suspend fun saveServerConfig(serverUrl: String, token: String) {
        context.dataStore.edit {
            it[SERVER_URL_KEY] = serverUrl.trim()
            it[SERVER_TOKEN_KEY] = token.trim()
        }
    }

    suspend fun saveAgentConfig(
        provider: String,
        model: String,
        remoteProjectPath: String,
        systemPrompt: String,
        accessMode: String,
        reasoningEffort: String,
        outputLimit: Int
    ) {
        context.dataStore.edit {
            it[PROVIDER_KEY] = provider
            it[MODEL_KEY] = model.trim()
            it[REMOTE_PROJECT_PATH_KEY] = remoteProjectPath.trim()
            it[SYSTEM_PROMPT_KEY] = systemPrompt.trim()
            it[ACCESS_MODE_KEY] = accessMode
            it[REASONING_EFFORT_KEY] = reasoningEffort
            it[OUTPUT_LIMIT_KEY] = outputLimit.coerceIn(1000, 50000)
        }
    }

    suspend fun saveDarkMode(enabled: Boolean) {
        context.dataStore.edit {
            it[DARK_MODE_ENABLED_KEY] = enabled
            it[THEME_ID_KEY] = if (enabled) "modern-dark" else "classic-light"
        }
    }

    suspend fun saveTheme(themeId: String) {
        context.dataStore.edit {
            it[THEME_ID_KEY] = themeId
            it[DARK_MODE_ENABLED_KEY] = themeId !in setOf(
                "classic-light",
                "muted-earth",
                "solarized-dawn",
                "rose-quartz",
                "arctic-blue"
            )
        }
    }

    suspend fun saveChatSessions(json: String) {
        context.dataStore.edit { it[CHAT_SESSIONS_KEY] = json }
    }

    suspend fun saveActiveChatId(chatId: String) {
        context.dataStore.edit { it[ACTIVE_CHAT_ID_KEY] = chatId }
    }

    suspend fun saveBackgroundMedia(uri: String, isVideo: Boolean) {
        context.dataStore.edit {
            it[BACKGROUND_MEDIA_URI_KEY] = uri
            it[BACKGROUND_MEDIA_IS_VIDEO_KEY] = isVideo
        }
    }

    suspend fun saveUiTransparency(value: Int) {
        context.dataStore.edit { it[UI_TRANSPARENCY_KEY] = value.coerceIn(0, 85) }
    }

    suspend fun saveBackgroundZoom(value: Int) {
        context.dataStore.edit { it[BACKGROUND_ZOOM_KEY] = value.coerceIn(100, 220) }
    }

    suspend fun saveBackgroundVideoSound(enabled: Boolean) {
        context.dataStore.edit { it[BACKGROUND_VIDEO_SOUND_KEY] = enabled }
    }

    suspend fun saveResponseDisplayMode(mode: String) {
        context.dataStore.edit { it[RESPONSE_DISPLAY_MODE_KEY] = mode }
    }

    suspend fun saveHasCompletedSetup(value: Boolean) {
        context.dataStore.edit { it[HAS_COMPLETED_SETUP_KEY] = value }
    }

    suspend fun saveTokenLimit(limit: Int) {
        context.dataStore.edit { it[TOKEN_LIMIT_KEY] = limit.coerceIn(0, 1_000_000_000) }
    }

    suspend fun saveTotalTokensUsed(tokens: Int) {
        context.dataStore.edit { it[TOTAL_TOKENS_USED_KEY] = tokens.coerceIn(0, 1_000_000_000) }
    }

    suspend fun addTokenUsage(tokens: Int) {
        context.dataStore.edit { prefs ->
            val current = prefs[TOTAL_TOKENS_USED_KEY] ?: 0
            prefs[TOTAL_TOKENS_USED_KEY] = (current + tokens).coerceIn(0, 1_000_000_000)
        }
    }
}
