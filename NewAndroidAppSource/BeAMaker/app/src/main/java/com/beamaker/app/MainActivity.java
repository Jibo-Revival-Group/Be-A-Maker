package com.beamaker.app;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.res.AssetManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.KeyEvent;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {

    private static final String TAG = "BeAMaker";

    // The port server.js listens on (see PORT in server.js).
    private static final int SERVER_PORT = 5173;
    private static final String SERVER_URL = "http://127.0.0.1:" + SERVER_PORT + "/";

    static {
        System.loadLibrary("native-lib");
        System.loadLibrary("node");
    }

    // Only one Node instance should ever run per process.
    private static boolean startedNodeAlready = false;

    private WebView webView;
    private TextView statusText;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);

        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setDatabaseEnabled(true);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        webView.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        webView.getSettings().setAllowFileAccess(true);
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage cm) {
                Log.d(TAG, "WebView console: " + cm.message() + " (" + cm.sourceId() + ":" + cm.lineNumber() + ")");
                return true;
            }
        });
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        webView.setVisibility(android.view.View.GONE);

        statusText = new TextView(this);
        statusText.setText("Starting Be a Maker\u2026");
        statusText.setGravity(android.view.Gravity.CENTER);
        statusText.setTextSize(18);
        root.addView(statusText, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        setContentView(root);

        if (!startedNodeAlready) {
            startedNodeAlready = true;
            new Thread(this::copyAssetsAndStartNode).start();
        }

        waitForServerThenLoadWebView();
    }

    @Override
    public void onBackPressed() {
        if (webView.getVisibility() == android.view.View.VISIBLE && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    // ---- Node process bootstrap -------------------------------------------------

    // These three folders are copied as siblings under filesDir, because
    // server.js resolves REPO as the parent of its own directory (nodejs-project)
    // and expects "assets" and "res" folders next to it there.
    private static final String[] ASSET_FOLDERS_TO_COPY = {"nodejs-project", "assets", "res", "splash.png"};

    private void copyAssetsAndStartNode() {
        String baseDir = getApplicationContext().getFilesDir().getAbsolutePath();
        String nodeDir = baseDir + "/nodejs-project";
        if (wasAPKUpdated()) {
            for (String folder : ASSET_FOLDERS_TO_COPY) {
                String dest = baseDir + "/" + folder;
                File destReference = new File(dest);
                if (destReference.exists()) {
                    deleteFolderRecursively(destReference);
                }
                copyAssetFolder(getApplicationContext().getAssets(), folder, dest);
            }
            saveLastUpdateTime();
        }
        startNodeWithArguments(new String[]{"node", nodeDir + "/server.js"});
    }

    // Implemented in native-lib.cpp; starts a Node.js runtime with the given argv
    // and blocks the calling thread for as long as the runtime is alive.
    public native Integer startNodeWithArguments(String[] arguments);

    // ---- Wait for the local server, then show the WebView -----------------------

    private void waitForServerThenLoadWebView() {
        new Thread(() -> {
            boolean up = false;
            for (int attempt = 0; attempt < 200 && !up; attempt++) { // up to ~20s
                up = isServerUp();
                if (!up) {
                    try {
                        Thread.sleep(100);
                    } catch (InterruptedException ignored) {
                    }
                }
            }
            final boolean serverUp = up;
            new Handler(Looper.getMainLooper()).post(() -> {
                if (serverUp) {
                    webView.loadUrl(SERVER_URL);
                    webView.setVisibility(android.view.View.VISIBLE);
                    statusText.setVisibility(android.view.View.GONE);
                } else {
                    statusText.setText("Could not start the local server. Check Logcat (tag: "
                            + TAG + " / BEAMAKER-NODE) for errors.");
                }
            });
        }).start();
    }

    private boolean isServerUp() {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(SERVER_URL);
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(500);
            conn.setReadTimeout(500);
            conn.setRequestMethod("GET");
            int code = conn.getResponseCode();
            return code > 0; // any HTTP response means the server is accepting connections
        } catch (Exception e) {
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    // ---- Asset copying helpers (standard nodejs-mobile pattern) ------------------

    private boolean wasAPKUpdated() {
        SharedPreferences prefs = getApplicationContext()
                .getSharedPreferences("NODEJS_MOBILE_PREFS", Context.MODE_PRIVATE);
        long previousLastUpdateTime = prefs.getLong("NODEJS_MOBILE_APK_LastUpdateTime", 0);
        long lastUpdateTime = getLastUpdateTime();
        return lastUpdateTime != previousLastUpdateTime;
    }

    private void saveLastUpdateTime() {
        SharedPreferences prefs = getApplicationContext()
                .getSharedPreferences("NODEJS_MOBILE_PREFS", Context.MODE_PRIVATE);
        prefs.edit().putLong("NODEJS_MOBILE_APK_LastUpdateTime", getLastUpdateTime()).apply();
    }

    private long getLastUpdateTime() {
        try {
            PackageInfo info = getApplicationContext().getPackageManager()
                    .getPackageInfo(getApplicationContext().getPackageName(), 0);
            return info.lastUpdateTime;
        } catch (PackageManager.NameNotFoundException e) {
            return 1;
        }
    }

    private static boolean deleteFolderRecursively(File file) {
        try {
            boolean res = true;
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) {
                    res &= child.isDirectory() ? deleteFolderRecursively(child) : child.delete();
                }
            }
            res &= file.delete();
            return res;
        } catch (Exception e) {
            Log.e(TAG, "deleteFolderRecursively failed", e);
            return false;
        }
    }

    private static boolean copyAssetFolder(AssetManager assetManager, String fromAssetPath, String toPath) {
        try {
            String[] files = assetManager.list(fromAssetPath);
            boolean res = true;
            if (files == null || files.length == 0) {
                res &= copyAsset(assetManager, fromAssetPath, toPath);
            } else {
                new File(toPath).mkdirs();
                for (String file : files) {
                    res &= copyAssetFolder(assetManager, fromAssetPath + "/" + file, toPath + "/" + file);
                }
            }
            return res;
        } catch (Exception e) {
            Log.e(TAG, "copyAssetFolder failed for " + fromAssetPath, e);
            return false;
        }
    }

    private static boolean copyAsset(AssetManager assetManager, String fromAssetPath, String toPath) {
        InputStream in = null;
        OutputStream out = null;
        try {
            in = assetManager.open(fromAssetPath);
            new File(toPath).createNewFile();
            out = new FileOutputStream(toPath);
            byte[] buffer = new byte[4096];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
            return true;
        } catch (IOException e) {
            Log.e(TAG, "copyAsset failed for " + fromAssetPath, e);
            return false;
        } finally {
            try {
                if (in != null) in.close();
            } catch (IOException ignored) {
            }
            try {
                if (out != null) out.close();
            } catch (IOException ignored) {
            }
        }
    }
}
