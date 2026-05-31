// GET /api/credits?parentId=  → 크레딧 잔액 (delta 합)
import { json } from "../../lib/claude.js";

export async function onRequestGet({ request, env }) {
  try {
    const parentId = new URL(request.url).searchParams.get("parentId");
    if (!parentId) return json({ error: "parentId 필요" }, 400);
    const r = await env.DB.prepare("SELECT COALESCE(SUM(delta),0) bal FROM credits WHERE parent_id=?").bind(parentId).first();
    return json({ balance: r?.bal || 0 });
  } catch (e) { return json({ error: String(e.message || e) }, 500); }
}
