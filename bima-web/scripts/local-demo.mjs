#!/usr/bin/env node
/**
 * Menjalankan purwarupa BIMA/RQ4 di komputer sendiri dengan satu perintah (Windows, macOS, Linux).
 *
 *   node scripts/local-demo.mjs            # setup (sekali) + jalankan aplikasi
 *   node scripts/local-demo.mjs --video "C:\klip\20260920_...-seg2.mp4"   # sekaligus buat sesi demo dari video
 *   node scripts/local-demo.mjs help
 *
 * Aman terhadap konfigurasi yang sudah ada: file .env Anda TIDAK disentuh. Semua konfigurasi demo disimpan di
 * bima-web/.demo/ dan disuntikkan lewat environment proses (yang lebih diutamakan daripada file .env).
 * Tidak ada kredensial bawaan: kata sandi dibuat acak saat setup pertama dan dicetak/disimpan di .demo/kredensial.txt.
 */
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'web');
const AI = path.join(ROOT, 'ai-service');
const DEMO = path.join(ROOT, '.demo');
const STATE = path.join(DEMO, 'state.json');
const WIN = process.platform === 'win32';
const WEIGHT_CATEGORIES = ['pavedroad', 'vegetation', 'weeds', 'sign', 'banner', 'house_notice'];

// ---------------------------------------------------------------- argumen
const argv = process.argv.slice(2);
const cmd = ['up', 'setup', 'start', 'demo', 'help'].includes(argv[0]) ? argv.shift() : 'up';
const flags = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const key = argv[i].slice(2);
  const next = argv[i + 1];
  if (next !== undefined && !next.startsWith('--')) {
    (flags[key] ??= []).push(next);
    i++;
  } else (flags[key] ??= []).push(true);
}
const flag = (k) => flags[k]?.[0];

const log = (m = '') => console.log(m);
const step = (m) => console.log(`\n\x1b[1;34m▶ ${m}\x1b[0m`);
const ok = (m) => console.log(`  \x1b[32m✔\x1b[0m ${m}`);
const warn = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`);
const fail = (m) => console.log(`  \x1b[31m✘\x1b[0m ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function help() {
  log(`Penggunaan: node scripts/local-demo.mjs [perintah] [opsi]

Perintah
  up      (bawaan) setup bila belum, lalu jalankan aplikasi. Ctrl+C untuk berhenti.
  setup   hanya menyiapkan (database, paket, seed), tidak menjalankan aplikasi.
  start   hanya menjalankan aplikasi yang sudah di-setup.
  demo    membuat sesi demo dari video pada aplikasi yang sedang berjalan.

Opsi
  --database-url URL   PostgreSQL yang dipakai (disarankan: database KOSONG khusus demo).
  --docker-db          buat PostgreSQL di Docker (container "bima-demo-db") bila tidak ada --database-url.
  --weights DIR        folder berisi <kategori>-best.pt (bawaan: ai-service/models/yolo11n_seed0).
  --python PATH        interpreter Python yang sudah berisi dependensi (melewati pembuatan venv).
  --port N             port web (bawaan 3100).     --ai-port N   port ai-service (bawaan 8000).
  --video PATH         video untuk sesi demo (boleh diulang). Nama berkas harus SAMA dengan klip uji agar
                       dikenali sebagai "Data uji — dievaluasi"; nama lain tampil sebagai "belum dievaluasi".
  --zone tinggi|sedang|rendah   zona contoh untuk sesi demo (bawaan: tinggi).
  --reset              hapus konfigurasi demo (.demo/) dan buat ulang kata sandi.`);
}

// ---------------------------------------------------------------- util proses
function which(bin) {
  const r = spawnSync(WIN ? 'where' : 'which', [bin], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null;
}

// Di Windows, perintah non-absolut (npm.cmd, py) harus lewat shell; argumen berspasi lalu perlu diberi tanda kutip.
const useShell = (command) => WIN && !path.isAbsolute(command);
const quote = (args, shell) => (shell ? args.map((a) => (/[\s]/.test(a) && !/^".*"$/.test(a) ? `"${a}"` : a)) : args);

function run(command, args, opts = {}) {
  const shell = useShell(command);
  const r = spawnSync(command, quote(args, shell), { stdio: 'inherit', shell, ...opts });
  if (r.status !== 0) throw new Error(`Perintah gagal (${r.status ?? r.signal}): ${command} ${args.join(' ')}`);
}

function capture(command, args, opts = {}) {
  const shell = useShell(command);
  return spawnSync(command, quote(args, shell), { encoding: 'utf8', shell, ...opts });
}

function portFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer().once('error', () => resolve(false)).once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

function tcpOpen(host, port, timeout = 1500) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port, timeout });
    s.once('connect', () => (s.destroy(), resolve(true)));
    s.once('error', () => resolve(false));
    s.once('timeout', () => (s.destroy(), resolve(false)));
  });
}

