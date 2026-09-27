import { getAIProvider } from '../lib/services/aiProvider';

try {
  const p = getAIProvider();
  console.log(`AI_PROVIDER=${process.env.AI_PROVIDER || 'mock'} -> resolved provider: ${p.name} (${p.model})`);
} catch (e: any) {
  console.log(`AI_PROVIDER=${process.env.AI_PROVIDER} -> correctly throws: ${e.message}`);
}
