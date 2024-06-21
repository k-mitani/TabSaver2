console.log("start.")

Vue.component("app-saved-tab", {
  props: {
    group: Object,
    tab: Object,
  },
  computed: {
    faviconUrl: function() {
      return "https://www.google.com/s2/favicons?domain=" + new URL(this.tab.url).host;
    },
  },
  template: `
  <div>
    <button
      class="app-saved-tab--button "
      :style="{ visibility: tab.deleted ? 'hidden' : 'visible' }"
      @click="$emit('click-delete', {group, tab, $event})">❌</button>
    <a
      target="_blank"
      :href="tab.url"
      :style="{ 'text-decoration': tab.deleted ? 'line-through' : 'none' }"
      @click="$emit('click-link', {group, tab, $event})"
      >
      <img :src="faviconUrl" style="width: 16px; height: 16px;">
      
      {{tab.title}}</a>
  </div>
  `,
});


var app = new Vue({
  el: "#app",
  data: {
    startupMessage: "Initializing...",
    isStarting: true,
    showDeletedTab: false,
    showUndeletedTab: true,
    errorText: null,
    latestKey: null,
    saveItems: [],
    importText: "",
    storageData: "",
  },
  computed: {
    totalCount: function() {
      return this.saveItems.reduce((acc, item) => acc + this.countTabsOfGroup(item), 0);
    },
  },
  methods: {
    countTabsOfGroup(group) {
      return group.tabs.filter(tab => this.canShowTab(tab)).length;
    },
    canShowGroup: function(group) {
      return group.tabs.some(tab => this.canShowTab(tab));
    },
    canShowTab: function(tab) {
      return (
        (this.showDeletedTab && tab.deleted) ||
        (this.showUndeletedTab && !tab.deleted));
    },

    onClickClearDeletedTab: function() {
      // 削除済みしかないグループを消す。
      this.saveItems.filter(item => item.tabs.every(x => x.deleted)).forEach(item => {
        // 最新キーなら最新キーも消す。
        if (item.key === this.latestKey) {
          chrome.storage.local.remove("latest-key");
        }
        chrome.storage.local.remove(item.key);
        this.saveItems.splice(this.saveItems.indexOf(item), 1);
      });
      // 個別のタブを消す。
      this.saveItems.forEach(item => {
        item.tabs.filter(tab => tab.deleted).forEach(tab => {
          item.tabs.splice(item.tabs.indexOf(tab), 1);
        });

        var data = {};
        data[item.key] = {items: item.tabs};
        chrome.storage.local.set(data, (res) => {
          console.log("done:", JSON.stringify(item));
        });
      });
    },
    onClickOpenAll: function(item, $event) {
      item.tabs.filter(t => !t.deleted).forEach(tab => {
        this.onClickLink({group: item, tab, $event});
      });
    },
    onClickDeleteAll: function(item, $event) {
      item.tabs.filter(t => !t.deleted).forEach(tab => {
        this.onClickDelete({group: item, tab, $event});
      });
    },
    onClickCopyAsText: function(item, $event) {
      var text = "";
      item.tabs.filter(t => !t.deleted).forEach(tab => {
        text += `${tab.url} | ${tab.title.replace("\n", "")}\n`;
      });
      copyTextToClipboard(text);
    },
    onClickCopyAsJson: function(item, $event) {
      var items = item.tabs.filter(t => !t.deleted).map(tab => {
        return JSON.stringify(tab);
      });
      var json = `[\n ${items.join("\n,")}\n]`;
      copyTextToClipboard(json);
    },

    onClickCopyAllAsText: function($event) {
      var text = "";
      this.saveItems.filter(x => x.tabs.some(tab => !tab.deleted)).forEach(item => {
        item.tabs.filter(t => !t.deleted).forEach(tab => {
          text += `${tab.url} | ${tab.title.replace("\n", "")}\n`;
        });
        text += "\n";
      });
      copyTextToClipboard(text);
    },
    onClickCopyAllAsJson: function($event) {
      var items = this.saveItems.filter(x => x.tabs.some(tab => !tab.deleted)).map(item => {
        var items = item.tabs.filter(t => !t.deleted).map(tab => {
          return JSON.stringify(tab);
        });
        return `[\n ${items.join("\n,")}\n]`;
      });

      var json = `[${items.join(",")}]`;
      copyTextToClipboard(json);
    },
    onClickImport: function($event) {
      if (this.importText == null || this.importText.match(/^ *$/) != null) {
        this.errorText = "入力が空です。"
        return;
      }
      this.errorText = null;

      var tmpError = null;
      // まずJSONとして処理する。
      try {
        var items = JSON.parse(app.importText);
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
        chrome.storage.local.set(data, res => {
          window.location.reload();
        });
        return;
      } catch (error) {
        tmpError = error;
      }

      // だめならテキスト形式で処理する。
      try {
        var items = app.importText.split("\n");
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
        chrome.storage.local.set(data, res => {
          window.location.reload();
        });
        return;
      }
      catch (error) {
        this.errorText = error.stack + "\n\n\n" + tmpError.stack;
      }
    },


    // リンクをクリックされた場合に呼ばれます。
    onClickLink: function(ev) {
      chrome.tabs.create({url: ev.tab.url, active: false});
      
      // CTRLキーが押されていないならなら一覧から削除する。
      if (!ev.$event.getModifierState("Control")) {
        // ev.group.tabs.splice(ev.group.tabs.indexOf(ev.tab), 1);
        ev.tab.deleted = true;
        
        var data = {};
        data[ev.group.key] = {items: ev.group.tabs};
        chrome.storage.local.set(data, (res) => {
          console.log("done:", JSON.stringify(ev.group));
        });
      }
      ev.$event.preventDefault();
    },
    // 削除ボタンをクリックされた場合に呼ばれます。
    onClickDelete: function(ev) {
      // ev.group.tabs.splice(ev.group.tabs.indexOf(ev.tab), 1);
      ev.tab.deleted = true;
      var data = {};
      data[ev.group.key] = {items: ev.group.tabs};
      chrome.storage.local.set(data, (res) => {
        console.log("done:", JSON.stringify(ev.group));
      });
    },
  },
});

chrome.storage.local.get((res) => {
  app.startupMessage = "Parsing Storage Data...";
  app.storageData = JSON.stringify(res);
  var saveItems = Object.entries(res)
    .filter(x => x[0].startsWith("SaveItem-"))
    .map(x => ({
      key: x[0],
      savedAt: new Date(parseInt(x[0].substring("SaveItem-".length))),
      tabs: x[1].items.map(tab => {
        tab.deleted = tab.deleted || false;
        return tab;
      }),
    }));
  saveItems.sort((a, b) => b.savedAt - a.savedAt);

  app.startupMessage = "Rendering Saved Items...";
  app.latestKey = res["latest-key"];


  app.isStarting = false;
  renderOne();
  function renderOne() {
    if (saveItems.length === 0) {
      app.startupMessage = "Done.";
      return;
    }
    app.saveItems.push(saveItems.shift());
    setTimeout(renderOne);
  }
});

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
}