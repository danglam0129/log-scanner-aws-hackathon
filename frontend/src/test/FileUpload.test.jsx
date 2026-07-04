import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FileUpload from '../components/FileUpload';

vi.mock('../api/fileApi', () => ({
  requestUpload: vi.fn(),
  uploadToS3: vi.fn(),
  confirmUpload: vi.fn(),
}));

import { requestUpload, uploadToS3, confirmUpload } from '../api/fileApi';

function renderUpload() {
  return render(
    <BrowserRouter>
      <FileUpload />
    </BrowserRouter>
  );
}

describe('FileUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders drag and drop zone', () => {
    renderUpload();
    expect(screen.getByText(/drag & drop a log file here/i)).toBeInTheDocument();
  });

  it('rejects files larger than 10 MB', async () => {
    renderUpload();
    const input = document.querySelector('input[type="file"]');
    const bigFile = new File(['x'.repeat(100)], 'big.log', { type: 'text/plain' });
    Object.defineProperty(bigFile, 'size', { value: 11 * 1024 * 1024 });

    fireEvent.change(input, { target: { files: [bigFile] } });
    expect(screen.getByText(/must not exceed 10 MB/i)).toBeInTheDocument();
  });

  it('rejects empty files', () => {
    renderUpload();
    const input = document.querySelector('input[type="file"]');
    const emptyFile = new File([], 'empty.log', { type: 'text/plain' });
    Object.defineProperty(emptyFile, 'size', { value: 0 });

    fireEvent.change(input, { target: { files: [emptyFile] } });
    expect(screen.getByText(/file is empty/i)).toBeInTheDocument();
  });

  it('accepts valid files and shows file info', () => {
    renderUpload();
    const input = document.querySelector('input[type="file"]');
    const validFile = new File(['content'], 'app.log', { type: 'text/plain' });
    Object.defineProperty(validFile, 'size', { value: 1024 });

    fireEvent.change(input, { target: { files: [validFile] } });
    expect(screen.getByText(/app.log/)).toBeInTheDocument();
    expect(screen.getByText(/Start Upload/i)).toBeInTheDocument();
  });

  it('handles successful upload flow', async () => {
    requestUpload.mockResolvedValue({ fileId: 'abc-123', uploadUrl: 'https://s3.example.com/upload', expiresIn: 900 });
    uploadToS3.mockResolvedValue(undefined);
    confirmUpload.mockResolvedValue({ fileId: 'abc-123', status: 'PENDING' });

    renderUpload();
    const input = document.querySelector('input[type="file"]');
    const file = new File(['log data'], 'test.log', { type: 'text/plain' });
    Object.defineProperty(file, 'size', { value: 100 });

    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByText(/Start Upload/i));

    await waitFor(() => {
      expect(screen.getByText(/uploaded successfully/i)).toBeInTheDocument();
    });

    expect(requestUpload).toHaveBeenCalledWith('test.log', 100);
    expect(uploadToS3).toHaveBeenCalled();
    expect(confirmUpload).toHaveBeenCalledWith('abc-123');
  });

  it('handles upload failure and shows error', async () => {
    requestUpload.mockRejectedValue(new Error('Network error'));

    renderUpload();
    const input = document.querySelector('input[type="file"]');
    const file = new File(['data'], 'fail.log', { type: 'text/plain' });
    Object.defineProperty(file, 'size', { value: 50 });

    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByText(/Start Upload/i));

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });

  it('handles drag and drop', () => {
    renderUpload();
    const dropZone = screen.getByRole('button');
    const file = new File(['data'], 'drop.log', { type: 'text/plain' });
    Object.defineProperty(file, 'size', { value: 200 });

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] },
    });

    expect(screen.getByText(/drop.log/)).toBeInTheDocument();
  });
});
