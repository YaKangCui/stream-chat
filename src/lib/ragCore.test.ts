import { describe, it, expect } from 'vitest';
import { chunkText, tokenize, score } from './ragCore';

describe('chunkText', () => {
  it('长文本切成多块且每块不过长', () => {
    const chunks = chunkText('这是一个句子。'.repeat(80));
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(260));
  });
});

describe('检索打分', () => {
  it('相关片段得分更高', () => {
    const terms = tokenize('黄金价格');
    const relevant = score('今天的黄金价格大幅上涨', terms);
    const irrelevant = score('天气很好适合出门散步', terms);
    expect(relevant).toBeGreaterThan(irrelevant);
  });
  it('无关查询得分为 0', () => {
    expect(score('一段普通文本', tokenize('xyz123'))).toBe(0);
  });
});
