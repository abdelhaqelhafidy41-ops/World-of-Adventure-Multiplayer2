package com.worldofadventure.game;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    private class AndroidNativeBridge {
        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    finishAndRemoveTask();
                } else {
                    finish();
                }
            });
        }

        @JavascriptInterface
        public void shareText(String title, String text, String url) {
            runOnUiThread(() -> {
                String body = (text != null && !text.isEmpty() ? text + "\n" : "") + (url != null ? url : "");
                Intent sendIntent = new Intent(Intent.ACTION_SEND);
                sendIntent.setType("text/plain");
                if (title != null && !title.isEmpty()) {
                    sendIntent.putExtra(Intent.EXTRA_SUBJECT, title);
                }
                sendIntent.putExtra(Intent.EXTRA_TEXT, body.trim());
                Intent chooser = Intent.createChooser(sendIntent, title != null && !title.isEmpty() ? title : "Share");
                startActivity(chooser);
            });
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureFullscreen();
        configureWebView();
        registerBackButtonHandler();
        handleJoinIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleJoinIntent(intent);
    }

    private void handleJoinIntent(Intent intent) {
        if (intent == null || getBridge() == null) {
            return;
        }
        Uri data = intent.getData();
        if (data == null) {
            return;
        }
        String urlStr = data.toString();
        if (!urlStr.contains("/join/") && !urlStr.contains("join=")) {
            return;
        }
        String quoted = JSONObject.quote(urlStr);
        getBridge().eval(
            "window.__handleMultiplayerJoinLink && window.__handleMultiplayerJoinLink(" + quoted + ");",
            null
        );
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemBars();
        }
    }

    private void configureFullscreen() {
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(lp);
        }
        hideSystemBars();
    }

    private void hideSystemBars() {
        Window window = getWindow();
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(window, window.getDecorView());
        if (controller != null) {
            controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            );
            controller.hide(WindowInsetsCompat.Type.systemBars());
        }
    }

    private void configureWebView() {
        if (getBridge() == null) {
            return;
        }
        WebView webView = getBridge().getWebView();
        if (webView == null) {
            return;
        }
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setVerticalScrollBarEnabled(false);
        webView.addJavascriptInterface(new AndroidNativeBridge(), "AndroidNativeBridge");

        WebSettings settings = webView.getSettings();
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
    }

    private void registerBackButtonHandler() {
        getOnBackPressedDispatcher().addCallback(
            this,
            new OnBackPressedCallback(true) {
                @Override
                public void handleOnBackPressed() {
                    if (getBridge() == null) {
                        moveTaskToBack(true);
                        return;
                    }
                    getBridge().eval(
                        "window.__handleAndroidBack ? Boolean(window.__handleAndroidBack()) : false",
                        result -> {
                            if (!"true".equals(result)) {
                                runOnUiThread(() -> moveTaskToBack(true));
                            }
                        }
                    );
                }
            }
        );
    }
}
