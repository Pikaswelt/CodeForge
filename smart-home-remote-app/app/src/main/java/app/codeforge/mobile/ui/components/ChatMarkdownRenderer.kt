package app.codeforge.mobile.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.codeforge.mobile.ui.theme.CodeForgeMobileTheme

@Composable
fun FormattedChatMessage(
    text: String,
    theme: CodeForgeMobileTheme,
    modifier: Modifier = Modifier
) {
    val blocks = remember(text) { parseMarkdownBlocks(text) }
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        blocks.forEach { block ->
            when (block) {
                is MarkdownBlock.Text -> {
                    val rendered = renderInlineMarkdown(block.content, theme)
                    Text(
                        text = rendered,
                        color = theme.text,
                        style = androidx.compose.material3.MaterialTheme.typography.bodyMedium
                    )
                }
                is MarkdownBlock.CodeBlock -> {
                    CodeBlock(block, theme)
                }
                is MarkdownBlock.DiffBlock -> {
                    DiffBlock(block, theme)
                }
                is MarkdownBlock.Divider -> {
                    HorizontalDivider(color = theme.border.copy(alpha = 0.3f))
                }
            }
        }
    }
}

private sealed class MarkdownBlock {
    data class Text(val content: String) : MarkdownBlock()
    data class CodeBlock(val language: String, val code: String) : MarkdownBlock()
    data class DiffBlock(val content: String) : MarkdownBlock()
    data object Divider : MarkdownBlock()
}

private fun parseMarkdownBlocks(text: String): List<MarkdownBlock> {
    val blocks = mutableListOf<MarkdownBlock>()
    val lines = text.split("\n")
    var i = 0

    while (i < lines.size) {
        val line = lines[i]

        // Code fences
        if (line.trimStart().startsWith("```")) {
            val fenceMatch = Regex("^\\s*```(\\w*)").find(line.trimStart())
            val language = fenceMatch?.groupValues?.getOrNull(1)?.take(20) ?: ""
            val codeLines = mutableListOf<String>()
            i++
            var foundClosing = false
            while (i < lines.size) {
                if (lines[i].trimStart().startsWith("```")) {
                    foundClosing = true
                    i++
                    break
                }
                codeLines.add(lines[i])
                i++
            }
            val code = codeLines.joinToString("\n")
            if (code.isNotBlank()) {
                if (language == "diff" || code.startsWith("diff --git") || code.contains("\ndiff --git")) {
                    blocks.add(MarkdownBlock.DiffBlock(code))
                } else {
                    blocks.add(MarkdownBlock.CodeBlock(language, code))
                }
            }
            continue
        }

        // Horizontal rules
        if (line.trim().matches(Regex("^-{3,}$|^_{3,}$|^\\*{3,}$"))) {
            if (blocks.isNotEmpty()) blocks.add(MarkdownBlock.Divider)
            i++
            continue
        }

        // Empty lines - skip
        if (line.trim().isEmpty()) {
            i++
            continue
        }

        // Regular text - collect consecutive non-empty non-fence lines
        val textLines = mutableListOf<String>()
        while (i < lines.size) {
            val current = lines[i]
            if (current.trimStart().startsWith("```") || current.trim().matches(Regex("^-{3,}$|^_{3,}$|^\\*{3,}$"))) {
                break
            }
            if (current.trim().isNotEmpty()) {
                textLines.add(current)
            }
            i++
        }
        if (textLines.isNotEmpty()) {
            blocks.add(MarkdownBlock.Text(textLines.joinToString("\n")))
        }
    }

    return blocks
}

