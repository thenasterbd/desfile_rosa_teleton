const COLORS = ['#FC568D', '#E02D69', '#F93873', '#FFFFFF'];

export function setupFireworks(projector) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let canvas, context, frame, finishTimer, started, previous, nextLaunch, rockets = [], sparks = [];
  let width = 0, height = 0;
  const visible = () => !projector.hidden && !document.hidden;

  function resize() {
    if (!canvas) return;
    width = innerWidth; height = innerHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function stop() {
    cancelAnimationFrame(frame); clearTimeout(finishTimer);
    canvas?.remove(); canvas = context = null; rockets = []; sparks = [];
  }

  function launch() {
    const x = width * (.12 + Math.random() * .76);
    rockets.push({ x, y: height + 12, targetX: x + (Math.random() - .5) * width * .2,
      targetY: height * (.12 + Math.random() * .4), age: 0, duration: .65 + Math.random() * .4,
      color: COLORS[Math.floor(Math.random() * 3)] });
  }

  function explode(rocket) {
    const count = width < 700 ? 48 : 80;
    const speed = Math.min(width, height) * (.16 + Math.random() * .08);
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2 + Math.random() * .05;
      const velocity = speed * (.45 + Math.random() * .65);
      sparks.push({ x: rocket.targetX, y: rocket.targetY, vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity, age: 0, life: 1.3 + Math.random() * .8,
        color: i % 6 === 0 ? COLORS[3] : rocket.color, size: 1.4 + Math.random() * 1.8 });
    }
    if (sparks.length > 1000) sparks.splice(0, sparks.length - 1000);
  }

  function draw(now) {
    if (!canvas || !visible() || reduced.matches || now - started >= 60000) { stop(); return; }
    const dt = Math.min(.04, Math.max(0, (now - previous) / 1000)); previous = now;
    context.clearRect(0, 0, width, height);
    if (now >= nextLaunch && now - started < 57000) {
      launch(); nextLaunch = now + 500 + Math.random() * 400;
    }
    context.lineCap = 'round';
    for (const rocket of rockets) {
      rocket.age += dt;
      const t = Math.min(1, rocket.age / rocket.duration), eased = 1 - (1 - t) ** 2;
      const x = rocket.x + (rocket.targetX - rocket.x) * eased;
      const y = height + 12 + (rocket.targetY - height - 12) * eased;
      context.globalAlpha = 1; context.strokeStyle = rocket.color; context.lineWidth = 2.5;
      context.shadowColor = rocket.color; context.shadowBlur = 8;
      context.beginPath(); context.moveTo(x, y + 18); context.lineTo(x, y); context.stroke();
      if (t === 1) explode(rocket);
    }
    rockets = rockets.filter(rocket => rocket.age < rocket.duration);
    for (const spark of sparks) {
      const oldX = spark.x, oldY = spark.y;
      spark.age += dt; spark.vx *= Math.exp(-1.1 * dt); spark.vy *= Math.exp(-1.1 * dt);
      spark.vy += 38 * dt; spark.x += spark.vx * dt; spark.y += spark.vy * dt;
      context.globalAlpha = Math.max(0, 1 - spark.age / spark.life) ** .65;
      context.strokeStyle = spark.color; context.lineWidth = spark.size;
      context.shadowColor = spark.color; context.shadowBlur = 5;
      context.beginPath(); context.moveTo(oldX, oldY); context.lineTo(spark.x, spark.y); context.stroke();
    }
    sparks = sparks.filter(spark => spark.age < spark.life);
    context.globalAlpha = 1; context.shadowBlur = 0;
    frame = requestAnimationFrame(draw);
  }

  function start() {
    if (canvas || !visible() || reduced.matches) return;
    canvas = document.createElement('canvas'); canvas.className = 'fireworks-layer';
    canvas.setAttribute('aria-hidden', 'true'); context = canvas.getContext('2d');
    if (!context) { stop(); return; }
    projector.append(canvas); resize();
    started = previous = nextLaunch = performance.now();
    frame = requestAnimationFrame(draw); finishTimer = setTimeout(stop, 60000);
  }

  addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (!visible()) stop(); });
  new MutationObserver(() => { if (!visible()) stop(); })
    .observe(projector, { attributes: true, attributeFilter: ['hidden'] });
  reduced.addEventListener('change', () => { if (reduced.matches) stop(); });
  addEventListener('pagehide', stop);
  return { start, stop };
}
