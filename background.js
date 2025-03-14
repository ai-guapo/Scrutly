chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state && delta.state.current === "complete") {
    chrome.downloads.search({ id: delta.id }, (results) => {
      if (results.length > 0) {
        const download = results[0];
        console.log("Download completed:", download.filename);

        if (download.filename.match(/DownloadList_\d{14}\.txt$/)) {
          console.log("Skipping extension-generated file:", download.filename);
          return;
        }

        const fileName = download.filename.split(/[\\/]/).pop();
        const downloadData = {
          downloadId: download.id,
          fileName: fileName,
          timestamp: new Date().toISOString()
        };

        chrome.runtime.sendMessage({
          type: "downloadComplete",
          data: downloadData
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.log("Popup not open, queuing download:", chrome.runtime.lastError.message);
            chrome.storage.local.get(["pendingDownloads"], (result) => {
              const pending = result.pendingDownloads || [];
              pending.push(downloadData);
              chrome.storage.local.set({ pendingDownloads: pending });
            });
          }
        });
      }
    });
  }
});

const jsFilesByTab = new Map();
const unconventionalJsFilesByTab = new Map();
const MAX_TABS = 10;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "downloadComplete") {
    chrome.downloads.search({ id: request.data.downloadId }, (results) => {
      if (results.length > 0 && results[0].exists) {
        const filePath = results[0].filename;
        fetch(`file:///${filePath.replace(/\\/g, "/")}`)
          .then(response => {
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            return response.arrayBuffer();
          })
          .then(fileData => {
            sendResponse({ status: "processed" });
          })
          .catch(err => {
            console.error("Failed to fetch local file:", request.data.fileName, err);
            sendResponse({ status: "error", error: err.message });
          });
      } else {
        console.error("Download not found or deleted:", request.data.fileName);
        sendResponse({ status: "error", error: "File not found" });
      }
    });
    return true;
  } else if (request.action === 'getJsFiles') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      let files = [];
      if (jsFilesByTab.size >= MAX_TABS) {
        files = ['tab_limit_exceeded'];
      } else if (tabId && jsFilesByTab.has(tabId)) {
        files = Array.from(jsFilesByTab.get(tabId));
      }
      sendResponse({ jsFiles: files });
    });
    return true;
  } else if (request.action === 'getUnconventionalJsFiles') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) {
        sendResponse({ unconventionalJsFiles: [] });
        return;
      }
      if (unconventionalJsFilesByTab.size >= MAX_TABS) {
        sendResponse({ unconventionalJsFiles: ['tab_limit_exceeded'] });
        return;
      }
      const tabUrl = tabs[0]?.url || '';
      if (tabUrl.startsWith('chrome://') || tabUrl.startsWith('edge://') || tabUrl.startsWith('chrome-extension://')) {
        sendResponse({ unconventionalJsFiles: [] });
        return;
      }
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        function: detectUnconventionalJsFiles
      }, (results) => {
        if (chrome.runtime.lastError) {
          console.error("Script injection failed:", chrome.runtime.lastError.message);
          sendResponse({ unconventionalJsFiles: [] });
          return;
        }
        const unconventionalFiles = results[0]?.result || [];
        if (!unconventionalJsFilesByTab.has(tabId)) {
          unconventionalJsFilesByTab.set(tabId, new Set());
        }
        unconventionalFiles.forEach(file => unconventionalJsFilesByTab.get(tabId).add(file));
        sendResponse({ unconventionalJsFiles: Array.from(unconventionalJsFilesByTab.get(tabId) || []) });
      });
    });
    return true;
  } else if (request.action === 'clearJsFiles') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId) {
        if (jsFilesByTab.has(tabId)) jsFilesByTab.get(tabId).clear();
        if (unconventionalJsFilesByTab.has(tabId)) unconventionalJsFilesByTab.get(tabId).clear();
      }
      sendResponse({ success: true });
    });
    return true;
  } else if (request.action === 'saveJsFiles') {
    const fileUrl = request.files;
    const filename = request.filename || 'js_files_list.txt';
    if (!fileUrl || fileUrl.length === 0) {
      sendResponse({ success: false, message: 'No JavaScript files to save' });
    } else if (fileUrl === 'tab_limit_exceeded') {
      sendResponse({ success: false, message: 'Too many tabs open (10 max)' });
    } else {
      chrome.downloads.download({
        url: fileUrl,
        filename: filename,
        saveAs: true,
        conflictAction: 'uniquify'
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, message: `Download error: ${chrome.runtime.lastError.message}` });
        } else if (downloadId) {
          sendResponse({ success: true, message: 'File saved successfully' });
        } else {
          sendResponse({ success: false, message: 'Download failed to start' });
        }
      });
    }
    return true;
  } else if (request.action === 'addJsFile') {
    const tabId = sender.tab?.id;
    if (tabId && jsFilesByTab.size < MAX_TABS && !request.url.startsWith('chrome-extension://')) {
      if (!jsFilesByTab.has(tabId)) {
        jsFilesByTab.set(tabId, new Set());
      }
      jsFilesByTab.get(tabId).add(request.url);
    }
    sendResponse({ success: true });
    return true;
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    if (jsFilesByTab.has(tabId)) jsFilesByTab.get(tabId).clear();
    if (unconventionalJsFilesByTab.has(tabId)) unconventionalJsFilesByTab.get(tabId).clear();
  }
  if (changeInfo.status === 'complete' && tab.url) {
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('chrome-extension://')) {
      return; // Skip restricted URLs
    }
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      function: detectStandardJsFiles
    }).catch(err => {
      console.error("Script injection failed on tab update:", err.message);
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  jsFilesByTab.delete(tabId);
  unconventionalJsFilesByTab.delete(tabId);
});

function detectUnconventionalJsFiles() {
  const scripts = Array.from(document.getElementsByTagName('script'));
  const unconventionalJsFiles = scripts
    .filter(script => script.src && !script.src.endsWith('.js') && script.type !== 'module')
    .map(script => script.src.split('/').pop() || script.src);
  return unconventionalJsFiles;
}

function detectStandardJsFiles() {
  const scripts = Array.from(document.getElementsByTagName('script'));
  scripts.forEach(script => {
    if (script.src && script.src.endsWith('.js') && !script.src.startsWith('chrome-extension://')) {
      chrome.runtime.sendMessage({ action: 'addJsFile', url: script.src });
    }
  });
}