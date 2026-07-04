import { getAccessToken } from '../auth';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const API_PREFIX = `${BASE_URL}/v1`;

function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function handleResponse(response) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.message || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.code = body.error;
    throw error;
  }
  return response.json();
}

export async function requestUpload(fileName, fileSize) {
  const response = await fetch(`${API_PREFIX}/files`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ fileName, fileSize }),
  });
  return handleResponse(response);
}

export async function confirmUpload(fileId) {
  const response = await fetch(`${API_PREFIX}/files/${fileId}/confirm`, {
    method: 'POST',
    headers: getHeaders(),
  });
  return handleResponse(response);
}

export async function getFiles() {
  const response = await fetch(`${API_PREFIX}/files`, {
    method: 'GET',
    headers: getHeaders(),
  });
  return handleResponse(response);
}

export async function getScanResult(fileId) {
  const response = await fetch(`${API_PREFIX}/files/${fileId}/result`, {
    method: 'GET',
    headers: getHeaders(),
  });
  return handleResponse(response);
}

export function uploadToS3(uploadUrl, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`S3 upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('S3 upload failed: network error'));
    xhr.send(file);
  });
}
