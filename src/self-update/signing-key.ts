/**
 * Pinned release-signing public key (§10.3).
 *
 * The matching private key lives only in the GitHub release workflow
 * secret. Installers use this public key to authenticate SHA256SUMS
 * before trusting the hashes inside it.
 */

export const RELEASE_SIGNING_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEArgeaoEjGS/rIJ/VYsKaE
PnWIsOYzj6pKueJSceWK4/AM2ar06S9z3BKs5J8FBO86h3scJU10lTS1YHsoCIJB
XU1PmJXTyNOcx4OSKfz28Y4Ym8yX7kLni4WhHP2XzGOevy5v/6IkPOqq5xmcND+e
TF5a84UhHqtdwtn4rzHeHitk7h2f6QzBW/LfI3uGfZnBuc+BLI+RRxN8BEv/iGMN
3RJK2HkG7wZ2F18XtxRygCnHdNNfJ29PzoOKnbO94xDbQcgKLLbNS3/cJ4JPZpiK
40dEs0FHv0wnN4qxtJ2YZTcBkiR5Hc0TcrsK4kAKK84qdEu3QuukRHlxkQLMtJFZ
I3DjV6UXztb/rzNDJ7K1KrJd7w7wtYXFnYxTJr5PITgm1zR/eoWCBywP7Hlv8Hvh
+qyVkc7Sagekp+Oh9np0enjZElgv/aaOilDZ462+cq2AKz64diEXaXU3hw6nNItf
BtMQVHfviRiPH0EpGPNqq5lflTvBJUU8e0A91H7SdsGfAgMBAAE=
-----END PUBLIC KEY-----`;
