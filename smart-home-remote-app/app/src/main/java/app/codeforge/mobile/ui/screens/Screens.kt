package app.codeforge.mobile.ui.screens

import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.view.ViewGroup
import android.widget.VideoView
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Image
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.clickable
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.RepeatMode
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.rememberDrawerState
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.DrawerDefaults
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Terminal
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.codeforge.mobile.ChatEntry
import app.codeforge.mobile.ChatSession
import app.codeforge.mobile.CodeForgeMobileViewModel
import app.codeforge.mobile.RemoteConfig
import app.codeforge.mobile.UiNotice
import app.codeforge.mobile.ui.theme.CodeForgeMobileTheme
import app.codeforge.mobile.ui.theme.CodeForgeMobileThemes
import app.codeforge.mobile.ui.theme.mobileThemeById
import app.codeforge.mobile.ui.components.FormattedChatMessage
import app.codeforge.mobile.ui.components.SetupWizardScreen
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.font.FontStyle

private val providers = listOf("openai", "antigravity", "anthropic", "cursor", "opencode")
private val providerModels = mapOf(
    "openai" to listOf("gpt-5.5", "gpt-5.4"),
    "antigravity" to listOf(
        "Gemini 3.5 Flash (Medium)",
        "Gemini 3.5 Flash (High)",
        "Gemini 3.5 Flash (Low)",
        "Gemini 3.1 Pro (High)",
        "Claude Sonnet 4.6 (Thinking)",
        "GPT-OSS 120B (Medium)"
    ),
    "anthropic" to listOf("claude-sonnet-4-6", "claude-opus-4-6", "sonnet", "opus", "haiku"),
    "cursor" to listOf("default", "gpt-5.5", "claude-sonnet-4-6"),
    "opencode" to listOf("default", "openai/gpt-5.5", "anthropic/claude-sonnet-4-6", "google/gemini-3.5-flash")
)
private val accessModes = listOf("read-only", "workspace-write", "full")
private val reasoningModes = listOf("low", "medium", "high")
private val LocalUiTransparency = compositionLocalOf { 18 }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PinScreen(
    isSetup: Boolean,
    viewModel: CodeForgeMobileViewModel
) {
    var pinInput by remember { mutableStateOf("") }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val selectedThemeId by viewModel.selectedThemeId.collectAsStateWithLifecycle()
    val theme = mobileThemeById(selectedThemeId)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(appBackground(theme)),
        contentAlignment = Alignment.BottomCenter
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            shape = RoundedCornerShape(14.dp),
            colors = CardDefaults.cardColors(containerColor = cardColor(theme)),
            border = BorderStroke(1.dp, borderColor(theme))
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Icon(
                    imageVector = Icons.Default.Terminal,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(42.dp)
                )
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = if (isSetup) "CodeForge Mobile schuetzen" else "CodeForge Mobile entsperren",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = theme.text
                )
                Text(
                    text = if (isSetup) "Lege eine PIN fuer deinen VServer-Zugang an." else "Gib deine PIN ein, um Remote-Agenten zu starten.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = theme.mutedText
                )
                Spacer(modifier = Modifier.height(24.dp))
                OutlinedTextField(
                    value = pinInput,
                    onValueChange = { if (it.length <= 8) pinInput = it },
                    label = { Text("PIN") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                errorMessage?.let {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(text = it, color = MaterialTheme.colorScheme.error)
                }
                Spacer(modifier = Modifier.height(20.dp))
                Button(
                    onClick = {
                        if (pinInput.length < 4) {
                            errorMessage = "PIN muss mindestens 4 Zeichen haben."
                            return@Button
                        }
                        if (isSetup) {
                            viewModel.setupPin(pinInput)
                        } else if (!viewModel.login(pinInput)) {
                            errorMessage = "PIN ist falsch."
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    shape = CircleShape
                ) {
                    Text(if (isSetup) "PIN speichern" else "Entsperren")
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(viewModel: CodeForgeMobileViewModel) {
    val config by viewModel.remoteConfig.collectAsStateWithLifecycle()
    val selectedThemeId by viewModel.selectedThemeId.collectAsStateWithLifecycle()
    val theme = mobileThemeById(selectedThemeId)
    val isBusy by viewModel.isBusy.collectAsStateWithLifecycle()
    val entries by viewModel.chatEntries.collectAsStateWithLifecycle()
    val chats by viewModel.chatSessions.collectAsStateWithLifecycle()
    val activeChatId by viewModel.activeChatId.collectAsStateWithLifecycle()
    val backgroundMediaUri by viewModel.backgroundMediaUri.collectAsStateWithLifecycle()
    val backgroundMediaIsVideo by viewModel.backgroundMediaIsVideo.collectAsStateWithLifecycle()
    val uiTransparency by viewModel.uiTransparency.collectAsStateWithLifecycle()
    val backgroundZoom by viewModel.backgroundZoom.collectAsStateWithLifecycle()
    val backgroundVideoSound by viewModel.backgroundVideoSound.collectAsStateWithLifecycle()
    val notice by viewModel.notice.collectAsStateWithLifecycle()
    val responseDisplayMode by viewModel.responseDisplayMode.collectAsStateWithLifecycle()
    val tokenLimit by viewModel.tokenLimit.collectAsStateWithLifecycle()
    val totalTokensUsed by viewModel.totalTokensUsed.collectAsStateWithLifecycle()

    // Rotating phrases for empty state
    val phrases = listOf(
        "Was wollen wir entwickeln?",
        "Was steht heute an?",
        "Lass uns dein Projekt verbessern.",
        "Welcher Agent soll übernehmen?"
    )
    val phraseIndex = remember { mutableStateOf(0) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(4000)
            phraseIndex.value = (phraseIndex.value + 1) % phrases.size
        }
    }
    
    var prompt by remember { mutableStateOf("") }
    var panel by remember { mutableStateOf(MobilePanel.Chat) }
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    var searchActive by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }
    
    val context = LocalContext.current
    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let {
            context.contentResolver.takePersistableUriPermission(it, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            viewModel.saveBackgroundMedia(it.toString(), false)
        }
    }
    val videoPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let {
            context.contentResolver.takePersistableUriPermission(it, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            viewModel.saveBackgroundMedia(it.toString(), true)
        }
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet(
                drawerContainerColor = theme.surface,
                drawerContentColor = theme.text,
                modifier = Modifier
                    .width(300.dp)
                    .fillMaxHeight(),
                windowInsets = DrawerDefaults.windowInsets
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(16.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "CodeForge",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            color = theme.text
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            IconButton(onClick = { searchActive = !searchActive }) {
                                Icon(Icons.Default.Search, contentDescription = "Suchen", tint = if (searchActive) theme.accent else theme.mutedText)
                            }
                            IconButton(onClick = {
                                viewModel.newChat()
                                panel = MobilePanel.Chat
                                scope.launch { drawerState.close() }
                            }) {
                                Icon(Icons.Default.Chat, contentDescription = "Neuer Chat", tint = theme.mutedText)
                            }
                        }
                    }
                    
                    if (searchActive) {
                        OutlinedTextField(
                            value = searchQuery,
                            onValueChange = { searchQuery = it },
                            placeholder = { Text("Chats durchsuchen...") },
                            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = theme.mutedText, modifier = Modifier.size(18.dp)) },
                            trailingIcon = {
                                IconButton(onClick = {
                                    searchActive = false
                                    searchQuery = ""
                                }) {
                                    Icon(Icons.Default.Close, contentDescription = "Schliessen", tint = theme.mutedText, modifier = Modifier.size(18.dp))
                                }
                            },
                            singleLine = true,
                            colors = androidx.compose.material3.OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = theme.border,
                                unfocusedBorderColor = theme.border,
                                focusedTextColor = theme.text,
                                unfocusedTextColor = theme.text,
                                focusedPlaceholderColor = theme.mutedText,
                                unfocusedPlaceholderColor = theme.mutedText
                            ),
                            modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)
                        )
                    }
                    
                    DrawerMenuItem(
                        label = "Chat",
                        icon = Icons.Default.Chat,
                        selected = panel == MobilePanel.Chat,
                        theme = theme,
                        onClick = {
                            panel = MobilePanel.Chat
                            scope.launch { drawerState.close() }
                        }
                    )
                    DrawerMenuItem(
                        label = "Einstellungen",
                        icon = Icons.Default.Settings,
                        selected = panel == MobilePanel.Settings,
                        theme = theme,
                        onClick = {
                            panel = MobilePanel.Settings
                            scope.launch { drawerState.close() }
                        }
                    )
                    DrawerMenuItem(
                        label = "Auslastung",
                        icon = Icons.Default.Terminal,
                        selected = panel == MobilePanel.Usage,
                        theme = theme,
                        onClick = {
                            panel = MobilePanel.Usage
                            scope.launch { drawerState.close() }
                        }
                    )

                    HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp), color = theme.border)

                    Text(
                        text = "Letzte Chats",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = theme.mutedText,
                        modifier = Modifier.padding(bottom = 8.dp)
                    )

                    val filteredChats = remember(chats, searchQuery) {
                        if (searchQuery.isBlank()) {
                            chats
                        } else {
                            chats.filter { it.title.contains(searchQuery, ignoreCase = true) }
                        }
                    }

                    LazyColumn(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        items(filteredChats) { chat ->
                            RecentChatItem(
                                chat = chat,
                                active = chat.id == activeChatId && panel == MobilePanel.Chat,
                                theme = theme,
                                onSelect = {
                                    viewModel.selectChat(chat.id)
                                    panel = MobilePanel.Chat
                                    scope.launch { drawerState.close() }
                                },
                                onDelete = {
                                    viewModel.deleteChat(chat.id)
                                }
                            )
                        }
                    }

                    HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp), color = theme.border)

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Button(
                            onClick = {
                                viewModel.newChat()
                                panel = MobilePanel.Chat
                                scope.launch { drawerState.close() }
                            },
                            colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                                containerColor = theme.accent,
                                contentColor = theme.surface
                            ),
                            shape = RoundedCornerShape(20.dp),
                            modifier = Modifier.height(44.dp)
                        ) {
                            Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Neuer Chat", fontWeight = FontWeight.Bold)
                        }

                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .clip(CircleShape)
                                .background(theme.surfaceStrong)
                                .border(1.dp, theme.border, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "CF",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Bold,
                                color = theme.accent
                            )
                        }
                    }
                }
            }
        }
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(appBackground(theme))
        ) {
            MediaBackdrop(
                uriString = backgroundMediaUri,
                isVideo = backgroundMediaIsVideo,
                zoom = backgroundZoom,
                soundEnabled = backgroundVideoSound
            )
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = if (theme.isDark) 0.34f else 0.12f))
            )
            CompositionLocalProvider(LocalUiTransparency provides uiTransparency) {
            Scaffold(
                containerColor = Color.Transparent,
                topBar = {
                    TopAppBar(
                        navigationIcon = {
                            IconButton(onClick = { scope.launch { drawerState.open() } }) {
                                Icon(Icons.Default.Menu, contentDescription = "Menu", tint = theme.text)
                            }
                        },
                        title = {
                            Box(modifier = Modifier.fillMaxWidth().padding(end = 12.dp), contentAlignment = Alignment.Center) {
                                var modelMenuExpanded by remember { mutableStateOf(false) }
                                Row(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(20.dp))
                                        .background(theme.surfaceStrong.copy(alpha = 0.8f))
                                        .border(1.dp, theme.border, RoundedCornerShape(20.dp))
                                        .clickable { modelMenuExpanded = true }
                                        .padding(horizontal = 14.dp, vertical = 6.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Text(
                                        text = config.model,
                                        style = MaterialTheme.typography.labelMedium,
                                        fontWeight = FontWeight.Bold,
                                        color = theme.text
                                    )
                                    Icon(
                                        imageVector = Icons.Default.KeyboardArrowDown,
                                        contentDescription = null,
                                        tint = theme.mutedText,
                                        modifier = Modifier.size(14.dp)
                                    )
                                }
                                DropdownMenu(
                                    expanded = modelMenuExpanded,
                                    onDismissRequest = { modelMenuExpanded = false }
                                ) {
                                    val models = providerModels[config.provider].orEmpty()
                                    models.forEach { modelName ->
                                        DropdownMenuItem(
                                            text = { Text(modelName) },
                                            onClick = {
                                                viewModel.saveAgentConfig(
                                                    provider = config.provider,
                                                    model = modelName,
                                                    remoteProjectPath = config.remoteProjectPath,
                                                    systemPrompt = config.systemPrompt,
                                                    accessMode = config.accessMode,
                                                    reasoningEffort = config.reasoningEffort,
                                                    outputLimit = config.outputLimit
                                                )
                                                modelMenuExpanded = false
                                            }
                                        )
                                    }
                                }
                            }
                        },
                        actions = {
                            IconButton(onClick = {
                                viewModel.newChat()
                                panel = MobilePanel.Chat
                            }) {
                                Icon(Icons.Default.Chat, contentDescription = "Neuer Chat", tint = theme.mutedText)
                            }
                        },
                        colors = TopAppBarDefaults.topAppBarColors(
                            containerColor = Color.Transparent,
                            titleContentColor = theme.text,
                            actionIconContentColor = theme.text
                        )
                    )
                },
                bottomBar = {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .navigationBarsPadding()
                            .background(Color.Transparent)
                    ) {
                        if (panel == MobilePanel.Chat) {
                            if (entries.isEmpty()) {
                                val suggestion = "System-Status des VServers prfen"
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(horizontal = 14.dp, vertical = 6.dp),
                                    horizontalArrangement = Arrangement.Center
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(20.dp))
                                            .background(theme.surfaceStrong.copy(alpha = 0.90f))
                                            .border(1.dp, theme.border, RoundedCornerShape(20.dp))
                                            .clickable { prompt = suggestion }
                                            .padding(horizontal = 14.dp, vertical = 8.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Terminal,
                                            contentDescription = null,
                                            tint = theme.accent,
                                            modifier = Modifier.size(16.dp)
                                        )
                                        Text(
                                            text = suggestion,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = theme.text
                                        )
                                    }
                                }
                            }
                            AgentComposer(
                                prompt = prompt,
                                onPromptChange = { prompt = it },
                                isBusy = isBusy,
                                onRun = {
                                    viewModel.sendPrompt(prompt)
                                    prompt = ""
                                },
                                onTest = { viewModel.testServer() },
                                onClearHistory = { viewModel.clearHistory() },
                                onStop = { viewModel.cancelActiveJob() },
                                onVoiceClick = {
                                    android.widget.Toast.makeText(context, "Spracheingabe nicht verfügbar.", android.widget.Toast.LENGTH_SHORT).show()
                                },
                                onVoiceModeClick = {
                                    android.widget.Toast.makeText(context, "Sprachmodus nicht verfügbar.", android.widget.Toast.LENGTH_SHORT).show()
                                },
                                theme = theme,
                                modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp)
                            )
                        }
                    }
                },
                modifier = Modifier.fillMaxSize()
            ) { padding ->
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding)
                ) {
                    when (panel) {
                        MobilePanel.Chat -> {
                            if (entries.isEmpty()) {
                                Column(
                                    modifier = Modifier.fillMaxSize(),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.Center
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(64.dp)
                                            .clip(CircleShape)
                                            .background(theme.surfaceStrong.copy(alpha = 0.80f))
                                            .border(1.dp, theme.accent.copy(alpha = 0.30f), CircleShape),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Terminal,
                                            contentDescription = null,
                                            tint = theme.accent,
                                            modifier = Modifier.size(32.dp)
                                        )
                                    }
                                    Spacer(modifier = Modifier.height(16.dp))
                                    Text(
                                        text = phrases[phraseIndex.value],
                                        style = MaterialTheme.typography.titleLarge,
                                        fontWeight = FontWeight.Bold,
                                        color = theme.text
                                    )
                                    Text(
                                        text = "Frag CodeForge oder steuere deinen Remote-VServer.",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = theme.mutedText,
                                        modifier = Modifier.padding(top = 4.dp)
                                    )
                                }
                            } else {
                                val listState = rememberLazyListState()
                                val reversedEntries = remember(entries) { entries.reversed() }
                                LaunchedEffect(entries.size) {
                                    if (entries.isNotEmpty()) {
                                        listState.animateScrollToItem(entries.size - 1)
                                    }
                                }
                                LazyColumn(
                                    state = listState,
                                    modifier = Modifier.fillMaxSize(),
                                    verticalArrangement = Arrangement.spacedBy(16.dp),
                                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 14.dp)
                                ) {
                                    items(reversedEntries) { entry ->
                                        ChatEntryBubbleStream(entry = entry, theme = theme)
                                    }
                                }
                            }
                        }
                        MobilePanel.Settings -> {
                            LazyColumn(
                                modifier = Modifier.fillMaxSize(),
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 14.dp)
                            ) {
                                item {
                                    SettingsPanel(
                                        viewModel = viewModel,
                                        config = config,
                                        theme = theme,
                                        selectedThemeId = selectedThemeId,
                                        backgroundMediaUri = backgroundMediaUri,
                                        backgroundMediaIsVideo = backgroundMediaIsVideo,
                                        uiTransparency = uiTransparency,
                                        backgroundZoom = backgroundZoom,
                                        backgroundVideoSound = backgroundVideoSound,
                                        onSaveServer = viewModel::saveServerConfig,
                                        onSaveAgent = viewModel::saveAgentConfig,
                                        onTest = { viewModel.testServer() },
                                        onThemeChange = viewModel::saveTheme,
                                        onPickImage = { imagePicker.launch(arrayOf("image/*")) },
                                        onPickVideo = { videoPicker.launch(arrayOf("video/*")) },
                                        onClearBackground = viewModel::clearBackgroundMedia,
                                        onTransparencyChange = viewModel::saveUiTransparency,
                                        onBackgroundZoomChange = viewModel::saveBackgroundZoom,
                                        onBackgroundVideoSoundChange = viewModel::saveBackgroundVideoSound
                                    )
                                }
                            }
                        }
                        MobilePanel.Usage -> {
                            LazyColumn(
                                modifier = Modifier.fillMaxSize(),
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 14.dp)
                            ) {
                                item {
                                    UsagePanel(viewModel, theme)
                                }
                            }
                        }
                    }
                }
            }
            AnimatedNotice(notice = notice, theme = theme, onDismiss = viewModel::clearNotice)
            }
        }
    }
}

