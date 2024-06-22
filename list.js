function on($el, eventName, method) {
  $el.addEventListener(eventName, method);
}


function wireupTemplate(obj, templateId) {
  const template = document.getElementById(templateId);
  const clone = template.content.cloneNode(true);
  for (const name of Object.keys(obj)) {
    if (name.startsWith("$")) {
      const query = name.replace("$", ".");
      obj[name] = clone.querySelector(query);
      if (obj[name] == null) {
        console.error(`Element not found: ${query}`);
      }
    }
  }
  return clone;
}


class MyTabGroupElement extends HTMLElement {
  $labelSavedAt
  $labelTabCount
  $buttonOpenAll
  $buttonDeleteAll
  $buttonCopyAsText
  $buttonCopyAsJson
  $listTabs
  group
  tabs = []

  constructor() {
      super();
      const node = wireupTemplate(this, "templateTabGroup");
      
      // 全てのタブを開く。
      on(this.$buttonOpenAll, "click", async ev => {
        const shouldDelete = !ev.getModifierState("Control");
        var promises = [];
        for (const tab of this.tabs.filter(t => t.canShow())) {
          promises.push(tab.open(shouldDelete));
        }
        await Promise.all(promises);
        this.refresh();
        window.view.updateTotalCount();
      });

      // 全てのタブを削除する。
      on(this.$buttonDeleteAll, "click", () => {
        this.tabs.filter(t => !t.tab.deleted).forEach(t => {
          t.delete();
        });
        this.refresh();
        window.view.updateTotalCount();
      });
      
      // テキスト形式でコピーする。
      on(this.$buttonCopyAsText, "click", () => {
        const text = this.toText();
        copyTextToClipboard(text);
      });
      
      // JSON形式でコピーする。
      on(this.$buttonCopyAsJson, "click", () => {
        const json = this.toJSON();
        copyTextToClipboard(json);
      });

      const shadow = this.attachShadow({mode: "open"});
      shadow.appendChild(node);
  }

  setData(group) {
    this.group = group;
    this.$labelSavedAt.textContent = group.savedAt.toLocaleString();
    this.$listTabs.innerHTML = "";
    group.tabs.forEach(tab => {
      const $tab = new MyTabElement();
      $tab.setData(tab, this);
      this.$listTabs.appendChild($tab);
      this.tabs.push($tab);
    });
    this.style.display = this.hasAnyVisibleTab() ? "" : "none";
    this.updateTotalCount();
  }

  refresh() {
    this.style.display = this.hasAnyVisibleTab() ? "" : "none";
    for (const tab of this.tabs) {
      tab.refresh();
    }
    this.updateTotalCount();
  }

  updateTotalCount() {
    let count = 0;
    for (const tab of this.tabs) {
      if (tab.canShow()) {
        count++;
      }
    }
    this.$labelTabCount.textContent = count;
  }

  hasAnyVisibleTab() {
    return this.tabs.some(tab => tab.canShow());
  }

  toText() {
    let text = "";
    this.tabs
      .filter(tab => tab.canShow())
      .forEach(tab => {
        const deletedText = tab.tab.deleted ? "(Deleted) " : "";
        text += `${deletedText}${tab.tab.url} | ${tab.tab.title.replace("\n", "")}\n`;
      });
    return text;
  }

  toJSON() {
    var items = this.tabs
      .filter(tab => tab.canShow())
      .map(tab => {
        return JSON.stringify(tab.tab);
      });
    var json = `[\n ${items.join("\n,")}\n]`;
    return json;
  }
}
window.customElements.define("my-tab-group", MyTabGroupElement);


class MyTabElement extends HTMLElement {
  $buttonDeleteTab
  $linkTab
  $imgFavicon
  $labelTabTitle
  tab

  constructor(){
      super();
      const node = wireupTemplate(this, "templateTab");
      
      on(this.$buttonDeleteTab, "click", () => {
        this.delete();
        this.$group.refresh();
        window.view.updateTotalCount();
      });

      on(this.$linkTab, "click", async ev => {
        ev.preventDefault();
        // CTRLキーが押されていないならなら一覧から削除する。
        const shouldDelete = !ev.getModifierState("Control");
        await this.open(shouldDelete);

        this.$group.refresh();
        window.view.updateTotalCount();
      });

      const shadow = this.attachShadow({mode: "open"});
      shadow.appendChild(node);
  }

  async open(shouldDelete) {
    chrome.tabs.create({url: this.tab.url, active: false});
    if (shouldDelete) {
      this.tab.deleted = true;
      const group = this.$group.group;
      
      var data = {};
      data[group.key] = {items: group.tabs};
      await chrome.storage.local.set(data);
      console.log("done:", JSON.stringify(group));
    }
  }

  async delete() {
    this.tab.deleted = true;
    var data = {};
    var group = this.$group.group;
    data[group.key] = {items: group.tabs};
    await chrome.storage.local.set(data);
    console.log("done:", JSON.stringify(group));
  }