async function waitFor(fn, label, timeoutMs, everyMs = 1500) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      if (await fn()) return true;
    } catch {}
    await sleep(everyMs);
  }
  throw new Error(`Waktu habis menunggu ${label} (${Math.round(timeoutMs / 1000)} detik).`);
}

const rand = (n = 24) => crypto.randomBytes(n).toString('base64url');

// ---------------------------------------------------------------- state
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE, 'utf8'));
  } catch {
    return null;
  }
}
function saveState(s) {
  fs.mkdirSync(DEMO, { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2), { mode: 0o600 });
}

// ---------------------------------------------------------------- prasyarat
function findPython() {
  const wanted = flag('python');
  const candidates = wanted && wanted !== true ? [wanted] : WIN ? ['py', 'python', 'python3'] : ['python3', 'python'];
  for (const c of candidates) {
    const args = c === 'py' ? ['-3', '-c', 'import sys;print("%d.%d"%sys.version_info[:2])'] : ['-c', 'import sys;print("%d.%d"%sys.version_info[:2])'];
    const r = capture(c, args);
    if (r.status === 0) {
      const [maj, min] = r.stdout.trim().split('.').map(Number);
      if (maj > 3 || (maj === 3 && min >= 10)) return { cmd: c, pre: c === 'py' ? ['-3'] : [], version: r.stdout.trim() };
    }
  }
  return null;
}

function ffmpegHas(bin, enc) {
  const r = capture(bin, ['-hide_banner', '-encoders']);
  return r.status === 0 && r.stdout.includes(enc);
}

function checkPrereqs(state) {
  step('Memeriksa prasyarat');
  const errors = [];
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor >= 20) ok(`Node.js ${process.versions.node}`);
  else errors.push(`Node.js 20+ dibutuhkan (terpasang ${process.versions.node}).`);

  const py = findPython();
  if (py) ok(`Python ${py.version}`);
  else errors.push('Python 3.10+ tidak ditemukan. Pasang dari python.org (Windows: centang "Add to PATH"), atau berikan --python PATH.');

  const ffmpeg = which('ffmpeg');
  const ffprobe = which('ffprobe');
  if (!ffmpeg || !ffprobe) {
    errors.push('ffmpeg/ffprobe tidak ditemukan di PATH. Pasang: Windows `winget install Gyan.FFmpeg`, macOS `brew install ffmpeg`, Linux `apt install ffmpeg`.');
  } else if (!ffmpegHas(ffmpeg, 'libx264') || !ffmpegHas(ffmpeg, 'libwebp')) {
    errors.push('ffmpeg harus mendukung libx264 dan libwebp (gunakan build "full"/"gyan"/Homebrew, bukan build anaconda).');
  } else ok(`ffmpeg + ffprobe (libx264, libwebp): ${ffmpeg}`);

  const weights = path.resolve(flag('weights') && flag('weights') !== true ? flag('weights') : state?.weights ?? path.join(AI, 'models', 'yolo11n_seed0'));
  const missing = WEIGHT_CATEGORIES.filter((c) => !fs.existsSync(path.join(weights, `${c}-best.pt`)));
  if (missing.length === 0) ok(`Bobot YOLO lengkap: ${weights}`);
  else errors.push(`Bobot YOLO belum lengkap di ${weights}. Hilang: ${missing.map((c) => `${c}-best.pt`).join(', ')}. Letakkan 6 berkas itu di sana atau beri --weights DIR.`);
  if (fs.existsSync(path.join(weights, 'sign_stage2_fold0_best.pt'))) ok('Classifier kondisi rambu (Tahap 2) ditemukan: sign_stage2_fold0_best.pt');
  else warn('Classifier kondisi rambu tidak ada (opsional): salin fold0_best.pt sebagai sign_stage2_fold0_best.pt ke folder bobot untuk mengaktifkan Tahap 2.');

  const dbGiven = flag('database-url');
  if (dbGiven && dbGiven !== true) ok('PostgreSQL: memakai --database-url');
  else if (state?.databaseUrl) ok('PostgreSQL: memakai database dari setup sebelumnya');
  else if (flag('docker-db')) {
    if (capture('docker', ['version', '--format', '{{.Server.Version}}']).status === 0) ok('Docker tersedia (untuk PostgreSQL demo)');
    else errors.push('--docker-db dipilih tetapi Docker tidak berjalan. Jalankan Docker Desktop, atau berikan --database-url.');
  } else {
    errors.push('Database belum ditentukan. Pilih salah satu: --database-url "postgresql://user:pass@host:5432/namadb" (database kosong khusus demo) atau --docker-db.');
  }
  if (errors.length) {
    for (const e of errors) fail(e);
    throw new Error('Prasyarat belum terpenuhi. Perbaiki di atas lalu jalankan ulang.');
  }
  return { py, ffmpeg, ffprobe, weights };
}

