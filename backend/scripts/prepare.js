import { MongoBinary } from "mongodb-memory-server";
import path from "node:path";
const binary = await MongoBinary.getPath({
  version: "7.0.24",
  downloadDir:
    process.env.MONGOMS_DOWNLOAD_DIR || path.resolve("../.mongodb-binaries"),
  checkMD5: true,
});
console.log(`Verified development MongoDB binary available: ${binary}`);
