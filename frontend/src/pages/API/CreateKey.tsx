import { useEffect, useState } from "react";
import { createApiKey, listApiKeys, revokeApiKey, ApiKeyMetadata, CreateKeyResponse } from "../../api/keys";
import { auth } from "../../firebase/firebaseConfig";

export default function CreateKey() {
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [keys, setKeys] = useState<ApiKeyMetadata[]>([]);
  const [newKey, setNewKey] = useState<CreateKeyResponse | null>(null);
  const [label, setLabel] = useState<string>("");

  // fetch list of keys
  const fetchKeys = async () => {
    setError(null);
    setLoadingList(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Not authenticated");
      const data = await listApiKeys();
      setKeys(data);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Failed to load API keys");
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    fetchKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // create a key
  const handleCreate = async () => {
    setError(null);
    setLoadingCreate(true);
    setNewKey(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Not authenticated");
      const data = await createApiKey(label || undefined);
      // show the one-time key to the user
      setNewKey(data);
      // reload metadata list (the secret is not returned by list)
      await fetchKeys();
      // clear label but keep the shown secret until user dismisses
      setLabel("");
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Failed to create API key");
    } finally {
      setLoadingCreate(false);
    }
  };

  // revoke a key
  const handleRevoke = async (keyId: string) => {
    const confirm = window.confirm("Revoke this API key? This cannot be undone.");
    if (!confirm) return;
    setError(null);
    try {
      await revokeApiKey(keyId);
      // refresh list
      await fetchKeys();
      // if the revoked key was the one just displayed, clear it
      if (newKey?.key_id === keyId) setNewKey(null);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Failed to revoke key");
    }
  };

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      alert("API key copied to clipboard. Store it safely (password manager recommended).");
    } catch {
      alert("Failed to copy to clipboard. Please copy manually.");
    }
  };

  const downloadKeyFile = (value: string, keyId?: string) => {
    const blob = new Blob([`API_KEY=${value}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `traydner-api-key-${keyId ?? "key"}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const formatDate = (iso?: string | null) => {
    if (!iso) return "-";
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <div className="w-screen min-h-screen bg-gray-900">
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-4 text-white">Create Personal API Key</h1>

        <section className="mb-6 p-4 border border-emerald-700 rounded bg-gray-800">
          <label className="block mb-2 font-medium text-white">Label (optional)</label>
          <input
            className="w-full border border-emerald-600 px-3 py-2 rounded mb-3 bg-gray-700 text-white placeholder-gray-400"
            placeholder="e.g. trading-bot-1 or my-local-script"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
              onClick={handleCreate}
              disabled={loadingCreate}
            >
              {loadingCreate ? "Creating…" : "Create API Key"}
            </button>
          </div>
          <p className="mt-3 text-sm text-gray-400">
            The raw API key (secret) will be shown exactly once — copy or download it now. The server stores only a hash.
          </p>
        </section>

        {error && (
          <div className="mb-4 p-3 bg-red-900 text-red-200 rounded border border-red-700">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* One-time key display */}
        {newKey && (
          <section className="mb-6 p-4 border border-emerald-700 rounded bg-gray-800 bg-opacity-50">
            <h2 className="font-medium mb-2 text-white">New API Key (one-time)</h2>
            <p className="text-sm mb-2 text-gray-300">
              Save this value now — it will not be shown again. If you lose it, revoke and create a new one.
            </p>
            <pre className="p-3 bg-gray-900 border border-emerald-700 rounded break-words text-green-400">{newKey.api_key}</pre>
            <div className="flex gap-2 mt-3">
              <button
                className="px-3 py-1 border border-emerald-600 rounded text-white"
                onClick={() => copyToClipboard(newKey.api_key)}
              >
                Copy
              </button>
              <button
                className="px-3 py-1 border border-emerald-600 rounded text-white"
                onClick={() => downloadKeyFile(newKey.api_key, newKey.key_id)}
              >
                Download
              </button>
              <button
                className="px-3 py-1 border border-emerald-600 rounded text-white"
                onClick={() => setNewKey(null)}
              >
                Dismiss
              </button>
            </div>
          </section>
        )}

        {/* Keys list */}
        <section className="p-4 border border-emerald-700 rounded bg-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium text-white">Your API Keys</h2>
            <button
              className="text-sm text-green-400 underline"
              onClick={fetchKeys}
              disabled={loadingList}
            >
              {loadingList ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {loadingList ? (
            <div className="text-gray-400">Loading keys…</div>
          ) : keys.length === 0 ? (
            <div className="text-sm text-gray-400">You have no API keys yet.</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="py-2 text-gray-300">Label</th>
                  <th className="py-2 text-gray-300">Key ID</th>
                  <th className="py-2 text-gray-300">Created</th>
                  <th className="py-2 text-gray-300">Last Used</th>
                  <th className="py-2 text-gray-300">Status</th>
                  <th className="py-2 text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.key_id} className="border-t border-gray-700">
                    <td className="py-2 text-gray-200">{k.name ?? "-"}</td>
                    <td className="py-2">
                      <code className="text-xs break-all text-gray-300">{k.key_id}</code>
                    </td>
                    <td className="py-2 text-gray-300">{formatDate(k.created_at)}</td>
                    <td className="py-2 text-gray-300">{formatDate(k.last_used_at ?? undefined)}</td>
                    <td className="py-2 text-gray-300">{k.revoked ? "Revoked" : "Active"}</td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <button
                          className="px-2 py-1 border border-red-600 rounded text-sm text-red-400 disabled:opacity-50"
                          onClick={() => handleRevoke(k.key_id)}
                          disabled={k.revoked}
                        >
                          {k.revoked ? "Revoked" : "Revoke"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}