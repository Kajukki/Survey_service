import { describe, expect, it, vi } from 'vitest';
import { listAllProviderForms } from './sync-utils.js';

describe('listAllProviderForms', () => {
  it('follows nextPageToken and merges all pages', async () => {
    const listForms = vi
      .fn()
      .mockResolvedValueOnce({
        items: [
          {
            provider: 'google',
            externalFormId: 'form-1',
            title: 'Form 1',
            responseCount: 0,
          },
        ],
        nextPageToken: 'page-2',
      })
      .mockResolvedValueOnce({
        items: [
          {
            provider: 'google',
            externalFormId: 'form-2',
            title: 'Form 2',
            responseCount: 0,
          },
        ],
      });

    const result = await listAllProviderForms({ listForms }, 'token');

    expect(result.items.map((item: { externalFormId: string }) => item.externalFormId)).toEqual([
      'form-1',
      'form-2',
    ]);
    expect(result.hasMorePages).toBe(false);
    expect(listForms).toHaveBeenCalledTimes(2);
    expect(listForms).toHaveBeenNthCalledWith(1, {
      accessToken: 'token',
      pageToken: undefined,
    });
    expect(listForms).toHaveBeenNthCalledWith(2, {
      accessToken: 'token',
      pageToken: 'page-2',
    });
  });

  it('deduplicates forms by externalFormId across pages', async () => {
    const listForms = vi
      .fn()
      .mockResolvedValueOnce({
        items: [
          {
            provider: 'google',
            externalFormId: 'form-1',
            title: 'Form 1',
            responseCount: 0,
          },
        ],
        nextPageToken: 'page-2',
      })
      .mockResolvedValueOnce({
        items: [
          {
            provider: 'google',
            externalFormId: 'form-1',
            title: 'Form 1 duplicate',
            responseCount: 0,
          },
        ],
      });

    const result = await listAllProviderForms({ listForms }, 'token');

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.externalFormId).toBe('form-1');
  });

  it('stops at maxPages and reports remaining pages', async () => {
    const listForms = vi
      .fn()
      .mockResolvedValueOnce({
        items: [
          {
            provider: 'google',
            externalFormId: 'form-1',
            title: 'Form 1',
            responseCount: 0,
          },
        ],
        nextPageToken: 'page-2',
      })
      .mockResolvedValueOnce({
        items: [
          {
            provider: 'google',
            externalFormId: 'form-2',
            title: 'Form 2',
            responseCount: 0,
          },
        ],
        nextPageToken: 'page-3',
      });

    const result = await listAllProviderForms({ listForms }, 'token', 2);

    expect(result.items.map((item: { externalFormId: string }) => item.externalFormId)).toEqual([
      'form-1',
      'form-2',
    ]);
    expect(result.hasMorePages).toBe(true);
    expect(listForms).toHaveBeenCalledTimes(2);
  });
});
