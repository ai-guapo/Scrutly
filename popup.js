// Note: MD5 hashing uses SparkMD5 by André Cruz (https://github.com/satazor/SparkMD5), MIT License
// Copyright (c) 2013 André Cruz, licensed under MIT: https://github.com/satazor/SparkMD5/blob/master/LICENSE

document.addEventListener("DOMContentLoaded", () => {
  console.log("SparkMD5 loaded:", typeof SparkMD5 !== "undefined" ? "Yes" : "No");
  if (typeof SparkMD5 === "undefined") {
    console.error("SparkMD5 is not defined. MD5 hashing will be unavailable.");
  }

  let currentPage = 1;
  const entriesPerPage = 5;
  let selectedHash = null;

  document.getElementById("prevPage").textContent = "Prev";
  document.getElementById("nextPage").textContent = "Next";

  const scrutlyTab = document.getElementById("scrutlyTab");
  const jsTab = document.getElementById("jsTab");
  const scrutlyTabContent = document.getElementById("scrutlyTabContent");
  const jsTabContent = document.getElementById("jsTabContent");
  const closeBtn = document.getElementById("closeBtn");
  const settingsCog = document.getElementById("settingsCog");
  const settingsPanel = document.getElementById("settingsPanel");
  const jsSettingsPanel = document.getElementById("jsSettingsPanel");

  function switchTab(activeTab, inactiveTab, activeContent, inactiveContent) {
    activeTab.classList.remove("inactive");
    activeTab.classList.add("active");
    inactiveTab.classList.remove("active");
    inactiveTab.classList.add("inactive");
    activeContent.classList.add("active");
    inactiveContent.classList.remove("active");
    settingsPanel.style.display = "none";
    jsSettingsPanel.style.display = "none";
  }

  scrutlyTab.addEventListener("click", () => {
    switchTab(scrutlyTab, jsTab, scrutlyTabContent, jsTabContent);
  });

  jsTab.addEventListener("click", () => {
    switchTab(jsTab, scrutlyTab, jsTabContent, scrutlyTabContent);
    updateJsList();
  });

  closeBtn.addEventListener("click", () => {
    window.close();
  });

  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  const contextMenu = document.getElementById("contextMenu");
  const virusTotalOption = document.getElementById("virusTotalOption");
  const jottiOption = document.getElementById("jottiOption");

  document.addEventListener("click", (e) => {
    if (!document.body.contains(e.target)) {
      window.close();
    }
    if (!contextMenu.contains(e.target)) {
      contextMenu.style.display = "none";
    }
    if (!settingsPanel.contains(e.target) && !jsSettingsPanel.contains(e.target) && !settingsCog.contains(e.target)) {
      settingsPanel.style.display = "none";
      jsSettingsPanel.style.display = "none";
    }
  });

  chrome.storage.local.get(["settings"], (result) => {
    const settings = result.settings || { sha256: true, md5: false, dorking: false, unconventionalJs: false };
    chrome.storage.local.set({ settings }, () => {
      document.getElementById("sha256Toggle").checked = settings.sha256;
      document.getElementById("md5Toggle").checked = settings.md5;
      document.getElementById("dorkingToggle").checked = settings.dorking;
      document.getElementById("unconventionalJsToggle").checked = settings.unconventionalJs;
      document.getElementById("searchDorkingSection").style.display = settings.dorking ? "block" : "none";
      loadHashes();
      processPendingDownloads();
      if (jsTab.classList.contains("active")) updateJsList();
    });
  });

  settingsCog.addEventListener("click", (e) => {
    e.stopPropagation();
    if (scrutlyTab.classList.contains("active")) {
      settingsPanel.style.display = settingsPanel.style.display === "block" ? "none" : "block";
      jsSettingsPanel.style.display = "none";
    } else if (jsTab.classList.contains("active")) {
      jsSettingsPanel.style.display = jsSettingsPanel.style.display === "block" ? "none" : "block";
      settingsPanel.style.display = "none";
    }
  });

  const unconventionalJsToggle = document.getElementById("unconventionalJsToggle");
  unconventionalJsToggle.addEventListener("change", (e) => {
    chrome.storage.local.get(["settings"], (result) => {
      const settings = result.settings || { sha256: true, md5: false, dorking: false, unconventionalJs: false };
      settings.unconventionalJs = e.target.checked;
      chrome.storage.local.set({ settings }, () => {
        updateJsList();
      });
    });
  });

  const abbreviateFileName = (fileName) => {
    const maxLength = 40;
    if (fileName.length <= maxLength) return fileName;
    const extIndex = fileName.lastIndexOf(".");
    const ext = extIndex !== -1 ? fileName.slice(extIndex) : "";
    const name = extIndex !== -1 ? fileName.slice(0, extIndex) : fileName;
    const truncatedName = name.slice(0, 6) + "~1";
    return truncatedName + ext;
  };

  const showCopiedOverlay = (element) => {
    const rect = element.getBoundingClientRect();
    const overlay = document.createElement("span");
    overlay.className = "copied-overlay";
    overlay.textContent = "Copied!";
    document.body.appendChild(overlay);
    overlay.style.left = `${rect.left + window.scrollX}px`;
    overlay.style.top = `${rect.top + window.scrollY}px`;
    setTimeout(() => {
      document.body.removeChild(overlay);
    }, 1000);
  };

  const loadHashes = () => {
    chrome.storage.local.get(["hashes", "settings"], (result) => {
      const hashes = result.hashes || [];
      const settings = result.settings || { sha256: true, md5: false, dorking: false };
      const hashList = document.getElementById("hashList");
      hashList.innerHTML = "";

      if (hashes.length === 0) {
        hashList.innerHTML = "<tr><td colspan='5'>No files yet.</td></tr>";
      } else {
        const totalPages = Math.ceil(hashes.length / entriesPerPage);
        currentPage = Math.min(currentPage, totalPages) || 1;
        const start = (currentPage - 1) * entriesPerPage;
        const end = start + entriesPerPage;
        const paginatedHashes = hashes.slice(start, end);

        paginatedHashes.forEach((entry, index) => {
          const displayName = abbreviateFileName(entry.fileName);
          const row = document.createElement("tr");
          row.innerHTML = `
            <td><span class="remove-btn" data-index="${start + index}">X</span></td>
            <td>${entry.timestamp}</td>
            <td class="file-name" data-file-name="${entry.fileName}">${displayName}</td>
            <td class="hash sha256-cell" data-hash="${entry.sha256 || ''}">${settings.sha256 ? (entry.sha256 || 'N/A') : 'Disabled'}</td>
            <td class="hash" data-hash="${entry.md5 || ''}">${settings.md5 ? (entry.md5 || 'N/A') : 'Disabled'}</td>
          `;
          hashList.appendChild(row);
        });

        document.querySelectorAll(".remove-btn").forEach((btn) => {
          btn.addEventListener("click", () => {
            const index = parseInt(btn.getAttribute("data-index"));
            removeEntry(index);
          });
        });

        document.querySelectorAll(".hash").forEach((hashCell) => {
          hashCell.addEventListener("click", async () => {
            const hash = hashCell.getAttribute("data-hash");
            if (hash && hash !== "N/A" && hash !== "Disabled") {
              try {
                await navigator.clipboard.writeText(hash);
                showCopiedOverlay(hashCell);
              } catch (err) {
                console.error("Clipboard permission denied:", err);
                alert("Clipboard access denied. Please allow permission.");
              }
            }
          });
        });

        document.querySelectorAll(".file-name").forEach((fileCell) => {
          fileCell.addEventListener("click", async () => {
            const fileName = fileCell.getAttribute("data-file-name");
            if (fileName) {
              try {
                await navigator.clipboard.writeText(fileName);
                showCopiedOverlay(fileCell);
              } catch (err) {
                console.error("Clipboard permission denied:", err);
                alert("Clipboard access denied. Please allow permission.");
              }
            }
          });
        });

        document.querySelectorAll(".sha256-cell").forEach((sha256Cell) => {
          sha256Cell.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            const hash = sha256Cell.getAttribute("data-hash");
            if (hash && hash !== "N/A" && hash !== "Disabled") {
              selectedHash = hash;
              contextMenu.style.display = "block";
              contextMenu.style.left = `${e.pageX}px`;
              contextMenu.style.top = `${e.pageY}px`;
            }
          });
        });

        const pagination = document.getElementById("pagination");
        const pageInfo = document.getElementById("pageInfo");
        if (hashes.length > entriesPerPage) {
          pagination.style.display = "block";
          pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
          document.getElementById("prevPage").disabled = currentPage === 1;
          document.getElementById("nextPage").disabled = currentPage === totalPages;
        } else {
          pagination.style.display = "none";
        }
      }
    });
  };

  const removeEntry = (index) => {
    chrome.storage.local.get(["hashes"], (result) => {
      const hashes = result.hashes || [];
      hashes.splice(index, 1);
      chrome.storage.local.set({ hashes }, () => {
        loadHashes();
      });
    });
  };

  const processFile = async (fileName, fileData, timestamp) => {
    const entry = { fileName, timestamp };

    const sha256Buffer = await crypto.subtle.digest("SHA-256", fileData);
    entry.sha256 = Array.from(new Uint8Array(sha256Buffer))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    if (typeof SparkMD5 !== "undefined") {
      const md5Hasher = new SparkMD5.ArrayBuffer();
      md5Hasher.append(fileData);
      entry.md5 = md5Hasher.end();
    } else {
      console.warn("SparkMD5 not available. MD5 hash skipped.");
      entry.md5 = "N/A";
    }

    chrome.storage.local.get(["hashes"], (result) => {
      const hashes = result.hashes || [];
      hashes.push(entry);
      chrome.storage.local.set({ hashes }, () => {
        loadHashes();
      });
    });
  };

  const processPendingDownloads = () => {
    chrome.storage.local.get(["pendingDownloads"], (result) => {
      const pending = result.pendingDownloads || [];
      if (pending.length === 0) return;

      pending.forEach((downloadData) => {
        chrome.downloads.search({ id: downloadData.downloadId }, (results) => {
          if (results.length > 0 && results[0].exists) {
            const filePath = results[0].filename;
            fetch(`file:///${filePath.replace(/\\/g, "/")}`)
              .then(response => {
                if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
                return response.arrayBuffer();
              })
              .then(fileData => {
                processFile(downloadData.fileName, fileData, downloadData.timestamp);
              })
              .catch(err => {
                console.error("Failed to fetch local file:", downloadData.fileName, err);
                const entry = {
                  fileName: downloadData.fileName,
                  timestamp: downloadData.timestamp,
                  sha256: "N/A (Local fetch failed)",
                  md5: "N/A (Local fetch failed)"
                };
                chrome.storage.local.get(["hashes"], (result) => {
                  const hashes = result.hashes || [];
                  hashes.push(entry);
                  chrome.storage.local.set({ hashes }, () => {
                    loadHashes();
                  });
                });
              });
          } else {
            console.error("Download not found or deleted:", downloadData.fileName);
            const entry = {
              fileName: downloadData.fileName,
              timestamp: downloadData.timestamp,
              sha256: "N/A (File not found)",
              md5: "N/A (File not found)"
            };
            chrome.storage.local.get(["hashes"], (result) => {
              const hashes = result.hashes || [];
              hashes.push(entry);
              chrome.storage.local.set({ hashes }, () => {
                loadHashes();
              });
            });
          }
        });
      });
      chrome.storage.local.set({ pendingDownloads: [] });
    });
  };

  const fileButton = document.getElementById("fileButton");
  const fileInput = document.getElementById("fileInput");
  const fileStatus = document.getElementById("fileStatus");

  fileButton.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    fileStatus.textContent = abbreviateFileName(file.name);
    const fileName = file.name;
    const fileData = await file.arrayBuffer();
    await processFile(fileName, fileData, new Date().toISOString());
    setTimeout(() => {
      fileStatus.textContent = "No file chosen";
      fileInput.value = "";
    }, 3500);
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "downloadComplete") {
      chrome.downloads.search({ id: message.data.downloadId }, (results) => {
        if (results.length > 0 && results[0].exists) {
          const filePath = results[0].filename;
          fetch(`file:///${filePath.replace(/\\/g, "/")}`)
            .then(response => {
              if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
              return response.arrayBuffer();
            })
            .then(fileData => {
              processFile(message.data.fileName, fileData, message.data.timestamp);
              sendResponse({ status: "processed" });
            })
            .catch(err => {
              console.error("Failed to fetch local file:", message.data.fileName, err);
              sendResponse({ status: "error", error: err.message });
            });
        } else {
          console.error("Download not found or deleted:", message.data.fileName);
          sendResponse({ status: "error", error: "File not found" });
        }
      });
      return true;
    }
  });

  document.getElementById("clearList").addEventListener("click", () => {
    chrome.storage.local.set({ hashes: [] }, () => {
      currentPage = 1;
      loadHashes();
    });
  });

  document.getElementById("saveList").addEventListener("click", () => {
    chrome.storage.local.get(["hashes", "settings"], (result) => {
      const hashes = result.hashes || [];
      const settings = result.settings || { sha256: true, md5: false, dorking: false };
      if (hashes.length === 0) return;

      const textContent = hashes
        .map((entry) => {
          const sha256 = settings.sha256 ? (entry.sha256 || "N/A") : "Disabled";
          const md5 = settings.md5 ? (entry.md5 || "N/A") : "Disabled";
          return `${entry.timestamp} | ${entry.fileName} | SHA-256: ${sha256} | MD5: ${md5}`;
        })
        .join("\n");

      const now = new Date();
      const dateStr = now.toISOString().replace(/[-:T.]/g, "").slice(0, 14);
      const fileName = `DownloadList_${dateStr}.txt`;

      const blob = new Blob([textContent], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({
        url: url,
        filename: fileName,
        saveAs: true
      }, () => {
        URL.revokeObjectURL(url);
      });
    });
  });

  const dorkingToggle = document.getElementById("dorkingToggle");
  const sha256Toggle = document.getElementById("sha256Toggle");
  const md5Toggle = document.getElementById("md5Toggle");
  const searchDorkingSection = document.getElementById("searchDorkingSection");

  sha256Toggle.addEventListener("change", (e) => {
    chrome.storage.local.get(["settings"], (result) => {
      const settings = result.settings || { sha256: true, md5: false, dorking: false };
      settings.sha256 = e.target.checked;
      chrome.storage.local.set({ settings }, () => {
        loadHashes();
      });
    });
  });

  md5Toggle.addEventListener("change", (e) => {
    chrome.storage.local.get(["settings"], (result) => {
      const settings = result.settings || { sha256: true, md5: false, dorking: false };
      settings.md5 = e.target.checked;
      chrome.storage.local.set({ settings }, () => {
        loadHashes();
      });
    });
  });

  dorkingToggle.addEventListener("change", (e) => {
    chrome.storage.local.get(["settings"], (result) => {
      const settings = result.settings || { sha256: true, md5: false, dorking: false };
      settings.dorking = e.target.checked;
      chrome.storage.local.set({ settings }, () => {
        searchDorkingSection.style.display = settings.dorking ? "block" : "none";
      });
    });
  });

  document.getElementById("prevPage").addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      loadHashes();
    }
  });

  document.getElementById("nextPage").addEventListener("click", () => {
    chrome.storage.local.get(["hashes"], (result) => {
      const hashes = result.hashes || [];
      const totalPages = Math.ceil(hashes.length / entriesPerPage);
      if (currentPage < totalPages) {
        currentPage++;
        loadHashes();
      }
    });
  });

  virusTotalOption.addEventListener("click", () => {
    if (selectedHash) {
      const url = `https://www.virustotal.com/gui/file/${selectedHash}`;
      chrome.tabs.create({ url, active: false });
      contextMenu.style.display = "none";
    }
  });

  jottiOption.addEventListener("click", () => {
    if (selectedHash) {
      const url = `https://virusscan.jotti.org/en-US/search/hash/${selectedHash}`;
      chrome.tabs.create({ url, active: false });
      contextMenu.style.display = "none";
    }
  });

  // JS File Lister Logic
  function getRootDomain(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const parts = hostname.split('.');
      if (parts.length > 2) {
        return parts.slice(-2).join('.');
      }
      return hostname;
    } catch (e) {
      return 'unknown';
    }
  }

  function abbreviateText(text, maxLength) {
    if (text.length > maxLength) {
      return text.substring(0, maxLength - 3) + '...';
    }
    return text;
  }

  function renderJsList(files, unconventionalFiles, domain) {
    const jsList = document.getElementById('jsList');
    const unconventionalJsList = document.getElementById('unconventionalJsList');
    const unconventionalDivider = document.getElementById('unconventionalDivider');
    const unconventionalJsHeader = document.getElementById('unconventionalJsHeader');
    const jsHeader = document.getElementById('jsHeader');
    const jsDomainDiv = document.getElementById('jsDomain');
    if (!jsList || !jsHeader || !jsDomainDiv || !unconventionalJsList || !unconventionalDivider || !unconventionalJsHeader) {
      console.warn('JS File Lister DOM elements not found');
      return;
    }
    jsList.innerHTML = '';
    unconventionalJsList.innerHTML = '';

    jsHeader.textContent = 'JavaScript file(s) found on';
    jsDomainDiv.textContent = abbreviateText(domain, 45);

    if (files.length === 1 && files[0] === 'tab_limit_exceeded') {
      jsList.innerHTML = '<p>Too many tabs (10 max), close some</p>';
      unconventionalDivider.style.display = 'none';
      unconventionalJsHeader.style.display = 'none';
      unconventionalJsList.style.display = 'none';
      return;
    }

    if (files.length === 0) {
      jsList.innerHTML = '<p>No JavaScript files detected</p>';
    } else {
      files.forEach(url => {
        const nameDiv = document.createElement('div');
        nameDiv.className = 'js-name';
        const fileName = url.split('/').pop();
        nameDiv.textContent = abbreviateText(fileName, 45);
        nameDiv.title = url;

        const link = document.createElement('a');
        link.className = 'link-text';
        link.textContent = 'Research this JavaScript';
        link.href = `https://www.google.com/search?q=${encodeURIComponent(fileName + ' vulnerabilities')}`;
        link.target = '_blank';
        link.title = `Search for ${fileName} vulnerabilities on Google`;
        link.addEventListener('click', (e) => {
          e.preventDefault();
          chrome.tabs.create({ url: link.href, active: false });
        });

        jsList.appendChild(nameDiv);
        jsList.appendChild(link);
      });
    }

    chrome.storage.local.get(["settings"], (result) => {
      const settings = result.settings || { unconventionalJs: false };
      if (settings.unconventionalJs) {
        unconventionalDivider.style.display = 'block';
        unconventionalJsList.style.display = 'grid';
        if (unconventionalFiles.length === 0) {
          unconventionalJsHeader.style.display = 'block';
          unconventionalJsList.innerHTML = '<p>No unconventional JS files detected</p>';
        } else {
          unconventionalJsHeader.style.display = 'block';
          unconventionalFiles.forEach(filename => {
            const nameDiv = document.createElement('div');
            nameDiv.className = 'unconventional-js-name';
            nameDiv.textContent = abbreviateText(filename, 45);
            nameDiv.title = filename;
            unconventionalJsList.appendChild(nameDiv);
            unconventionalJsList.appendChild(document.createElement('div')); // Empty cell for grid alignment
          });
        }
      } else {
        unconventionalDivider.style.display = 'none';
        unconventionalJsHeader.style.display = 'none';
        unconventionalJsList.style.display = 'none';
      }
    });
  }

  function updateJsList() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab && document.getElementById('jsList')) {
        chrome.runtime.sendMessage({ action: 'getJsFiles' }, (response1) => {
          chrome.runtime.sendMessage({ action: 'getUnconventionalJsFiles' }, (response2) => {
            const domain = getRootDomain(tab.url);
            renderJsList(response1.jsFiles || [], response2.unconventionalJsFiles || [], domain);
          });
        });
      }
    });
  }

  const jsClearBtn = document.getElementById("jsClearBtn");
  const jsSaveBtn = document.getElementById("jsSaveBtn");

  jsClearBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: 'clearJsFiles' }, (response) => {
      if (response.success) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tabId = tabs[0]?.id;
          if (tabId) {
            chrome.tabs.reload(tabId, { bypassCache: true }, () => {
              updateJsList();
            });
          }
        });
      }
    });
  });

  jsSaveBtn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) return;

      const domain = getRootDomain(tab.url);
      const abbreviatedDomain = abbreviateText(domain, 20);
      const now = new Date();
      const dateTime = now.toISOString()
        .replace(/T/, '_')
        .replace(/:/g, '-')
        .substring(0, 19);
      const filename = `js_files_list_${abbreviatedDomain}_${dateTime}.txt`;

      chrome.runtime.sendMessage({ action: 'getJsFiles' }, (response1) => {
        chrome.runtime.sendMessage({ action: 'getUnconventionalJsFiles' }, (response2) => {
          const files = response1.jsFiles || [];
          const unconventionalFiles = response2.unconventionalJsFiles || [];
          if (!files.length && !unconventionalFiles.length) {
            showJsMessage('No JavaScript files to save');
          } else if (files[0] === 'tab_limit_exceeded') {
            showJsMessage('Too many tabs open (10 max)');
          } else {
            const textContent = `Root domain: ${domain}\n\nStandard JS Files:\n${files.join('\n')}\n\nUnconventional JS Files:\n${unconventionalFiles.join('\n')}`;
            const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            chrome.runtime.sendMessage(
              { action: 'saveJsFiles', files: url, filename: filename },
              (response) => {
                if (response.success) {
                  showJsMessage('File saved successfully');
                  URL.revokeObjectURL(url);
                } else {
                  showJsMessage(response.message || 'Failed to save file');
                }
              }
            );
          }
        });
      });
    });
  });

  function showJsMessage(text, duration = 3000) {
    const messageDiv = document.getElementById('jsMessage');
    if (!messageDiv) return;
    messageDiv.textContent = text;
    setTimeout(() => {
      messageDiv.textContent = '';
    }, duration);
  }

  // Search Dorking Logic
  const googleRadio = document.getElementById("googleRadio");
  const duckduckgoRadio = document.getElementById("duckduckgoRadio");
  const siteInput = document.getElementById("siteInput");
  const searchInput = document.getElementById("searchInput");
  const exactPhraseToggle = document.getElementById("exactPhraseToggle");
  const similarTermsToggle = document.getElementById("similarTermsToggle");
  const minusTermToggle = document.getElementById("minusTermToggle");
  const minusTermInput = document.getElementById("minusTermInput");
  const minusExactPhraseToggle = document.getElementById("minusExactPhraseToggle");
  const plusTermToggle = document.getElementById("plusTermToggle");
  const plusTermInput = document.getElementById("plusTermInput");
  const plusExactPhraseToggle = document.getElementById("plusExactPhraseToggle");
  const fileTypesToggle = document.getElementById("fileTypesToggle");
  const fileTypesInput = document.getElementById("fileTypesInput");
  const urlSearchToggle = document.getElementById("urlSearchToggle");
  const urlSearchInput = document.getElementById("urlSearchInput");
  const titleSearchToggle = document.getElementById("titleSearchToggle");
  const titleSearchInput = document.getElementById("titleSearchInput");
  const clearDorking = document.getElementById("clearDorking");
  const submitDorking = document.getElementById("submitDorking");

  const autoCheckToggle = (input, toggle) => {
    input.addEventListener("input", () => {
      toggle.checked = input.value.trim().length > 0;
    });
  };

  autoCheckToggle(minusTermInput, minusTermToggle);
  autoCheckToggle(plusTermInput, plusTermToggle);
  autoCheckToggle(fileTypesInput, fileTypesToggle);
  autoCheckToggle(urlSearchInput, urlSearchToggle);
  autoCheckToggle(titleSearchInput, titleSearchToggle);

  siteInput.addEventListener("input", () => {
    const validationCheckmark = document.getElementById("siteValidation");
    if (siteInput.value.trim().length > 0) {
      validationCheckmark.classList.add("active");
    } else {
      validationCheckmark.classList.remove("active");
    }
  });

  const isValidDomain = (input) => {
    const domainRegex = /^(https?:\/\/)?([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/.*)?$/;
    return domainRegex.test(input);
  };

  const extractDomain = (input) => {
    const match = input.match(/^(https?:\/\/)?([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/);
    return match ? match[0].replace(/^https?:\/\//, "") : "";
  };

  const hasQuotes = (input) => {
    return input.startsWith('"') && input.endsWith('"') && input.length > 2;
  };

  const formatTerm = (term, exactToggle, isMainTerm = false) => {
    if (!term.trim()) return "";
    const hasUserQuotes = hasQuotes(term);
    let formattedTerm = term.trim();
    if (hasUserQuotes) {
      formattedTerm = similarTermsToggle.checked && isMainTerm ? `"~${formattedTerm.slice(1, -1)}"` : formattedTerm;
      return encodeURIComponent(formattedTerm);
    }
    formattedTerm = similarTermsToggle.checked && isMainTerm ? `~${formattedTerm}` : formattedTerm;
    return exactToggle.checked ? `%22${encodeURIComponent(formattedTerm)}%22` : encodeURIComponent(formattedTerm);
  };

  const constructQuery = () => {
    const baseUrl = googleRadio.checked
      ? "https://www.google.com/search?q="
      : "https://duckduckgo.com/?q=";
    let query = "";

    const searchTerm = searchInput.value.trim();
    if (!searchTerm) {
      alert("Please enter a search term in the 'Search for?' field.");
      return null;
    }

    const siteRaw = siteInput.value.trim();
    if (siteRaw && isValidDomain(siteRaw)) {
      const site = extractDomain(siteRaw);
      query += `site:${encodeURIComponent(site)} `;
    }

    const mainTerm = formatTerm(searchTerm, exactPhraseToggle, true);
    query += mainTerm;

    const minusTerm = minusTermInput.value.trim();
    if (minusTermToggle.checked && minusTerm) {
      const hasUserQuotes = hasQuotes(minusTerm);
      let formattedMinus = minusTerm.trim();
      if (hasUserQuotes) {
        formattedMinus = `"-${formattedMinus.slice(1, -1)}"`;
      } else if (minusExactPhraseToggle.checked) {
        formattedMinus = `"-${formattedMinus}"`;
      } else {
        formattedMinus = `-${formattedMinus}`;
      }
      query += `%20${encodeURIComponent(formattedMinus)}`;
    }

    const plusTerm = plusTermInput.value.trim();
    if (plusTermToggle.checked && plusTerm) {
      const hasUserQuotes = hasQuotes(plusTerm);
      let formattedPlus = plusTerm.trim();
      if (hasUserQuotes) {
        formattedPlus = `"+${formattedPlus.slice(1, -1)}"`;
      } else if (plusExactPhraseToggle.checked) {
        formattedPlus = `"+${formattedPlus}"`;
      } else {
        formattedPlus = `+${formattedPlus}`;
      }
      query += `%20${encodeURIComponent(formattedPlus)}`;
    }

    if (fileTypesToggle.checked) {
      const fileTypes = fileTypesInput.value.trim();
      if (fileTypes) {
        const extensions = fileTypes.split(',').map(ext => {
          const cleaned = ext.trim().replace(/^"|"$/g, '');
          return `filetype:${cleaned}`;
        }).join(' ');
        query += `%20${encodeURIComponent(extensions)}`;
      }
    }

    if (urlSearchToggle.checked) {
      const urlTerm = urlSearchInput.value.trim().replace(/"/g, "");
      if (urlTerm) {
        query += `%20inurl:${encodeURIComponent(urlTerm)}`;
      }
    }

    if (titleSearchToggle.checked) {
      const titleTerm = titleSearchInput.value.trim().replace(/"/g, "");
      if (titleTerm) {
        query += `%20intitle:${encodeURIComponent(titleTerm)}`;
      }
    }

    return baseUrl + query;
  };

  googleRadio.addEventListener("change", () => {
    if (googleRadio.checked) duckduckgoRadio.checked = false;
  });

  duckduckgoRadio.addEventListener("change", () => {
    if (duckduckgoRadio.checked) googleRadio.checked = false;
  });

  searchInput.addEventListener("input", () => {
    const value = searchInput.value;
    if (hasQuotes(value)) {
      exactPhraseToggle.checked = true;
    }
  });

  minusTermInput.addEventListener("input", () => {
    const value = minusTermInput.value;
    if (hasQuotes(value)) {
      minusExactPhraseToggle.checked = true;
    }
  });

  plusTermInput.addEventListener("input", () => {
    const value = plusTermInput.value;
    if (hasQuotes(value)) {
      plusExactPhraseToggle.checked = true;
    }
  });

  clearDorking.addEventListener("click", () => {
    googleRadio.checked = true;
    duckduckgoRadio.checked = false;
    siteInput.value = "";
    document.getElementById("siteValidation").classList.remove("active");
    searchInput.value = "";
    exactPhraseToggle.checked = false;
    similarTermsToggle.checked = false;
    minusTermToggle.checked = false;
    minusTermInput.value = "";
    minusExactPhraseToggle.checked = false;
    plusTermToggle.checked = false;
    plusTermInput.value = "";
    plusExactPhraseToggle.checked = false;
    fileTypesToggle.checked = false;
    fileTypesInput.value = "";
    urlSearchToggle.checked = false;
    urlSearchInput.value = "";
    titleSearchToggle.checked = false;
    titleSearchInput.value = "";
  });

  submitDorking.addEventListener("click", () => {
    const url = constructQuery();
    if (url) {
      chrome.tabs.create({ url, active: false });
    }
  });
});