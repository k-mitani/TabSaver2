console.log("start.")
var app = new Vue({
  el: "#app",
  data: {
    errorText: null,
  },
  methods: {
    // オプションページを表示します。
    showList: function() {
      this.errorText = null;
      chrome.tabs.query({currentWindow: true}, function (tabs) {
        var extensionId = chrome.runtime.id;
        var extensionTab = tabs.filter(tab => tab.url.indexOf(`${extensionId}/list.html`) != -1)[0];
        if (extensionTab == null) {
          chrome.tabs.create({ url: "list.html" });
        }
        else {
          chrome.tabs.update(extensionTab.id, {active: true});
          // chrome.tabs.sendMessage(extensionTab.id, {type: "reload"});
        }
      });
    },
    // 全てのタブを保存します。
    saveAllTab: function() {
      this.errorText = null;
      try {
        // 現在のウィンドウのタブを全て要求する。
        chrome.tabs.query({currentWindow: true}, function (tabs) {
          var extensionId = chrome.runtime.id;
          
          // 自身のページは保存対象外とする。
          var targetTabs = tabs.filter(tab =>
            tab.url.indexOf(`${extensionId}/list.html`) == -1 &&
            !tab.url.startsWith(`chrome://`));
          var saveItems = targetTabs.map(tab => ({title: tab.title, url: tab.url, deleted: false}));
          var extensionTab = tabs.filter(tab => tab.url.indexOf(`${extensionId}/list.html`) != -1)[0];
          
          // 保存する。
          var data = {};
          var key = "SaveItem-" + Date.now();
          data[key] = {items: saveItems};
          data["latest-key"] = key;
          chrome.storage.local.set(data, (res) => {
            targetTabs.forEach(tab => {
              chrome.tabs.remove(tab.id, function() {
                console.log("closed " + tab.id);
              });
            });

            // 一覧タブがないなら開く
            if (extensionTab == null) {
              chrome.tabs.create({ url: "list.html" });
            }
            // あるならそのタブを再読み込みする。
            else {
              chrome.tabs.sendMessage(extensionTab.id, {type: "reload"});
              chrome.tabs.update(extensionTab.id, {active: true});
            }
          });
        });
      } catch (error) {
        this.errorText = error.stack;
      }
    },
    // 現在のタブを保存します。
    saveCurrentTab: function() {
      chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
        var activeTab = tabs[0];

        chrome.storage.local.get("latest-key", (res) => {
          var key = res["latest-key"];

          if (key == null) {
            unshiftAndSave(null, null, activeTab);
            return;
          }

          chrome.storage.local.get(key, (res) => {
            var savedItems = (res[key] || {}).items;
            unshiftAndSave(key, savedItems, activeTab);
          });
        });
      });

      function unshiftAndSave(key, items, tab) {
        if (key == null) key = "SaveItem-" + Date.now();
        if (items == null) items = [];
        var newItem = {title: tab.title, url: tab.url, deleted: false};
        items.unshift(newItem);

        var data = {};
        data[key] = {items: items};
        data["latest-key"] = key;
        chrome.storage.local.set(data, (res) => {
          chrome.tabs.remove(tab.id, function() {
            console.log("done.");
          });
        });
      }
    },
  },
});

