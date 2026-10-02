import { customAlphabet } from "nanoid";

const alpha = customAlphabet("0123456789abcdefghijkmnpqrstuvwxyz", 12);
/** Short, URL-safe, prefixed id: newId('msg') → 'msg_k3j9x...' */
export const newId = (prefix: string) => `${prefix}_${alpha()}`;
