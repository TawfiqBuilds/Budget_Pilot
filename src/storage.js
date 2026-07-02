import { supabase } from "./supabaseClient";

async function getUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

// Mirrors the get/set/delete shape used throughout the app, but every value
// is stored as a row in YOUR Supabase project, scoped to your logged-in user.
export const storage = {
  async get(key) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from("ledger_data")
      .select("value")
      .eq("user_id", userId)
      .eq("key", key)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { key, value: data.value, shared: false };
  },

  async set(key, value) {
    const userId = await getUserId();
    const { error } = await supabase
      .from("ledger_data")
      .upsert({ user_id: userId, key, value, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
    if (error) throw error;
    return { key, value, shared: false };
  },

  async delete(key) {
    const userId = await getUserId();
    const { error } = await supabase.from("ledger_data").delete().eq("user_id", userId).eq("key", key);
    if (error) throw error;
    return { key, deleted: true, shared: false };
  },
};
