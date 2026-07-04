import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth module
vi.mock('../auth', () => ({
  getAccessToken: vi.fn(() => null),
}));

import { getAccessToken } from '../auth';

describe('fileApi', () => {
  let fileApi;

  beforeEach(async () => {
    global.fetch = vi.fn();
    // Dynamic import to pick up fresh env
    vi.resetModules();
    vi.mock('../auth', () => ({
      getAccessToken: vi.fn(() => null),
    }));
    fileApi = await import('../api/fileApi');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('requestUpload', () => {
    it('sends POST /api/files with fileName and fileSize', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ fileId: 'abc', uploadUrl: 'https://s3/url', expiresIn: 900 }),
      });

      const result = await fileApi.requestUpload('test.log', 5000);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/files',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ fileName: 'test.log', fileSize: 5000 }),
        })
      );
      expect(result.fileId).toBe('abc');
    });

    it('throws on error response', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'FILE_SIZE_INVALID', message: 'Too big' }),
      });

      await expect(fileApi.requestUpload('big.log', 99999999)).rejects.toThrow('Too big');
    });
  });

  describe('confirmUpload', () => {
    it('sends POST /api/files/{fileId}/confirm', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ fileId: 'abc', status: 'PENDING' }),
      });

      const result = await fileApi.confirmUpload('abc');
      expect(global.fetch).toHaveBeenCalledWith('/api/files/abc/confirm', expect.objectContaining({ method: 'POST' }));
      expect(result.status).toBe('PENDING');
    });
  });

  describe('getFiles', () => {
    it('sends GET /api/files', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ files: [{ fileId: '1' }] }),
      });

      const result = await fileApi.getFiles();
      expect(global.fetch).toHaveBeenCalledWith('/api/files', expect.objectContaining({ method: 'GET' }));
      expect(result.files).toHaveLength(1);
    });

    it('throws on error', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: 'Server error' }),
      });

      await expect(fileApi.getFiles()).rejects.toThrow('Server error');
    });
  });

  describe('getScanResult', () => {
    it('sends GET /api/files/{fileId}/result', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ fileId: 'abc', scanResult: { threatLevel: 'NONE' } }),
      });

      const result = await fileApi.getScanResult('abc');
      expect(global.fetch).toHaveBeenCalledWith('/api/files/abc/result', expect.objectContaining({ method: 'GET' }));
      expect(result.scanResult.threatLevel).toBe('NONE');
    });

    it('throws on 404', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'NOT_FOUND', message: 'File not found.' }),
      });

      await expect(fileApi.getScanResult('missing')).rejects.toThrow('File not found.');
    });

    it('throws on 409', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: 'NOT_COMPLETED', message: 'Not completed' }),
      });

      await expect(fileApi.getScanResult('pending')).rejects.toThrow('Not completed');
    });
  });

  describe('uploadToS3', () => {
    it('sends PUT to upload URL with progress tracking', async () => {
      // uploadToS3 uses XMLHttpRequest, mock it
      const mockXhr = {
        open: vi.fn(),
        setRequestHeader: vi.fn(),
        send: vi.fn(),
        upload: {},
        status: 200,
      };

      global.XMLHttpRequest = vi.fn(() => mockXhr);

      const progressFn = vi.fn();
      const promise = fileApi.uploadToS3('https://s3/upload', new Blob(['data']), progressFn);

      // Simulate load event
      mockXhr.onload();

      await promise;
      expect(mockXhr.open).toHaveBeenCalledWith('PUT', 'https://s3/upload');
      expect(mockXhr.setRequestHeader).toHaveBeenCalledWith('Content-Type', 'application/octet-stream');
    });

    it('rejects on error', async () => {
      const mockXhr = {
        open: vi.fn(),
        setRequestHeader: vi.fn(),
        send: vi.fn(),
        upload: {},
        status: 403,
      };

      global.XMLHttpRequest = vi.fn(() => mockXhr);

      const promise = fileApi.uploadToS3('https://s3/upload', new Blob(['data']), vi.fn());
      mockXhr.onload();

      await expect(promise).rejects.toThrow(/failed/i);
    });
  });

  describe('auth header', () => {
    it('does not include auth header when token is null', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ files: [] }),
      });

      await fileApi.getFiles();
      const headers = global.fetch.mock.calls[0][1].headers;
      expect(headers.Authorization).toBeUndefined();
    });
  });
});
