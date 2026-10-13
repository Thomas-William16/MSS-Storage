import { API_BASE_URL } from "./config.js";
export const photoUrl = (record) =>
  record.hasPhoto
    ? `${API_BASE_URL}/api/v1/equipment/${record._id}/photo`
    : record.imageUrl || undefined;
export async function readPhoto(file) {
  if (file.size > 5 * 1024 * 1024)
    throw new Error("Choose a photo smaller than 5 MB");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Choose a JPEG, PNG or WebP photo");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the photo"));
    reader.onload = () => resolve({ data: reader.result.split(",")[1] });
    reader.readAsDataURL(file);
  });
}
