(function () {
  const queue = [];
  let socket = null;
  let opened = false;

  function send(msg) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    } else {
      queue.push(msg);
    }
  }

  function flush() {
    while (queue.length && socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(queue.shift()));
    }
  }

  function applyIncoming(data) {
    if (!window.jibo) return;
    if (data.type === 'eventHandler' && data.block_id && typeof window.jibo.eventHandler === 'function') {
      window.jibo.eventHandler(data.block_id);
    } else if (data.type === 'transactionCallback' && typeof window.jibo.transactionCallback === 'function') {
      window.jibo.transactionCallback(data.trans_id, data.block_id);
    } else if (data.type === 'eventCallback' && typeof window.jibo.eventCallback === 'function') {
      window.jibo.eventCallback(data.data);
    }
  }

  function connectWs() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    socket = new WebSocket(proto + '://' + location.host + '/ws');
    socket.addEventListener('open', () => {
      opened = true;
      flush();
    });
    socket.addEventListener('message', (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (_) {
        return;
      }
      if (data.type === 'status') {
        window.dispatchEvent(new CustomEvent('bam-status', { detail: data }));
        return;
      }
      applyIncoming(data);
    });
    socket.addEventListener('close', () => {
      if (opened) setTimeout(connectWs, 1500);
    });
  }

  connectWs();

  function menuEsml(label) {
    if (typeof label !== 'string' || label.indexOf('<') !== -1) return label;
    const menus = [window.expressionList, window.emojiList, window.danceList, window.soundList];
    for (let m = 0; m < menus.length; m++) {
      const menu = menus[m];
      if (!menu) continue;
      for (let i = 0; i < menu.length; i++) {
        if (menu[i][0] === label || menu[i][1] === label) return menu[i][1];
      }
    }
    return label;
  }

  window.appInterface = {
    callbackHandler: function (json) {
      const command = typeof json === 'string' ? JSON.parse(json) : json;
      let args = command.args;
      if (String(command.block_type || '').toLowerCase() === 'say') {
        const list = Array.isArray(args) ? args.slice() : [args];
        list[0] = menuEsml(list[0]);
        args = list;
      }
      send({
        type: 'command',
        block_type: command.block_type,
        args: args,
        block_id: command.block_id
      });
    },
    startScript: function () {},
    finishScript: function () {},
    scratchLoaded: function () {
      window.dispatchEvent(new Event('bam-scratch-ready'));
    },
    commandHandler: function (json) {
      const data = typeof json === 'string' ? JSON.parse(json) : json;
      window.dispatchEvent(new CustomEvent('bam-save', { detail: data }));
    },
    blockMoved: function () {},
    promptEvent: function (json) {
      let payload = json;
      try {
        payload = typeof json === 'string' ? JSON.parse(json) : json;
      } catch (_) {
        payload = {};
      }
      const message = payload.message || payload.msg || 'Name';
      const fallback = payload.default || payload.arg || '';
      const result = window.prompt(message, fallback);
      if (typeof window.setVariableValue === 'function') {
        window.setVariableValue(result == null ? '' : String(result));
      }
    }
  };
})();
