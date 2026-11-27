package com.rjbugasan.ims;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * RJ Inventory & Sales — Android wrapper (D-058).
 * Shows the same minified app as /dist, packed inside the APK (file:///android_asset/www/index.html).
 * The app talks to Firebase over the internet exactly as it does in a browser.
 */
public class MainActivity extends Activity {
    private static final String START_URL = "file:///android_asset/www/index.html";
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final String SAVE_FOLDER = "RJ Inventory";

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.WHITE);
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        applySystemBars(root);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // localStorage (session flags, settings)
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);            // the app itself is packed as local files
        s.setAllowFileAccessFromFileURLs(true); // local logo/fonts usable by canvas (price poster) — only our own pages load here
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);
        s.setTextZoom(100);
        s.setSupportMultipleWindows(false);     // target=_blank (user guide) opens in the same view; Back returns

        webView.addJavascriptInterface(new Bridge(), "RJAndroid");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return openExternally(request.getUrl());
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("*/*"); // backups are .json, which phones often report as a generic file type
                if (params != null && params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                    pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }
                try {
                    startActivityForResult(Intent.createChooser(pick, "Choose file"), FILE_CHOOSER_REQUEST);
                    return true;
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    toast("No file picker app found on this phone.");
                    return false;
                }
            }
        });
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, length) -> {
            if (url != null && (url.startsWith("http://") || url.startsWith("https://"))) openExternally(Uri.parse(url));
        });

        if (savedInstanceState != null) webView.restoreState(savedInstanceState);
        else webView.loadUrl(START_URL);
    }

    /** Keep the app clear of the status bar, navigation bar, notch and keyboard (Android 15 draws edge to edge). */
    private void applySystemBars(View root) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.setSystemBarsAppearance(
                        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
                        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
            }
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                android.graphics.Insets i = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                v.setPadding(i.left, i.top, i.right, i.bottom);
                return WindowInsets.CONSUMED;
            });
        } else {
            getWindow().setStatusBarColor(Color.WHITE);
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }
    }

    /** Web links (Facebook, Firebase console, …) open in the phone's browser; the app's own pages stay here. */
    private boolean openExternally(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme();
        if ("file".equals(scheme) || "blob".equals(scheme) || "data".equals(scheme) || "about".equals(scheme)) return false;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException e) {
            toast("No app can open this link.");
        }
        return true;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (fileCallback != null) {
                Uri[] result = null;
                if (resultCode == RESULT_OK && data != null) {
                    if (data.getClipData() != null) {
                        int n = data.getClipData().getItemCount();
                        result = new Uri[n];
                        for (int k = 0; k < n; k++) result[k] = data.getClipData().getItemAt(k).getUri();
                    } else if (data.getData() != null) {
                        result = new Uri[]{data.getData()};
                    }
                }
                fileCallback.onReceiveValue(result);
                fileCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else moveTaskToBack(true); // keep the app (and the signed-in session) alive instead of closing it
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private void toast(final String msg) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show());
    }

    // ---------------------------------------------------------------- printing

    private void printPage(String title) {
        if (webView == null) return;
        PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
        if (pm == null) { toast("Printing is not available on this phone."); return; }
        String jobName = (title == null || title.isEmpty()) ? "RJ Inventory" : title;
        final PrintDocumentAdapter inner = webView.createPrintDocumentAdapter(jobName);
        PrintDocumentAdapter outer = new PrintDocumentAdapter() {
            @Override public void onStart() { inner.onStart(); }
            @Override public void onLayout(PrintAttributes oldA, PrintAttributes newA, CancellationSignal cs,
                                           LayoutResultCallback cb, Bundle extras) { inner.onLayout(oldA, newA, cs, cb, extras); }
            @Override public void onWrite(PageRange[] pages, ParcelFileDescriptor dest, CancellationSignal cs,
                                          WriteResultCallback cb) { inner.onWrite(pages, dest, cs, cb); }
            @Override public void onFinish() {
                inner.onFinish();
                // The app removes its print-only view on "afterprint", as a browser would fire it.
                if (webView != null) webView.evaluateJavascript("window.dispatchEvent(new Event('afterprint'));", null);
            }
        };
        pm.print(jobName, outer, new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
    }

    // ---------------------------------------------------------------- saving files

    private static String safeName(String name) {
        String n = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        return n.isEmpty() ? "download" : n;
    }

    private void saveFile(String fileName, String mimeType, String base64) {
        String name = safeName(fileName);
        String mime = (mimeType == null || mimeType.isEmpty()) ? "application/octet-stream" : mimeType;
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver cr = getContentResolver();
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + SAVE_FOLDER);
                Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (uri == null) throw new IllegalStateException("Downloads folder is not available.");
                try (OutputStream out = cr.openOutputStream(uri)) {
                    if (out == null) throw new IllegalStateException("Could not open the file for writing.");
                    out.write(bytes);
                }
                final Uri saved = uri;
                final String shownMime = mime;
                runOnUiThread(() -> showSavedDialog(name, saved, shownMime));
            } else {
                File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (dir == null) dir = getFilesDir();
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Could not create the folder.");
                File f = new File(dir, name);
                try (FileOutputStream out = new FileOutputStream(f)) { out.write(bytes); }
                toast("Saved: " + f.getAbsolutePath());
            }
        } catch (Exception e) {
            toast("Could not save " + name + ": " + e.getMessage());
        }
    }

    private void showSavedDialog(String name, Uri uri, String mime) {
        if (isFinishing()) return;
        new AlertDialog.Builder(this)
                .setTitle("File saved")
                .setMessage(name + "\n\nSaved in Downloads/" + SAVE_FOLDER + ".")
                .setPositiveButton("Share", (d, w) -> {
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType(mime);
                    send.putExtra(Intent.EXTRA_STREAM, uri);
                    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    try { startActivity(Intent.createChooser(send, "Share " + name)); }
                    catch (ActivityNotFoundException e) { toast("No app can share this file."); }
                })
                .setNeutralButton("Open", (d, w) -> {
                    Intent view = new Intent(Intent.ACTION_VIEW);
                    view.setDataAndType(uri, mime);
                    view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    try { startActivity(view); }
                    catch (ActivityNotFoundException e) { toast("No app can open this file."); }
                })
                .setNegativeButton("OK", null)
                .show();
    }

    /** Methods the web app calls through window.RJAndroid (see android/bridge/android-bridge.js). */
    private class Bridge {
        @JavascriptInterface
        public void print(final String title) { runOnUiThread(() -> printPage(title)); }

        @JavascriptInterface
        public void saveFile(String fileName, String mimeType, String base64) { MainActivity.this.saveFile(fileName, mimeType, base64); }

        @JavascriptInterface
        public void toast(String message) { MainActivity.this.toast(message); }

        @JavascriptInterface
        public boolean isAndroid() { return true; }
    }
}
