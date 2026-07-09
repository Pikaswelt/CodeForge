package app.codeforge.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.codeforge.mobile.ui.screens.DashboardScreen
import app.codeforge.mobile.ui.theme.MyApplicationTheme

class MainActivity : ComponentActivity() {
    private val viewModel: CodeForgeMobileViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val selectedThemeId by viewModel.selectedThemeId.collectAsStateWithLifecycle(initialValue = "modern-dark")
            MyApplicationTheme(themeId = selectedThemeId) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    AppNavigation(viewModel)
                }
            }
        }
    }
}

@Composable
fun AppNavigation(viewModel: CodeForgeMobileViewModel) {
    DashboardScreen(viewModel = viewModel)
}
