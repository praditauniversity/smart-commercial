async function testOpenRouterVision() {
  const apiKey = process.env.OPEN_ROUTER_API_KEY || '';
  if (!apiKey) {
    throw new Error('OPEN_ROUTER_API_KEY environment variable is required to run this test.');
  }
  
  // A valid 100x100 PNG image in base64 (solid gray square)
  const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAP0lEQVR42u3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeDA1DAABbXvXAAAAAABJRU5ErkJggg==';

  console.log('Testing OpenRouter Vision request with sample image...');
  
  const payload = {
    model: 'qwen/qwen3-vl-8b-instruct',
    messages: [
      {
        role: 'system',
        content: 'Anda adalah AI vision pemantau infrastruktur. Output valid JSON: {"detections": []}'
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analisis gambar ini dan deteksi objek infrastruktur.' },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${samplePngBase64}`
            }
          }
        ]
      }
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' }
  };

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://bima-research.local',
      'X-Title': 'Aplikasi Pemantauan Kawasan AI',
    },
    body: JSON.stringify(payload)
  });

  console.log('HTTP Status:', response.status, response.statusText);
  const text = await response.text();
  console.log('Response body:', text);
}

testOpenRouterVision().catch(console.error);
