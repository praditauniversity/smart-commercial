import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true, role: true } });
  const classes = await prisma.classDefinition.findMany({ select: { id: true, name: true, displayName: true } });
  const models = await prisma.modelConfig.findMany({ select: { id: true, name: true, provider: true, modelName: true, isDefault: true } });
  
  console.log('=== REAL SUPABASE POSTGRESQL VERIFICATION ===');
  console.log(`Users count: ${users.length}`);
  users.forEach(u => console.log(`  - [${u.role}] ${u.email} (ID: ${u.id})`));
  
  console.log(`\nClasses count: ${classes.length}`);
  classes.forEach(c => console.log(`  - ${c.name} ("${c.displayName}")`));
  
  console.log(`\nModels count: ${models.length}`);
  models.forEach(m => console.log(`  - [${m.provider}] ${m.modelName} (default: ${m.isDefault})`));
  
  // Real CRUD Test on Supabase
  console.log('\n--- TESTING REAL CRUD ON SUPABASE ---');
  // 1. Create a test session
  const testSession = await prisma.surveySession.create({
    data: {
      name: 'VERIFICATION_TEST_SESSION',
      locationType: 'point',
      locationGeojson: '{"type":"Point","coordinates":[106.827153,-6.175392]}',
      locationAddress: 'Monas, Gambir, Jakarta Pusat',
      status: 'berlangsung',
      surveyorId: users.find(u => u.role === 'surveyor')!.id,
    }
  });
  console.log('1. INSERT SUCCESS: Created test session ID:', testSession.id);

  // 2. Query the created session
  const queried = await prisma.surveySession.findUnique({
    where: { id: testSession.id },
    include: { surveyor: true }
  });
  console.log('2. QUERY SUCCESS: Queried session name:', queried?.name, 'Surveyor:', queried?.surveyor?.name);

  // 3. Update the session
  const updated = await prisma.surveySession.update({
    where: { id: testSession.id },
    data: { locationAddress: 'Updated Address for Monas' }
  });
  console.log('3. UPDATE SUCCESS: Updated session address:', updated.locationAddress);

  // 4. Delete the test session
  await prisma.surveySession.delete({
    where: { id: testSession.id }
  });
  console.log('4. DELETE SUCCESS: Deleted test session.');
  console.log('=== ALL REAL CRUD OPERATIONS VERIFIED ON SUPABASE POSTGRESQL ===');
}

main()
  .catch((e) => {
    console.error('VERIFICATION FAILED:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
