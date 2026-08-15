import { redirect } from "next/navigation";

// The BLE/Web-Bluetooth WiFi-provisioning flow this page used to implement is
// dead code: current firmware dropped BLE GATT provisioning entirely in favor
// of a WiFiManager captive-portal AP (see bug.md's 2026-08-08 reconciliation
// and DeviceStatusSheet.tsx's own comment on this). Nothing in the app links
// here anymore, but the route itself still existed and would strand anyone
// who reached it directly — redirect to the pairing flow that actually works.
export default function DeviceBLEPairPage() {
  redirect("/me/device/add");
}
