import ssh from "micro-key-producer/ssh.js";
import { randomBytes } from "micro-key-producer/utils.js";

export interface GeneratedSshKeyPair {
  privateKey: string;
  publicKey: string;
  fingerprint: string;
}

export function generateEd25519KeyPair(comment: string): GeneratedSshKeyPair {
  const seed = randomBytes(32);
  const key = ssh(seed, comment);
  return {
    privateKey: key.privateKey,
    publicKey: key.publicKey,
    fingerprint: key.fingerprint,
  };
}
