(function () {
  const PROJECTS_KEY = "beamaker.projects";
  const CURRENT_KEY = "beamaker.currentProjectId";
  const LETTERS = "abcdefghijkl";

  const nameEl = document.getElementById("project-name");
  const btnNew = document.getElementById("btn-new");
  const btnEdit = document.getElementById("btn-edit");
  const btnSave = document.getElementById("btn-save");
  const drawer = document.getElementById("drawer");
  const drawerBackdrop = document.getElementById("drawer-backdrop");
  const projectsScreen = document.getElementById("projects-screen");
  const listEl = document.getElementById("project-list");
  const toast = document.getElementById("toast");
  const dialogRoot = document.getElementById("dialog-root");
  const dialogArt = document.getElementById("dialog-art");
  const dialogArtWrap = document.getElementById("dialog-art-wrap");
  const dialogTitle = document.getElementById("dialog-title");
  const dialogBody = document.getElementById("dialog-body");
  const dialogInput = document.getElementById("dialog-input");
  const dialogActions = document.getElementById("dialog-actions");
  const animSave = document.getElementById("anim-save");
  const animDelete = document.getElementById("anim-delete");
  const saveLottie = document.getElementById("save-lottie");
  const deleteLottie = document.getElementById("delete-lottie");
  const coolOverlay = document.getElementById("cool-overlay");
  const coolFab = document.getElementById("btn-cool-ideas");
  const coolTray = document.getElementById("cool-tray");
  const coolList = document.getElementById("cool-list");
  const coolLottieClose = document.getElementById("cool-lottie-close");
  const coolLottieOpen = document.getElementById("cool-lottie-open");

  function loadProjects() {
    try {
      return JSON.parse(localStorage.getItem(PROJECTS_KEY) || "[]");
    } catch (_) {
      return [];
    }
  }

  function saveProjects(projects) {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  }

  function currentId() {
    return localStorage.getItem(CURRENT_KEY);
  }

  function setCurrentId(id) {
    if (id) localStorage.setItem(CURRENT_KEY, id);
    else localStorage.removeItem(CURRENT_KEY);
  }

  function uuid() {
    return "p-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function emptyXml() {
    return '<xml xmlns="http://www.w3.org/1999/xhtml"></xml>';
  }

  function getName() {
    return (nameEl.textContent || "").trim() || "Jibo Project";
  }

  function setName(name) {
    nameEl.textContent = name || "Jibo Project";
  }

  function applyXml(xml) {
    if (typeof window.fromXml === "function" && xml) {
      try {
        window.fromXml(xml);
      } catch (err) {
        console.warn("Could not load project XML", err);
      }
    }
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function projectTime(project) {
    if (project.createdAt) return project.createdAt;
    const match = String(project.id || "").match(/^p-([a-z0-9]+)-/);
    if (match) {
      const t = parseInt(match[1], 36);
      if (t) return t;
    }
    return Date.now();
  }

  function formatDate(project) {
    const d = new Date(projectTime(project));
    return (
      pad(d.getDate()) +
      "/" +
      pad(d.getMonth() + 1) +
      "/" +
      d.getFullYear() +
      " " +
      pad(d.getHours()) +
      ":" +
      pad(d.getMinutes())
    );
  }

  function thumbFor(id) {
    let n = 0;
    String(id || "").split("").forEach(function (c) {
      n += c.charCodeAt(0);
    });
    return "/apk/mipmap/project_" + LETTERS[n % 12] + ".png";
  }

  function thumbSrc(project) {
    if (project.thumb) {
      return project.thumb + (project.thumbRev ? "?v=" + project.thumbRev : "");
    }
    return thumbFor(project.id);
  }

  let pendingThumbId = null;
  const thumbFile = document.getElementById("thumb-file");

  function fileToThumbDataUrl(file) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        const fit = Math.max(size / img.width, size / img.height);
        const w = img.width * fit;
        const h = img.height * fit;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read that image."));
      };
      img.src = url;
    });
  }

  function syncToolbar() {
    const hasProject = !!currentId();
    btnEdit.disabled = !hasProject;
    btnSave.disabled = !hasProject;
  }

  function openDrawer() {
    drawer.classList.add("is-open");
    drawerBackdrop.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
  }

  function closeDrawer() {
    drawer.classList.remove("is-open");
    drawerBackdrop.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
  }

  function openProjects() {
    closeDrawer();
    if (window.BamScreen) window.BamScreen.close();
    if (window.BamCam) window.BamCam.close();
    renderList();
    projectsScreen.classList.add("is-open");
    projectsScreen.setAttribute("aria-hidden", "false");
  }

  function closeProjects() {
    projectsScreen.classList.remove("is-open");
    projectsScreen.setAttribute("aria-hidden", "true");
  }

  function closeDialog() {
    dialogRoot.classList.remove("is-open");
    dialogRoot.setAttribute("aria-hidden", "true");
  }

  function openDialog(spec) {
    dialogTitle.textContent = spec.title || "";
    if (spec.image) {
      dialogArt.src = spec.image;
      dialogArtWrap.classList.remove("is-hidden");
    } else {
      dialogArtWrap.classList.add("is-hidden");
    }
    if (spec.thumbPick) {
      dialogArtWrap.classList.add("can-pick");
    } else {
      dialogArtWrap.classList.remove("can-pick");
    }
    if (spec.body) {
      dialogBody.hidden = false;
      dialogBody.textContent = spec.body;
    } else {
      dialogBody.hidden = true;
      dialogBody.textContent = "";
    }
    if (spec.input) {
      dialogInput.classList.remove("is-hidden");
      dialogInput.value = spec.value || "Jibo Project";
    } else {
      dialogInput.classList.add("is-hidden");
    }
    dialogActions.innerHTML = "";
    (spec.actions || []).forEach(function (action) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = action.className;
      btn.textContent = action.label;
      btn.addEventListener("click", action.onClick);
      dialogActions.appendChild(btn);
    });
    dialogRoot.classList.add("is-open");
    dialogRoot.setAttribute("aria-hidden", "false");
    if (spec.input) {
      setTimeout(function () {
        dialogInput.focus();
        dialogInput.select();
      }, 50);
    }
  }

  function playFeedback(kind) {
    const el = kind === "save" ? animSave : animDelete;
    const host = kind === "save" ? saveLottie : deleteLottie;
    const json = kind === "save" ? "/apk/assets/ok_jibo.json" : "/apk/assets/delete_jibo.json";
    el.classList.add("is-open");
    const anim = BamLottie.play(host, json, { loop: false });
    function done() {
      el.classList.remove("is-open");
      BamLottie.stop(host);
    }
    if (anim && typeof anim.addEventListener === "function") {
      anim.addEventListener("complete", function () {
        setTimeout(done, 350);
      });
    } else {
      setTimeout(done, 1600);
    }
  }

  function renderList() {
    const projects = loadProjects();
    listEl.innerHTML = "";

    const create = document.createElement("li");
    const createBtn = document.createElement("button");
    createBtn.type = "button";
    createBtn.className = "project-row";
    createBtn.innerHTML =
      '<span class="project-thumb"><img class="thumb" src="/apk/mipmap/create_icon.png" alt=""></span>' +
      '<span class="project-meta"><span class="name">Create new</span></span>';
    createBtn.addEventListener("click", openNewDialog);
    create.appendChild(createBtn);
    listEl.appendChild(create);

    projects.forEach(function (project) {
      const item = document.createElement("li");
      const row = document.createElement("div");
      row.className = "project-row";

      const open = document.createElement("button");
      open.type = "button";
      open.className = "project-open";
      open.addEventListener("click", function () {
        setCurrentId(project.id);
        setName(project.name || "Jibo Project");
        applyXml(project.xml);
        syncToolbar();
        closeProjects();
      });

      const thumb = document.createElement("span");
      thumb.className = "project-thumb";
      const img = document.createElement("img");
      img.className = "thumb";
      img.src = thumbSrc(project);
      img.alt = "";
      thumb.appendChild(img);

      const meta = document.createElement("span");
      meta.className = "project-meta";
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = project.name || "Jibo Project";
      const date = document.createElement("span");
      date.className = "date";
      date.textContent = formatDate(project);
      meta.appendChild(name);
      meta.appendChild(date);

      open.appendChild(thumb);
      open.appendChild(meta);

      const trash = document.createElement("button");
      trash.type = "button";
      trash.className = "trash";
      trash.setAttribute("aria-label", "Delete");
      const trashImg = document.createElement("img");
      trashImg.src = "/apk/mipmap/delete_icon.png";
      trashImg.alt = "";
      trash.appendChild(trashImg);
      trash.addEventListener("click", function (event) {
        event.stopPropagation();
        openDeleteDialog(project.id);
      });

      row.appendChild(open);
      row.appendChild(trash);
      item.appendChild(row);
      listEl.appendChild(item);
    });
  }

  function saveNow(xml, opts) {
    opts = opts || {};
    const projects = loadProjects();
    let id = currentId();
    let project = projects.find(function (entry) {
      return entry.id === id;
    });
    if (!project) {
      project = {
        id: uuid(),
        name: getName(),
        xml: xml || emptyXml(),
        createdAt: Date.now()
      };
      projects.push(project);
      setCurrentId(project.id);
    } else {
      project.name = getName() || project.name;
      if (xml) project.xml = xml;
      if (!project.createdAt) project.createdAt = projectTime(project);
    }
    saveProjects(projects);
    syncToolbar();
    renderList();
    if (opts.feedback) playFeedback("save");
  }

  function deleteProject(id) {
    saveProjects(
      loadProjects().filter(function (entry) {
        return entry.id !== id;
      })
    );
    if (currentId() === id) {
      setCurrentId(null);
      setName("Jibo Project");
      applyXml(emptyXml());
    }
    syncToolbar();
    renderList();
    playFeedback("delete");
  }

  function openNewDialog() {
    openDialog({
      title: "NEW PROJECT",
      image: "/apk/mipmap/project_name_img.png",
      input: true,
      value: "Jibo Project",
      actions: [
        {
          label: "Save",
          className: "btn-solid-orange",
          onClick: function () {
            const name = dialogInput.value.trim() || "Jibo Project";
            closeDialog();
            setCurrentId(null);
            setName(name);
            applyXml(emptyXml());
            saveNow(emptyXml());
          }
        }
      ]
    });
  }

  function openEditDialog() {
    const project = loadProjects().find(function (entry) {
      return entry.id === currentId();
    });
    openDialog({
      title: "PROJECT NAME",
      image: project ? thumbSrc(project) : "/apk/mipmap/project_e.png",
      thumbPick: true,
      input: true,
      value: getName(),
      actions: [
        {
          label: "DELETE PROJECT",
          className: "btn-outline-blue",
          onClick: function () {
            closeDialog();
            if (currentId()) openDeleteDialog(currentId());
          }
        },
        {
          label: "Save",
          className: "btn-solid-orange",
          onClick: function () {
            const name = dialogInput.value.trim() || getName();
            closeDialog();
            setName(name);
            saveNow();
          }
        }
      ]
    });
  }

  function openDeleteDialog(id) {
    openDialog({
      title: "ARE YOU SURE YOU WANT TO DELETE THIS PROJECT?",
      image: "/apk/mipmap/project_e.png",
      input: false,
      actions: [
        {
          label: "DELETE PROJECT",
          className: "btn-outline-blue",
          onClick: function () {
            closeDialog();
            deleteProject(id);
          }
        },
        {
          label: "Cancel",
          className: "btn-solid-orange",
          onClick: closeDialog
        }
      ]
    });
  }

  function openInfoDialog(title, body) {
    openDialog({
      title: title,
      image: null,
      body: body,
      input: false,
      actions: []
    });
  }

  function openDisconnectDialog() {
    openDialog({
      title: "Warning",
      image: null,
      body: "You're about to disconnect your Jibo. By disconnecting you will not be able to continue using the wordspace area.",
      input: false,
      actions: [
        {
          label: "Cancel",
          className: "btn-outline-blue",
          onClick: closeDialog
        },
        {
          label: "Disconnect",
          className: "btn-solid-orange",
          onClick: async function () {
            closeDialog();
            await fetch("/api/disconnect", { method: "POST" });
            window.location.href = "/";
          }
        }
      ]
    });
  }

  document.getElementById("btn-menu").addEventListener("click", openDrawer);
  document.getElementById("btn-close-drawer").addEventListener("click", closeDrawer);
  drawerBackdrop.addEventListener("click", closeDrawer);
  document.getElementById("menu-projects").addEventListener("click", openProjects);
  document.getElementById("btn-projects-back").addEventListener("click", closeProjects);
  document.getElementById("menu-help").addEventListener("click", function () {
    closeDrawer();
    openInfoDialog(
      "HELP",
      "Pick a saved Jibo on the pairing screen (name + IP), then CONNECT. ROM must be on this LAN (port 7160, or 8160 on community firmware). Snap blocks together and press the green flag to run. Use Edit to change a project’s thumbnail, Jibo Screen to put an image on the face, Jibo Cam for a live camera view, or Cool ideas at the bottom for starter projects."
    );
  });
  document.getElementById("menu-about").addEventListener("click", function () {
    closeDrawer();
    openInfoDialog(
      "ABOUT",
      "Be a Maker is Jibo’s Scratch companion. This web build is a Jibo Revival Group preservation project and is not affiliated with Jibo Inc. or NTT Disruption."
    );
  });
  document.getElementById("btn-disconnect").addEventListener("click", function () {
    closeDrawer();
    openDisconnectDialog();
  });
  document.getElementById("dialog-close").addEventListener("click", closeDialog);
  dialogArtWrap.addEventListener("click", function () {
    if (!dialogArtWrap.classList.contains("can-pick")) return;
    const id = currentId();
    if (!id) return;
    pendingThumbId = id;
    thumbFile.click();
  });
  dialogRoot.addEventListener("click", function (event) {
    if (event.target === dialogRoot) closeDialog();
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeDialog();
      setCoolOpen(false);
      closeDrawer();
      if (window.BamScreen) window.BamScreen.close();
      if (window.BamCam) window.BamCam.close();
    }
  });

  btnNew.addEventListener("click", openNewDialog);
  btnEdit.addEventListener("click", openEditDialog);
  btnSave.addEventListener("click", function () {
    if (typeof window.toXml === "function") window.toXml();
  });

  const BLANK_SB2 = {
    objName: "Stage",
    sounds: [],
    costumes: [],
    currentCostumeIndex: 0,
    tempoBPM: 60,
    children: [
      {
        objName: "Sprite1",
        scripts: [],
        sounds: [],
        costumes: [],
        currentCostumeIndex: 0,
        scratchX: 0,
        scratchY: 0,
        scale: 1,
        direction: 90,
        rotationStyle: "normal",
        isDraggable: false,
        visible: true
      }
    ]
  };

  function vm() {
    return window.Scratch && Scratch.vm;
  }

  function menuEsml(label) {
    if (typeof label !== "string" || label.indexOf("<") !== -1) return label;
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

  function hookJiboMenus() {
    if (!window.jibo || window.jibo._bamMenuHooked) return;
    window.jibo._bamMenuHooked = true;
    const orig = window.jibo.execute.bind(window.jibo);
    window.jibo.execute = function (blockType, args, isSound) {
      const next = Array.isArray(args) ? args.slice() : args;
      if (String(blockType).toLowerCase() === "say" && Array.isArray(next)) {
        next[0] = menuEsml(next[0]);
      }
      return orig(blockType, next, isSound);
    };
  }

  let targetReady = null;

  function ensureTarget() {
    if (!targetReady) {
      targetReady = (async function () {
        const instance = vm();
        if (!instance) {
          targetReady = null;
          return null;
        }
        hookJiboMenus();
        try {
          if (!instance.editingTarget) {
            await instance.loadProject(JSON.stringify(BLANK_SB2));
          }
          if (instance.runtime && !instance.runtime._steppingInterval) instance.start();
          return instance;
        } catch (err) {
          targetReady = null;
          throw err;
        }
      })();
    }
    return targetReady;
  }

  function restoreCurrentProject() {
    const id = currentId();
    const project = loadProjects().find(function (entry) {
      return entry.id === id;
    });
    if (project) {
      setName(project.name || "Jibo Project");
      applyXml(project.xml);
    }
    syncToolbar();
  }

  function workspaceXml() {
    const workspace = window.Scratch && Scratch.workspace;
    if (!workspace || typeof Blockly === "undefined") return "";
    return Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(workspace));
  }

  function vmScriptCount(instance) {
    const targets = (instance.runtime && instance.runtime.targets) || [];
    let count = 0;
    targets.forEach(function (target) {
      const scripts = target.blocks && target.blocks.getScripts && target.blocks.getScripts();
      if (scripts) count += scripts.length;
    });
    return count;
  }

  function hasFlagHat(instance) {
    const targets = (instance.runtime && instance.runtime.targets) || [];
    for (let t = 0; t < targets.length; t++) {
      const blocks = targets[t].blocks && targets[t].blocks._blocks;
      if (!blocks) continue;
      for (const id of Object.keys(blocks)) {
        if (blocks[id] && blocks[id].opcode === "event_whenflagclicked") return true;
      }
    }
    return false;
  }

  function syncWorkspaceToVm(instance) {
    const workspace = window.Scratch && Scratch.workspace;
    if (!workspace || !instance || !instance.editingTarget) return;
    const top = workspace.getTopBlocks ? workspace.getTopBlocks(false) : [];
    if (top.length && vmScriptCount(instance) === 0) {
      applyXml(workspaceXml());
    }
  }

  function startLooseStacks(instance) {
    const runtime = instance.runtime;
    if (!runtime) return 0;
    let started = 0;
    (runtime.targets || []).forEach(function (target) {
      const scripts = target.blocks && target.blocks.getScripts && target.blocks.getScripts();
      (scripts || []).forEach(function (topId) {
        runtime.toggleScript(topId, { target: target, stackClick: true });
        started += 1;
      });
    });
    return started;
  }

  let toastTimer = null;
  function flashHint(text) {
    toast.textContent = text;
    toast.classList.add("is-open");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove("is-open");
    }, 4500);
  }

  thumbFile.addEventListener("change", async function () {
    const file = thumbFile.files && thumbFile.files[0];
    const id = pendingThumbId;
    thumbFile.value = "";
    pendingThumbId = null;
    if (!file || !id) return;
    try {
      const dataUrl = await fileToThumbDataUrl(file);
      const res = await fetch("/api/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "thumbs/" + id,
          mime: "image/png",
          data: dataUrl
        })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "Could not save thumbnail.");
      const projects = loadProjects();
      const project = projects.find(function (entry) {
        return entry.id === id;
      });
      if (!project) return;
      project.thumb = body.url;
      project.thumbRev = Date.now();
      saveProjects(projects);
      renderList();
      if (currentId() === id) {
        dialogArt.src = project.thumb + "?v=" + project.thumbRev;
      }
    } catch (err) {
      flashHint(err.message || "Could not set thumbnail.");
    }
  });

  async function go() {
    const instance = await ensureTarget();
    if (!instance) {
      flashHint("Scratch is still starting… try the green flag again");
      return;
    }
    if (instance.runtime && !instance.runtime._steppingInterval) instance.start();
    syncWorkspaceToVm(instance);
    if (hasFlagHat(instance)) {
      instance.greenFlag();
      return;
    }
    instance.stopAll();
    const started = startLooseStacks(instance);
    if (!started) {
      flashHint("Snap a “when green flag clicked” hat on your stack, then press the green flag");
    }
  }

  function stop() {
    const instance = vm();
    if (instance) instance.stopAll();
  }

  document.getElementById("greenflag").addEventListener("click", go);
  document.getElementById("stopall").addEventListener("click", stop);

  window.addEventListener("bam-save", function (event) {
    const detail = event.detail || {};
    if (detail.action === "Save" && detail.arg) saveNow(detail.arg, { feedback: true });
  });

  function hookWorkspace() {
    const workspace = window.Scratch && Scratch.workspace;
    if (!workspace || workspace._bamHooked) return;
    workspace._bamHooked = true;
    workspace.addChangeListener(function () {
      if (!btnSave.disabled) return;
      const blocks = workspace.getAllBlocks ? workspace.getAllBlocks(false) : [];
      if (blocks.length) btnSave.disabled = false;
    });
  }

  window.addEventListener("bam-scratch-ready", function () {
    hookWorkspace();
    ensureTarget()
      .then(restoreCurrentProject)
      .catch(function (err) {
        console.error("could not restore project", err);
      });
  });

  fetch("/api/status")
    .then(function (res) {
      return res.json();
    })
    .then(function (status) {
      if (!status.connected) {
        window.location.href = "/";
      }
    })
    .catch(function () {
      window.location.href = "/";
    });

  renderList();
  syncToolbar();

  let coolOpen = false;
  function setCoolOpen(open) {
    coolOpen = open;
    coolOverlay.classList.toggle("is-open", open);
    coolTray.classList.toggle("is-open", open);
    coolFab.classList.toggle("is-open", open);
    coolFab.setAttribute("aria-expanded", open ? "true" : "false");
    coolTray.setAttribute("aria-hidden", open ? "false" : "true");
    coolLottieClose.classList.toggle("is-active", !open);
    coolLottieOpen.classList.toggle("is-active", open);
    if (open) {
      BamLottie.play(coolLottieOpen, "/apk/assets/coolIdeasLottieButton_closed_iPhone.json", { loop: false });
    } else {
      BamLottie.play(coolLottieClose, "/apk/assets/coolIdeasLottieButton_iPhone.json", { loop: false });
    }
  }

  coolFab.addEventListener("click", function () {
    setCoolOpen(!coolOpen);
  });
  coolOverlay.addEventListener("click", function () {
    setCoolOpen(false);
  });

  function loadCoolIdeas() {
    fetch("/api/cool-ideas")
      .then(function (res) {
        return res.json();
      })
      .then(function (ideas) {
        coolList.innerHTML = "";
        (ideas || []).forEach(function (idea) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "cool-item";
          const img = document.createElement("img");
          img.src = "/apk/mipmap/" + idea.previewImage + ".png";
          img.alt = "";
          const span = document.createElement("span");
          span.textContent = idea.name || "Cool idea";
          btn.appendChild(img);
          btn.appendChild(span);
          btn.addEventListener("click", function () {
            applyXml(idea.commandXML);
            btnSave.disabled = false;
            setCoolOpen(false);
          });
          coolList.appendChild(btn);
        });
      })
      .catch(function (err) {
        console.warn("Could not load cool ideas", err);
      });
  }

  loadCoolIdeas();
  BamLottie.play(coolLottieClose, "/apk/assets/coolIdeasLottieButton_iPhone.json", { loop: false });

  const prevLoad = window.onload;
  window.onload = async function () {
    try {
      if (typeof prevLoad === "function") prevLoad.call(window);
    } catch (err) {
      console.error("playground init failed", err);
    }
    try {
      hookWorkspace();
      await ensureTarget();
      restoreCurrentProject();
    } catch (err) {
      console.error("could not start blank project", err);
    }
  };
})();
