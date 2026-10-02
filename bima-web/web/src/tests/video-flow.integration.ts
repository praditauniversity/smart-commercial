/**
 * Uji integrasi alur video (Opsi A) terhadap server dan ai-service yang SEDANG BERJALAN:
 *   unggah -> frame sampel dari berkas asli -> pencocokan 35 klip -> deteksi YOLO -> skor risiko -> hapus.
 *
 * Env: BASE_URL, DATABASE_URL, SEED_SURVEYOR_EMAIL/PASSWORD, SEED_SUPERVISOR_EMAIL/PASSWORD, FFMPEG_PATH,
 *      VIDEO_PATH (berkas klip uji; nama berkasnya harus sama dengan salah satu dari 35 klip di tracker).
 * Jalankan: npm run test:video
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { requireEnv } from '../lib/env';

const BASE = requireEnv('BASE_URL');
const VIDEO = requireEnv('VIDEO_PATH');
const prisma = new PrismaClient();
let passed = 0;
const failures: string[] = [];

async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e: any) {
    failures.push(`${name}: ${e.message}`);
    console.log(`  FAIL ${name}\n       ${e.message}`);
  }
}

async function login(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200);
  return (res.headers.get('set-cookie') || '').split(';')[0];
}

const get = async (cookie: string, p: string, headers: Record<string, string> = {}) =>
  fetch(`${BASE}${p}`, { headers: { cookie, ...headers } });

async function upload(cookie: string, sessionId: string, filePath: string, fileName: string) {
  const form = new FormData();
  form.set('sessionId', sessionId);
  form.set('file', await fs.openAsBlob(filePath, { type: 'video/mp4' }), fileName);
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/media/upload`, { method: 'POST', headers: { cookie }, body: form });
  const json: any = await res.json();
  return { status: res.status, json, ms: Date.now() - t0 };
}

async function processAndWait(cookie: string, mediaId: string, timeoutMs = 300000) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/media/${mediaId}/process`, { method: 'POST', headers: { cookie } });
  assert.equal(res.status, 202, `process status ${res.status}`);
  while (Date.now() - t0 < timeoutMs) {
    await new Promise((r) => setTimeout(r, 1500));
    const m = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: mediaId } });
    if (m.status === 'completed' || m.status === 'failed') return { media: m, ms: Date.now() - t0 };
  }
  throw new Error('pemrosesan melebihi batas waktu uji');
}

const BAND: Record<number, string> = { 1: 'rendah', 2: 'rendah', 3: 'sedang', 4: 'sedang', 6: 'tinggi', 9: 'kritikal' };

async function main() {
  const stamp = Date.now();
  // Klip turunan disiapkan di awal: memotong video 4K memakan waktu, dan koneksi keep-alive yang menganggur
  // ditutup server setelah 5 detik. Karena itu ini HARUS menjadi langkah pertama, sebelum ada fetch.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bima-vid-'));
  const cut = (name: string, secs: number) => {
    const out = path.join(tmp, name);
    execFileSync(requireEnv('FFMPEG_PATH'), ['-v', 'error', '-y', '-i', VIDEO, '-t', String(secs), '-vf', 'scale=1280:-2', '-an', out]);
    return out;
  };
  const clipNew = cut('video_baru_uji.mp4', 10);
  const clipSameName = cut('namasama.mp4', 10);

  const surveyor = await login(requireEnv('SEED_SURVEYOR_EMAIL'), requireEnv('SEED_SURVEYOR_PASSWORD'));
  const supervisor = await login(requireEnv('SEED_SUPERVISOR_EMAIL'), requireEnv('SEED_SUPERVISOR_PASSWORD'));
  const zones = await (await get(surveyor, '/api/zones')).json();
  const high = zones.zones.find((z: any) => z.exposure === 3);
  assert.ok(high, 'zona Exposure 3 tidak ada (jalankan npm run seed:risk)');

  const mk = async (name: string, zoneId?: string) => {
    const r = await fetch(`${BASE}/api/sessions`, {
      method: 'POST',
      headers: { cookie: surveyor, 'content-type': 'application/json' },
      body: JSON.stringify({ name, zoneId }),
    });
    assert.equal(r.status, 201);
    return (await r.json()).session.id as string;
  };
  const sessionIds: string[] = [];


  // ---------- A. klip uji asli (terevaluasi) ----------
  console.log('\nA. Klip uji RQ3 (berkas asli)');
  const sidA = await mk(`video A ${stamp}`, high.id);
  sessionIds.push(sidA);
  const upA = await upload(surveyor, sidA, VIDEO, path.basename(VIDEO));
  console.log(`     unggah ${(upA.ms / 1000).toFixed(1)} s`, JSON.stringify(upA.json.mediaAsset?.processingMetrics ?? ''));
  assert.equal(upA.status, 200, JSON.stringify(upA.json));
  const mediaA = upA.json.mediaAsset;
  await check('dikenali sebagai klip terevaluasi (nama + durasi cocok)', () => {
    assert.ok(mediaA.evaluatedClipId);
    assert.equal(mediaA.clipMatchNote, null);
  });
  const framesA = await prisma.mediaFrame.findMany({ where: { mediaAssetId: mediaA.id }, orderBy: { frameIndex: 'asc' } });
  await check('24 frame sampel tersebar merata hingga ujung klip', () => {
    assert.equal(framesA.length, 24);
    const d = mediaA.durationSeconds as number;
    assert.ok(framesA[0].timestampSeconds < 3 && framesA[23].timestampSeconds > d - 3);
  });
  await check('frame dapat dibuka dan video mendukung Range (seek)', async () => {
    const f = await get(surveyor, framesA[0].imageUrl);
    assert.equal(f.status, 200);
    assert.equal(f.headers.get('content-type'), 'image/jpeg');
    const v = await get(surveyor, mediaA.fileUrl, { range: 'bytes=0-99' });
    assert.equal(v.status, 206);
    assert.equal((await v.arrayBuffer()).byteLength, 100);
  });
  await check('berkas lokal tidak dapat dibuka tanpa login', async () => {
    assert.equal((await fetch(`${BASE}${framesA[0].imageUrl}`)).status, 401);
  });
  await check('path traversal pada penyaji berkas ditolak', async () => {
    const r = await get(surveyor, '/api/files/img/..%2F..%2F..%2Fetc%2Fpasswd');
    assert.ok([400, 404].includes(r.status), `status ${r.status}`);
  });

  const resA = await processAndWait(surveyor, mediaA.id);
  await check('deteksi selesai tanpa galat', () => assert.equal(resA.media.status, 'completed', resA.media.errorMessage ?? ''));
  const detA = await prisma.detection.findMany({ where: { mediaAssetId: mediaA.id }, include: { classDefinition: true } });
  console.log(`     proses ${(resA.ms / 1000).toFixed(1)} s, ${detA.length} temuan`);
  await check('ada temuan, tiap temuan membawa confidence, frame, dan timestamp', () => {
    assert.ok(detA.length > 0);
    assert.ok(detA.every((d) => d.confidence !== null && d.frameIndex !== null && d.timestampSeconds !== null));
  });
  await check('skor risiko = Severity x Exposure(3) hanya untuk Keselamatan Infrastruktur; pita sesuai', () => {
    for (const d of detA) {
      if (d.classDefinition.categoryGroup === 'keselamatan_infrastruktur') {
        assert.equal(d.exposure, 3, d.className);
        assert.equal(d.severity, d.classDefinition.defaultSeverity, d.className);
        assert.equal(d.riskScore, d.severity! * 3, d.className);
        assert.equal(d.priorityBand, BAND[d.riskScore!], d.className);
        assert.ok([3, 6, 9].includes(d.riskScore!), 'skor mustahil untuk exposure 3');
      } else {
        assert.equal(d.riskScore, null, `${d.className} tidak boleh diberi skor`);
        assert.equal(d.priorityBand, null);
        assert.equal(d.severity, null);
      }
    }
  });
  await check('metrik latensi per tahap tercatat (unggah, ekstraksi, unduh, inferensi per model, simpan)', () => {
    const m = JSON.parse(resA.media.processingMetrics || '{}');
    assert.ok(m.upload.frameExtractMs > 0 && m.upload.compressAndExtractMs > 0);
    assert.equal(m.yolo.frames, 24);
    assert.ok(m.yolo.inference_ms > 0 && Object.keys(m.yolo.per_model_ms).length === 6);
    assert.ok(m.persistMs >= 0 && m.processTotalMs > 0);
  });
  await check('supervisor melihat sesi lengkap dengan narasi klip terevaluasi dan zona (data contoh)', async () => {
    const s = (await (await get(supervisor, `/api/sessions/${sidA}`)).json()).session;
    const m = s.mediaAssets.find((x: any) => x.id === mediaA.id);
    assert.ok(m.evaluatedClip?.modelCaption?.length > 20);
    assert.equal(typeof m.evaluatedClip.bleu, 'number');
    assert.equal(m.frames.length, 24);
    assert.equal(s.zone.isSimulated, true);
  });

  // ---------- B. video baru (nama tidak dikenal) ----------
  console.log('\nB. Video baru (nama tidak ada di tracker)');
  const sidB = await mk(`video B ${stamp}`, high.id);
  sessionIds.push(sidB);
  const upB = await upload(surveyor, sidB, clipNew, 'video_baru_uji.mp4');
  assert.equal(upB.status, 200, JSON.stringify(upB.json));
  await check('TIDAK dianggap klip terevaluasi (narasi/skor tidak boleh tertempel)', () => {
    assert.equal(upB.json.mediaAsset.evaluatedClipId, null);
    assert.equal(upB.json.mediaAsset.clipMatchNote, null);
  });
  await check('5 frame untuk klip 10 detik (0,5 fps)', async () => {
    assert.equal(await prisma.mediaFrame.count({ where: { mediaAssetId: upB.json.mediaAsset.id } }), 5);
  });
  const resB = await processAndWait(surveyor, upB.json.mediaAsset.id);
  await check('deteksi tetap berjalan pada video baru', () => assert.equal(resB.media.status, 'completed', resB.media.errorMessage ?? ''));
  await check('supervisor melihat evaluatedClip = null pada video baru', async () => {
    const s = (await (await get(supervisor, `/api/sessions/${sidB}`)).json()).session;
    assert.equal(s.mediaAssets[0].evaluatedClip, null);
  });

  // ---------- C. nama sama, durasi berbeda ----------
  console.log('\nC. Nama sama dengan klip uji tetapi durasi berbeda');
  const sidC = await mk(`video C ${stamp}`);
  sessionIds.push(sidC);
  const upC = await upload(surveyor, sidC, clipSameName, path.basename(VIDEO));
  assert.equal(upC.status, 200, JSON.stringify(upC.json));
  await check('TIDAK dianggap terevaluasi dan ada catatan alasan', () => {
    assert.equal(upC.json.mediaAsset.evaluatedClipId, null);
    assert.match(upC.json.mediaAsset.clipMatchNote, /durasi berbeda/);
  });
  const resC = await processAndWait(surveyor, upC.json.mediaAsset.id);
  await check('sesi tanpa zona: temuan Keselamatan Infrastruktur tidak diberi skor (tanpa Exposure)', async () => {
    assert.equal(resC.media.status, 'completed', resC.media.errorMessage ?? '');
    const d = await prisma.detection.findMany({ where: { mediaAssetId: upC.json.mediaAsset.id } });
    assert.ok(d.every((x) => x.riskScore === null && x.priorityBand === null && x.exposure === null));
  });

  // ---------- D. hapus media membersihkan frame & berkas ----------
  console.log('\nD. Pembersihan');
  await check('hapus media menghapus frame dan berkas dari penyimpanan', async () => {
    const urlFrame = framesA[0].imageUrl;
    const r = await fetch(`${BASE}/api/media/${mediaA.id}`, { method: 'DELETE', headers: { cookie: surveyor } });
    assert.equal(r.status, 200);
    assert.equal(await prisma.mediaFrame.count({ where: { mediaAssetId: mediaA.id } }), 0);
    assert.equal((await get(surveyor, urlFrame)).status, 404);
    assert.equal((await get(surveyor, mediaA.fileUrl)).status, 404);
  });

  for (const id of sessionIds) await prisma.surveySession.delete({ where: { id } }).catch(() => {});
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${passed} lulus, ${failures.length} gagal`);
  if (failures.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
