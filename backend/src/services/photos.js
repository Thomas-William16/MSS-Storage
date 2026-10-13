import sharp from "sharp";
import { fail } from "../utils/errors.js";
export async function preparePhoto(photo) {
  if (photo === undefined) return undefined;
  if (photo === null) return null;
  const encoded = photo.data;
  const buffer = Buffer.from(encoded, "base64");
  if (
    !buffer.length ||
    buffer.length > 5 * 1024 * 1024 ||
    buffer.toString("base64") !== encoded
  )
    fail(400, "Photo must be a valid image of at most 5 MB");
  const png = buffer
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  const webp =
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (!png && !jpeg && !webp) fail(400, "Use a JPEG, PNG or WebP photo");
  try {
    const image = sharp(buffer, {
      limitInputPixels: 16000000,
      failOn: "warning",
    });
    const metadata = await image.metadata();
    if (
      !["jpeg", "png", "webp"].includes(metadata.format) ||
      (metadata.pages || 1) > 1
    )
      fail(400, "Use a single JPEG, PNG or WebP photo");
    const data = await image
      .rotate()
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return { data, contentType: "image/jpeg" };
  } catch (error) {
    if (error.status) throw error;
    fail(
      400,
      "Photo could not be decoded. Use a valid JPEG, PNG or WebP image",
    );
  }
}
