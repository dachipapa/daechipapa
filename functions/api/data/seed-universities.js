import { requireAdmin, j } from "../../../lib/auth.js";

const UNIS = [
  { id:"u_snu",     name:"서울대학교",     data:{ note:"수능최저·서류+면접 종합", update_needed:true } },
  { id:"u_yonsei",  name:"연세대학교",     data:{ note:"학생부종합·논술·수능 전형", update_needed:true } },
  { id:"u_korea",   name:"고려대학교",     data:{ note:"학업우수·계열적합·사회공헌", update_needed:true } },
  { id:"u_skkyu",   name:"성균관대학교",   data:{ note:"학생부종합·논술", update_needed:true } },
  { id:"u_hanyang", name:"한양대학교",     data:{ note:"학생부종합(면접없음)·논술", update_needed:true } },
  { id:"u_sogang",  name:"서강대학교",     data:{ note:"일반·학생부우수자", update_needed:true } },
  { id:"u_jungang", name:"중앙대학교",     data:{ note:"다빈치·SW·탐구형·논술", update_needed:true } },
  { id:"u_kyunghee",name:"경희대학교",     data:{ note:"네오르네상스·고교연계·논술", update_needed:true } },
  { id:"u_ewha",    name:"이화여자대학교", data:{ note:"미래인재·논술·수능최저", update_needed:true } },
  { id:"u_hufs",    name:"한국외국어대학교", data:{ note:"학생부종합·논술", update_needed:true } },
  { id:"u_uos",     name:"서울시립대학교", data:{ note:"학생부종합·논술·수능최저 없는 전형 있음", update_needed:true } },
  { id:"u_kaist",   name:"KAIST",         data:{ note:"학생부종합·수능 반영 없음", update_needed:true } },
  { id:"u_postech", name:"POSTECH",       data:{ note:"학생부종합", update_needed:true } },
];

export async function onRequest({ request, env }) {
  const g = requireAdmin(request, env); if (g) return g;
  if (request.method !== "POST") return j({ error: "POST only" }, 405);
  let inserted = 0;
  for (const u of UNIS) {
    await env.DB.prepare("INSERT OR REPLACE INTO universities (id,name,data,source,year,updated_at) VALUES (?,?,?,?,?,?)").bind(u.id, u.name, JSON.stringify(u.data), "seed", new Date().getFullYear(), Date.now()).run();
    inserted++;
  }
  return j({ ok: true, inserted, message: `주요 대학 ${inserted}개 기본 데이터 삽입됨` });
}
