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
  const cls = await prisma.classDefinition.findFirstOrThrow({ where: { modelClass: 'pavedroad_pothole' } });
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
      feasibility: 'cukup_layak',
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
