import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getCachedClasses, invalidateClassCache } from '@/lib/classCache';

export async function GET() {
  try {
    await requireAuth();
    const classes = await getCachedClasses();
    return NextResponse.json({ success: true, classes });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('List classes error:', error);
    return NextResponse.json({ error: 'Gagal mengambil daftar kelas deteksi.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth(['admin']);
    const body = await request.json();

    const {
      name,
      displayName,
      visualDescription,
      conditionCriteria,
      feasibilityCriteria,
      mutuallyExclusiveWith,
      conflictIouThreshold,
    } = body;

    if (!name || !visualDescription || !conditionCriteria || !feasibilityCriteria) {
      return NextResponse.json(
        { error: 'Field name, visualDescription, conditionCriteria, dan feasibilityCriteria wajib diisi.' },
        { status: 400 }
      );
    }

    const cleanName = name.toLowerCase().trim().replace(/\s+/g, '_');

    const existing = await prisma.classDefinition.findUnique({
      where: { name: cleanName },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Kelas dengan nama "${cleanName}" sudah terdaftar.` },
        { status: 400 }
      );
    }

    const newClass = await prisma.classDefinition.create({
      data: {
        name: cleanName,
        displayName: displayName?.trim() || cleanName,
        visualDescription: visualDescription.trim(),
        conditionCriteria: conditionCriteria.trim(),
        feasibilityCriteria: feasibilityCriteria.trim(),
        mutuallyExclusiveWith: JSON.stringify(mutuallyExclusiveWith || []),
        conflictIouThreshold: conflictIouThreshold ? parseFloat(conflictIouThreshold) : 0.5,
        isActive: true,
        versions: {
          create: {
            versionNumber: 1,
            snapshotData: JSON.stringify({
              name: cleanName,
              displayName: displayName?.trim() || cleanName,
              visualDescription: visualDescription.trim(),
              conditionCriteria: conditionCriteria.trim(),
              feasibilityCriteria: feasibilityCriteria.trim(),
            }),
          },
        },
      },
      include: { versions: true },
    });

    // Invalidate cache
    invalidateClassCache();

    await prisma.auditLog.create({
      data: {
        action: 'CREATE_CLASS',
        entityType: 'ClassDefinition',
        entityId: newClass.id,
        actorId: user.userId,
        changes: JSON.stringify(newClass),
      },
    });

    return NextResponse.json({ success: true, class: newClass }, { status: 201 });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }
    console.error('Create class error:', error);
    return NextResponse.json({ error: 'Gagal membuat kelas deteksi baru.' }, { status: 500 });
  }
}
