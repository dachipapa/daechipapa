// 서브도메인 → 페이지 라우팅
// app.daechipapa.com → /app.html
// internal.daechipapa.com → /internal.html
export async function onRequest({ request, next }) {
  const host = request.headers.get("host") || "";
  const url = new URL(request.url);

  if (url.pathname !== "/" && url.pathname !== "") return next();

  if (host.startsWith("app.")) {
    return Response.redirect(new URL("/app.html", request.url).href, 302);
  }
  if (host.startsWith("internal.")) {
    return Response.redirect(new URL("/internal.html", request.url).href, 302);
  }
  return next();
}
