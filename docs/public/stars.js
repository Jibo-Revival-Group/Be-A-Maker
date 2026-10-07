(function (global) {
  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function spawnStar(layer) {
    if (!layer || layer._stopped) return;
    const star = document.createElement("span");
    star.className = "star";
    const size = rand(8, 16);
    star.style.width = size + "px";
    star.style.height = size + "px";
    const w = layer.clientWidth || 1;
    const h = layer.clientHeight || 1;
    const x0 = rand(0, w);
    const y0 = rand(0, h);
    const drift = 100;
    const x1 = x0 < w / 2 ? rand(0, x0 + drift) : rand(Math.max(0, x0 - drift), w);
    const y1 = y0 < h / 2 ? rand(0, y0 + drift) : rand(Math.max(0, y0 - drift), h);
    const scale = rand(1, 1.4);
    const rot = rand(10, 180);
    const duration = rand(1500, 3500);
    star.style.left = "0px";
    star.style.top = "0px";
    star.style.opacity = "0";
    star.style.transform = "translate(" + x0 + "px," + y0 + "px) scale(0.5) rotate(0deg)";
    layer.appendChild(star);
    requestAnimationFrame(function () {
      star.style.transition =
        "transform " + duration + "ms cubic-bezier(0, 0, 0.2, 1), opacity " + duration / 2 + "ms ease-in-out";
      star.style.opacity = "1";
      star.style.transform = "translate(" + x1 + "px," + y1 + "px) scale(" + scale + ") rotate(" + rot + "deg)";
    });
    setTimeout(function () {
      star.style.opacity = "0";
    }, duration / 2);
    setTimeout(function () {
      if (star.parentNode) star.parentNode.removeChild(star);
    }, duration + 50);
  }

  function start(layer) {
    if (!layer) return;
    stop(layer);
    layer._stopped = false;
    function tick() {
      if (layer._stopped) return;
      spawnStar(layer);
      layer._timer = setTimeout(tick, rand(250, 500));
    }
    tick();
  }

  function stop(layer) {
    if (!layer) return;
    layer._stopped = true;
    if (layer._timer) {
      clearTimeout(layer._timer);
      layer._timer = null;
    }
    layer.innerHTML = "";
  }

  global.BamStars = { start: start, stop: stop };
})(window);
