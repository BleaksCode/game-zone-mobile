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

// Helpers de conveniencia
export const api = {
  get: <T>(endpoint: string) =>
    $fetch<T>(endpoint, {
      method: 'GET',
      headers: getAuthHeaders(),
    }),

  post: <T>(endpoint: string, body: unknown) =>
    $fetch<T>(endpoint, {
      method: 'POST',
      body,
      headers: getAuthHeaders(),
    }),

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

  put: <T>(endpoint: string, body: unknown) =>
    $fetch<T>(endpoint, {
      method: 'PUT',
      body,
      headers: getAuthHeaders(),
    }),

  patch: <T>(endpoint: string, body: unknown) =>
    $fetch<T>(endpoint, {
      method: 'PATCH',
      body,
      headers: getAuthHeaders(),
    }),

  delete: <T>(endpoint: string) =>
    $fetch<T>(endpoint, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }),
};

export { BetterFetchError };
