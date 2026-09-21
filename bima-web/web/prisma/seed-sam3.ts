import 'dotenv/config';
import { requireEnv } from '../src/lib/env';
/**
 * Seeds SAM prompts (from publicspace_vlm's CLASS_PROMPTS) for the classes and a local SAM3 model
 * config, then makes SAM3 the default model. Idempotent: safe to run repeatedly.
 *
 *   npm run seed:sam3
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Only manhole is notebook-native: the notebook's pothole / road_crack / traffic_sign prompts are already
// carried by jalan_berlubang / jalan_retak / rambu_rusak below (redundant classes were merged).
// Text prompts are copied verbatim from CLASS_PROMPTS; colors are the notebook's BGR values as hex.
const SAM_CLASSES = [
  {
    name: 'manhole',
    displayName: 'Manhole (Tutup Got)',
    samPrompt:
      'manhole cover, sewer cover on the road, either circle or square or rectangular, usually metal or concrete.',
    samColor: '#00ff00',
  },
];

// SAM prompts for the classes that already existed (seed.ts / created by admins). Short English noun
// phrases, as SAM3 expects. Only filled when the class has no SAM prompt yet; never overwrites admin edits.
const EXISTING_CLASS_SAM_PROMPTS: Record<string, { samPrompt: string; samColor: string }> = {
  jalan_berlubang: { samPrompt: 'pothole on the road, damaged asphalt hole.', samColor: '#ff3b30' },
  jalan_retak: { samPrompt: 'Crack lines on road', samColor: '#007aff' },
  rambu_rusak: { samPrompt: 'traffic sign', samColor: '#ff9500' },
  marka_pudar: { samPrompt: 'faded road marking, worn white or yellow lane line', samColor: '#5ac8fa' },
  lampu_padam: { samPrompt: 'street light pole, broken street lamp', samColor: '#af52de' },
  trotoar_rusak: { samPrompt: 'damaged sidewalk, broken paving blocks on pedestrian path', samColor: '#a2845e' },
  kaca_cembung: { samPrompt: 'convex safety mirror on a pole at a street intersection', samColor: '#ff2d92' },
};

async function fillExistingClassPrompts() {
  for (const [name, cfg] of Object.entries(EXISTING_CLASS_SAM_PROMPTS)) {
    const cls = await prisma.classDefinition.findUnique({
      where: { name },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    if (!cls || cls.samPrompt?.trim()) continue;
    const updated = await prisma.classDefinition.update({
      where: { id: cls.id },
      data: { samPrompt: cfg.samPrompt, samColor: cls.samColor ?? cfg.samColor },
    });
    await prisma.classDefinitionVersion.create({
      data: {
        classId: cls.id,
        versionNumber: (cls.versions[0]?.versionNumber || 1) + 1,
        snapshotData: JSON.stringify({
          name: updated.name,
          displayName: updated.displayName,
          visualDescription: updated.visualDescription,
          conditionCriteria: updated.conditionCriteria,
          feasibilityCriteria: updated.feasibilityCriteria,
          samPrompt: updated.samPrompt,
          samColor: updated.samColor,
        }),
      },
    });
    console.log(`SAM prompt set for ${name}`);
  }
}

async function main() {
  await fillExistingClassPrompts();
  for (const c of SAM_CLASSES) {
    const data = {
      displayName: c.displayName,
      visualDescription: c.samPrompt,
      conditionCriteria: 'Dinilai dari hasil segmentasi SAM3 (jumlah instance dan luas area).',
      feasibilityCriteria:
        'Layak: tidak ada temuan; Cukup Layak: temuan kecil; Tidak Layak: temuan banyak atau luas area besar.',
      samPrompt: c.samPrompt,
      samColor: c.samColor,
    };
    const existing = await prisma.classDefinition.findUnique({ where: { name: c.name } });
    if (existing) {
      // Only fill the SAM fields; never overwrite what an admin edited in the UI.
      await prisma.classDefinition.update({
        where: { name: c.name },
        data: { samPrompt: existing.samPrompt ?? c.samPrompt, samColor: existing.samColor ?? c.samColor },
      });
    } else {
      await prisma.classDefinition.create({
        data: {
          name: c.name,
          ...data,
          versions: { create: { versionNumber: 1, snapshotData: JSON.stringify({ name: c.name, ...data }) } },
        },
      });
    }
  }
  console.log(`Seeded ${SAM_CLASSES.length} SAM3-native class(es).`);

  let model = await prisma.modelConfig.findFirst({ where: { provider: 'sam3' } });
  if (!model) {
    model = await prisma.modelConfig.create({
      data: {
        name: 'SAM 3.1 Lokal (Default)',
        provider: 'sam3',
        modelName: requireEnv('NEXT_PUBLIC_DEFAULT_SAM3_MODEL_NAME'),
        samMode: 'optimized',
        endpointUrl: null,
        encryptedApiKey: null,
        isDefault: false,
        isActive: true,
      },
    });
  }
  await prisma.modelConfig.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
  await prisma.modelConfig.update({ where: { id: model.id }, data: { isDefault: true, isActive: true } });
  console.log(`Default model: ${model.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
