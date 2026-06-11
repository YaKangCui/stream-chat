import { describe, it, expect } from 'vitest';
import { parseSse } from './sse';

describe('parseSse', () => {
  it('解析 data JSON', () => {
    expect(parseSse('data: {"seq":1,"token":"hi"}')).toEqual({ data: { seq: 1, token: 'hi' } });
  });
  it('解析 event 事件', () => {
    expect(parseSse('event: done\ndata: {}')).toEqual({ event: 'done', data: {} });
  });
  it('空块返回 null', () => {
    expect(parseSse('')).toBeNull();
  });
  it('非法 JSON 不抛错', () => {
    expect(parseSse('data: not-json')).toEqual({ data: undefined });
  });
});
