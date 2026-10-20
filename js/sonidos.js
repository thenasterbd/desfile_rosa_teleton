// Sonidos sintetizados localmente: sin descargas ni grabaciones externas.
export function createEventAudio({ enabled = false, canPlay }) {
  let context, master, noise, timer, finishTimer, flutterTimer, celebrationEnd = 0, flutterEnd = 0;
  const active = new Set();
  const allowed = () => enabled && canPlay() && context?.state === 'running';

  async function activate() {
    if (!enabled) return false;
    context ||= new (window.AudioContext || window.webkitAudioContext)();
    if (!master) {
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -20; limiter.ratio.value = 5;
      master = context.createGain(); master.gain.value = .65;
      master.connect(limiter); limiter.connect(context.destination);
      noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const samples = noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
    await context.resume();
    return context.state === 'running';
  }

  function track(source, nodes, end, group = 'celebration') {
    const item = { source, nodes, group };
    active.add(item);
    source.onended = () => {
      active.delete(item);
      source.disconnect(); nodes.forEach(node => node.disconnect());
    };
    source.stop(end);
  }

  function noiseBurst(when, duration, volume, frequency, pan = 0, group = 'celebration') {
    const source = context.createBufferSource(), filter = context.createBiquadFilter();
    const gain = context.createGain(), stereo = context.createStereoPanner();
    source.buffer = noise; filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = .65;
    stereo.pan.value = pan;
    gain.gain.setValueAtTime(.0001, when);
    gain.gain.exponentialRampToValueAtTime(volume, when + Math.min(.015, duration * .12));
    gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
    source.connect(filter); filter.connect(gain); gain.connect(stereo); stereo.connect(master);
    source.start(when, Math.random() * Math.max(0, .9 - duration));
    track(source, [filter, gain, stereo], when + duration, group);
  }

  function tone(when, duration, frequency, volume, sweep = frequency) {
    const source = context.createOscillator(), gain = context.createGain();
    source.type = 'sine'; source.frequency.setValueAtTime(frequency, when);
    source.frequency.exponentialRampToValueAtTime(sweep, when + duration);
    gain.gain.setValueAtTime(.0001, when);
    gain.gain.exponentialRampToValueAtTime(volume, when + .035);
    gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
    source.connect(gain); gain.connect(master); source.start(when);
    track(source, [gain], when + duration);
  }

  function stopGroup(group) {
    for (const item of active) {
      if (item.group !== group) continue;
      try { item.source.stop(); } catch { /* Ya terminó. */ }
      item.source.disconnect(); item.nodes.forEach(node => node.disconnect());
      active.delete(item);
    }
  }

  function stopFlutter() {
    clearInterval(flutterTimer); flutterTimer = undefined; flutterEnd = 0;
    stopGroup('flutter');
  }

  function flutter(durationMs = 1500) {
    if (!allowed() || !Number.isFinite(durationMs) || durationMs <= 0) return;
    flutterEnd = Math.max(flutterEnd, context.currentTime + durationMs / 1000);
    // Un solo aleteo continuo; los aportes simultáneos prolongan su duración.
    if (flutterTimer !== undefined) return;
    let next = context.currentTime, flap = 0;
    function schedule() {
      if (!allowed() || context.currentTime >= flutterEnd) { stopFlutter(); return; }
      next = Math.max(next, context.currentTime);
      const horizon = Math.min(context.currentTime + .4, flutterEnd);
      while (next < horizon) {
        const fade = Math.min(1, (flutterEnd - next) / .6);
        const pan = Math.sin(flap * .22) * .75;
        const first = Math.min(.11, flutterEnd - next);
        if (first > .02) noiseBurst(next, first, Math.max(.001, .12 * fade), 800 + (flap % 8) * 90, pan, 'flutter');
        const second = Math.min(.07, flutterEnd - next - .055);
        if (second > .02) noiseBurst(next + .055, second, Math.max(.001, .06 * fade), 1500, pan, 'flutter');
        next += .16; flap++;
      }
    }
    schedule(); flutterTimer = setInterval(schedule, 100);
  }

  function stopCelebration() {
    clearInterval(timer); clearTimeout(finishTimer); timer = finishTimer = undefined;
    celebrationEnd = 0; stopGroup('celebration');
  }

  function stop() { stopFlutter(); stopCelebration(); }

  function celebrate() {
    if (!allowed() || celebrationEnd) return;
    const start = context.currentTime;
    celebrationEnd = start + 60;
    let applauseAt = start, fanfareAt = start + .1, whistleAt = start + 2;
    function schedule() {
      if (!allowed()) { stop(); return; }
      const now = context.currentTime, horizon = Math.min(now + .7, celebrationEnd);
      // No reproducir de golpe sonidos atrasados si el navegador pausa una pestaña.
      applauseAt = Math.max(applauseAt, now);
      while (applauseAt < horizon) {
        const duration = Math.min(.08 + Math.random() * .09, celebrationEnd - applauseAt);
        if (duration > .02) noiseBurst(applauseAt, duration, .1 + Math.random() * .15, 1200 + Math.random() * 2300, Math.random() * 2 - 1);
        applauseAt += .035 + Math.random() * .045;
      }
      if (fanfareAt < horizon) {
        fanfareAt = Math.max(fanfareAt, now);
        [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach((frequency, i) => {
          const when = fanfareAt + i * .18;
          const duration = Math.min(.38, celebrationEnd - when);
          if (duration > .05) tone(when, duration, frequency, .055);
        });
        fanfareAt += 8;
      }
      if (whistleAt < horizon) {
        whistleAt = Math.max(whistleAt, now);
        const duration = Math.min(.9, celebrationEnd - whistleAt);
        if (duration > .05) tone(whistleAt, duration, 900, .035, 1500);
        whistleAt += 6 + Math.random() * 3;
      }
    }
    schedule();
    timer = setInterval(schedule, 250);
    finishTimer = setTimeout(stopCelebration, 60000);
  }

  function setEnabled(value) { enabled = value; if (!value) stop(); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  addEventListener('pagehide', stop);
  return { activate, setEnabled, flutter, stopFlutter, celebrate, stop };
}