  setData(tab, $group) {
    this.tab = tab;
    this.$group = $group;
    this.$linkTab.href = tab.url;
    this.$imgFavicon.src = "https://www.google.com/s2/favicons?domain=" + new URL(tab.url).host;
    this.$labelTabTitle.textContent = tab.title;
    this.refresh();
  }

  canShow() {
    return (
      (window.view.showDeletedTab && this.tab.deleted) ||
      (window.view.showUndeletedTab && !this.tab.deleted)
    );
  }

  refresh() {
    this.style.display = this.canShow() ? "" : "none";
    this.$buttonDeleteTab.style.visibility = this.tab.deleted ? "hidden" : "visible";
    this.$linkTab.style.textDecoration = this.tab.deleted ? "line-through" : "";
  }
}
window.customElements.define("my-tab", MyTabElement);


class BaseView {
  getElementsAutomatically() {
    for (const name of Object.keys(this)) {
      if (name.startsWith("$")) {
        this[name] = document.getElementById(name.substring(1));
        if (this[name] == null) {
          console.error(`Element not found: ${name}`);
        }
      }
    }
  }
}


class Header extends BaseView {
  $labelTotalCount
  $checkShowUndeletedTab
  $checkShowDeletedTab
  $buttonClearDeletedTab
  $labelStartupMessage
  $saveItemContainer

  constructor() {
    super();
    this.getElementsAutomatically();
    
    on(this.$checkShowUndeletedTab, "change", () => {
      window.view.onFilterChanged();
    });

    on(this.$checkShowDeletedTab, "change", () => {
      window.view.onFilterChanged();
    });

    on(this.$buttonClearDeletedTab, "click", async () => {
      // 削除済みしかないグループを消す。
      var allGroups = window.view.$tabGroups;
      allGroups.filter(g => g.tabs.every(t => t.tab.deleted)).forEach(g => {
        const group = g.group;
        // 最新キーなら最新キーも消す。
        if (group.key === core.latestKey) {
          chrome.storage.local.remove("latest-key");
        }
        chrome.storage.local.remove(group.key);
        window.view.$tabGroups.splice(window.view.$tabGroups.indexOf(g), 1);
        g.remove();
      });

      // 個別のタブを消す。
      for (const g of window.view.$tabGroups) {
        const group = g.group;
        g.tabs.filter(t => t.tab.deleted).forEach(t => {
          group.tabs.splice(group.tabs.indexOf(t.tab), 1);
          g.tabs.splice(g.tabs.indexOf(t), 1);
          t.remove();
        });

        var data = {};
        data[group.key] = {items: group.tabs};
        await chrome.storage.local.set(data);
        console.log("done:", JSON.stringify(group));
      }

      window.view.onFilterChanged();
      window.view.updateTotalCount();
    });
  }
}


class SaveItemContainer extends BaseView {
  $saveItemContainer

  constructor() {
    super();
    this.getElementsAutomatically();
  }
}


class Footer extends BaseView {
  $buttonCopyAllAsText
  $buttonCopyAllAsJson
  $labelErrorText
  $buttonImport
  $textImportText
  $textStorageData
  $buttonClearAllData

  constructor() {
    super();
    this.getElementsAutomatically();
    
    on(this.$buttonCopyAllAsText, "click", () => {
      const texts = window.view.$tabGroups
        .filter(g => g.hasAnyVisibleTab())
        .map(g => g.toText());
      const text = texts.join("\n");
      copyTextToClipboard(text);
    });

    on(this.$buttonCopyAllAsJson, "click", () => {
      const jsons = window.view.$tabGroups
        .filter(g => g.tabs.some(tab => tab.canShow()))
        .map(g => g.toJSON());
      const json = `[${jsons.join(",")}]`;
      copyTextToClipboard(json);
    });

    on(this.$buttonImport, "click", () => {
      const text = this.$textImportText.value;
      importTabs(text);
    });

    on(this.$buttonClearAllData, "click", () => {
      if (confirm("Clear all data?")) {
        setTimeout(async() => {
          if (confirm("Really?")) {
            await chrome.storage.local.clear();
            window.location.reload();
          }
        }, 1000);
      }
    });
  }
}


class MainView {
  $tabGroups = [];
  showUndeletedTab = true;
  showDeletedTab = false;

  constructor() {
    this.header = new Header();
    this.header.$checkShowUndeletedTab.checked = this.showUndeletedTab;
    this.header.$checkShowDeletedTab.checked = this.showDeletedTab;
    this.saveItemContainer = new SaveItemContainer();
    this.footer = new Footer();
  }

  addGroups(tagGroups) {
    if (tagGroups.length === 0) {
      this.header.startupMessage = "Done.";
      return;
    }

    // 全部のグループを一度に表示すると重いので、1つずつ表示する。
    this.addGroup(tagGroups.shift());
    setTimeout(() => this.addGroups(tagGroups));
  }

  addGroup(tagBroup) {
    const $group = new MyTabGroupElement();
    $group.setData(tagBroup);
    this.saveItemContainer.$saveItemContainer.appendChild($group);
    this.$tabGroups.push($group);
    this.updateTotalCount();
  }

