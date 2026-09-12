import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database with initial admin, surveyor, classes, and model config...');

  // 1. Users
  const adminPasswordHash = await bcrypt.hash('admin123', 10);
  const surveyorPasswordHash = await bcrypt.hash('surveyor123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@bima.id' },
    update: {
      name: 'Admin Utama Kawasan',
      passwordHash: adminPasswordHash,
      role: 'admin',
      isActive: true,
    },
    create: {
      email: 'admin@bima.id',
      name: 'Admin Utama Kawasan',
      passwordHash: adminPasswordHash,
      role: 'admin',
      isActive: true,
    },
  });

  const surveyor = await prisma.user.upsert({
    where: { email: 'surveyor@bima.id' },
    update: {
      name: 'Bima Surveyor Lapangan',
      passwordHash: surveyorPasswordHash,
      role: 'surveyor',
      isActive: true,
    },
    create: {
      email: 'surveyor@bima.id',
      name: 'Bima Surveyor Lapangan',
      passwordHash: surveyorPasswordHash,
      role: 'surveyor',
      isActive: true,
    },
  });

  console.log(`Created users: Admin (${admin.email}), Surveyor (${surveyor.email})`);

  // 2. Class Definitions
  const initialClasses = [
    {
      name: 'jalan_berlubang',
      displayName: 'Jalan Berlubang / Pothole',
      visualDescription: 'Permukaan aspal jalan yang berlubang, retak buaya parah atau amblas dengan kedalaman bervariasi.',
      conditionCriteria: 'Kerusakan lapisan perkerasan aspal atau beton jalan raya.',
      feasibilityCriteria: 'Layak: lubang kecil < 2cm tidak berbahaya; Cukup Layak: lubang 2-5cm memerlukan penambalan; Tidak Layak: lubang > 5cm berbahaya bagi kendaraan.',
      mutuallyExclusiveWith: JSON.stringify(['jalan_mulus']),
      conflictIouThreshold: 0.5,
    },
    {
      name: 'rambu_rusak',
      displayName: 'Rambu Lalu Lintas Rusak',
      visualDescription: 'Rambu lalu lintas miring, bengkok, pudar, tertutup stiker/vandalisme, atau roboh.',
      conditionCriteria: 'Kerusakan fisik tiang, daun rambu, atau keterbacaan simbol.',
      feasibilityCriteria: 'Layak: rambu tegak lurus, bersih dan reflektif; Cukup Layak: sedikit pudar namun simbol masih terbaca; Tidak Layak: miring parah, bengkok, atau simbol tidak terbaca.',
      mutuallyExclusiveWith: JSON.stringify(['rambu_baik']),
      conflictIouThreshold: 0.5,
    },
    {
      name: 'marka_pudar',
      displayName: 'Marka Jalan Pudar / Hilang',
      visualDescription: 'Garis marka jalan putih atau kuning yang aus, terkelupas, atau tidak terlihat jelas.',
      conditionCriteria: 'Aus akibat gesekan roda kendaraan dan paparan cuaca.',
      feasibilityCriteria: 'Layak: marka jelas, kontras tinggi; Cukup Layak: garis masih tampak 50%; Tidak Layak: hilang/tak terlihat sama sekali di malam hari.',
      mutuallyExclusiveWith: JSON.stringify([]),
      conflictIouThreshold: 0.5,
    },
    {
      name: 'lampu_padam',
      displayName: 'Penerangan Jalan Umum (PJU) Rusak',
      visualDescription: 'Lampu penerangan jalan umum (PJU) dengan kap pecah, tiang keropos, kabel menjuntai, atau tidak menyala.',
      conditionCriteria: 'Kerusakan fisik atau kelistrikan instalasi PJU.',
      feasibilityCriteria: 'Layak: fisik kokoh dan menyala optimal; Cukup Layak: menyala redup atau kap sedikit kotor; Tidak Layak: pecah, roboh, atau padam total.',
      mutuallyExclusiveWith: JSON.stringify([]),
      conflictIouThreshold: 0.5,
    },
    {
      name: 'trotoar_rusak',
      displayName: 'Trotoar / Jalur Pedestrian Rusak',
      visualDescription: 'Paving block trotoar pecah, terangkat akar pohon, berlubang, atau amblas.',
      conditionCriteria: 'Kerusakan paving block dan jalur pejalan kaki.',
      feasibilityCriteria: 'Layak: permukaan rata, guiding block utuh; Cukup Layak: ada beberapa paving lepas tanpa lubang; Tidak Layak: lubang dalam / terangkat parah membahayakan pejalan kaki.',
      mutuallyExclusiveWith: JSON.stringify([]),
      conflictIouThreshold: 0.5,
    },
  ];

  for (const cls of initialClasses) {
    const classDef = await prisma.classDefinition.upsert({
      where: { name: cls.name },
      update: {
        displayName: cls.displayName,
        visualDescription: cls.visualDescription,
        conditionCriteria: cls.conditionCriteria,
        feasibilityCriteria: cls.feasibilityCriteria,
        mutuallyExclusiveWith: cls.mutuallyExclusiveWith,
        conflictIouThreshold: cls.conflictIouThreshold,
        isActive: true,
      },
      create: {
        name: cls.name,
        displayName: cls.displayName,
        visualDescription: cls.visualDescription,
        conditionCriteria: cls.conditionCriteria,
        feasibilityCriteria: cls.feasibilityCriteria,
        mutuallyExclusiveWith: cls.mutuallyExclusiveWith,
        conflictIouThreshold: cls.conflictIouThreshold,
        isActive: true,
      },
    });

    // Check version
    const existingVersion = await prisma.classDefinitionVersion.findFirst({
      where: { classId: classDef.id, versionNumber: 1 },
    });

    if (!existingVersion) {
      await prisma.classDefinitionVersion.create({
        data: {
          classId: classDef.id,
          versionNumber: 1,
          snapshotData: JSON.stringify({
            name: classDef.name,
            displayName: classDef.displayName,
            visualDescription: classDef.visualDescription,
            conditionCriteria: classDef.conditionCriteria,
            feasibilityCriteria: classDef.feasibilityCriteria,
          }),
        },
      });
    }
  }

  console.log(`Seeded ${initialClasses.length} class definitions and versions.`);

  // 3. Model Config
  const defaultModel = await prisma.modelConfig.findFirst({
    where: { modelName: 'qwen/qwen3-vl-8b-instruct' },
  });

  if (!defaultModel) {
    await prisma.modelConfig.create({
      data: {
        name: 'Qwen3 VL 8B Vision (Default)',
        provider: 'OpenRouter',
        modelName: 'qwen/qwen3-vl-8b-instruct',
        endpointUrl: 'https://openrouter.ai/api/v1/chat/completions',
        encryptedApiKey: null,
        isDefault: true,
        isActive: true,
      },
    });
  }

  const onPremiseModel = await prisma.modelConfig.findFirst({
    where: { modelName: 'qwen3-vl-8b-local' },
  });

  if (!onPremiseModel) {
    await prisma.modelConfig.create({
      data: {
        name: 'On-Premise Local Vision Endpoint',
        provider: 'onpremise',
        modelName: 'qwen3-vl-8b-local',
        endpointUrl: 'http://localhost:8000/v1/vision',
        encryptedApiKey: null,
        isDefault: false,
        isActive: true,
      },
    });
  }

  console.log('Seeded default and on-premise model configurations.');
  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
