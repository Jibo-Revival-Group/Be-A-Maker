(function () {
  if (window.VirtualMachine && window.VirtualMachine.prototype) {
    const proto = window.VirtualMachine.prototype;
    proto.downloadProjectId = function () {
      return Promise.resolve();
    };
    const playgroundData = proto.getPlaygroundData;
    proto.getPlaygroundData = function () {
      if (!this.editingTarget) return;
      return playgroundData.apply(this, arguments);
    };
  }
  if (window.Blockly) {
    window.Blockly.prompt = function (message, defaultValue, callback) {
      const result = window.prompt(message, defaultValue == null ? '' : String(defaultValue));
      if (typeof callback === 'function') callback(result);
    };
  }
})();
