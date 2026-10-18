const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();
const DEVICE_TOKEN = defineSecret("DEVICE_TOKEN");
const db = admin.database();

function dateKeyInIndia() {
  // Attendance date is calculated in Asia/Kolkata.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
}

exports.markAttendance = onRequest(
  { cors: false, secrets: [DEVICE_TOKEN], region: "asia-south1" },
  async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (req.method !== "POST") return res.status(405).json({ status: "error", message: "POST only" });

    const supplied = req.get("x-device-token") || "";
    if (!supplied || supplied !== DEVICE_TOKEN.value()) {
      return res.status(401).json({ status: "error", message: "unauthorized_device" });
    }

    const uid = String(req.body?.uid || "").toUpperCase().replace(/\s+/g, "");
    if (!/^[0-9A-F]{4,40}$/.test(uid)) {
      return res.status(400).json({ status: "error", message: "invalid_uid" });
    }

    try {
      const studentSnap = await db.ref(`students/${uid}`).get();
      const student = studentSnap.val();
      if (!student || student.active === false) {
        return res.status(404).json({ status: "unknown_card" });
      }

      const day = dateKeyInIndia();
      const attendanceRef = db.ref(`attendance/${day}/${uid}`);
      const timestamp = admin.database.ServerValue.TIMESTAMP;
      // Transaction ensures simultaneous repeated scans cannot create two records.
      const result = await attendanceRef.transaction(current => {
        if (current !== null) return; // abort if already marked
        return {
          uid,
          name: String(student.name || ""),
          rollNumber: String(student.rollNumber || ""),
          className: String(student.className || ""),
          timestamp
        };
      }, undefined, false);

      if (!result.committed) {
        return res.status(200).json({ status: "already_marked", uid, date: day });
      }
      return res.status(200).json({ status: "marked", uid, date: day });
    } catch (err) {
      console.error("markAttendance failed", err);
      return res.status(500).json({ status: "error", message: "server_error" });
    }
  }
);
