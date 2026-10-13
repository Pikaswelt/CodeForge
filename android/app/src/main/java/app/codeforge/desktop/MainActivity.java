package app.codeforge.desktop;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CodeForgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
