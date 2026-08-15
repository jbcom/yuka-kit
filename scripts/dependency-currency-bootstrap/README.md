# Temporary dependency-currency oracle

This directory is an isolated bootstrap for the fleet rule that a private
package cannot ship behind the live public runtime packages beneath it. It
walks production dependencies, required peers, and optional peers that are
actually installed by this repository, then fails unless every declared range
selects the public npm `latest` version.

This is intentionally not the fleet's permanent implementation. Delete this
directory and replace `verify:dependency-currency` with the released
`@arcade-cabinet/build-preset` dependency-current CLI before the `0.19.1`
candidate is merged or published. Keeping the bootstrap behind one package
script makes that replacement mechanical and prevents this repository from
becoming a second policy owner.