private enum class MobilePanel {
    Chat, Settings, Usage
}

@Composable
private fun DrawerMenuItem(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    selected: Boolean,
    theme: CodeForgeMobileTheme,
    onClick: () -> Unit
) {
    TextButton(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(if (selected) theme.surfaceStrong.copy(alpha = 0.85f) else Color.Transparent)
            .padding(horizontal = 4.dp, vertical = 2.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Start
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (selected) theme.accent else theme.mutedText,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Text(
                text = label,
                color = if (selected) theme.text else theme.mutedText,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal
            )
        }
    }
}

@Composable
private fun RecentChatItem(
    chat: ChatSession,
    active: Boolean,
    theme: CodeForgeMobileTheme,
    onSelect: () -> Unit,
    onDelete: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(if (active) theme.surfaceStrong.copy(alpha = 0.5f) else Color.Transparent)
            .clickable { onSelect() }
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = Icons.Default.Chat,
            contentDescription = null,
            tint = if (active) theme.accent else theme.mutedText,
            modifier = Modifier.size(16.dp)
        )
        Spacer(modifier = Modifier.width(12.dp))
        Text(
            text = chat.title,
            color = if (active) theme.text else theme.mutedText,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )
        IconButton(
            onClick = onDelete,
            modifier = Modifier.size(24.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Delete,
                contentDescription = "Lschen",
                tint = theme.mutedText.copy(alpha = 0.6f),
                modifier = Modifier.size(14.dp)
            )
        }
    }
}