// ---------------------------------------------------------------- database
async function ensureDatabase(state) {
  const given = flag('database-url');
  if (given && given !== true) return given;
  if (state.databaseUrl) return state.databaseUrl;
  step('Menyiapkan PostgreSQL di Docker (container bima-demo-db)');
  const port = Number(flag('db-port') ?? 5544);
  const password = rand(12);
  const exists = capture('docker', ['ps', '-a', '--filter', 'name=^bima-demo-db$', '--format', '{{.Names}}']).stdout.trim();
  if (exists) {
    warn('Container bima-demo-db sudah ada; dipakai ulang bersama kata sandi barunya TIDAK diketahui. Hapus dulu: docker rm -f bima-demo-db');
    throw new Error('Container lama ditemukan. Jalankan `docker rm -f bima-demo-db` lalu ulangi.');
  }
  if (!(await portFree(port))) throw new Error(`Port ${port} dipakai proses lain. Gunakan --db-port N.`);
  run('docker', ['run', '-d', '--name', 'bima-demo-db', '-e', `POSTGRES_PASSWORD=${password}`, '-e', 'POSTGRES_DB=bima', '-p', `127.0.0.1:${port}:5432`, 'postgres:16']);
  await waitFor(async () => capture('docker', ['exec', 'bima-demo-db', 'pg_isready', '-U', 'postgres']).status === 0, 'PostgreSQL siap', 60000);
  ok(`PostgreSQL siap di port ${port}`);
  return `postgresql://postgres:${password}@127.0.0.1:${port}/bima`;
}

