import { createFetch, BetterFetchError } from '@better-fetch/fetch';
import { fetch as expoFetch } from 'expo/fetch';
import { authClient } from './auth-client';

const $fetch = createFetch({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  credentials: 'include',
});

// Helper to get fresh auth headers on each request
function getAuthHeaders(): Record<string, string> {
  const cookies = authClient.getCookie();
  return cookies ? { Cookie: cookies } : {};
}

function throwIfFetchError(result: unknown): void {
  const res = result as { error?: { status?: number; statusText?: string; message?: string } };
  if (res?.error) {
    const e = res.error;
    throw new Error(e.message || e.statusText || `Error ${e.status ?? ''}`);
  }
}

// Helpers de conveniencia: get/post/patch/put/delete lanzan en 4xx/5xx para que React Query onError se ejecute
export const api = {
  get: async <T>(endpoint: string): Promise<{ data: T }> => {
    const result = await $fetch<T>(endpoint, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    throwIfFetchError(result);
    return result as { data: T };
  },

  post: async <T>(endpoint: string, body: unknown): Promise<{ data: T }> => {
    const result = await $fetch<T>(endpoint, {
      method: 'POST',
      body,
      headers: getAuthHeaders(),
    });
    throwIfFetchError(result);
    return result as { data: T };
  },

  postFormData: async <T>(endpoint: string, formData: FormData): Promise<{ data: T | null }> => {
    const baseURL = process.env.EXPO_PUBLIC_API_URL;
    const response = await expoFetch(`${baseURL}${endpoint}`, {
      method: 'POST',
      body: formData,
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `HTTP error! status: ${response.status}`);
    }

    // Manejar respuestas vacías (ej: 201 Created sin body)
    const text = await response.text();
    if (!text) {
      return { data: null };
    }

    const data = JSON.parse(text) as T;
    return { data };
  },

  patchFormData: async <T>(endpoint: string, formData: FormData): Promise<{ data: T | null }> => {
    const baseURL = process.env.EXPO_PUBLIC_API_URL;
    const response = await expoFetch(`${baseURL}${endpoint}`, {
      method: 'PATCH',
      body: formData,
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `HTTP error! status: ${response.status}`);
    }

    const text = await response.text();
    if (!text) {
      return { data: null };
    }

    const data = JSON.parse(text) as T;
    return { data };
  },

  put: async <T>(endpoint: string, body: unknown): Promise<{ data: T }> => {
    const result = await $fetch<T>(endpoint, {
      method: 'PUT',
      body,
      headers: getAuthHeaders(),
    });
    throwIfFetchError(result);
    return result as { data: T };
  },

  patch: async <T>(endpoint: string, body: unknown): Promise<{ data: T }> => {
    const result = await $fetch<T>(endpoint, {
      method: 'PATCH',
      body,
      headers: getAuthHeaders(),
    });
    throwIfFetchError(result);
    return result as { data: T };
  },

  /** PATCH con JSON que acepta 204 No Content (respuesta vacía). Resuelve con { data: null } en 204. */
  patchJsonAllowNoContent: async <T>(
    endpoint: string,
    body: unknown
  ): Promise<{ data: T | null }> => {
    const baseURL = process.env.EXPO_PUBLIC_API_URL;
    const response = await expoFetch(`${baseURL}${endpoint}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `HTTP error! status: ${response.status}`);
    }

    const text = await response.text();
    if (!text || response.status === 204) {
      return { data: null };
    }
    const data = JSON.parse(text) as T;
    return { data };
  },

  delete: async <T>(endpoint: string): Promise<{ data: T }> => {
    const result = await $fetch<T>(endpoint, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    throwIfFetchError(result);
    return result as { data: T };
  },
};

export { BetterFetchError };