@Composable
private fun AgentComposer(
    prompt: String,
    onPromptChange: (String) -> Unit,
    isBusy: Boolean,
    onRun: () -> Unit,
    onTest: () -> Unit,
    onClearHistory: () -> Unit,
    onStop: () -> Unit,
    onVoiceClick: () -> Unit,
    onVoiceModeClick: () -> Unit,
    theme: CodeForgeMobileTheme,
    modifier: Modifier = Modifier
) {
    Card(
        shape = RoundedCornerShape(28.dp),
        colors = CardDefaults.cardColors(containerColor = theme.surfaceStrong.copy(alpha = 0.85f)),
        border = BorderStroke(1.dp, theme.border.copy(alpha = 0.5f)),
        modifier = modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            // Left '+' button
            var expandedMenu by remember { mutableStateOf(false) }
            Box {
                IconButton(onClick = { expandedMenu = true }) {
                    Icon(
                        imageVector = Icons.Default.Add,
                        contentDescription = "Optionen",
                        tint = theme.text,
                        modifier = Modifier.size(24.dp)
                    )
                }
                DropdownMenu(
                    expanded = expandedMenu,
                    onDismissRequest = { expandedMenu = false }
                ) {
                    DropdownMenuItem(
                        text = { Text("Verbindung testen") },
                        onClick = {
                            expandedMenu = false
                            onTest()
                        }
                    )
                    DropdownMenuItem(
                        text = { Text("Chat-Verlauf leeren") },
                        onClick = {
                            expandedMenu = false
                            onClearHistory()
                        }
                    )
                }
            }

            // Text field
            OutlinedTextField(
                value = prompt,
                onValueChange = onPromptChange,
                minLines = 1,
                maxLines = 5,
                placeholder = { Text("CodeForge fragen...") },
                colors = androidx.compose.material3.OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Color.Transparent,
                    unfocusedBorderColor = Color.Transparent,
                    disabledBorderColor = Color.Transparent,
                    errorBorderColor = Color.Transparent,
                    focusedTextColor = theme.text,
                    unfocusedTextColor = theme.text,
                    focusedPlaceholderColor = theme.mutedText,
                    unfocusedPlaceholderColor = theme.mutedText
                ),
                modifier = Modifier.weight(1f)
            )

            // Microphone button
            IconButton(onClick = onVoiceClick) {
                Icon(
                    imageVector = Icons.Default.Mic,
                    contentDescription = "Spracheingabe",
                    tint = theme.mutedText,
                    modifier = Modifier.size(22.dp)
                )
            }

            // Right Send/Waveform/Stop button
            val hasText = prompt.isNotBlank()
            val buttonColor = if (isBusy || (hasText && !isBusy)) theme.accent else Color.Transparent
            val iconTint = if (hasText && !isBusy) theme.surface else theme.mutedText
            IconButton(
                onClick = {
                    if (isBusy) {
                        onStop()
                    } else if (hasText) {
                        onRun()
                    } else {
                        onVoiceModeClick()
                    }
                },
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(buttonColor)
                    .border(
                        1.dp,
                        if (isBusy || (hasText && !isBusy)) Color.Transparent else theme.border,
                        CircleShape
                    )
            ) {
                if (isBusy) {
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .background(theme.surface, shape = RoundedCornerShape(1.5.dp))
                    )
                } else {
                    Icon(
                        imageVector = if (hasText) Icons.Default.ArrowUpward else Icons.Default.GraphicEq,
                        contentDescription = if (hasText) "Senden" else "Sprachmodus",
                        tint = iconTint,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun GreetingPanel(theme: CodeForgeMobileTheme, onSuggestionClick: (String) -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Spacer(modifier = Modifier.height(28.dp))
        Box(
            modifier = Modifier
                .size(64.dp)
                .clip(CircleShape)
                .background(theme.surfaceStrong.copy(alpha = 0.80f))
                .border(1.dp, theme.accent.copy(alpha = 0.30f), CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Default.Terminal,
                contentDescription = null,
                tint = theme.accent,
                modifier = Modifier.size(32.dp)
            )
        }
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Was steht heute an?",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = theme.text
        )
        Text(
            text = "Frag CodeForge oder steuere deinen Remote-VServer.",
            style = MaterialTheme.typography.bodyMedium,
            color = theme.mutedText,
            modifier = Modifier.padding(top = 4.dp, bottom = 24.dp)
        )

        Column(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            val suggestions = listOf(
                "System-Status des VServers prfen",
                "Neues Python-Skript erstellen",
                "Vite Entwicklungs-Server starten",
                "Antigravity CLI testen"
            )
            suggestions.chunked(2).forEach { rowItems ->
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    rowItems.forEach { suggestion ->
                        Card(
                            onClick = { onSuggestionClick(suggestion) },
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = theme.surfaceStrong.copy(alpha = 0.50f)
                            ),
                            border = BorderStroke(1.dp, theme.border),
                            modifier = Modifier
                                .weight(1f)
                                .height(64.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .padding(12.dp),
                                contentAlignment = Alignment.CenterStart
                            ) {
                                Text(
                                    text = suggestion,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = theme.text,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                    }
                }
            }
        }
        Spacer(modifier = Modifier.height(28.dp))
    }
}

@Composable
private fun TypingIndicator(theme: CodeForgeMobileTheme) {
    val transition = rememberInfiniteTransition(label = "typing")
    val dotScale1 by transition.animateFloat(
        initialValue = 0.2f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = keyframes {
                durationMillis = 600
                0.2f at 0
                1f at 150
                0.2f at 300
            },
            repeatMode = RepeatMode.Restart
        ),
        label = "dot1"
    )
    val dotScale2 by transition.animateFloat(
        initialValue = 0.2f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = keyframes {
                durationMillis = 600
                0.2f at 100
                1f at 250
                0.2f at 400
            },
            repeatMode = RepeatMode.Restart
        ),
        label = "dot2"
    )
    val dotScale3 by transition.animateFloat(
        initialValue = 0.2f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = keyframes {
                durationMillis = 600
                0.2f at 200
                1f at 350
                0.2f at 500
            },
            repeatMode = RepeatMode.Restart
        ),
        label = "dot3"
    )

    Row(
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.padding(vertical = 6.dp, horizontal = 2.dp)
    ) {
        val dotColor = theme.accent
        Box(
            modifier = Modifier
                .size(6.dp)
                .graphicsLayer(scaleX = dotScale1, scaleY = dotScale1)
                .clip(CircleShape)
                .background(dotColor)
        )
        Box(
            modifier = Modifier
                .size(6.dp)
                .graphicsLayer(scaleX = dotScale2, scaleY = dotScale2)
                .clip(CircleShape)
                .background(dotColor)
        )
        Box(
            modifier = Modifier
                .size(6.dp)
                .graphicsLayer(scaleX = dotScale3, scaleY = dotScale3)
                .clip(CircleShape)
                .background(dotColor)
        )
    }
}

