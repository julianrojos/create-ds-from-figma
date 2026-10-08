const unsafeCharacters = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;
const unsafeFileCharacters = /[<>:"/\\|?*\u0000-\u001f\u007f]/;
const reservedName = /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])$/i;

export const tokenFileKey = (file) => file.normalize("NFC").toLowerCase();

export function isPortableTokenFileName(file) {
  if (typeof file !== "string" || !file.endsWith(".json") || file.length <= 5 ||
      Buffer.byteLength(file, "utf8") > 255 || unsafeFileCharacters.test(file)) return false;
  const stem = file.slice(0, -5);
  return !/^[ ]|[ .]$/.test(stem) && !reservedName.test(stem.split(".")[0]);
}

export function encodeCollectionId(id) {
  if (Buffer.from(id, "utf8").toString("utf8") !== id) throw new Error("collection id must be valid UTF-8 text");
  return [...Buffer.from(id, "utf8")].map((byte) =>
    (byte >= 48 && byte <= 57) || (byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122) ||
    byte === 46 || byte === 95 || byte === 45
      ? String.fromCharCode(byte) : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`).join("");
}

function candidate(name) {
  const replaced = name.replace(unsafeCharacters, "-");
  const stem = replaced.replace(/[ .]+$/g, "");
  const unusable = !stem || stem.startsWith(" ") || reservedName.test(stem.split(".")[0]) ||
    Buffer.byteLength(`${stem}.json`, "utf8") > 255;
  return { base: unusable ? "Collection" : stem, needsSuffix: unusable || stem !== replaced };
}

export function planTokenFiles(collections, existing = {}) {
  if (!Array.isArray(collections) || existing === null || typeof existing !== "object" || Array.isArray(existing)) {
    throw new Error("collections must be a list and existing must be an ID-to-file object");
  }
  const planned = Object.assign(Object.create(null), existing);
  const used = new Map();
  for (const [id, file] of Object.entries(existing)) {
    if (!id.trim() || !isPortableTokenFileName(file)) throw new Error(`invalid existing token file for ${id}`);
    const key = tokenFileKey(file);
    if (used.has(key)) throw new Error(`token file collision: ${file} and ${used.get(key)}`);
    used.set(key, file);
  }
  const seenIds = new Set();
  const incoming = [];
  for (const collection of collections) {
    if (!collection || typeof collection.id !== "string" || !collection.id.trim() ||
        typeof collection.name !== "string" || !collection.name.trim()) {
      throw new Error("each collection needs a nonempty id and name");
    }
    if (seenIds.has(collection.id)) throw new Error(`duplicate collection id ${collection.id}`);
    seenIds.add(collection.id);
    if (!Object.hasOwn(existing, collection.id)) incoming.push({ ...collection, ...candidate(collection.name) });
  }
  const baseCounts = new Map();
  for (const item of incoming) {
    const key = tokenFileKey(`${item.base}.json`);
    baseCounts.set(key, (baseCounts.get(key) || 0) + 1);
  }
  for (const item of incoming) {
    const plain = `${item.base}.json`;
    const needsSuffix = item.needsSuffix || baseCounts.get(tokenFileKey(plain)) > 1 || used.has(tokenFileKey(plain));
    const file = needsSuffix ? `${item.base} (${encodeCollectionId(item.id)}).json` : plain;
    if (!isPortableTokenFileName(file)) throw new Error(`unusable token file for ${item.id}: ${file}`);
    const key = tokenFileKey(file);
    if (used.has(key)) throw new Error(`token file collision: ${file} and ${used.get(key)}`);
    used.set(key, file);
    planned[item.id] = file;
  }
  return planned;
}
