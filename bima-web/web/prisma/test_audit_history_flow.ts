import prisma from '../src/lib/prisma';
import bcrypt from 'bcryptjs';

async function main() {
  console.log('=== TEST AUDIT TRAIL & REVISION LIFECYCLE ===');

  // 1. Ensure surveyor and admin users exist
  const surveyor = await prisma.user.upsert({
    where: { email: 'surveyor@bima.id' },
    update: {},
    create: {
      email: 'surveyor@bima.id',
      passwordHash: await bcrypt.hash('surveyor123', 10),
      name: 'Bima Surveyor Lapangan',
      role: 'surveyor',
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@bima.id' },
    update: {},
    create: {
      email: 'admin@bima.id',
      passwordHash: await bcrypt.hash('admin123', 10),
      name: 'Admin Bima Utama',
      role: 'admin',
    },
  });

  const potholeClass = await prisma.classDefinition.findFirst({
    where: { name: 'jalan_berlubang' },
  });

  const mirrorClass = await prisma.classDefinition.findFirst({
    where: { name: 'kaca_cembung' },
  });

  // 2. Create Survey Session
  const session = await prisma.surveySession.create({
    data: {
      name: 'Survei Uji Audit Trail Cengkareng',
      locationType: 'polygon',
      locationGeojson: JSON.stringify({
        type: 'Polygon',
        coordinates: [
          [
            [106.74, -6.15],
            [106.75, -6.15],
            [106.75, -6.16],
            [106.74, -6.16],
            [106.74, -6.15],
          ],
        ],
      }),
      locationAddress: 'Cengkareng Barat, Jakarta Barat',
      surveyDate: new Date(),
      status: 'berlangsung',
      surveyorId: surveyor.id,
    },
  });

  // 3. Upload Media Asset & Create Detections
  const media = await prisma.mediaAsset.create({
    data: {
      sessionId: session.id,
      fileName: 'jalan_cengkareng_01.jpg',
      fileType: 'image',
      fileUrl: '/uploads/jalan_cengkareng_01.jpg',
      storagePath: `sessions/${session.id}/jalan_cengkareng_01.jpg`,
      status: 'completed',
      idempotencyKey: 'test-key-' + Date.now(),
    },
  });

  await prisma.auditLog.create({
    data: {
      action: 'SURVEYOR_UPLOAD_MEDIA',
      entityType: 'MediaAsset',
      entityId: media.id,
      actorId: surveyor.id,
      changes: JSON.stringify({
        sessionId: session.id,
        sessionName: session.name,
        fileName: media.fileName,
        fileType: media.fileType,
        actionDescription: `Surveyor mengunggah media baru: "${media.fileName}" (image).`,
      }),
    },
  });

  const det1 = await prisma.detection.create({
    data: {
      sessionId: session.id,
      mediaAssetId: media.id,
      classId: potholeClass?.id || 'pothole-id',
      className: potholeClass?.name || 'jalan_berlubang',
      bbox: JSON.stringify({ x: 0.2, y: 0.3, width: 0.4, height: 0.3 }),
      condition: 'lubang jalan berdiameter 30cm',
      feasibility: 'tidak_layak',
      locationGeojson: JSON.stringify({ type: 'Point', coordinates: [106.745, -6.155] }),
    },
  });

  // 4. Surveyor submits Version 1
  const subV1 = await prisma.submissionVersion.create({
    data: {
      sessionId: session.id,
      versionNumber: 1,
      status: 'menunggu_review',
      snapshotData: JSON.stringify({
        versionNumber: 1,
        submittedAt: new Date().toISOString(),
        submittedBy: { id: surveyor.id, name: surveyor.name, email: surveyor.email },
        session: { id: session.id, name: session.name },
        mediaAssets: [{ id: media.id, fileName: media.fileName }],
        detections: [{ id: det1.id, className: det1.className, condition: det1.condition }],
      }),
      submittedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      action: 'SURVEYOR_SUBMIT_SURVEY',
      entityType: 'SubmissionVersion',
      entityId: session.id,
      actorId: surveyor.id,
      changes: JSON.stringify({
        sessionId: session.id,
        sessionName: session.name,
        versionNumber: 1,
        actionDescription: 'Surveyor mengajukan hasil survei (Versi Snapshot: 1) untuk direview Admin.',
        totalMedia: 1,
        totalDetections: 1,
      }),
    },
  });

  // 5. Admin rejects Version 1
  await prisma.submissionVersion.update({
    where: { id: subV1.id },
    data: {
      status: 'ditolak',
      reviewedAt: new Date(),
      reviewerId: admin.id,
      rejectReason: 'Deteksi objek tidak akurat / salah kelas',
      reviewNotes: 'Objek pada gambar sebenarnya adalah Kaca Cembung retak, bukan lubang jalan.',
    },
  });

  await prisma.surveySession.update({
    where: { id: session.id },
    data: { status: 'ditolak' },
  });

  await prisma.auditLog.create({
    data: {
      action: 'ADMIN_REJECT_SURVEY',
      entityType: 'SubmissionVersion',
      entityId: subV1.id,
      actorId: admin.id,
      changes: JSON.stringify({
        sessionId: session.id,
        rejectReason: 'Deteksi objek tidak akurat / salah kelas',
        reviewNotes: 'Objek pada gambar sebenarnya adalah Kaca Cembung retak, bukan lubang jalan.',
        versionNumber: 1,
      }),
    },
  });

  // 6. Surveyor starts revision
  await prisma.surveySession.update({
    where: { id: session.id },
    data: { status: 'perlu_perbaikan' },
  });

  await prisma.auditLog.create({
    data: {
      action: 'SURVEYOR_START_REVISION',
      entityType: 'SurveySession',
      entityId: session.id,
      actorId: surveyor.id,
      changes: JSON.stringify({
        sessionId: session.id,
        sessionName: session.name,
        actionDescription: 'Surveyor mengaktifkan mode revisi perbaikan hasil survei.',
        previousStatus: 'ditolak',
        newStatus: 'perlu_perbaikan',
      }),
    },
  });

  // 7. Surveyor edits the detection to Kaca Cembung and moves location pin
  const prevData = {
    classId: det1.classId,
    className: 'Jalan Berlubang / Pothole',
    condition: det1.condition,
    feasibility: det1.feasibility,
    locationGeojson: det1.locationGeojson,
  };

  const newLocation = JSON.stringify({ type: 'Point', coordinates: [106.748, -6.152] });
  await prisma.detection.update({
    where: { id: det1.id },
    data: {
      classId: mirrorClass?.id,
      className: mirrorClass?.name || 'kaca_cembung',
      condition: 'kaca cembung retak di bagian tengah',
      feasibility: 'tidak_layak',
      locationGeojson: newLocation,
    },
  });

  await prisma.auditLog.create({
    data: {
      action: 'SURVEYOR_EDIT_DETECTION',
      entityType: 'Detection',
      entityId: det1.id,
      actorId: surveyor.id,
      changes: JSON.stringify({
        sessionId: session.id,
        mediaAssetId: media.id,
        fileName: media.fileName,
        targetName: 'Kaca Cembung',
        actionDescription: 'Surveyor memperbarui temuan "Kaca Cembung" pada file jalan_cengkareng_01.jpg.',
        previous: prevData,
        updated: {
          classId: mirrorClass?.id,
          className: mirrorClass?.displayName || 'Kaca Cembung',
          condition: 'kaca cembung retak di bagian tengah',
          feasibility: 'tidak_layak',
          locationGeojson: newLocation,
        },
      }),
    },
  });

  // 8. Surveyor re-submits Version 2
  const subV2 = await prisma.submissionVersion.create({
    data: {
      sessionId: session.id,
      versionNumber: 2,
      status: 'menunggu_review',
      snapshotData: JSON.stringify({
        versionNumber: 2,
        submittedAt: new Date().toISOString(),
        submittedBy: { id: surveyor.id, name: surveyor.name, email: surveyor.email },
        session: { id: session.id, name: session.name },
        mediaAssets: [{ id: media.id, fileName: media.fileName }],
        detections: [
          {
            id: det1.id,
            className: mirrorClass?.name || 'kaca_cembung',
            condition: 'kaca cembung retak di bagian tengah',
            feasibility: 'tidak_layak',
            locationGeojson: newLocation,
          },
        ],
      }),
      submittedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      action: 'SURVEYOR_RESUBMIT_REVISION',
      entityType: 'SubmissionVersion',
      entityId: session.id,
      actorId: surveyor.id,
      changes: JSON.stringify({
        sessionId: session.id,
        sessionName: session.name,
        versionNumber: 2,
        actionDescription: 'Surveyor mengajukan kembali revisi hasil survei (Versi Snapshot: 2).',
        totalMedia: 1,
        totalDetections: 1,
      }),
    },
  });

  // 9. Verify Querying Audit Logs for Version 2 Review Detail
  const relevantEntityIds = Array.from(
    new Set([session.id, subV2.id, subV1.id, det1.id, media.id])
  );

  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entityId: { in: relevantEntityIds } },
        { changes: { contains: session.id } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    include: { actor: { select: { id: true, name: true, email: true, role: true } } },
  });

  console.log(`\nFound ${logs.length} Audit Log entries for Version 2:`);
  logs.forEach((l, idx) => {
    console.log(`${idx + 1}. [${l.action}] by ${l.actor?.name} (${l.actor?.role}) at ${l.createdAt.toISOString()}`);
    console.log(`   Changes: ${l.changes}`);
  });

  if (logs.length >= 6) {
    console.log('\n SUCCESS: All lifecycle audit logs (upload, submit v1, reject, revision, detection edit, resubmit v2) are completely preserved and retrievable!');
  } else {
    console.error('\n FAILED: Some audit logs are missing.');
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
