# KCUST AI Privacy Notes

KCUST AI is local-first. Customer records, todos, interaction notes, reminders, calendar links, and profile data are stored on the user's device by default.

## Model Calls

AI write operations require confirmation before saving. When a model API key is configured and the device is online, the app shows a disclosure card before sending data to the model. The disclosure summarizes which customer and todo fields will be sent.

The model request sends compact customer and todo summaries only. It does not silently mutate local customer data. The model must return a structured command, and create/update/reminder commands still require user confirmation.

## API Key

In Web preview, the API key uses browser local storage as a development fallback. On Android, the app uses the `SecureKeys` native plugin, encrypting the key with Android Keystore before storing ciphertext in app private preferences.

## Native Permissions

The app asks for permissions only when a feature is used:

- Microphone: one-shot speech input.
- Notifications: app reminder scheduling.
- Calendar read/write: creating a local calendar event.
- Display over other apps: floating assistant bubble.

If a permission is denied, the app keeps the local workflow available and shows a fallback notice.
