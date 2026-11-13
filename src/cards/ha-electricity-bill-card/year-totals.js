// Claude AI, 2026-11-13: elregningerne (og gasregningerne) pr. kalenderår, til kortets "Overblik pr. år".
const parseDate=v=>{const [y,m,d]=String(v||"").split("-").map(Number);return y&&m&&d?new Date(y,m-1,d):null;};
// Regningerne pr. kalenderår og forsyning, som Elregning 0.2.0's attribut "aar" (bruges, når integrationen er ældre)
const daysBetween=(a,b)=>Math.round((Date.UTC(b.getFullYear(),b.getMonth(),b.getDate())-Date.UTC(a.getFullYear(),a.getMonth(),a.getDate()))/864e5)+1;
export function yearlyTotals(bills){
  const acc=new Map();
  for(const b of bills||[]){
    const s=parseDate(b.start),e=parseDate(b.end);if(!s||!e||e<s)continue;const total=daysBetween(s,e),u=b.utility||"el";
    for(let y=s.getFullYear();y<=e.getFullYear();y++){
      const f=s>new Date(y,0,1)?s:new Date(y,0,1),l=e<new Date(y,11,31)?e:new Date(y,11,31),d=daysBetween(f,l),share=d/total,key=`${y}|${u}`;
      const r=acc.get(key)||{year:y,utility:u,amount:0,kwh:null,m3:null,days:0,bills:0};
      r.amount+=Number(b.amount)*share;r.days+=d;r.bills++;
      for(const k of ["kwh","m3"])if(b[k]!=null)r[k]=(r[k]||0)+Number(b[k])*share;
      acc.set(key,r);
    }
  }
  return [...acc.values()].sort((a,b)=>b.year-a.year||a.utility.localeCompare(b.utility)).map(r=>({...r,months:Math.round(r.days/30.4375*10)/10,price_kwh:r.kwh?r.amount/r.kwh:null,price_m3:r.m3?r.amount/r.m3:null}));
}


// Claude AI, 2026-11-13: regningerne fordelt på kalendermåneder efter dage ("2025-01" -> {amount, kwh, m3, days, monthDays}).
export function monthlyFromBills(bills){
  const out={};
  for(const b of bills||[]){
    const s=parseDate(b.start),e=parseDate(b.end);if(!s||!e||e<s)continue;const total=daysBetween(s,e);
    for(let d=new Date(s.getFullYear(),s.getMonth(),1);d<=e;d=new Date(d.getFullYear(),d.getMonth()+1,1)){
      const ms=new Date(d.getFullYear(),d.getMonth(),1),me=new Date(d.getFullYear(),d.getMonth()+1,0);
      const f=s>ms?s:ms,l=e<me?e:me,days=daysBetween(f,l),share=days/total,key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      const r=out[key]||(out[key]={amount:0,kwh:null,m3:null,days:0,monthDays:me.getDate()});
      r.amount+=Number(b.amount)*share;r.days+=days;
      for(const k of ["kwh","m3"])if(b[k]!=null)r[k]=(r[k]||0)+Number(b[k])*share;
    }
  }
  return out;
}
