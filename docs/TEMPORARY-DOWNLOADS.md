# Temporary project copies

In Android, open **Your projects → Temporary downloads**. Choose a whole-number duration from **30 to 360 minutes** and press **Save duration**. The default is six hours. The preference applies to newly downloaded temporary copies; it does not change an existing copy's saved deadline.

Allow notification permission using **Enable reminders**. If permission or the reminder channel is disabled, temporary downloads and expiry still work. Reminders are local; no notification service, repository polling or provider upload is required.

The reminder is due at `createdAt + duration × 0.8`, leaving 20% of the lifetime to decide:

| Lifetime | Reminder due | Time remaining |
| --- | --- | --- |
| 30 minutes | 24 minutes | 6 minutes |
| 1 hour | 48 minutes | 12 minutes |
| 6 hours | 4 hours 48 minutes | 1 hour 12 minutes |

**Keep offline** saves a permanent copy in the app's local project library. It does not publish, commit, export to a public directory or change the original files. **No**, dismissal and no response leave the existing deadline unchanged. Expired copies cannot be retained or reopened; their recent-project entries remain marked expired. You can also keep or manually clear copies from Your projects.

Android background alarms are inexact. Battery management, notification settings, force-stop or reboot can delay reminders and physical cleanup. The app enforces the saved expiry on access even when Android delays deletion. Do not treat temporary storage or a reminder as a backup; use Save offline before the deadline when retention matters.

Android notification permission: https://developer.android.com/develop/ui/compose/notifications/notification-permission

Android alarm timing: https://developer.android.com/develop/background-work/services/alarms

Large permanent and temporary downloads remain unencrypted in private app storage. Keep your device and exported projects protected. The bundled privacy policy describes the optional notification permission and retention behavior; update the public policy before distributing a new release.
