// POST /api/pay/confirm   { paymentKey, orderId, amount }
// 토스페이먼츠 결제 승인(서버 confirm). 결제위젯이 리다이렉트한 successUrl 에서 이 API 호출.
import { json } from "../../../lib/claude.js";

export async function onRequestPost({ request, env }) {
  try {
    const { paymentKey, orderId, amount } = await request.json();
    if (!paymentKey || !orderId || !amount) return json({ error: "필수 값 누락" }, 400);

    // 위변조 방지: 저장해 둔 주문 금액과 대조
    const order = await env.DB.prepare("SELECT * FROM payments WHERE id = ?").bind(orderId).first();
    if (!order) return json({ error: "주문 없음" }, 404);
    if (Number(order.amount) !== Number(amount)) return json({ error: "금액 불일치" }, 400);

    // 토스 승인 API (시크릿 키 Basic 인증: "{secretKey}:" base64)
    const basic = btoa(env.TOSS_SECRET_KEY + ":");
    const res = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: { "Authorization": "Basic " + basic, "Content-Type": "application/json" },
      body: JSON.stringify({ paymentKey, orderId, amount })
    });
    const data = await res.json();

    if (!res.ok) {
      await env.DB.prepare("UPDATE payments SET status='failed' WHERE id=?").bind(orderId).run();
      return json({ error: data.message || "승인 실패", code: data.code }, 400);
    }

    // 성공 처리: 결제 확정 + (상품에 따라) 크레딧 적립/리포트 권한
    await env.DB.prepare("UPDATE payments SET status='paid', payment_key=? WHERE id=?")
      .bind(paymentKey, orderId).run();

    if (order.product === "credit") {
      await env.DB.prepare("INSERT INTO credits (id,parent_id,delta,reason) VALUES (?,?,?,?)")
        .bind("cr_" + Date.now(), order.parent_id, order.amount, "충전").run();
    }

    return json({ ok: true, product: order.product, amount: order.amount });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
