import * as crypto from "crypto";

export function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "arkan-pwd-salt-2024").digest("hex");
}
