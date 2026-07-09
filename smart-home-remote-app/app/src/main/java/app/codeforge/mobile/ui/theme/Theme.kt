package app.codeforge.mobile.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext

import androidx.compose.ui.graphics.Color

private val DarkColorScheme =
  darkColorScheme(
    primary = Color(0xFFD0BCFF),
    onPrimary = Color(0xFF381E72),
    primaryContainer = Color(0xFF4F378B),
    onPrimaryContainer = Color(0xFFEADDFF),
    background = Color(0xFF0F111A), // deep space dark navy
    onBackground = Color(0xFFE3E2E6),
    surface = Color(0xFF1E2235), // Card darker background
    onSurface = Color(0xFFE3E2E6),
    surfaceVariant = Color(0xFF2A2D3D),
    onSurfaceVariant = Color(0xFFCAC4D0),
    outline = Color(0xFF4F526B),
    outlineVariant = Color(0xFFD0BCFF)
  )

private val LightColorScheme =
  lightColorScheme(
    primary = PrimaryColor,
    onPrimary = OnPrimaryColor,
    primaryContainer = PrimaryContainerColor,
    onPrimaryContainer = OnPrimaryContainerColor,
    background = BackgroundColor,
    onBackground = OnBackgroundColor,
    surface = SurfaceColor,
    onSurface = OnSurfaceColor,
    surfaceVariant = SurfaceVariantColor,
    onSurfaceVariant = OnSurfaceVariantColor,
    outline = OutlineColor,
    outlineVariant = OutlineVariantColor
  )

@Composable
fun MyApplicationTheme(
  darkTheme: Boolean = isSystemInDarkTheme(),
  themeId: String = "modern-dark",
  // Dynamic color is available on Android 12+
  dynamicColor: Boolean = false, // Disable dynamic color to match design exactly
  content: @Composable () -> Unit,
) {
  val mobileTheme = mobileThemeById(themeId)
  val colorScheme =
    if (mobileTheme.isDark) {
      darkColorScheme(
        primary = mobileTheme.accent,
        onPrimary = if (mobileTheme.isDark) Color.Black else Color.White,
        primaryContainer = mobileTheme.surfaceStrong,
        onPrimaryContainer = mobileTheme.text,
        background = mobileTheme.background.last(),
        onBackground = mobileTheme.text,
        surface = mobileTheme.surface,
        onSurface = mobileTheme.text,
        surfaceVariant = mobileTheme.surfaceStrong,
        onSurfaceVariant = mobileTheme.mutedText,
        outline = mobileTheme.border,
        outlineVariant = mobileTheme.accent.copy(alpha = 0.35f)
      )
    } else {
      lightColorScheme(
        primary = mobileTheme.accent,
        onPrimary = Color.White,
        primaryContainer = mobileTheme.surfaceStrong,
        onPrimaryContainer = mobileTheme.text,
        background = mobileTheme.background.last(),
        onBackground = mobileTheme.text,
        surface = mobileTheme.surface,
        onSurface = mobileTheme.text,
        surfaceVariant = mobileTheme.surfaceStrong,
        onSurfaceVariant = mobileTheme.mutedText,
        outline = mobileTheme.border,
        outlineVariant = mobileTheme.accent.copy(alpha = 0.35f)
      )
    }

  MaterialTheme(colorScheme = colorScheme, typography = Typography, content = content)
}
