import { Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";

const esc = (t) =>
    String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function labelsHtml({ qr, drug, uid, expiry, copies, units }) {
    const batchLabel = qr && uid ? `
    <div class="label">
      <img src="data:image/png;base64,${qr}" />
      <div class="drug">${esc(drug)}</div>
      <div class="meta">Exp: ${esc(expiry)}</div>
      <div class="meta">ID: ${esc(uid.slice(0, 8))}</div>
      <div class="meta">Scan with MediChain</div>
    </div>` : "";
    const labels = units
        ? units.map((unit) => `
          <div class="label">
            <img src="data:image/png;base64,${unit.qr_code_base64}" />
            <div class="drug">${esc(drug)}</div>
            <div class="meta">Exp: ${esc(expiry)}</div>
            <div class="meta">Serial: ${esc(unit.serial_number)}</div>
            <div class="meta">Scan with MediChain</div>
          </div>`).join("")
        : batchLabel.repeat(copies || 1);
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
    <body><div class="grid">${labels}</div></body></html>`;
}

export async function printLabels(opts, printWindow) {
    if (Platform.OS === "web") {
        const target = printWindow || window.open("", "_blank");
        if (!target) throw new Error("Allow pop-ups to print or save the QR labels as PDF.");

        target.document.open();
        target.document.write(labelsHtml(opts));
        target.document.close();
        const images = Array.from(target.document.images);
        await Promise.all(images.map(async (img) => {
            if (typeof img.decode === "function") {
                await img.decode();
                return;
            }
            if (img.complete && img.naturalWidth > 0) return;
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("Timed out loading a QR image for printing.")), 15000);
                img.onload = () => { clearTimeout(timeout); resolve(); };
                img.onerror = () => { clearTimeout(timeout); reject(new Error("Could not load a QR image for printing.")); };
            });
        }));
        target.focus();
        target.print();
        return { opened: true };
    }

    await Print.printAsync({ html: labelsHtml(opts) });
}

export async function shareLabels(opts) {
    if (Platform.OS === "web") return printLabels(opts); // choose "Save as PDF" in the print dialog
    const { uri } = await Print.printToFileAsync({ html: labelsHtml(opts) });
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
}

export async function saveLabelsPdf(opts, filename, printWindow) {
    if (Platform.OS === "web") return printLabels(opts, printWindow); // browser print dialog supports saving as PDF

    const { uri } = await Print.printToFileAsync({ html: labelsHtml(opts) });
    if (Platform.OS === "android") {
        const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(
            FileSystem.StorageAccessFramework.getUriForDirectoryInRoot("Download"),
        );
        if (!permission.granted) return { saved: false };

        const safeName = filename.replace(/[^a-zA-Z0-9_-]/g, "_");
        const destination = await FileSystem.StorageAccessFramework.createFileAsync(
            permission.directoryUri,
            safeName,
            "application/pdf",
        );
        await FileSystem.copyAsync({ from: uri, to: destination });
        return { saved: true };
    }

    await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
    return { saved: true, shared: true };
}

export function downloadPng(qr, name) {
    if (Platform.OS !== "web") return;
    const a = document.createElement("a");
    a.href = `data:image/png;base64,${qr}`;
    a.download = `${name}.png`;
    a.click();
}
