package app.codeforge.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.codeforge.mobile.ui.screens.DashboardScreen
import app.codeforge.mobile.ui.screens.PinScreen
import app.codeforge.mobile.ui.theme.MyApplicationTheme
import app.codeforge.mobile.ui.components.SetupWizardScreen

class MainActivity : ComponentActivity() {
    private val viewModel: CodeForgeMobileViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val selectedThemeId by viewModel.selectedThemeId.collectAsStateWithLifecycle(initialValue = "modern-dark")
            val appState by viewModel.appState.collectAsStateWithLifecycle()
            MyApplicationTheme(themeId = selectedThemeId) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    when (appState) {
                        app.codeforge.mobile.AppState.LOADING -> {
                            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                CircularProgressIndicator()
                            }
                        }
                        app.codeforge.mobile.AppState.SETUP_PIN -> {
                            PinScreen(isSetup = true, viewModel = viewModel)
                        }
                        app.codeforge.mobile.AppState.LOGIN -> {
                            PinScreen(isSetup = false, viewModel = viewModel)
                        }
                        app.codeforge.mobile.AppState.SETUP_WIZARD -> {
                            SetupWizardScreen(viewModel = viewModel)
                        }
                        app.codeforge.mobile.AppState.DASHBOARD -> {
                            DashboardScreen(viewModel = viewModel)
                        }
                    }
                }
            }
        }
    }
}