@Composable
private fun ChatEntryBubbleStream(entry: ChatEntry, theme: CodeForgeMobileTheme) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        // User Message on the right
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(0.85f)
                    .clip(RoundedCornerShape(18.dp, 18.dp, 2.dp, 18.dp))
                    .background(theme.surfaceStrong.copy(alpha = 0.85f))
                    .border(1.dp, theme.border, RoundedCornerShape(18.dp, 18.dp, 2.dp, 18.dp))
                    .padding(12.dp)
            ) {
                Text(
                    text = entry.prompt,
                    style = MaterialTheme.typography.bodyMedium,
                    color = theme.text
                )
            }
        }

        // Assistant Message on the left
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Start
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth(0.92f)
            ) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .background(theme.surfaceStrong.copy(alpha = 0.80f))
                        .border(1.dp, theme.border, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Terminal,
                        contentDescription = null,
                        tint = theme.accent,
                        modifier = Modifier.size(16.dp)
                    )
                }

                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(2.dp, 18.dp, 18.dp, 18.dp))
                        .background(cardColor(theme))
                        .border(
                            1.dp,
                            if (entry.ok) theme.border else Color(0xFFEF4444).copy(alpha = 0.45f),
                            RoundedCornerShape(2.dp, 18.dp, 18.dp, 18.dp)
                        )
                        .padding(14.dp)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        if (!entry.ok) {
                            Text(
                                text = "Fehler",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFFEF4444)
                            )
                        }
                        if (entry.response == "...") {
                            TypingIndicator(theme)
                        } else {
                            FormattedChatMessage(
                                text = entry.response,
                                theme = theme
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ChatsPanel(
    chats: List<ChatSession>,
    activeChatId: String,
    theme: CodeForgeMobileTheme,
    onNewChat: () -> Unit,
    onSelectChat: (String) -> Unit,
    onDeleteChat: (String) -> Unit
) {
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = cardColor(theme)),
        border = BorderStroke(1.dp, borderColor(theme)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text("Chats", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = theme.text)
                    Text("Deine mobilen Agent-Verlaeufe", style = MaterialTheme.typography.bodySmall, color = theme.mutedText)
                }
                IconButton(onClick = onNewChat) {
                    Icon(Icons.Default.Add, contentDescription = "Neuer Chat", tint = theme.accent)
                }
            }
            if (chats.isEmpty()) {
                Text("Noch keine Chats. Starte im Agent-Tab eine Aufgabe.", color = theme.mutedText)
            } else {
                chats.forEach { chat ->
                    ChatRow(
                        chat = chat,
                        active = chat.id == activeChatId,
                        theme = theme,
                        onSelect = { onSelectChat(chat.id) },
                        onDelete = { onDeleteChat(chat.id) }
                    )
                }
            }
        }
    }
}

