'use strict';
// BamRom with a stand-in rom-control Client: a robot error after connecting is reported once (it was twice).
const assert = require('assert');
const EventEmitter = require('events');
const Module = require('module');

class FakeClient extends EventEmitter {
  constructor(opts) { super(); this.port = opts.port; this.connected = false; this.behavior = { setAttention: async () => {} }; this.tracks = new Map(); }
  async connect() {
    if (this.port === 7160) { this.emit('error', new Error('refused')); throw new Error('refused'); } // stock ROM port closed, like on 5x1
    this.connected = true;
  }
  destroy() { this.connected = false; }
}
const load = Module._load;
Module._load = function (name) {
  return name === 'rom-control' ? { Client: FakeClient, AttentionMode: { Engaged: 'Engaged' } } : load.apply(this, arguments);
};
const { BamRom } = require('../lib/bam-rom');
Module._load = load;

(async () => {
  const rom = new BamRom(), seen = [];
  rom.onMessage((msg) => seen.push(msg));
  const status = await rom.connect('10.0.0.5');
  assert.deepStrictEqual(status, { connected: true, host: '10.0.0.5', port: 8160 }, 'falls back to 8160');
  assert.deepStrictEqual(seen, [], 'the failed 7160 attempt is not reported as a robot error');
  rom.client.emit('error', new Error('socket hang up'));
  assert.deepStrictEqual(seen.filter((m) => m.state === 'error').map((m) => m.message), ['socket hang up'], 'one error message');
  console.log('bam-rom: ok');
})().catch((err) => { console.error(err); process.exitCode = 1; });
