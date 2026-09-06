import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, BackHandler, Platform, Pressable, SafeAreaView,
  StatusBar as RNStatusBar, StyleSheet, Text, View,
} from "react-native";
import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import { WebView, type WebViewNavigation } from "react-native-webview";

/**
 * The dashboard, wrapped as a phone app.
 *
 * A WebView shell rather than a native rebuild: the dashboard is already
 * responsive, and — crucially — the pet identification runs on TensorFlow.js
 * in a browser engine. A WebView has one; Expo Go has no native TFJS runtime.
 * So the camera identification works here unchanged, which a native rebuild
 * could not offer without a different ML stack entirely.
 *
 * What this file owns is everything a web page cannot do for itself: the
 * native frame, the Android back gesture, a real offline state, and the
 * camera permission handshake.
 */

const APP_URL =
  (Constants.expoConfig?.extra?.appUrl as string | undefined) ??
  "https://smart-pet-tawny.vercel.app";

export default function App() {
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const canGoBack = useRef(false);

  // Android's back gesture should walk the dashboard's history, not close the
  // app on the first press — the single thing that makes a WebView feel wrong.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack.current) {
        webRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  const onNavChange = useCallback((nav: WebViewNavigation) => {
    canGoBack.current = nav.canGoBack;
  }, []);

  const retry = useCallback(() => {
    setFailed(false);
    setLoading(true);
    webRef.current?.reload();
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />

      {failed ? (
        <View style={styles.centre}>
          <Text style={styles.title}>Cannot reach the feeder</Text>
          <Text style={styles.body}>
            The dashboard did not load. Check this phone&apos;s connection and try again.
          </Text>
          <Pressable style={styles.button} onPress={retry} accessibilityRole="button">
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <WebView
            ref={webRef}
            source={{ uri: APP_URL }}
            onNavigationStateChange={onNavChange}
            onLoadEnd={() => setLoading(false)}
            onError={() => { setLoading(false); setFailed(true); }}
            onHttpError={({ nativeEvent }) => {
              // A 404 on a sub-route is the app's business; a failed document
              // load is ours.
              if (nativeEvent.statusCode >= 500) setFailed(true);
            }}
            // Camera identification needs getUserMedia to work without a
            // second, native-side prompt on every frame.
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            mediaCapturePermissionGrantType="grant"
            // Firebase auth and TFJS both need these.
            javaScriptEnabled
            domStorageEnabled
            thirdPartyCookiesEnabled
            sharedCookiesEnabled
            // Google's OAuth refuses embedded webviews unless the UA looks
            // like a real browser; this keeps email sign-in and popups sane.
            setSupportMultipleWindows={false}
            pullToRefreshEnabled
            allowsBackForwardNavigationGestures
            style={styles.web}
          />
          {loading && (
            <View style={styles.loading} pointerEvents="none">
              <ActivityIndicator size="large" color="#f59e0b" />
              <Text style={styles.loadingText}>Loading the feeder…</Text>
            </View>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#0f172a",
    paddingTop: Platform.OS === "android" ? RNStatusBar.currentHeight ?? 0 : 0,
  },
  web: { flex: 1, backgroundColor: "#0f172a" },
  loading: {
    position: "absolute",
    top: 0, right: 0, bottom: 0, left: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
    gap: 12,
  },
  loadingText: { color: "#e2e8f0", fontSize: 14 },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  title: { color: "#f8fafc", fontSize: 18, fontWeight: "700" },
  body: { color: "#94a3b8", fontSize: 14, textAlign: "center", lineHeight: 20 },
  button: {
    marginTop: 8,
    backgroundColor: "#f59e0b",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonText: { color: "#0f172a", fontWeight: "700", fontSize: 15 },
});
