import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { SUBTYPE_PROFILES } from '../src/lib/risk';

/**
 * Seed purwarupa RQ4 (idempotent):
 *  1. Kelas deteksi dari 6 model YOLO (8 subtipe) beserta kategori, kelompok, dan Severity bawaan.
 *  2. Zona contoh -> Exposure. SEMUA zona ini DATA CONTOH (isSimulated = true), bukan data lokasi riil.
 *  3. 35 klip uji RQ3 dari prisma/data/rq3_clips.json (data riil dari Tracker Evaluasi).
 */
const prisma = new PrismaClient();

const SAM_COLORS: Record<string, string> = {
  pavedroad_pothole: '#DC2626',
  pavedroad_crack: '#F97316',
  vegetation_blocking: '#16A34A',
  vegetation_dead: '#A16207',
  weeds: '#65A30D',
  sign: '#2563EB',
  banner: '#9333EA',
  house_notice: '#0891B2',
};

const CLASS_TEXT: Record<string, { visual: string; condition: string; feasibility: string }> = {
  pavedroad_pothole: {
    visual: 'Lubang pada permukaan jalan beraspal atau beton.',
    condition: 'Kerusakan lapisan perkerasan berupa lubang.',
    feasibility: 'Keparahan ditentukan oleh skor risiko (Severity x Exposure), bukan oleh kelayakan.',
  },
  pavedroad_crack: {
    visual: 'Retakan memanjang atau jaring pada permukaan jalan.',
    condition: 'Retak permukaan jalan.',
    feasibility: 'Keparahan ditentukan oleh skor risiko (Severity x Exposure), bukan oleh kelayakan.',
  },
  vegetation_blocking: {
    visual: 'Vegetasi yang menutup rambu, jalur, atau objek lain.',
    condition: 'Vegetasi menghalangi objek.',
    feasibility: 'Keparahan ditentukan oleh skor risiko (Severity x Exposure), bukan oleh kelayakan.',
  },
  vegetation_dead: {
    visual: 'Pohon atau tanaman mati yang berisiko tumbang.',
    condition: 'Vegetasi mati berisiko tumbang.',
    feasibility: 'Keparahan ditentukan oleh skor risiko (Severity x Exposure), bukan oleh kelayakan.',
  },
  weeds: {
    visual: 'Rumput liar atau gulma di area yang seharusnya bersih.',
    condition: 'Gulma tumbuh liar.',
    feasibility: 'Keparahan ditentukan oleh skor risiko (Severity x Exposure), bukan oleh kelayakan.',
  },
  sign: {
    visual: 'Rambu atau papan penanda di dalam kawasan.',
    condition: 'Rambu terdeteksi. Kondisi normal/rusak belum diklasifikasi (Stage 2); Severity awal 2 dapat diubah petugas.',
    feasibility: 'Keparahan ditentukan oleh skor risiko (Severity x Exposure), bukan oleh kelayakan.',
  },
  banner: {
    visual: 'Spanduk atau banner yang terpasang di area kawasan.',
    condition: 'Monitoring kepatuhan: hanya dilaporkan, tanpa skor risiko.',
    feasibility: 'Tidak dinilai (Monitoring Kepatuhan).',
  },
  house_notice: {
    visual: 'Notis jual atau sewa yang terpasang pada rumah.',
    condition: 'Monitoring kepatuhan: hanya dilaporkan, tanpa skor risiko.',
    feasibility: 'Tidak dinilai (Monitoring Kepatuhan).',
  },
};

const ZONES = [
  { code: 'ZN-SIM-01', name: 'Jalan Utama Township (data contoh)', zoneType: 'jalan_utama', exposure: 3, description: 'Jalan umum ramai / akses utama township. Nilai Exposure adalah data contoh.' },
  { code: 'ZN-SIM-02', name: 'Kawasan Hunian Cluster (data contoh)', zoneType: 'hunian', exposure: 2, description: 'Kawasan hunian. Nilai Exposure adalah data contoh.' },
  { code: 'ZN-SIM-03', name: 'Taman dan Jalur Jogging (data contoh)', zoneType: 'area_minim_aktivitas', exposure: 1, description: 'Area minim aktivitas di dalam kawasan hunian. Nilai Exposure adalah data contoh.' },
];

async function main() {
  for (const p of SUBTYPE_PROFILES) {
    const text = CLASS_TEXT[p.subtype];
    const data = {
      displayName: p.label,
      visualDescription: text.visual,
      conditionCriteria: text.condition,
      feasibilityCriteria: text.feasibility,
      modelClass: p.subtype,
      category: p.category,
      categoryGroup: p.group,
      defaultSeverity: p.severity,
      samColor: SAM_COLORS[p.subtype],
      isActive: true,
    };
    await prisma.classDefinition.upsert({
      where: { name: p.subtype },
      update: data,
      create: { name: p.subtype, ...data },
    });
  }
  console.log(`Kelas YOLO: ${SUBTYPE_PROFILES.length} subtipe`);

  for (const z of ZONES) {
    await prisma.zone.upsert({
      where: { code: z.code },
      update: { ...z, isSimulated: true },
      create: { ...z, isSimulated: true },
    });
  }
  console.log(`Zona contoh: ${ZONES.length} (isSimulated = true)`);

  // Model deteksi lokal YOLO. Dijadikan default hanya bila belum ada model default aktif lain.
  const existingDefault = await prisma.modelConfig.findFirst({ where: { isDefault: true, isActive: true } });
  const yolo = await prisma.modelConfig.findFirst({ where: { provider: 'yolo', modelName: 'yolo11n_seed0' } });
  if (!yolo) {
    await prisma.modelConfig.create({
      data: {
        name: 'YOLO11n seed0 (6 model kategori, CPU)',
        provider: 'yolo',
        modelName: 'yolo11n_seed0',
        isDefault: !existingDefault,
        isActive: true,
      },
    });
  }
  console.log(`Model YOLO: ${yolo ? 'sudah ada' : 'dibuat'}${!existingDefault && !yolo ? ' (dijadikan default)' : existingDefault && !yolo ? ' (default saat ini tidak diubah; setel di menu Model AI)' : ''}`);

  const clips = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'rq3_clips.json'), 'utf-8')) as any[];
  for (const c of clips) {
    const data = {
      fileName: c.fileName,
      categories: JSON.stringify(c.categories),
      hasFinding: c.hasFinding,
      durationSeconds: c.durationSeconds,
      referenceCaption: c.referenceCaption,
      validationStatus: c.validationStatus,
      modelCaption: c.modelCaption,
      bleu: c.bleu,
      llmOverall: c.llmOverall,
      completeness: c.completeness,
      locationAccuracy: c.locationAccuracy,
      severityAccuracy: c.severityAccuracy,
      categoriesDetected: JSON.stringify(c.categoriesDetected),
      categoriesMissed: JSON.stringify(c.categoriesMissed),
      categoriesHallucinated: JSON.stringify(c.categoriesHallucinated),
      judgeReason: c.judgeReason,
      generatorModel: c.generatorModel,
      generatorFrames: c.generatorFrames,
    };
    await prisma.evaluatedClip.upsert({
      where: { clipId: c.clipId },
      update: data,
      create: { clipId: c.clipId, ...data },
    });
  }
  console.log(`Klip RQ3: ${clips.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
