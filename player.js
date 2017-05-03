var soundbox;
(function() {
"use strict";
soundbox = {};

var audioCtx = new AudioContext();
var WAVE_SPS = audioCtx.sampleRate;

soundbox.audioCtx = audioCtx;

const waveforms = [
  "sine",
  "square",
  "sawtooth",
  "triangle",
];

const filters = [
  "highpass",
  "lowpass",
  "bandpass",
];

// Handles one column through entire song
soundbox.ColumnGenerator = function(instr, rowLen, notes, effects) {
  var osc1t = waveforms[instr.i[0]],
      o1vol = instr.i[1] / 255,
      o1xenv = instr.i[3],
      osc2t = waveforms[instr.i[4]],
      o2vol = instr.i[5] / 255,
      o2xenv = instr.i[8],
      noiseVol = instr.i[9] / 255,
      attack = instr.i[10] * instr.i[10] * 4 / 44100,
      sustain = instr.i[11] * instr.i[11] * 4 / 44100,
      release = instr.i[12] * instr.i[12] * 4 / 44100,
      arp = instr.i[13],
      arpInterval = rowLen * Math.pow(2, 2 - instr.i[14]);

  // from generate()
  var oscLFO = waveforms[instr.i[15]],
      lfoAmt = instr.i[16] / 255,
      lfoFreq = Math.pow(2, instr.i[17] - 9) / rowLen * 2,
      fxLFO = instr.i[18],
      fxFilter = instr.i[19],
      fxFreq = instr.i[20] * 20,
      q = 1 - instr.i[21] / 255,
      dist = instr.i[22] * 1e-5,
      drive = instr.i[23] / 32,
      panAmt = instr.i[24] / 512,
      panFreq = 6.283184 * Math.pow(2, instr.i[25] - 9) / rowLen,
      dlyAmt = instr.i[26] / 255,
      dly = instr.i[27] * rowLen;

    // master
    var preFilter = audioCtx.createGain();
    preFilter.gain.value = 1;
    var postFilter = audioCtx.createGain();
    postFilter.gain.value = 1;

    // oscillators
    var osc1env = audioCtx.createGain();
    osc1env.gain.value = 0;
    var osc2env = audioCtx.createGain();
    osc2env.gain.value = 0;
    var osc3env = audioCtx.createGain();
    osc3env.gain.value = 0;

    let osc1 = audioCtx.createOscillator();
    osc1.type = osc1t;
    let osc2 = audioCtx.createOscillator();
    osc2.type = osc2t;
    // white noise
    let osc3 = audioCtx.createScriptProcessor(2048, 1, 1);
    osc3.onaudioprocess = function(e) {
        var output = e.outputBuffer.getChannelData(0);
        for (var i = 0; i < 2048; i++) {
            output[i] = Math.random() * 2 - 1;
        }
    }
    osc1.connect(osc1env);
    osc2.connect(osc2env);
    osc3.connect(osc3env);
    osc1env.connect(preFilter);
    osc2env.connect(preFilter);
    osc3env.connect(preFilter);

    // delay
    let delayGain = audioCtx.createGain();
    delayGain.gain.value = dlyAmt;
    delayGain.connect(postFilter);

    let delay = audioCtx.createDelay();
    delay.delayTime.value = dly;
    delay.connect(delayGain);

    // filter
    let biquadFilter = audioCtx.createBiquadFilter();
    preFilter.connect(biquadFilter);
    biquadFilter.connect(delay);
    biquadFilter.connect(postFilter);
    biquadFilter.type = filters[fxFilter - 1];
    biquadFilter.frequency.value = fxFreq;
    biquadFilter.Q.value = q;

    if (fxLFO) {
      // lfo
      var lfo = audioCtx.createOscillator();
      lfo.type = oscLFO;
      lfo.frequency.value = lfoFreq;

      var modulationGain = audioCtx.createGain();
      // TODO: whats the correct value?
      modulationGain.gain.value = lfoAmt * 1000;
      //modulationGain.gain.value = 1000;
      lfo.connect(modulationGain);

      modulationGain.connect(biquadFilter.frequency);
      lfo.start();
    }

    let t = audioCtx.currentTime;

    // TODO: arpeggio
    //var o1t = getnotefreq(n + (arp & 15) + instr.i[2] - 128);
    //var o2t = getnotefreq(n + (arp & 15) + instr.i[6] - 128) * (1 + 0.0008 * instr.i[7]);
    notes.forEach((note, index) => {
      if (!note) return;

      //let startTime = t + rowLen * index;
      let startTime = rowLen * index;
      let osc1freq = 440 * Math.pow(2, (note + instr.i[2] - 272) / 12);
      let osc2freq = 440 * Math.pow(2, (note + instr.i[6] - 272 + 0.008 * instr.i[7]) / 12);
      osc1.frequency.setValueAtTime(osc1freq, startTime);
      osc2.frequency.setValueAtTime(osc2freq, startTime);

      if (o1xenv) {
        osc1.frequency.setValueAtTime(0, startTime);
        osc1.frequency.linearRampToValueAtTime(osc1freq, startTime + attack);
        // sustain
        osc1.frequency.setValueAtTime(osc1freq, startTime + attack + sustain);
        // release
        osc1.frequency.linearRampToValueAtTime(0, startTime + attack + sustain + release);
      }

      if (o2xenv) {
        osc2.frequency.setValueAtTime(0, startTime);
        osc2.frequency.linearRampToValueAtTime(osc2freq, startTime + attack);
        // sustain
        osc2.frequency.setValueAtTime(osc2freq, startTime + attack + sustain);
        // release
        osc2.frequency.linearRampToValueAtTime(0, startTime + attack + sustain + release);
      }

      // attack
      osc1env.gain.setValueAtTime(0, startTime);
      osc2env.gain.setValueAtTime(0, startTime);
      osc3env.gain.setValueAtTime(0, startTime);
      osc1env.gain.linearRampToValueAtTime(o1vol, startTime + attack);
      osc2env.gain.linearRampToValueAtTime(o2vol, startTime + attack);
      osc3env.gain.linearRampToValueAtTime(noiseVol, startTime + attack);
      // sustain
      osc1env.gain.setValueAtTime(o1vol, startTime + attack + sustain);
      osc2env.gain.setValueAtTime(o2vol, startTime + attack + sustain);
      osc3env.gain.setValueAtTime(noiseVol, startTime + attack + sustain);
      // release
      osc1env.gain.linearRampToValueAtTime(0, startTime + attack + sustain + release);
      osc2env.gain.linearRampToValueAtTime(0, startTime + attack + sustain + release);
      osc3env.gain.linearRampToValueAtTime(0, startTime + attack + sustain + release);
    });

    this.chain = [osc1, osc2, osc3, postFilter];
};

// Tandles one track (4 columns)
// rowLen: seconds per row
// patternLen: rows per pattern
// endPattern: last pattern
soundbox.TrackGenerator = function(instr, rowLen, patternLen, endPattern) {
    var trackMixer = audioCtx.createGain();
    trackMixer.gain.value = 1;

    // TODO: code golfing
    // parse song into more suitable format
    this.columns = [
      {
        n: [],
        f: [],
      },
      {
        n: [],
        f: [],
      },
      {
        n: [],
        f: [],
      },
      {
        n: [],
        f: [],
      },
    ];

    // program in all notes
    instr.p.forEach((patIdx, numPattern) => {
      // loop over patterns
      if (patIdx) {
        let patCol = instr.c[patIdx - 1];

        // loop over columns, i denotes column id
        for (let i = 0; i < patCol.n.length / patternLen; i++) {
          // loop over notes
          for (let j = 0; j < patternLen; j++) {
            this.columns[i].n[numPattern * patternLen + j] = patCol.n[i * patternLen + j];
            this.columns[i].f[numPattern * patternLen + j] = patCol.f[i * patternLen + j];
          }
        }
      }
    });

    this.columns.forEach(col => {
      col.g = new soundbox.ColumnGenerator(instr, rowLen, col.n, col.f);
      col.g.chain[col.g.chain.length - 1].connect(trackMixer);
    });

    this.chain = [trackMixer];
};

soundbox.MusicGenerator = function(song) {
    this.song = song;

/*
    this.oscillators = [
    ];
    */

    this.source = audioCtx.createOscillator();

    var mixer = audioCtx.createGain();
    mixer.gain.value = 0.5;

    this.tracks = [];

    this.song.songData.forEach(function(el) {
        var track = new soundbox.TrackGenerator(el, this.song.rowLen / 44100, this.song.patternLen, this.song.endPattern);
        track.chain[track.chain.length - 1].connect(mixer);
        track.columns.forEach(col => {
          this.source.connect(col.g.chain[2]);
        });
        this.tracks.push(track);
    }.bind(this));

    this.chain = [mixer];
};
soundbox.MusicGenerator.prototype.start = function(when) {
  this.tracks.forEach(track => track.columns.forEach(col => {
    col.g.chain[0].start(when);
    col.g.chain[1].start(when);
  }));
  this.source.start(when);
};
soundbox.MusicGenerator.prototype.stop = function() {
  this.tracks.forEach(track => track.columns.forEach(col => {
    col.g.chain[0].stop();
    col.g.chain[1].stop();
  }));
  this.source.stop();
};
soundbox.MusicGenerator.prototype.connect = function(target) {
  this.chain[this.chain.length - 1].connect(target);
};

})();
