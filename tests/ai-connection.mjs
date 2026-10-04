import OpenAI from 'openai';
try {
  const ai = new OpenAI({ timeout: 30000, maxRetries: 0 });
  const result = await ai.responses.create({ model: process.env.OPENAI_MODEL || 'gpt-4.1', store: false, input: 'Translate to Spanish: Replace the door lock.', max_output_tokens: 40 });
  if (!result.output_text.trim()) throw new Error('empty_output');
  console.log('OpenAI connection and text generation passed.');
} catch (e) { console.log(JSON.stringify({ status: e.status || null, code: e.code || 'connection_failed' })); process.exitCode = 1; }