  setErrorText(text) {
    this.footer.$labelErrorText.textContent = text;
  }

  setStartupMessage(message) {
    this.header.$labelStartupMessage.textContent = message;
  }

  setStorageDataText(text) {
    this.footer.$textStorageData.textContent = text;
  }

  finishStartup() {
    this.header.$labelStartupMessage.style.display = "none";
  }

  updateTotalCount() {
    let count = 0;
    for (const group of this.$tabGroups) {
      for (const $tab of group.tabs) {
        if ($tab.canShow()) {
          count++;
        }
      }
    }
    this.header.$labelTotalCount.textContent = count;
  }

  onFilterChanged() {
    this.showUndeletedTab = this.header.$checkShowUndeletedTab.checked;
    this.showDeletedTab = this.header.$checkShowDeletedTab.checked;
    for (const group of this.$tabGroups) {
      group.refresh();
    }
    this.updateTotalCount();
  }
}


class SavedGroup {
  constructor([key, {items}]) {
    this.key = key;
    this.savedAt = new Date(parseInt(key.substring("SaveItem-".length))),
    this.tabs = items.map(tab => {
      tab.deleted = tab.deleted || false;
      return tab;
    });
  }
}


class ExtensionCore {
  latestKey = null;

  async start() {
    // 保存されたデータを取得する。
    const res = await chrome.storage.local.get();

    // データを取得したら、保存されたデータを表示する。
    view.setStartupMessage("Parsing Storage Data...");
    view.setStorageDataText(JSON.stringify(res));
    this.latestKey = res["latest-key"];

    // 表示用のデータに変換する。
    const saveItems = Object.entries(res)
      .filter(x => x[0].startsWith("SaveItem-"))
      .map(x => new SavedGroup(x));
    saveItems.sort((a, b) => b.savedAt - a.savedAt);
    
    view.setStartupMessage("Rendering Saved Items...");
    view.addGroups(saveItems);
    view.finishStartup();
  }
}


window.view = new MainView();
window.core = new ExtensionCore();
core.start();


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("received: ", request, sender);
  if (request.type == "reload") {
    sendResponse({result: "ok"});
    window.location.reload();
    return;
  }
  sendResponse({result: "???"});
});



function copyTextToClipboard(text) {
  // https://stackoverflow.com/questions/3436102/copy-to-clipboard-in-chrome-extension
  var copyFrom = document.createElement("textarea");
  copyFrom.textContent = text;
  document.body.appendChild(copyFrom);
  copyFrom.select();
  document.execCommand('copy');
  copyFrom.blur();
  document.body.removeChild(copyFrom);
  // 念のため、コンソールにも出力する。
  console.log(text);
}



async function importTabs(importText) {
  if (importText == null || importText.match(/^ *$/) != null) {
    view.setErrorText("入力が空です。");
    return;
  }
  view.setErrorText("");

  var tmpError = null;
  // まずJSONとして処理する。
  try {
    var items = JSON.parse(importText);

    // 配列でない場合は、localStorageの形式とみなす。
    var isArray = Array.isArray(items);
    if (!isArray) {
      items = Object.entries(items)
        .map(([key, value]) => value.items)
        .filter(items => items != null && items.length !== 0);
    }

    // tab[][]の場合と、tab[]の場合があるのでtab[]の場合はtab[][]にする。
    if (items[0][0] == null) {
      items = [items];
    }

    var time = Date.now();
    var saveItems = items.map((item, i) => ({key: "SaveItem-" + (time - i), items: item}));
    var data = {};
    saveItems.forEach(item => {
      data[item.key] = item;
    });
    data["latest-key"] = saveItems[0].key;
    await chrome.storage.local.set(data)
    window.location.reload();
    return;
  } catch (error) {
    tmpError = error;
    console.error(error);
  }

  // だめならテキスト形式で処理する。
  try {
    var items = importText.split("\n");
    var groups = items.reduce((acc, line) => {
      // 空行が来たら次のグループを作る。
      if (line === "") {
        acc[acc.length] = [];
      }
        // 普通の行なら末尾のグループに追加する。
      else {
        acc[acc.length - 1].push(line);
      }
      return acc;
    }, [[]]).filter(group => group.length !== 0);

    var time = Date.now();
    var saveItems = groups.map((lines, i) => {
      var items = lines.map(line => {
        var [url, ...rest] = line.split(" | ");
        var title = rest.join(" | ");
        if (title === "") title = url;
        // URLとして正しいかチェックする。
        const _ = new URL(url);
        return {title, url}
      });
      console.log(items);
      return {key: "SaveItem-" + (time - i), items};
    });

    var data = {};
    saveItems.forEach(item => {
      data[item.key] = item;
    });
    data["latest-key"] = saveItems[0].key;
    await chrome.storage.local.set(data);
    window.location.reload();
    return;
  }
  catch (error) {
    view.setErrorText(error.stack + "\n\n\n" + tmpError.stack);
  }
}