// ---------------------------------------------------------------- environment
function buildEnvs(s) {
  const common = { INTERNAL_API_SECRET: s.secrets.internal };
  const web = {
    ...common,
    DATABASE_URL: s.databaseUrl,
    DIRECT_URL: s.databaseUrl,
    JWT_SECRET: s.secrets.jwt,
    ENCRYPTION_SECRET_KEY: s.secrets.encryption,
    FASTAPI_SERVICE_URL: `http://127.0.0.1:${s.aiPort}`,
    NEXT_PUBLIC_API_URL: `http://localhost:${s.port}`,
    SESSION_MAX_AGE_SECONDS: '604800',
    USER_CACHE_TTL_MS: '60000',
    DEFAULT_CONFLICT_IOU_THRESHOLD: '0.5',
    NEXT_PUBLIC_MAX_VIDEO_SECONDS: '1200',
    SAM3_POLL_INTERVAL_MS: '3000',
    SAM3_MAX_WAIT_MS: '3600000',
    ALLOWED_DEV_ORIGINS: '127.0.0.1,localhost',
    FFMPEG_PATH: s.ffmpeg,
    FFPROBE_PATH: s.ffprobe,
    FFPROBE_TIMEOUT_MS: '30000',
    FFMPEG_IMAGE_TIMEOUT_MS: '120000',
    FFMPEG_VIDEO_TIMEOUT_MS: '1800000',
    MEDIA_IMAGE_MAX_SIDE: '1280',
    MEDIA_IMAGE_QUALITY: '65',
    MEDIA_VIDEO_MAX_HEIGHT: '720',
    MEDIA_VIDEO_CRF: '30',
    FRAME_MAX_WIDTH: '1280',
    FRAME_JPEG_QUALITY: '3',
    FRAME_EXTRACT_CONCURRENCY: '4',
    YOLO_REQUEST_TIMEOUT_MS: '600000',
    PLAYBACK_FPS: '5',
    PLAYBACK_MAX_FRAMES: '600',
    PLAYBACK_MIN_FPS: '2',
    PLAYBACK_IOU_MIN: '0.3',
    PLAYBACK_MAX_MISSED: '1',
    PLAYBACK_LINK_IOU_MIN: '0.4',
    PLAYBACK_LINK_TIME_TOLERANCE: '0.1',
    PLAYBACK_POLL_INTERVAL_MS: '3000',
    PLAYBACK_MAX_WAIT_MS: '1800000',
    STORAGE_BACKEND: 'local',
    LOCAL_STORAGE_DIR: path.join(DEMO, 'storage'),
    NEXT_PUBLIC_MAP_TILE_URL: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    NEXT_PUBLIC_MAP_ATTRIBUTION: '&copy; OpenStreetMap contributors',
    NEXT_PUBLIC_NOMINATIM_URL: 'https://nominatim.openstreetmap.org',
    NEXT_PUBLIC_MARKER_ICON_URL: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    NEXT_PUBLIC_MARKER_ICON_RETINA_URL: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    NEXT_PUBLIC_MARKER_ICON_RED_URL: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    NEXT_PUBLIC_MARKER_SHADOW_URL: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    NEXT_PUBLIC_OPENROUTER_ENDPOINT_URL: 'https://openrouter.ai/api/v1/chat/completions',
    NEXT_PUBLIC_ONPREMISE_ENDPOINT_URL: 'http://127.0.0.1:9',
    NEXT_PUBLIC_DEFAULT_MODEL_NAME: 'yolo11n_seed0',
    NEXT_PUBLIC_DEFAULT_SAM3_MODEL_NAME: 'sam3_1',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'tidak-dipakai-pada-mode-lokal',
    DEMO_LOGIN_ENABLED: 'true',
    SEED_ADMIN_EMAIL: 'admin@demo.local',
    SEED_ADMIN_PASSWORD: s.passwords.admin,
    SEED_SURVEYOR_EMAIL: 'surveyor@demo.local',
    SEED_SURVEYOR_PASSWORD: s.passwords.surveyor,
    SEED_SUPERVISOR_EMAIL: 'supervisor@demo.local',
    SEED_SUPERVISOR_PASSWORD: s.passwords.supervisor,
    PORT: String(s.port),
    NEXT_TELEMETRY_DISABLED: '1',
  };
  const ai = {
    ...common,
    AI_SERVICE_ALLOWED_ORIGINS: `http://localhost:${s.port},http://127.0.0.1:${s.port}`,
    AI_SERVICE_HOST: '127.0.0.1',
    AI_SERVICE_PORT: String(s.aiPort),
    YOLO_WEIGHTS_DIR: s.weights,
    // Tahap 2 rambu (classifier fold0, hasil 5-fold cross-validation): aktif hanya bila berkasnya ada.
    ...(fs.existsSync(path.join(s.weights, 'sign_stage2_fold0_best.pt')) ? { SIGN_CONDITION_WEIGHTS: 'sign_stage2_fold0_best.pt' } : {}),
    YOLO_CONF: '0.25',
    YOLO_DEVICE: 'cpu',
    PYTHONUNBUFFERED: '1',
    YOLO_CONFIG_DIR: path.join(DEMO, 'ultralytics'),
  };
  return { web: { ...process.env, ...web }, ai: { ...process.env, ...ai } };
}

