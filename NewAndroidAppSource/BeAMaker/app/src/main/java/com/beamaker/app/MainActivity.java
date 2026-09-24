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
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.view.animation.Animation;
import android.view.animation.RotateAnimation;
import android.content.res.Configuration;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.os.Vibrator;
import android.os.VibrationEffect;
import android.widget.ProgressBar;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.splashscreen.SplashScreen;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.BroadcastReceiver;
import android.net.Uri;
import android.os.BatteryManager;
import android.widget.Toast;
import android.app.AlertDialog;
import android.webkit.WebSettings;
import android.graphics.Color;
import androidx.core.content.FileProvider;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
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
    private SwipeRefreshLayout swipeRefreshLayout;
    private TextView statusText;
    private ProgressBar progressBar;
    private LinearLayout portraitLockView;
    private LinearLayout startupLayout;

    private boolean doubleBackToExitPressedOnce = false;
    private BroadcastReceiver batteryReceiver;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Feature 1: Splash Screen API
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#121212"));

        swipeRefreshLayout = new SwipeRefreshLayout(this);
        webView = new WebView(this);
        
        // Feature 11: Custom User Agent
        WebSettings settings = webView.getSettings();
        settings.setUserAgentString(settings.getUserAgentString() + " BeAMaker-Android/" + getVersionName());
        
        // Feature 5 & 14: Hardware Acceleration & Zoom
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setAllowFileAccess(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);

        // Feature 18: Clear Cache on Startup if debug
        try {
            java.lang.reflect.Field debugField = Class.forName(getPackageName() + ".BuildConfig").getField("DEBUG");
            if (debugField.getBoolean(null)) {
                webView.clearCache(true);
            }
        } catch (Exception ignored) {
        }

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("http://127.0.0.1:" + SERVER_PORT) || url.startsWith("file://")) {
                    return false;
                }
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(intent);
                    return true;
                } catch (Exception e) {
                    return false;
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                swipeRefreshLayout.setRefreshing(false);
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                // Feature 17: Auto-reload on Error
                if (startedNodeAlready) {
                    new Handler(Looper.getMainLooper()).postDelayed(() -> webView.reload(), 2000);
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage cm) {
                Log.d(TAG, "WebView console: " + cm.message() + " (" + cm.sourceId() + ":" + cm.lineNumber() + ")");
                return true;
            }
        });

        swipeRefreshLayout.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        swipeRefreshLayout.setOnRefreshListener(() -> {
            webView.reload();
            new Handler(Looper.getMainLooper()).postDelayed(() -> swipeRefreshLayout.setRefreshing(false), 1000);
        });

        root.addView(swipeRefreshLayout, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        swipeRefreshLayout.setVisibility(View.GONE);

        boolean isDebug = false;
        try {
            Class<?> buildConfigClass = Class.forName(getPackageName() + ".BuildConfig");
            isDebug = buildConfigClass.getField("DEBUG").getBoolean(null);
        } catch (Exception ignored) {
        }

        startupLayout = new LinearLayout(this);
        startupLayout.setOrientation(LinearLayout.VERTICAL);
        startupLayout.setGravity(android.view.Gravity.CENTER);

        statusText = new TextView(this);
        statusText.setText(isDebug ? getString(R.string.starting_msg_debug) : getString(R.string.starting_msg));
        statusText.setGravity(android.view.Gravity.CENTER);
        statusText.setTextSize(18);
        statusText.setTextColor(Color.WHITE);
        
        // Feature 15: About Dialog via Long Press
        statusText.setOnLongClickListener(v -> {
            showAboutDialog();
            return true;
        });

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setIndeterminate(true);
        LinearLayout.LayoutParams progressParams = new LinearLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, 20);
        progressParams.setMargins(60, 30, 60, 30);

        LinearLayout buttonsLayout = new LinearLayout(this);
        buttonsLayout.setOrientation(LinearLayout.HORIZONTAL);
        buttonsLayout.setGravity(android.view.Gravity.CENTER);

        Button visitUsBtn = new Button(this);
        visitUsBtn.setText(R.string.btn_visit_us);
        visitUsBtn.setOnClickListener(v -> {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://jiborevival.com"));
            startActivity(intent);
        });

        Button visitGithubBtn = new Button(this);
        visitGithubBtn.setText(R.string.btn_visit_github);
        visitGithubBtn.setOnClickListener(v -> {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://github.com/Jibo-Revival-Group"));
            startActivity(intent);
        });

        LinearLayout.LayoutParams btnParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        btnParams.setMargins(16, 16, 16, 16);

        buttonsLayout.addView(visitUsBtn, btnParams);
        buttonsLayout.addView(visitGithubBtn, btnParams);

        startupLayout.addView(statusText);
        startupLayout.addView(progressBar, progressParams);
        startupLayout.addView(buttonsLayout);

        root.addView(startupLayout, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        setupPortraitLockView(root);
        checkOrientation(getResources().getConfiguration().orientation);
        enableImmersiveMode();
        setupReceivers();

        setContentView(root);

        if (!startedNodeAlready) {
            startedNodeAlready = true;
            new Thread(this::copyAssetsAndStartNode).start();
        }

        // Feature 19: Deep Link Handling
        handleIntent(getIntent());

        new Thread(this::checkForUpdates).start();

        waitForServerThenLoadWebView();
    }

    @Override
    public void onBackPressed() {
        if (webView.getVisibility() == View.VISIBLE && webView.canGoBack()) {
            webView.goBack();
        } else {
            // Feature 10: Double Back to Exit
            if (doubleBackToExitPressedOnce) {
                super.onBackPressed();
                return;
            }
            this.doubleBackToExitPressedOnce = true;
            Toast.makeText(this, R.string.exit_msg, Toast.LENGTH_SHORT).show();
            new Handler(Looper.getMainLooper()).postDelayed(() -> doubleBackToExitPressedOnce = false, 2000);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Feature 19: Deep Link Handling
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent != null && Intent.ACTION_VIEW.equals(intent.getAction())) {
            String data = intent.getDataString();
            if (data != null && webView != null) {
                webView.loadUrl(data);
            }
        }
    }

    private void showAboutDialog() {
        new AlertDialog.Builder(this)
                .setTitle("About Be a Maker")
                .setMessage("Version: " + getVersionName() + "\nRunning Node.js Environment")
                .setPositiveButton("OK", null)
                .show();
    }

    private String getVersionName() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "1.0.0";
        }
    }

    private void setupReceivers() {
        // Feature 13: Low Battery Warning
        batteryReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                int level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                int scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
                float batteryPct = level * 100 / (float) scale;
                if (batteryPct < 15) {
                    Toast.makeText(MainActivity.this, "Low Battery: " + (int) batteryPct + "%", Toast.LENGTH_LONG).show();
                }
            }
        };
        registerReceiver(batteryReceiver, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (batteryReceiver != null) unregisterReceiver(batteryReceiver);
    }

    // ---- Auto-Update Logic -----------------------------------------------------

    private void checkForUpdates() {
        try {
            URL url = new URL("https://api.github.com/repos/Jibo-Revival-Group/Be-A-Maker/releases/latest");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestProperty("User-Agent", "BeAMaker-Android-Updater");
            conn.setConnectTimeout(5000);
            
            if (conn.getResponseCode() == 200) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) sb.append(line);
                reader.close();

                JSONObject release = new JSONObject(sb.toString());
                String latestVersion = release.getString("tag_name").replace("v", "");
                String currentVersion = getVersionName();

                if (isNewerVersion(currentVersion, latestVersion)) {
                    JSONArray assets = release.getJSONArray("assets");
                    String downloadUrl = null;
                    for (int i = 0; i < assets.length(); i++) {
                        JSONObject asset = assets.getJSONObject(i);
                        if (asset.getString("name").endsWith(".apk")) {
                            downloadUrl = asset.getString("browser_download_url");
                            break;
                        }
                    }
                    
                    if (downloadUrl != null) {
                        final String finalUrl = downloadUrl;
                        final String versionLabel = latestVersion;
                        new Handler(Looper.getMainLooper()).post(() -> showUpdateDialog(finalUrl, versionLabel));
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Update check failed", e);
        }
    }

    private boolean isNewerVersion(String current, String latest) {
        try {
            String[] currParts = current.split("\\.");
            String[] lateParts = latest.split("\\.");
            int length = Math.max(currParts.length, lateParts.length);
            for (int i = 0; i < length; i++) {
                int curr = i < currParts.length ? Integer.parseInt(currParts[i]) : 0;
                int late = i < lateParts.length ? Integer.parseInt(lateParts[i]) : 0;
                if (late > curr) return true;
                if (curr > late) return false;
            }
        } catch (Exception e) {
            return !current.equals(latest);
        }
        return false;
    }

    private void showUpdateDialog(String downloadUrl, String newVersion) {
        new AlertDialog.Builder(this)
                .setTitle("Update Available")
                .setMessage("A new version (" + newVersion + ") of Be a Maker is available. Would you like to download and install it?")
                .setPositiveButton("Update", (dialog, which) -> startApkDownload(downloadUrl))
                .setNegativeButton("Later", null)
                .show();
    }

    private void startApkDownload(String downloadUrl) {
        Toast.makeText(this, "Downloading update...", Toast.LENGTH_LONG).show();
        new Thread(() -> {
            try {
                URL url = new URL(downloadUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.connect();

                File apkFile = new File(getExternalCacheDir(), "update.apk");
                InputStream input = new BufferedInputStream(url.openStream());
                OutputStream output = new FileOutputStream(apkFile);

                byte[] data = new byte[16384];
                int count;
                while ((count = input.read(data)) != -1) {
                    output.write(data, 0, count);
                }
                output.flush();
                output.close();
                input.close();

                new Handler(Looper.getMainLooper()).post(() -> installApk(apkFile));
            } catch (Exception e) {
                Log.e(TAG, "Download failed", e);
                new Handler(Looper.getMainLooper()).post(() -> 
                    Toast.makeText(MainActivity.this, "Update download failed.", Toast.LENGTH_SHORT).show());
            }
        }).start();
    }

    private void installApk(File apkFile) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            Uri apkUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", apkFile);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e) {
            Log.e(TAG, "Installation failed", e);
            Toast.makeText(this, "Could not start installer.", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    public void onConfigurationChanged(@NonNull Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        checkOrientation(newConfig.orientation);
    }

    private void setupPortraitLockView(FrameLayout root) {
        portraitLockView = new LinearLayout(this);
        portraitLockView.setOrientation(LinearLayout.VERTICAL);
        portraitLockView.setGravity(android.view.Gravity.CENTER);
        portraitLockView.setBackgroundColor(0xFF121212); // Dark background
        portraitLockView.setVisibility(android.view.View.GONE);

        // Icon (rotating phone)
        ImageView icon = new ImageView(this);
        // Use a built-in icon as a placeholder for the rotation graphic
        icon.setImageResource(android.R.drawable.ic_menu_rotate);
        icon.setColorFilter(0xFFFFFFFF); // White icon
        LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(250, 250);
        iconParams.bottomMargin = 60;
        portraitLockView.addView(icon, iconParams);

        // Text
        TextView text = new TextView(this);
        text.setText(R.string.rotate_msg);
        text.setTextColor(0xFFFFFFFF);
        text.setTextSize(20);
        text.setGravity(android.view.Gravity.CENTER);
        portraitLockView.addView(text);

        // Smooth rotation animation from portrait (0) to landscape (90)
        RotateAnimation anim = new RotateAnimation(0, 90,
                Animation.RELATIVE_TO_SELF, 0.5f, Animation.RELATIVE_TO_SELF, 0.5f);
        anim.setDuration(1500);
        anim.setRepeatCount(Animation.INFINITE);
        anim.setRepeatMode(Animation.RESTART);
        icon.startAnimation(anim);

        root.addView(portraitLockView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
    }

    private void checkOrientation(int orientation) {
        if (orientation == Configuration.ORIENTATION_PORTRAIT) {
            portraitLockView.setVisibility(android.view.View.VISIBLE);
            portraitLockView.bringToFront();
        } else {
            portraitLockView.setVisibility(android.view.View.GONE);
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

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enableImmersiveMode();
        }
    }

    private void enableImmersiveMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            final WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_FULLSCREEN);
        }
    }

    private void triggerHapticFeedback() {
        Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (v != null && v.hasVibrator()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(VibrationEffect.createOneShot(50, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                v.vibrate(50);
            }
        }
    }

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
                    triggerHapticFeedback();
                    webView.loadUrl(SERVER_URL);
                    swipeRefreshLayout.setVisibility(android.view.View.VISIBLE);
                    if (startupLayout != null) {
                        startupLayout.setVisibility(android.view.View.GONE);
                    }
                    statusText.setVisibility(android.view.View.GONE);
                    progressBar.setVisibility(android.view.View.GONE);
                } else {
                    statusText.setText(R.string.server_error);
                    progressBar.setVisibility(android.view.View.GONE);
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
            byte[] buffer = new byte[16384];
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
