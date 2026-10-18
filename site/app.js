import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getDatabase, ref, get, set, update, remove, onValue } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";

// Replace these placeholders with the Web App config from Firebase Console -> Project settings -> Your apps.
// The web config is not a server secret; access is enforced by Firebase Authentication + Realtime Database Rules.
const firebaseConfig = {
  apiKey: "PASTE_YOUR_FIREBASE_WEB_API_KEY",
  authDomain: "rfidatt-85a3d.firebaseapp.com",
  databaseURL: "https://rfidatt-85a3d-default-rtdb.firebaseio.com",
  projectId: "rfidatt-85a3d",
  appId: "PASTE_YOUR_FIREBASE_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const $ = (id) => document.getElementById(id);
const dateKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const safeText = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let students = {};
let todaysAttendance = {};

$("todayLabel").textContent = new Date().toLocaleDateString(undefined,{weekday:"short",year:"numeric",month:"short",day:"numeric"});
$("loginForm").addEventListener("submit", async e => {
  e.preventDefault(); $("loginError").textContent = "";
  try { await signInWithEmailAndPassword(auth,$("email").value.trim(),$("password").value); }
  catch(err) { $("loginError").textContent = "Sign-in failed. Check your email/password and Firebase Authentication setup."; }
});
$("signOutBtn").addEventListener("click", () => signOut(auth));
onAuthStateChanged(auth, async user => {
  if (!user) {
    $("loginPanel").classList.remove("hidden"); $("appPanel").classList.add("hidden"); $("signOutBtn").classList.add("hidden"); $("connection").textContent="Signed out"; return;
  }
  $("loginPanel").classList.add("hidden"); $("appPanel").classList.remove("hidden"); $("signOutBtn").classList.remove("hidden");
  $("connection").textContent="Signed in";
  try {
    const s = await get(ref(db,"students"));
    students = s.val() || {};
    onValue(ref(db,`attendance/${dateKey()}`), snap => { todaysAttendance=snap.val()||{}; render(); }, err => alert("Attendance read failed. Check admin UID in database.rules.json."));
    onValue(ref(db,"students"), snap => { students=snap.val()||{}; render(); }, err => alert("Student read failed. Check admin UID in database.rules.json."));
  } catch(err) { alert("Could not load Firebase data. Check config and security rules."); }
});
$("studentForm").addEventListener("submit", async e => {
  e.preventDefault(); $("studentMessage").textContent="";
  const uid = $("cardUid").value.trim().toUpperCase().replace(/\s+/g,"");
  if (!/^[0-9A-F]{4,40}$/.test(uid)) { $("studentMessage").textContent="UID should be hexadecimal characters, without spaces."; return; }
  const record={name:$("studentName").value.trim(),rollNumber:$("rollNumber").value.trim(),className:$("className").value.trim(),active:true,updatedAt:Date.now()};
  if (!record.name||!record.rollNumber||!record.className) return;
  try {
    await set(ref(db,`students/${uid}`),record);
    $("studentMessage").textContent="Student saved. Scan this card to test attendance.";
    $("studentForm").reset();
  } catch(err) { $("studentMessage").textContent="Save failed. Check your admin UID in database.rules.json and sign-in."; }
});
$("studentsBody").addEventListener("click", async e => {
  const uid=e.target?.dataset?.deactivate;
  if (!uid) return;
  if (!confirm(`Deactivate RFID card ${uid}?`)) return;
  try { await update(ref(db,`students/${uid}`),{active:false}); }
  catch { alert("Could not update student. Check permissions."); }
});
$("refreshBtn").addEventListener("click", async () => {
  try { const [s,a]=await Promise.all([get(ref(db,"students")),get(ref(db,`attendance/${dateKey()}`))]); students=s.val()||{};todaysAttendance=a.val()||{};render(); }
  catch { alert("Refresh failed. Check database rules."); }
});
$("attendanceSearch").addEventListener("input", render);
$("exportBtn").addEventListener("click", () => {
  const rows=[["Name","Roll Number","Class","UID","Timestamp"]];
  for(const [uid,a] of Object.entries(todaysAttendance)) rows.push([a.name,a.rollNumber,a.className,uid,new Date(a.timestamp).toISOString()]);
  const csv=rows.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\r\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"}); const url=URL.createObjectURL(blob);
  const link=document.createElement("a");link.href=url;link.download=`attendance-${dateKey()}.csv`;link.click();URL.revokeObjectURL(url);
});
function render(){
  const active=Object.values(students).filter(s=>s && s.active!==false).length;
  $("studentCount").textContent=active;
  $("presentCount").textContent=Object.keys(todaysAttendance).length;
  $("rate").textContent=active?`${Math.round(Object.keys(todaysAttendance).length/active*100)}%`:"0%";
  $("studentsBody").innerHTML=Object.entries(students).sort((a,b)=>(a[1]?.name||"").localeCompare(b[1]?.name||"")).map(([uid,s])=>`<tr><td><strong>${safeText(s.name)}</strong></td><td>${safeText(s.rollNumber)}</td><td>${safeText(s.className)}</td><td>${safeText(uid)}</td><td><span class="badge">${s.active===false?"Inactive":"Active"}</span></td><td>${s.active===false?"":`<button class="small-btn" data-deactivate="${safeText(uid)}">Deactivate</button>`}</td></tr>`).join("")||`<tr><td colspan="6">No students registered.</td></tr>`;
  const q=$("attendanceSearch").value.trim().toLowerCase();
  const entries=Object.entries(todaysAttendance).filter(([uid,a])=>`${a.name} ${a.rollNumber} ${uid}`.toLowerCase().includes(q)).sort((a,b)=>(b[1].timestamp||0)-(a[1].timestamp||0));
  $("attendanceBody").innerHTML=entries.map(([uid,a])=>`<tr><td><strong>${safeText(a.name)}</strong></td><td>${safeText(a.rollNumber)}</td><td>${safeText(a.className)}</td><td>${a.timestamp?new Date(a.timestamp).toLocaleTimeString():"—"}</td></tr>`).join("");
  $("emptyAttendance").classList.toggle("hidden",entries.length>0);
}
