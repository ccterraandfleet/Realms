// Reproduce: two players opening the PLAIN link at different times.
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function minuteCode(at) {
  let n = Math.floor(at / 60000), out = "";
  for (let i = 0; i < 4; i++) { out += alphabet[n % alphabet.length]; n = Math.floor(n / alphabet.length); }
  return out;
}
const nextMinute = (t) => Math.ceil(t / 60000) * 60000;
const a = new Date("2026-11-04T03:00:30-07:00").getTime();
const b = new Date("2026-11-04T03:02:40-07:00").getTime();
console.log("android loads 03:00:30 ->", minuteCode(nextMinute(a)));
console.log("friend loads 03:02:40 ->", minuteCode(nextMinute(b)));
