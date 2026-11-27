/*
 * Android bridge (APK only — D-058). Loaded before the app scripts in the APK's copy of index.html.
 * A plain Android WebView cannot print, save downloads or (by itself) pick files, so this script routes:
 *   window.print()            → native print dialog (Save as PDF / printer)
 *   <a download href=blob:…>  → file saved to the phone's Downloads/RJ Inventory folder
 * File picking (<input type=file>) is handled natively in MainActivity.
 * Does nothing when window.RJAndroid is missing (normal browsers).
 */
(function () {
  'use strict';
  var bridge = window.RJAndroid;
  if (!bridge) return;

  window.print = function () {
    try { bridge.print(document.title || 'RJ Inventory'); } catch (e) { /* ignore */ }
  };

  function saveFromHref(href, fileName) {
    return fetch(href)
      .then(function (r) { return r.blob(); })
      .then(function (blob) {
        return new Promise(function (resolve, reject) {
          var fr = new FileReader();
          fr.onload = function () {
            var s = String(fr.result);
            var comma = s.indexOf(',');
            bridge.saveFile(fileName || 'download', blob.type || 'application/octet-stream', s.slice(comma + 1));
            resolve();
          };
          fr.onerror = function () { reject(fr.error); };
          fr.readAsDataURL(blob);
        });
      })
      .catch(function (e) { try { bridge.toast('Could not save the file: ' + (e && e.message ? e.message : e)); } catch (x) { /* ignore */ } });
  }

  function isDownloadLink(a) {
    if (!a || !a.hasAttribute || !a.hasAttribute('download')) return false;
    var href = a.getAttribute('href') || '';
    return href.indexOf('blob:') === 0 || href.indexOf('data:') === 0;
  }

  // Programmatic a.click() (how the app saves backups, CSV files and price posters).
  var nativeClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (isDownloadLink(this)) { saveFromHref(this.href, this.getAttribute('download')); return; }
    return nativeClick.apply(this, arguments);
  };

  // Download links the user taps directly.
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a') : null;
    if (isDownloadLink(a)) { ev.preventDefault(); saveFromHref(a.href, a.getAttribute('download')); }
  }, true);
})();
