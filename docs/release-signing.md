# Release Signing

The release signing public key is committed at
`release/signing-public-key.pem`. The matching private key lives only in the
GitHub Actions secret `CREW_RELEASE_SIGNING_PRIVATE_KEY`.

To replace the signing key:

```sh
openssl genpkey \
  -algorithm RSA \
  -pkeyopt rsa_keygen_bits:4096 \
  -out .crew-release-signing-key.pem

chmod 600 .crew-release-signing-key.pem

openssl rsa \
  -in .crew-release-signing-key.pem \
  -pubout \
  -out release/signing-public-key.pem

gh secret set CREW_RELEASE_SIGNING_PRIVATE_KEY < .crew-release-signing-key.pem
bun run sync-release-signing-key
bun run check
```

Commit `release/signing-public-key.pem` and the generated installer update.
Never commit `.crew-release-signing-key.pem`.

For a planned rotation after signed releases are public, ship a transition
release first. Existing binaries trust the key embedded when they were built,
so a future rotation needs a release signed by the old key that updates the
binary to trust the new key before releases are signed only by the new key.
