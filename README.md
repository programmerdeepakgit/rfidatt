# RFID Attendance — ESP8266 + RC522 + Firebase starter

This is a starter project for your Firebase project `rfidatt-85a3d`. It includes:
- Responsive admin website (student registration, attendance table, CSV export)
- ESP8266 Arduino sketch for RC522 scanning and HTTP POST to a cloud endpoint
- Firebase Cloud Function that validates a device token, checks registered cards, and prevents duplicate daily attendance

## Important limits
- You must fill in your own Firebase web config in `site/app.js`.
- Do not make Realtime Database publicly readable/writable.
- The device token in ESP8266 firmware is suitable only for a supervised prototype; anyone with physical access may extract it. Rotate it if exposed. For a production system, use stronger device identity and operational controls.
- The cloud function is the only component that should write attendance from the device. The website uses Firebase Authentication and admin-only rules.
- The site code is a starter, not a hosted/deployed app yet. You must deploy it to a static host and deploy the function.
- For no desktop software, try browser-based editors/build services, but custom ESP8266 firmware still needs a compatible compile-and-flash workflow. Browser support depends on the board, cable, and browser.

## A. Firebase console setup
1. Open https://console.firebase.google.com/ and select `rfidatt-85a3d`.
2. Authentication -> Sign-in method -> enable Email/Password.
3. Authentication -> Users -> add your admin account. Use your own email and a strong unique password.
4. Project settings -> General -> Your apps -> add a Web app. Copy its Firebase config into `site/app.js`.
5. Realtime Database -> confirm the database URL. This project expects:
   `https://rfidatt-85a3d-default-rtdb.firebaseio.com`
   If Firebase shows a different URL, use that URL in `site/app.js` and `functions/index.js`.
6. Realtime Database -> Rules: start with the rules in `database.rules.json`. Replace `YOUR_ADMIN_UID` with the UID shown in Authentication -> Users. These rules deny access by default except for the configured admin.
7. Do not click “public access” or use `{".read": true, ".write": true}`.

## B. Cloud Function setup
Firebase Functions typically requires the Firebase CLI and a supported Node.js runtime; this part may not be entirely browser-only.
1. Set up Firebase Functions for your project.
2. Copy `functions/index.js` into the generated functions folder.
3. Install `firebase-admin` and `firebase-functions` dependencies as shown in `functions/package.json`.
4. Set a strong device token as a function secret named `DEVICE_TOKEN` using your deployment environment's secret configuration.
5. Deploy the function. Copy the deployed HTTPS function URL into `firmware/rfid_attendance.ino` as `ENDPOINT_URL`.
6. Set the same token in the firmware as `DEVICE_TOKEN`. Keep it private. Never publish the filled firmware file to a public repository.

## C. Register a student
1. Sign in to the website using the admin account.
2. In the student form, enter name, roll number and class.
3. Put the card on the RC522 and first use the firmware's Serial Monitor to read its UID.
4. Enter the UID exactly as displayed, without spaces, in the website and save.
5. Repeat for the card/fob.

## D. Wire the RC522 to a typical NodeMCU ESP8266
RC522 -> NodeMCU:
- 3.3V -> 3V3
- GND -> GND
- SDA/SS -> D2
- SCK -> D5
- MOSI -> D7
- MISO -> D6
- RST -> D1
- IRQ -> not connected

Power the RC522 at 3.3V only. Connect wires while power is off. Do not use these pin labels blindly on a bare ESP-12 module.

Built-in LED uses D4 on many NodeMCU boards (active-low). Buzzer is not wired in the starter sketch because buzzer voltage/current/type varies. Do not connect an unknown buzzer directly to a GPIO; identify its rating first. If using an active low-current buzzer, follow its datasheet and use a transistor driver when required.

## E. Test in this order
1. Confirm the RC522 reads UIDs in Serial Monitor.
2. Create a student in the website using that UID.
3. Configure Wi-Fi, cloud endpoint, and device token in firmware.
4. Flash and scan a registered card.
5. Confirm the function returns `marked` and the site shows attendance.
6. Scan it again the same day; response should be `already_marked`.
7. Scan an unregistered UID; response should be `unknown_card`.

## Data structure
- `/students/{uid}`: name, rollNumber, className, active
- `/attendance/{YYYY-MM-DD}/{uid}`: name, rollNumber, className, timestamp, uid
- `/deviceLogs/{pushId}`: minimal status logs (optional; not enabled by default)

Attendance day and timestamp are generated server-side by the cloud function.

## Browser-only note
The website itself can be edited in a browser and hosted online. The Cloud Function deployment and ESP8266 firmware compilation/flashing may require a compatible online service or a one-time toolchain. No one can guarantee browser-only flashing until the exact board, USB cable, browser, and flashing service are checked.
