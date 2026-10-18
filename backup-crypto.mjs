/* Authenticated encryption for cross-provider D1 SQL snapshots.
   Usage: node scripts/backup-crypto.mjs encrypt INPUT.sql OUTPUT.enc
          node scripts/backup-crypto.mjs verify INPUT.enc
          node scripts/backup-crypto.mjs decrypt INPUT.enc OUTPUT.sql
   Store BACKUP_PASSPHRASE ONLY in GitHub encrypted Secrets and offline escrow.
*/
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const [action,input,output]=process.argv.slice(2);
const pass=process.env.BACKUP_PASSPHRASE;
if(!pass || pass.length<20) throw Error('BACKUP_PASSPHRASE must be at least 20 characters');
if(!['encrypt','verify','decrypt'].includes(action)||!input||(action!=='verify'&&!output)) throw Error('Invalid args');
const magic=Buffer.from('SLCTBKP1');
const info=readFileSync(input);
let plain;
if(action==='encrypt') {
 const salt=randomBytes(16),nonce=randomBytes(12),key=scryptSync(pass,salt,32);
 const cipher=createCipheriv('aes-256-gcm',key,nonce);
 const ciphertext=Buffer.concat([cipher.update(info),cipher.final()]);
 writeFileSync(output,Buffer.concat([magic,salt,nonce,cipher.getAuthTag(),ciphertext]));
 console.log('Backup encrypted with AES-256-GCM');
} else {
 if(info.length<52 || !info.subarray(0,8).equals(magic))throw Error('Invalid backup header');
 const salt=info.subarray(8,24),nonce=info.subarray(24,36),tag=info.subarray(36,52),body=info.subarray(52);
 const key=scryptSync(pass,salt,32);
 const decipher=createDecipheriv('aes-256-gcm',key,nonce);
 decipher.setAuthTag(tag);
 plain=Buffer.concat([decipher.update(body),decipher.final()]);
 if(action==='decrypt') writeFileSync(output,plain,{mode:0o600});
 console.log(action==='verify'?'Backup integrity verified':'Backup decrypted; restore requires admin approval');
}
