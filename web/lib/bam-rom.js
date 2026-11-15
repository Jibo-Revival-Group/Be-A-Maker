'use strict';

const http = require('http');
const WebSocket = require('ws');
const { Client, AttentionMode } = require('rom-control');

const ROM_PORTS = [7160, 8160];
const CONNECT_MS = 12000;

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asList(args) {
  if (args == null) return [];
  return Array.isArray(args) ? args : [args];
}

function looksLikeEsml(text) {
  return /<(anim|sfx|break|pitch|phoneme|duration|style)\b/i.test(String(text || ''));
}

/**
 * BAM menus use ESML `meta='&(rom)'` / `meta='!(hf), &(airplane)'`.
 * rom-control's say() sanitizer turns `&` into `and`, which kills the lookup.
 * Convert those filters to BEam-style `filter=` and drop the ROM-pack marker.
 */
function rewriteBamMeta(esml) {
  return String(esml || '').replace(/\smeta=(['"])([^'"]*)\1/gi, (_full, quote, meta) => {
    const parts = [];
    const re = /(!|&)\(([^)]*)\)/g;
    let match;
    while ((match = re.exec(meta))) {
      const names = match[2]
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
      for (const name of names) {
        if (match[1] === '&' && name.toLowerCase() === 'rom') continue;
        parts.push(match[1] === '!' ? '!' + name : name);
      }
    }
    if (!parts.length) return '';
    return ` filter=${quote}${parts.join(', ')}${quote}`;
  });
}

async function sayOnRobot(client, text) {
  const prepared = rewriteBamMeta(text);
  if (looksLikeEsml(prepared) && client._conn && typeof client._conn.say === 'function') {
    const txId = client._conn.say(prepared);
    const finished = await client._conn.awaitDone(txId, 30000);
    if (!finished) {
      throw Object.assign(new Error('Animation/say timed out'), { code: 'SAY_TIMEOUT' });
    }
    return;
  }
  await client.behavior.say(prepared);
}

function httpPostJson(host, port, path, body) {
  return new Promise((resolve, reject) => {
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    const req = http.request(
      {
        host,
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => resolve(data));
      }
    );
    req.setTimeout(4000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function extractSpeech(body) {
  if (!body) return '';
  if (typeof body === 'string') return body.trim();
  const nested = body.listen || body.Listen || body;
  const value =
    nested.Speech ||
    nested.speech ||
    nested.Result ||
    nested.result ||
    body.Speech ||
    body.speech ||
    body.Result ||
    body.result ||
    '';
  return String(value).trim();
}

function listenLocalAsr(host, timeMs, asrPort = 8088) {
  return new Promise((resolve) => {
    let done = false;
    let asrWs = null;
    const taskId = 'bam-' + Date.now() + '-' + Math.floor(Math.random() * 1e9);
    const reqId = 'start-' + Date.now();

    const finish = (text) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (asrWs) {
        try {
          asrWs.terminate();
        } catch (_) {
          /* ignore */
        }
        asrWs = null;
      }
      httpPostJson(host, asrPort, '/asr_simple_interface', {
        command: 'stop',
        task_id: taskId,
        request_id: 'stop-' + Date.now()
      }).catch(() => {});
      resolve(text || '');
    };

    const timer = setTimeout(() => finish(''), timeMs + 1500);

    try {
      asrWs = new WebSocket('ws://' + host + ':' + asrPort + '/simple_port');
    } catch (_) {
      finish('');
      return;
    }

    asrWs.on('open', () => {
      httpPostJson(host, asrPort, '/asr_simple_interface', {
        command: 'start',
        task_id: taskId,
        request_id: reqId,
        audio_source_id: 'alsa1',
        hotphrase: 'none',
        speech_to_text: true
      }).catch(() => {
        /* ROM Listen may still return a transcript */
      });
    });

    asrWs.on('message', (data) => {
      let evt;
      try {
        evt = JSON.parse(String(data));
      } catch (_) {
        return;
      }
      const evType = evt.event_type || evt.eventType || evt.event || evt.type;
      if (evType !== 'speech_to_text_final') return;
      const utterances = evt.utterances || evt.Utterances || (evt.payload && evt.payload.utterances);
      const first = Array.isArray(utterances) ? utterances[0] : utterances;
      const text =
        typeof first === 'string'
          ? first
          : String((first && (first.utterance || first.Utterance || first.text)) || '');
      if (text.trim()) finish(text.trim());
    });

    asrWs.on('error', () => {
      /* 8088 is often LAN-closed; keep waiting for ROM */
    });
  });
}

function listenRomTranscript(conn, txId, timeMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (text) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      conn.removeListener('onListenResult', onResult);
      conn.removeListener('event', onEvent);
      resolve(text || '');
    };
    const timer = setTimeout(() => finish(''), timeMs + 1500);

    function take(body) {
      const text = extractSpeech(body);
      if (text) finish(text);
    }

    function onResult(id, body) {
      if (id && id !== txId) return;
      take(body);
    }

    function onEvent(id, body) {
      if (id && id !== txId) return;
      if (!body) return;
      if (body.Event === 'onListenResult' || body.Speech || body.listen || body.Result) {
        take(body);
      }
    }

    conn.on('onListenResult', onResult);
    conn.on('event', onEvent);
  });
}