@Composable
private fun renderInlineMarkdown(text: String, theme: CodeForgeMobileTheme): androidx.compose.ui.text.AnnotatedString {
    return buildAnnotatedString {
        var pos = 0
        val len = text.length

        while (pos < len) {
            // Bold **text**
            if (pos + 1 < len && text[pos] == '*' && text[pos + 1] == '*') {
                val end = text.indexOf("**", pos + 2)
                if (end != -1 && end > pos + 2) {
                    val boldText = text.substring(pos + 2, end)
                    withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = theme.text)) {
                        append(boldText)
                    }
                    pos = end + 2
                    continue
                }
            }

            // Italic *text*
            if (text[pos] == '*' && (pos + 1 >= len || text[pos + 1] != '*')) {
                val end = text.indexOf('*', pos + 1)
                if (end != -1 && end > pos + 1) {
                    val italicText = text.substring(pos + 1, end)
                    withStyle(SpanStyle(
                        fontStyle = androidx.compose.ui.text.font.FontStyle.Italic,
                        color = theme.text
                    )) {
                        append(italicText)
                    }
                    pos = end + 1
                    continue
                }
            }

            // Inline `code` (single backtick)
            if (text[pos] == '`') {
                val end = text.indexOf('`', pos + 1)
                if (end != -1 && end > pos + 1) {
                    val code = text.substring(pos + 1, end)
                    withStyle(SpanStyle(
                        fontFamily = FontFamily.Monospace,
                        background = theme.surfaceStrong.copy(alpha = 0.6f),
                        color = theme.accent,
                        fontSize = 14.sp
                    )) {
                        append(code)
                    }
                    pos = end + 1
                    continue
                }
            }

            // Normal character
            withStyle(SpanStyle(color = theme.text)) {
                append(text[pos].toString())
            }
            pos++
        }
    }
}

@Composable
private fun CodeBlock(block: MarkdownBlock.CodeBlock, theme: CodeForgeMobileTheme) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(theme.surfaceStrong.copy(alpha = 0.5f))
            .border(1.dp, theme.border, RoundedCornerShape(10.dp))
    ) {
        if (block.language.isNotBlank()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(theme.surfaceStrong.copy(alpha = 0.3f))
                    .padding(horizontal = 10.dp, vertical = 4.dp)
            ) {
                Text(
                    text = block.language,
                    color = theme.accent,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(10.dp)
        ) {
            Text(
                text = block.code,
                color = theme.text,
                fontFamily = FontFamily.Monospace,
                fontSize = 12.sp,
                lineHeight = 18.sp
            )
        }
    }
}

@Composable
private fun DiffBlock(block: MarkdownBlock.DiffBlock, theme: CodeForgeMobileTheme) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(Color(0xFF1D1D1F))
            .border(1.dp, theme.border, RoundedCornerShape(10.dp))
    ) {
        val lines = block.content.split("\n")
        val scrollState = rememberScrollState()
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(scrollState)
                .padding(0.dp)
        ) {
            lines.forEachIndexed { index, line ->
                val bgColor = when {
                    line.startsWith("+") && !line.startsWith("+++") -> Color(0xFF166534).copy(alpha = 0.25f)
                    line.startsWith("-") && !line.startsWith("---") -> Color(0xFF991B1B).copy(alpha = 0.25f)
                    line.startsWith("@@") -> Color(0xFF1E3A5F).copy(alpha = 0.3f)
                    line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++") -> Color.Black.copy(alpha = 0.2f)
                    else -> Color.Transparent
                }
                val textColor = when {
                    line.startsWith("+") && !line.startsWith("+++") -> Color(0xFF86EFAC)
                    line.startsWith("-") && !line.startsWith("---") -> Color(0xFFFCA5A5)
                    line.startsWith("@@") -> Color(0xFF93C5FD)
                    else -> Color(0xFFD4D4D8)
                }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(bgColor)
                        .padding(horizontal = 8.dp, vertical = 1.dp)
                ) {
                    Text(
                        text = "%3d".format(index + 1),
                        color = Color(0xFF52525B),
                        fontFamily = FontFamily.Monospace,
                        fontSize = 11.sp,
                        modifier = Modifier.width(28.dp)
                    )
                    Text(
                        text = line.ifEmpty { " " },
                        color = textColor,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 11.sp,
                        lineHeight = 16.sp
                    )
                }
            }
        }
    }
}
