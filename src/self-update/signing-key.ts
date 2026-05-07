/**
 * Pinned release-signing public key (§10.3).
 *
 * The matching private key lives only in the GitHub release workflow secret.
 * This text import embeds the canonical PEM into the compiled binary.
 */

import publicKey from "../../release/signing-public-key.pem" with { type: "text" };

export const RELEASE_SIGNING_PUBLIC_KEY = publicKey.trimEnd();
