(function (global) {
  const players = new Map();

  function play(el, jsonUrl, opts) {
    opts = opts || {};
    stop(el);
    if (!el) return null;
    const fallback = opts.fallbackClass || "lottie-fallback";
    if (!global.lottie) {
      el.classList.add(fallback);
      return null;
    }
    el.classList.remove(fallback);
    try {
      const anim = global.lottie.loadAnimation({
        container: el,
        renderer: "svg",
        loop: opts.loop === true,
        autoplay: opts.autoplay !== false,
        path: jsonUrl,
        assetsPath: opts.assetsPath || ""
      });
      players.set(el, anim);
      anim.addEventListener("data_failed", function () {
        stop(el);
        el.classList.add(fallback);
      });
      return anim;
    } catch (_) {
      el.classList.add(fallback);
      return null;
    }
  }

  function stop(el) {
    if (!el) return;
    const anim = players.get(el);
    if (anim) {
      try {
        anim.destroy();
      } catch (_) {}
      players.delete(el);
    }
    el.innerHTML = "";
    el.classList.remove("lottie-fallback");
  }

  global.BamLottie = { play: play, stop: stop };
})(window);
