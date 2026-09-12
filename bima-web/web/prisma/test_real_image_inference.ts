import { PrismaClient } from '@prisma/client';
import { encryptSecret } from '../src/lib/security';

const prisma = new PrismaClient();

async function main() {
  const apiKey = process.env.OPEN_ROUTER_API_KEY || '';
  if (!apiKey) {
    throw new Error('OPEN_ROUTER_API_KEY environment variable is required to run this test.');
  }

  // 1. Ensure ModelConfig in database has this encrypted API key
  console.log('1. Setting encrypted API key on default ModelConfig in Supabase...');
  const encryptedKey = encryptSecret(apiKey);
  await prisma.modelConfig.updateMany({
    where: { isDefault: true },
    data: { encryptedApiKey: encryptedKey, isActive: true }
  });

  const updatedModel = await prisma.modelConfig.findFirst({ where: { isDefault: true } });
  console.log('ModelConfig updated with key:', updatedModel?.modelName, 'hasKey:', Boolean(updatedModel?.encryptedApiKey));

  // 2. Fetch active classes
  const activeClasses = await prisma.classDefinition.findMany({ where: { isActive: true } });
  console.log(`2. Found ${activeClasses.length} active classes in Supabase.`);

  // 3. Prepare a valid PNG image (100x100 solid)
  const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAP0lEQVR42u3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeDA1DAABbXvXAAAAAABJRU5ErkJggg==';

  console.log('3. Calling FastAPI worker with real PNG image payload...');
  const payload = {
    session_id: 'test-session-id',
    media_asset_id: 'test-media-id',
    file_url: `data:image/png;base64,${samplePngBase64}`,
    file_type: 'image',
    active_classes: activeClasses.map(c => ({
      id: c.id,
      name: c.name,
      display_name: c.displayName,
      visual_description: c.visualDescription,
      condition_criteria: c.conditionCriteria,
      feasibility_criteria: c.feasibilityCriteria,
      mutually_exclusive_with: JSON.parse(c.mutuallyExclusiveWith || '[]'),
      conflict_iou_threshold: c.conflictIouThreshold,
    })),
    ai_model_config: {
      provider: 'OpenRouter',
      model_name: 'qwen/qwen3-vl-8b-instruct',
      endpoint_url: 'https://openrouter.ai/api/v1/chat/completions',
      api_key: apiKey,
    },
    idempotency_key: 'test-key-' + Date.now(),
    conflict_threshold: 0.5,
  };

  const response = await fetch('http://127.0.0.1:8000/api/v1/process-media', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': 'bima-research-internal-secret-2026',
    },
    body: JSON.stringify(payload),
  });

  console.log('Worker HTTP Status:', response.status);
  const result = await response.json();
  console.log('Worker Result:', JSON.stringify(result, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
