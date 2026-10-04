/**
 * Uji integrasi Tahap 2 rambu (klasifikasi kondisi + tag subtipe) terhadap web dan ai-service yang SEDANG BERJALAN,
 * dengan citra rambu nyata. Memerlukan SIGN_CONDITION_WEIGHTS aktif di ai-service.
 *
 * Env: BASE_URL, DATABASE_URL, SEED_{ADMIN,SURVEYOR,SUPERVISOR}_{EMAIL,PASSWORD}, SIGN_IMAGE (jpg/png berisi rambu).
 * Jalankan: npm run test:stage2
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { requireEnv } from '../lib/env';

const BASE = requireEnv('BASE_URL');
const IMAGE = requireEnv('SIGN_IMAGE');
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
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  assert.equal(res.status, 200);
  return (res.headers.get('set-cookie') || '').split(';')[0];
}
async function call(cookie: string, method: string, p: string, body?: unknown) {
  const res = await fetch(`${BASE}${p}`, { method, redirect: 'manual', headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json: any = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function main() {
  const surveyor = await login(requireEnv('SEED_SURVEYOR_EMAIL'), requireEnv('SEED_SURVEYOR_PASSWORD'));
  const supervisor = await login(requireEnv('SEED_SUPERVISOR_EMAIL'), requireEnv('SEED_SUPERVISOR_PASSWORD'));
  const admin = await login(requireEnv('SEED_ADMIN_EMAIL'), requireEnv('SEED_ADMIN_PASSWORD'));

  const zone = await prisma.zone.findFirstOrThrow({ where: { exposure: 3 } });
  const signCls = await prisma.classDefinition.findFirstOrThrow({ where: { modelClass: 'sign' } });
  const potholeCls = await prisma.classDefinition.findFirstOrThrow({ where: { modelClass: 'pavedroad_pothole' } });
  const tagByCode = Object.fromEntries((await prisma.conditionTag.findMany({ where: { classId: signCls.id } })).map((t) => [t.code, t]));

  console.log('\nMaster tag');
  await check('class sign memiliki Tahap 2 dan 6 tag awal sesuai keputusan (3/3/3/2/2/1)', () => {
    assert.equal(signCls.hasConditionStage, true);
    assert.deepEqual(
      Object.fromEntries(Object.entries(tagByCode).map(([k, t]) => [k, t.severity])),
      { panel_hilang: 3, panel_penyok: 3, panel_merosot: 3, panel_miring: 2, tiang_miring: 2, pudar: 1 }
    );
    assert.equal(potholeCls.hasConditionStage, false);
  });
  await check('semua peran yang login dapat membaca tag aktif; tanpa login ditolak', async () => {
    for (const c of [surveyor, supervisor, admin]) {
      const r = await call(c, 'GET', '/api/condition-tags');
      assert.equal(r.status, 200);
      assert.equal(r.json.tags.length, 6);
    }
    assert.equal((await call('', 'GET', '/api/condition-tags')).status, 401);
  });
  await check('surveyor dan supervisor TIDAK dapat mengubah master tag', async () => {
    for (const c of [surveyor, supervisor]) {
      assert.equal((await call(c, 'GET', '/api/admin/condition-tags')).status, 403);
      assert.equal((await call(c, 'POST', '/api/admin/condition-tags', { code: 'x_tag', label: 'x', severity: 1 })).status, 403);
      assert.equal((await call(c, 'PATCH', `/api/admin/condition-tags/${tagByCode.pudar.id}`, { severity: 3 })).status, 403);
      assert.equal((await call(c, 'DELETE', `/api/admin/condition-tags/${tagByCode.pudar.id}`)).status, 403);
    }
  });

  // ---------- unggah citra rambu nyata -> deteksi -> Tahap 2 ----------
  console.log('\nDeteksi + Tahap 2 pada citra rambu nyata');
  const sid = (await call(surveyor, 'POST', '/api/sessions', { name: `stage2 ${Date.now()}`, zoneId: zone.id })).json.session.id as string;
  const form = new FormData();
  form.set('sessionId', sid);
  form.set('file', new Blob([fs.readFileSync(IMAGE)], { type: 'image/jpeg' }), path.basename(IMAGE));
  const up = await (await fetch(`${BASE}/api/media/upload`, { method: 'POST', headers: { cookie: surveyor }, body: form })).json();
  assert.ok(up.mediaAsset, JSON.stringify(up));
  const mediaId = up.mediaAsset.id as string;
  assert.equal((await fetch(`${BASE}/api/media/${mediaId}/process`, { method: 'POST', headers: { cookie: surveyor } })).status, 202);
  const t0 = Date.now();
  let media = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: mediaId } });
  while (!['completed', 'failed'].includes(media.status) && Date.now() - t0 < 180000) {
    await new Promise((r) => setTimeout(r, 1500));
    media = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: mediaId } });
  }
  await check('deteksi selesai tanpa galat', () => assert.equal(media.status, 'completed', media.errorMessage ?? ''));
  const signs = await prisma.detection.findMany({ where: { mediaAssetId: mediaId, classId: signCls.id }, include: { conditionTag: true } });
  await check('citra rambu menghasilkan >=1 deteksi sign, masing-masing berlabel kondisi dari classifier fold0', () => {
    assert.ok(signs.length >= 1, 'tidak ada deteksi rambu pada citra uji');
    for (const d of signs) {
      assert.ok(d.conditionLabel === 'normal' || d.conditionLabel === 'damaged', `label ${d.conditionLabel}`);
      assert.equal(d.conditionModel, 'sign_classifier_fold0');
      assert.equal(d.conditionTagId, null, 'classifier tidak menghasilkan subtipe');
    }
  });
  await check('rusak -> severity SEMENTARA 2 (skor 6 pada exposure 3); normal -> tanpa skor sama sekali', () => {
    for (const d of signs) {
      if (d.conditionLabel === 'damaged') {
        assert.equal(d.severity, 2);
        assert.equal(d.severitySource, 'sementara');
        assert.equal(d.riskScore, 6);
        assert.equal(d.priorityBand, 'tinggi');
      } else {
        assert.equal(d.severity, null);
        assert.equal(d.riskScore, null);
        assert.equal(d.priorityBand, null);
      }
    }
  });
  await check('metrik latensi mencatat Tahap 2 (crop dan waktu)', () => {
    const m = JSON.parse(media.processingMetrics || '{}');
    assert.equal(m.yolo.stage2_crops, signs.length);
    assert.ok(m.yolo.stage2_ms > 0);
    assert.equal(m.yolo.stage2_model, 'sign_classifier_fold0');
  });

  // ---------- koreksi supervisor ----------
  console.log('\nKoreksi kondisi dan tag subtipe');
  const det = signs[0];
  const fix = (c: string, body: Record<string, unknown>) => call(c, 'POST', `/api/detections/${det.id}/correct`, { kind: 'kondisi_diubah', ...body });

  await check('surveyor TIDAK dapat mengubah kondisi/tag', async () => {
    assert.equal((await fix(surveyor, { condition: 'damaged' })).status, 403);
  });
  await check('rusak + tag panel_hilang -> severity 3 (sumber tag), skor 9 kritikal, tag terpasang', async () => {
    const r = await fix(supervisor, { condition: 'damaged', tagId: tagByCode.panel_hilang.id });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const d = r.json.detection;
    assert.equal(d.conditionLabel, 'damaged');
    assert.equal(d.severity, 3);
    assert.equal(d.severitySource, 'tag');
    assert.equal(d.riskScore, 9);
    assert.equal(d.priorityBand, 'kritikal');
    assert.equal(d.conditionTag.code, 'panel_hilang');
  });
  await check('ganti tag ke pudar -> severity 1, skor 3 sedang', async () => {
    const d = (await fix(supervisor, { condition: 'damaged', tagId: tagByCode.pudar.id })).json.detection;
    assert.equal(d.severity, 1);
    assert.equal(d.riskScore, 3);
    assert.equal(d.priorityBand, 'sedang');
  });
  await check('tag dilepas eksplisit -> severity sementara 2; tanpa tagId baru tag lama dipertahankan', async () => {
    const kept = (await fix(supervisor, { condition: 'damaged' })).json.detection; // tagId tidak dikirim
    assert.equal(kept.conditionTagId, tagByCode.pudar.id);
    assert.equal(kept.severity, 1);
    const cleared = (await fix(supervisor, { condition: 'damaged', tagId: null })).json.detection;
    assert.equal(cleared.conditionTagId, null);
    assert.equal(cleared.severity, 2);
    assert.equal(cleared.severitySource, 'sementara');
    assert.equal(cleared.riskScore, 6);
    assert.equal(cleared.conditionTag, null);
  });
  await check('kondisi normal -> tanpa skor/severity/tag; severity manual ditolak pada rambu normal', async () => {
    const d = (await fix(supervisor, { condition: 'normal' })).json.detection;
    assert.equal(d.conditionLabel, 'normal');
    assert.equal(d.riskScore, null);
    assert.equal(d.severity, null);
    assert.equal(d.priorityBand, null);
    assert.equal((await call(supervisor, 'POST', `/api/detections/${det.id}/correct`, { kind: 'severity_diubah', severity: 3 })).status, 400);
    assert.equal((await fix(supervisor, { condition: 'normal', tagId: tagByCode.pudar.id })).status, 400);
  });
  await check('dasbor: rambu normal dihitung "normal", bukan "belum dinilai", dan tidak ikut skor lokasi', async () => {
    const o = (await call(supervisor, 'GET', '/api/dashboard/overview')).json;
    const s = o.sessions.find((x: any) => x.id === sid);
    assert.ok(s.normalCount >= 1);
    assert.equal(s.bandCounts.belumDinilai, 0);
  });
  await check('tag tidak valid ditolak: id asing, tag nonaktif; kondisi asing ditolak', async () => {
    assert.equal((await fix(supervisor, { condition: 'damaged', tagId: 'tidak-ada' })).status, 400);
    await prisma.conditionTag.update({ where: { id: tagByCode.panel_penyok.id }, data: { isActive: false } });
    assert.equal((await fix(supervisor, { condition: 'damaged', tagId: tagByCode.panel_penyok.id })).status, 400);
    await prisma.conditionTag.update({ where: { id: tagByCode.panel_penyok.id }, data: { isActive: true } });
    assert.equal((await fix(supervisor, { condition: 'rusak' })).status, 400);
  });
  await check('kelas BUKAN rambu: tidak ada opsi kondisi/tag (kondisi_diubah ditolak)', async () => {
    const m2 = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: mediaId } });
    const pot = await prisma.detection.create({
      data: {
        sessionId: sid, mediaAssetId: m2.id, classId: potholeCls.id, className: potholeCls.name, bbox: JSON.stringify({ x: 0.1, y: 0.1, width: 0.2, height: 0.2 }),
        condition: 'uji', feasibility: 'tidak_dinilai', severity: 3, exposure: 3, riskScore: 9, priorityBand: 'kritikal',
      },
    });
    const r = await call(supervisor, 'POST', `/api/detections/${pot.id}/correct`, { kind: 'kondisi_diubah', condition: 'damaged', tagId: tagByCode.pudar.id });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /rambu|Tahap 2/);
    assert.equal((await prisma.detection.findUniqueOrThrow({ where: { id: pot.id } })).riskScore, 9);
  });
  await check('mengganti kelas rambu menjadi kelas lain mengosongkan kondisi/tag', async () => {
    await fix(supervisor, { condition: 'damaged', tagId: tagByCode.panel_hilang.id });
    const weeds = await prisma.classDefinition.findFirstOrThrow({ where: { modelClass: 'weeds' } });
    const d = (await call(supervisor, 'POST', `/api/detections/${det.id}/correct`, { kind: 'kelas_diubah', classId: weeds.id })).json.detection;
    assert.equal(d.conditionLabel, null);
    assert.equal(d.conditionTagId, null);
    assert.equal(d.severity, 1);
    assert.equal(d.riskScore, 3);
  });

  // ---------- master tag oleh admin ----------
  console.log('\nMaster tag oleh admin');
  await check('admin menambah tag baru, memakainya, lalu menaikkan severity: temuan lama TIDAK berubah, penetapan baru memakai nilai baru', async () => {
    const created = await call(admin, 'POST', '/api/admin/condition-tags', { code: `retak_${Date.now() % 100000}`, label: 'Panel retak', severity: 1 });
    assert.equal(created.status, 201, JSON.stringify(created.json));
    const tag = created.json.tag;
    // kembalikan det ke rambu untuk pengujian: buat deteksi rambu baru
    const d2 = await prisma.detection.create({
      data: { sessionId: sid, mediaAssetId: mediaId, classId: signCls.id, className: signCls.name, bbox: JSON.stringify({ x: 0.2, y: 0.2, width: 0.2, height: 0.2 }), condition: 'uji', feasibility: 'tidak_dinilai', conditionLabel: 'damaged', severity: 2, severitySource: 'sementara', exposure: 3, riskScore: 6, priorityBand: 'tinggi' },
    });
    const first = (await call(supervisor, 'POST', `/api/detections/${d2.id}/correct`, { kind: 'kondisi_diubah', condition: 'damaged', tagId: tag.id })).json.detection;
    assert.equal(first.severity, 1);
    assert.equal(first.riskScore, 3);
    assert.equal((await call(admin, 'PATCH', `/api/admin/condition-tags/${tag.id}`, { severity: 3 })).status, 200);
    assert.equal((await prisma.detection.findUniqueOrThrow({ where: { id: d2.id } })).severity, 1, 'temuan lama berubah otomatis');
    const d3 = await prisma.detection.create({
      data: { sessionId: sid, mediaAssetId: mediaId, classId: signCls.id, className: signCls.name, bbox: JSON.stringify({ x: 0.5, y: 0.5, width: 0.2, height: 0.2 }), condition: 'uji', feasibility: 'tidak_dinilai', conditionLabel: 'damaged', severity: 2, severitySource: 'sementara', exposure: 3, riskScore: 6, priorityBand: 'tinggi' },
    });
    const second = (await call(supervisor, 'POST', `/api/detections/${d3.id}/correct`, { kind: 'kondisi_diubah', condition: 'damaged', tagId: tag.id })).json.detection;
    assert.equal(second.severity, 3);
    assert.equal(second.riskScore, 9);
    // dipakai -> hanya dinonaktifkan; setelah nonaktif tidak dapat dipilih lagi
    const del = await call(admin, 'DELETE', `/api/admin/condition-tags/${tag.id}`);
    assert.equal(del.json.deactivated, true);
    assert.equal((await call(supervisor, 'POST', `/api/detections/${d3.id}/correct`, { kind: 'kondisi_diubah', condition: 'damaged', tagId: tag.id })).status, 400);
    assert.ok(!(await call(supervisor, 'GET', '/api/condition-tags')).json.tags.some((t: any) => t.id === tag.id));
  });
  await check('validasi tag: severity di luar 1-3, kode salah, kode ganda ditolak', async () => {
    assert.equal((await call(admin, 'POST', '/api/admin/condition-tags', { code: 'valid_ok', label: 'x', severity: 5 })).status, 400);
    assert.equal((await call(admin, 'POST', '/api/admin/condition-tags', { code: 'Tidak Valid', label: 'x', severity: 2 })).status, 400);
    assert.equal((await call(admin, 'POST', '/api/admin/condition-tags', { code: 'pudar', label: 'dup', severity: 2 })).status, 409);
  });

  await prisma.surveySession.delete({ where: { id: sid } });
  await prisma.conditionTag.deleteMany({ where: { code: { startsWith: 'retak_' } } });
  console.log(`\n${passed} lulus, ${failures.length} gagal`);
  if (failures.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
