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
  await check('permintaan koreksi tidak valid ditolak (jenis tak dikenal, severity di luar 1-3)', async () => {
    assert.equal((await call(supervisor, 'POST', `/api/detections/${det.id}/correct`, { kind: 'hapus' })).status, 400);
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
  await check('koreksi massal: surveyor ditolak; jenis/ids tidak valid 400; temuan tak ada 404', async () => {
    assert.equal((await call(surveyor, 'POST', '/api/detections/bulk-correct', { ids: [det.id], kind: 'dikonfirmasi' })).status, 403);
    assert.equal((await call(supervisor, 'POST', '/api/detections/bulk-correct', { ids: [det.id], kind: 'kelas_diubah' })).status, 400);
    assert.equal((await call(supervisor, 'POST', '/api/detections/bulk-correct', { ids: [], kind: 'keliru' })).status, 400);
    assert.equal((await call(supervisor, 'POST', '/api/detections/bulk-correct', { ids: [det.id, 'tidak-ada'], kind: 'keliru' })).status, 404);
  });
  await check('koreksi massal tanpa alasan: konfirmasi benar lalu tandai keliru; tiap temuan punya riwayat sendiri', async () => {
    const before = await prisma.officerCorrection.count({ where: { detectionId: det.id } });
    const ok = await call(supervisor, 'POST', '/api/detections/bulk-correct', { ids: [det.id], kind: 'dikonfirmasi' });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.updated, 1);
    assert.equal((await prisma.detection.findUniqueOrThrow({ where: { id: det.id } })).reviewStatus, 'dikonfirmasi');
    const wrong = await call(supervisor, 'POST', '/api/detections/bulk-correct', { ids: [det.id], kind: 'keliru' });
    assert.equal(wrong.status, 200);
    const d = await prisma.detection.findUniqueOrThrow({ where: { id: det.id } });
    assert.equal(d.reviewStatus, 'keliru');
    assert.equal(await prisma.officerCorrection.count({ where: { detectionId: det.id } }), before + 2);
  });
  await check('antrean review membedakan benar / keliru / terlewat dari data sesi saat ini', async () => {
    const q = await call(supervisor, 'GET', '/api/admin/reviews?status=all');
    assert.equal(q.status, 200);
    const mine = (q.json.submissions as any[]).find((s) => s.sessionId === sessionId);
    if (mine) {
      assert.ok(typeof mine.review.benar === 'number' && mine.review.keliru >= 1);
      assert.equal(mine.review.totalTemuan, mine.review.benar + mine.review.keliru + mine.review.belumDitinjau);
    }
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

  console.log('\nApproval survei oleh supervisor');
  const sidR = (await call(surveyor, 'POST', '/api/sessions', { name: `review ${stamp}` })).json.session.id;
  const sidR2 = (await call(surveyor, 'POST', '/api/sessions', { name: `review tolak ${stamp}` })).json.session.id;
  await prisma.surveySession.updateMany({ where: { id: { in: [sidR, sidR2] } }, data: { status: 'selesai_menunggu_submit' } });
  let subId = '';
  let subId2 = '';
  await check('surveyor submit: pesan menyebut supervisor (bukan admin)', async () => {
    const r = await call(surveyor, 'POST', `/api/sessions/${sidR}/submit`);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.match(r.json.message, /supervisor/i);
    assert.doesNotMatch(r.json.message, /admin/i);
    const r2 = await call(surveyor, 'POST', `/api/sessions/${sidR2}/submit`);
    assert.equal(r2.status, 200);
  });
  await check('supervisor melihat antrean review; surveyor tidak', async () => {
    const q = await call(supervisor, 'GET', '/api/admin/reviews?status=menunggu_review');
    assert.equal(q.status, 200);
    subId = q.json.submissions.find((x: any) => x.sessionId === sidR)?.id;
    subId2 = q.json.submissions.find((x: any) => x.sessionId === sidR2)?.id;
    assert.ok(subId && subId2, 'pengajuan tidak muncul di antrean supervisor');
    assert.equal((await call(supervisor, 'GET', `/api/admin/reviews/${subId}`)).status, 200);
    assert.equal((await call(surveyor, 'GET', '/api/admin/reviews')).status, 403);
    assert.equal((await call(surveyor, 'GET', `/api/admin/reviews/${subId}`)).status, 403);
  });
  await check('surveyor TIDAK dapat menyetujui/menolak sendiri', async () => {
    assert.equal((await call(surveyor, 'POST', `/api/admin/reviews/${subId}/approve`, {})).status, 403);
    assert.equal((await call(surveyor, 'POST', `/api/admin/reviews/${subId}/reject`, { rejectReason: 'x' })).status, 403);
  });
  await check('supervisor menyetujui: status sesi menjadi disetujui, reviewer tercatat', async () => {
    const r = await call(supervisor, 'POST', `/api/admin/reviews/${subId}/approve`, { notes: 'sesuai' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const s = await prisma.surveySession.findUniqueOrThrow({ where: { id: sidR } });
    assert.equal(s.status, 'disetujui');
    const sub = await prisma.submissionVersion.findUniqueOrThrow({ where: { id: subId }, include: { reviewer: true } });
    assert.equal(sub.reviewer?.role, 'supervisor');
  });
  await check('supervisor menolak: wajib alasan; dengan alasan -> ditolak', async () => {
    assert.equal((await call(supervisor, 'POST', `/api/admin/reviews/${subId2}/reject`, {})).status, 400);
    const r = await call(supervisor, 'POST', `/api/admin/reviews/${subId2}/reject`, { rejectReason: 'Foto buram', reviewNotes: 'ulangi' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal((await prisma.surveySession.findUniqueOrThrow({ where: { id: sidR2 } })).status, 'ditolak');
  });
  await check('pengajuan yang sudah diputuskan tidak dapat disetujui ulang', async () => {
    assert.equal((await call(supervisor, 'POST', `/api/admin/reviews/${subId}/approve`, {})).status, 400);
  });
  await check('halaman antrean review: supervisor dan admin masuk; surveyor dialihkan', async () => {
    assert.equal((await call(supervisor, 'GET', '/supervisor/reviews')).status, 200);
    assert.equal((await call(admin, 'GET', '/supervisor/reviews')).status, 200);
    const r = await call(surveyor, 'GET', '/supervisor/reviews');
    assert.ok([301, 302, 303, 307, 308].includes(r.status), `status ${r.status}`);
  });
  await prisma.surveySession.deleteMany({ where: { id: { in: [sidR, sidR2] } } });

  console.log('\nData master risiko: hanya admin');
  for (const [who, c] of [['surveyor', surveyor], ['supervisor', supervisor]] as [string, Client][]) {
    await check(`${who} tidak dapat membaca/membuat/mengubah zona master atau Severity kelas`, async () => {
      assert.equal((await call(c, 'GET', '/api/admin/zones')).status, 403);
      assert.equal((await call(c, 'POST', '/api/admin/zones', { code: 'ZN-X', name: 'x', zoneType: 'hunian', exposure: 1 })).status, 403);
      assert.equal((await call(c, 'PATCH', `/api/admin/classes/${cls.id}`, { defaultSeverity: 1 })).status, 403);
    });
  }
  await check('admin: siklus zona (buat, ubah exposure, nonaktifkan bila dipakai, hapus bila tidak)', async () => {
    const code = `ZN-T${stamp % 100000}`;
    const created = await call(admin, 'POST', '/api/admin/zones', { code, name: 'Zona uji', zoneType: 'hunian', exposure: 2 });
    assert.equal(created.status, 201);
    assert.equal(created.json.zone.isSimulated, false, 'zona buatan admin tidak ditandai simulasi');
    const zid = created.json.zone.id;
    assert.equal((await call(admin, 'POST', '/api/admin/zones', { code, name: 'dup', zoneType: 'hunian', exposure: 2 })).status, 409);
    assert.equal((await call(admin, 'POST', '/api/admin/zones', { code: 'ZN-Y', name: 'y', zoneType: 'hunian', exposure: 4 })).status, 400);
    const up = await call(admin, 'PATCH', `/api/admin/zones/${zid}`, { exposure: 3 });
    assert.equal(up.json.zone.exposure, 3);
    // dipakai sesi -> hanya dinonaktifkan
    const sid = (await call(surveyor, 'POST', '/api/sessions', { name: `zona uji ${stamp}`, zoneId: zid })).json.session.id;
    const del = await call(admin, 'DELETE', `/api/admin/zones/${zid}`);
    assert.equal(del.json.deactivated, true);
    assert.equal((await prisma.zone.findUniqueOrThrow({ where: { id: zid } })).isActive, false);
    assert.equal((await call(surveyor, 'POST', '/api/sessions', { name: 'x', zoneId: zid })).status, 400, 'zona nonaktif tidak dapat dipilih');
    await prisma.surveySession.delete({ where: { id: sid } });
    assert.equal((await call(admin, 'DELETE', `/api/admin/zones/${zid}`)).json.deactivated, false);
    assert.equal(await prisma.zone.count({ where: { id: zid } }), 0);
  });
  await check('admin: validasi Severity kelas (infrastruktur wajib 1-3; kepatuhan tanpa severity)', async () => {
    const weeds = await prisma.classDefinition.findFirstOrThrow({ where: { modelClass: 'weeds' } });
    assert.equal((await call(admin, 'PATCH', `/api/admin/classes/${weeds.id}`, { defaultSeverity: 5 })).status, 400);
    assert.equal((await call(admin, 'PATCH', `/api/admin/classes/${bannerCls.id}`, { defaultSeverity: 2 })).status, 400);
    assert.equal((await call(admin, 'PATCH', `/api/admin/classes/${weeds.id}`, { defaultSeverity: 1 })).status, 200);
    assert.equal((await prisma.classDefinition.findUniqueOrThrow({ where: { id: weeds.id } })).defaultSeverity, 1);
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
  await check('supervisor dan admin membuka dasbor/halaman baru tanpa dialihkan; surveyor ke validasi ahli dialihkan', async () => {
    assert.equal((await call(supervisor, 'GET', '/supervisor/dashboard')).status, 200);
    assert.equal((await call(admin, 'GET', '/supervisor/dashboard')).status, 200);
    assert.equal((await call(admin, 'GET', '/admin/risk-master')).status, 200);
    assert.equal((await call(admin, 'GET', '/admin/validasi-ahli')).status, 200);
    for (const p of ['/admin/risk-master', '/admin/validasi-ahli']) {
      const r = await call(supervisor, 'GET', p);
      assert.ok([301, 302, 303, 307, 308].includes(r.status), `${p} status ${r.status}`);
    }
  });
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
