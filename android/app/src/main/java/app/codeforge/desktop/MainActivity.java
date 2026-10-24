package app.codeforge.desktop;

import android.os.Bundle;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CodeForgePlugin.class);
        super.onCreate(savedInstanceState);
        // Android 15+ enforces edge-to-edge; older versions need it explicitly. The web view
        // keeps its buttons clear of the bars with the insets reported by CodeForgePlugin.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    }
}
