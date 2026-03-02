import forge from 'node-forge';
import { config } from '../config.js';

class CryptoService {
  private key: forge.util.ByteStringBuffer;

  constructor() {
    const secret = config.appSecret;
    if (secret.length < 64) {
      throw new Error('APP_SECRET must be at least 64 hex characters (32 bytes)');
    }
    this.key = forge.util.createBuffer(forge.util.hexToBytes(secret.slice(0, 64)));
  }

  encrypt(plaintext: string): string {
    const iv = forge.random.getBytesSync(12); // 96-bit IV for GCM
    const cipher = forge.cipher.createCipher('AES-GCM', this.key);
    cipher.start({ iv });
    cipher.update(forge.util.createBuffer(plaintext, 'utf8'));
    cipher.finish();
    const encrypted = (cipher.output as forge.util.ByteStringBuffer).bytes();
    // Access GCM auth tag via any (node-forge types don't export modes.GCM)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tag = ((cipher as any).mode as { tag: forge.util.ByteStringBuffer }).tag.bytes();
    return forge.util.encode64(iv + tag + encrypted);
  }

  decrypt(ciphertext: string): string {
    const bytes = forge.util.decode64(ciphertext);
    const iv = bytes.slice(0, 12);
    const tag = forge.util.createBuffer(bytes.slice(12, 28));
    const encrypted = bytes.slice(28);
    const decipher = forge.cipher.createDecipher('AES-GCM', this.key);
    // start() accepts iv+tag but typings only show iv
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (decipher as any).start({ iv, tag });
    decipher.update(forge.util.createBuffer(encrypted));
    const ok = decipher.finish();
    if (!ok) throw new Error('Decryption failed: authentication tag mismatch');
    return forge.util.encodeUtf8((decipher.output as forge.util.ByteStringBuffer).bytes());
  }
}

export const cryptoService = new CryptoService();
