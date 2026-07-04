import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FileList from '../components/FileList';

vi.mock('../api/fileApi', () => ({
  getFiles: vi.fn(),
}));

import { getFiles } from '../api/fileApi';

function renderList() {
  return render(
    <BrowserRouter>
      <FileList />
    </BrowserRouter>
  );
}

describe('FileList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state', () => {
    getFiles.mockReturnValue(new Promise(() => {})); // never resolves
    renderList();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows file list after loading', async () => {
    getFiles.mockResolvedValue({
      files: [
        { fileId: '1', fileName: 'app.log', fileSize: 2048, status: 'COMPLETED', uploadedAt: '2026-07-01T10:00:00Z' },
        { fileId: '2', fileName: 'error.log', fileSize: 512, status: 'PENDING', uploadedAt: '2026-07-02T10:00:00Z' },
      ],
    });

    renderList();

    await waitFor(() => {
      expect(screen.getByText('app.log')).toBeInTheDocument();
      expect(screen.getByText('error.log')).toBeInTheDocument();
    });
  });

  it('shows empty state when no files', async () => {
    getFiles.mockResolvedValue({ files: [] });
    renderList();

    await waitFor(() => {
      expect(screen.getByText(/no files uploaded/i)).toBeInTheDocument();
    });
  });

  it('shows error state with retry', async () => {
    getFiles.mockRejectedValue(new Error('Server error'));
    renderList();

    await waitFor(() => {
      expect(screen.getByText(/server error/i)).toBeInTheDocument();
      expect(screen.getByText(/retry/i)).toBeInTheDocument();
    });
  });

  it('retries on button click', async () => {
    getFiles.mockRejectedValueOnce(new Error('Fail'));
    renderList();

    await waitFor(() => {
      expect(screen.getByText(/retry/i)).toBeInTheDocument();
    });

    getFiles.mockResolvedValue({ files: [] });
    fireEvent.click(screen.getByText(/retry/i));

    await waitFor(() => {
      expect(screen.getByText(/no files uploaded/i)).toBeInTheDocument();
    });
  });

  it('shows View Results link only for COMPLETED', async () => {
    getFiles.mockResolvedValue({
      files: [
        { fileId: '1', fileName: 'done.log', fileSize: 100, status: 'COMPLETED', uploadedAt: '2026-07-01T10:00:00Z' },
        { fileId: '2', fileName: 'pending.log', fileSize: 100, status: 'PENDING', uploadedAt: '2026-07-01T11:00:00Z' },
        { fileId: '3', fileName: 'failed.log', fileSize: 100, status: 'FAILED', uploadedAt: '2026-07-01T12:00:00Z' },
      ],
    });

    renderList();

    await waitFor(() => {
      const links = screen.getAllByText(/view results/i);
      expect(links).toHaveLength(1);
    });
  });

  it('shows correct status colors', async () => {
    getFiles.mockResolvedValue({
      files: [
        { fileId: '1', fileName: 'a.log', fileSize: 100, status: 'COMPLETED', uploadedAt: '2026-07-01T10:00:00Z' },
        { fileId: '2', fileName: 'b.log', fileSize: 100, status: 'PENDING', uploadedAt: '2026-07-01T11:00:00Z' },
        { fileId: '3', fileName: 'c.log', fileSize: 100, status: 'FAILED', uploadedAt: '2026-07-01T12:00:00Z' },
      ],
    });

    renderList();

    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText('Failed')).toBeInTheDocument();
      // PENDING shows as "Scanning..."
      expect(screen.getByText('Scanning...')).toBeInTheDocument();
    });
  });
});