function writeCredentials(s) {
  const url = `http://localhost:${s.port}`;
  const text = `Alamat: ${url}\n\nadmin       admin@demo.local        ${s.passwords.admin}\nsupervisor  supervisor@demo.local   ${s.passwords.supervisor}\nsurveyor    surveyor@demo.local     ${s.passwords.surveyor}\n\nFile ini hanya untuk demo lokal. Jangan di-commit.\n`;
  fs.writeFileSync(path.join(DEMO, 'kredensial.txt'), text, { mode: 0o600 });
  return text;
}

// ---------------------------------------------------------------- setup
async function setup() {
  if (flag('reset') && fs.existsSync(DEMO)) {
    warn('--reset: menghapus .demo/ (konfigurasi, kata sandi, venv, penyimpanan lokal). Database TIDAK dihapus.');
    fs.rmSync(DEMO, { recursive: true, force: true });
  }
  let state = loadState();
  const pre = checkPrereqs(state);
  const databaseUrl = await ensureDatabase(state ?? {});
  const port = Number(flag('port') ?? state?.port ?? 3100);
  const aiPort = Number(flag('ai-port') ?? state?.aiPort ?? 8000);

  state = {
    ...(state ?? {}),
    databaseUrl,
    port,
    aiPort,
    weights: pre.weights,
    ffmpeg: pre.ffmpeg,
    ffprobe: pre.ffprobe,
    secrets: state?.secrets ?? { jwt: rand(48), encryption: rand(32), internal: rand(32) },
    passwords: state?.passwords ?? { admin: rand(9), surveyor: rand(9), supervisor: rand(9) },
  };

  // --- Python
  step('Menyiapkan Python (ai-service)');
  if (flag('python') && flag('python') !== true && !flag('install-python')) {
    state.python = { cmd: flag('python'), pre: pre.py.pre };
    ok(`Memakai interpreter ${flag('python')} apa adanya (tidak memasang paket). Beri --install-python untuk memasang.`);
  } else {
    const venv = path.join(DEMO, 'venv');
    const vpy = path.join(venv, WIN ? 'Scripts' : 'bin', WIN ? 'python.exe' : 'python');
    if (!fs.existsSync(vpy)) {
      fs.mkdirSync(DEMO, { recursive: true });
      run(pre.py.cmd, [...pre.py.pre, '-m', 'venv', venv]);
    }
    state.python = { cmd: vpy, pre: [] };
    const stamp = path.join(venv, '.deps-ok');
    if (!fs.existsSync(stamp)) {
      warn('Memasang torch (CPU), ultralytics, dll. Unduhan beberapa ratus MB; hanya sekali.');
      run(vpy, ['-m', 'pip', 'install', '--upgrade', 'pip']);
      run(vpy, ['-m', 'pip', 'install', 'torch', 'torchvision', '--index-url', 'https://download.pytorch.org/whl/cpu']);
      run(vpy, ['-m', 'pip', 'install', '-r', path.join(AI, 'requirements.txt'), '-r', path.join(AI, 'requirements-yolo.txt')]);
      fs.writeFileSync(stamp, new Date().toISOString());
    }
    ok('Dependensi Python siap');
  }

  saveState(state);
  const envs = buildEnvs(state);

  // --- Web
  step('Menyiapkan aplikasi web');
  const npm = WIN ? 'npm.cmd' : 'npm';
  const npx = WIN ? 'npx.cmd' : 'npx';
  if (!fs.existsSync(path.join(WEB, 'node_modules'))) run(npm, ['install', '--no-audit', '--no-fund'], { cwd: WEB, env: envs.web });
  run(npx, ['prisma', 'generate'], { cwd: WEB, env: envs.web });
  run(npx, ['prisma', 'migrate', 'deploy'], { cwd: WEB, env: envs.web });
  run(npm, ['run', 'seed:demo'], { cwd: WEB, env: envs.web });
  run(npm, ['run', 'seed:risk'], { cwd: WEB, env: envs.web });
  fs.mkdirSync(envs.web.LOCAL_STORAGE_DIR, { recursive: true });
  ok('Database dimigrasi dan di-seed (3 pengguna, 8 kelas, 3 zona contoh, 35 klip RQ3, model YOLO)');

  writeCredentials(state);
  saveState(state);
  return state;
}

