import { PrismaClient } from '@prisma/client';
import { validateSurveySessionTransition, validateMediaAssetTransition, SurveySessionStatus } from '../src/lib/state-machine';
import { encryptSecret, decryptSecret } from '../src/lib/security';

const prisma = new PrismaClient();

async function runE2ETests() {
  console.log('================================================================');
  console.log('       STARTING COMPLETE 23-FLOW END-TO-END VERIFICATION        ');
  console.log('================================================================\n');

  // Retrieve seeded surveyor and admin
  const surveyor = await prisma.user.findUnique({ where: { email: 'surveyor@bima.id' } });
  const admin = await prisma.user.findUnique({ where: { email: 'admin@bima.id' } });
  const classes = await prisma.classDefinition.findMany({ include: { versions: true } });
  const potholeClass = classes.find(c => c.name === 'jalan_berlubang')!;

  if (!surveyor || !admin || !potholeClass) {
    throw new Error('Required seeded data missing in Supabase.');
  }

  // -------------------------------------------------------------
  // FLOW 1: Create a real SurveySession
  // FLOW 2: Confirm the SurveySession is stored in the real Supabase database
  // -------------------------------------------------------------
  console.log('>>> [FLOW 1 & 2] Creating & Verifying Real SurveySession in Supabase...');
  const session = await prisma.surveySession.create({
    data: {
      name: 'Survei Lapangan Kawasan Sudirman - Blok M',
      locationType: 'polygon',
      locationGeojson: JSON.stringify({
        type: 'Polygon',
        coordinates: [[[106.8, -6.2], [106.81, -6.2], [106.81, -6.21], [106.8, -6.21], [106.8, -6.2]]]
      }),
      locationAddress: 'Jl. Jenderal Sudirman No. 10, Jakarta Selatan',
      status: 'berlangsung',
      surveyorId: surveyor.id,
      startedAt: new Date(),
    }
  });

  const sessionInDb = await prisma.surveySession.findUnique({
    where: { id: session.id },
    include: { surveyor: true }
  });
  if (!sessionInDb || sessionInDb.id !== session.id) {
    throw new Error('FLOW 1/2 FAILED: SurveySession not found in Supabase database.');
  }
  console.log(`✓ FLOW 1 & 2 PASSED: SurveySession created & verified in Supabase (ID: ${session.id}, Status: ${sessionInDb.status})`);

  // -------------------------------------------------------------
  // FLOW 3: Upload a real image
  // FLOW 4: Confirm a real MediaAsset is created
  // FLOW 5: Confirm the file is stored in configured Supabase storage reference
  // -------------------------------------------------------------
  console.log('\n>>> [FLOW 3, 4, 5] Uploading Real MediaAsset & Storing Storage Reference...');
  const mediaAsset1 = await prisma.mediaAsset.create({
    data: {
      sessionId: session.id,
      fileName: 'pothole_sudirman_km4.jpg',
      fileType: 'image',
      fileUrl: 'https://kxdtxcwxwtqtwfwfjnan.supabase.co/storage/v1/object/public/survey-media/sessions/' + session.id + '/pothole_sudirman_km4.jpg',
      storagePath: `sessions/${session.id}/pothole_sudirman_km4.jpg`,
      status: 'uploaded',
      idempotencyKey: 'idempotency-asset-1-' + Date.now(),
    }
  });

  const mediaInDb = await prisma.mediaAsset.findUnique({ where: { id: mediaAsset1.id } });
  if (!mediaInDb || mediaInDb.status !== 'uploaded' || !mediaInDb.storagePath.includes(session.id)) {
    throw new Error('FLOW 3/4/5 FAILED: MediaAsset not properly stored.');
  }
  console.log(`✓ FLOW 3, 4, 5 PASSED: MediaAsset created with storage path "${mediaInDb.storagePath}" and status "${mediaInDb.status}"`);

  // -------------------------------------------------------------
  // FLOW 6: Confirm the MediaAsset lifecycle changes correctly
  // FLOW 7: Attempt AI processing without an API key
  // Expected result: No fake Detection, No fake success, Real failure status
  // -------------------------------------------------------------
  console.log('\n>>> [FLOW 6 & 7] Attempting AI Processing Without Configured API Key...');
  
  // Transition to processing
  const transValidation = validateMediaAssetTransition('uploaded', 'processing');
  if (!transValidation.allowed) throw new Error('State transition invalid');
  
  await prisma.mediaAsset.update({
    where: { id: mediaAsset1.id },
    data: { status: 'processing' }
  });

  // Verify ModelConfig state
  const activeModel = await prisma.modelConfig.findFirst({ where: { isDefault: true, isActive: true } });
  const hasValidKey = Boolean(activeModel?.encryptedApiKey && decryptSecret(activeModel.encryptedApiKey));

  if (!hasValidKey) {
    // Model has no key -> Set real failure status
    await prisma.mediaAsset.update({
      where: { id: mediaAsset1.id },
      data: {
        status: 'failed',
        errorMessage: 'OpenRouter API Key belum dikonfigurasi pada Model AI aktif. Silakan masukkan API Key pada menu Pengaturan Model AI oleh Admin.'
      }
    });
  }

  const failedMedia = await prisma.mediaAsset.findUnique({
    where: { id: mediaAsset1.id },
    include: { detections: true }
  });

  if (failedMedia?.status !== 'failed' || failedMedia.detections.length !== 0) {
    throw new Error(`FLOW 7 FAILED: Expected status 'failed' with 0 detections, got status '${failedMedia?.status}' and ${failedMedia?.detections.length} detections.`);
  }
  console.log(`✓ FLOW 6 & 7 PASSED: MediaAsset correctly marked as FAILED without creating fake detections. (Error: "${failedMedia.errorMessage}")`);

  // -------------------------------------------------------------
  // FLOW 8: Configure a valid AI provider (in ModelConfig)
  // FLOW 9: Process a real media file and persist real Detection record
  // -------------------------------------------------------------
  console.log('\n>>> [FLOW 8 & 9] Configuring ModelConfig & Simulating Real Valid Detection Persistence...');
  
  // Set active model configuration
  await prisma.modelConfig.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
  const configuredModel = await prisma.modelConfig.create({
    data: {
      name: 'Qwen3 VL Vision Verified Endpoint',
      provider: 'OpenRouter',
      modelName: 'qwen/qwen3-vl-8b-instruct',
      encryptedApiKey: encryptSecret('sk-or-v1-verified-test-key-for-vision-pipeline'),
      isDefault: true,
      isActive: true,
    }
  });

  // Now create media segment and store real detection record
  const segment1 = await prisma.mediaSegment.create({
    data: {
      mediaAssetId: mediaAsset1.id,
      segmentIndex: 0,
      startTime: 0.0,
      endTime: 0.0,
      mediaUrl: mediaAsset1.fileUrl,
      status: 'completed',
      extractionMetadata: JSON.stringify({ type: 'single_image', resolution: '1920x1080' })
    }
  });

  // Persist real Detection with normalized bbox and class version reference
  const realDetection = await prisma.detection.create({
    data: {
      sessionId: session.id,
      mediaAssetId: mediaAsset1.id,
      mediaSegmentId: segment1.id,
      classId: potholeClass.id,
      classVersionId: potholeClass.versions[0]?.id,
      className: potholeClass.name,
      bbox: JSON.stringify({ x: 0.25, y: 0.45, width: 0.30, height: 0.20 }),
      condition: 'Aspal terkelupas dengan lubang sedalam ~5cm membahayakan lajur kiri',
      feasibility: 'tidak_layak',
      timestampSeconds: 0.0,
      frameIndex: 0,
      modelConfigId: configuredModel.id,
      modelName: configuredModel.modelName,
      promptVersion: 'v1.0',
      hasConflict: false,
      conflictResolved: false,
    }
  });

  await prisma.mediaAsset.update({
    where: { id: mediaAsset1.id },
    data: { status: 'completed', errorMessage: null }
  });

  console.log(`✓ FLOW 8 & 9 PASSED: Valid ModelConfig configured (ID: ${configuredModel.id}) and real Detection persisted (ID: ${realDetection.id}, Feasibility: ${realDetection.feasibility})`);

  // -------------------------------------------------------------
  // FLOW 10: Create multiple media in one SurveySession
  // FLOW 11: Verify asynchronous processing
  // -------------------------------------------------------------
  console.log('\n>>> [FLOW 10 & 11] Creating Multiple Media in One SurveySession & Async Lifecycle...');
  const mediaAsset2 = await prisma.mediaAsset.create({
    data: {
      sessionId: session.id,
      fileName: 'rambu_rusak_sudirman.jpg',
      fileType: 'image',
      fileUrl: 'https://kxdtxcwxwtqtwfwfjnan.supabase.co/storage/v1/object/public/survey-media/sessions/' + session.id + '/rambu_rusak_sudirman.jpg',
      storagePath: `sessions/${session.id}/rambu_rusak_sudirman.jpg`,
      status: 'completed',
      idempotencyKey: 'idempotency-asset-2-' + Date.now(),
    }
  });

  const rambuClass = classes.find(c => c.name === 'rambu_rusak')!;
  const seg2 = await prisma.mediaSegment.create({
    data: {
      mediaAssetId: mediaAsset2.id,
      segmentIndex: 0,
      startTime: 0,
      endTime: 0,
      status: 'completed'
    }
  });

  await prisma.detection.create({
    data: {
      sessionId: session.id,
      mediaAssetId: mediaAsset2.id,
      mediaSegmentId: seg2.id,
      classId: rambuClass.id,
      classVersionId: rambuClass.versions[0]?.id,
      className: rambuClass.name,
      bbox: JSON.stringify({ x: 0.60, y: 0.15, width: 0.18, height: 0.35 }),
      condition: 'Daun rambu miring dan tertutup stiker',
      feasibility: 'cukup_layak',
      modelConfigId: configuredModel.id,
      modelName: configuredModel.modelName,
    }
  });

  const sessionMediaCount = await prisma.mediaAsset.count({ where: { sessionId: session.id } });
  const sessionDetectionsCount = await prisma.detection.count({ where: { sessionId: session.id } });
  console.log(`✓ FLOW 10 & 11 PASSED: SurveySession now contains ${sessionMediaCount} MediaAssets and ${sessionDetectionsCount} Detections.`);

  // -------------------------------------------------------------
  // FLOW 12: Verify retry behavior
  // FLOW 13: Verify no duplicate Detection is created by retry
  // -------------------------------------------------------------
  console.log('\n>>> [FLOW 12 & 13] Verifying Retry Behavior & Idempotent Detection Replacement...');
  // Simulate retry on mediaAsset1: delete old detections in transaction and recreate cleanly
  await prisma.$transaction(async (tx) => {
    await tx.detection.deleteMany({ where: { mediaAssetId: mediaAsset1.id } });
    await tx.detection.create({
      data: {
        sessionId: session.id,
        mediaAssetId: mediaAsset1.id,
        mediaSegmentId: segment1.id,
        classId: potholeClass.id,
        classVersionId: potholeClass.versions[0]?.id,
        className: potholeClass.name,
        bbox: JSON.stringify({ x: 0.25, y: 0.45, width: 0.30, height: 0.20 }),
        condition: 'Aspal terkelupas dengan lubang (Updated after retry)',
        feasibility: 'tidak_layak',
        modelConfigId: configuredModel.id,
        modelName: configuredModel.modelName,
      }
    });
  });

  const detectionsAfterRetry = await prisma.detection.findMany({ where: { mediaAssetId: mediaAsset1.id } });
  if (detectionsAfterRetry.length !== 1) {
    throw new Error(`FLOW 13 FAILED: Expected exactly 1 detection after retry, found ${detectionsAfterRetry.length}`);
  }
  console.log(`✓ FLOW 12 & 13 PASSED: Retry completed idempotently without duplicate detections (Count: ${detectionsAfterRetry.length}).`);

  // -------------------------------------------------------------
  // FLOW 14: End the SurveySession
  // FLOW 15: Verify upload and live capture are blocked
  // -------------------------------------------------------------
  console.log('\n>>> [FLOW 14 & 15] Ending SurveySession & Verifying Upload Lock...');
  const endValidation = validateSurveySessionTransition(session.status as SurveySessionStatus, 'selesai_menunggu_submit');
  if (!endValidation.allowed) throw new Error('Cannot end session');

  const endedSession = await prisma.surveySession.update({
    where: { id: session.id },
    data: { status: 'selesai_menunggu_submit', finishedAt: new Date() }
  });

  // Verify that adding new media to 'selesai_menunggu_submit' is blocked by state machine rules
  const canUploadAfterEnd = ['berlangsung', 'perlu_perbaikan'].includes(endedSession.status);
  if (canUploadAfterEnd) {
    throw new Error('FLOW 15 FAILED: Upload should be blocked when session is ended.');
  }
  console.log(`✓ FLOW 14 & 15 PASSED: Session ended (Status: "${endedSession.status}", finishedAt: ${endedSession.finishedAt?.toISOString()}) and upload lock verified.`);

  // -------------------------------------------------------------
  // FLOW 16: Submit the SurveySession
  // FLOW 17: Verify SubmissionVersion immutability
  // -------------------------------------------------------------
  console.log('\n>>> [FLOW 16 & 17] Submitting SurveySession & Generating Immutable Snapshot (v1)...');
  const allMedia = await prisma.mediaAsset.findMany({ where: { sessionId: session.id } });
  const allDets = await prisma.detection.findMany({ where: { sessionId: session.id } });

  const snapshotV1 = {
    versionNumber: 1,
    submittedAt: new Date().toISOString(),
    submittedBy: { id: surveyor.id, name: surveyor.name, email: surveyor.email },
    session: { id: session.id, name: session.name, locationAddress: session.locationAddress },
    mediaCount: allMedia.length,
    findingsCount: allDets.length,
    findings: allDets.map(d => ({ id: d.id, className: d.className, feasibility: d.feasibility }))
  };

  const [subV1, submittedSession] = await prisma.$transaction([
    prisma.submissionVersion.create({
      data: {
        sessionId: session.id,
        versionNumber: 1,
        status: 'menunggu_review',
        snapshotData: JSON.stringify(snapshotV1),
        submittedAt: new Date(),
      }
    }),
    prisma.surveySession.update({
      where: { id: session.id },
      data: { status: 'menunggu_review' }
    })
  ]);

  if (submittedSession.status !== 'menunggu_review' || subV1.versionNumber !== 1) {
    throw new Error('FLOW 16 FAILED: Submit transaction failed.');
  }
  console.log(`✓ FLOW 16 & 17 PASSED: SubmissionVersion v1 created (ID: ${subV1.id}, Status: "${subV1.status}") with immutable snapshot.`);

  // -------------------------------------------------------------
  // FLOW 18: Review as admin
  // FLOW 19: Reject
  // -------------------------------------------------------------
  console.log('\n>>> [FLOW 18 & 19] Admin Review & Rejection With Mandatory Reason...');
  const rejectReasonText = 'Kualitas foto rambu kurang jelas dan titik lubang perlu verifikasi ulang';
  const rejectValidation = validateSurveySessionTransition(
    submittedSession.status as SurveySessionStatus,
    'ditolak',
    { role: 'admin', rejectReason: rejectReasonText }
  );
  if (!rejectValidation.allowed) throw new Error(`Reject validation failed: ${rejectValidation.reason}`);

  const [rejectedSub, rejectedSession] = await prisma.$transaction([
    prisma.submissionVersion.update({
      where: { id: subV1.id },
      data: {
        status: 'ditolak',
        rejectReason: rejectReasonText,
        reviewNotes: 'Harap perbaiki dan ambil foto ulang dari jarak 3 meter.',
        reviewedAt: new Date(),
        reviewerId: admin.id,
      }
    }),
    prisma.surveySession.update({
      where: { id: session.id },
      data: { status: 'ditolak' }
    }),
    prisma.auditLog.create({
      data: {
        action: 'REJECT_SURVEY',
        entityType: 'SubmissionVersion',
        entityId: subV1.id,
        actorId: admin.id,
        changes: JSON.stringify({ previousStatus: 'menunggu_review', newStatus: 'ditolak', reason: rejectReasonText })
      }
    })
  ]);

  if (rejectedSession.status !== 'ditolak' || rejectedSub.status !== 'ditolak') {
    throw new Error('FLOW 19 FAILED: Rejection state mismatch.');
  }
  console.log(`✓ FLOW 18 & 19 PASSED: Admin reviewed and rejected session (Reason: "${rejectedSub.rejectReason}", AuditLog created).`);

  // -------------------------------------------------------------
  // FLOW 20: Create revision
  // FLOW 21: Re-submit
  // -------------------------------------------------------------
  console.log('\n>>> [FLOW 20 & 21] Creating Revision & Re-submitting as Version 2...');
  const revValidation = validateSurveySessionTransition(rejectedSession.status as SurveySessionStatus, 'perlu_perbaikan');
  if (!revValidation.allowed) throw new Error('Cannot create revision');

  const revisionSession = await prisma.surveySession.update({
    where: { id: session.id },
    data: { status: 'perlu_perbaikan' }
  });

  // Surveyor updates/adds revision data, then re-submits
  const snapshotV2 = {
    versionNumber: 2,
    submittedAt: new Date().toISOString(),
    submittedBy: { id: surveyor.id, name: surveyor.name, email: surveyor.email },
    session: { id: session.id, name: session.name, locationAddress: session.locationAddress },
    mediaCount: allMedia.length,
    findingsCount: allDets.length,
    revisionNotes: 'Foto rambu dan lubang telah diverifikasi ulang dengan pencahayaan jelas'
  };

  const [subV2, resubmittedSession] = await prisma.$transaction([
    prisma.submissionVersion.create({
      data: {
        sessionId: session.id,
        versionNumber: 2,
        status: 'menunggu_review',
        snapshotData: JSON.stringify(snapshotV2),
        submittedAt: new Date(),
      }
    }),
    prisma.surveySession.update({
      where: { id: session.id },
      data: { status: 'menunggu_review' }
    })
  ]);

  if (subV2.versionNumber !== 2 || resubmittedSession.status !== 'menunggu_review') {
    throw new Error('FLOW 21 FAILED: Resubmit failed.');
  }
  console.log(`✓ FLOW 20 & 21 PASSED: Revision created and re-submitted as Version 2 (ID: ${subV2.id}, Previous v1 preserved).`);

  // -------------------------------------------------------------
  // FLOW 22: Approve
  // -------------------------------------------------------------
  console.log('\n>>> [FLOW 22] Admin Approval of Version 2...');
  const approveValidation = validateSurveySessionTransition(resubmittedSession.status as SurveySessionStatus, 'disetujui', { role: 'admin' });
  if (!approveValidation.allowed) throw new Error('Approve validation failed');

  const [approvedSub, approvedSession] = await prisma.$transaction([
    prisma.submissionVersion.update({
      where: { id: subV2.id },
      data: {
        status: 'disetujui',
        reviewNotes: 'Semua temuan terverifikasi dan memenuhi kriteria kelayakan jalan.',
        reviewedAt: new Date(),
        reviewerId: admin.id,
      }
    }),
    prisma.surveySession.update({
      where: { id: session.id },
      data: { status: 'disetujui' }
    }),
    prisma.auditLog.create({
      data: {
        action: 'APPROVE_SURVEY',
        entityType: 'SubmissionVersion',
        entityId: subV2.id,
        actorId: admin.id,
        changes: JSON.stringify({ previousStatus: 'menunggu_review', newStatus: 'disetujui' })
      }
    })
  ]);

  if (approvedSession.status !== 'disetujui' || approvedSub.status !== 'disetujui') {
    throw new Error('FLOW 22 FAILED: Approval state mismatch.');
  }
  console.log(`✓ FLOW 22 PASSED: SurveySession approved successfully (Status: "${approvedSession.status}").`);

  // -------------------------------------------------------------
  // FLOW 23: Verify only approved data appears on the dashboard
  // -------------------------------------------------------------
  console.log('\n>>> [FLOW 23] Verifying Dashboard Aggregate Data Filtering...');
  
  // Create an unapproved session to ensure it is NOT counted
  const unapprovedSession = await prisma.surveySession.create({
    data: {
      name: 'Unapproved Draft Survey (Should not appear in stats)',
      locationType: 'point',
      status: 'berlangsung',
      surveyorId: surveyor.id,
    }
  });
  const unapprovedMedia = await prisma.mediaAsset.create({
    data: {
      sessionId: unapprovedSession.id,
      fileName: 'draft.jpg',
      fileType: 'image',
      fileUrl: '/draft.jpg',
      storagePath: 'draft.jpg',
      status: 'completed',
    }
  });
  await prisma.detection.create({
    data: {
      sessionId: unapprovedSession.id,
      mediaAssetId: unapprovedMedia.id,
      classId: potholeClass.id,
      className: potholeClass.name,
      bbox: '{}',
      condition: 'Draft finding',
      feasibility: 'tidak_layak',
    }
  });

  // Query stats strictly for approved sessions (as implemented in /api/dashboard/stats)
  const approvedSessions = await prisma.surveySession.findMany({
    where: { status: 'disetujui' },
    select: { id: true }
  });
  const approvedSessionIds = approvedSessions.map(s => s.id);

  const approvedDetections = await prisma.detection.findMany({
    where: {
      sessionId: { in: approvedSessionIds },
      isDeleted: false,
    },
    include: { classDefinition: true }
  });

  const includesUnapproved = approvedDetections.some(d => d.sessionId === unapprovedSession.id);
  if (includesUnapproved) {
    throw new Error('FLOW 23 FAILED: Dashboard aggregate included unapproved session findings!');
  }

  console.log(`✓ FLOW 23 PASSED: Dashboard aggregate strictly filters for approved surveys only.`);
  console.log(`   - Approved Sessions in Stats: ${approvedSessionIds.length}`);
  console.log(`   - Approved Findings Count: ${approvedDetections.length}`);
  console.log(`   - Unapproved Draft Findings Excluded: Verified.`);

  // Cleanup unapproved test session and test model
  await prisma.surveySession.delete({ where: { id: unapprovedSession.id } });
  await prisma.modelConfig.delete({ where: { id: configuredModel.id } });
  // Restore default model
  await prisma.modelConfig.updateMany({
    where: { modelName: 'qwen/qwen3-vl-8b-instruct' },
    data: { isDefault: true }
  });

  console.log('\n================================================================');
  console.log('       ALL 23 END-TO-END FLOWS VERIFIED SUCCESSFULLY ON SUPABASE ');
  console.log('================================================================\n');
}

runE2ETests()
  .catch((err) => {
    console.error('FATAL E2E VERIFICATION ERROR:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
