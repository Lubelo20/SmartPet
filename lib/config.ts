export const CONFIG = {
  dataSource: process.env.NEXT_PUBLIC_DATA_SOURCE ?? "mock",
  transport: process.env.NEXT_PUBLIC_TRANSPORT ?? "simulation",
  deviceId: process.env.NEXT_PUBLIC_DEVICE_ID ?? "ESP32-PETFEEDER-001",
  // Credentials come from .env.local and stay there.
  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  },
  mqtt: {
    url: process.env.NEXT_PUBLIC_MQTT_URL,
    topicIn: "petfeeder/+/telemetry",
    topicOut: "petfeeder/{deviceId}/command",
  },
  hopperCapacityG: 1500,
  lowFoodThreshold: 0.2,
} as const;
