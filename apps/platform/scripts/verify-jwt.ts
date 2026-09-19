/** did.json으로 Delegation JWT를 검증한다. 사용: tsx scripts/verify-jwt.ts <jwt> <did.json URL> */
import { createDidWebResolver, verifyDelegation } from "@kya/core";

const [jwt, didJsonUrl] = process.argv.slice(2);
if (!jwt || !didJsonUrl) throw new Error("usage: verify-jwt.ts <jwt> <did.json url>");
const resolve = createDidWebResolver({ fetchImpl: (input, init) => fetch(didJsonUrl, init) });
const claims = await verifyDelegation(jwt, resolve);
console.log(JSON.stringify({ iss: claims.iss, sub: claims.sub, jti: claims.jti, exp: claims.exp, scope: claims.vc.credentialSubject.scope }, null, 2));