@Composable
private fun ChatRow(
    chat: ChatSession,
    active: Boolean,
    theme: CodeForgeMobileTheme,
    onSelect: () -> Unit,
    onDelete: () -> Unit
) {
    Card(
        onClick = onSelect,
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (active) theme.surfaceStrong.copy(alpha = 0.90f) else theme.surfaceStrong.copy(alpha = 0.46f)
        ),
        border = BorderStroke(1.dp, if (active) theme.accent.copy(alpha = 0.45f) else theme.border),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Icon(Icons.Default.Chat, contentDescription = null, tint = if (active) theme.accent else theme.mutedText)
            Column(modifier = Modifier.weight(1f)) {
                Text(chat.title, color = theme.text, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    chat.entries.firstOrNull()?.prompt ?: "Leerer Chat",
                    color = theme.mutedText,
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            IconButton(onClick = onDelete) {
                Icon(Icons.Default.Delete, contentDescription = "Chat loeschen", tint = theme.mutedText)
            }
        }
    }
}

private enum class SettingsSection(val label: String) {
    Remote("Remote"),
    Design("Design"),
    Usage("Auslastung")
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SettingsPanel(
    viewModel: CodeForgeMobileViewModel,
    config: RemoteConfig,
    theme: CodeForgeMobileTheme,
    selectedThemeId: String,
    backgroundMediaUri: String,
    backgroundMediaIsVideo: Boolean,
    uiTransparency: Int,
    backgroundZoom: Int,
    backgroundVideoSound: Boolean,
    onSaveServer: (String, String) -> Unit,
    onSaveAgent: (String, String, String, String, String, String, Int) -> Unit,
    onTest: () -> Unit,
    onThemeChange: (String) -> Unit,
    onPickImage: () -> Unit,
    onPickVideo: () -> Unit,
    onClearBackground: () -> Unit,
    onTransparencyChange: (Int) -> Unit,
    onBackgroundZoomChange: (Int) -> Unit,
    onBackgroundVideoSoundChange: (Boolean) -> Unit
) {
    var section by remember { mutableStateOf(SettingsSection.Remote) }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Card(
            shape = RoundedCornerShape(14.dp),
            colors = CardDefaults.cardColors(containerColor = cardColor(theme)),
            border = BorderStroke(1.dp, borderColor(theme)),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Settings", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = theme.text)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    SettingsSection.values().forEach { item ->
                        FilterChip(
                            selected = section == item,
                            onClick = { section = item },
                            label = { Text(item.label) },
                            leadingIcon = if (section == item) {
                                { Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(16.dp)) }
                            } else {
                                null
                            }
                        )
                    }
                }
            }
        }
        when (section) {
            SettingsSection.Remote -> RemoteSettingsPanel(
                config = config,
                theme = theme,
                onSaveServer = onSaveServer,
                onSaveAgent = onSaveAgent,
                onTest = onTest
            )
            SettingsSection.Design -> ThemePanel(
                selectedThemeId = selectedThemeId,
                theme = theme,
                backgroundMediaUri = backgroundMediaUri,
                backgroundMediaIsVideo = backgroundMediaIsVideo,
                uiTransparency = uiTransparency,
                backgroundZoom = backgroundZoom,
                backgroundVideoSound = backgroundVideoSound,
                onThemeChange = onThemeChange,
                onPickImage = onPickImage,
                onPickVideo = onPickVideo,
                onClearBackground = onClearBackground,
                onTransparencyChange = onTransparencyChange,
                onBackgroundZoomChange = onBackgroundZoomChange,
                onBackgroundVideoSoundChange = onBackgroundVideoSoundChange
            )
            SettingsSection.Usage -> UsagePanel(viewModel, theme)
        }
    }
}

