/**
 * Uji integrasi hak akses tiga peran terhadap server yang SEDANG BERJALAN.
 *
 * Prasyarat: `npm run dev` (atau start), database sudah di-migrate dan di-seed (`npm run seed`,
 * `npm run seed:risk`), lalu isi env: BASE_URL, SEED_{ADMIN,SURVEYOR,SUPERVISOR}_{EMAIL,PASSWORD}, DATABASE_URL.
 * Jalankan: npm run test:rbac
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { requireEnv } from '../lib/env';

const BASE = requireEnv('BASE_URL');
const prisma = new PrismaClient();

type Client = { name: string; cookie: string };
let passed = 0;
const failures: string[] = [];

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e: any) {
    failures.push(`${name}: ${e.message}`);
    console.log(`  FAIL ${name}\n       ${e.message}`);
  }
}

async function login(email: string, password: string): Promise<Client> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200, `login ${email} gagal (${res.status})`);
  const cookie = (res.headers.get('set-cookie') || '').split(';')[0];
  return { name: email, cookie };
}

async function call(c: Client, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    redirect: 'manual',
    headers: { cookie: c.cookie, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json, location: res.headers.get('location') };
}

async function main() {
  const admin = await login(requireEnv('SEED_ADMIN_EMAIL'), requireEnv('SEED_ADMIN_PASSWORD'));
  const surveyor = await login(requireEnv('SEED_SURVEYOR_EMAIL'), requireEnv('SEED_SURVEYOR_PASSWORD'));
  const supervisor = await login(requireEnv('SEED_SUPERVISOR_EMAIL'), requireEnv('SEED_SUPERVISOR_PASSWORD'));

  // Surveyor kedua (dibuat admin) untuk menguji isolasi antar-surveyor
  const stamp = Date.now();
  const mk = await call(admin, 'POST', '/api/admin/users', {
    email: `surveyor2-${stamp}@test.local`,
    name: 'Surveyor Dua',
    password: 'dev-surv2-pw-123',
    role: 'surveyor',
  });
  assert.equal(mk.status, 201, `admin gagal membuat surveyor kedua: ${JSON.stringify(mk.json)}`);
  const surveyor2 = await login(`surveyor2-${stamp}@test.local`, 'dev-surv2-pw-123');

  // Fixture: sesi milik surveyor 1 dengan satu temuan
  const created = await call(surveyor, 'POST', '/api/sessions', { name: `RBAC test ${stamp}` });
  assert.equal(created.status, 201, `surveyor gagal membuat sesi: ${JSON.stringify(created.json)}`);
  const sessionId: string = created.json.session.id;
  const zone = await prisma.zone.findFirstOrThrow({ where: { exposure: 3 } });
  await prisma.surveySession.update({ where: { id: sessionId }, data: { zoneId: zone.id } });
  const cls = await prisma.classDefinition.findFirstOrThrow({ where: { modelClass: 'pavedroad_pothole' } });
  const bannerCls = await prisma.classDefinition.findFirstOrThrow({ where: { modelClass: 'banner' } });
  const media = await prisma.mediaAsset.create({
    data: { sessionId, fileName: 'rbac.jpg', fileType: 'image', fileUrl: 'x', storagePath: 'x', status: 'completed' },
  });
  const det = await prisma.detection.create({
    data: {
      sessionId,
      mediaAssetId: media.id,
      classId: cls.id,
      className: cls.name,
      bbox: JSON.stringify({ x: 0.1, y: 0.1, width: 0.2, height: 0.2 }),
      condition: 'uji',
      feasibility: 'tidak_dinilai',
      confidence: 0.9,
      severity: 3,
      exposure: 3,
      riskScore: 9,
      priorityBand: 'kritikal',
    },
  });

  console.log('\nPembuatan peran oleh admin');
  await check('admin dapat membuat pengguna berperan supervisor', async () => {
    const r = await call(admin, 'POST', '/api/admin/users', {
      email: `sup-${stamp}@test.local`,
      name: 'Sup',
      password: 'dev-sup-pw-123',
      role: 'supervisor',
    });
    assert.equal(r.status, 201);
    assert.equal(r.json.user.role, 'supervisor');
  });
  await check('peran tak dikenal jatuh ke surveyor (bukan admin)', async () => {
    const r = await call(admin, 'POST', '/api/admin/users', {
      email: `x-${stamp}@test.local`,
      name: 'X',
      password: 'dev-x-pw-123',
      role: 'superadmin',
    });
    assert.equal(r.status, 201);
    assert.equal(r.json.user.role, 'surveyor');
  });

  console.log('\nMembaca data');
  await check('surveyor melihat sesi miliknya', async () => {
    const r = await call(surveyor, 'GET', `/api/sessions/${sessionId}`);
    assert.equal(r.status, 200);
  });
  await check('surveyor lain TIDAK dapat melihat sesi tersebut', async () => {
    const r = await call(surveyor2, 'GET', `/api/sessions/${sessionId}`);
    assert.equal(r.status, 403);
  });
  await check('surveyor lain tidak melihat sesi itu di daftar', async () => {
    const r = await call(surveyor2, 'GET', '/api/sessions');
    assert.ok(!r.json.sessions.some((s: any) => s.id === sessionId));
  });
  await check('supervisor melihat sesi semua surveyor di daftar', async () => {
    const r = await call(supervisor, 'GET', '/api/sessions');
    assert.equal(r.status, 200);
    assert.ok(r.json.sessions.some((s: any) => s.id === sessionId));
  });
  await check('supervisor dapat membuka detail sesi surveyor', async () => {
    assert.equal((await call(supervisor, 'GET', `/api/sessions/${sessionId}`)).status, 200);
  });
  await check('supervisor dapat membuka detail temuan', async () => {
    assert.equal((await call(supervisor, 'GET', `/api/detections/${det.id}`)).status, 200);
  });
  await check('admin melihat semuanya', async () => {
    assert.equal((await call(admin, 'GET', `/api/sessions/${sessionId}`)).status, 200);
  });

  console.log('\nSupervisor TIDAK boleh mengubah data surveyor (harus 403)');
  const forbidden: [string, string, unknown?][] = [
    ['POST', '/api/sessions', { name: 'x' }],
    ['PATCH', `/api/sessions/${sessionId}`, { name: 'ubah' }],
    ['DELETE', `/api/sessions/${sessionId}`],
    ['POST', `/api/sessions/${sessionId}/end`],
    ['POST', `/api/sessions/${sessionId}/submit`],
    ['POST', `/api/sessions/${sessionId}/resubmit`],
    ['POST', `/api/sessions/${sessionId}/create-revision`],
    ['POST', '/api/media/upload'],
    ['POST', `/api/media/${media.id}/process`],
    ['POST', `/api/media/${media.id}/retry`],
    ['DELETE', `/api/media/${media.id}`],
    ['PATCH', `/api/detections/${det.id}`, { condition: 'diubah' }],
    ['DELETE', `/api/detections/${det.id}`],
    ['POST', `/api/detections/${det.id}/resolve-conflict`, {}],
  ];
  for (const [m, p, b] of forbidden) {
    await check(`${m} ${p.replace(sessionId, ':sid').replace(det.id, ':did').replace(media.id, ':mid')}`, async () => {
      const r = await call(supervisor, m, p, b);
      assert.equal(r.status, 403, `status ${r.status} ${JSON.stringify(r.json)}`);
    });
  }
  await check('data surveyor tidak berubah setelah percobaan supervisor', async () => {
    const d = await prisma.detection.findUniqueOrThrow({ where: { id: det.id } });
    assert.equal(d.condition, 'uji');
    assert.equal(d.isDeleted, false);
    const s = await prisma.surveySession.findUniqueOrThrow({ where: { id: sessionId } });
    assert.notEqual(s.name, 'ubah');
  });

  console.log('\nSurveyor lain tidak boleh mengubah sesi bukan miliknya');
  await check('surveyor lain: PATCH sesi ditolak', async () => {
    assert.equal((await call(surveyor2, 'PATCH', `/api/sessions/${sessionId}`, { name: 'x' })).status, 403);
  });
  await check('surveyor lain: PATCH temuan ditolak', async () => {
    assert.equal((await call(surveyor2, 'PATCH', `/api/detections/${det.id}`, { condition: 'x' })).status, 403);
  });

  console.log('\nJalur koreksi: hanya supervisor dan admin');
  await check('surveyor TIDAK dapat mengoreksi temuan, menandai terlewat, atau membaca riwayat koreksi', async () => {
    assert.equal((await call(surveyor, 'POST', `/api/detections/${det.id}/correct`, { kind: 'dikonfirmasi' })).status, 403);
    assert.equal((await call(surveyor, 'POST', `/api/sessions/${sessionId}/missed`, { classId: cls.id })).status, 403);
    assert.equal((await call(surveyor, 'GET', '/api/corrections')).status, 403);
    assert.equal((await call(surveyor, 'GET', '/api/dashboard/latency')).status, 403);
  });
  await check('permintaan koreksi tidak valid ditolak (jenis tak dikenal, keliru tanpa alasan)', async () => {
    assert.equal((await call(supervisor, 'POST', `/api/detections/${det.id}/correct`, { kind: 'hapus' })).status, 400);
    assert.equal((await call(supervisor, 'POST', `/api/detections/${det.id}/correct`, { kind: 'keliru' })).status, 400);
    assert.equal((await call(supervisor, 'POST', `/api/detections/${det.id}/correct`, { kind: 'severity_diubah', severity: 7 })).status, 400);
  });
  await check('supervisor mengonfirmasi temuan: skor tidak berubah', async () => {
    const r = await call(supervisor, 'POST', `/api/detections/${det.id}/correct`, { kind: 'dikonfirmasi' });
    assert.equal(r.status, 200);
    assert.equal(r.json.detection.reviewStatus, 'dikonfirmasi');
    assert.equal(r.json.detection.riskScore, 9);
  });
  await check('supervisor mengubah severity 3 -> 1: skor dihitung ulang (1 x 3 = 3, sedang), sumber "petugas"', async () => {
    const r = await call(supervisor, 'POST', `/api/detections/${det.id}/correct`, { kind: 'severity_diubah', severity: 1, reason: 'lubang kecil' });
    assert.equal(r.status, 200);
    assert.equal(r.json.detection.severity, 1);
    assert.equal(r.json.detection.severitySource, 'petugas');
    assert.equal(r.json.detection.riskScore, 3);
    assert.equal(r.json.detection.priorityBand, 'sedang');
    assert.equal(r.json.detection.reviewStatus, 'dikoreksi');
  });
  await check('supervisor mengubah kelas ke Spanduk (Monitoring Kepatuhan): skor dan severity dikosongkan', async () => {
    const r = await call(supervisor, 'POST', `/api/detections/${det.id}/correct`, { kind: 'kelas_diubah', classId: bannerCls.id });
    assert.equal(r.status, 200);
    assert.equal(r.json.detection.className, 'banner');
    assert.equal(r.json.detection.riskScore, null);
    assert.equal(r.json.detection.priorityBand, null);
    assert.equal(r.json.detection.severity, null);
  });
  await check('severity tidak dapat diubah pada kelompok Monitoring Kepatuhan', async () => {
    assert.equal((await call(supervisor, 'POST', `/api/detections/${det.id}/correct`, { kind: 'severity_diubah', severity: 2 })).status, 400);
  });
  await check('admin mengembalikan kelas ke pothole: Severity kembali bawaan (3), skor 9 kritikal', async () => {
    const r = await call(admin, 'POST', `/api/detections/${det.id}/correct`, { kind: 'kelas_diubah', classId: cls.id });
    assert.equal(r.status, 200);
    assert.equal(r.json.detection.severity, 3);
    assert.equal(r.json.detection.severitySource, 'bawaan');
    assert.equal(r.json.detection.riskScore, 9);
    assert.equal(r.json.detection.priorityBand, 'kritikal');
  });
  await check('supervisor menandai temuan keliru (dengan alasan): tetap tersimpan, ditandai', async () => {
    const r = await call(supervisor, 'POST', `/api/detections/${det.id}/correct`, { kind: 'keliru', reason: 'bayangan, bukan lubang' });
    assert.equal(r.status, 200);
    assert.equal(r.json.detection.reviewStatus, 'keliru');
    assert.equal((await prisma.detection.findUniqueOrThrow({ where: { id: det.id } })).isDeleted, false);
  });
  await check('temuan terlewat: valid -> 201; bbox di luar 0-1 atau kelas tak valid -> 400', async () => {
    const ok = await call(supervisor, 'POST', `/api/sessions/${sessionId}/missed`, { classId: cls.id, mediaAssetId: media.id, timestampSeconds: 4.5, bbox: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, reason: 'lubang tak terdeteksi' });
    assert.equal(ok.status, 201);
    assert.equal(ok.json.correction.kind, 'terlewat');
    assert.equal((await call(supervisor, 'POST', `/api/sessions/${sessionId}/missed`, { classId: cls.id, bbox: { x: 2, y: 0, width: 1, height: 1 } })).status, 400);
    assert.equal((await call(supervisor, 'POST', `/api/sessions/${sessionId}/missed`, { classId: 'tidak-ada' })).status, 400);
    // "terlewat" tidak membuat temuan baru: pernyataan petugas, bukan keluaran model
    assert.equal(await prisma.detection.count({ where: { sessionId } }), 1);
  });
  await check('riwayat koreksi lengkap dan tidak menimpa (>= 6 baris), admin dapat membaca hasil koreksi supervisor', async () => {
    const r = await call(admin, 'GET', `/api/corrections?sessionId=${sessionId}`);
    assert.equal(r.status, 200);
    assert.ok(r.json.corrections.length >= 6, `hanya ${r.json.corrections.length}`);
    assert.ok(r.json.countsByKind.terlewat >= 1 && r.json.countsByKind.keliru >= 1);
    assert.ok(r.json.corrections.some((c: any) => c.actor.role === 'supervisor'));
    assert.ok((await prisma.auditLog.count({ where: { entityId: det.id, action: { startsWith: 'OFFICER_' } } })) >= 5);
  });
  await check('data masukan surveyor (kondisi) tidak diubah oleh koreksi', async () => {
    assert.equal((await prisma.detection.findUniqueOrThrow({ where: { id: det.id } })).condition, 'uji');
  });

  console.log('\nCakupan dashboard per peran (dibatasi di server)');
  await check('overview surveyor = hanya sesinya sendiri; surveyor lain tidak melihatnya', async () => {
    const mine = await call(surveyor, 'GET', '/api/dashboard/overview');
    assert.equal(mine.json.scope, 'own');
    assert.ok(mine.json.sessions.some((x: any) => x.id === sessionId));
    assert.ok(mine.json.sessions.every((x: any) => x.surveyor.name !== 'Surveyor Dua'));
    const other = await call(surveyor2, 'GET', '/api/dashboard/overview');
    assert.equal(other.json.scope, 'own');
    assert.ok(!other.json.sessions.some((x: any) => x.id === sessionId));
  });
  await check('surveyor tidak dapat memperluas cakupan lewat parameter surveyorId', async () => {
    const other = await prisma.user.findFirstOrThrow({ where: { email: requireEnv('SEED_SURVEYOR_EMAIL') } });
    const r = await call(surveyor2, 'GET', `/api/dashboard/overview?surveyorId=${other.id}`);
    assert.ok(!r.json.sessions.some((x: any) => x.id === sessionId));
  });
  await check('overview supervisor dan admin = semua surveyor; temuan keliru tidak dihitung valid', async () => {
    for (const c of [supervisor, admin]) {
      const r = await call(c, 'GET', '/api/dashboard/overview');
      assert.equal(r.json.scope, 'all');
      const ses = r.json.sessions.find((x: any) => x.id === sessionId);
      assert.ok(ses);
      assert.equal(ses.valid, 0);
      assert.equal(ses.falsePositiveCount, 1);
      assert.equal(ses.missedCount, 1);
    }
  });
  await check('latensi dapat dibaca supervisor dan admin', async () => {
    assert.equal((await call(supervisor, 'GET', '/api/dashboard/latency')).status, 200);
    assert.equal((await call(admin, 'GET', '/api/dashboard/latency')).status, 200);
  });

  console.log('\nData master & dashboard admin');
  for (const [who, c] of [['surveyor', surveyor], ['supervisor', supervisor]] as [string, Client][]) {
    await check(`${who} tidak dapat membaca daftar pengguna admin`, async () => {
      assert.notEqual((await call(c, 'GET', '/api/admin/users')).status, 200);
    });
    await check(`${who} tidak dapat membaca konfigurasi model AI`, async () => {
      assert.equal((await call(c, 'GET', '/api/admin/models')).status, 403);
    });
    // Daftar kelas sengaja dapat dibaca semua pengguna yang login (dibutuhkan UI entri/koreksi); menulis hanya admin.
    await check(`${who} dapat MEMBACA daftar kelas tetapi tidak dapat membuatnya`, async () => {
      assert.equal((await call(c, 'GET', '/api/admin/classes')).status, 200);
      const r = await call(c, 'POST', '/api/admin/classes', {
        name: `x_${stamp}`, visualDescription: 'v', conditionCriteria: 'c', feasibilityCriteria: 'f',
      });
      assert.equal(r.status, 403, `status ${r.status}`);
    });
  }
  await check('admin dapat membaca daftar pengguna', async () => {
    assert.equal((await call(admin, 'GET', '/api/admin/users')).status, 200);
  });

  console.log('\nGuard halaman (proxy)');
  const redirects: [string, Client, string, string][] = [
    ['surveyor', surveyor, '/admin/dashboard', '/surveyor/sessions'],
    ['surveyor', surveyor, '/supervisor/dashboard', '/surveyor/sessions'],
    ['supervisor', supervisor, '/admin/dashboard', '/supervisor/dashboard'],
    ['supervisor', supervisor, '/surveyor/sessions', '/supervisor/dashboard'],
  ];
  for (const [who, c, path, expected] of redirects) {
    await check(`${who} membuka ${path} -> dialihkan ke ${expected}`, async () => {
      const r = await call(c, 'GET', path);
      assert.ok([301, 302, 303, 307, 308].includes(r.status), `status ${r.status}`);
      assert.ok((r.location || '').endsWith(expected), `location ${r.location}`);
    });
  }
  await check('tanpa login -> /login', async () => {
    const r = await call({ name: 'anon', cookie: '' }, 'GET', '/supervisor/dashboard');
    assert.ok((r.location || '').endsWith('/login'), `location ${r.location}`);
  });
  await check('admin tidak dialihkan dari /admin/dashboard', async () => {
    assert.equal((await call(admin, 'GET', '/admin/dashboard')).status, 200);
  });
  await check('surveyor tidak dialihkan dari /surveyor/sessions', async () => {
    assert.equal((await call(surveyor, 'GET', '/surveyor/sessions')).status, 200);
  });

  // Bersih-bersih fixture
  await prisma.surveySession.delete({ where: { id: sessionId } });
  await prisma.user.deleteMany({ where: { email: { in: [`surveyor2-${stamp}@test.local`, `sup-${stamp}@test.local`, `x-${stamp}@test.local`] } } });

  console.log(`\n${passed} lulus, ${failures.length} gagal`);
  if (failures.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
