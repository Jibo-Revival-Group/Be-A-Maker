(function () {
  const FACE_W = 1280;
  const FACE_H = 720;
  const HANDLE = 16;

  const stage = document.getElementById("screen-stage");
  const canvas = document.getElementById("screen-canvas");
  const emptyEl = document.getElementById("screen-empty");
  const fileInput = document.getElementById("screen-file");
  const rotateInput = document.getElementById("screen-rotate");
  const scaleInput = document.getElementById("screen-scale");
  const liveInput = document.getElementById("screen-live");
  const showBtn = document.getElementById("screen-show");
  const clearBtn = document.getElementById("screen-clear");
  const statusEl = document.getElementById("screen-status");
  const ctx = canvas.getContext("2d");

  let image = null;
  let x = FACE_W / 2;
  let y = FACE_H / 2;
  let scale = 1;
  let baseFit = 1;
  let rotation = 0;
  let drag = null;
  let connected = false;
  let live = false;
  let pushing = false;
  let pendingPush = false;
  let liveTimer = null;
  let pollTimer = null;

  function setStatus(message) {
    statusEl.textContent = message || "";
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function faceFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * FACE_W,
      y: ((event.clientY - rect.top) / rect.height) * FACE_H
    };
  }

  function corners() {
    if (!image) return [];
    const hw = (image.width / 2) * scale;
    const hh = (image.height / 2) * scale;
    const pts = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh]
    ];
    const rad = (rotation * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return pts.map(function (pt) {
      return {
        x: x + pt[0] * c - pt[1] * s,
        y: y + pt[0] * s + pt[1] * c
      };
    });
  }

  function rotateHandle() {
    if (!image) return null;
    const hh = (image.height / 2) * scale;
    const rad = (rotation * Math.PI) / 180;
    const dist = hh + 40;
    return {
      x: x + Math.sin(rad) * dist,
      y: y - Math.cos(rad) * dist
    };
  }

  function hitHandle(fx, fy) {
    const pts = corners();
    for (let i = 0; i < pts.length; i++) {
      if (Math.hypot(fx - pts[i].x, fy - pts[i].y) <= HANDLE) return { mode: "scale" };
    }
    const rot = rotateHandle();
    if (rot && Math.hypot(fx - rot.x, fy - rot.y) <= HANDLE) return { mode: "rotate" };
    return null;
  }

  function hitImage(fx, fy) {
    if (!image) return false;
    const dx = fx - x;
    const dy = fy - y;
    const rad = (-rotation * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const lx = (dx * c - dy * s) / scale;
    const ly = (dx * s + dy * c) / scale;
    return Math.abs(lx) <= image.width / 2 && Math.abs(ly) <= image.height / 2;
  }

  function draw(forBake) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, FACE_W, FACE_H);
    if (!image) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.drawImage(image, -image.width / 2, -image.height / 2);
    ctx.restore();
    if (forBake) return;

    const pts = corners();
    const rot = rotateHandle();
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "#f76e1e";
    ctx.lineWidth = 2;
    if (rot) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(rot.x, rot.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(rot.x, rot.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    pts.forEach(function (pt) {
      ctx.fillRect(pt.x - 7, pt.y - 7, 14, 14);
      ctx.strokeRect(pt.x - 7, pt.y - 7, 14, 14);
    });
  }

  function syncSliders() {
    rotateInput.value = String(Math.round(rotation));
    scaleInput.value = String(Math.round((scale / baseFit) * 100));
  }

  function syncButtons() {
    showBtn.disabled = !(connected && image);
    clearBtn.disabled = !connected;
  }

  function scheduleLive() {
    if (!live || !connected || !image) return;
    if (liveTimer) return;
    liveTimer = setTimeout(function () {
      liveTimer = null;
      pushFace();
    }, 500);
  }

  async function advertiseOrigin() {
    const loc = window.location;
    if (loc.hostname !== "localhost" && loc.hostname !== "127.0.0.1") {
      return loc.origin;
    }
    try {
      const lan = await fetch("/api/lan").then(function (res) {
        return res.json();
      });
      if (lan.origin) return lan.origin;
      if (lan.addresses && lan.addresses[0]) {
        return "http://" + lan.addresses[0] + ":" + lan.port;
      }
    } catch (_) {
      /* fall through */
    }
    return loc.origin;
  }

  async function pushFace() {
    if (!image) return;
    if (pushing) {
      pendingPush = true;
      return;
    }
    pushing = true;
    setStatus("Sending to Jibo…");
    try {
      draw(true);
      const dataUrl = canvas.toDataURL("image/png");
      draw(false);
      const saved = await fetch("/api/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "face-" + Date.now().toString(36),
          mime: "image/png",
          data: dataUrl
        })
      }).then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) throw new Error(body.message || "Could not save image.");
          return body;
        });
      });
      const origin = await advertiseOrigin();
      const shown = await fetch("/api/display", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId: saved.id, origin: origin })
      });
      const body = await shown.json();
      if (!shown.ok) throw new Error(body.message || "Display failed.");
      setStatus("Shown on Jibo.");
    } catch (err) {
      setStatus(err.message || "Could not show on Jibo.");
      draw(false);
    } finally {
      pushing = false;
      if (pendingPush) {
        pendingPush = false;
        pushFace();
      }
    }
  }

  async function refreshStatus() {
    try {
      const info = await fetch("/api/status").then(function (res) {
        return res.json();
      });
      connected = Boolean(info && info.connected);
    } catch (_) {
      connected = false;
    }
    syncButtons();
    if (!connected) {
      setStatus("Connect a Jibo to show this on the face.");
    } else if (statusEl.textContent === "Connect a Jibo to show this on the face.") {
      setStatus("");
    }
  }

  function loadFile(file) {
    if (!file || (!/^image\/(png|jpe?g)$/i.test(file.type) && !/\.(png|jpe?g)$/i.test(file.name || ""))) {
      setStatus("Use a PNG or JPEG image.");
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      image = img;
      baseFit = Math.min((FACE_W * 0.8) / img.width, (FACE_H * 0.8) / img.height) || 1;
      scale = baseFit;
      rotation = 0;
      x = FACE_W / 2;
      y = FACE_H / 2;
      emptyEl.classList.add("is-hidden");
      syncSliders();
      syncButtons();
      draw(false);
      setStatus("");
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      setStatus("Could not read that image.");
    };
    img.src = url;
  }

  function clearImage() {
    image = null;
    drag = null;
    emptyEl.classList.remove("is-hidden");
    syncButtons();
    draw(false);
  }

  async function clearScreen() {
    if (clearBtn.disabled) return;
    setStatus("Clearing screen…");
    try {
      const res = await fetch("/api/display", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear: true })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "Could not clear screen.");
      clearImage();
      setStatus("Screen cleared.");
    } catch (err) {
      setStatus(err.message || "Could not clear screen.");
    }
  }

  async function open() {
    if (window.BamCam) window.BamCam.close();
    stage.classList.add("is-open");
    stage.setAttribute("aria-hidden", "false");
    setStatus("");
    draw(false);
    clearInterval(pollTimer);
    pollTimer = setInterval(refreshStatus, 3000);
    await refreshStatus();
  }

  function close() {
    stage.classList.remove("is-open");
    stage.setAttribute("aria-hidden", "true");
    clearInterval(pollTimer);
    pollTimer = null;
    drag = null;
  }

  fileInput.addEventListener("change", function () {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (file) loadFile(file);
  });

  rotateInput.addEventListener("input", function () {
    rotation = Number(rotateInput.value) || 0;
    draw(false);
    scheduleLive();
  });

  scaleInput.addEventListener("input", function () {
    const pct = Number(scaleInput.value) || 100;
    scale = baseFit * (pct / 100);
    draw(false);
    scheduleLive();
  });

  liveInput.addEventListener("change", function () {
    live = liveInput.checked;
    if (live) scheduleLive();
  });

  showBtn.addEventListener("click", function () {
    if (showBtn.disabled) return;
    pushFace();
  });

  clearBtn.addEventListener("click", clearScreen);

  canvas.addEventListener("pointerdown", function (event) {
    if (!image) {
      fileInput.click();
      return;
    }
    const pt = faceFromEvent(event);
    const handle = hitHandle(pt.x, pt.y);
    if (handle && handle.mode === "scale") {
      drag = {
        mode: "scale",
        startDist: Math.max(8, Math.hypot(pt.x - x, pt.y - y)),
        startScale: scale
      };
    } else if (handle && handle.mode === "rotate") {
      drag = {
        mode: "rotate",
        startAngle: (Math.atan2(pt.y - y, pt.x - x) * 180) / Math.PI - rotation
      };
    } else if (hitImage(pt.x, pt.y) || hitHandle(pt.x, pt.y)) {
      drag = { mode: "move", dx: pt.x - x, dy: pt.y - y };
    } else {
      drag = { mode: "move", dx: pt.x - x, dy: pt.y - y };
    }
    canvas.classList.add("is-dragging");
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  canvas.addEventListener("pointermove", function (event) {
    if (!drag) return;
    const pt = faceFromEvent(event);
    if (drag.mode === "move") {
      x = clamp(pt.x - drag.dx, 0, FACE_W);
      y = clamp(pt.y - drag.dy, 0, FACE_H);
    } else if (drag.mode === "scale") {
      const dist = Math.max(8, Math.hypot(pt.x - x, pt.y - y));
      scale = clamp(drag.startScale * (dist / drag.startDist), baseFit * 0.05, baseFit * 4);
    } else if (drag.mode === "rotate") {
      rotation = (Math.atan2(pt.y - y, pt.x - x) * 180) / Math.PI - drag.startAngle;
      if (rotation > 180) rotation -= 360;
      if (rotation < -180) rotation += 360;
    }
    syncSliders();
    draw(false);
    scheduleLive();
  });

  function endDrag() {
    if (!drag) return;
    drag = null;
    canvas.classList.remove("is-dragging");
    if (live) pushFace();
  }

  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  canvas.addEventListener("wheel", function (event) {
    if (!image || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    scale = clamp(scale * factor, baseFit * 0.05, baseFit * 4);
    syncSliders();
    draw(false);
    scheduleLive();
  }, { passive: false });

  document.getElementById("btn-screen-back").addEventListener("click", close);
  document.getElementById("menu-screen").addEventListener("click", function () {
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
    if (window.BamCam) window.BamCam.close();
    open();
  });

  document.addEventListener("keydown", function (event) {
    if (!stage.classList.contains("is-open")) return;
    if (event.key === "Escape") {
      close();
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && !event.target.closest("input, textarea")) {
      event.preventDefault();
      if (connected) clearScreen();
      else clearImage();
    }
  });

  window.BamScreen = {
    open: open,
    close: close,
    isOpen: function () {
      return stage.classList.contains("is-open");
    }
  };

  draw(false);
})();