@Composable
private fun RemoteSettingsPanel(
    config: RemoteConfig,
    theme: CodeForgeMobileTheme,
    onSaveServer: (String, String) -> Unit,
    onSaveAgent: (String, String, String, String, String, String, Int) -> Unit,
    onTest: () -> Unit
) {
    var serverUrl by remember(config.serverUrl) { mutableStateOf(config.serverUrl) }
    var token by remember(config.serverToken) { mutableStateOf(config.serverToken) }
    var provider by remember(config.provider) { mutableStateOf(config.provider) }
    var model by remember(config.model) { mutableStateOf(config.model) }
    var projectPath by remember(config.remoteProjectPath) { mutableStateOf(config.remoteProjectPath) }
    var systemPrompt by remember(config.systemPrompt) { mutableStateOf(config.systemPrompt) }
    var accessMode by remember(config.accessMode) { mutableStateOf(config.accessMode) }
    var reasoningEffort by remember(config.reasoningEffort) { mutableStateOf(config.reasoningEffort) }
    var outputLimit by remember(config.outputLimit) { mutableStateOf(config.outputLimit.toString()) }

    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = cardColor(theme)),
        border = BorderStroke(1.dp, borderColor(theme)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("VServer-Verbindung", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = theme.text)
            OutlinedTextField(
                value = serverUrl,
                onValueChange = { serverUrl = it },
                label = { Text("Remote-API URL") },
                placeholder = { Text("https://dein-server.de:8787") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = token,
                onValueChange = { token = it },
                label = { Text("API-Token") },
                visualTransformation = PasswordVisualTransformation(),
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                OutlinedButton(onClick = onTest, modifier = Modifier.weight(1f)) {
                    Text("Testen")
                }
                Button(onClick = { onSaveServer(serverUrl, token) }, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Default.Save, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Speichern")
                }
            }

            HorizontalDivider()
            Text("Agent", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = theme.text)
            DropdownField("Provider", provider, providers) {
                provider = it
                val options = providerModels[it].orEmpty()
                if (model !in options) model = options.firstOrNull() ?: model
            }
            DropdownField("Modell", model, providerModels[provider].orEmpty().ifEmpty { listOf(model) }) { model = it }
            OutlinedTextField(
                value = projectPath,
                onValueChange = { projectPath = it },
                label = { Text("Remote-Projektpfad auf Debian") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            DropdownField("Zugriff", accessMode, accessModes) { accessMode = it }
            DropdownField("Reasoning", reasoningEffort, reasoningModes) { reasoningEffort = it }
            OutlinedTextField(
                value = outputLimit,
                onValueChange = { outputLimit = it.filter(Char::isDigit).take(5) },
                label = { Text("Max. Antwortzeichen") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = systemPrompt,
                onValueChange = { systemPrompt = it },
                label = { Text("System-Prompt") },
                minLines = 4,
                modifier = Modifier.fillMaxWidth()
            )
            Button(
                onClick = {
                    onSaveAgent(
                        provider,
                        model,
                        projectPath,
                        systemPrompt,
                        accessMode,
                        reasoningEffort,
                        outputLimit.toIntOrNull() ?: 12000
                    )
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Agent-Konfiguration speichern")
            }
        }
    }
}

@Composable
private fun DropdownField(label: String, value: String, options: List<String>, onChange: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(label)
                Text(value, fontWeight = FontWeight.Bold)
            }
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { option ->
                DropdownMenuItem(
                    text = { Text(option) },
                    onClick = {
                        onChange(option)
                        expanded = false
                    }
                )
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ThemePanel(
    selectedThemeId: String,
    theme: CodeForgeMobileTheme,
    backgroundMediaUri: String,
    backgroundMediaIsVideo: Boolean,
    uiTransparency: Int,
    backgroundZoom: Int,
    backgroundVideoSound: Boolean,
    onThemeChange: (String) -> Unit,
    onPickImage: () -> Unit,
    onPickVideo: () -> Unit,
    onClearBackground: () -> Unit,
    onTransparencyChange: (Int) -> Unit,
    onBackgroundZoomChange: (Int) -> Unit,
    onBackgroundVideoSoundChange: (Boolean) -> Unit
) {
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = cardColor(theme)),
        border = BorderStroke(1.dp, borderColor(theme)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("Theme Gallery", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = theme.text)
            Text(
                "Dieselben Presets wie in der Desktop-App. Die Mobile-Funktionen bleiben unveraendert.",
                style = MaterialTheme.typography.bodySmall,
                color = theme.mutedText
            )
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                CodeForgeMobileThemes.forEach { item ->
                    FilterChip(
                        selected = selectedThemeId == item.id,
                        onClick = { onThemeChange(item.id) },
                        label = { Text(item.label) },
                        leadingIcon = {
                            Box(
                                modifier = Modifier
                                    .size(16.dp)
                                    .clip(CircleShape)
                                    .background(Brush.linearGradient(item.background))
                                    .border(1.dp, item.border, CircleShape)
                            )
                        }
                    )
                }
            }
            Card(
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = theme.surfaceStrong.copy(alpha = 0.82f)),
                border = BorderStroke(1.dp, theme.border)
            ) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        ThemeSwatch(theme)
                        Column {
                            Text(theme.label, fontWeight = FontWeight.Bold, color = theme.text)
                            Text(theme.mood, style = MaterialTheme.typography.bodySmall, color = theme.mutedText)
                        }
                    }
                    Text(
                        "Aktiv fuer PIN, Remote, Agent, Tutorial, Status und Verlauf.",
                        style = MaterialTheme.typography.bodySmall,
                        color = theme.mutedText
                    )
                }
            }
            HorizontalDivider(color = theme.border)
            Text("Transparenz", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = theme.text)
            Text(
                "$uiTransparency% durchsichtig",
                style = MaterialTheme.typography.bodySmall,
                color = theme.mutedText
            )
            Slider(
                value = uiTransparency.toFloat(),
                onValueChange = { onTransparencyChange(it.toInt()) },
                valueRange = 0f..85f
            )
            Text("Hintergrund-Zoom", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = theme.text)
            Text(
                "$backgroundZoom%",
                style = MaterialTheme.typography.bodySmall,
                color = theme.mutedText
            )
            Slider(
                value = backgroundZoom.toFloat(),
                onValueChange = { onBackgroundZoomChange(it.toInt()) },
                valueRange = 100f..270f
            )
            HorizontalDivider(color = theme.border)
            Text("Hintergrund", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = theme.text)
            Text(
                if (backgroundMediaUri.isBlank()) "Aktuell nutzt die App nur den Theme-Verlauf." else if (backgroundMediaIsVideo) "Video-Hintergrund aktiv." else "Foto-Hintergrund aktiv.",
                style = MaterialTheme.typography.bodySmall,
                color = theme.mutedText
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                OutlinedButton(onClick = onPickImage, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Default.Palette, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Foto")
                }
                OutlinedButton(onClick = onPickVideo, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Default.VideoLibrary, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Video")
                }
            }
            if (backgroundMediaUri.isNotBlank()) {
                if (backgroundMediaIsVideo) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Video-Sound", fontWeight = FontWeight.Bold, color = theme.text)
                            Text("Ton fuer den Hintergrund anlassen.", style = MaterialTheme.typography.bodySmall, color = theme.mutedText)
                        }
                        Switch(checked = backgroundVideoSound, onCheckedChange = onBackgroundVideoSoundChange)
                    }
                }
                TextButton(onClick = onClearBackground) {
                    Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Hintergrund entfernen")
                }
            }
        }
    }
}

