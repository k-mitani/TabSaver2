$errorText = document.getElementById("errorText");

function setClickHandler(id, handler) {
  document.getElementById(id).addEventListener("click", handler);
}

function setErrorText(text) {
  $errorText.textContent = text;
}


// オプションページを表示します。
setClickHandler("showList", async () => {
  setErrorText("");
  const tabs = await chrome.tabs.query({currentWindow: true});
  const extensionId = chrome.runtime.id;
  const extensionTab = tabs.filter(tab => tab.url.indexOf(`${extensionId}/list.html`) != -1)[0];
  if (extensionTab == null) {
    chrome.tabs.create({url: "list.html"});
  }
  else {
    chrome.tabs.update(extensionTab.id, {active: true});
  }
});


// 全てのタブを保存します。
setClickHandler("saveAllTab", async () => {
  setErrorText("");
  try {
    // 現在のウィンドウのタブを全て要求する。
    const tabs = await chrome.tabs.query({currentWindow: true});
    const extensionId = chrome.runtime.id;
    
    // 自身のページは保存対象外とする。
    const targetTabs = tabs.filter(tab =>
      tab.url.indexOf(`${extensionId}/list.html`) == -1 &&
      !tab.url.startsWith(`chrome://`));
    const saveItems = targetTabs.map(tab => ({title: tab.title, url: tab.url, deleted: false}));
    const extensionTab = tabs.filter(tab => tab.url.indexOf(`${extensionId}/list.html`) != -1)[0];
    
    // 保存する。
    const data = {};
    const key = "SaveItem-" + Date.now();
    data[key] = {items: saveItems};
    data["latest-key"] = key;
    await chrome.storage.local.set(data);


    // タブを閉じる。処理が終了しないように自分のタブは最後に閉じる。
    const activeTab = (await chrome.tabs.query({active: true, currentWindow: true}))[0];
    for (const tab of targetTabs) {
      if (tab.id == activeTab.id) continue;
      await chrome.tabs.remove(tab.id);
      console.log("closed " + tab.id);
    }

    // 一覧タブがないなら開く
    if (extensionTab == null) {
      chrome.tabs.create({url: "list.html"});
    }
    // あるならそのタブを再読み込みする。
    else {
      chrome.tabs.sendMessage(extensionTab.id, {type: "reload"});
      chrome.tabs.update(extensionTab.id, {active: true});
    }
    
    await chrome.tabs.remove(activeTab.id);

  } catch (error) {
    setErrorText(error.stack);
  }
});


// 現在のタブを保存します。
setClickHandler("saveCurrentTab", async () => {
  setErrorText("");
  try {
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    const activeTab = tabs[0];

    const res = await chrome.storage.local.get("latest-key");
    const key = res["latest-key"];

    if (key == null) {
      await unshiftAndSave(null, null, activeTab);
      return;
    }

    const resLatest = await chrome.storage.local.get(key);
    const savedItems = (resLatest[key] || {}).items;
    await unshiftAndSave(key, savedItems, activeTab);

    async function unshiftAndSave(key, items, tab) {
      if (key == null) key = "SaveItem-" + Date.now();
      if (items == null) items = [];
      const newItem = {title: tab.title, url: tab.url, deleted: false};
      items.unshift(newItem);

      const data = {};
      data[key] = {items: items};
      data["latest-key"] = key;
      await chrome.storage.local.set(data);
      await chrome.tabs.remove(tab.id)
      console.log("done.");
    }
  } catch (error) {
    setErrorText(error.stack);
  }
});