function firstNonEmpty(promises, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      const text = String(value || '').trim();
      if (!text || settled) return;
      settled = true;
      resolve(text);
    };
    promises.forEach((promise) => {
      Promise.resolve(promise).then(settle).catch(() => {});
    });
    setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve('');
    }, timeoutMs);
  });
}

async function listenOnRobot(client, timeMs = 15000) {
  const conn = client._conn;
  if (!conn) return '';
  await new Promise((resolve) => setTimeout(resolve, 300));
  const romTxId = conn.listen(timeMs, Math.min(8000, timeMs), 'en');
  try {
    return await firstNonEmpty(
      [listenLocalAsr(conn.host, timeMs), listenRomTranscript(conn, romTxId, timeMs)],
      timeMs + 2000
    );
  } finally {
    try {
      if (romTxId) conn.cancel(romTxId);
    } catch (_) {
      /* ignore */
    }
  }
}

class BamRom {
  constructor() {
    this.client = null;
    this.host = null;
    this.port = null;
    this.listeners = new Set();
    this._displayChain = Promise.resolve();
    this._cameraReq = null;
  }

  get connected() {
    return Boolean(this.client && this.client.connected);
  }

  onMessage(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(msg) {
    for (const fn of this.listeners) {
      try {
        fn(msg);
      } catch (err) {
        console.error('bam-rom listener failed', err);
      }
    }
  }

  status() {
    return {
      connected: this.connected,
      host: this.host,
      port: this.port
    };
  }

  async connect(host) {
    const trimmed = String(host || '').trim();
    if (!trimmed) {
      throw new Error('Enter a robot IP address.');
    }

    await this.disconnect();

    let lastError = null;
    for (const port of ROM_PORTS) {
      let client = null;
      try {
        client = new Client({
          host: trimmed,
          port,
          autoReconnect: false,
          autoHeartbeat: true,
          autoSubscribe: true
        });
        client.on('error', (err) => {
          this.emit({
            type: 'status',
            state: 'error',
            message: err && err.message ? err.message : String(err)
          });
        });
        await Promise.race([
          client.connect(),
          new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error(`Timed out connecting to ${trimmed}:${port}`));
            }, CONNECT_MS);
          })
        ]);
        this.client = client;
        this.host = trimmed;
        this.port = port;
        this._bindEvents(client);
        try {
          await client.behavior.setAttention(AttentionMode.Engaged);
        } catch (_) {
          /* attention is best-effort */
        }
        return this.status();
      } catch (err) {
        lastError = err;
        try {
          if (client) client.destroy();
        } catch (_) {
          /* ignore */
        }
        this.client = null;
      }
    }

    const detail = lastError && lastError.message ? lastError.message : String(lastError || 'unknown error');
    throw new Error(
      `Couldn't reach ROM on ${trimmed}:7160 (also tried :8160). ${detail} — check the IP, that the robot is on this LAN, and that ROM / developer mode is on.`
    );
  }

  _queueDisplay(fn) {
    const next = this._displayChain.then(fn, fn);
    this._displayChain = next.then(
      () => {},
      () => {}
    );
    return next;
  }

  async showImage(uri, name) {
    if (!this.connected) {
      throw new Error('Not connected to a Jibo.');
    }
    const client = this.client;
    const assetName = String(name || 'bam-face').slice(0, 255);
    return this._queueDisplay(async () => {
      try {
        await client.assets.fetch(uri, assetName);
      } catch (err) {
        console.warn('FetchAsset failed, Display will load src', err && err.message ? err.message : err);
      }
      client.display.showImage(uri, assetName);
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
  }

  async showEye() {
    if (!this.connected) {
      throw new Error('Not connected to a Jibo.');
    }
    const client = this.client;
    return this._queueDisplay(async () => {
      client.display.showEye();
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
  }

  _mediaTarget(uri) {
    const fallback = { host: this.host, port: this.port, path: '/' };
    if (!uri) return fallback;
    if (/^https?:\/\//i.test(uri)) {
      try {
        const parsed = new URL(uri);
        let host = parsed.hostname;
        if (host === '127.0.0.1' || host === 'localhost' || host === '::1') {
          host = this.host;
        }
        return {
          host,
          port: Number(parsed.port) || this.port,
          path: parsed.pathname + parsed.search
        };
      } catch (_) {
        return fallback;
      }
    }
    return {
      host: this.host,
      port: this.port,
      path: uri.startsWith('/') ? uri : '/' + uri
    };
  }

  stopCamera() {
    const req = this._cameraReq;
    this._cameraReq = null;
    if (req) {
      try {
        req.destroy();
      } catch (_) {
        /* ignore */
      }
    }
    if (this.client && this.client.camera) {
      try {
        this.client.camera.stopVideo();
      } catch (_) {
        /* ignore */
      }
    }
  }

  async pipeCamera(res) {
    this.stopCamera();
    if (!this.connected) {
      throw new Error('Not connected to a Jibo.');
    }
    const stream = await this.client.camera.startVideo();
    const target = this._mediaTarget(stream && stream.uri);
    await new Promise((resolve, reject) => {
      const req = http.get(
        { host: target.host, port: target.port, path: target.path },
        (robotRes) => {
          if (res.headersSent) {
            robotRes.resume();
            resolve();
            return;
          }
          const type =
            robotRes.headers['content-type'] || 'multipart/x-mixed-replace; boundary=frame';
          res.writeHead(robotRes.statusCode || 200, {
            'Content-Type': type,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
            Connection: 'close',
            'X-Accel-Buffering': 'no'
          });
          robotRes.pipe(res);
          const stop = () => {
            try {
              robotRes.destroy();
            } catch (_) {
              /* ignore */
            }
            try {
              req.destroy();
            } catch (_) {
              /* ignore */
            }
            this.stopCamera();
            resolve();
          };
          res.on('close', stop);
          robotRes.on('end', stop);
          robotRes.on('error', stop);
        }
      );
      req.on('error', (err) => {
        this.stopCamera();
        reject(err);
      });
      this._cameraReq = req;
    });
  }

  async disconnect() {
    this.stopCamera();
    const client = this.client;
    this.client = null;
    this.host = null;
    this.port = null;
    this._displayChain = Promise.resolve();
    if (!client) return;
    try {
      if (typeof client.destroy === 'function') client.destroy();
      else if (typeof client.disconnect === 'function') client.disconnect();
    } catch (_) {
      /* ignore */
    }
  }

  _bindEvents(client) {
    client.on('disconnect', () => {
      this.emit({ type: 'status', state: 'disconnected' });
    });
    client.on('error', (err) => {
      this.emit({
        type: 'status',
        state: 'error',
        message: err && err.message ? err.message : String(err)
      });
    });
    client.on('headTouch', () => {
      this.emit({
        type: 'eventCallback',
        data: JSON.stringify({ HeadSensors: true })
      });
    });
    client.on('gesture', (event) => {
      if (event && event.isTap && event.coordinate) {
        this.emit({
          type: 'eventCallback',
          data: JSON.stringify({
            gesture: { Coordinate: [event.coordinate.x, event.coordinate.y] }
          })
        });
      } else if (event && event.isSwipe) {
        this.emit({
          type: 'eventCallback',
          data: JSON.stringify({
            gesture: { Direction: event.direction }
          })
        });
      }
    });
    const sendTracks = () => {
      const tracks = [...client.tracks.values()].map((track) => ({
        WorldCoords: track.worldCoords
          ? [track.worldCoords.x, track.worldCoords.y, track.worldCoords.z]
          : [0, 0, 0]
      }));
      this.emit({
        type: 'eventCallback',
        data: JSON.stringify({ type: 'onEntityUpdate', tracks })
      });
    };
    client.on('trackCreate', sendTracks);
    client.on('trackUpdate', sendTracks);
    client.on('trackDelete', sendTracks);
    client.on('motionDetected', (motion) => {
      const zones = (motion && motion.zones) || [];
      const motions = zones.map((zone) => ({
        WorldCoords: zone.worldCoords
          ? [zone.worldCoords.x, zone.worldCoords.y, zone.worldCoords.z]
          : [0, 0, 0]
      }));
      this.emit({
        type: 'eventCallback',
        data: JSON.stringify({ motions: motions.length ? motions : [{ WorldCoords: [0, 0, 0] }] })
      });
    });
  }

  async handleCommand({ block_type, args, block_id }) {
    const type = String(block_type || '').toLowerCase();
    const list = asList(args);
    const client = this.client;

    const done = () => {
      if (block_id) this.emit({ type: 'eventHandler', block_id });
    };

    if (!client || !client.connected) {
      if (type === 'get_config') {
        this.emit({
          type: 'eventCallback',
          data: JSON.stringify({ config: { Mixers: { Master: 0.8 } } })
        });
      }
      done();
      return;
    }

    const txId = block_id || `tx-${Date.now()}`;
    this.emit({ type: 'transactionCallback', trans_id: String(txId), block_id });

    try {
      switch (type) {
        case 'say':
          await sayOnRobot(client, String(list[0] || ''));
          break;
        case 'listen': {
          const text = await listenOnRobot(client, 15000);
          console.log('BAM listen', text || '(empty)');
          this.emit({
            type: 'eventCallback',
            data: JSON.stringify({ listen: { Speech: text } })
          });
          break;
        }
        case 'lookat':
          await client.behavior.lookAt({
            Angle: [num(list[0]), num(list[1])]
          });
          break;
        case 'lookat3d':
          await client.behavior.lookAtPosition(
            num(list[0]) * 1000,
            num(list[1]) * 1000,
            num(list[2]) * 1000
          );
          break;
        case 'takephoto':
          await client.camera.takePhoto();
          break;
        case 'get_config':
          this.emit({
            type: 'eventCallback',
            data: JSON.stringify({ config: { Mixers: { Master: 0.8 } } })
          });
          break;
        case 'set_config':
          await client.audio.setVolume(Math.max(0.1, Math.min(1, num(list[0], 0.8))));
          break;
        case 'cancel': {
          const id = Array.isArray(args) ? args[0] : args;
          if (client._conn && id && typeof client._conn.cancel === 'function') {
            client._conn.cancel(id);
          }
          break;
        }
        default:
          break;
      }
    } catch (err) {
      console.error('ROM command failed', type, err);
    } finally {
      done();
    }
  }
}

module.exports = { BamRom };
