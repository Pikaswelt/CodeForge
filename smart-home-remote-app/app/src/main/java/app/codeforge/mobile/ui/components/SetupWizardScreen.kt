package app.codeforge.mobile.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Terminal
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.codeforge.mobile.CodeForgeMobileViewModel
import app.codeforge.mobile.ui.theme.CodeForgeMobileTheme
import app.codeforge.mobile.ui.theme.CodeForgeMobileThemes
import app.codeforge.mobile.ui.theme.mobileThemeById

@Composable
fun SetupWizardScreen(
    viewModel: CodeForgeMobileViewModel
) {
    val selectedThemeId by viewModel.selectedThemeId.collectAsStateWithLifecycle()
    val config by viewModel.remoteConfig.collectAsStateWithLifecycle()
    val theme = mobileThemeById(selectedThemeId)

    var step by remember { mutableStateOf(0) }
    var setupServerUrl by remember { mutableStateOf(config.serverUrl) }
    var setupToken by remember { mutableStateOf(config.serverToken) }
    var setupProjectPath by remember { mutableStateOf(config.remoteProjectPath) }
    var setupSystemPrompt by remember { mutableStateOf(config.systemPrompt) }
    var setupProvider by remember { mutableStateOf(config.provider) }
    var setupModel by remember { mutableStateOf(config.model) }
    var setupAccessMode by remember { mutableStateOf(config.accessMode) }
    var setupReasoning by remember { mutableStateOf(config.reasoningEffort) }
    var setupOutputLimit by remember { mutableStateOf(config.outputLimit) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(appBackground(theme)),
        contentAlignment = Alignment.BottomCenter
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.Center
        ) {
            // Logo/Title
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .clip(CircleShape)
                        .background(theme.surfaceStrong)
                        .border(1.dp, theme.accent.copy(alpha = 0.3f), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Terminal,
                        contentDescription = null,
                        tint = theme.accent,
                        modifier = Modifier.size(28.dp)
                    )
                }
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "CodeForge Mobile einrichten",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = theme.text
                )
                Text(
                    text = "Schritt ${step + 1} von 3",
                    style = MaterialTheme.typography.bodySmall,
                    color = theme.mutedText
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Step indicator
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                for (s in 0..2) {
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .clip(CircleShape)
                            .background(
                                if (s <= step) theme.accent else theme.surfaceStrong
                            )
                    )
                    if (s < 2) {
                        Box(
                            modifier = Modifier
                                .width(40.dp)
                                .height(2.dp)
                                .background(
                                    if (s < step) theme.accent.copy(alpha = 0.5f) else theme.surfaceStrong
                                )
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            when (step) {
                0 -> {
                    // Step 1: Server connection
                    Card(
                        shape = RoundedCornerShape(14.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = theme.surface.copy(alpha = 0.85f)
                        ),
                        border = BorderStroke(1.dp, theme.border),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(20.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Text(
                                text = "VServer-Verbindung",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = theme.text
                            )
                            Text(
                                text = "Gib die URL und den Token deines CodeForge Remote Servers ein.",
                                style = MaterialTheme.typography.bodySmall,
                                color = theme.mutedText
                            )
                            OutlinedTextField(
                                value = setupServerUrl,
                                onValueChange = { setupServerUrl = it },
                                label = { Text("Server-URL") },
                                placeholder = { Text("http://dein-server.de:8787") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth()
                            )
                            OutlinedTextField(
                                value = setupToken,
                                onValueChange = { setupToken = it },
                                label = { Text("API-Token") },
                                visualTransformation = PasswordVisualTransformation(),
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth()
                            )
                            Button(
                                onClick = {
                                    viewModel.saveServerConfig(setupServerUrl, setupToken)
                                    step = 1
                                },
                                modifier = Modifier.fillMaxWidth(),
                                enabled = setupServerUrl.isNotBlank() && setupToken.isNotBlank()
                            ) {
                                Text("Weiter")
                            }
                        }
                    }
                }

                1 -> {
                    // Step 2: Agent config
                    Card(
                        shape = RoundedCornerShape(14.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = theme.surface.copy(alpha = 0.85f)
                        ),
                        border = BorderStroke(1.dp, theme.border),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(20.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Text(
                                text = "Agent-Konfiguration",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = theme.text
                            )
                            Text(
                                text = "Projektpfad auf dem Server und System-Prompt festlegen.",
                                style = MaterialTheme.typography.bodySmall,
                                color = theme.mutedText
                            )
                            OutlinedTextField(
                                value = setupProjectPath,
                                onValueChange = { setupProjectPath = it },
                                label = { Text("Remote-Projektpfad") },
                                placeholder = { Text("/root/codeforge-project") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth()
                            )
                            val providers = listOf("openai", "antigravity", "anthropic", "cursor", "opencode")
                            var providerExpanded by remember { mutableStateOf(false) }
                            Box {
                                OutlinedTextField(
                                    value = setupProvider,
                                    onValueChange = {},
                                    label = { Text("Provider") },
                                    readOnly = true,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { providerExpanded = true },
                                    trailingIcon = {
                                        Icon(Icons.Default.Check, contentDescription = null, tint = theme.accent)
                                    }
                                )
                                DropdownMenu(
                                    expanded = providerExpanded,
                                    onDismissRequest = { providerExpanded = false }
                                ) {
                                    providers.forEach { p ->
                                        DropdownMenuItem(
                                            text = { Text(p) },
                                            onClick = {
                                                setupProvider = p
                                                val defaultModels = mapOf(
                                                    "openai" to "gpt-5.5",
                                                    "antigravity" to "Gemini 3.5 Flash (Medium)",
                                                    "anthropic" to "claude-sonnet-4-6",
                                                    "cursor" to "default",
                                                    "opencode" to "default"
                                                )
                                                setupModel = defaultModels[p] ?: setupModel
                                                providerExpanded = false
                                            }
                                        )
                                    }
                                }
                            }
                            OutlinedTextField(
                                value = setupSystemPrompt,
                                onValueChange = { setupSystemPrompt = it },
                                label = { Text("System-Prompt") },
                                minLines = 3,
                                modifier = Modifier.fillMaxWidth()
                            )
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Button(
                                    onClick = { step = 0 },
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Text("Zurück")
                                }
                                Button(
                                    onClick = {
                                        viewModel.saveAgentConfig(
                                            provider = setupProvider,
                                            model = setupModel,
                                            remoteProjectPath = setupProjectPath,
                                            systemPrompt = setupSystemPrompt,
                                            accessMode = setupAccessMode,
                                            reasoningEffort = setupReasoning,
                                            outputLimit = setupOutputLimit
                                        )
                                        step = 2
                                    },
                                    modifier = Modifier.weight(1f),
                                    enabled = setupProjectPath.isNotBlank()
                                ) {
                                    Text("Weiter")
                                }
                            }
                        }
                    }
                }

                2 -> {
                    // Step 3: Theme selection and finish
                    Card(
                        shape = RoundedCornerShape(14.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = theme.surface.copy(alpha = 0.85f)
                        ),
                        border = BorderStroke(1.dp, theme.border),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(20.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Text(
                                text = "Design auswählen",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = theme.text
                            )
                            Text(
                                text = "Wähle dein Lieblings-Design für die App.",
                                style = MaterialTheme.typography.bodySmall,
                                color = theme.mutedText
                            )

                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(240.dp)
                                    .verticalScroll(rememberScrollState()),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                CodeForgeMobileThemes.forEach { t ->
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clip(RoundedCornerShape(10.dp))
                                            .background(
                                                if (t.id == selectedThemeId) theme.surfaceStrong
                                                else Color.Transparent
                                            )
                                            .clickable { viewModel.saveTheme(t.id) }
                                            .padding(10.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                                    ) {
                                        Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                                            t.background.take(3).forEach { color ->
                                                Box(
                                                    modifier = Modifier
                                                        .size(14.dp)
                                                        .clip(CircleShape)
                                                        .background(color)
                                                        .border(1.dp, t.border, CircleShape)
                                                )
                                            }
                                        }
                                        Text(
                                            text = t.label,
                                            color = if (t.id == selectedThemeId) theme.text else theme.mutedText,
                                            fontWeight = if (t.id == selectedThemeId) FontWeight.Bold else FontWeight.Normal,
                                            fontSize = 13.sp,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                            modifier = Modifier.weight(1f)
                                        )
                                        if (t.id == selectedThemeId) {
                                            Icon(
                                                imageVector = Icons.Default.CheckCircle,
                                                contentDescription = null,
                                                tint = theme.accent,
                                                modifier = Modifier.size(18.dp)
                                            )
                                        }
                                    }
                                }
                            }

                            HorizontalDivider(color = theme.border)
                            Text(
                                text = "Du kannst alle Einstellungen jederzeit im Menü anpassen.",
                                style = MaterialTheme.typography.bodySmall,
                                color = theme.mutedText
                            )

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Button(
                                    onClick = { step = 1 },
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Text("Zurück")
                                }
                                Button(
                                    onClick = { viewModel.completeSetup() },
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Einrichtung abschliessen")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun appBackground(theme: CodeForgeMobileTheme): Brush {
    return Brush.verticalGradient(theme.background)
}
