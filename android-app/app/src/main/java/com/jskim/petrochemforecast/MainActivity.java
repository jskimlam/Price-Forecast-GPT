package com.jskim.petrochemforecast;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

import androidx.core.content.FileProvider;

public class MainActivity extends Activity {
    private static final String HOME_URL = "https://jskimlam.github.io/Price-Forecast-GPT/";
    private WebView webView;
    private ProgressBar progressBar;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.rgb(5, 24, 40));
        getWindow().setNavigationBarColor(Color.rgb(5, 24, 40));

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(5, 24, 40));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(5, 24, 40));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);

        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);

        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));

        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, dp(3));
        root.addView(progressBar, progressParams);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int progress) {
                progressBar.setProgress(progress);
                progressBar.setVisibility(progress >= 100 ? View.GONE : View.VISIBLE);
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost() == null ? "" : uri.getHost();
                if ("jskimlam.github.io".equalsIgnoreCase(host)) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {}
                return true;
            }
        });

        setContentView(root);
        webView.loadUrl(HOME_URL + "?app=android&v=" + System.currentTimeMillis());
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private byte[] decodeDataUrl(String dataUrl) {
        int comma = dataUrl.indexOf(',');
        String base64 = comma >= 0 ? dataUrl.substring(comma + 1) : dataUrl;
        return Base64.decode(base64, Base64.DEFAULT);
    }

    private void toast(String message) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show());
    }

    public class AndroidBridge {
        @JavascriptInterface
        public void savePng(String dataUrl, String filename) {
            new Thread(() -> {
                try {
                    byte[] bytes = decodeDataUrl(dataUrl);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        ContentValues values = new ContentValues();
                        values.put(MediaStore.Images.Media.DISPLAY_NAME, filename);
                        values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                        values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/PetrochemForecast");
                        Uri uri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                        if (uri == null) throw new IllegalStateException("MediaStore insert failed");
                        try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                            if (out == null) throw new IllegalStateException("Output stream failed");
                            out.write(bytes);
                        }
                        toast("PNG 저장 완료 · Pictures/PetrochemForecast");
                    } else {
                        File dir = new File(getExternalFilesDir(Environment.DIRECTORY_PICTURES), "PetrochemForecast");
                        if (!dir.exists()) dir.mkdirs();
                        File file = new File(dir, filename);
                        try (FileOutputStream out = new FileOutputStream(file)) {
                            out.write(bytes);
                        }
                        toast("PNG 저장 완료");
                    }
                } catch (Exception e) {
                    toast("PNG 저장 실패");
                }
            }).start();
        }

        @JavascriptInterface
        public void sharePng(String dataUrl, String filename, String title) {
            new Thread(() -> {
                try {
                    byte[] bytes = decodeDataUrl(dataUrl);
                    File dir = new File(getCacheDir(), "shared");
                    if (!dir.exists()) dir.mkdirs();
                    File file = new File(dir, filename);
                    try (FileOutputStream out = new FileOutputStream(file)) {
                        out.write(bytes);
                    }
                    Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".fileprovider", file);
                    runOnUiThread(() -> {
                        Intent intent = new Intent(Intent.ACTION_SEND);
                        intent.setType("image/png");
                        intent.putExtra(Intent.EXTRA_STREAM, uri);
                        intent.putExtra(Intent.EXTRA_SUBJECT, title);
                        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        try {
                            startActivity(Intent.createChooser(intent, "전망 카드 공유"));
                        } catch (Exception e) {
                            Toast.makeText(MainActivity.this, "공유 앱을 열 수 없습니다.", Toast.LENGTH_SHORT).show();
                        }
                    });
                } catch (Exception e) {
                    toast("공유 준비 실패");
                }
            }).start();
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView != null && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
