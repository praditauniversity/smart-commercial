import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testModalMapLocation() {
  console.log('--- Testing Modal Map & Location Constraints ---');

  const surveyor = await prisma.user.findFirst({ where: { role: 'surveyor' } });
  if (!surveyor) throw new Error('Surveyor user not found');

  const activeClasses = await prisma.classDefinition.findMany({ where: { isActive: true } });

  // 1. Create a session with an Area (Polygon)
  const initialPolygonGeojson = JSON.stringify({
    type: 'Polygon',
    coordinates: [
      [
        [106.825, -6.175],
        [106.830, -6.175],
        [106.830, -6.180],
        [106.825, -6.180],
        [106.825, -6.175],
      ],
    ],
  });

  const session = await prisma.surveySession.create({
    data: {
      name: 'Survei Kawasan Area Monas',
      surveyDate: new Date(),
      locationAddress: 'Kawasan Monas, Jakarta Pusat',
      locationType: 'polygon',
      locationGeojson: initialPolygonGeojson,
      status: 'berlangsung',
      surveyorId: surveyor.id,
    },
  });

  console.log(`[1] Created Polygon SurveySession ${session.id}, type: ${session.locationType}`);

  // 2. Create a MediaAsset & Detection inside this session
  const mediaAsset = await prisma.mediaAsset.create({
    data: {
      sessionId: session.id,
      fileName: 'temuan_jalan_area_1.png',
      fileType: 'image',
      fileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      storagePath: `sessions/${session.id}/temuan_jalan_area_1.png`,
      status: 'completed',
    },
  });

  const detection = await prisma.detection.create({
    data: {
      sessionId: session.id,
      mediaAssetId: mediaAsset.id,
      classId: activeClasses[0].id,
      className: activeClasses[0].name,
      bbox: JSON.stringify({ x: 0.2, y: 0.3, width: 0.4, height: 0.4 }),
      condition: 'Jalan berlubang di dalam area kawasan',
      feasibility: 'tidak_layak',
      locationGeojson: JSON.stringify({ type: 'Point', coordinates: [106.827, -6.177] }),
    },
  });

  console.log(`[2] Created initial detection with point: [106.827, -6.177]`);

  // 3. Surveyor adjusts finding point location on the map (e.g. coordinates [106.8285, -6.1782])
  const updatedFindingPoint = { type: 'Point', coordinates: [106.8285, -6.1782] };
  const updatedDetection = await prisma.detection.update({
    where: { id: detection.id },
    data: {
      locationGeojson: JSON.stringify(updatedFindingPoint),
      condition: 'Koreksi: Lubang jalan berdiameter 50cm dekat gerbang timur',
    },
  });

  console.log(`[3] Updated finding location point in DB: ${updatedDetection.locationGeojson}`);

  // 4. Verify session boundary polygon remains intact and unchanged
  const reloadedSession = await prisma.surveySession.findUnique({
    where: { id: session.id },
    include: { detections: true },
  });

  if (reloadedSession?.locationGeojson !== initialPolygonGeojson) {
    throw new Error('Session polygon area was unexpectedly modified!');
  }

  const reloadedDet = reloadedSession.detections[0];
  const parsedDetGeo = JSON.parse(reloadedDet.locationGeojson || '{}');
  if (parsedDetGeo.coordinates[0] !== 106.8285 || parsedDetGeo.coordinates[1] !== -6.1782) {
    throw new Error('Detection point coordinates mismatch!');
  }

  console.log('[4] Verified: Session boundary polygon remains strictly intact (Read-Only).');
  console.log('[5] Verified: Finding point coordinates successfully edited and persisted.');
  console.log('--- Modal Map & Location Constraints Verification PASSED ---');
}

testModalMapLocation()
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
