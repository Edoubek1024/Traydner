// api/keys.ts
import { auth } from "../firebase/firebaseConfig";
const BASE_URL = import.meta.env.VITE_API_BASE_URL;

export type ApiKeyMetadata = {
  _id?: string;
  key_id: string;
  uid?: string;
  name?: string | null;
  created_at?: string; // ISO
  last_used_at?: string | null;
  revoked?: boolean;
};

export type CreateKeyResponse = {
  api_key: string; // "<key_id>.<secret>" (one-time only)
  key_id: string;
  name?: string | null;
  created_at: string;
};

// Create a new API key for the signed-in user
export async function createApiKey(name?: string): Promise<CreateKeyResponse> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");

  const idToken = await user.getIdToken();

  const res = await fetch(`${BASE_URL}/api/keys`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ name }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.detail || data?.error || `Failed to create API key (${res.status})`);
  }

  const data = (await res.json()) as CreateKeyResponse;
  return data;
}

// List metadata for the current user's API keys (no secrets returned)
export async function listApiKeys(): Promise<ApiKeyMetadata[]> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");

  const idToken = await user.getIdToken();

  const res = await fetch(`${BASE_URL}/api/keys`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.detail || data?.error || "Failed to list API keys");
  }

  const payload = await res.json();
  // your route returns { keys: [...] } in the server example — handle both shapes
  if (Array.isArray(payload)) return payload as ApiKeyMetadata[];
  if (Array.isArray(payload.keys)) return payload.keys as ApiKeyMetadata[];
  // fallback: try to coerce
  return (payload as ApiKeyMetadata[]) || [];
}

// Revoke a key by id (soft revoke)
export async function revokeApiKey(keyId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");

  const idToken = await user.getIdToken();

  const res = await fetch(`${BASE_URL}/api/keys/${encodeURIComponent(keyId)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (res.status === 204) return;

  const data = await res.json().catch(() => ({}));
  throw new Error(data?.detail || data?.error || `Failed to revoke API key (${res.status})`);
}
