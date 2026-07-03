package com.kcust.ai;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(OverlayPlugin.class);
        registerPlugin(SpeechPlugin.class);
        registerPlugin(CalendarPlugin.class);
        registerPlugin(SecureKeysPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
