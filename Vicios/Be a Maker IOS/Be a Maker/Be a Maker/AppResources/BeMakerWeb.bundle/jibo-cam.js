(function () {
  const stage = document.getElementById("cam-stage");
  const feed = document.getElementById("cam-feed");
  const emptyEl = document.getElementById("cam-empty");
  const statusEl = document.getElementById("cam-status");
  let pollTimer = null;

  function setStatus(message) {
    statusEl.textContent = message || "";
  }

  function stopFeed() {
    feed.onload = null;
    feed.onerror = null;
    feed.classList.remove("is-live");
    feed.removeAttribute("src");
    emptyEl.classList.remove("is-hidden");
    fetch("/api/camera/stop", { method: "POST", keepalive: true }).catch(function () {});
  }

  function startFeed() {
    emptyEl.classList.remove("is-hidden");
    emptyEl.textContent = "Waiting for camera…";
    feed.classList.remove("is-live");
    feed.onload = function () {
      feed.classList.add("is-live");
      emptyEl.classList.add("is-hidden");
      setStatus("");
    };
    feed.onerror = function () {
      feed.classList.remove("is-live");
      emptyEl.classList.remove("is-hidden");
      emptyEl.textContent = "Could not start the camera.";
      setStatus("Could not start Jibo’s camera.");
    };
    feed.src = "/api/camera/stream?t=" + Date.now();
  }

  async function refreshStatus() {
    try {
      const info = await fetch("/api/status").then(function (res) {
        return res.json();
      });
      if (!info || !info.connected) {
        setStatus("Connect a Jibo to see the camera.");
        stopFeed();
        return false;
      }
      return true;
    } catch (_) {
      setStatus("Connect a Jibo to see the camera.");
      stopFeed();
      return false;
    }
  }

  function open() {
    if (window.BamScreen) window.BamScreen.close();
    stage.classList.add("is-open");
    stage.setAttribute("aria-hidden", "false");
    setStatus("");
    refreshStatus().then(function (ok) {
      if (ok && stage.classList.contains("is-open")) startFeed();
    });
    clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      refreshStatus();
    }, 4000);
  }

  function close() {
    stage.classList.remove("is-open");
    stage.setAttribute("aria-hidden", "true");
    clearInterval(pollTimer);
    pollTimer = null;
    stopFeed();
  }

  document.getElementById("btn-cam-back").addEventListener("click", close);
  document.getElementById("menu-cam").addEventListener("click", function () {
    const drawer = document.getElementById("drawer");
    const backdrop = document.getElementById("drawer-backdrop");
    if (drawer) {
      drawer.classList.remove("is-open");
      drawer.setAttribute("aria-hidden", "true");
    }
    if (backdrop) backdrop.classList.remove("is-open");
    const projects = document.getElementById("projects-screen");
    if (projects) {
      projects.classList.remove("is-open");
      projects.setAttribute("aria-hidden", "true");
    }
    open();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && stage.classList.contains("is-open")) close();
  });

  window.addEventListener("pagehide", function () {
    if (feed.getAttribute("src")) stopFeed();
  });

  window.BamCam = {
    open: open,
    close: close,
    isOpen: function () {
      return stage.classList.contains("is-open");
    }
  };
})();