// ---------------------------------------------------------------- start
const children = [];
function killAll() {
  for (const c of children) {
    try {
      if (WIN) spawnSync('taskkill', ['/pid', String(c.pid), '/T', '/F']);
      else process.kill(-c.pid, 'SIGTERM');
    } catch {}
  }
}

function launch(name, command, args, opts) {
  const c = spawn(command, args, { ...opts, detached: !WIN, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
  const logFile = fs.createWriteStream(path.join(DEMO, `${name}.log`), { flags: 'a' });
  c.stdout.pipe(logFile);
  c.stderr.pipe(logFile);
  c.on('exit', (code) => {
    if (!shuttingDown) fail(`${name} berhenti (kode ${code}). Lihat .demo/${name}.log`);
  });
  children.push(c);
  return c;
}

let shuttingDown = false;
async function start(state) {
  state ??= loadState();
  if (!state) throw new Error('Belum di-setup. Jalankan: node scripts/local-demo.mjs setup (atau tanpa perintah).');
  const envs = buildEnvs(state);
  fs.mkdirSync(DEMO, { recursive: true });

  for (const [label, port] of [['web', state.port], ['ai-service', state.aiPort]]) {
    if (!(await portFree(port))) throw new Error(`Port ${port} (${label}) sedang dipakai proses lain. Hentikan prosesnya atau gunakan --port/--ai-port.`);
  }

  step('Menjalankan ai-service (YOLO, CPU)');
  launch('ai-service', state.python.cmd, [...(state.python.pre ?? []), 'main.py'], { cwd: AI, env: envs.ai });
  await waitFor(async () => (await fetch(`http://127.0.0.1:${state.aiPort}/health`)).ok, 'ai-service', 120000);
  ok(`ai-service siap di port ${state.aiPort}`);

  step('Menjalankan aplikasi web (kompilasi pertama bisa memakan waktu 1-2 menit)');
  const nextBin = path.join(WEB, 'node_modules', 'next', 'dist', 'bin', 'next');
  launch('web', process.execPath, [nextBin, 'dev', '-p', String(state.port)], { cwd: WEB, env: envs.web });
  await waitFor(async () => (await fetch(`http://localhost:${state.port}/login`)).ok, 'aplikasi web', 240000, 2000);
  ok(`Aplikasi web siap di port ${state.port}`);
  return state;
}

function banner(state) {
  const url = `http://localhost:${state.port}`;
  log(`
\x1b[1;32m══════════════════════════════════════════════════════════════\x1b[0m
\x1b[1m Aplikasi berjalan: ${url}\x1b[0m   (gunakan "localhost", bukan 127.0.0.1)

   admin       admin@demo.local        ${state.passwords.admin}
   supervisor  supervisor@demo.local   ${state.passwords.supervisor}
   surveyor    surveyor@demo.local     ${state.passwords.surveyor}

 Kata sandi juga ada di bima-web/.demo/kredensial.txt
 Zona yang tersedia adalah DATA CONTOH (Exposure simulasi).
 Log: bima-web/.demo/web.log dan ai-service.log. Tekan Ctrl+C untuk berhenti.
\x1b[1;32m══════════════════════════════════════════════════════════════\x1b[0m
`);
}

// ---------------------------------------------------------------- demo (unggah video)
async function demo(state) {
  state ??= loadState();
  if (!state) throw new Error('Belum di-setup.');
  const videos = (flags.video ?? []).filter((v) => v !== true);
  if (videos.length === 0) throw new Error('Berikan --video PATH.');
  const base = `http://localhost:${state.port}`;
  const zoneKey = { tinggi: 3, sedang: 2, rendah: 1 }[flag('zone') ?? 'tinggi'];
  if (!zoneKey) throw new Error('--zone harus tinggi, sedang, atau rendah.');

  const lr = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'surveyor@demo.local', password: state.passwords.surveyor }),
  });
  if (!lr.ok) throw new Error('Login surveyor demo gagal. Apakah aplikasi berjalan dan sudah di-setup?');
  const cookie = (lr.headers.get('set-cookie') ?? '').split(';')[0];
  const H = { cookie };
  const zones = (await (await fetch(`${base}/api/zones`, { headers: H })).json()).zones;
  const zone = zones.find((z) => z.exposure === zoneKey);

  for (const file of videos) {
    const abs = path.resolve(file);
    if (!fs.existsSync(abs)) throw new Error(`Video tidak ditemukan: ${abs}`);
    const name = path.basename(abs);
    step(`Sesi demo untuk ${name}`);
    const sr = await fetch(`${base}/api/sessions`, {
      method: 'POST',
      headers: { ...H, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: `Demo: ${name}`.slice(0, 80),
        zoneId: zone?.id,
        locationAddress: 'Lokasi demo',
        // Titik contoh agar sesi muncul di peta Analitik; disebar sedikit supaya penanda tidak bertumpuk.
        locationGeojson: { type: 'Point', coordinates: [106.8456 + 0.004 * videos.indexOf(file), -6.2088 - 0.002 * videos.indexOf(file)] },
      }),
    });
    const sj = await sr.json();
    if (!sr.ok) throw new Error(sj.error ?? 'Gagal membuat sesi.');
    const form = new FormData();
    form.set('sessionId', sj.session.id);
    form.set('file', await fs.openAsBlob(abs, { type: 'video/mp4' }), name);
    log('  Mengunggah (kompresi 720p + ekstraksi frame dari berkas asli; video 4K bisa beberapa menit)...');
    const t0 = Date.now();
    const ur = await fetch(`${base}/api/media/upload`, { method: 'POST', headers: H, body: form });
    const uj = await ur.json();
    if (!ur.ok) throw new Error(uj.error ?? 'Unggah gagal.');
    ok(`Unggah selesai dalam ${((Date.now() - t0) / 1000).toFixed(0)} dtk. ${uj.mediaAsset.evaluatedClipId ? 'Dikenali sebagai KLIP UJI (dievaluasi).' : 'Video baru (belum dievaluasi).'}${uj.mediaAsset.clipMatchNote ? ' ' + uj.mediaAsset.clipMatchNote : ''}`);
    const pr = await fetch(`${base}/api/media/${uj.mediaAsset.id}/process`, { method: 'POST', headers: H });
    if (pr.status !== 202) throw new Error(`Gagal memulai deteksi (${pr.status}): ${await pr.text()}`);
    await waitFor(async () => {
      const s = (await (await fetch(`${base}/api/sessions/${sj.session.id}`, { headers: H })).json()).session;
      const m = s.mediaAssets[0];
      if (m.status === 'failed') throw new Error(`Deteksi gagal: ${m.errorMessage}`);
      return m.status === 'completed';
    }, 'deteksi selesai', 600000, 2500);
    ok(`Deteksi selesai. Buka: ${base}/surveyor/sessions/${sj.session.id}`);
  }
}

// ---------------------------------------------------------------- main
async function main() {
  if (cmd === 'help') return help();
  if (cmd === 'demo') return demo();
  let state = null;
  if (cmd === 'up' || cmd === 'setup') state = await setup();
  if (cmd === 'setup') {
    log(`\nSetup selesai. Jalankan: node scripts/local-demo.mjs start\n\n${fs.readFileSync(path.join(DEMO, 'kredensial.txt'), 'utf8')}`);
    return;
  }
  state = await start(state);
  const stop = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log('\nMenghentikan aplikasi...');
    killAll();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  banner(state);
  if (flags.video) await demo(state);
  await new Promise(() => {});
}

main().catch((e) => {
  fail(e.message);
  shuttingDown = true;
  killAll();
  process.exit(1);
});
