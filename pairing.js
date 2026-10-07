(function () {
  const STORAGE_KEY = "beamaker.robotIp";
  const ROBOTS_KEY = "beamaker.robots";
  const SELECTED_KEY = "beamaker.selectedRobotId";
  const SPLASH_KEY = "beamaker.splashSeen";

  const listEl = document.getElementById("robot-list");
  const button = document.getElementById("connect");
  const status = document.getElementById("status");
  const splash = document.getElementById("splash");
  const overlay = document.getElementById("connecting");
  const phaseConnecting = document.getElementById("phase-connecting");
  const phaseConnected = document.getElementById("phase-connected");
  const pairingLottie = document.getElementById("pairing-lottie");
  const starsPairing = document.getElementById("stars-pairing");
  const starsConnecting = document.getElementById("stars-connecting");

  let robots = [];
  let selectedId = "";

  function looksLikeHost(value) {
    const host = String(value || "").trim();
    if (!host || /\s/.test(host)) return false;
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
      return host.split(".").every(function (part) {
        const n = Number(part);
        return n >= 0 && n <= 255;
      });
    }
    return /^[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9]$/.test(host) || host === "localhost";
  }

  function uuid() {
    return "r-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function selectedRobot() {
    return robots.find(function (entry) {
      return entry.id === selectedId;
    }) || robots[0] || null;
  }

  function persist() {
    localStorage.setItem(ROBOTS_KEY, JSON.stringify(robots));
    if (selectedId) localStorage.setItem(SELECTED_KEY, selectedId);
    else localStorage.removeItem(SELECTED_KEY);
    const robot = selectedRobot();
    if (robot && robot.host) localStorage.setItem(STORAGE_KEY, robot.host);
  }

  function loadRobots() {
    try {
      const list = JSON.parse(localStorage.getItem(ROBOTS_KEY) || "[]");
      if (Array.isArray(list) && list.length) {
        robots = list.map(function (entry, index) {
          return {
            id: entry.id || uuid(),
            name: entry.name || "Jibo",
            host: String(entry.host || "")
          };
        });
        selectedId = localStorage.getItem(SELECTED_KEY) || robots[0].id;
        if (!robots.some(function (entry) { return entry.id === selectedId; })) {
          selectedId = robots[0].id;
        }
        return;
      }
    } catch (_) {
      /* ignore */
    }
    const host = localStorage.getItem(STORAGE_KEY) || "";
    robots = [{ id: uuid(), name: "Jibo", host: host }];
    selectedId = robots[0].id;
    persist();
  }

  function setStatus(message, kind) {
    status.textContent = message || "";
    status.className = "status" + (kind ? " " + kind : "");
  }

  function syncButton() {
    const robot = selectedRobot();
    button.disabled = !(robot && looksLikeHost(robot.host));
  }

  function selectRobot(id) {
    if (!robots.some(function (entry) { return entry.id === id; })) return;
    selectedId = id;
    persist();
    renderList();
  }

  function addRobot() {
    const robot = { id: uuid(), name: "Jibo", host: "" };
    robots.push(robot);
    selectedId = robot.id;
    persist();
    renderList();
    const hostInput = listEl.querySelector('.robot-card.selected .robot-host');
    if (hostInput) hostInput.focus();
  }

  function removeRobot(id) {
    if (robots.length < 1) return;
    robots = robots.filter(function (entry) {
      return entry.id !== id;
    });
    if (!robots.length) {
      robots = [{ id: uuid(), name: "Jibo", host: "" }];
    }
    if (!robots.some(function (entry) { return entry.id === selectedId; })) {
      selectedId = robots[0].id;
    }
    persist();
    renderList();
  }

  function renderList() {
    listEl.innerHTML = "";
    robots.forEach(function (robot) {
      const selected = robot.id === selectedId;
      const card = document.createElement("div");
      card.className = "robot-card" + (selected ? " selected" : "");
      card.setAttribute("role", "button");
      card.tabIndex = 0;
      card.setAttribute("aria-pressed", selected ? "true" : "false");
      card.dataset.id = robot.id;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "robot-remove";
      remove.setAttribute("aria-label", "Remove " + (robot.name || "Jibo"));
      remove.textContent = "×";
      remove.addEventListener("click", function (event) {
        event.stopPropagation();
        removeRobot(robot.id);
      });
      card.appendChild(remove);

      const art = document.createElement("img");
      art.className = "robot-art";
      art.alt = "";
      art.src = selected
        ? "/apk/mipmap/ic_jibo_pairing_selected.png"
        : "/apk/mipmap/ic_jibo_pair.png";
      card.appendChild(art);

      const name = document.createElement("input");
      name.type = "text";
      name.className = "robot-name";
      name.value = robot.name || "Jibo";
      name.setAttribute("aria-label", "Robot name");
      name.addEventListener("click", function (event) {
        event.stopPropagation();
        if (!selected) selectRobot(robot.id);
      });
      name.addEventListener("input", function () {
        robot.name = name.value.trim() || "Jibo";
        persist();
      });
      card.appendChild(name);

      const host = document.createElement("input");
      host.type = "text";
      host.className = "robot-host";
      host.inputMode = "decimal";
      host.autocomplete = "off";
      host.spellcheck = false;
      host.placeholder = "192.168.1.50";
      host.value = robot.host || "";
      host.setAttribute("aria-label", "Robot IP");
      host.addEventListener("click", function (event) {
        event.stopPropagation();
        if (!selected) selectRobot(robot.id);
      });
      host.addEventListener("input", function () {
        robot.host = host.value.trim();
        persist();
        syncButton();
      });
      host.addEventListener("keydown", function (event) {
        if (event.key === "Enter" && !button.disabled) button.click();
      });
      card.appendChild(host);

      card.addEventListener("click", function () {
        if (!selected) selectRobot(robot.id);
        else if (!looksLikeHost(robot.host)) host.focus();
      });
      card.addEventListener("keydown", function (event) {
        if (event.key === "Enter" && event.target === card && !button.disabled) button.click();
      });

      listEl.appendChild(card);
    });

    const add = document.createElement("button");
    add.type = "button";
    add.className = "robot-add";
    add.setAttribute("aria-label", "Add Jibo");
    add.innerHTML = '<span class="robot-add-plus">+</span><span class="robot-add-label">ADD JIBO</span>';
    add.addEventListener("click", addRobot);
    listEl.appendChild(add);

    syncButton();
  }

  function hideSplash() {
    splash.classList.add("is-leaving");
    setTimeout(function () {
      splash.classList.add("is-gone");
    }, 300);
  }

  function showConnecting() {
    phaseConnected.classList.remove("is-active");
    phaseConnecting.classList.add("is-active");
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    BamStars.start(starsConnecting);
    BamLottie.play(pairingLottie, "/apk/assets/pairing/pairing.json", {
      loop: true,
      assetsPath: "/apk/assets/pairing/"
    });
  }

  function hideConnecting() {
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    BamStars.stop(starsConnecting);
    BamLottie.stop(pairingLottie);
  }

  function showConnected() {
    return new Promise(function (resolve) {
      phaseConnecting.classList.remove("is-active");
      phaseConnected.classList.add("is-active");
      setTimeout(resolve, 1100);
    });
  }

  fetch("/api/status")
    .then(function (res) {
      return res.json();
    })
    .then(function (info) {
      if (info && info.connected) {
        window.location.href = "/scratch";
        return;
      }
      boot();
    })
    .catch(boot);

  function boot() {
    BamStars.start(starsPairing);
    loadRobots();
    renderList();
    if (sessionStorage.getItem(SPLASH_KEY)) {
      splash.classList.add("is-gone");
    } else {
      setTimeout(function () {
        sessionStorage.setItem(SPLASH_KEY, "1");
        hideSplash();
      }, 1000);
    }
  }

  document.getElementById("btn-refresh").addEventListener("click", function () {
    const cards = listEl.querySelectorAll(".robot-card");
    cards.forEach(function (card) {
      card.classList.remove("selected");
    });
    requestAnimationFrame(function () {
      renderList();
    });
  });

  document.getElementById("btn-back").addEventListener("click", function () {
    splash.classList.remove("is-gone", "is-leaving");
    sessionStorage.removeItem(SPLASH_KEY);
    setTimeout(function () {
      sessionStorage.setItem(SPLASH_KEY, "1");
      hideSplash();
    }, 1000);
  });

  button.addEventListener("click", async function () {
    const robot = selectedRobot();
    const host = robot && robot.host ? robot.host.trim() : "";
    if (!looksLikeHost(host)) return;
    persist();
    button.disabled = true;
    setStatus("");
    showConnecting();
    try {
      const response = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: host })
      });
      const body = await response.json();
      if (!response.ok || !body.connected) {
        throw new Error(body.message || "Couldn't reach :" + (body.port || "7160"));
      }
      await showConnected();
      window.location.href = "/scratch";
    } catch (err) {
      hideConnecting();
      setStatus(err.message || "Couldn't reach :7160", "error");
      syncButton();
    }
  });
})();