@Composable
private fun ThemeSwatch(theme: CodeForgeMobileTheme) {
    Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        theme.background.take(3).forEach { color ->
            Box(
                modifier = Modifier
                    .size(18.dp)
                    .clip(CircleShape)
                    .background(color)
                    .border(1.dp, theme.border, CircleShape)
            )
        }
    }
}@Composable
private fun UsagePanel(viewModel: CodeForgeMobileViewModel, theme: CodeForgeMobileTheme) {
    val usageText by viewModel.usageText.collectAsStateWithLifecycle()
    val isBusy by viewModel.isBusy.collectAsStateWithLifecycle()

    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = cardColor(theme)),
        border = BorderStroke(1.dp, borderColor(theme)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text("System-Auslastung", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = theme.text)
                    Text("Ressourcen-Nutzung deines VServers", style = MaterialTheme.typography.bodySmall, color = theme.mutedText)
                }
                IconButton(onClick = { viewModel.fetchUsage() }, enabled = !isBusy) {
                    Icon(
                        imageVector = Icons.Default.Refresh,
                        contentDescription = "Aktualisieren",
                        tint = theme.accent
                    )
                }
            }

            if (usageText.isBlank()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(120.dp)
                        .clickable { viewModel.fetchUsage() },
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(Icons.Default.Terminal, contentDescription = null, tint = theme.mutedText, modifier = Modifier.size(32.dp))
                        Text("Hier tippen, um Auslastung abzufragen", style = MaterialTheme.typography.bodyMedium, color = theme.mutedText)
                    }
                }
            } else {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .background(theme.surfaceStrong.copy(alpha = 0.5f))
                        .border(1.dp, theme.border, RoundedCornerShape(8.dp))
                        .padding(12.dp)
                ) {
                    if (isBusy && usageText == "Lade Auslastungsdaten...") {
                        Box(modifier = Modifier.fillMaxWidth().height(100.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = theme.accent)
                        }
                    } else {
                        Text(
                            text = usageText,
                            style = MaterialTheme.typography.bodySmall.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace),
                            color = theme.text
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StatusCard(message: String, isBusy: Boolean, theme: CodeForgeMobileTheme, onDismiss: () -> Unit) {
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = cardColor(theme)),
        border = BorderStroke(1.dp, borderColor(theme)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            if (isBusy) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
            } else {
                Icon(Icons.Default.Info, contentDescription = null, tint = theme.accent)
            }
            Text(message, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, color = theme.text)
            IconButton(onClick = onDismiss) {
                Icon(Icons.Default.Close, contentDescription = "Schliessen", tint = theme.mutedText)
            }
        }
    }
}

