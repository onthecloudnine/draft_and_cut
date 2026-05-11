import { deflateRawSync } from "zlib";

type ZipEntryInput = {
  name: string;
  data: Uint8Array;
  modifiedAt?: Date;
};

const crcTable = new Uint32Array(256);

for (let index = 0; index < 256; index += 1) {
  let crc = index;

  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }

  crcTable[index] = crc >>> 0;
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of data) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

  return { dosDate, dosTime };
}

function writeLocalHeader(input: {
  nameBuffer: Buffer;
  compressedSize: number;
  uncompressedSize: number;
  crc: number;
  dosDate: number;
  dosTime: number;
}) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(input.dosTime, 10);
  header.writeUInt16LE(input.dosDate, 12);
  header.writeUInt32LE(input.crc, 14);
  header.writeUInt32LE(input.compressedSize, 18);
  header.writeUInt32LE(input.uncompressedSize, 22);
  header.writeUInt16LE(input.nameBuffer.length, 26);
  header.writeUInt16LE(0, 28);

  return Buffer.concat([header, input.nameBuffer]);
}

function writeCentralHeader(input: {
  nameBuffer: Buffer;
  compressedSize: number;
  uncompressedSize: number;
  crc: number;
  dosDate: number;
  dosTime: number;
  localOffset: number;
}) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(8, 10);
  header.writeUInt16LE(input.dosTime, 12);
  header.writeUInt16LE(input.dosDate, 14);
  header.writeUInt32LE(input.crc, 16);
  header.writeUInt32LE(input.compressedSize, 20);
  header.writeUInt32LE(input.uncompressedSize, 24);
  header.writeUInt16LE(input.nameBuffer.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(input.localOffset, 42);

  return Buffer.concat([header, input.nameBuffer]);
}

function writeEndOfCentralDirectory(entryCount: number, centralSize: number, centralOffset: number) {
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50, 0);
  footer.writeUInt16LE(0, 4);
  footer.writeUInt16LE(0, 6);
  footer.writeUInt16LE(entryCount, 8);
  footer.writeUInt16LE(entryCount, 10);
  footer.writeUInt32LE(centralSize, 12);
  footer.writeUInt32LE(centralOffset, 16);
  footer.writeUInt16LE(0, 20);

  return footer;
}

export function createZipArchive(entries: ZipEntryInput[]) {
  const fileParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const normalizedName = entry.name.replace(/^\/+/, "").replace(/\\/g, "/");
    const nameBuffer = Buffer.from(normalizedName, "utf8");
    const data = Buffer.from(entry.data);
    const compressedData = deflateRawSync(data);
    const { dosDate, dosTime } = getDosDateTime(entry.modifiedAt);
    const crc = crc32(data);
    const localOffset = offset;
    const localHeader = writeLocalHeader({
      nameBuffer,
      compressedSize: compressedData.length,
      uncompressedSize: data.length,
      crc,
      dosDate,
      dosTime
    });

    fileParts.push(localHeader, compressedData);
    offset += localHeader.length + compressedData.length;
    centralParts.push(
      writeCentralHeader({
        nameBuffer,
        compressedSize: compressedData.length,
        uncompressedSize: data.length,
        crc,
        dosDate,
        dosTime,
        localOffset
      })
    );
  }

  const centralOffset = offset;
  const centralDirectory = Buffer.concat(centralParts);
  const footer = writeEndOfCentralDirectory(entries.length, centralDirectory.length, centralOffset);

  return Buffer.concat([...fileParts, centralDirectory, footer]);
}
