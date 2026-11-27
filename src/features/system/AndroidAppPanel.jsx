/*
 * Settings → System → "Android app" (D-059): download link for the newest APK in the app folder (dist/apk/),
 * plus earlier versions. The list comes from apk/apk-info.js (written by the build), loaded as a classic script
 * because the app runs from file://. Inside the Android app itself it only says which version is installed.
 */
import { Panel } from '../../components/Feedback.jsx';
import { Icon } from '../../components/Icon.jsx';

export function AndroidAppPanel() {
  const info = (typeof window !== 'undefined' && window.RJ_APK) || { latest: null, all: [] };
  const inAndroid = typeof window !== 'undefined' && !!window.RJAndroid;
  const latest = info.latest;
  const older = (info.all || []).slice(1);

  if (inAndroid) {
    return (
      <Panel title="Android app">
        <p className="muted" data-android-app="installed">You are using the Android app, version {__APP_VERSION__}.</p>
      </Panel>
    );
  }

  const fileName = (f) => f.split('/').pop();
  return (
    <Panel title="Android app"
      actions={latest && (
        <a className="btn btn-primary btn-md" href={latest.file} download={fileName(latest.file)} data-apk-download={latest.version}>
          <Icon name="download" size={18} /><span>Download Android app</span>
        </a>
      )}>
      {latest ? (
        <>
          <p className="muted">
            Version {latest.version}{latest.version !== __APP_VERSION__ ? ` (this web version is ${__APP_VERSION__})` : ''}. For Android 7 or newer.
            Open the downloaded file on the phone to install it; the phone may ask you to allow installing apps from this source.
            A newer version installs over the old one and keeps you signed in.
          </p>
          {older.length > 0 && (
            <details className="form-stack">
              <summary>Earlier versions</summary>
              <ul data-apk-older>
                {older.map((a) => <li key={a.version}><a href={a.file} download={fileName(a.file)}>Version {a.version}</a></li>)}
              </ul>
            </details>
          )}
        </>
      ) : (
        <p className="muted" data-android-app="none">No Android app has been built for this folder yet.</p>
      )}
    </Panel>
  );
}
