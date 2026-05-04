document.getElementById('openManager').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'openManager' });
});
