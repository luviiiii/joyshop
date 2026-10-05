import { authenticate } from "../shopify.server";
import db from "../db.server";

/*
 * GET /app/applications/export?month=2026-09&status=ALL
 *
 * Returns ONE .zip file containing:
 *   - KYC-details.csv  (opens in Excel / Google Sheets)
 *   - one folder per ambassador with PAN, Aadhaar and cheque files
 *
 * month  = "YYYY-MM" (by submission date, India time) or "all"
 * status = ALL | PENDING | APPROVED | REJECTED
 *
 * The ZIP is built here with a tiny built-in writer, so no extra
 * npm package is needed.
 */

const IST_OFFSET_MS = 330 * 60 * 1000;

function monthRange(key) {
  const [y, m] = key.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1) - IST_OFFSET_MS),
    end: new Date(Date.UTC(y, m, 1) - IST_OFFSET_MS),
  };
}

function istDate(value) {
  if (!value) return "";
  return new Date(new Date(value).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/* ---------------------------------------------------------
   Shopify Files → current download URLs
--------------------------------------------------------- */

async function fetchFileUrls(admin, fileIds) {
  const ids = [...new Set(fileIds.filter(Boolean))];
  const map = {};

  // nodes() accepts up to 250 IDs per call
  for (let i = 0; i < ids.length; i += 250) {
    const response = await admin.graphql(
      `#graphql
      query GetFiles($ids: [ID!]!) {
        nodes(ids: $ids) {
          id
          ... on GenericFile { url }
          ... on MediaImage { image { url } }
        }
      }`,
      { variables: { ids: ids.slice(i, i + 250) } }
    );

    const result = await response.json();

    for (const node of result?.data?.nodes || []) {
      if (node) map[node.id] = node.url || node.image?.url || null;
    }
  }

  return map;
}

const EXT_BY_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

async function downloadFile(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = Buffer.from(await response.arrayBuffer());
    const type = (response.headers.get("content-type") || "").split(";")[0].trim();

    const fromPath = new URL(url).pathname.split(".").pop().toLowerCase();
    const ext =
      EXT_BY_TYPE[type] || (/^[a-z0-9]{2,5}$/.test(fromPath) ? fromPath : "bin");

    return { data, ext };
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------------------------------------------------
   Minimal ZIP writer (stored, no compression — photos and PDFs
   are already compressed, so this barely changes the size)
--------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const d = new Date(date.getTime() + IST_OFFSET_MS); // stamp files in IST
  const time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2);
  const day = ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
  return { time, day };
}

function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { time, day } = dosDateTime(new Date());

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = entry.data;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 file names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // made by
    central.writeUInt16LE(20, 6); // needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42);

    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }

  const centralBuffer = Buffer.concat(centralParts);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuffer, end]);
}

/* ---------------------------------------------------------
   CSV helpers
--------------------------------------------------------- */

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Keeps long numbers (Aadhaar, phone) from turning into 1.23E+11 in Excel
function asText(value) {
  return value ? `="${String(value).replace(/"/g, "")}"` : "";
}

function safeName(value) {
  return (
    String(value || "Ambassador")
      .replace(/[\\/:*?"<>|]+/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60) || "Ambassador"
  );
}

/* ---------------------------------------------------------
   LOADER
--------------------------------------------------------- */

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const month = url.searchParams.get("month") || "all";
  const status = (url.searchParams.get("status") || "ALL").toUpperCase();

  const where = { shop };

  if (month !== "all") {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return new Response("Invalid month", { status: 400 });
    }
    const { start, end } = monthRange(month);
    where.createdAt = { gte: start, lt: end };
  }

  if (["PENDING", "APPROVED", "REJECTED"].includes(status)) {
    where.status = status;
  }

  const applications = await db.ambassadorApplication.findMany({
    where,
    orderBy: { createdAt: "asc" },
  });

  if (applications.length === 0) {
    return new Response("No applications match this month / status.", { status: 404 });
  }

  // Referral codes for approved ambassadors
  const ambassadors = await db.ambassador.findMany({
    where: { shop, customerId: { in: applications.map((a) => a.customerId) } },
    select: { customerId: true, referralCode: true },
  });
  const codeByCustomer = Object.fromEntries(ambassadors.map((a) => [a.customerId, a.referralCode]));

  const fileUrls = await fetchFileUrls(
    admin,
    applications.flatMap((a) => [a.panFileId, a.aadhaarFileId, a.cancelledChequeFileId])
  );

  const entries = [];
  const usedFolders = new Set();

  const rows = [
    [
      "Submitted On",
      "Name",
      "Email",
      "Phone",
      "Status",
      "PAN Number",
      "Aadhaar Number",
      "Account Number",
      "IFSC Code",
      "Referral Code",
      "Reviewed On",
      "Review Notes",
      "Folder",
      "PAN File",
      "Aadhaar File",
      "Cheque File",
    ],
  ];

  for (const app of applications) {
    // One folder per ambassador, unique even if two people share a name
    let folder = `${istDate(app.createdAt)} - ${safeName(app.name)}`;
    if (usedFolders.has(folder)) folder += ` (${app.id.slice(-5)})`;
    usedFolders.add(folder);

    const docs = [
      ["PAN", app.panFileId],
      ["Aadhaar", app.aadhaarFileId],
      ["Cancelled-Cheque", app.cancelledChequeFileId],
    ];

    const fileNotes = {};

    for (const [label, fileId] of docs) {
      if (!fileId) {
        fileNotes[label] = "not uploaded";
        continue;
      }

      const fileUrl = fileUrls[fileId];

      if (!fileUrl) {
        fileNotes[label] = "still processing / missing in Shopify";
        continue;
      }

      try {
        const { data, ext } = await downloadFile(fileUrl);
        const path = `${folder}/${label}.${ext}`;
        entries.push({ name: path, data });
        fileNotes[label] = path;
      } catch (error) {
        console.error("KYC FILE DOWNLOAD FAILED:", app.id, label, error?.message);
        fileNotes[label] = "download failed";
      }
    }

    rows.push([
      istDate(app.createdAt),
      app.name,
      app.email,
      asText(app.phone),
      app.status,
      app.panNumber || "",
      asText(app.aadhaarNumber),
      // Filled automatically once the KYC form collects these fields
      // (bankAccountNumber / ifscCode); blank until then.
      asText(app.bankAccountNumber),
      String(app.ifscCode || "").toUpperCase(),
      codeByCustomer[app.customerId] || "",
      istDate(app.reviewedAt),
      app.reviewNotes || "",
      folder,
      fileNotes.PAN,
      fileNotes.Aadhaar,
      fileNotes["Cancelled-Cheque"],
    ]);
  }

  const csv = "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  entries.unshift({ name: "KYC-details.csv", data: Buffer.from(csv, "utf8") });

  const zip = buildZip(entries);

  const fileName = `JOYSHOP-KYC-${month === "all" ? "all-time" : month}-${status.toLowerCase()}.zip`;

  console.log("KYC PACK EXPORTED:", fileName, "| applications:", applications.length, "| files:", entries.length - 1);

  return new Response(zip, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(zip.length),
      "Cache-Control": "no-store",
    },
  });
};