@Composable
private fun ChatEntryCard(entry: ChatEntry, theme: CodeForgeMobileTheme) {
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = cardColor(theme)),
        border = BorderStroke(1.dp, if (entry.ok) Color(0xFF22C55E).copy(alpha = 0.35f) else Color(0xFFEF4444).copy(alpha = 0.45f)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Aufgabe", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
            Text(entry.prompt, style = MaterialTheme.typography.bodyMedium, color = theme.text)
            HorizontalDivider()
            Text(if (entry.ok) "Antwort" else "Fehler", style = MaterialTheme.typography.labelMedium, color = if (entry.ok) Color(0xFF22C55E) else Color(0xFFEF4444))
            Text(entry.response, style = MaterialTheme.typography.bodySmall, color = theme.text)
        }
    }
}

@Composable
private fun AnimatedNotice(notice: UiNotice?, theme: CodeForgeMobileTheme, onDismiss: () -> Unit) {
    AnimatedVisibility(
        visible = notice != null,
        enter = slideInVertically(initialOffsetY = { it / 4 }) + fadeIn(),
        exit = slideOutVertically(targetOffsetY = { it / 4 }) + fadeOut(),
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp)
    ) {
        val current = notice ?: return@AnimatedVisibility
        val accent = if (current.success) Color(0xFF22C55E) else Color(0xFFEF4444)
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Card(
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(containerColor = cardColor(theme)),
                border = BorderStroke(1.dp, accent.copy(alpha = 0.55f)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Icon(Icons.Default.CheckCircle, contentDescription = null, tint = accent, modifier = Modifier.size(40.dp))
                    Text(if (current.success) "Erfolgreich" else "Fehler", fontWeight = FontWeight.Bold, color = theme.text, style = MaterialTheme.typography.titleLarge)
                    Text(current.message, style = MaterialTheme.typography.bodyMedium, color = theme.mutedText)
                    Button(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
                        Text("OK")
                    }
                }
            }
        }
    }
}

@Composable
private fun MediaBackdrop(uriString: String, isVideo: Boolean, zoom: Int, soundEnabled: Boolean) {
    if (uriString.isBlank()) return
    val scale = (zoom.coerceIn(100, 270) / 100f)
    if (isVideo) {
        AndroidView(
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer(scaleX = scale, scaleY = scale),
            factory = { context ->
                VideoView(context).apply {
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    setVideoURI(Uri.parse(uriString))
                    setOnPreparedListener { player ->
                        player.isLooping = true
                        val volume = if (soundEnabled) 1f else 0f
                        player.setVolume(volume, volume)
                        start()
                    }
                }
            },
            update = { view ->
                val nextUri = Uri.parse(uriString)
                val nextTag = "$uriString|$soundEnabled"
                if (view.tag != nextTag) {
                    view.tag = nextTag
                    view.setVideoURI(nextUri)
                    view.start()
                }
            }
        )
    } else {
        val context = LocalContext.current
        var bitmap by remember(uriString) { mutableStateOf<androidx.compose.ui.graphics.ImageBitmap?>(null) }
        LaunchedEffect(uriString) {
            bitmap = withContext(Dispatchers.IO) {
                runCatching {
                    context.contentResolver.openInputStream(Uri.parse(uriString))?.use { stream ->
                        BitmapFactory.decodeStream(stream)?.asImageBitmap()
                    }
                }.getOrNull()
            }
        }
        bitmap?.let {
            Image(
                bitmap = it,
                contentDescription = null,
                modifier = Modifier
                    .fillMaxSize()
                    .graphicsLayer(scaleX = scale, scaleY = scale),
                contentScale = ContentScale.Crop
            )
        }
    }
}

@Composable
private fun cardColor(theme: CodeForgeMobileTheme): Color {
    val alpha = 1f - (LocalUiTransparency.current.coerceIn(0, 85) / 100f)
    return theme.surface.copy(alpha = alpha.coerceIn(0.15f, 0.96f))
}

private fun borderColor(theme: CodeForgeMobileTheme): Color {
    return theme.border
}

private fun appBackground(theme: CodeForgeMobileTheme): Brush {
    return Brush.verticalGradient(theme.background)
}
