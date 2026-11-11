// AraçRadar Panel Bridge — tasiyicihesap.github.io/aracradar sayfasına inject edilir
// Extension ile panel arasında köprü kurar

(function() {
  // Sayfaya extension'ın var olduğunu bildir
  window._arExtGercek = true;

  // Panel → Extension mesajları (window.postMessage üzerinden)
  window.addEventListener('message', function(e) {
    if (!e.data || e.data._arSource !== 'panel') return;
    var msg = e.data.msg;
    if (!msg || !msg.action) return;
    chrome.runtime.sendMessage(msg, function(resp) {
      window.postMessage({ _arSource: 'bridge', action: msg.action + '_resp', resp: resp }, '*');
    });
  });

  // Extension → Panel mesajları
  chrome.runtime.onMessage.addListener(function(msg) {
    window.postMessage({ _arSource: 'ext', msg: msg }, '*');
  });
})();
