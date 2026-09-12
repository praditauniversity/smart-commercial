import prisma from '../src/lib/prisma';

async function main() {
  console.log('=== TEST PRECISE FIELD-LEVEL DIFFS ===');

  const det = await prisma.detection.findFirst({
    where: { isDeleted: false },
    include: { session: true, classDefinition: true },
  });

  if (!det) {
    console.log('No detection found to test.');
    return;
  }

  console.log(`Testing with detection: ${det.id}, current condition: "${det.condition}"`);

  // Simulate calling PATCH with only condition changed and identical coordinates
  const pGeo = typeof det.locationGeojson === 'string' ? JSON.parse(det.locationGeojson) : det.locationGeojson;
  const currentCoords = pGeo?.coordinates || [106.745, -6.155];

  // Call the same logic as our updated route:
  const body = {
    classId: det.classId,
    condition: det.condition + ' (tergenang air)',
    feasibility: det.feasibility,
    locationGeojson: { type: 'Point', coordinates: currentCoords }, // Identical coordinates
  };

  const isClassChanged = Boolean(body.classId && body.classId !== det.classId);
  const isConditionChanged = Boolean(body.condition !== undefined && body.condition.trim() !== (det.condition || '').trim());
  const isFeasibilityChanged = Boolean(body.feasibility !== undefined && body.feasibility !== det.feasibility);

  let prevCoords: [number, number] | null = null;
  let nextCoords: [number, number] | null = null;
  if (pGeo && pGeo.type === 'Point' && Array.isArray(pGeo.coordinates)) {
    prevCoords = [pGeo.coordinates[0], pGeo.coordinates[1]];
  }
  if (body.locationGeojson && body.locationGeojson.type === 'Point' && Array.isArray(body.locationGeojson.coordinates)) {
    nextCoords = [body.locationGeojson.coordinates[0], body.locationGeojson.coordinates[1]];
  }

  let isLocationChanged = false;
  if (prevCoords && nextCoords) {
    isLocationChanged =
      Math.abs(prevCoords[0] - nextCoords[0]) > 0.000001 ||
      Math.abs(prevCoords[1] - nextCoords[1]) > 0.000001;
  }

  const diffPrevious: Record<string, any> = {};
  const diffUpdated: Record<string, any> = {};
  const changedLabels: string[] = [];

  if (isClassChanged) {
    diffPrevious.className = det.classDefinition?.displayName || det.className;
    diffUpdated.className = 'New Class';
    changedLabels.push('kelas objek');
  }

  if (isConditionChanged) {
    diffPrevious.condition = det.condition;
    diffUpdated.condition = body.condition.trim();
    changedLabels.push('deskripsi kondisi');
  }

  if (isFeasibilityChanged) {
    diffPrevious.feasibility = det.feasibility;
    diffUpdated.feasibility = body.feasibility;
    changedLabels.push('tingkat kelayakan');
  }

  if (isLocationChanged && nextCoords) {
    diffPrevious.locationCoordinates = prevCoords;
    diffUpdated.locationCoordinates = nextCoords;
    changedLabels.push('titik peta lokasi');
  }

  console.log('isClassChanged:', isClassChanged);
  console.log('isConditionChanged:', isConditionChanged);
  console.log('isFeasibilityChanged:', isFeasibilityChanged);
  console.log('isLocationChanged (should be false):', isLocationChanged);
  console.log('changedLabels:', changedLabels);
  console.log('diffUpdated:', JSON.stringify(diffUpdated));

  if (!isLocationChanged && isConditionChanged && !isClassChanged && !isFeasibilityChanged) {
    console.log('\n SUCCESS: Only the condition field is detected as changed! Map coordinates and class are untouched.');
  } else {
    console.error('\n FAILED: False positive change detected.');
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
