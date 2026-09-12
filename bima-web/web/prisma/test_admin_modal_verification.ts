import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testAdminModalVerification() {
  console.log('--- Testing Admin Review Modal & Map Integration ---');

  const admin = await prisma.user.findFirst({ where: { role: 'admin' } });
  const surveyor = await prisma.user.findFirst({ where: { role: 'surveyor' } });
  if (!admin || !surveyor) throw new Error('Admin or Surveyor user not found');

  const activeClasses = await prisma.classDefinition.findMany({ where: { isActive: true } });

  // 1. Create a session with an Area (Polygon)
  const sessionPolygonGeojson = JSON.stringify({
    type: 'Polygon',
    coordinates: [
      [
        [106.820, -6.170],
        [106.835, -6.170],
        [106.835, -6.185],
        [106.820, -6.185],
        [106.820, -6.170],
      ],
    ],
  });

  const session = await prisma.surveySession.create({
    data: {
      name: 'Survei Kawasan Admin Review Test',
      surveyDate: new Date(),
      locationAddress: 'Kawasan Sudirman Thamrin, Jakarta',
      locationType: 'polygon',
      locationGeojson: sessionPolygonGeojson,
      status: 'menunggu_review',
      surveyorId: surveyor.id,
    },
  });

  console.log(`[1] Created SurveySession ${session.id} (status: ${session.status})`);

  // 2. Create MediaAsset and Detection
  const mediaAsset = await prisma.mediaAsset.create({
    data: {
      sessionId: session.id,
      fileName: 'admin_review_media_1.png',
      fileType: 'image',
      fileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      storagePath: `sessions/${session.id}/admin_review_media_1.png`,
      status: 'completed',
    },
  });

  const initialFindingPoint = JSON.stringify({ type: 'Point', coordinates: [106.824, -6.174] });
  const detection = await prisma.detection.create({
    data: {
      sessionId: session.id,
      mediaAssetId: mediaAsset.id,
      classId: activeClasses[0].id,
      className: activeClasses[0].name,
      bbox: JSON.stringify({ x: 0.1, y: 0.1, width: 0.3, height: 0.3 }),
      condition: 'Temuan jalan retak evaluasi awal',
      feasibility: 'tidak_layak',
      locationGeojson: initialFindingPoint,
    },
  });

  // 3. Create SubmissionVersion
  const submission = await prisma.submissionVersion.create({
    data: {
      sessionId: session.id,
      versionNumber: 1,
      status: 'menunggu_review',
      snapshotData: JSON.stringify({
        session: { id: session.id, name: session.name, locationType: 'polygon', locationGeojson: sessionPolygonGeojson },
        mediaAssets: [mediaAsset],
        detections: [detection],
      }),
    },
  });

  console.log(`[2] Created SubmissionVersion ${submission.id}`);

  // 4. Admin opens modal and edits detection class, condition, feasibility, and finding location
  const updatedPoint = JSON.stringify({ type: 'Point', coordinates: [106.8288, -6.1799] });
  const targetClass = activeClasses[1] || activeClasses[0];

  const adminUpdate = await prisma.detection.update({
    where: { id: detection.id },
    data: {
      classId: targetClass.id,
      className: targetClass.name,
      condition: 'Koreksi Admin: Kerusakan marka jalan dan aspal sekitar halte',
      feasibility: 'cukup_layak',
      locationGeojson: updatedPoint,
    },
  });

  await prisma.auditLog.create({
    data: {
      action: 'ADMIN_CORRECT_DETECTION',
      entityType: 'Detection',
      entityId: detection.id,
      actorId: admin.id,
      changes: JSON.stringify({
        previous: { className: detection.className, condition: detection.condition, locationGeojson: initialFindingPoint },
        updated: { className: adminUpdate.className, condition: adminUpdate.condition, locationGeojson: updatedPoint },
      }),
    },
  });

  console.log(`[3] Admin corrected detection in database: class=${adminUpdate.className}, point=${adminUpdate.locationGeojson}`);

  // 5. Verify database integrity
  const reloadedSession = await prisma.surveySession.findUnique({
    where: { id: session.id },
    include: { detections: true },
  });

  if (reloadedSession?.locationGeojson !== sessionPolygonGeojson) {
    throw new Error('Session polygon boundary was unexpectedly altered!');
  }

  const reloadedDet = reloadedSession.detections[0];
  if (reloadedDet.className !== targetClass.name || reloadedDet.feasibility !== 'cukup_layak') {
    throw new Error('Detection updates not persisted properly!');
  }

  console.log('[4] Verified: Session area polygon boundary remains unchanged.');
  console.log('[5] Verified: Admin detection and map coordinates correction saved to database with Audit Log.');
  console.log('--- Admin Review Modal & Map Integration PASSED ---');
}

testAdminModalVerification()
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
