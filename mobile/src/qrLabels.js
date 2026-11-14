import { Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

const esc = (t) =>
    String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function labelsHtml({ qr, drug, uid, expiry, copies }) {
    const label = `
    <div class="label">
      <img src="data:image/png;base64,${qr}" />
      <div class="drug">${esc(drug)}</div>
      <div class="meta">Exp: ${esc(expiry)}</div>
      <div class="meta">ID: ${esc(uid.slice(0, 8))}</div>
      <div class="meta">Scan with MediChain</div>
    </div>`;
    return `
    <html><head><style>
      body { font-family: Arial, sans-serif; margin: 12mm; }
      .grid { display: flex; flex-wrap: wrap; }
      .label { width: 48mm; border: 1px dashed #999; padding: 3mm; margin: 1mm;
               text-align: center; page-break-inside: avoid; }
      .label img { width: 40mm; height: 40mm; }
      .drug { font-weight: bold; font-size: 11pt; margin-top: 1mm; }
      .meta { font-size: 8pt; color: #333; }
    </style></head>
    <body><div class="grid">${label.repeat(copies)}</div></body></html>`;
}

export async function printLabels(opts) {
    await Print.printAsync({ html: labelsHtml(opts) });
}

export async function shareLabels(opts) {
    if (Platform.OS === "web") return printLabels(opts); // choose "Save as PDF" in the print dialog
    const { uri } = await Print.printToFileAsync({ html: labelsHtml(opts) });
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
}

export function downloadPng(qr, name) {
    if (Platform.OS !== "web") return;
    const a = document.createElement("a");
    a.href = `data:image/png;base64,${qr}`;
    a.download = `${name}.png`;
    a.click();
}