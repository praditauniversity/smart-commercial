import 'dotenv/config';
import { requireEnv } from '../src/lib/env';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

/**
 * Seed untuk purwarupa/demo: hanya tiga pengguna (admin, surveyor, supervisor) dari env SEED_*.
 * Berbeda dengan `npm run seed`, tidak membuat kelas VLM lama maupun konfigurasi model; kelas, zona, klip RQ3, dan
 * model YOLO dibuat oleh `npm run seed:risk`.
 */
const prisma = new PrismaClient();

async function upsertUser(prefix: 'ADMIN' | 'SURVEYOR' | 'SUPERVISOR', role: string, name: string) {
  const email = requireEnv(`SEED_${prefix}_EMAIL`);
  const passwordHash = await bcrypt.hash(requireEnv(`SEED_${prefix}_PASSWORD`), 10);
  await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, role, isActive: true },
    create: { email, name, passwordHash, role, isActive: true },
  });
  console.log(`Pengguna ${role}: ${email}`);
}

async function main() {
  await upsertUser('ADMIN', 'admin', 'Admin Demo');
  await upsertUser('SURVEYOR', 'surveyor', 'Surveyor Demo');
  await upsertUser('SUPERVISOR', 'supervisor', 'Supervisor Demo');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
